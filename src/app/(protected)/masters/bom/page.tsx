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
import { CustomizableTable, type TableColumn } from '@/components/shared/CustomizableTable';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/searchable-select';
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
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const role = useRole();
  const isAdmin = role === 'admin';

  const q = search.trim().toLowerCase();
  const filteredBoms = boms.filter(b => {
    if (statusFilter === 'active' && !b.is_active) return false;
    if (statusFilter === 'inactive' && b.is_active) return false;
    if (q && !(`${b.bom_code} ${b.finished_item?.item_name ?? ''}`.toLowerCase().includes(q))) return false;
    return true;
  });

  const fetchBoms = useCallback(async () => {
    setLoading(true);
    const supabase = createClient();
    const { data, error } = await supabase
      .from('bom_headers')
      .select(`
        *,
        finished_item:items!bom_headers_finished_item_id_fkey(id, item_name),
        subcontractor:suppliers!subcontractor_id(id, name),
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
        <>
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <Input className="w-full sm:w-72" placeholder="Search BOM code or finished item…" value={search} onChange={e => setSearch(e.target.value)} />
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-44"><SelectValue placeholder="All statuses" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="">All statuses</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="inactive">Inactive</SelectItem>
            </SelectContent>
          </Select>
          {(search || statusFilter) && <Button variant="ghost" size="sm" onClick={() => { setSearch(''); setStatusFilter(''); }}>Clear</Button>}
        </div>
        <CustomizableTable
          storageKey="bom-list"
          rows={filteredBoms}
          rowKey={b => b.id}
          empty="No BOMs match your filters."
          onRowClick={b => router.push(`/masters/bom/${b.id}`)}
          columns={[
            { id: 'code', header: 'BOM Code', cell: b => <span className="font-mono text-sm font-medium">{b.bom_code}</span> },
            { id: 'item', header: 'Finished Item', cell: b => <div className="font-medium text-sm">{b.finished_item?.item_name ?? '—'}</div> },
            { id: 'subcontractor', header: 'Subcontractor', defaultHidden: true, className: 'text-sm text-gray-600', cell: b => (b as BOMHeader & { subcontractor?: { name: string } }).subcontractor?.name ?? <span className="text-gray-400 italic">Any</span> },
            { id: 'output', header: 'Output Qty', className: 'text-sm', cell: b => `${formatNumber(b.output_quantity)} ${b.uom?.abbreviation ?? ''}` },
            { id: 'from', header: 'Effective From', className: 'text-sm text-gray-600', cell: b => formatDate(b.effective_from) },
            { id: 'to', header: 'Effective To', className: 'text-sm text-gray-600', cell: b => b.effective_to ? formatDate(b.effective_to) : <span className="text-gray-400 italic">No end date</span> },
            { id: 'status', header: 'Status', cell: b => <Badge variant={b.is_active ? 'default' : 'secondary'}>{b.is_active ? 'Active' : 'Inactive'}</Badge> },
            { id: 'actions', header: 'Actions', alwaysVisible: true, className: 'w-40 text-right', cell: (b: BOMHeader) => (
              <div className="flex justify-end gap-1" onClick={e => e.stopPropagation()}>
                <Link href={`/masters/bom/${b.id}`}><Button size="sm" variant="ghost"><Eye className="w-4 h-4 mr-1" />View</Button></Link>
                {isAdmin && <Link href={`/masters/bom/new?from=${b.id}`}><Button size="sm" variant="ghost"><Copy className="w-4 h-4 mr-1" />Duplicate</Button></Link>}
              </div>
            ) },
          ] as TableColumn<BOMHeader>[]}
        />
        </>
      )}
    </div>
  );
}
