'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { canSeePricing } from '@/lib/permissions';
import { formatCurrency, formatNumber } from '@/lib/utils';
import type { UserRole, BOMHeader } from '@/types';
import { PageHeader } from '@/components/shared/PageHeader';
import { AccessDenied } from '@/components/shared/AccessDenied';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { Calculator } from 'lucide-react';

interface CalcRow {
  item_id: string;
  item_name: string;
  item_type: string;
  quantity: number;
  uom_abbr: string;
  rate: number | null;
  cost: number;
}

interface CalcResult {
  rows: CalcRow[];
  rmCost: number;
  pmCost: number;
  totalCost: number;
  outputQty: number;
  costPerUom: number;
}

export default function CostCalculatorPage() {
  const [role, setRole] = useState<UserRole | null>(null);
  const [boms, setBoms] = useState<BOMHeader[]>([]);
  const [selectedBom, setSelectedBom] = useState('');
  const [productionDate, setProductionDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [result, setResult] = useState<CalcResult | null>(null);
  const [calculating, setCalculating] = useState(false);

  useEffect(() => {
    async function init() {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
      if (profile) setRole(profile.role as UserRole);
      const { data: bomData } = await supabase
        .from('bom_headers')
        .select('*, finished_item:finished_item_id(*), uom:uom_id(*), bom_items(*, item:item_id(*), uom:uom_id(*))')
        .eq('is_active', true)
        .order('bom_code');
      if (bomData) setBoms(bomData as BOMHeader[]);
    }
    init();
  }, []);

  if (role === null) return <div className="p-8 text-center text-gray-400">Loading...</div>;
  if (!canSeePricing(role)) return <AccessDenied />;

  async function calculate() {
    if (!selectedBom || !productionDate) return;
    setCalculating(true);
    const supabase = createClient();
    const bom = boms.find(b => b.id === selectedBom);
    if (!bom?.bom_items) { setCalculating(false); return; }

    const rows: CalcRow[] = [];
    for (const bi of bom.bom_items) {
      const { data: priceData } = await supabase
        .from('raw_material_prices')
        .select('price_per_uom')
        .eq('item_id', bi.item_id)
        .lte('effective_from', productionDate)
        .or(`effective_to.is.null,effective_to.gte.${productionDate}`)
        .eq('is_active', true)
        .order('effective_from', { ascending: false })
        .limit(1)
        .single();

      const rate = priceData?.price_per_uom ?? null;
      rows.push({
        item_id: bi.item_id,
        item_name: bi.item?.item_name ?? '—',
        item_type: bi.item?.item_type ?? '',
        quantity: bi.quantity,
        uom_abbr: bi.uom?.abbreviation ?? bom.uom?.abbreviation ?? '',
        rate,
        cost: rate != null ? bi.quantity * rate : 0,
      });
    }

    const rmCost = rows.filter(r => r.item_type === 'raw_material').reduce((s, r) => s + r.cost, 0);
    const pmCost = rows.filter(r => r.item_type === 'packing_material').reduce((s, r) => s + r.cost, 0);
    const totalCost = rmCost + pmCost;
    const outputQty = bom.output_quantity || 1;

    setResult({ rows, rmCost, pmCost, totalCost, outputQty, costPerUom: totalCost / outputQty });
    setCalculating(false);
  }

  const bom = boms.find(b => b.id === selectedBom);

  return (
    <div className="p-6">
      <PageHeader
        title="Cost Calculator"
        description="Calculate finished goods cost from BOM and current raw material prices"
        breadcrumbs={[{ label: 'Pricing' }, { label: 'Cost Calculator' }]}
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Input Panel */}
        <Card className="lg:col-span-1">
          <CardHeader><CardTitle className="flex items-center gap-2"><Calculator className="w-5 h-5" />Parameters</CardTitle></CardHeader>
          <CardContent className="grid gap-4">
            <div className="grid gap-1.5">
              <Label>BOM *</Label>
              <Select value={selectedBom} onValueChange={setSelectedBom}>
                <SelectTrigger><SelectValue placeholder="Select BOM" /></SelectTrigger>
                <SelectContent>
                  {boms.map(b => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.bom_code} — {b.finished_item?.item_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label>Production Date *</Label>
              <Input type="date" value={productionDate} onChange={e => setProductionDate(e.target.value)} />
            </div>
            <Button onClick={calculate} disabled={!selectedBom || !productionDate || calculating} className="w-full">
              {calculating ? 'Calculating...' : 'Calculate Cost'}
            </Button>
          </CardContent>
        </Card>

        {/* Result Panel */}
        <div className="lg:col-span-2">
          {result ? (
            <Card>
              <CardHeader>
                <CardTitle>Cost Breakdown</CardTitle>
                {bom && (
                  <p className="text-sm text-gray-500">
                    {bom.bom_code} — {bom.finished_item?.item_name} | Output: {formatNumber(bom.output_quantity)} {bom.uom?.abbreviation}
                  </p>
                )}
              </CardHeader>
              <CardContent>
                {/* Raw Materials */}
                {result.rows.filter(r => r.item_type === 'raw_material').length > 0 && (
                  <>
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Raw Materials</p>
                    <div className="space-y-1.5 mb-3">
                      {result.rows.filter(r => r.item_type === 'raw_material').map((row, i) => (
                        <div key={i} className="flex justify-between items-center text-sm">
                          <span className="text-gray-700">
                            {row.item_name}: {formatNumber(row.quantity, 3)} {row.uom_abbr} × {row.rate != null ? formatCurrency(row.rate) : <span className="text-amber-600">No price</span>}
                          </span>
                          <span className="font-medium">{formatCurrency(row.cost)}</span>
                        </div>
                      ))}
                    </div>
                    <div className="flex justify-between text-sm font-semibold border-t pt-2 mb-3">
                      <span>Raw Material Sub-total</span>
                      <span>{formatCurrency(result.rmCost)}</span>
                    </div>
                  </>
                )}

                {/* Packing Materials */}
                {result.rows.filter(r => r.item_type === 'packing_material').length > 0 && (
                  <>
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Packing Materials</p>
                    <div className="space-y-1.5 mb-3">
                      {result.rows.filter(r => r.item_type === 'packing_material').map((row, i) => (
                        <div key={i} className="flex justify-between items-center text-sm">
                          <span className="text-gray-700">
                            {row.item_name}: {formatNumber(row.quantity, 3)} {row.uom_abbr} × {row.rate != null ? formatCurrency(row.rate) : <span className="text-amber-600">No price</span>}
                          </span>
                          <span className="font-medium">{formatCurrency(row.cost)}</span>
                        </div>
                      ))}
                    </div>
                    <div className="flex justify-between text-sm font-semibold border-t pt-2 mb-3">
                      <span>Packing Material Sub-total</span>
                      <span>{formatCurrency(result.pmCost)}</span>
                    </div>
                  </>
                )}

                <Separator className="my-3" />

                <div className="flex justify-between items-center">
                  <span className="text-lg font-bold">Total Cost</span>
                  <Badge className="text-base px-4 py-1.5 bg-blue-600">{formatCurrency(result.totalCost)}</Badge>
                </div>
                <div className="flex justify-between items-center mt-2">
                  <span className="text-sm text-gray-600">Cost per {bom?.uom?.abbreviation ?? 'UOM'} (÷ {formatNumber(result.outputQty)})</span>
                  <Badge variant="outline" className="text-sm px-3 py-1">{formatCurrency(result.costPerUom)}</Badge>
                </div>

                {result.rows.some(r => r.rate === null) && (
                  <p className="mt-3 text-xs text-amber-600 bg-amber-50 rounded p-2">
                    Some items have no effective price on {productionDate}. Cost may be understated.
                  </p>
                )}
              </CardContent>
            </Card>
          ) : (
            <div className="flex items-center justify-center h-64 border-2 border-dashed rounded-lg text-gray-400">
              <div className="text-center">
                <Calculator className="w-10 h-10 mx-auto mb-2 opacity-30" />
                <p>Select a BOM and date, then click Calculate</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
