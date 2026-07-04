'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

import { createClient } from '@/lib/supabase/client';
import { canSeePricing } from '@/lib/permissions';
import { formatNumber } from '@/lib/utils';
import type { UserRole, Supplier, Item, Godown } from '@/types';

import { PageHeader } from '@/components/shared/PageHeader';
import { SearchableSelect } from '@/components/shared/SearchableSelect';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';

interface LineItem {
  id: string;
  item_id: string;
  quantity: string;
  uom_id: string;
  uom_name: string;
  rate: string;
}

function newLine(): LineItem {
  return { id: crypto.randomUUID(), item_id: '', quantity: '', uom_id: '', uom_name: '', rate: '' };
}

export default function NewPurchaseVoucherPage() {
  const router = useRouter();
  const [role, setRole] = useState<UserRole>('store');
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [godowns, setGodowns] = useState<Godown[]>([]);
  const [saving, setSaving] = useState(false);

  // Header fields — voucher number IS the supplier invoice number (manual, #13)
  const [date, setDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [supplierId, setSupplierId] = useState('');
  const [supplierInvNo, setSupplierInvNo] = useState('');
  const [supplierInvDate, setSupplierInvDate] = useState('');
  const [godownId, setGodownId] = useState('');
  const [remarks, setRemarks] = useState('');
  const [lines, setLines] = useState<LineItem[]>([newLine()]);

  useEffect(() => {
    async function init() {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: profile } = await supabase
          .from('profiles').select('role').eq('id', user.id).single();
        if (profile) setRole(profile.role as UserRole);
      }
      const [{ data: sup }, { data: itm }, { data: gdwn }] = await Promise.all([
        supabase.from('suppliers').select('id,name,is_active').eq('is_active', true).order('name'),
        supabase.from('items').select('id,item_name,uom_id,uom:uoms(id,name,abbreviation)').eq('is_active', true).order('item_name'),
        supabase.from('godowns').select('id,name').eq('is_active', true).order('name'),
      ]);
      setSuppliers((sup ?? []) as Supplier[]);
      setItems((itm ?? []) as Item[]);
      setGodowns((gdwn ?? []) as Godown[]);
    }
    init();
  }, []);

  const showPricing = canSeePricing(role);

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

  function calcAmount(line: LineItem): number {
    const qty = parseFloat(line.quantity) || 0;
    const rate = parseFloat(line.rate) || 0;
    return qty * rate;
  }

  const totalAmount = lines.reduce((sum, l) => sum + calcAmount(l), 0);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!supplierInvNo.trim()) { toast.error('Please enter the supplier invoice number'); return; }
    if (!supplierId) { toast.error('Please select a supplier'); return; }
    if (!godownId) { toast.error('Please select a godown'); return; }
    const validLines = lines.filter(l => l.item_id && parseFloat(l.quantity) > 0);
    if (validLines.length === 0) { toast.error('Add at least one line item with quantity'); return; }

    setSaving(true);
    const supabase = createClient();
    try {
      const { data: voucher, error: vErr } = await supabase
        .from('purchase_vouchers')
        .insert({
          voucher_no: supplierInvNo.trim(),
          date,
          supplier_id: supplierId || null,
          supplier_invoice_no: supplierInvNo.trim(),
          supplier_invoice_date: supplierInvDate || null,
          notes: remarks || null,
          status: 'draft',
          total_amount: showPricing ? totalAmount : null,
        })
        .select('id')
        .single();

      if (vErr || !voucher) throw new Error(vErr?.message ?? 'Failed to create voucher');

      const itemRows = validLines.map((l, idx) => ({
        voucher_id: voucher.id,
        item_id: l.item_id,
        quantity: parseFloat(l.quantity),
        uom_id: l.uom_id || null,
        godown_id: godownId || null,
        rate: showPricing && l.rate ? parseFloat(l.rate) : null,
        amount: showPricing ? calcAmount(l) : null,
        seq_no: idx + 1,
      }));

      const { error: iErr } = await supabase.from('purchase_voucher_items').insert(itemRows);
      if (iErr) throw new Error(iErr.message);

      toast.success(`Purchase voucher ${supplierInvNo.trim()} saved`);
      router.push(`/vouchers/purchase/${voucher.id}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Something went wrong';
      toast.error(/duplicate key|unique/i.test(msg) ? 'A purchase voucher with this invoice number already exists.' : msg);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <PageHeader
        title="New Purchase Voucher"
        description="Record incoming goods from a supplier"
        breadcrumbs={[
          { label: 'Vouchers' },
          { label: 'Purchase', href: '/vouchers/purchase' },
          { label: 'New' },
        ]}
      />

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Header Section */}
        <div className="border rounded-xl p-6 bg-white space-y-4">
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Voucher Details</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="invNo">Supplier Invoice No *</Label>
              <Input id="invNo" value={supplierInvNo} onChange={e => setSupplierInvNo(e.target.value)} placeholder="e.g. INV-2026-014" required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="date">Date *</Label>
              <Input id="date" type="date" value={date} onChange={e => setDate(e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="supplier">Supplier *</Label>
              <SearchableSelect id="supplier" value={supplierId} onValueChange={setSupplierId}
                placeholder="Select supplier..." options={suppliers.map(s => ({ value: s.id, label: s.name }))} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="invDate">Supplier Invoice Date</Label>
              <Input id="invDate" type="date" value={supplierInvDate} onChange={e => setSupplierInvDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="godown">Godown *</Label>
              <Select value={godownId} onValueChange={setGodownId}>
                <SelectTrigger id="godown">
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

        {/* Line Items */}
        <div className="border rounded-xl p-6 bg-white">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Line Items</h2>
            <Button type="button" variant="outline" size="sm" onClick={addLine}>
              <Plus className="w-4 h-4 mr-1" /> Add Item
            </Button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-gray-50">
                  <th className="text-left p-2 font-medium text-gray-600 min-w-[200px]">Item *</th>
                  <th className="text-left p-2 font-medium text-gray-600 w-28">Quantity *</th>
                  <th className="text-left p-2 font-medium text-gray-600 w-24">UOM</th>
                  {showPricing && <th className="text-left p-2 font-medium text-gray-600 w-28">Rate</th>}
                  {showPricing && <th className="text-right p-2 font-medium text-gray-600 w-28">Amount</th>}
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
                    {showPricing && (
                      <td className="p-1.5">
                        <Input
                          type="number" min="0" step="0.01"
                          value={line.rate}
                          onChange={e => handleLineField(line.id, 'rate', e.target.value)}
                          className="h-9"
                          placeholder="0.00"
                        />
                      </td>
                    )}
                    {showPricing && (
                      <td className="p-1.5 text-right font-medium text-gray-700">
                        {formatNumber(calcAmount(line), 2)}
                      </td>
                    )}
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

          {showPricing && (
            <>
              <Separator className="my-4" />
              <div className="flex justify-end">
                <div className="text-right">
                  <p className="text-sm text-gray-500">Total Amount</p>
                  <p className="text-xl font-bold text-gray-900">
                    ₹ {formatNumber(totalAmount, 2)}
                  </p>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Remarks (#14 — at the bottom) */}
        <div className="border rounded-xl p-6 bg-white space-y-1.5">
          <Label htmlFor="remarks">Remarks</Label>
          <Textarea id="remarks" value={remarks} onChange={e => setRemarks(e.target.value)} placeholder="Optional remarks..." rows={2} />
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-3">
          <Button type="button" variant="outline" onClick={() => router.push('/vouchers/purchase')}>
            Cancel
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? 'Saving...' : 'Save Purchase Voucher'}
          </Button>
        </div>
      </form>
    </div>
  );
}
