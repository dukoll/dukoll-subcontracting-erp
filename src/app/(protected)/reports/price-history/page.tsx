'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { canSeePricing } from '@/lib/permissions';
import { formatDate, formatCurrency } from '@/lib/utils';
import type { UserRole, Item, RawMaterialPrice } from '@/types';
import { PageHeader } from '@/components/shared/PageHeader';
import { AccessDenied } from '@/components/shared/AccessDenied';
import { EmptyState } from '@/components/shared/EmptyState';
import { CustomizableTable, type TableColumn } from '@/components/shared/CustomizableTable';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/searchable-select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Download } from 'lucide-react';

type PriceHistoryRow = RawMaterialPrice & {
  item?: Item;
  supplier?: { name: string } | null;
  uom?: { abbreviation: string } | null;
  creator?: { full_name: string } | null;
  approver?: { full_name: string } | null;
};

export default function PriceHistoryPage() {
  const [role, setRole] = useState<UserRole | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [rows, setRows] = useState<PriceHistoryRow[]>([]);
  const [filterItem, setFilterItem] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    async function init() {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
      if (profile) setRole(profile.role as UserRole);
      const { data } = await supabase.from('items').select('*').in('item_type', ['raw_material', 'packing_material']).eq('is_active', true).order('item_name');
      if (data) setItems(data as Item[]);
    }
    init();
  }, []);

  const loadHistory = useCallback(async () => {
    setLoading(true);
    const supabase = createClient();
    let query = supabase
      .from('raw_material_prices')
      .select(`
        *,
        item:item_id(*),
        supplier:supplier_id(name),
        uom:uom_id(abbreviation),
        creator:created_by(full_name),
        approver:approved_by(full_name)
      `)
      .order('item_id')
      .order('effective_from', { ascending: false });
    if (filterItem) query = query.eq('item_id', filterItem);
    const { data } = await query;
    if (data) setRows(data as PriceHistoryRow[]);
    setLoading(false);
  }, [filterItem]);

  useEffect(() => { if (role && canSeePricing(role)) loadHistory(); }, [role, loadHistory]);

  if (role === null) return <div className="p-8 text-center text-gray-400">Loading...</div>;
  if (!canSeePricing(role)) return <AccessDenied />;

  function exportCsv() {
    const headers = ['Item', 'Supplier', 'Price/UOM', 'UOM', 'Effective From', 'Effective To', 'Status', 'Entered By', 'Approved By', 'Remarks'];
    const csvRows = [
      headers.join(','),
      ...rows.map(r => [
        `"${r.item?.item_name ?? ''}"`,
        `"${r.supplier?.name ?? ''}"`,
        r.price_per_uom,
        r.uom?.abbreviation ?? '',
        r.effective_from,
        r.effective_to ?? '',
        r.is_active ? 'Active' : 'Inactive',
        `"${r.creator?.full_name ?? ''}"`,
        `"${r.approver?.full_name ?? ''}"`,
        `"${r.remarks ?? ''}"`,
      ].join(','))
    ];
    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'price_history.csv'; a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="p-6">
      <PageHeader
        title="Price History"
        description="Complete history of raw material price changes"
        breadcrumbs={[{ label: 'Reports' }, { label: 'Price History' }]}
        actions={rows.length > 0 ? (
          <Button variant="outline" size="sm" onClick={exportCsv}><Download className="w-4 h-4 mr-1" />Export CSV</Button>
        ) : undefined}
      />

      <div className="flex flex-wrap gap-3 mb-4">
        <Select value={filterItem} onValueChange={setFilterItem}>
          <SelectTrigger className="w-64"><SelectValue placeholder="All Items" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="">All Items</SelectItem>
            {items.map(i => <SelectItem key={i.id} value={i.id}>{i.item_name}</SelectItem>)}
          </SelectContent>
        </Select>
        {filterItem && (
          <Button variant="ghost" size="sm" onClick={() => setFilterItem('')}>Clear</Button>
        )}
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-400">Loading...</div>
      ) : rows.length === 0 ? (
        <EmptyState title="No price records" description="No price history found." />
      ) : (
        <CustomizableTable
          storageKey="report-price-history"
          rows={rows}
          rowKey={r => r.id}
          columns={[
            { id: 'item', header: 'Item', className: 'font-medium', cell: r => r.item?.item_name ?? '—' },
            { id: 'supplier', header: 'Supplier', cell: r => r.supplier?.name ?? '—' },
            { id: 'price', header: 'Price/UOM', className: 'text-right font-medium', cell: r => formatCurrency(r.price_per_uom) },
            { id: 'uom', header: 'UOM', cell: r => r.uom?.abbreviation ?? '—' },
            { id: 'from', header: 'Effective From', cell: r => formatDate(r.effective_from) },
            { id: 'to', header: 'Effective To', cell: r => r.effective_to ? formatDate(r.effective_to) : <span className="text-gray-400">ongoing</span> },
            { id: 'status', header: 'Status', cell: r => r.is_active ? <Badge className="bg-green-100 text-green-800">Active</Badge> : <Badge variant="secondary">Expired</Badge> },
            { id: 'creator', header: 'Entered By', className: 'text-sm', defaultHidden: true, cell: r => r.creator?.full_name ?? '—' },
            { id: 'approver', header: 'Approved By', className: 'text-sm', cell: r => r.approver?.full_name ? <span className="text-green-700">{r.approver.full_name}</span> : <span className="text-gray-400">Pending</span> },
            { id: 'remarks', header: 'Remarks', className: 'max-w-xs truncate text-sm text-gray-500', defaultHidden: true, cell: r => r.remarks ?? '—' },
          ] as TableColumn<PriceHistoryRow>[]}
        />
      )}
    </div>
  );
}
