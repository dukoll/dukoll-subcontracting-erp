'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

import { createClient } from '@/lib/supabase/client';
import { canSeePricing } from '@/lib/permissions';
import { formatNumber } from '@/lib/utils';
import type { UserRole, Customer, Item, Godown } from '@/types';

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

export default function NewSalesVoucherPage() {
  const router = useRouter();
  const [role, setRole] = useState<UserRole>('store');
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [godowns, setGodowns] = useState<Godown[]>([]);
  const [saving, setSaving] = useState(false);

  // #13 — Sales Order No is manual
  const [salesOrderNo, setSalesOrderNo] = useState('');
  const [date, setDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [customerId, setCustomerId] = useState('');
  const [godownId, setGodownId] = useState('');   // #12 — single godown on the header
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
      const [{ data: cust }, { data: itm }, { data: gdwn }] = await Promise.all([
        supabase
          .from('customers')
          .select('id,name,city')
          .eq('is_active', true)
          .order('name'),
        supabase
          .from('items')
          .select('id,item_name,item_type,uom_id,uom:uoms(id,name,abbreviation)')
          .eq('is_active', true)
          .eq('item_type', 'finished_goods')
          .order('item_name'),
        supabase
          .from('godowns')
          .select('id,name')
          .eq('is_active', true)
          .order('name'),
      ]);
      setCustomers((cust ?? []) as Customer[]);
      setItems((itm ?? []) as Item[]);
      setGodowns((gdwn ?? []) as Godown[]);
    }
    init();
  }, []);

  const showPricing = canSeePricing(role);
  const selectedCustomer = customers.find(c => c.id === customerId);

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
    if (!salesOrderNo.trim()) { toast.error('Please enter the sales order number'); return; }
    if (!customerId) { toast.error('Please select a customer'); return; }
    if (!godownId) { toast.error('Please select the dispatch godown'); return; }
    const validLines = lines.filter(l => l.item_id && parseFloat(l.quantity) > 0);
    if (validLines.length === 0) { toast.error('Add at least one line item with quantity'); return; }

    setSaving(true);
    // Note: stock availability is checked on SUBMIT, not on draft save.
    const supabase = createClient();
    try {
      const { data: voucher, error: vErr } = await supabase
        .from('sales_vouchers')
        .insert({
          voucher_no: salesOrderNo.trim(),
          date,
          customer_id: customerId || null,
          godown_id: godownId,
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
        godown_id: godownId,   // all lines dispatch from the header godown
        rate: showPricing && l.rate ? parseFloat(l.rate) : null,
        amount: showPricing ? calcAmount(l) : null,
        seq_no: idx + 1,
      }));

      const { error: iErr } = await supabase.from('sales_voucher_items').insert(itemRows);
      if (iErr) throw new Error(iErr.message);

      toast.success(`Sales order ${salesOrderNo.trim()} saved`);
      router.push(`/vouchers/sales/${voucher.id}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Something went wrong';
      toast.error(/duplicate key|unique/i.test(msg) ? 'A sales voucher with this order number already exists.' : msg);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <PageHeader
        title="New Sales / Dispatch Voucher"
        description="Record goods dispatched to a customer"
        breadcrumbs={[
          { label: 'Vouchers' },
          { label: 'Sales', href: '/vouchers/sales' },
          { label: 'New' },
        ]}
      />

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Header */}
        <div className="border rounded-xl p-6 bg-white space-y-4">
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Voucher Details</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="soNo">Sales Order No *</Label>
              <Input id="soNo" value={salesOrderNo} onChange={e => setSalesOrderNo(e.target.value)} placeholder="e.g. SO-2026-031" required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="date">Date *</Label>
              <Input id="date" type="date" value={date} onChange={e => setDate(e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="customer">Customer *</Label>
              <SearchableSelect id="customer" value={customerId} onValueChange={setCustomerId}
                placeholder="Select customer..." options={customers.map(c => ({ value: c.id, label: c.name }))} />
            </div>
            <div className="space-y-1.5">
              <Label>City</Label>
              <Input value={selectedCustomer?.city ?? ''} readOnly className="bg-gray-50" placeholder="—" />
            </div>
            {/* #12 — single dispatch godown for the whole voucher */}
            <div className="space-y-1.5">
              <Label htmlFor="godown">Dispatch Godown *</Label>
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
            <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Items</h2>
            <Button type="button" variant="outline" size="sm" onClick={addLine}>
              <Plus className="w-4 h-4 mr-1" /> Add Item
            </Button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-gray-50">
                  <th className="text-left p-2 font-medium text-gray-600 min-w-[220px]">Item *</th>
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

        {/* Remarks (#14) */}
        <div className="border rounded-xl p-6 bg-white space-y-1.5">
          <Label htmlFor="remarks">Remarks</Label>
          <Textarea id="remarks" value={remarks} onChange={e => setRemarks(e.target.value)} placeholder="Optional remarks..." rows={2} />
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-3">
          <Button type="button" variant="outline" onClick={() => router.push('/vouchers/sales')}>
            Cancel
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? 'Saving...' : 'Save Sales Voucher'}
          </Button>
        </div>
      </form>
    </div>
  );
}
