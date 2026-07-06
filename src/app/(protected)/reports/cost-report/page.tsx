'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { canSeePricing } from '@/lib/permissions';
import { formatCurrency, formatNumber } from '@/lib/utils';
import type { UserRole, BOMHeader } from '@/types';
import { PageHeader } from '@/components/shared/PageHeader';
import { AccessDenied } from '@/components/shared/AccessDenied';
import { EmptyState } from '@/components/shared/EmptyState';
import { CustomizableTable, type TableColumn } from '@/components/shared/CustomizableTable';
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
        <CustomizableTable
          storageKey="report-cost"
          rows={rows}
          rowKey={r => r.bom_id}
          columns={[
            { id: 'bom', header: 'BOM Code', className: 'font-mono text-xs', cell: r => r.bom_code },
            { id: 'item', header: 'Finished Item', className: 'font-medium', cell: r => r.finished_item },
            { id: 'output', header: 'Output Qty', className: 'text-right', cell: r => formatNumber(r.output_qty) },
            { id: 'uom', header: 'UOM', cell: r => r.uom_abbr },
            { id: 'rm', header: 'RM Cost', className: 'text-right', cell: r => formatCurrency(r.rm_cost) },
            { id: 'pm', header: 'PM Cost', className: 'text-right', cell: r => formatCurrency(r.pm_cost) },
            { id: 'total', header: 'Total Material Cost', className: 'text-right font-semibold', cell: r => formatCurrency(r.total_material_cost) },
            { id: 'peruom', header: 'Cost per UOM', className: 'text-right', cell: r => <Badge className="bg-red-100 text-red-800">{formatCurrency(r.cost_per_uom)}</Badge> },
            { id: 'data', header: 'Data', cell: r => r.missing_prices > 0
              ? <Badge className="bg-amber-100 text-amber-800">{r.missing_prices} missing</Badge>
              : <Badge className="bg-green-100 text-green-800">Complete</Badge> },
          ] as TableColumn<CostRow>[]}
        />
      )}
    </div>
  );
}
