'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { formatDate, formatNumber, voucherStatusColor } from '@/lib/utils';
import type { UserRole, ProductionVoucher, Supplier } from '@/types';
import { PageHeader } from '@/components/shared/PageHeader';
import { EmptyState } from '@/components/shared/EmptyState';
import { DateRangeFilter, daysAgoISO } from '@/components/shared/DateRangeFilter';
import { CustomizableTable, type TableColumn } from '@/components/shared/CustomizableTable';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/searchable-select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Download, Search } from 'lucide-react';

export default function ProductionReportPage() {
  const [role, setRole] = useState<UserRole | null>(null);
  const [rows, setRows] = useState<ProductionVoucher[]>([]);
  const [subcontractors, setSubcontractors] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(false);
  const [filterFrom, setFilterFrom] = useState(() => daysAgoISO(7));
  const [filterTo, setFilterTo] = useState(() => new Date().toISOString().split('T')[0]);
  const [filterSub, setFilterSub] = useState('');

  useEffect(() => {
    async function init() {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
      if (profile) setRole(profile.role as UserRole);
      const { data } = await supabase.from('suppliers').select('*').eq('is_subcontractor', true).eq('is_active', true).order('name');
      if (data) setSubcontractors(data as Supplier[]);
    }
    init();
  }, []);

  if (role === null) return <div className="p-8 text-center text-gray-400">Loading...</div>;

  async function handleSearch() {
    setLoading(true);
    const supabase = createClient();
    let query = supabase
      .from('production_vouchers')
      .select('*, finished_item:finished_item_id(*), subcontractor:subcontractor_id(*), bom:bom_id(*), uom:uom_id(*), finished_goods_godown:finished_goods_godown_id(*)')
      .order('date', { ascending: false });
    if (filterFrom) query = query.gte('date', filterFrom);
    if (filterTo) query = query.lte('date', filterTo);
    if (filterSub) query = query.eq('subcontractor_id', filterSub);
    const { data } = await query;
    if (data) setRows(data as ProductionVoucher[]);
    setLoading(false);
  }

  function exportCsv() {
    const headers = ['Date', 'Voucher No', 'Finished Item', 'Production Qty', 'UOM', 'BOM Code', 'Godown', 'Status'];
    const csvRows = [
      headers.join(','),
      ...rows.map(r => [
        r.date, r.voucher_no,
        `"${r.finished_item?.item_name ?? ''}"`,
        r.production_quantity,
        r.uom?.abbreviation ?? '',
        r.bom?.bom_code ?? '',
        `"${r.finished_goods_godown?.name ?? ''}"`,
        r.status,
      ].join(','))
    ];
    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'production_report.csv'; a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="p-6">
      <PageHeader
        title="Production Report"
        description="Production voucher history and summary"
        breadcrumbs={[{ label: 'Reports' }, { label: 'Production' }]}
        actions={rows.length > 0 ? (
          <Button variant="outline" size="sm" onClick={exportCsv}><Download className="w-4 h-4 mr-1" />Export CSV</Button>
        ) : undefined}
      />

      <div className="bg-white border rounded-lg p-4 mb-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
          <div className="col-span-2">
            <DateRangeFilter from={filterFrom} to={filterTo} onChange={(f, t) => { setFilterFrom(f); setFilterTo(t); }} />
          </div>
          <div className="grid gap-1.5">
            <Label>Subcontractor</Label>
            <Select value={filterSub} onValueChange={setFilterSub}>
              <SelectTrigger><SelectValue placeholder="All" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="">All Subcontractors</SelectItem>
                {subcontractors.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
        <Button onClick={handleSearch} disabled={loading}>
          <Search className="w-4 h-4 mr-1" />{loading ? 'Loading...' : 'Show Report'}
        </Button>
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-400">Loading...</div>
      ) : rows.length === 0 ? (
        <EmptyState title="No production records" description="Adjust filters and click Show Report." />
      ) : (
        <>
          <CustomizableTable
            storageKey="report-production"
            rows={rows}
            rowKey={r => r.id}
            toolbarLeft={`${rows.length} production vouchers`}
            columns={[
              { id: 'date', header: 'Date', cell: r => formatDate(r.date) },
              { id: 'voucher', header: 'Voucher No', className: 'font-mono text-xs', cell: r => r.voucher_no },
              { id: 'item', header: 'Finished Item', className: 'font-medium', cell: r => r.finished_item?.item_name ?? '—' },
              { id: 'qty', header: 'Production Qty', className: 'text-right', cell: r => formatNumber(r.production_quantity) },
              { id: 'uom', header: 'UOM', cell: r => r.uom?.abbreviation ?? '—' },
              { id: 'bom', header: 'BOM Code', className: 'font-mono text-xs', cell: r => r.bom?.bom_code ?? '—' },
              { id: 'godown', header: 'Godown', cell: r => (r as ProductionVoucher & { finished_goods_godown?: { name: string } }).finished_goods_godown?.name ?? '—' },
              { id: 'subcontractor', header: 'Subcontractor', cell: r => r.subcontractor?.name ?? '—' },
              { id: 'status', header: 'Status', cell: r => <Badge className={voucherStatusColor(r.status)}>{r.status}</Badge> },
            ] as TableColumn<ProductionVoucher>[]}
          />
          <div className="mt-3 text-sm text-gray-500 text-right px-1">
            Total production: {formatNumber(rows.reduce((s, r) => s + r.production_quantity, 0))} units
          </div>
        </>
      )}
    </div>
  );
}
