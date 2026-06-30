'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { canSeePricing } from '@/lib/permissions';
import { formatCurrency, formatNumber } from '@/lib/utils';
import type { UserRole, BOMHeader } from '@/types';
import { PageHeader } from '@/components/shared/PageHeader';
import { AccessDenied } from '@/components/shared/AccessDenied';
import { EmptyState } from '@/components/shared/EmptyState';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Download, RefreshCw } from 'lucide-react';

interface CostRow {
  bom_id: string;
  bom_code: string;
  finished_item: string;
  output_qty: number;
  uom_abbr: string;
  rm_cost: number;
  pm_cost: number;
  total_material_cost: number;
  cost_per_uom: number;
  missing_prices: number;
}

export default function CostReportPage() {
  const [role, setRole] = useState<UserRole | null>(null);
  const [rows, setRows] = useState<CostRow[]>([]);
  const [loading, setLoading] = useState(false);
  const today = new Date().toISOString().split('T')[0];

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

  async function loadReport() {
    setLoading(true);
    const supabase = createClient();
    const { data: boms } = await supabase
      .from('bom_headers')
      .select('*, finished_item:finished_item_id(*), uom:uom_id(*), bom_items(*, item:item_id(*), uom:uom_id(*))')
      .eq('is_active', true)
      .order('bom_code');

    const costRows: CostRow[] = [];
    for (const bom of (boms ?? []) as BOMHeader[]) {
      let rm_cost = 0, pm_cost = 0, missing = 0;
      for (const bi of bom.bom_items ?? []) {
        const { data: p } = await supabase
          .from('raw_material_prices')
          .select('price_per_uom')
          .eq('item_id', bi.item_id)
          .lte('effective_from', today)
          .or(`effective_to.is.null,effective_to.gte.${today}`)
          .eq('is_active', true)
          .order('effective_from', { ascending: false })
          .limit(1)
          .single();
        if (!p) { missing++; continue; }
        const cost = bi.quantity * p.price_per_uom;
        if (bi.item?.item_type === 'raw_material') rm_cost += cost;
        else if (bi.item?.item_type === 'packing_material') pm_cost += cost;
      }
      const total = rm_cost + pm_cost;
      costRows.push({
        bom_id: bom.id,
        bom_code: bom.bom_code,
        finished_item: bom.finished_item?.item_name ?? '—',
        output_qty: bom.output_quantity,
        uom_abbr: bom.uom?.abbreviation ?? '',
        rm_cost,
        pm_cost,
        total_material_cost: total,
        cost_per_uom: bom.output_quantity > 0 ? total / bom.output_quantity : 0,
        missing_prices: missing,
      });
    }
    setRows(costRows);
    setLoading(false);
  }

  useEffect(() => { if (role && canSeePricing(role)) loadReport(); }, [role]);

  if (role === null) return <div className="p-8 text-center text-gray-400">Loading...</div>;
  if (!canSeePricing(role)) return <AccessDenied />;

  function exportCsv() {
    const headers = ['BOM Code', 'Finished Item', 'Output Qty', 'UOM', 'RM Cost', 'PM Cost', 'Total Material Cost', 'Cost per UOM', 'Missing Prices'];
    const csvRows = [
      headers.join(','),
      ...rows.map(r => [
        r.bom_code, `"${r.finished_item}"`, r.output_qty, r.uom_abbr,
        r.rm_cost.toFixed(2), r.pm_cost.toFixed(2), r.total_material_cost.toFixed(2),
        r.cost_per_uom.toFixed(4), r.missing_prices,
      ].join(','))
    ];
    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'cost_report.csv'; a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="p-6">
      <PageHeader
        title="Cost Report"
        description={`Finished goods cost using active prices as of ${today}`}
        breadcrumbs={[{ label: 'Reports' }, { label: 'Cost Report' }]}
        actions={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={loadReport} disabled={loading}><RefreshCw className="w-4 h-4 mr-1" />Refresh</Button>
            {rows.length > 0 && <Button variant="outline" size="sm" onClick={exportCsv}><Download className="w-4 h-4 mr-1" />Export CSV</Button>}
          </div>
        }
      />

      {loading ? (
        <div className="text-center py-12 text-gray-400">Calculating costs...</div>
      ) : rows.length === 0 ? (
        <EmptyState title="No active BOMs" description="No active BOMs found to calculate costs." />
      ) : (
        <div className="rounded-lg border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>BOM Code</TableHead>
                <TableHead>Finished Item</TableHead>
                <TableHead className="text-right">Output Qty</TableHead>
                <TableHead>UOM</TableHead>
                <TableHead className="text-right">RM Cost</TableHead>
                <TableHead className="text-right">PM Cost</TableHead>
                <TableHead className="text-right">Total Material Cost</TableHead>
                <TableHead className="text-right">Cost per UOM</TableHead>
                <TableHead>Data</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map(row => (
                <TableRow key={row.bom_id}>
                  <TableCell className="font-mono text-xs">{row.bom_code}</TableCell>
                  <TableCell className="font-medium">{row.finished_item}</TableCell>
                  <TableCell className="text-right">{formatNumber(row.output_qty)}</TableCell>
                  <TableCell>{row.uom_abbr}</TableCell>
                  <TableCell className="text-right">{formatCurrency(row.rm_cost)}</TableCell>
                  <TableCell className="text-right">{formatCurrency(row.pm_cost)}</TableCell>
                  <TableCell className="text-right font-semibold">{formatCurrency(row.total_material_cost)}</TableCell>
                  <TableCell className="text-right">
                    <Badge className="bg-blue-100 text-blue-800">{formatCurrency(row.cost_per_uom)}</Badge>
                  </TableCell>
                  <TableCell>
                    {row.missing_prices > 0
                      ? <Badge className="bg-amber-100 text-amber-800">{row.missing_prices} missing</Badge>
                      : <Badge className="bg-green-100 text-green-800">Complete</Badge>}
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
