'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

import { createClient } from '@/lib/supabase/client';
import type { Item, Godown } from '@/types';

import { PageHeader } from '@/components/shared/PageHeader';
import { SearchableSelect } from '@/components/shared/SearchableSelect';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/searchable-select';

interface LineItem {
  id: string;
  item_id: string;
  quantity: string;
  uom_id: string;
  uom_name: string;
}

function newLine(): LineItem {
  return { id: crypto.randomUUID(), item_id: '', quantity: '', uom_id: '', uom_name: '' };
}

export default function NewStockTransferPage() {
  const router = useRouter();
  const [items, setItems] = useState<Item[]>([]);
  const [godowns, setGodowns] = useState<Godown[]>([]);
  const [previewNo, setPreviewNo] = useState('ST-001');
  const [saving, setSaving] = useState(false);

  const [date, setDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [fromGodownId, setFromGodownId] = useState('');
  const [toGodownId, setToGodownId] = useState('');
  const [remarks, setRemarks] = useState('');
  const [lines, setLines] = useState<LineItem[]>([newLine()]);

  useEffect(() => {
    async function init() {
      const supabase = createClient();
      const [{ data: itm }, { data: gdwn }] = await Promise.all([
        supabase
          .from('items')
          .select('id,item_name,uom_id,uom:uoms(id,name,abbreviation)')
          .eq('is_active', true)
          .order('item_name'),
        supabase
          .from('godowns')
          .select('id,name')
          .eq('is_active', true)
          .order('name'),
      ]);
      setItems((itm ?? []) as Item[]);
      setGodowns((gdwn ?? []) as Godown[]);

      // #3 — preview the next sequential voucher no (DB trigger assigns the
      // authoritative value on insert; this is a best-effort display).
      const { data: last } = await supabase
        .from('stock_transfer_vouchers')
        .select('voucher_no')
        .ilike('voucher_no', 'ST-%')
        .order('voucher_no', { ascending: false })
        .limit(1)
        .maybeSingle();
      const nextN = last?.voucher_no ? (parseInt(last.voucher_no.split('-')[1], 10) || 0) + 1 : 1;
      setPreviewNo(`ST-${String(nextN).padStart(3, '0')}`);
    }
    init();
  }, []);

  function handleItemChange(lineId: string, itemId: string) {
    const item = items.find(i => i.id === itemId);
    setLines(prev => prev.map(l =>
      l.id === lineId
        ? { ...l, item_id: itemId, uom_id: item?.uom_id ?? '', uom_name: item?.uom?.abbreviation ?? '' }
        : l
    ));
  }

  function handleLineField(lineId: string, field: keyof LineItem, value: string) {
    setLines(prev => prev.map(l => l.id === lineId ? { ...l, [field]: value } : l));
  }

  function addLine() { setLines(prev => [...prev, newLine()]); }
  function removeLine(id: string) {
    setLines(prev => prev.length > 1 ? prev.filter(l => l.id !== id) : prev);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!fromGodownId) { toast.error('Please select the source godown'); return; }
    if (!toGodownId) { toast.error('Please select the destination godown'); return; }
    if (fromGodownId === toGodownId) {
      toast.error('Source and destination godowns must be different');
      return;
    }
    const validLines = lines.filter(l => l.item_id && parseFloat(l.quantity) > 0);
    if (validLines.length === 0) { toast.error('Add at least one line item with quantity'); return; }

    setSaving(true);
    // Note: stock availability is checked on SUBMIT, not on draft save —
    // saving a draft does not move stock.
    const supabase = createClient();
    try {
      // voucher_no is auto-assigned by the DB trigger (ST-001, ST-002, …)
      const { data: voucher, error: vErr } = await supabase
        .from('stock_transfer_vouchers')
        .insert({
          date,
          from_godown_id: fromGodownId,
          to_godown_id: toGodownId,
          notes: remarks || null,
          status: 'draft',
        })
        .select('id,voucher_no')
        .single();

      if (vErr || !voucher) throw new Error(vErr?.message ?? 'Failed to create voucher');

      const itemRows = validLines.map((l, idx) => ({
        voucher_id: voucher.id,
        item_id: l.item_id,
        quantity: parseFloat(l.quantity),
        uom_id: l.uom_id || null,
        seq_no: idx + 1,
      }));

      const { error: iErr } = await supabase.from('stock_transfer_items').insert(itemRows);
      if (iErr) throw new Error(iErr.message);

      toast.success(`Stock transfer ${voucher.voucher_no} created`);
      router.push(`/vouchers/stock-transfer/${voucher.id}`);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setSaving(false);
    }
  }

  const toGodownOptions = godowns.filter(g => g.id !== fromGodownId);

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <PageHeader
        title="New Stock Transfer"
        description="Transfer inventory between godowns"
        breadcrumbs={[
          { label: 'Vouchers' },
          { label: 'Stock Transfer', href: '/vouchers/stock-transfer' },
          { label: 'New' },
        ]}
      />

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Header */}
        <div className="border rounded-xl p-6 bg-white space-y-4">
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Transfer Details</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <Label>Voucher No</Label>
              <Input value={previewNo} readOnly className="bg-gray-50 font-mono font-medium" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="date">Date *</Label>
              <Input id="date" type="date" value={date} onChange={e => setDate(e.target.value)} required />
            </div>
            <div className="hidden lg:block" />
            <div className="space-y-1.5">
              <Label htmlFor="fromGodown">From Godown *</Label>
              <Select value={fromGodownId} onValueChange={v => { setFromGodownId(v); if (v === toGodownId) setToGodownId(''); }}>
                <SelectTrigger id="fromGodown">
                  <SelectValue placeholder="Select source..." />
                </SelectTrigger>
                <SelectContent>
                  {godowns.map(g => (
                    <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="toGodown">To Godown *</Label>
              <Select value={toGodownId} onValueChange={setToGodownId}>
                <SelectTrigger id="toGodown">
                  <SelectValue placeholder="Select destination..." />
                </SelectTrigger>
                <SelectContent>
                  {toGodownOptions.map(g => (
                    <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        {/* Line Items */}
        <div className="border rounded-xl p-6 bg-white">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Items to Transfer</h2>
            <Button type="button" variant="outline" size="sm" onClick={addLine}>
              <Plus className="w-4 h-4 mr-1" /> Add Item
            </Button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-gray-50">
                  <th className="text-left p-2 font-medium text-gray-600 min-w-[220px]">Item *</th>
                  <th className="text-left p-2 font-medium text-gray-600 w-32">Quantity *</th>
                  <th className="text-left p-2 font-medium text-gray-600 w-28">UOM</th>
                  <th className="w-10" />
                </tr>
              </thead>
              <tbody className="divide-y">
                {lines.map((line) => (
                  <tr key={line.id}>
                    <td className="p-1.5">
                      <SearchableSelect value={line.item_id} onValueChange={v => handleItemChange(line.id, v)}
                        className="h-9" placeholder="Select item..." options={items.map(i => ({ value: i.id, label: i.item_name }))} />
                    </td>
                    <td className="p-1.5">
                      <Input
                        type="number" min="0" step="0.001"
                        value={line.quantity}
                        onChange={e => handleLineField(line.id, 'quantity', e.target.value)}
                        className="h-9"
                        placeholder="0"
                      />
                    </td>
                    <td className="p-1.5">
                      <Input
                        value={line.uom_name}
                        onChange={e => handleLineField(line.id, 'uom_name', e.target.value)}
                        className="h-9"
                        placeholder="UOM"
                      />
                    </td>
                    <td className="p-1.5">
                      <Button
                        type="button" variant="ghost" size="sm"
                        className="h-9 w-9 p-0 text-gray-400 hover:text-red-500"
                        onClick={() => removeLine(line.id)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Remarks (#14) */}
        <div className="border rounded-xl p-6 bg-white space-y-1.5">
          <Label htmlFor="remarks">Remarks</Label>
          <Textarea id="remarks" value={remarks} onChange={e => setRemarks(e.target.value)} placeholder="Optional remarks..." rows={2} />
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-3">
          <Button type="button" variant="outline" onClick={() => router.push('/vouchers/stock-transfer')}>
            Cancel
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? 'Saving...' : 'Save Stock Transfer'}
          </Button>
        </div>
      </form>
    </div>
  );
}
