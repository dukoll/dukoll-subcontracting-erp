'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { formatNumber, itemTypeLabel } from '@/lib/utils';
import type { UserRole, StockBalance } from '@/types';
import { PageHeader } from '@/components/shared/PageHeader';
import { EmptyState } from '@/components/shared/EmptyState';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Download, RefreshCw } from 'lucide-react';

export default function StockBalancePage() {
  const [role, setRole] = useState<UserRole | null>(null);
  const [rows, setRows] = useState<StockBalance[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterItem, setFilterItem] = useState('');
  const [filterGodown, setFilterGodown] = useState('');
  const [filterType, setFilterType] = useState('');

  useEffect(() => {
    async function init() {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
      if (profile) setRole(profile.role as UserRole);
    }
    init();
  }, []);

  async function loadData() {
    setLoading(true);
    const supabase = createClient();
    const { data } = await supabase.from('v_stock_balance').select('*').order('item_name');
    if (data) setRows(data as StockBalance[]);
    setLoading(false);
  }

  useEffect(() => { if (role) loadData(); }, [role]);

  if (role === null) return <div className="p-8 text-center text-gray-400">Loading...</div>;

  const filtered = rows.filter(r => {
    if (filterItem && !r.item_name.toLowerCase().includes(filterItem.toLowerCase())) return false;
    if (filterGodown && r.godown_id !== filterGodown) return false;
    if (filterType && r.item_type !== filterType) return false;
    return true;
  });

  const uniqueGodowns = Array.from(new Map(rows.map(r => [r.godown_id, r.godown_name])).entries());
  const totalBalance = filtered.reduce((s, r) => s + r.balance_qty, 0);

  function exportCsv() {
    const headers = ['Item Name', 'Item Type', 'Godown', 'Total In', 'Total Out', 'Balance Qty', 'UOM'];
    const csvRows = [
      headers.join(','),
      ...filtered.map(r => [
        `"${r.item_name}"`, r.item_type, `"${r.godown_name}"`,
        r.total_in, r.total_out, r.balance_qty, r.uom_abbr,
      ].join(','))
    ];
    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'stock_balance.csv'; a.click();
    URL.revokeObjectURL(url);
  }

  const typeColors: Record<string, string> = {
    raw_material: 'bg-blue-100 text-blue-800',
    packing_material: 'bg-purple-100 text-purple-800',
    finished_goods: 'bg-green-100 text-green-800',
    service: 'bg-gray-100 text-gray-800',
  };

  return (
    <div className="p-6">
      <PageHeader
        title="Stock Balance"
        description="Current stock levels across all godowns"
        breadcrumbs={[{ label: 'Reports' }, { label: 'Stock Balance' }]}
        actions={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={loadData}><RefreshCw className="w-4 h-4 mr-1" />Refresh</Button>
            <Button variant="outline" size="sm" onClick={exportCsv}><Download className="w-4 h-4 mr-1" />Export CSV</Button>
          </div>
        }
      />

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-4">
        <Input className="w-52" placeholder="Search item..." value={filterItem} onChange={e => setFilterItem(e.target.value)} />
        <Select value={filterGodown} onValueChange={setFilterGodown}>
          <SelectTrigger className="w-48"><SelectValue placeholder="All Godowns" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="">All Godowns</SelectItem>
            {uniqueGodowns.map(([id, name]) => <SelectItem key={id} value={id}>{name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterType} onValueChange={setFilterType}>
          <SelectTrigger className="w-48"><SelectValue placeholder="All Types" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="">All Types</SelectItem>
            <SelectItem value="raw_material">Raw Material</SelectItem>
            <SelectItem value="packing_material">Packing Material</SelectItem>
            <SelectItem value="finished_goods">Finished Goods</SelectItem>
            <SelectItem value="service">Service</SelectItem>
          </SelectContent>
        </Select>
        {(filterItem || filterGodown || filterType) && (
          <Button variant="ghost" size="sm" onClick={() => { setFilterItem(''); setFilterGodown(''); setFilterType(''); }}>Clear</Button>
        )}
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-400">Loading stock data...</div>
      ) : filtered.length === 0 ? (
        <EmptyState title="No stock data" description="No stock records match your filters." />
      ) : (
        <>
          <div className="rounded-lg border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Item Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Godown</TableHead>
                  <TableHead className="text-right">Opening</TableHead>
                  <TableHead className="text-right">Inward</TableHead>
                  <TableHead className="text-right">Outward</TableHead>
                  <TableHead className="text-right">Balance</TableHead>
                  <TableHead>UOM</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((row, i) => (
                  <TableRow key={i} className={row.balance_qty < 0 ? 'bg-red-50' : ''}>
                    <TableCell className="font-medium">{row.item_name}</TableCell>
                    <TableCell>
                      <Badge className={typeColors[row.item_type] ?? 'bg-gray-100 text-gray-800'}>
                        {itemTypeLabel(row.item_type)}
                      </Badge>
                    </TableCell>
                    <TableCell>{row.godown_name}</TableCell>
                    <TableCell className="text-right">0</TableCell>
                    <TableCell className="text-right text-green-700">{formatNumber(row.total_in)}</TableCell>
                    <TableCell className="text-right text-red-600">{formatNumber(row.total_out)}</TableCell>
                    <TableCell className={`text-right font-semibold ${row.balance_qty < 0 ? 'text-red-600' : 'text-gray-900'}`}>
                      {formatNumber(row.balance_qty)}
                    </TableCell>
                    <TableCell>{row.uom_abbr}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <div className="mt-3 text-sm text-gray-500 flex justify-between px-1">
            <span>{filtered.length} item-godown combinations</span>
            <span className="font-medium">Total balance units: {formatNumber(totalBalance)}</span>
          </div>
        </>
      )}
    </div>
  );
}
