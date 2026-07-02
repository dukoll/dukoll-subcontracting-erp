'use client';

import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { Download, DatabaseBackup, Loader2, Clock } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import type { UserRole } from '@/types';
import { PageHeader } from '@/components/shared/PageHeader';
import { AccessDenied } from '@/components/shared/AccessDenied';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

interface BackupRow {
  id: string;
  created_at: string;
  type: string;
  note: string | null;
}

// Every business table included in an on-demand export.
const EXPORT_TABLES = [
  'item_groups', 'uoms', 'godowns', 'items', 'suppliers', 'customers',
  'bom_headers', 'bom_items', 'raw_material_prices',
  'purchase_vouchers', 'purchase_voucher_items',
  'stock_transfer_vouchers', 'stock_transfer_items',
  'production_vouchers', 'production_voucher_items',
  'sales_vouchers', 'sales_voucher_items',
  'profiles',
];

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: true,
  });
}

export default function BackupPage() {
  const [role, setRole] = useState<UserRole | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [history, setHistory] = useState<BackupRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [backingUp, setBackingUp] = useState(false);

  const loadHistory = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from('backup_log')
      .select('id, created_at, type, note')
      .order('created_at', { ascending: false })
      .limit(15);
    setHistory((data ?? []) as BackupRow[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    async function init() {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setUserId(user.id);
      const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
      if (profile) setRole(profile.role as UserRole);
      await loadHistory();
    }
    init();
  }, [loadHistory]);

  if (role === null) return <div className="p-8 text-center text-gray-400">Loading...</div>;
  if (role !== 'admin') return <AccessDenied />;

  async function handleBackupNow() {
    setBackingUp(true);
    const supabase = createClient();
    try {
      // 1) Pull every table into one JSON snapshot and download it.
      const snapshot: Record<string, unknown> = {
        _meta: { app: 'DUKOLL Sub-Contracting ERP', exported_at: new Date().toISOString() },
      };
      for (const t of EXPORT_TABLES) {
        const { data, error } = await supabase.from(t).select('*');
        if (error) throw new Error(`${t}: ${error.message}`);
        snapshot[t] = data ?? [];
      }
      const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
      const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `dukoll-backup-${stamp}.json`; a.click();
      URL.revokeObjectURL(url);

      // 2) Record the backup so "last backup" reflects it.
      await supabase.from('backup_log').insert({ type: 'manual', created_by: userId, note: 'On-demand export (JSON)' });
      toast.success('Backup downloaded and recorded.');
      await loadHistory();
    } catch (err: unknown) {
      toast.error((err as Error).message ?? 'Backup failed');
    } finally {
      setBackingUp(false);
    }
  }

  const last = history[0];

  return (
    <div className="p-6 max-w-4xl">
      <PageHeader
        title="Backup"
        description="Download an on-demand backup and see when the last backup ran"
        breadcrumbs={[{ label: 'Admin' }, { label: 'Backup' }]}
      />

      <Card className="p-6 mb-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-gray-500 text-sm mb-1">
              <Clock className="w-4 h-4" /> Last backup
            </div>
            {last ? (
              <div className="text-lg font-semibold text-gray-900">
                {formatDateTime(last.created_at)}{' '}
                <Badge className={last.type === 'auto' ? 'bg-indigo-100 text-indigo-800' : 'bg-green-100 text-green-800'}>
                  {last.type === 'auto' ? 'Automatic' : 'Manual'}
                </Badge>
              </div>
            ) : (
              <div className="text-gray-400">No backup recorded yet</div>
            )}
          </div>
          <Button onClick={handleBackupNow} disabled={backingUp} className="bg-green-600 hover:bg-green-700">
            {backingUp ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <DatabaseBackup className="w-4 h-4 mr-2" />}
            {backingUp ? 'Backing up…' : 'Backup Now'}
          </Button>
        </div>
        <p className="text-xs text-gray-500 mt-4">
          <strong>Backup Now</strong> downloads a full JSON snapshot of all your data to this device and records the time below.
          A complete database backup also runs <strong>automatically every day</strong> and is retained for 90 days.
        </p>
      </Card>

      <Card className="p-6">
        <div className="flex items-center gap-2 mb-4">
          <Download className="w-4 h-4 text-gray-500" />
          <h2 className="text-base font-semibold">Recent backups</h2>
        </div>
        {loading ? (
          <div className="text-center py-8 text-gray-400">Loading...</div>
        ) : history.length === 0 ? (
          <div className="text-center py-8 text-gray-400">No backups recorded yet.</div>
        ) : (
          <div className="rounded-lg border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>When</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Note</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {history.map(b => (
                  <TableRow key={b.id}>
                    <TableCell className="text-sm">{formatDateTime(b.created_at)}</TableCell>
                    <TableCell>
                      <Badge className={b.type === 'auto' ? 'bg-indigo-100 text-indigo-800' : 'bg-green-100 text-green-800'}>
                        {b.type === 'auto' ? 'Automatic' : 'Manual'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-gray-500">{b.note ?? '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>
    </div>
  );
}
