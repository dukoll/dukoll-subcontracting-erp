'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { canSeePricing } from '@/lib/permissions';
import { formatDate, formatCurrency } from '@/lib/utils';
import type { UserRole, Item } from '@/types';
import { PageHeader } from '@/components/shared/PageHeader';
import { AccessDenied } from '@/components/shared/AccessDenied';
import { EmptyState } from '@/components/shared/EmptyState';
import { CustomizableTable, type TableColumn } from '@/components/shared/CustomizableTable';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/searchable-select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Download, TrendingDown, TrendingUp } from 'lucide-react';

interface VarianceRow {
  item_name: string;
  item_id: string;
  old_price: number;
  new_price: number;
  difference: number;
  pct_change: number;
  new_effective_date: string;
  remarks: string | null;
}

export default function VarianceReportPage() {
  const [role, setRole] = useState<UserRole | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [rows, setRows] = useState<VarianceRow[]>([]);
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

  const loadVariance = useCallback(async () => {
    setLoading(true);
    const supabase = createClient();
    let query = supabase
      .from('raw_material_prices')
      .select('*, item:item_id(*)')
      .order('item_id')
      .order('effective_from');
    if (filterItem) query = query.eq('item_id', filterItem);
    const { data } = await query;

    if (!data) { setLoading(false); return; }

    // Group by item and find consecutive price pairs
    const grouped = new Map<string, any[]>();
    for (const row of data) {
      const list = grouped.get(row.item_id) ?? [];
      list.push(row);
      grouped.set(row.item_id, list);
    }

    const varRows: VarianceRow[] = [];
    for (const [, prices] of grouped) {
      for (let i = 1; i < prices.length; i++) {
        const prev = prices[i - 1];
        const curr = prices[i];
        const diff = curr.price_per_uom - prev.price_per_uom;
        const pct = prev.price_per_uom !== 0 ? (diff / prev.price_per_uom) * 100 : 0;
        varRows.push({
          item_name: curr.item?.item_name ?? '—',
          item_id: curr.item_id,
          old_price: prev.price_per_uom,
          new_price: curr.price_per_uom,
          difference: diff,
          pct_change: pct,
          new_effective_date: curr.effective_from,
          remarks: curr.remarks,
        });
      }
    }
    setRows(varRows.reverse()); // most recent first
    setLoading(false);
  }, [filterItem]);

  useEffect(() => { if (role && canSeePricing(role)) loadVariance(); }, [role, loadVariance]);

  if (role === null) return <div className="p-8 text-center text-gray-400">Loading...</div>;
  if (!canSeePricing(role)) return <AccessDenied />;

  function exportCsv() {
    const headers = ['Item', 'Old Price', 'New Price', 'Difference', '% Change', 'Effective Date', 'Remarks'];
    const csvRows = [
      headers.join(','),
      ...rows.map(r => [
        `"${r.item_name}"`, r.old_price.toFixed(2), r.new_price.toFixed(2),
        r.difference.toFixed(2), r.pct_change.toFixed(2),
        r.new_effective_date, `"${r.remarks ?? ''}"`,
      ].join(','))
    ];
    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'variance_report.csv'; a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="p-6">
      <PageHeader
        title="Variance Report"
        description="Raw material price changes over time"
        breadcrumbs={[{ label: 'Reports' }, { label: 'Variance Report' }]}
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
        {filterItem && <Button variant="ghost" size="sm" onClick={() => setFilterItem('')}>Clear</Button>}
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-400">Loading variance data...</div>
      ) : rows.length === 0 ? (
        <EmptyState title="No price changes" description="No consecutive price entries found for comparison." />
      ) : (
        <CustomizableTable
          storageKey="report-variance"
          rows={rows.map((r, i) => ({ ...r, _k: String(i) }))}
          rowKey={r => r._k}
          columns={[
            { id: 'item', header: 'Item', className: 'font-medium', cell: r => r.item_name },
            { id: 'old', header: 'Old Price', className: 'text-right', cell: r => formatCurrency(r.old_price) },
            { id: 'new', header: 'New Price', className: 'text-right font-semibold', cell: r => formatCurrency(r.new_price) },
            { id: 'diff', header: 'Difference', className: 'text-right font-medium', cell: r => {
              const inc = r.difference > 0, dec = r.difference < 0;
              return <span className={`flex items-center justify-end gap-1 ${inc ? 'text-red-600' : dec ? 'text-green-600' : 'text-gray-500'}`}>
                {inc ? <TrendingUp className="w-3.5 h-3.5" /> : dec ? <TrendingDown className="w-3.5 h-3.5" /> : null}
                {r.difference >= 0 ? '+' : ''}{formatCurrency(r.difference)}
              </span>;
            } },
            { id: 'pct', header: '% Change', className: 'text-right', cell: r => <Badge className={r.difference > 0 ? 'bg-red-100 text-red-800' : r.difference < 0 ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}>{r.pct_change >= 0 ? '+' : ''}{r.pct_change.toFixed(1)}%</Badge> },
            { id: 'date', header: 'Effective Date', cell: r => formatDate(r.new_effective_date) },
            { id: 'remarks', header: 'Remarks', className: 'max-w-xs truncate text-sm text-gray-500', defaultHidden: true, cell: r => r.remarks ?? '—' },
          ] as TableColumn<VarianceRow & { _k: string }>[]}
        />
      )}
    </div>
  );
}
