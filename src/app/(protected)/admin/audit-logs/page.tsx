'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { formatDate } from '@/lib/utils';
import type { UserRole, AuditLog, Profile } from '@/types';
import { PageHeader } from '@/components/shared/PageHeader';
import { AccessDenied } from '@/components/shared/AccessDenied';
import { EmptyState } from '@/components/shared/EmptyState';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Search, Eye } from 'lucide-react';
import { format } from 'date-fns';

type AuditRow = AuditLog & { user?: Profile | null };

const ACTION_COLORS: Record<string, string> = {
  INSERT: 'bg-green-100 text-green-800',
  UPDATE: 'bg-red-100 text-red-800',
  DELETE: 'bg-red-100 text-red-800',
  LOGIN: 'bg-purple-100 text-purple-800',
  LOGOUT: 'bg-gray-100 text-gray-800',
};

function formatDatetime(dt: string) {
  try { return format(new Date(dt), 'dd/MM/yyyy HH:mm:ss'); }
  catch { return dt; }
}

function JsonDisplay({ value }: { value: Record<string, unknown> | null }) {
  if (!value) return <span className="text-gray-400">—</span>;
  return (
    <pre className="text-xs bg-gray-50 rounded p-3 max-h-64 overflow-auto whitespace-pre-wrap break-all font-mono">
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}

export default function AuditLogsPage() {
  const [role, setRole] = useState<UserRole | null>(null);
  const [users, setUsers] = useState<Profile[]>([]);
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [selected, setSelected] = useState<AuditRow | null>(null);
  const [loading, setLoading] = useState(false);
  const [filterUser, setFilterUser] = useState('');
  const [filterAction, setFilterAction] = useState('');
  const [filterTable, setFilterTable] = useState('');
  const [filterFrom, setFilterFrom] = useState('');
  const [filterTo, setFilterTo] = useState(() => new Date().toISOString().split('T')[0]);

  useEffect(() => {
    async function init() {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
      if (profile) setRole(profile.role as UserRole);
      const { data } = await supabase.from('profiles').select('*').order('full_name');
      if (data) setUsers(data as Profile[]);
    }
    init();
  }, []);

  if (role === null) return <div className="p-8 text-center text-gray-400">Loading...</div>;
  if (role !== 'admin') return <AccessDenied />;

  async function handleSearch() {
    setLoading(true);
    const supabase = createClient();
    let query = supabase
      .from('audit_logs')
      .select('*, user:user_id(*)')
      .order('created_at', { ascending: false })
      .limit(500);
    if (filterUser) query = query.eq('user_id', filterUser);
    if (filterAction) query = query.eq('action', filterAction);
    if (filterTable) query = query.ilike('table_name', `%${filterTable}%`);
    if (filterFrom) query = query.gte('created_at', filterFrom);
    if (filterTo) query = query.lte('created_at', filterTo + 'T23:59:59');
    const { data } = await query;
    if (data) setRows(data as AuditRow[]);
    setLoading(false);
  }

  // Derive unique actions and tables from current rows for filter hints
  const uniqueActions = Array.from(new Set(rows.map(r => r.action)));

  function summarizeChanges(row: AuditRow): string {
    if (!row.old_values && !row.new_values) return '—';
    if (row.action === 'INSERT') return 'New record created';
    if (row.action === 'DELETE') return 'Record deleted';
    if (row.old_values && row.new_values) {
      const changed = Object.keys(row.new_values).filter(
        k => JSON.stringify(row.new_values![k]) !== JSON.stringify(row.old_values![k])
      );
      return changed.length > 0 ? `Changed: ${changed.slice(0, 3).join(', ')}${changed.length > 3 ? '...' : ''}` : 'No changes detected';
    }
    return '—';
  }

  return (
    <div className="p-6">
      <PageHeader
        title="Audit Logs"
        description="Complete audit trail of all system actions"
        breadcrumbs={[{ label: 'Admin' }, { label: 'Audit Logs' }]}
      />

      {/* Filters */}
      <div className="bg-white border rounded-lg p-4 mb-6">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 mb-4">
          <div className="grid gap-1.5">
            <Label>User</Label>
            <Select value={filterUser} onValueChange={setFilterUser}>
              <SelectTrigger><SelectValue placeholder="All Users" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="">All Users</SelectItem>
                {users.map(u => <SelectItem key={u.id} value={u.id}>{u.full_name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label>Action</Label>
            <Select value={filterAction} onValueChange={setFilterAction}>
              <SelectTrigger><SelectValue placeholder="All Actions" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="">All Actions</SelectItem>
                {['INSERT', 'UPDATE', 'DELETE', 'LOGIN', 'LOGOUT'].map(a => (
                  <SelectItem key={a} value={a}>{a}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label>Table Name</Label>
            <Input value={filterTable} onChange={e => setFilterTable(e.target.value)} placeholder="e.g. items" />
          </div>
          <div className="grid gap-1.5">
            <Label>From Date</Label>
            <Input type="date" value={filterFrom} onChange={e => setFilterFrom(e.target.value)} />
          </div>
          <div className="grid gap-1.5">
            <Label>To Date</Label>
            <Input type="date" value={filterTo} onChange={e => setFilterTo(e.target.value)} />
          </div>
        </div>
        <Button onClick={handleSearch} disabled={loading}>
          <Search className="w-4 h-4 mr-1" />{loading ? 'Searching...' : 'Search Logs'}
        </Button>
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-400">Loading audit logs...</div>
      ) : rows.length === 0 ? (
        <EmptyState title="No audit logs" description="No logs match the current filters." />
      ) : (
        <>
          <div className="mb-2 text-sm text-gray-500">{rows.length} log entries (max 500)</div>
          <div className="rounded-lg border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date / Time</TableHead>
                  <TableHead>User</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Table</TableHead>
                  <TableHead>Record ID</TableHead>
                  <TableHead>Changes</TableHead>
                  <TableHead className="text-right">Details</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map(row => (
                  <TableRow key={row.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => setSelected(row)}>
                    <TableCell className="text-xs font-mono text-gray-600 whitespace-nowrap">
                      {formatDatetime(row.created_at)}
                    </TableCell>
                    <TableCell className="text-sm">{row.user?.full_name ?? <span className="text-gray-400">System</span>}</TableCell>
                    <TableCell>
                      <Badge className={ACTION_COLORS[row.action] ?? 'bg-gray-100 text-gray-800'}>
                        {row.action}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-mono text-xs">{row.table_name ?? '—'}</TableCell>
                    <TableCell className="font-mono text-xs max-w-[100px] truncate">{row.record_id ?? '—'}</TableCell>
                    <TableCell className="text-xs text-gray-600 max-w-xs truncate">{summarizeChanges(row)}</TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="ghost" onClick={e => { e.stopPropagation(); setSelected(row); }}>
                        <Eye className="w-4 h-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      )}

      <Dialog open={!!selected} onOpenChange={v => !v && setSelected(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              Audit Log Detail
              {selected && <Badge className={ACTION_COLORS[selected.action] ?? 'bg-gray-100 text-gray-800'}>{selected.action}</Badge>}
            </DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="grid gap-4 text-sm">
              <div className="grid grid-cols-2 gap-4 bg-gray-50 rounded p-3">
                <div><span className="text-gray-500">Date/Time:</span> <span className="font-medium">{formatDatetime(selected.created_at)}</span></div>
                <div><span className="text-gray-500">User:</span> <span className="font-medium">{selected.user?.full_name ?? 'System'}</span></div>
                <div><span className="text-gray-500">Table:</span> <span className="font-mono">{selected.table_name ?? '—'}</span></div>
                <div><span className="text-gray-500">Record ID:</span> <span className="font-mono text-xs">{selected.record_id ?? '—'}</span></div>
                {selected.ip_address && <div className="col-span-2"><span className="text-gray-500">IP:</span> <span>{selected.ip_address}</span></div>}
              </div>
              <div>
                <Label className="mb-2 block text-gray-500 text-xs uppercase tracking-wide">Old Values</Label>
                <JsonDisplay value={selected.old_values} />
              </div>
              <div>
                <Label className="mb-2 block text-gray-500 text-xs uppercase tracking-wide">New Values</Label>
                <JsonDisplay value={selected.new_values} />
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
