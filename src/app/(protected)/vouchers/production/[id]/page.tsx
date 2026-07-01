'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { ArrowLeft, Pencil, Printer, Trash2, Save, X, Loader2, Send } from 'lucide-react';
import { toast } from 'sonner';

import { createClient } from '@/lib/supabase/client';
import { canSeePricing } from '@/lib/permissions';
import { formatDate, formatNumber, formatCurrency, voucherStatusColor, voucherStatusLabel } from '@/lib/utils';
import { openPrintWindow, esc } from '@/lib/print';
import type { UserRole, Supplier, Godown, BOMHeader, ProductionVoucher, ProductionVoucherItem } from '@/types';

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

interface RawRow { item_id: string; item_name: string; uom_id: string | null; uom_abbr: string; required_qty: number; }

export default function ProductionVoucherDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [role, setRole] = useState<UserRole>('store');
  const [voucher, setVoucher] = useState<ProductionVoucher | null>(null);
  const [items, setItems] = useState<ProductionVoucherItem[]>([]);
  const [bom, setBom] = useState<BOMHeader | null>(null);
  const [subcontractors, setSubcontractors] = useState<Supplier[]>([]);
  const [godowns, setGodowns] = useState<Godown[]>([]);
  const [loading, setLoading] = useState(true);
  const [editMode, setEditMode] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const [date, setDate] = useState('');
  const [subcontractorId, setSubcontractorId] = useState('');
  const [sourceGodownId, setSourceGodownId] = useState('');
  const [finishedGodownId, setFinishedGodownId] = useState('');
  const [productionQty, setProductionQty] = useState('');
  const [remarks, setRemarks] = useState('');
  const [rawRows, setRawRows] = useState<RawRow[]>([]);

  const showPricing = canSeePricing(role);
  const canEdit = role === 'admin' || role === 'production';

  const recompute = useCallback((b: BOMHeader | null, qty: number) => {
    if (!b?.bom_items || b.bom_items.length === 0) { setRawRows([]); return; }
    const scale = qty / (b.output_quantity || 1);
    setRawRows(b.bom_items.map(bi => ({
      item_id: bi.item_id,
      item_name: bi.item?.item_name ?? '—',
      uom_id: bi.uom_id ?? null,
      uom_abbr: bi.uom?.abbreviation ?? '',
      required_qty: parseFloat((bi.quantity * scale).toFixed(4)),
    })));
  }, []);

  const fetchVoucher = useCallback(async () => {
    setLoading(true);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
      if (profile) setRole(profile.role as UserRole);
    }
    const { data: v, error } = await supabase
      .from('production_vouchers')
      .select('*, subcontractor:suppliers(id,name), bom:bom_headers(id,bom_code), finished_item:items!finished_item_id(id,item_name), source_godown:godowns!source_godown_id(id,name), finished_goods_godown:godowns!finished_goods_godown_id(id,name), uom:uoms(id,abbreviation)')
      .eq('id', id).single();
    if (error || !v) { toast.error('Production voucher not found'); router.push('/vouchers/production'); return; }
    const vData = v as ProductionVoucher;

    const [{ data: vi }, { data: subs }, { data: gdwn }, { data: bomData }] = await Promise.all([
      supabase.from('production_voucher_items').select('*, item:items(id,item_name), uom:uoms(id,abbreviation)').eq('voucher_id', id).order('seq_no', { ascending: true, nullsFirst: false }),
      supabase.from('suppliers').select('id,name,default_godown_id').eq('is_active', true).eq('is_subcontractor', true).order('name'),
      supabase.from('godowns').select('id,name').eq('is_active', true).order('name'),
      supabase.from('bom_headers').select('id,bom_code,output_quantity,bom_items(id,item_id,quantity,uom_id,item:items!item_id(id,item_name),uom:uoms!uom_id(id,abbreviation))').eq('id', vData.bom_id).single(),
    ]);

    setVoucher(vData);
    setItems((vi ?? []) as ProductionVoucherItem[]);
    setSubcontractors((subs ?? []) as Supplier[]);
    setGodowns((gdwn ?? []) as Godown[]);
    const b = (bomData ?? null) as BOMHeader | null;
    setBom(b);

    setDate(vData.date);
    setSubcontractorId(vData.subcontractor_id ?? '');
    setSourceGodownId(vData.source_godown_id ?? '');
    setFinishedGodownId(vData.finished_goods_godown_id);
    setProductionQty(String(vData.production_quantity));
    setRemarks(vData.notes ?? '');
    recompute(b, vData.production_quantity);
    setLoading(false);
  }, [id, router, recompute]);

  useEffect(() => { fetchVoucher(); }, [fetchVoucher]);

  function handleSubcontractorChange(sid: string) {
    setSubcontractorId(sid);
    const sub = subcontractors.find(s => s.id === sid);
    if (sub?.default_godown_id) setSourceGodownId(sub.default_godown_id);
  }
  function handleQtyChange(val: string) {
    setProductionQty(val);
    const q = parseFloat(val);
    if (!isNaN(q) && q > 0) recompute(bom, q);
  }

  async function handleSave() {
    if (!sourceGodownId) { toast.error('Source godown is required'); return; }
    if (!finishedGodownId) { toast.error('Finished goods godown is required'); return; }
    const qty = parseFloat(productionQty);
    if (isNaN(qty) || qty <= 0) { toast.error('Enter a valid production quantity'); return; }

    setSaving(true);
    const supabase = createClient();
    try {
      const { error: hErr } = await supabase.from('production_vouchers').update({
        date,
        subcontractor_id: subcontractorId || null,
        source_godown_id: sourceGodownId,
        finished_goods_godown_id: finishedGodownId,
        production_quantity: qty,
        notes: remarks || null,
      }).eq('id', id);
      if (hErr) throw hErr;

      await supabase.from('production_voucher_items').delete().eq('voucher_id', id);
      const rows = [
        ...rawRows.map((r, idx) => ({ voucher_id: id, item_id: r.item_id, quantity: r.required_qty, uom_id: r.uom_id, godown_id: sourceGodownId, movement_type: 'consumed' as const, seq_no: idx + 1 })),
        { voucher_id: id, item_id: voucher?.finished_item_id, quantity: qty, uom_id: voucher?.uom_id ?? null, godown_id: finishedGodownId, movement_type: 'produced' as const, seq_no: rawRows.length + 1 },
      ];
      const { error: iErr } = await supabase.from('production_voucher_items').insert(rows);
      if (iErr) throw iErr;

      toast.success('Production voucher updated');
      setEditMode(false);
      fetchVoucher();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  async function handleSubmitVoucher() {
    setSaving(true);
    const supabase = createClient();
    const { error } = await supabase.from('production_vouchers').update({ status: 'approved' }).eq('id', id);
    setSaving(false);
    if (error) toast.error(error.message);
    else { toast.success('Production voucher submitted — stock updated'); fetchVoucher(); }
  }

  async function handleDelete() {
    const supabase = createClient();
    await supabase.from('production_voucher_items').delete().eq('voucher_id', id);
    const { error } = await supabase.from('production_vouchers').delete().eq('id', id);
    if (error) toast.error(error.message);
    else { toast.success('Production voucher deleted'); router.push('/vouchers/production'); }
  }

  function printVoucher() {
    if (!voucher) return;
    const consumed = items.filter(i => i.movement_type === 'consumed');
    const produced = items.filter(i => i.movement_type === 'produced');
    const consumedRows = consumed.map((it, idx) => `<tr><td>${idx + 1}</td><td>${esc(it.item?.item_name ?? '')}</td><td class="num">${formatNumber(it.quantity)}</td><td>${esc(it.uom?.abbreviation ?? '')}</td></tr>`).join('');
    const producedRows = produced.map((it) => `<tr><td>${esc(it.item?.item_name ?? '')}</td><td class="num">${formatNumber(it.quantity)}</td><td>${esc(it.uom?.abbreviation ?? '')}</td></tr>`).join('');
    const html = `
      <div class="doc-title">Production Voucher</div>
      <hr class="rule" />
      <div class="meta">
        <div>
          <p><span class="label">Voucher No:</span> <strong>${esc(voucher.voucher_no)}</strong></p>
          <p><span class="label">Date:</span> ${esc(formatDate(voucher.date))}</p>
          <p><span class="label">Subcontractor:</span> ${esc(voucher.subcontractor?.name ?? '—')}</p>
        </div>
        <div style="text-align:right">
          <p><span class="label">Source Godown:</span> ${esc(voucher.source_godown?.name ?? '—')}</p>
          <p><span class="label">Finished Godown:</span> ${esc(voucher.finished_goods_godown?.name ?? '—')}</p>
        </div>
      </div>
      <h3 style="margin-top:8px;font-size:14px">Finished Goods Produced</h3>
      <table><thead><tr><th>Item</th><th class="num" style="width:140px">Quantity</th><th style="width:90px">UOM</th></tr></thead><tbody>${producedRows}</tbody></table>
      <h3 style="margin-top:16px;font-size:14px">Raw Materials Consumed</h3>
      <table><thead><tr><th style="width:48px">#</th><th>Item</th><th class="num" style="width:140px">Quantity</th><th style="width:90px">UOM</th></tr></thead><tbody>${consumedRows || '<tr><td colspan="4">None</td></tr>'}</tbody></table>
      ${voucher.notes ? `<div class="remarks"><span class="label">Remarks:</span> ${esc(voucher.notes)}</div>` : ''}
      <div class="footer"><div class="sign">Prepared By</div><div class="sign">Authorised Signatory</div></div>`;
    openPrintWindow(`Production Voucher ${voucher.voucher_no}`, html);
  }

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>;
  if (!voucher) return null;

  const consumed = items.filter(i => i.movement_type === 'consumed');
  const produced = items.filter(i => i.movement_type === 'produced');

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <PageHeader
        title={`Production ${voucher.voucher_no}`}
        description="Production voucher"
        breadcrumbs={[{ label: 'Vouchers' }, { label: 'Production', href: '/vouchers/production' }, { label: voucher.voucher_no }]}
        actions={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => router.push('/vouchers/production')}><ArrowLeft className="w-4 h-4 mr-1" />Back</Button>
            {!editMode && (
              <>
                <Button size="sm" variant="outline" onClick={printVoucher}><Printer className="w-4 h-4 mr-1" />Print</Button>
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
              <h2 className="text-base font-semibold">Production Details</h2>
              <Badge className={voucherStatusColor(voucher.status)}>{voucherStatusLabel(voucher.status)}</Badge>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-x-8 gap-y-4 text-sm">
              <div><div className="text-gray-500 text-xs uppercase font-medium mb-1">Voucher No</div><div className="font-mono font-medium">{voucher.voucher_no}</div></div>
              <div><div className="text-gray-500 text-xs uppercase font-medium mb-1">Date</div><div>{formatDate(voucher.date)}</div></div>
              <div><div className="text-gray-500 text-xs uppercase font-medium mb-1">Subcontractor</div><div>{voucher.subcontractor?.name ?? '—'}</div></div>
              <div><div className="text-gray-500 text-xs uppercase font-medium mb-1">Finished Item</div><div>{voucher.finished_item?.item_name}</div></div>
              <div><div className="text-gray-500 text-xs uppercase font-medium mb-1">Production Qty</div><div>{formatNumber(voucher.production_quantity)} {voucher.uom?.abbreviation ?? ''}</div></div>
              <div><div className="text-gray-500 text-xs uppercase font-medium mb-1">BOM</div><div className="font-mono">{voucher.bom?.bom_code ?? '—'}</div></div>
              <div><div className="text-gray-500 text-xs uppercase font-medium mb-1">Source Godown</div><div>{voucher.source_godown?.name ?? '—'}</div></div>
              <div><div className="text-gray-500 text-xs uppercase font-medium mb-1">Finished Godown</div><div>{voucher.finished_goods_godown?.name ?? '—'}</div></div>
              {showPricing && <div><div className="text-gray-500 text-xs uppercase font-medium mb-1">Production Cost</div><div className="font-medium">{formatCurrency(voucher.production_cost)}</div></div>}
              {voucher.notes && <div className="col-span-2 md:col-span-3"><div className="text-gray-500 text-xs uppercase font-medium mb-1">Remarks</div><div className="text-gray-700">{voucher.notes}</div></div>}
            </div>
          </Card>

          <Card className="p-6">
            <h2 className="text-base font-semibold mb-4">Finished Goods Produced</h2>
            <div className="rounded-lg border overflow-hidden">
              <Table>
                <TableHeader><TableRow><TableHead>Item</TableHead><TableHead className="text-right">Quantity</TableHead><TableHead>UOM</TableHead></TableRow></TableHeader>
                <TableBody>
                  {produced.map(it => (
                    <TableRow key={it.id}><TableCell className="font-medium text-sm">{it.item?.item_name}</TableCell><TableCell className="text-right font-mono text-sm">{formatNumber(it.quantity)}</TableCell><TableCell className="text-sm text-gray-500">{it.uom?.abbreviation ?? '—'}</TableCell></TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </Card>

          <Card className="p-6">
            <h2 className="text-base font-semibold mb-4">Raw Materials Consumed</h2>
            <div className="rounded-lg border overflow-hidden">
              <Table>
                <TableHeader><TableRow><TableHead className="w-12">#</TableHead><TableHead>Item</TableHead><TableHead className="text-right">Quantity</TableHead><TableHead>UOM</TableHead></TableRow></TableHeader>
                <TableBody>
                  {consumed.map((it, idx) => (
                    <TableRow key={it.id}><TableCell className="text-gray-400 text-sm">{idx + 1}</TableCell><TableCell className="font-medium text-sm">{it.item?.item_name}</TableCell><TableCell className="text-right font-mono text-sm">{formatNumber(it.quantity)}</TableCell><TableCell className="text-sm text-gray-500">{it.uom?.abbreviation ?? '—'}</TableCell></TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </Card>
        </div>
      ) : (
        <div className="space-y-6">
          <Card className="p-6">
            <h2 className="text-base font-semibold mb-4">Edit Production Details</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <div className="space-y-1.5"><Label>Date *</Label><Input type="date" value={date} onChange={e => setDate(e.target.value)} /></div>
              <div className="space-y-1.5">
                <Label>Subcontractor</Label>
                <Select value={subcontractorId} onValueChange={handleSubcontractorChange}>
                  <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>{subcontractors.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Production Qty *</Label>
                <Input type="number" min="0.001" step="0.001" value={productionQty} onChange={e => handleQtyChange(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Source Godown *</Label>
                <Select value={sourceGodownId} onValueChange={setSourceGodownId}>
                  <SelectTrigger><SelectValue placeholder="Source" /></SelectTrigger>
                  <SelectContent>{godowns.map(g => <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Finished Goods Godown *</Label>
                <Select value={finishedGodownId} onValueChange={setFinishedGodownId}>
                  <SelectTrigger><SelectValue placeholder="Godown" /></SelectTrigger>
                  <SelectContent>{godowns.map(g => <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <p className="text-xs text-gray-400 mt-3">Raw material quantities below are auto-recalculated from the BOM when production quantity changes.</p>
          </Card>

          <Card className="p-6">
            <h2 className="text-base font-semibold mb-4">Raw Materials (auto from BOM)</h2>
            <div className="rounded-lg border overflow-hidden">
              <Table>
                <TableHeader><TableRow><TableHead>Item</TableHead><TableHead className="text-right">Required Qty</TableHead><TableHead>UOM</TableHead></TableRow></TableHeader>
                <TableBody>
                  {rawRows.map(r => (
                    <TableRow key={r.item_id}><TableCell className="font-medium text-sm">{r.item_name}</TableCell><TableCell className="text-right font-mono text-sm">{formatNumber(r.required_qty)}</TableCell><TableCell className="text-sm text-gray-500">{r.uom_abbr}</TableCell></TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <Separator className="my-4" />
            <div className="space-y-1.5"><Label>Remarks</Label><Textarea value={remarks} onChange={e => setRemarks(e.target.value)} rows={2} /></div>
          </Card>
        </div>
      )}

      <ConfirmDialog open={deleteOpen} onOpenChange={setDeleteOpen} title="Delete Production Voucher?" description={`"${voucher.voucher_no}" and its items will be permanently deleted.`} confirmLabel="Delete" onConfirm={handleDelete} />
    </div>
  );
}
