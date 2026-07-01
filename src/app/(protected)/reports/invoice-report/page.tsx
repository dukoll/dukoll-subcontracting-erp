'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { canSeePricing } from '@/lib/permissions';
import { formatDate, formatCurrency, formatNumber } from '@/lib/utils';
import type { UserRole, Supplier } from '@/types';
import { PageHeader } from '@/components/shared/PageHeader';
import { AccessDenied } from '@/components/shared/AccessDenied';
import { DateRangeFilter, daysAgoISO } from '@/components/shared/DateRangeFilter';
import { EmptyState } from '@/components/shared/EmptyState';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Download, Search } from 'lucide-react';

interface InvoiceRow {
  voucher_id: string;
  voucher_no: string;
  date: string;
  subcontractor: string;
  finished_item: string;
  production_qty: number;
  uom_abbr: string;
  material_cost: number;
  missing_prices: number;
}

export default function InvoiceReportPage() {
  const [role, setRole] = useState<UserRole | null>(null);
  const [subcontractors, setSubcontractors] = useState<Supplier[]>([]);
  const [rows, setRows] = useState<InvoiceRow[]>([]);
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
  if (!canSeePricing(role)) return <AccessDenied />;

  async function handleSearch() {
    setLoading(true);
    const supabase = createClient();
    let query = supabase
      .from('production_vouchers')
      .select('*, finished_item:finished_item_id(*), subcontractor:subcontractor_id(*), uom:uom_id(*), items:production_voucher_items(*, item:item_id(*))')
      .eq('status', 'approved')
      .order('date', { ascending: false });
    if (filterFrom) query = query.gte('date', filterFrom);
    if (filterTo) query = query.lte('date', filterTo);
    if (filterSub) query = query.eq('subcontractor_id', filterSub);
    const { data: vouchers } = await query;

    const invoiceRows: InvoiceRow[] = [];
    for (const v of vouchers ?? []) {
      let materialCost = 0, missing = 0;
      const consumed = (v.items ?? []).filter((i: any) => i.movement_type === 'consumed');
      for (const ci of consumed) {
        const { data: p } = await supabase
          .from('raw_material_prices')
          .select('price_per_uom')
          .eq('item_id', ci.item_id)
          .lte('effective_from', v.date)
          .or(`effective_to.is.null,effective_to.gte.${v.date}`)
          .eq('is_active', true)
          .order('effective_from', { ascending: false })
          .limit(1)
          .single();
        if (!p) { missing++; continue; }
        materialCost += ci.quantity * p.price_per_uom;
      }
      invoiceRows.push({
        voucher_id: v.id,
        voucher_no: v.voucher_no,
        date: v.date,
        subcontractor: v.subcontractor?.name ?? '—',
        finished_item: v.finished_item?.item_name ?? '—',
        production_qty: v.production_quantity,
        uom_abbr: v.uom?.abbreviation ?? '',
        material_cost: materialCost,
        missing_prices: missing,
      });
    }
    setRows(invoiceRows);
    setLoading(false);
  }

  function exportCsv() {
    const headers = ['Date', 'Voucher No', 'Subcontractor', 'Finished Item', 'Production Qty', 'UOM', 'Material Cost', 'Missing Prices'];
    const csvRows = [
      headers.join(','),
      ...rows.map(r => [
        r.date, r.voucher_no, `"${r.subcontractor}"`, `"${r.finished_item}"`,
        r.production_qty, r.uom_abbr, r.material_cost.toFixed(2), r.missing_prices,
      ].join(','))
    ];
    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'invoice_report.csv'; a.click();
    URL.revokeObjectURL(url);
  }

  const totalMaterial = rows.reduce((s, r) => s + r.material_cost, 0);
  const totalQty = rows.reduce((s, r) => s + r.production_qty, 0);

  return (
    <div className="p-6">
      <PageHeader
        title="Invoice Report"
        description="Subcontractor invoice calculations for approved production vouchers"
        breadcrumbs={[{ label: 'Reports' }, { label: 'Invoice Report' }]}
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
          <Search className="w-4 h-4 mr-1" />{loading ? 'Calculating...' : 'Generate Report'}
        </Button>
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-400">Calculating invoice values...</div>
      ) : rows.length === 0 ? (
        <EmptyState title="No invoice data" description="Adjust filters and generate the report." />
      ) : (
        <>
          <div className="mb-2 text-sm text-gray-500">{rows.length} production vouchers</div>
          <div className="rounded-lg border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Voucher No</TableHead>
                  <TableHead>Subcontractor</TableHead>
                  <TableHead>Finished Item</TableHead>
                  <TableHead className="text-right">Production Qty</TableHead>
                  <TableHead>UOM</TableHead>
                  <TableHead className="text-right">Material Cost</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row, i) => (
                  <TableRow key={i}>
                    <TableCell>{formatDate(row.date)}</TableCell>
                    <TableCell className="font-mono text-xs">{row.voucher_no}</TableCell>
                    <TableCell>{row.subcontractor}</TableCell>
                    <TableCell className="font-medium">{row.finished_item}</TableCell>
                    <TableCell className="text-right">{formatNumber(row.production_qty)}</TableCell>
                    <TableCell>{row.uom_abbr}</TableCell>
                    <TableCell className="text-right font-semibold">{formatCurrency(row.material_cost)}</TableCell>
                    <TableCell>
                      {row.missing_prices > 0
                        ? <span className="text-xs text-amber-600">{row.missing_prices} price(s) missing</span>
                        : <span className="text-xs text-green-600">Complete</span>}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <div className="mt-3 bg-gray-50 rounded-lg p-4 flex justify-between text-sm">
            <span>Total Production: <strong>{formatNumber(totalQty)}</strong> units</span>
            <span>Total Material Cost: <strong>{formatCurrency(totalMaterial)}</strong></span>
          </div>
        </>
      )}
    </div>
  );
}
