'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { formatDate, formatNumber, formatCurrency, voucherStatusColor } from '@/lib/utils';
import { canSeePricing } from '@/lib/permissions';
import type { UserRole, SalesVoucher, Customer } from '@/types';
import { PageHeader } from '@/components/shared/PageHeader';
import { EmptyState } from '@/components/shared/EmptyState';
import { DateRangeFilter, daysAgoISO } from '@/components/shared/DateRangeFilter';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Download, Search } from 'lucide-react';

interface SalesRow {
  id: string;
  date: string;
  voucher_no: string;
  status: string;
  customer?: { name: string } | null;
  items?: Array<{
    item?: { item_name: string } | null;
    quantity: number;
    uom?: { abbreviation: string } | null;
    godown?: { name: string } | null;
    rate?: number | null;
    amount?: number | null;
  }>;
}

export default function SalesReportPage() {
  const [role, setRole] = useState<UserRole | null>(null);
  const [rows, setRows] = useState<SalesRow[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(false);
  const [filterFrom, setFilterFrom] = useState(() => daysAgoISO(7));
  const [filterTo, setFilterTo] = useState(() => new Date().toISOString().split('T')[0]);
  const [filterCustomer, setFilterCustomer] = useState('');

  useEffect(() => {
    async function init() {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
      if (profile) setRole(profile.role as UserRole);
      const { data } = await supabase.from('customers').select('*').eq('is_active', true).order('name');
      if (data) setCustomers(data as Customer[]);
    }
    init();
  }, []);

  if (role === null) return <div className="p-8 text-center text-gray-400">Loading...</div>;

  const showPricing = canSeePricing(role);

  async function handleSearch() {
    setLoading(true);
    const supabase = createClient();
    let query = supabase
      .from('sales_vouchers')
      .select('*, customer:customer_id(*), items:sales_voucher_items(*, item:item_id(*), uom:uom_id(*), godown:godown_id(*))')
      .order('date', { ascending: false });
    if (filterFrom) query = query.gte('date', filterFrom);
    if (filterTo) query = query.lte('date', filterTo);
    if (filterCustomer) query = query.eq('customer_id', filterCustomer);
    const { data } = await query;
    if (data) setRows(data as SalesRow[]);
    setLoading(false);
  }

  // Flatten to per-item rows for display
  const flatRows = rows.flatMap(v =>
    (v.items ?? []).map(item => ({
      voucher_id: v.id,
      date: v.date,
      voucher_no: v.voucher_no,
      status: v.status,
      customer: v.customer?.name ?? '—',
      item_name: item.item?.item_name ?? '—',
      quantity: item.quantity,
      uom: item.uom?.abbreviation ?? '—',
      godown: item.godown?.name ?? '—',
      rate: item.rate,
      amount: item.amount,
    }))
  );

  function exportCsv() {
    const baseHeaders = ['Date', 'Voucher No', 'Customer', 'Item', 'Qty', 'UOM', 'Godown'];
    const headers = showPricing ? [...baseHeaders, 'Rate', 'Amount'] : baseHeaders;
    const csvRows = [
      headers.join(','),
      ...flatRows.map(r => {
        const base = [r.date, r.voucher_no, `"${r.customer}"`, `"${r.item_name}"`, r.quantity, r.uom, `"${r.godown}"`];
        return showPricing ? [...base, r.rate ?? '', r.amount ?? ''].join(',') : base.join(',');
      })
    ];
    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'sales_report.csv'; a.click();
    URL.revokeObjectURL(url);
  }

  const totalQty = flatRows.reduce((s, r) => s + r.quantity, 0);
  const totalAmount = flatRows.reduce((s, r) => s + (r.amount ?? 0), 0);

  return (
    <div className="p-6">
      <PageHeader
        title="Sales / Dispatch Report"
        description="Sales and dispatch voucher history"
        breadcrumbs={[{ label: 'Reports' }, { label: 'Sales' }]}
        actions={flatRows.length > 0 ? (
          <Button variant="outline" size="sm" onClick={exportCsv}><Download className="w-4 h-4 mr-1" />Export CSV</Button>
        ) : undefined}
      />

      <div className="bg-white border rounded-lg p-4 mb-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
          <div className="col-span-2">
            <DateRangeFilter from={filterFrom} to={filterTo} onChange={(f, t) => { setFilterFrom(f); setFilterTo(t); }} />
          </div>
          <div className="grid gap-1.5">
            <Label>Customer</Label>
            <Select value={filterCustomer} onValueChange={setFilterCustomer}>
              <SelectTrigger><SelectValue placeholder="All Customers" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="">All Customers</SelectItem>
                {customers.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
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
      ) : flatRows.length === 0 ? (
        <EmptyState title="No sales records" description="Adjust filters and click Show Report." />
      ) : (
        <>
          <div className="mb-2 text-sm text-gray-500">{flatRows.length} line items across {rows.length} vouchers</div>
          <div className="rounded-lg border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Voucher No</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Item</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                  <TableHead>UOM</TableHead>
                  <TableHead>Godown</TableHead>
                  {showPricing && <>
                    <TableHead className="text-right">Rate</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                  </>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {flatRows.map((row, i) => (
                  <TableRow key={i}>
                    <TableCell>{formatDate(row.date)}</TableCell>
                    <TableCell className="font-mono text-xs">{row.voucher_no}</TableCell>
                    <TableCell>{row.customer}</TableCell>
                    <TableCell className="font-medium">{row.item_name}</TableCell>
                    <TableCell className="text-right">{formatNumber(row.quantity)}</TableCell>
                    <TableCell>{row.uom}</TableCell>
                    <TableCell>{row.godown}</TableCell>
                    {showPricing && <>
                      <TableCell className="text-right">{row.rate != null ? formatCurrency(row.rate) : '—'}</TableCell>
                      <TableCell className="text-right font-medium">{row.amount != null ? formatCurrency(row.amount) : '—'}</TableCell>
                    </>}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <div className="mt-3 text-sm text-gray-500 flex justify-between px-1">
            <span>Total Qty: {formatNumber(totalQty)}</span>
            {showPricing && <span className="font-medium">Total Amount: {formatCurrency(totalAmount)}</span>}
          </div>
        </>
      )}
    </div>
  );
}
