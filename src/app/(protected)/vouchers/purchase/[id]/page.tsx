'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { ArrowLeft, Pencil, Printer, Trash2, Save, X, Plus, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

import { createClient } from '@/lib/supabase/client';
import { canSeePricing } from '@/lib/permissions';
import { formatDate, formatNumber, formatCurrency, voucherStatusColor } from '@/lib/utils';
import { openPrintWindow, esc } from '@/lib/print';
import type { UserRole, Supplier, Item, Godown, PurchaseVoucher, PurchaseVoucherItem } from '@/types';

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
  godown_id: string;
  rate: string;
}

export default function PurchaseVoucherDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [role, setRole] = useState<UserRole>('store');
  const [voucher, setVoucher] = useState<PurchaseVoucher | null>(null);
  const [items, setItems] = useState<PurchaseVoucherItem[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [godowns, setGodowns] = useState<Godown[]>([]);
  const [itemMaster, setItemMaster] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [editMode, setEditMode] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const [invNo, setInvNo] = useState('');
  const [date, setDate] = useState('');
  const [supplierId, setSupplierId] = useState('');
  const [invDate, setInvDate] = useState('');
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
    const [{ data: v, error }, { data: vi }, { data: sup }, { data: gdwn }, { data: im }] = await Promise.all([
      supabase.from('purchase_vouchers').select('*, supplier:suppliers(id,name)').eq('id', id).single(),
      supabase.from('purchase_voucher_items').select('*, item:items(id,item_name), uom:uoms(id,abbreviation), godown:godowns(id,name)').eq('voucher_id', id).order('seq_no', { ascending: true, nullsFirst: false }),
      supabase.from('suppliers').select('id,name').eq('is_active', true).order('name'),
      supabase.from('godowns').select('id,name').eq('is_active', true).order('name'),
      supabase.from('items').select('id,item_name,uom_id').eq('is_active', true).order('item_name'),
    ]);

    if (error || !v) { toast.error('Purchase voucher not found'); router.push('/vouchers/purchase'); return; }
    const vData = v as PurchaseVoucher;
    setVoucher(vData);
    setItems((vi ?? []) as PurchaseVoucherItem[]);
    setSuppliers((sup ?? []) as Supplier[]);
    setGodowns((gdwn ?? []) as Godown[]);
    setItemMaster((im ?? []) as Item[]);

    setInvNo(vData.voucher_no);
    setDate(vData.date);
    setSupplierId(vData.supplier_id ?? '');
    setInvDate(vData.supplier_invoice_date ?? '');
    setRemarks(vData.notes ?? '');
    setLines((vi ?? []).map((r) => ({
      id: crypto.randomUUID(), item_id: r.item_id, quantity: String(r.quantity), uom_id: r.uom_id, godown_id: r.godown_id ?? '', rate: r.rate != null ? String(r.rate) : '',
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
  function addLine() { setLines(prev => [...prev, { id: crypto.randomUUID(), item_id: '', quantity: '', uom_id: null, godown_id: '', rate: '' }]); }
  function removeLine(lineId: string) { setLines(prev => prev.length > 1 ? prev.filter(l => l.id !== lineId) : prev); }

  async function handleSave() {
    if (!invNo.trim()) { toast.error('Supplier invoice number is required'); return; }
    const valid = lines.filter(l => l.item_id && parseFloat(l.quantity) > 0);
    if (valid.length === 0) { toast.error('Add at least one item'); return; }

    setSaving(true);
    const supabase = createClient();
    try {
      const total = valid.reduce((s, l) => s + (parseFloat(l.quantity) || 0) * (parseFloat(l.rate) || 0), 0);
      const { error: hErr } = await supabase.from('purchase_vouchers').update({
        voucher_no: invNo.trim(),
        date,
        supplier_id: supplierId || null,
        supplier_invoice_no: invNo.trim(),
        supplier_invoice_date: invDate || null,
        notes: remarks || null,
        total_amount: showPricing ? total : voucher?.total_amount ?? null,
      }).eq('id', id);
      if (hErr) throw hErr;

      await supabase.from('purchase_voucher_items').delete().eq('voucher_id', id);
      const rows = valid.map((l, idx) => ({
        voucher_id: id,
        item_id: l.item_id,
        quantity: parseFloat(l.quantity),
        uom_id: l.uom_id,
        godown_id: l.godown_id || null,
        rate: showPricing && l.rate ? parseFloat(l.rate) : null,
        amount: showPricing && l.rate ? parseFloat(l.quantity) * parseFloat(l.rate) : null,
        seq_no: idx + 1,
      }));
      const { error: iErr } = await supabase.from('purchase_voucher_items').insert(rows);
      if (iErr) throw iErr;

      toast.success('Purchase voucher updated');
      setEditMode(false);
      fetchVoucher();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Save failed';
      toast.error(/duplicate key|unique/i.test(msg) ? 'A purchase voucher with this invoice number already exists.' : msg);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    const supabase = createClient();
    await supabase.from('purchase_voucher_items').delete().eq('voucher_id', id);
    const { error } = await supabase.from('purchase_vouchers').delete().eq('id', id);
    if (error) toast.error(error.message);
    else { toast.success('Purchase voucher deleted'); router.push('/vouchers/purchase'); }
  }

  function printVoucher() {
    if (!voucher) return;
    const rows = items.map((it, idx) => `
      <tr>
        <td>${idx + 1}</td>
        <td>${esc(it.item?.item_name ?? '')}</td>
        <td class="num">${formatNumber(it.quantity)}</td>
        <td>${esc(it.uom?.abbreviation ?? '')}</td>
        <td>${esc(it.godown?.name ?? '')}</td>
        ${showPricing ? `<td class="num">${it.rate != null ? formatNumber(it.rate, 2) : ''}</td><td class="num">${it.amount != null ? formatNumber(it.amount, 2) : ''}</td>` : ''}
      </tr>`).join('');
    const html = `
      <div class="doc-title">Purchase Voucher</div>
      <hr class="rule" />
      <div class="meta">
        <div>
          <p><span class="label">Supplier Invoice No:</span> <strong>${esc(voucher.voucher_no)}</strong></p>
          <p><span class="label">Date:</span> ${esc(formatDate(voucher.date))}</p>
        </div>
        <div style="text-align:right">
          <p><span class="label">Supplier:</span> ${esc(voucher.supplier?.name ?? '—')}</p>
          ${voucher.supplier_invoice_date ? `<p><span class="label">Invoice Date:</span> ${esc(formatDate(voucher.supplier_invoice_date))}</p>` : ''}
        </div>
      </div>
      <table>
        <thead><tr><th style="width:42px">#</th><th>Item</th><th class="num" style="width:120px">Quantity</th><th style="width:80px">UOM</th><th>Godown</th>${showPricing ? '<th class="num">Rate</th><th class="num">Amount</th>' : ''}</tr></thead>
        <tbody>${rows || '<tr><td colspan="5">No items</td></tr>'}</tbody>
        ${showPricing && voucher.total_amount != null ? `<tfoot><tr class="total-row"><td colspan="6" class="num">Total</td><td class="num">${formatNumber(voucher.total_amount, 2)}</td></tr></tfoot>` : ''}
      </table>
      ${voucher.notes ? `<div class="remarks"><span class="label">Remarks:</span> ${esc(voucher.notes)}</div>` : ''}
      <div class="footer"><div class="sign">Prepared By</div><div class="sign">Authorised Signatory</div></div>`;
    openPrintWindow(`Purchase Voucher ${voucher.voucher_no}`, html);
  }

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>;
  if (!voucher) return null;

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <PageHeader
        title={`Purchase ${voucher.voucher_no}`}
        description="Purchase voucher"
        breadcrumbs={[{ label: 'Vouchers' }, { label: 'Purchase', href: '/vouchers/purchase' }, { label: voucher.voucher_no }]}
        actions={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => router.push('/vouchers/purchase')}><ArrowLeft className="w-4 h-4 mr-1" />Back</Button>
            {!editMode && (
              <>
                <Button size="sm" variant="outline" onClick={printVoucher}><Printer className="w-4 h-4 mr-1" />Print</Button>
                {canEdit && <Button size="sm" onClick={() => setEditMode(true)}><Pencil className="w-4 h-4 mr-1" />Edit</Button>}
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
              <Badge className={voucherStatusColor(voucher.status)}>{voucher.status.charAt(0).toUpperCase() + voucher.status.slice(1)}</Badge>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-x-8 gap-y-4 text-sm">
              <div><div className="text-gray-500 text-xs uppercase font-medium mb-1">Supplier Invoice No</div><div className="font-mono font-medium">{voucher.voucher_no}</div></div>
              <div><div className="text-gray-500 text-xs uppercase font-medium mb-1">Date</div><div>{formatDate(voucher.date)}</div></div>
              <div><div className="text-gray-500 text-xs uppercase font-medium mb-1">Supplier</div><div>{voucher.supplier?.name ?? '—'}</div></div>
              <div><div className="text-gray-500 text-xs uppercase font-medium mb-1">Invoice Date</div><div>{voucher.supplier_invoice_date ? formatDate(voucher.supplier_invoice_date) : '—'}</div></div>
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
                    <TableHead>Godown</TableHead>
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
                      <TableCell className="text-sm text-gray-500">{it.godown?.name ?? '—'}</TableCell>
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
              <div className="space-y-1.5"><Label>Supplier Invoice No *</Label><Input value={invNo} onChange={e => setInvNo(e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Date *</Label><Input type="date" value={date} onChange={e => setDate(e.target.value)} /></div>
              <div className="space-y-1.5">
                <Label>Supplier</Label>
                <Select value={supplierId} onValueChange={setSupplierId}>
                  <SelectTrigger><SelectValue placeholder="Select supplier" /></SelectTrigger>
                  <SelectContent>{suppliers.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5"><Label>Invoice Date</Label><Input type="date" value={invDate} onChange={e => setInvDate(e.target.value)} /></div>
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
                    <th className="text-left p-2 font-medium text-gray-600 min-w-[180px]">Item</th>
                    <th className="text-left p-2 font-medium text-gray-600 w-24">Qty</th>
                    <th className="text-left p-2 font-medium text-gray-600 min-w-[150px]">Godown</th>
                    {showPricing && <th className="text-left p-2 font-medium text-gray-600 w-24">Rate</th>}
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
                      <td className="p-1.5">
                        <Select value={line.godown_id} onValueChange={v => setLineField(line.id, 'godown_id', v)}>
                          <SelectTrigger className="h-9"><SelectValue placeholder="Godown" /></SelectTrigger>
                          <SelectContent>{godowns.map(g => <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>)}</SelectContent>
                        </Select>
                      </td>
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

      <ConfirmDialog open={deleteOpen} onOpenChange={setDeleteOpen} title="Delete Purchase Voucher?" description={`"${voucher.voucher_no}" and its items will be permanently deleted.`} confirmLabel="Delete" onConfirm={handleDelete} />
    </div>
  );
}
