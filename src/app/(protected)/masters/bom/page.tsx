'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Plus, Loader2, FileBox, Eye, Copy } from 'lucide-react';
import { toast } from 'sonner';

import { createClient } from '@/lib/supabase/client';
import type { BOMHeader, UserRole } from '@/types';
import { formatDate, formatNumber } from '@/lib/utils';
import { PageHeader } from '@/components/shared/PageHeader';
import { EmptyState } from '@/components/shared/EmptyState';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table';

function useRole() {
  const [role, setRole] = useState<UserRole | null>(null);
  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return;
      const { data } = await supabase.from('profiles').select('role').eq('id', user.id).single();
      if (data) setRole(data.role as UserRole);
    });
  }, []);
  return role;
}

export default function BOMListPage() {
  const router = useRouter();
  const [boms, setBoms] = useState<BOMHeader[]>([]);
  const [loading, setLoading] = useState(true);
  const role = useRole();
  const isAdmin = role === 'admin';

  const fetchBoms = useCallback(async () => {
    setLoading(true);
    const supabase = createClient();
    const { data, error } = await supabase
      .from('bom_headers')
      .select(`
        *,
        finished_item:items!bom_headers_finished_item_id_fkey(id, item_name),
        uom:uoms(id, name, abbreviation)
      `)
      .order('bom_code');
    if (error) toast.error('Failed to load BOMs');
    else setBoms(data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchBoms(); }, [fetchBoms]);

  return (
    <div>
      <PageHeader
        title="Bill of Materials"
        description="Define production recipes linking raw materials to finished goods."
        breadcrumbs={[{ label: 'Masters', href: '/masters/items' }, { label: 'BOM' }]}
        actions={
          isAdmin ? (
            <Link href="/masters/bom/new">
              <Button size="sm"><Plus className="w-4 h-4 mr-1" />New BOM</Button>
            </Link>
          ) : undefined
        }
      />

      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>
      ) : boms.length === 0 ? (
        <EmptyState
          icon={FileBox}
          title="No BOMs defined"
          description="Create your first Bill of Materials."
          action={
            isAdmin ? (
              <Link href="/masters/bom/new">
                <Button size="sm"><Plus className="w-4 h-4 mr-1" />New BOM</Button>
              </Link>
            ) : undefined
          }
        />
      ) : (
        <div className="rounded-lg border bg-white overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>BOM Code</TableHead>
                <TableHead>Finished Item</TableHead>
                <TableHead>Output Qty</TableHead>
                <TableHead>Effective From</TableHead>
                <TableHead>Effective To</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-40 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {boms.map(bom => (
                <TableRow
                  key={bom.id}
                  className="cursor-pointer hover:bg-gray-50"
                  onClick={() => router.push(`/masters/bom/${bom.id}`)}
                >
                  <TableCell>
                    <span className="font-mono text-sm font-medium">{bom.bom_code}</span>
                  </TableCell>
                  <TableCell>
                    <div className="font-medium text-sm">{bom.finished_item?.item_name ?? '—'}</div>
                  </TableCell>
                  <TableCell className="text-sm">
                    {formatNumber(bom.output_quantity)} {bom.uom?.abbreviation ?? ''}
                  </TableCell>
                  <TableCell className="text-sm text-gray-600">{formatDate(bom.effective_from)}</TableCell>
                  <TableCell className="text-sm text-gray-600">{bom.effective_to ? formatDate(bom.effective_to) : <span className="text-gray-400 italic">No end date</span>}</TableCell>
                  <TableCell>
                    <Badge variant={bom.is_active ? 'default' : 'secondary'}>{bom.is_active ? 'Active' : 'Inactive'}</Badge>
                  </TableCell>
                  <TableCell className="text-right" onClick={e => e.stopPropagation()}>
                    <div className="flex justify-end gap-1">
                      <Link href={`/masters/bom/${bom.id}`}>
                        <Button size="sm" variant="ghost"><Eye className="w-4 h-4 mr-1" />View</Button>
                      </Link>
                      {isAdmin && (
                        <Link href={`/masters/bom/new?from=${bom.id}`}>
                          <Button size="sm" variant="ghost"><Copy className="w-4 h-4 mr-1" />Duplicate</Button>
                        </Link>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
