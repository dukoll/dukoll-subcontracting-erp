'use client';

import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { Plus, CheckCircle, Pencil, Trash2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { canSeePricing } from '@/lib/permissions';
import { formatDate, formatCurrency } from '@/lib/utils';
import type { UserRole, RawMaterialPrice, Item, Supplier, UOM } from '@/types';
import { PageHeader } from '@/components/shared/PageHeader';
import { AccessDenied } from '@/components/shared/AccessDenied';
import { EmptyState } from '@/components/shared/EmptyState';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

type PriceRow = RawMaterialPrice & { item?: Item; supplier?: Supplier; uom?: UOM; approved_by_profile?: { full_name: string } };

const EMPTY_FORM = {
  item_id: '',
  supplier_id: '',
  price_per_uom: '',
  uom_id: '',
  effective_from: '',
  effective_to: '',
  is_active: true,
  remarks: '',
};

export default function RawMaterialPricesPage() {
  const [role, setRole] = useState<UserRole | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [prices, setPrices] = useState<PriceRow[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [uoms, setUoms] = useState<UOM[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<PriceRow | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [filterItem, setFilterItem] = useState('');
  const [filterFrom, setFilterFrom] = useState('');
  const [filterTo, setFilterTo] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<PriceRow | null>(null);

  useEffect(() => {
    async function init() {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setUserId(user.id);
      const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
      if (profile) setRole(profile.role as UserRole);
    }
    init();
  }, []);

  const loadData = useCallback(async () => {
    const supabase = createClient();
    setLoading(true);
    const [pricesRes, itemsRes, suppliersRes, uomsRes] = await Promise.all([
      supabase.from('raw_material_prices')
        .select('*, item:item_id(*), supplier:supplier_id(*), uom:uom_id(*)')
        .order('created_at', { ascending: false }),
      supabase.from('items').select('*').in('item_type', ['raw_material', 'packing_material']).eq('is_active', true).order('item_name'),
      supabase.from('suppliers').select('*').eq('is_active', true).order('name'),
      supabase.from('uoms').select('*').eq('is_active', true).order('name'),
    ]);
    if (pricesRes.data) setPrices(pricesRes.data as PriceRow[]);
    if (itemsRes.data) setItems(itemsRes.data as Item[]);
    if (suppliersRes.data) setSuppliers(suppliersRes.data as Supplier[]);
    if (uomsRes.data) setUoms(uomsRes.data as UOM[]);
    setLoading(false);
  }, []);

  useEffect(() => { if (role && canSeePricing(role)) loadData(); }, [role, loadData]);

  if (role === null) return <div className="p-8 text-center text-gray-400">Loading...</div>;
  if (!canSeePricing(role)) return <AccessDenied />;

  const filtered = prices.filter(p => {
    if (filterItem && p.item_id !== filterItem) return false;
    if (filterFrom && p.effective_from < filterFrom) return false;
    if (filterTo && p.effective_from > filterTo) return false;
    return true;
  });

  function openAdd() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setDialogOpen(true);
  }

  function openEdit(price: PriceRow) {
    setEditing(price);
    setForm({
      item_id: price.item_id,
      supplier_id: price.supplier_id ?? '',
      price_per_uom: String(price.price_per_uom),
      uom_id: price.uom_id ?? '',
      effective_from: price.effective_from,
      effective_to: price.effective_to ?? '',
      is_active: price.is_active,
      remarks: price.remarks ?? '',
    });
    setDialogOpen(true);
  }

  async function handleSave() {
    if (!form.item_id || !form.price_per_uom || !form.effective_from) {
      toast.error('Item, price, and effective from date are required.');
      return;
    }
    setSaving(true);
    const supabase = createClient();
    const payload = {
      item_id: form.item_id,
      supplier_id: form.supplier_id || null,
      price_per_uom: parseFloat(form.price_per_uom),
      uom_id: form.uom_id || null,
      effective_from: form.effective_from,
      effective_to: form.effective_to || null,
      is_active: form.is_active,
      remarks: form.remarks || null,
    };

    if (!editing) {
      // expire previous active price for same item
      if (form.is_active) {
        await supabase.from('raw_material_prices')
          .update({ is_active: false, effective_to: form.effective_from })
          .eq('item_id', form.item_id)
          .eq('is_active', true)
          .is('effective_to', null);
      }
      const { error } = await supabase.from('raw_material_prices').insert({ ...payload, created_by: userId });
      if (error) { toast.error(error.message); setSaving(false); return; }
      toast.success('Price added.');
    } else {
      const { error } = await supabase.from('raw_material_prices').update(payload).eq('id', editing.id);
      if (error) { toast.error(error.message); setSaving(false); return; }
      toast.success('Price updated.');
    }
    setSaving(false);
    setDialogOpen(false);
    loadData();
  }

  async function handleDelete(price: PriceRow) {
    const supabase = createClient();
    const { error } = await supabase.from('raw_material_prices').delete().eq('id', price.id);
    if (error) toast.error(error.message);
    else { toast.success('Price entry deleted.'); loadData(); }
  }

  async function handleApprove(price: PriceRow) {
    const supabase = createClient();
    const { error } = await supabase.from('raw_material_prices').update({ approved_by: userId }).eq('id', price.id);
    if (error) toast.error(error.message);
    else { toast.success('Price approved.'); loadData(); }
  }

  return (
    <div className="p-6">
      <PageHeader
        title="Raw Material Prices"
        description="Manage effective prices for raw and packing materials"
        breadcrumbs={[{ label: 'Pricing' }, { label: 'Raw Material Prices' }]}
        actions={<Button onClick={openAdd}><Plus className="w-4 h-4 mr-1" />Add Price</Button>}
      />

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-4">
        <Select value={filterItem} onValueChange={setFilterItem}>
          <SelectTrigger className="w-52"><SelectValue placeholder="Filter by item" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="">All Items</SelectItem>
            {items.map(i => <SelectItem key={i.id} value={i.id}>{i.item_name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Input type="date" className="w-40" value={filterFrom} onChange={e => setFilterFrom(e.target.value)} placeholder="From" />
        <Input type="date" className="w-40" value={filterTo} onChange={e => setFilterTo(e.target.value)} placeholder="To" />
        {(filterItem || filterFrom || filterTo) && (
          <Button variant="ghost" size="sm" onClick={() => { setFilterItem(''); setFilterFrom(''); setFilterTo(''); }}>Clear</Button>
        )}
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-400">Loading...</div>
      ) : filtered.length === 0 ? (
        <EmptyState title="No prices found" description="Add the first raw material price." action={<Button onClick={openAdd}><Plus className="w-4 h-4 mr-1" />Add Price</Button>} />
      ) : (
        <div className="rounded-lg border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Item Name</TableHead>
                <TableHead>Supplier</TableHead>
                <TableHead>Price/UOM</TableHead>
                <TableHead>UOM</TableHead>
                <TableHead>Effective From</TableHead>
                <TableHead>Effective To</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Approved By</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map(price => (
                <TableRow key={price.id}>
                  <TableCell className="font-medium">{price.item?.item_name ?? '—'}</TableCell>
                  <TableCell>{price.supplier?.name ?? '—'}</TableCell>
                  <TableCell>{formatCurrency(price.price_per_uom)}</TableCell>
                  <TableCell>{price.uom?.abbreviation ?? '—'}</TableCell>
                  <TableCell>{formatDate(price.effective_from)}</TableCell>
                  <TableCell>{price.effective_to ? formatDate(price.effective_to) : '—'}</TableCell>
                  <TableCell>
                    {price.is_active
                      ? <Badge className="bg-green-100 text-green-800">Active</Badge>
                      : <Badge variant="secondary">Inactive</Badge>}
                  </TableCell>
                  <TableCell>{(price as any).approved_by ? 'Approved' : '—'}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      {!(price as any).approved_by && (
                        <Button size="sm" variant="outline" onClick={() => handleApprove(price)}>
                          <CheckCircle className="w-4 h-4 mr-1" />Approve
                        </Button>
                      )}
                      <Button size="sm" variant="ghost" onClick={() => openEdit(price)}>
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button size="sm" variant="ghost" className="text-gray-400 hover:text-red-500" onClick={() => setDeleteTarget(price)}>
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit Price' : 'Add Raw Material Price'}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-1.5">
              <Label>Item *</Label>
              <Select value={form.item_id} onValueChange={v => setForm(f => ({ ...f, item_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Select item" /></SelectTrigger>
                <SelectContent>
                  {items.map(i => <SelectItem key={i.id} value={i.id}>{i.item_name} ({i.item_type === 'raw_material' ? 'RM' : 'PM'})</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label>Supplier</Label>
              <Select value={form.supplier_id} onValueChange={v => setForm(f => ({ ...f, supplier_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Select supplier (optional)" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="">No Supplier</SelectItem>
                  {suppliers.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-1.5">
                <Label>Price per UOM *</Label>
                <Input type="number" step="0.01" value={form.price_per_uom} onChange={e => setForm(f => ({ ...f, price_per_uom: e.target.value }))} placeholder="0.00" />
              </div>
              <div className="grid gap-1.5">
                <Label>UOM</Label>
                <Select value={form.uom_id} onValueChange={v => setForm(f => ({ ...f, uom_id: v }))}>
                  <SelectTrigger><SelectValue placeholder="UOM" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">—</SelectItem>
                    {uoms.map(u => <SelectItem key={u.id} value={u.id}>{u.abbreviation}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-1.5">
                <Label>Effective From *</Label>
                <Input type="date" value={form.effective_from} onChange={e => setForm(f => ({ ...f, effective_from: e.target.value }))} />
              </div>
              <div className="grid gap-1.5">
                <Label>Effective To</Label>
                <Input type="date" value={form.effective_to} onChange={e => setForm(f => ({ ...f, effective_to: e.target.value }))} />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={form.is_active} onCheckedChange={v => setForm(f => ({ ...f, is_active: v }))} />
              <Label>Active Price</Label>
            </div>
            <div className="grid gap-1.5">
              <Label>Remarks</Label>
              <Textarea value={form.remarks} onChange={e => setForm(f => ({ ...f, remarks: e.target.value }))} rows={2} placeholder="Optional notes..." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>{saving ? 'Saving...' : 'Save'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={open => { if (!open) setDeleteTarget(null); }}
        title="Delete Price Entry?"
        description={`The price entry for "${deleteTarget?.item?.item_name ?? 'this item'}" will be permanently deleted. The raw material itself is not removed.`}
        confirmLabel="Delete"
        onConfirm={() => { if (deleteTarget) handleDelete(deleteTarget); setDeleteTarget(null); }}
      />
    </div>
  );
}
