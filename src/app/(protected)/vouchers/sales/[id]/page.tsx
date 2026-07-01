'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { ArrowLeft, Pencil, Printer, Trash2, Save, X, Plus, Loader2, Send } from 'lucide-react';
import { toast } from 'sonner';

import { createClient } from '@/lib/supabase/client';
import { canSeePricing } from '@/lib/permissions';
import { formatDate, formatNumber, formatCurrency, voucherStatusColor, voucherStatusLabel } from '@/lib/utils';
import { openPrintWindow, esc } from '@/lib/print';
import type { UserRole, Customer, Item, Godown, SalesVoucher, SalesVoucherItem } from '@/types';

import { PageHeader } from '@/components/shared/PageHeader';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table';

interface EditLine {
  id: string;
  item_id: string;
  quantity: string;
  uom_id: string | null;
  rate: string;
}

export default function SalesVoucherDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [role, setRole] = useState<UserRole>('store');
  const [voucher, setVoucher] = useState<SalesVoucher | null>(null);
  const [items, setItems] = useState<SalesVoucherItem[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [godowns, setGodowns] = useState<Godown[]>([]);
  const [itemMaster, setItemMaster] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [editMode, setEditMode] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  // edit state
  const [soNo, setSoNo] = useState('');
  const [date, setDate] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [godownId, setGodownId] = useState('');
  const [remarks, setRemarks] = useState('');
  const [lines, setLines] = useState<EditLine[]>([]);

  const showPricing = canSeePricing(role);
  const canEdit = role === 'admin' || role === 'accounting' || role === 'store';

  const fetchVoucher = useCallback(async () => {
    setLoading(true);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
      if (profile) setRole(profile.role as UserRole);
    }
    const [{ data: v, error }, { data: vi }, { data: cust }, { data: gdwn }, { data: im }] = await Promise.all([
      supabase.from('sales_vouchers').select('*, customer:customers(id,name,city), godown:godowns(id,name)').eq('id', id).single(),
      supabase.from('sales_voucher_items').select('*, item:items(id,item_name), uom:uoms(id,abbreviation)').eq('voucher_id', id).order('seq_no', { ascending: true, nullsFirst: false }),
      supabase.from('customers').select('id,name,city').eq('is_active', true).order('name'),
      supabase.from('godowns').select('id,name').eq('is_active', true).order('name'),
      supabase.from('items').select('id,item_name,uom_id,uom:uoms(id,abbreviation)').eq('is_active', true).eq('item_type', 'finished_goods').order('item_name'),
    ]);

    if (error || !v) { toast.error('Sales voucher not found'); router.push('/vouchers/sales'); return; }
    const vData = v as SalesVoucher;
    setVoucher(vData);
    setItems((vi ?? []) as SalesVoucherItem[]);
    setCustomers((cust ?? []) as Customer[]);
    setGodowns((gdwn ?? []) as Godown[]);
    setItemMaster((im ?? []) as Item[]);

    setSoNo(vData.voucher_no);
    setDate(vData.date);
    setCustomerId(vData.customer_id ?? '');
    setGodownId(vData.godown_id ?? '');
    setRemarks(vData.notes ?? '');
    setLines((vi ?? []).map((r) => ({
      id: crypto.randomUUID(), item_id: r.item_id, quantity: String(r.quantity), uom_id: r.uom_id, rate: r.rate != null ? String(r.rate) : '',
    })));
    setLoading(false);
  }, [id, router]);

  useEffect(() => { fetchVoucher(); }, [fetchVoucher]);

  function handleItemChange(lineId: string, itemId: string) {
    const item = itemMaster.find(i => i.id === itemId);
    setLines(prev => prev.map(l => l.id === lineId ? { ...l, item_id: itemId, uom_id: item?.uom_id ?? null } : l));
  }
  function setLineField(lineId: string, field: keyof EditLine, value: string) {
    setLines(prev => prev.map(l => l.id === lineId ? { ...l, [field]: value } : l));
  }
  function addLine() { setLines(prev => [...prev, { id: crypto.randomUUID(), item_id: '', quantity: '', uom_id: null, rate: '' }]); }
  function removeLine(lineId: string) { setLines(prev => prev.length > 1 ? prev.filter(l => l.id !== lineId) : prev); }

  async function handleSave() {
    if (!soNo.trim()) { toast.error('Sales order number is required'); return; }
    if (!godownId) { toast.error('Dispatch godown is required'); return; }
    const valid = lines.filter(l => l.item_id && parseFloat(l.quantity) > 0);
    if (valid.length === 0) { toast.error('Add at least one item'); return; }

    setSaving(true);
    const supabase = createClient();
    try {
      const total = valid.reduce((s, l) => s + (parseFloat(l.quantity) || 0) * (parseFloat(l.rate) || 0), 0);
      const { error: hErr } = await supabase.from('sales_vouchers').update({
        voucher_no: soNo.trim(),
        date,
        customer_id: customerId || null,
        godown_id: godownId,
        notes: remarks || null,
        total_amount: showPricing ? total : voucher?.total_amount ?? null,
      }).eq('id', id);
      if (hErr) throw hErr;

      await supabase.from('sales_voucher_items').delete().eq('voucher_id', id);
      const rows = valid.map((l, idx) => ({
        voucher_id: id,
        item_id: l.item_id,
        quantity: parseFloat(l.quantity),
        uom_id: l.uom_id,
        godown_id: godownId,
        rate: showPricing && l.rate ? parseFloat(l.rate) : null,
        amount: showPricing && l.rate ? parseFloat(l.quantity) * parseFloat(l.rate) : null,
        seq_no: idx + 1,
      }));
      const { error: iErr } = await supabase.from('sales_voucher_items').insert(rows);
      if (iErr) throw iErr;

      toast.success('Sales voucher updated');
      setEditMode(false);
      fetchVoucher();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Save failed';
      toast.error(/duplicate key|unique/i.test(msg) ? 'A sales voucher with this order number already exists.' : msg);
    } finally {
      setSaving(false);
    }
  }

  async function handleSubmitVoucher() {
    setSaving(true);
    const supabase = createClient();
    const { error } = await supabase.from('sales_vouchers').update({ status: 'approved' }).eq('id', id);
    setSaving(false);
    if (error) toast.error(error.message);
    else { toast.success('Sales voucher submitted — stock updated'); fetchVoucher(); }
  }

  async function handleDelete() {
    const supabase = createClient();
    await supabase.from('sales_voucher_items').delete().eq('voucher_id', id);
    const { error } = await supabase.from('sales_vouchers').delete().eq('id', id);
    if (error) toast.error(error.message);
    else { toast.success('Sales voucher deleted'); router.push('/vouchers/sales'); }
  }

  // #16 — Dispatch Challan: title, then CITY (no customer name), then items
  function printChallan() {
    if (!voucher) return;
    const city = voucher.customer?.city ?? '';
    const rows = items.map((it, idx) => `
      <tr>
        <td>${idx + 1}</td>
        <td>${esc(it.item?.item_name ?? '')}</td>
        <td class="num">${formatNumber(it.quantity)}</td>
        <td>${esc(it.uom?.abbreviation ?? '')}</td>
      </tr>`).join('');
    const html = `
      <div class="doc-title">Dispatch Challan</div>
      <div class="city">${esc(city || '—')}</div>
      <hr class="rule" />
      <div class="meta">
        <div>
          <p><span class="label">Sales Order No:</span> <strong>${esc(voucher.voucher_no)}</strong></p>
          <p><span class="label">Date:</span> ${esc(formatDate(voucher.date))}</p>
        </div>
        <div style="text-align:right">
          <p><span class="label">Dispatch Godown:</span> ${esc(voucher.godown?.name ?? '—')}</p>
        </div>
      </div>
      <table>
        <thead><tr><th style="width:48px">#</th><th>Item</th><th class="num" style="width:140px">Quantity</th><th style="width:90px">UOM</th></tr></thead>
        <tbody>${rows || '<tr><td colspan="4">No items</td></tr>'}</tbody>
      </table>
      ${voucher.notes ? `<div class="remarks"><span class="label">Remarks:</span> ${esc(voucher.notes)}</div>` : ''}
      <div class="footer">
        <div class="sign">Receiver's Signature</div>
        <div class="sign">Authorised Signatory</div>
      </div>`;
    openPrintWindow(`Dispatch Challan ${voucher.voucher_no}`, html);
  }

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>;
  if (!voucher) return null;

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <PageHeader
        title={`Sales Order ${voucher.voucher_no}`}
        description="Sales / dispatch voucher"
        breadcrumbs={[{ label: 'Vouchers' }, { label: 'Sales', href: '/vouchers/sales' }, { label: voucher.voucher_no }]}
        actions={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => router.push('/vouchers/sales')}><ArrowLeft className="w-4 h-4 mr-1" />Back</Button>
            {!editMode && (
              <>
                <Button size="sm" variant="outline" onClick={printChallan}><Printer className="w-4 h-4 mr-1" />Print Challan</Button>
                {canEdit && voucher.status === 'draft' && (
                  <Button size="sm" onClick={handleSubmitVoucher} disabled={saving} className="bg-green-600 hover:bg-green-700">
                    {saving ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Send className="w-4 h-4 mr-1" />}Submit
                  </Button>
                )}
                {canEdit && <Button size="sm" variant="outline" onClick={() => setEditMode(true)}><Pencil className="w-4 h-4 mr-1" />Edit</Button>}
                {role === 'admin' && <Button size="sm" variant="destructive" onClick={() => setDeleteOpen(true)}><Trash2 className="w-4 h-4 mr-1" />Delete</Button>}
              </>
            )}
            {editMode && (
              <>
                <Button size="sm" variant="outline" onClick={() => { setEditMode(false); fetchVoucher(); }}><X className="w-4 h-4 mr-1" />Cancel</Button>
                <Button size="sm" onClick={handleSave} disabled={saving}>{saving ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Save className="w-4 h-4 mr-1" />}Save</Button>
              </>
            )}
          </div>
        }
      />

      {!editMode ? (
        <div className="space-y-6">
          <Card className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold">Voucher Details</h2>
              <Badge className={voucherStatusColor(voucher.status)}>{voucherStatusLabel(voucher.status)}</Badge>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-x-8 gap-y-4 text-sm">
              <div><div className="text-gray-500 text-xs uppercase font-medium mb-1">Sales Order No</div><div className="font-mono font-medium">{voucher.voucher_no}</div></div>
              <div><div className="text-gray-500 text-xs uppercase font-medium mb-1">Date</div><div>{formatDate(voucher.date)}</div></div>
              <div><div className="text-gray-500 text-xs uppercase font-medium mb-1">Customer</div><div>{voucher.customer?.name ?? '—'}</div></div>
              <div><div className="text-gray-500 text-xs uppercase font-medium mb-1">City</div><div>{voucher.customer?.city ?? '—'}</div></div>
              <div><div className="text-gray-500 text-xs uppercase font-medium mb-1">Dispatch Godown</div><div>{voucher.godown?.name ?? '—'}</div></div>
              {showPricing && <div><div className="text-gray-500 text-xs uppercase font-medium mb-1">Total Amount</div><div className="font-medium">{formatCurrency(voucher.total_amount)}</div></div>}
              {voucher.notes && <div className="col-span-2 md:col-span-3"><div className="text-gray-500 text-xs uppercase font-medium mb-1">Remarks</div><div className="text-gray-700">{voucher.notes}</div></div>}
            </div>
          </Card>

          <Card className="p-6">
            <h2 className="text-base font-semibold mb-4">Items</h2>
            <div className="rounded-lg border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">#</TableHead>
                    <TableHead>Item</TableHead>
                    <TableHead className="text-right">Quantity</TableHead>
                    <TableHead>UOM</TableHead>
                    {showPricing && <TableHead className="text-right">Rate</TableHead>}
                    {showPricing && <TableHead className="text-right">Amount</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((it, idx) => (
                    <TableRow key={it.id}>
                      <TableCell className="text-gray-400 text-sm">{idx + 1}</TableCell>
                      <TableCell className="font-medium text-sm">{it.item?.item_name}</TableCell>
                      <TableCell className="text-right font-mono text-sm">{formatNumber(it.quantity)}</TableCell>
                      <TableCell className="text-sm text-gray-500">{it.uom?.abbreviation ?? '—'}</TableCell>
                      {showPricing && <TableCell className="text-right text-sm">{it.rate != null ? formatNumber(it.rate, 2) : '—'}</TableCell>}
                      {showPricing && <TableCell className="text-right text-sm">{it.amount != null ? formatNumber(it.amount, 2) : '—'}</TableCell>}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </Card>
        </div>
      ) : (
        <div className="space-y-6">
          <Card className="p-6">
            <h2 className="text-base font-semibold mb-4">Edit Voucher Details</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <div className="space-y-1.5"><Label>Sales Order No *</Label><Input value={soNo} onChange={e => setSoNo(e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Date *</Label><Input type="date" value={date} onChange={e => setDate(e.target.value)} /></div>
              <div className="space-y-1.5">
                <Label>Customer</Label>
                <Select value={customerId} onValueChange={setCustomerId}>
                  <SelectTrigger><SelectValue placeholder="Select customer" /></SelectTrigger>
                  <SelectContent>{customers.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>City</Label>
                <Input value={customers.find(c => c.id === customerId)?.city ?? ''} readOnly className="bg-gray-50" />
              </div>
              <div className="space-y-1.5">
                <Label>Dispatch Godown *</Label>
                <Select value={godownId} onValueChange={setGodownId}>
                  <SelectTrigger><SelectValue placeholder="Select godown" /></SelectTrigger>
                  <SelectContent>{godowns.map(g => <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
          </Card>

          <Card className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold">Items</h2>
              <Button type="button" size="sm" variant="outline" onClick={addLine}><Plus className="w-4 h-4 mr-1" />Add Item</Button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-gray-50">
                    <th className="text-left p-2 font-medium text-gray-600 min-w-[200px]">Item</th>
                    <th className="text-left p-2 font-medium text-gray-600 w-28">Qty</th>
                    {showPricing && <th className="text-left p-2 font-medium text-gray-600 w-28">Rate</th>}
                    <th className="w-10" />
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {lines.map(line => (
                    <tr key={line.id}>
                      <td className="p-1.5">
                        <Select value={line.item_id} onValueChange={v => handleItemChange(line.id, v)}>
                          <SelectTrigger className="h-9"><SelectValue placeholder="Select item" /></SelectTrigger>
                          <SelectContent>{itemMaster.map(i => <SelectItem key={i.id} value={i.id}>{i.item_name}</SelectItem>)}</SelectContent>
                        </Select>
                      </td>
                      <td className="p-1.5"><Input type="number" min="0" step="0.001" value={line.quantity} onChange={e => setLineField(line.id, 'quantity', e.target.value)} className="h-9" /></td>
                      {showPricing && <td className="p-1.5"><Input type="number" min="0" step="0.01" value={line.rate} onChange={e => setLineField(line.id, 'rate', e.target.value)} className="h-9" /></td>}
                      <td className="p-1.5"><Button type="button" variant="ghost" size="sm" className="h-9 w-9 p-0 text-gray-400 hover:text-red-500" onClick={() => removeLine(line.id)}><Trash2 className="w-4 h-4" /></Button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Separator className="my-4" />
            <div className="space-y-1.5"><Label>Remarks</Label><Textarea value={remarks} onChange={e => setRemarks(e.target.value)} rows={2} /></div>
          </Card>
        </div>
      )}

      <ConfirmDialog open={deleteOpen} onOpenChange={setDeleteOpen} title="Delete Sales Voucher?" description={`"${voucher.voucher_no}" and its items will be permanently deleted.`} confirmLabel="Delete" onConfirm={handleDelete} />
    </div>
  );
}
