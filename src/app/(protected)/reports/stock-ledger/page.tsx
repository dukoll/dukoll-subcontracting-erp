'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { formatDate, formatNumber } from '@/lib/utils';
import type { UserRole, Item, Godown } from '@/types';
import { PageHeader } from '@/components/shared/PageHeader';
import { EmptyState } from '@/components/shared/EmptyState';
import { DateRangeFilter, daysAgoISO } from '@/components/shared/DateRangeFilter';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Download, Search } from 'lucide-react';

interface LedgerRow {
  date: string;
  voucher_type: string;
  voucher_no: string;
  item_id: string;
  godown_id: string;
  in_qty: number;
  out_qty: number;
  running_balance?: number;
}

const VOUCHER_COLORS: Record<string, string> = {
  purchase: 'bg-green-100 text-green-800',
  production: 'bg-indigo-100 text-indigo-800',
  sales: 'bg-red-100 text-red-800',
  transfer: 'bg-purple-100 text-purple-800',
};

export default function StockLedgerPage() {
  const [role, setRole] = useState<UserRole | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [godowns, setGodowns] = useState<Godown[]>([]);
  const [rows, setRows] = useState<LedgerRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [filterItem, setFilterItem] = useState('');
  const [filterGodown, setFilterGodown] = useState('');
  const [filterFrom, setFilterFrom] = useState(() => daysAgoISO(7));
  const [filterTo, setFilterTo] = useState(() => new Date().toISOString().split('T')[0]);

  useEffect(() => {
    async function init() {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
      if (profile) setRole(profile.role as UserRole);
      const [itemsRes, godownsRes] = await Promise.all([
        supabase.from('items').select('*').eq('is_active', true).order('item_name'),
        supabase.from('godowns').select('*').eq('is_active', true).order('name'),
      ]);
      if (itemsRes.data) setItems(itemsRes.data as Item[]);
      if (godownsRes.data) setGodowns(godownsRes.data as Godown[]);
    }
    init();
  }, []);

  if (role === null) return <div className="p-8 text-center text-gray-400">Loading...</div>;

  async function handleSearch() {
    if (!filterItem) return;
    setLoading(true);
    const supabase = createClient();
    let query = supabase.from('v_stock_ledger').select('*').eq('item_id', filterItem);
    if (filterGodown) query = query.eq('godown_id', filterGodown);
    if (filterFrom) query = query.gte('date', filterFrom);
    if (filterTo) query = query.lte('date', filterTo);
    query = query.order('date').order('voucher_no');
    const { data } = await query;
    if (data) {
      // compute running balance
      let balance = 0;
      const withBalance = (data as LedgerRow[]).map(r => {
        balance += (r.in_qty || 0) - (r.out_qty || 0);
        return { ...r, running_balance: balance };
      });
      setRows(withBalance);
    }
    setLoading(false);
  }

  function exportCsv() {
    const headers = ['Date', 'Voucher Type', 'Voucher No', 'Godown', 'In Qty', 'Out Qty', 'Running Balance'];
    const csvRows = [
      headers.join(','),
      ...rows.map(r => [
        r.date, r.voucher_type, r.voucher_no,
        godowns.find(g => g.id === r.godown_id)?.name ?? '',
        r.in_qty, r.out_qty, r.running_balance ?? 0,
      ].join(','))
    ];
    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'stock_ledger.csv'; a.click();
    URL.revokeObjectURL(url);
  }

  const selectedItem = items.find(i => i.id === filterItem);

  return (
    <div className="p-6">
      <PageHeader
        title="Stock Ledger"
        description="Item-wise movement history with running balance"
        breadcrumbs={[{ label: 'Reports' }, { label: 'Stock Ledger' }]}
        actions={rows.length > 0 ? (
          <Button variant="outline" size="sm" onClick={exportCsv}><Download className="w-4 h-4 mr-1" />Export CSV</Button>
        ) : undefined}
      />

      {/* Filters */}
      <div className="bg-white border rounded-lg p-4 mb-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
          <div className="col-span-2 md:col-span-1 grid gap-1.5">
            <Label>Item *</Label>
            <Select value={filterItem} onValueChange={setFilterItem}>
              <SelectTrigger><SelectValue placeholder="Select item" /></SelectTrigger>
              <SelectContent>
                {items.map(i => <SelectItem key={i.id} value={i.id}>{i.item_name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label>Godown</Label>
            <Select value={filterGodown} onValueChange={setFilterGodown}>
              <SelectTrigger><SelectValue placeholder="All Godowns" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="">All Godowns</SelectItem>
                {godowns.map(g => <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="col-span-2 md:col-span-2">
            <DateRangeFilter from={filterFrom} to={filterTo} onChange={(f, t) => { setFilterFrom(f); setFilterTo(t); }} />
          </div>
        </div>
        <Button onClick={handleSearch} disabled={!filterItem || loading}>
          <Search className="w-4 h-4 mr-1" />{loading ? 'Loading...' : 'Show Ledger'}
        </Button>
      </div>

      {selectedItem && rows.length > 0 && (
        <div className="mb-3 text-sm text-gray-600">
          Showing ledger for <span className="font-semibold">{selectedItem.item_name}</span> — {rows.length} entries
        </div>
      )}

      {!loading && rows.length === 0 && filterItem && (
        <EmptyState title="No ledger entries" description="No stock movements found for the selected filters." />
      )}

      {!loading && !filterItem && (
        <div className="text-center py-16 text-gray-400">Select an item to view its stock ledger.</div>
      )}

      {rows.length > 0 && (
        <div className="rounded-lg border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Voucher Type</TableHead>
                <TableHead>Voucher No</TableHead>
                <TableHead>Godown</TableHead>
                <TableHead className="text-right">In Qty</TableHead>
                <TableHead className="text-right">Out Qty</TableHead>
                <TableHead className="text-right">Running Balance</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row, i) => (
                <TableRow key={i}>
                  <TableCell>{formatDate(row.date)}</TableCell>
                  <TableCell>
                    <Badge className={VOUCHER_COLORS[row.voucher_type] ?? 'bg-gray-100 text-gray-800'}>
                      {row.voucher_type}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-mono text-xs">{row.voucher_no}</TableCell>
                  <TableCell className="text-sm text-gray-600">{godowns.find(g => g.id === row.godown_id)?.name ?? '—'}</TableCell>
                  <TableCell className="text-right text-green-700">{row.in_qty > 0 ? formatNumber(row.in_qty) : '—'}</TableCell>
                  <TableCell className="text-right text-red-600">{row.out_qty > 0 ? formatNumber(row.out_qty) : '—'}</TableCell>
                  <TableCell className={`text-right font-semibold ${(row.running_balance ?? 0) < 0 ? 'text-red-600' : 'text-gray-900'}`}>
                    {formatNumber(row.running_balance ?? 0)}
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
