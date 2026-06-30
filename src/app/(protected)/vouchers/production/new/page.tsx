'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

import { createClient } from '@/lib/supabase/client';
import { formatNumber } from '@/lib/utils';
import type { Supplier, Godown, BOMHeader } from '@/types';

import { PageHeader } from '@/components/shared/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';

interface RawMaterialRow {
  bom_item_id: string;
  item_id: string;
  item_name: string;
  uom_abbr: string;
  uom_id: string | null;
  base_qty: number;
  required_qty: number;
}

export default function NewProductionVoucherPage() {
  const router = useRouter();
  const [subcontractors, setSubcontractors] = useState<Supplier[]>([]);
  const [boms, setBoms] = useState<BOMHeader[]>([]);
  const [godowns, setGodowns] = useState<Godown[]>([]);
  const [saving, setSaving] = useState(false);

  const [date, setDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [subcontractorId, setSubcontractorId] = useState('');
  const [bomId, setBomId] = useState('');
  const [selectedBOM, setSelectedBOM] = useState<BOMHeader | null>(null);
  const [sourceGodownId, setSourceGodownId] = useState('');
  const [finishedGodownId, setFinishedGodownId] = useState('');
  const [productionQty, setProductionQty] = useState('');
  const [remarks, setRemarks] = useState('');
  const [rawMaterials, setRawMaterials] = useState<RawMaterialRow[]>([]);

  useEffect(() => {
    async function init() {
      const supabase = createClient();
      const [{ data: subs }, { data: bomList }, { data: gdwn }] = await Promise.all([
        supabase
          .from('suppliers')
          .select('id,name,default_godown_id')
          .eq('is_active', true)
          .eq('is_subcontractor', true)
          .order('name'),
        supabase
          .from('bom_headers')
          .select(`
            id, bom_code, output_quantity,
            finished_item:items!finished_item_id(id, item_name),
            uom:uoms!uom_id(id, abbreviation),
            bom_items(
              id, item_id, quantity, uom_id,
              item:items!item_id(id, item_name),
              uom:uoms!uom_id(id, abbreviation)
            )
          `)
          .eq('is_active', true)
          .order('bom_code'),
        supabase
          .from('godowns')
          .select('id,name')
          .eq('is_active', true)
          .order('name'),
      ]);
      setSubcontractors((subs ?? []) as Supplier[]);
      setBoms((bomList ?? []) as BOMHeader[]);
      setGodowns((gdwn ?? []) as Godown[]);
    }
    init();
  }, []);

  // #11 — auto-select the subcontractor's default godown as the source godown
  function handleSubcontractorChange(id: string) {
    setSubcontractorId(id);
    const sub = subcontractors.find(s => s.id === id);
    if (sub?.default_godown_id) setSourceGodownId(sub.default_godown_id);
  }

  const recalcRawMaterials = useCallback(
    (bom: BOMHeader, prodQty: number) => {
      if (!bom.bom_items || bom.bom_items.length === 0) { setRawMaterials([]); return; }
      const baseOutput = bom.output_quantity || 1;
      const scale = prodQty / baseOutput;
      const rows: RawMaterialRow[] = bom.bom_items.map(bi => ({
        bom_item_id: bi.id,
        item_id: bi.item_id,
        item_name: bi.item?.item_name ?? '—',
        uom_abbr: bi.uom?.abbreviation ?? '',
        uom_id: bi.uom_id ?? null,
        base_qty: bi.quantity,
        required_qty: parseFloat((bi.quantity * scale).toFixed(4)),
      }));
      setRawMaterials(rows);
    },
    []
  );

  function handleBOMChange(id: string) {
    setBomId(id);
    const bom = boms.find(b => b.id === id) ?? null;
    setSelectedBOM(bom);
    if (bom) {
      const defaultProdQty = bom.output_quantity;
      setProductionQty(String(defaultProdQty));
      recalcRawMaterials(bom, defaultProdQty);
    } else {
      setProductionQty('');
      setRawMaterials([]);
    }
  }

  function handleProductionQtyChange(val: string) {
    setProductionQty(val);
    const qty = parseFloat(val);
    if (selectedBOM && !isNaN(qty) && qty > 0) {
      recalcRawMaterials(selectedBOM, qty);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!bomId) { toast.error('Please select a BOM'); return; }
    if (!sourceGodownId) { toast.error('Please select the raw material source godown'); return; }
    if (!finishedGodownId) { toast.error('Please select finished goods godown'); return; }
    const prodQty = parseFloat(productionQty);
    if (isNaN(prodQty) || prodQty <= 0) { toast.error('Enter a valid production quantity'); return; }

    setSaving(true);
    const supabase = createClient();
    try {
      const bom = selectedBOM!;
      // voucher_no is auto-assigned by the DB trigger (PR-001, PR-002, …)
      const { data: voucher, error: vErr } = await supabase
        .from('production_vouchers')
        .insert({
          date,
          subcontractor_id: subcontractorId || null,
          bom_id: bomId,
          finished_item_id: bom.finished_item?.id,
          production_quantity: prodQty,
          uom_id: bom.uom_id ?? null,
          source_godown_id: sourceGodownId,
          finished_goods_godown_id: finishedGodownId,
          notes: remarks || null,
          status: 'draft',
        })
        .select('id,voucher_no')
        .single();

      if (vErr || !voucher) throw new Error(vErr?.message ?? 'Failed to create voucher');

      const itemRows = [
        ...rawMaterials.map((r, idx) => ({
          voucher_id: voucher.id,
          item_id: r.item_id,
          quantity: r.required_qty,
          uom_id: r.uom_id,
          godown_id: sourceGodownId,
          movement_type: 'consumed' as const,
          seq_no: idx + 1,
        })),
        {
          voucher_id: voucher.id,
          item_id: bom.finished_item?.id,
          quantity: prodQty,
          uom_id: bom.uom_id ?? null,
          godown_id: finishedGodownId,
          movement_type: 'produced' as const,
          seq_no: rawMaterials.length + 1,
        },
      ];

      const { error: iErr } = await supabase.from('production_voucher_items').insert(itemRows);
      if (iErr) throw new Error(iErr.message);

      toast.success(`Production voucher ${voucher.voucher_no} created`);
      router.push(`/vouchers/production/${voucher.id}`);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <PageHeader
        title="New Production Voucher"
        description="Record a subcontractor production batch"
        breadcrumbs={[
          { label: 'Vouchers' },
          { label: 'Production', href: '/vouchers/production' },
          { label: 'New' },
        ]}
      />

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Header */}
        <div className="border rounded-xl p-6 bg-white space-y-4">
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Production Details</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <Label>Voucher No</Label>
              <Input value="Auto-generated on save (PR-001…)" readOnly className="bg-gray-50 text-gray-400 text-sm" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="date">Date *</Label>
              <Input id="date" type="date" value={date} onChange={e => setDate(e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="subcontractor">Subcontractor</Label>
              <Select value={subcontractorId} onValueChange={handleSubcontractorChange}>
                <SelectTrigger id="subcontractor">
                  <SelectValue placeholder="Select subcontractor..." />
                </SelectTrigger>
                <SelectContent>
                  {subcontractors.map(s => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="bom">BOM *</Label>
              <Select value={bomId} onValueChange={handleBOMChange}>
                <SelectTrigger id="bom">
                  <SelectValue placeholder="Select BOM..." />
                </SelectTrigger>
                <SelectContent>
                  {boms.map(b => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.bom_code} — {b.finished_item?.item_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {/* #9 — single source godown for all raw materials, beside finished goods godown */}
            <div className="space-y-1.5">
              <Label htmlFor="sourceGodown">Raw Material Source Godown *</Label>
              <Select value={sourceGodownId} onValueChange={setSourceGodownId}>
                <SelectTrigger id="sourceGodown">
                  <SelectValue placeholder="Select source godown..." />
                </SelectTrigger>
                <SelectContent>
                  {godowns.map(g => (
                    <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="finishedGodown">Finished Goods Godown *</Label>
              <Select value={finishedGodownId} onValueChange={setFinishedGodownId}>
                <SelectTrigger id="finishedGodown">
                  <SelectValue placeholder="Select godown..." />
                </SelectTrigger>
                <SelectContent>
                  {godowns.map(g => (
                    <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        {/* BOM Summary */}
        {selectedBOM && (
          <div className="border rounded-xl p-6 bg-blue-50/50 space-y-4">
            <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Output</h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <Label>Finished Item</Label>
                <Input value={selectedBOM.finished_item?.item_name ?? '—'} readOnly className="bg-white" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="prodQty">Production Quantity *</Label>
                <div className="flex gap-2 items-center">
                  <Input
                    id="prodQty"
                    type="number" min="0.001" step="0.001"
                    value={productionQty}
                    onChange={e => handleProductionQtyChange(e.target.value)}
                    required
                    className="bg-white"
                  />
                  <span className="text-sm text-gray-500 whitespace-nowrap">
                    {selectedBOM.uom?.abbreviation ?? ''}
                  </span>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>BOM Base Output</Label>
                <Input
                  value={`${formatNumber(selectedBOM.output_quantity)} ${selectedBOM.uom?.abbreviation ?? ''}`}
                  readOnly className="bg-white text-gray-500"
                />
              </div>
            </div>
          </div>
        )}

        {/* Raw Materials */}
        {rawMaterials.length > 0 && (
          <div className="border rounded-xl p-6 bg-white">
            <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-4">
              Raw Materials Required
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-gray-50">
                    <th className="text-left p-2 font-medium text-gray-600">Item</th>
                    <th className="text-right p-2 font-medium text-gray-600 w-40">Required Qty</th>
                    <th className="text-left p-2 font-medium text-gray-600 w-24">UOM</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {rawMaterials.map((r) => (
                    <tr key={r.bom_item_id}>
                      <td className="p-2 font-medium">{r.item_name}</td>
                      <td className="p-2 text-right font-mono">{formatNumber(r.required_qty)}</td>
                      <td className="p-2 text-gray-500">{r.uom_abbr}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-gray-400 mt-3">
              Quantities auto-scaled from BOM base output of {formatNumber(selectedBOM?.output_quantity ?? 0)} {selectedBOM?.uom?.abbreviation ?? ''}. All consumed from the selected source godown.
            </p>
          </div>
        )}

        {/* Remarks (#14) */}
        <div className="border rounded-xl p-6 bg-white space-y-1.5">
          <Label htmlFor="remarks">Remarks</Label>
          <Textarea id="remarks" value={remarks} onChange={e => setRemarks(e.target.value)} placeholder="Optional remarks..." rows={2} />
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-3">
          <Button type="button" variant="outline" onClick={() => router.push('/vouchers/production')}>
            Cancel
          </Button>
          <Button type="submit" disabled={saving || !bomId}>
            {saving ? 'Saving...' : 'Save Production Voucher'}
          </Button>
        </div>
      </form>
    </div>
  );
}
