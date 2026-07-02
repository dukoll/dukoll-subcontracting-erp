'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

import { createClient } from '@/lib/supabase/client';
import { getStockShortfalls, stockErrorMessage } from '@/lib/stock';
import { formatNumber } from '@/lib/utils';
import type { Supplier, Godown, BOMHeader, Item } from '@/types';

import { PageHeader } from '@/components/shared/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';

interface RawMaterialRow {
  id: string;               // stable react key
  item_id: string;
  uom_abbr: string;
  uom_id: string | null;
  base_qty: number;         // per-BOM base qty (0 for manually added rows)
  required_qty: number;
  touched: boolean;         // user edited item/qty → keep as-is on rescale
}

export default function NewProductionVoucherPage() {
  const router = useRouter();
  const [subcontractors, setSubcontractors] = useState<Supplier[]>([]);
  const [boms, setBoms] = useState<BOMHeader[]>([]);
  const [godowns, setGodowns] = useState<Godown[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [previewNo, setPreviewNo] = useState('PR-001');
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
      const [{ data: subs }, { data: bomList }, { data: gdwn }, { data: itm }] = await Promise.all([
        supabase
          .from('suppliers')
          .select('id,name,default_godown_id')
          .eq('is_active', true)
          .eq('is_subcontractor', true)
          .order('name'),
        supabase
          .from('bom_headers')
          .select(`
            id, bom_code, output_quantity, subcontractor_id,
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
        supabase
          .from('items')
          .select('id,item_name,uom_id,uom:uoms(id,abbreviation)')
          .in('item_type', ['raw_material', 'packing_material'])
          .eq('is_active', true)
          .order('item_name'),
      ]);
      setSubcontractors((subs ?? []) as Supplier[]);
      setBoms((bomList ?? []) as BOMHeader[]);
      setGodowns((gdwn ?? []) as Godown[]);
      setItems((itm ?? []) as Item[]);

      // #3 — preview the next sequential voucher no (the DB trigger assigns the
      // authoritative value on insert; this is a best-effort display).
      const { data: last } = await supabase
        .from('production_vouchers')
        .select('voucher_no')
        .ilike('voucher_no', 'PR-%')
        .order('voucher_no', { ascending: false })
        .limit(1)
        .maybeSingle();
      const nextN = last?.voucher_no ? (parseInt(last.voucher_no.split('-')[1], 10) || 0) + 1 : 1;
      setPreviewNo(`PR-${String(nextN).padStart(3, '0')}`);
    }
    init();
  }, []);

  // #5 — only BOMs assigned to the chosen subcontractor (plus unassigned ones)
  // are selectable, so you can't accidentally pick another subcontractor's recipe.
  const visibleBoms = subcontractorId
    ? boms.filter(b => !b.subcontractor_id || b.subcontractor_id === subcontractorId)
    : boms;

  // #11 — auto-select the subcontractor's default godown as the source godown
  // #5 — also default the finished-goods godown to that same assigned godown
  function handleSubcontractorChange(id: string) {
    setSubcontractorId(id);
    const sub = subcontractors.find(s => s.id === id);
    if (sub?.default_godown_id) {
      setSourceGodownId(sub.default_godown_id);
      setFinishedGodownId(sub.default_godown_id);
    }
    // If the currently selected BOM isn't valid for this subcontractor, clear it.
    if (bomId) {
      const current = boms.find(b => b.id === bomId);
      if (current?.subcontractor_id && current.subcontractor_id !== id) {
        setBomId('');
        setSelectedBOM(null);
        setProductionQty('');
        setRawMaterials([]);
      }
    }
  }

  // Build fresh rows from the BOM defaults (called when a BOM is selected).
  const buildRowsFromBOM = useCallback((bom: BOMHeader, prodQty: number) => {
    if (!bom.bom_items || bom.bom_items.length === 0) { setRawMaterials([]); return; }
    const scale = prodQty / (bom.output_quantity || 1);
    const rows: RawMaterialRow[] = bom.bom_items.map(bi => ({
      id: crypto.randomUUID(),
      item_id: bi.item_id,
      uom_abbr: bi.uom?.abbreviation ?? '',
      uom_id: bi.uom_id ?? null,
      base_qty: bi.quantity,
      required_qty: parseFloat((bi.quantity * scale).toFixed(4)),
      touched: false,
    }));
    setRawMaterials(rows);
  }, []);

  function handleBOMChange(id: string) {
    setBomId(id);
    const bom = boms.find(b => b.id === id) ?? null;
    setSelectedBOM(bom);
    if (bom) {
      const defaultProdQty = bom.output_quantity;
      setProductionQty(String(defaultProdQty));
      buildRowsFromBOM(bom, defaultProdQty);
    } else {
      setProductionQty('');
      setRawMaterials([]);
    }
  }

  // Rescale only untouched (BOM-derived) rows so manual edits/added rows persist.
  function handleProductionQtyChange(val: string) {
    setProductionQty(val);
    const qty = parseFloat(val);
    if (selectedBOM && !isNaN(qty) && qty > 0) {
      const scale = qty / (selectedBOM.output_quantity || 1);
      setRawMaterials(prev => prev.map(r =>
        r.touched ? r : { ...r, required_qty: parseFloat((r.base_qty * scale).toFixed(4)) }
      ));
    }
  }

  // #7 — raw materials are editable for this voucher only (BOM master unchanged)
  function handleRawItemChange(rowId: string, itemId: string) {
    const item = items.find(i => i.id === itemId);
    setRawMaterials(prev => prev.map(r => r.id === rowId
      ? { ...r, item_id: itemId, uom_id: item?.uom_id ?? null, uom_abbr: item?.uom?.abbreviation ?? '', touched: true }
      : r));
  }
  function handleRawQtyChange(rowId: string, val: string) {
    setRawMaterials(prev => prev.map(r => r.id === rowId
      ? { ...r, required_qty: parseFloat(val) || 0, touched: true }
      : r));
  }
  function addRawRow() {
    setRawMaterials(prev => [...prev, {
      id: crypto.randomUUID(), item_id: '', uom_abbr: '', uom_id: null, base_qty: 0, required_qty: 0, touched: true,
    }]);
  }
  function removeRawRow(rowId: string) {
    setRawMaterials(prev => prev.filter(r => r.id !== rowId));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!bomId) { toast.error('Please select a BOM'); return; }
    if (!sourceGodownId) { toast.error('Please select the raw material source godown'); return; }
    if (!finishedGodownId) { toast.error('Please select finished goods godown'); return; }
    const prodQty = parseFloat(productionQty);
    if (isNaN(prodQty) || prodQty <= 0) { toast.error('Enter a valid production quantity'); return; }
    const validRaw = rawMaterials.filter(r => r.item_id && r.required_qty > 0);
    if (validRaw.length === 0) { toast.error('Add at least one raw material with quantity'); return; }

    setSaving(true);
    // Prevent negative stock: the source godown must hold enough raw material.
    const shortfalls = await getStockShortfalls(validRaw.map(r => ({
      item_id: r.item_id, godown_id: sourceGodownId, qty: r.required_qty,
      item_name: items.find(i => i.id === r.item_id)?.item_name,
    })));
    if (shortfalls.length) { toast.error(stockErrorMessage(shortfalls)); setSaving(false); return; }

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
        ...validRaw.map((r, idx) => ({
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
          seq_no: validRaw.length + 1,
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
              <Input value={previewNo} readOnly className="bg-gray-50 font-mono font-medium" />
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
                  {visibleBoms.length === 0 && (
                    <div className="px-2 py-1.5 text-sm text-gray-400">No BOM assigned to this subcontractor</div>
                  )}
                  {visibleBoms.map(b => (
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
          <div className="border rounded-xl p-6 bg-red-50/50 space-y-4">
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

        {/* Raw Materials — prefilled from BOM, editable for this voucher only (#7) */}
        {selectedBOM && (
          <div className="border rounded-xl p-6 bg-white">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
                Raw Materials Required
              </h2>
              <Button type="button" variant="outline" size="sm" onClick={addRawRow}>
                <Plus className="w-4 h-4 mr-1" /> Add Item
              </Button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-gray-50">
                    <th className="text-left p-2 font-medium text-gray-600 min-w-[220px]">Item</th>
                    <th className="text-left p-2 font-medium text-gray-600 w-40">Required Qty</th>
                    <th className="text-left p-2 font-medium text-gray-600 w-24">UOM</th>
                    <th className="w-10" />
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {rawMaterials.map((r) => (
                    <tr key={r.id}>
                      <td className="p-1.5">
                        <Select value={r.item_id} onValueChange={v => handleRawItemChange(r.id, v)}>
                          <SelectTrigger className="h-9"><SelectValue placeholder="Select item..." /></SelectTrigger>
                          <SelectContent>
                            {items.map(i => <SelectItem key={i.id} value={i.id}>{i.item_name}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="p-1.5">
                        <Input
                          type="number" min="0" step="0.001"
                          value={r.required_qty}
                          onChange={e => handleRawQtyChange(r.id, e.target.value)}
                          className="h-9"
                        />
                      </td>
                      <td className="p-1.5 text-gray-500">{r.uom_abbr}</td>
                      <td className="p-1.5">
                        <Button
                          type="button" variant="ghost" size="sm"
                          className="h-9 w-9 p-0 text-gray-400 hover:text-red-500"
                          onClick={() => removeRawRow(r.id)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-gray-400 mt-3">
              Prefilled from BOM (auto-scaled from base output of {formatNumber(selectedBOM?.output_quantity ?? 0)} {selectedBOM?.uom?.abbreviation ?? ''}). Edit items or quantities for this voucher only — the BOM master is not affected. All consumed from the selected source godown.
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
