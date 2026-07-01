'use client';

import { useState, useEffect, useCallback } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Plus, Pencil, Trash2, Loader2, Truck } from 'lucide-react';
import { toast } from 'sonner';

import { createClient } from '@/lib/supabase/client';
import type { Supplier, Godown, UserRole } from '@/types';
import { PageHeader } from '@/components/shared/PageHeader';
import { EmptyState } from '@/components/shared/EmptyState';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table';

const schema = z.object({
  name: z.string().min(1, 'Name is required').max(200),
  phone: z.string().max(20).nullable().optional(),
  email: z.string().email('Invalid email').nullable().optional().or(z.literal('')),
  address: z.string().max(500).nullable().optional(),
  gst_no: z.string().max(20).nullable().optional(),
  is_subcontractor: z.boolean(),
  default_godown_id: z.string().nullable().optional(),
  is_active: z.boolean(),
});
type FormValues = z.infer<typeof schema>;

function useRole() {
  const [role, setRole] = useState<UserRole | null>(null);
  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return;
      const { data } = await supabase.from('profiles').select('role').eq('id', user.id).single();
      if (data) setRole(data.role as UserRole);
    });
  }, []);
  return role;
}

export default function SuppliersPage() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [godowns, setGodowns] = useState<Godown[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Supplier | null>(null);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const role = useRole();
  const isAdmin = role === 'admin';

  const q = search.trim().toLowerCase();
  const filteredSuppliers = suppliers.filter(s => {
    if (typeFilter === 'subcontractor' && !s.is_subcontractor) return false;
    if (typeFilter === 'supplier' && s.is_subcontractor) return false;
    if (q && !(`${s.name} ${s.phone ?? ''} ${s.email ?? ''} ${s.gst_no ?? ''}`.toLowerCase().includes(q))) return false;
    return true;
  });

  const { register, handleSubmit, reset, setValue, watch, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: '', phone: '', email: '', address: '', gst_no: '', is_subcontractor: false, default_godown_id: null, is_active: true },
  });
  const isSubcontractor = watch('is_subcontractor');

  const fetchAll = useCallback(async () => {
    setLoading(true);
    const supabase = createClient();
    const [supRes, gdwnRes] = await Promise.all([
      supabase.from('suppliers').select('*, default_godown:godowns(id,name)').order('name'),
      supabase.from('godowns').select('id,name').eq('is_active', true).order('name'),
    ]);
    if (supRes.error) toast.error('Failed to load suppliers');
    else setSuppliers(supRes.data ?? []);
    setGodowns((gdwnRes.data ?? []) as Godown[]);
    setLoading(false);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  function openAdd() {
    setEditing(null);
    reset({ name: '', phone: '', email: '', address: '', gst_no: '', is_subcontractor: false, default_godown_id: null, is_active: true });
    setDialogOpen(true);
  }

  function openEdit(s: Supplier) {
    setEditing(s);
    reset({
      name: s.name,
      phone: s.phone ?? '',
      email: s.email ?? '',
      address: s.address ?? '',
      gst_no: s.gst_no ?? '',
      is_subcontractor: s.is_subcontractor,
      default_godown_id: s.default_godown_id ?? null,
      is_active: s.is_active,
    });
    setDialogOpen(true);
  }

  async function onSubmit(values: FormValues) {
    setSaving(true);
    const supabase = createClient();
    const payload = {
      name: values.name,
      is_subcontractor: values.is_subcontractor,
      is_active: values.is_active,
      phone: values.phone || null,
      email: values.email || null,
      address: values.address || null,
      gst_no: values.gst_no || null,
      default_godown_id: values.is_subcontractor ? (values.default_godown_id || null) : null,
    };
    try {
      if (editing) {
        const { error } = await supabase.from('suppliers').update(payload).eq('id', editing.id);
        if (error) throw error;
        toast.success('Supplier updated');
      } else {
        const { error } = await supabase.from('suppliers').insert(payload);
        if (error) throw error;
        toast.success('Supplier created');
      }
      setDialogOpen(false);
      fetchAll();
    } catch (err: unknown) {
      toast.error((err as Error).message ?? 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    const supabase = createClient();
    const { error } = await supabase.from('suppliers').delete().eq('id', deleteTarget.id);
    if (error) toast.error(error.message);
    else { toast.success('Supplier deleted'); fetchAll(); }
    setDeleteTarget(null);
  }

  return (
    <div>
      <PageHeader
        title="Suppliers"
        description="Manage suppliers and subcontractors."
        breadcrumbs={[{ label: 'Masters', href: '/masters/items' }, { label: 'Suppliers' }]}
        actions={isAdmin ? <Button size="sm" onClick={openAdd}><Plus className="w-4 h-4 mr-1" />Add Supplier</Button> : undefined}
      />

      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>
      ) : suppliers.length === 0 ? (
        <EmptyState icon={Truck} title="No suppliers" description="Add your first supplier." action={isAdmin ? <Button size="sm" onClick={openAdd}><Plus className="w-4 h-4 mr-1" />Add Supplier</Button> : undefined} />
      ) : (
        <>
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <Input className="w-full sm:w-72" placeholder="Search name, phone, email or GST…" value={search} onChange={e => setSearch(e.target.value)} />
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-44"><SelectValue placeholder="All types" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="">All types</SelectItem>
              <SelectItem value="supplier">Supplier</SelectItem>
              <SelectItem value="subcontractor">Subcontractor</SelectItem>
            </SelectContent>
          </Select>
          {(search || typeFilter) && <Button variant="ghost" size="sm" onClick={() => { setSearch(''); setTypeFilter(''); }}>Clear</Button>}
        </div>
        <div className="rounded-lg border bg-white overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Default Godown</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Status</TableHead>
                {isAdmin && <TableHead className="w-24 text-right">Actions</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredSuppliers.length === 0 && (
                <TableRow><TableCell colSpan={isAdmin ? 7 : 6} className="text-center text-gray-400 py-8">No suppliers match your filters.</TableCell></TableRow>
              )}
              {filteredSuppliers.map(s => (
                <TableRow key={s.id}>
                  <TableCell className="font-medium">{s.name}</TableCell>
                  <TableCell className="text-gray-500 text-sm">{s.phone ?? '—'}</TableCell>
                  <TableCell className="text-gray-500 text-sm">{s.email ?? '—'}</TableCell>
                  <TableCell className="text-gray-500 text-sm">{s.default_godown?.name ?? '—'}</TableCell>
                  <TableCell>
                    <Badge variant={s.is_subcontractor ? 'default' : 'outline'}>
                      {s.is_subcontractor ? 'Subcontractor' : 'Supplier'}
                    </Badge>
                  </TableCell>
                  <TableCell><Badge variant={s.is_active ? 'default' : 'secondary'}>{s.is_active ? 'Active' : 'Inactive'}</Badge></TableCell>
                  {isAdmin && (
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button size="icon" variant="ghost" onClick={() => openEdit(s)}><Pencil className="w-4 h-4" /></Button>
                        <Button size="icon" variant="ghost" className="text-red-500 hover:text-red-600" onClick={() => setDeleteTarget(s)}><Trash2 className="w-4 h-4" /></Button>
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        </>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{editing ? 'Edit Supplier' : 'Add Supplier'}</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2 space-y-1">
                <Label>Name <span className="text-red-500">*</span></Label>
                <Input {...register('name')} placeholder="Supplier company name" />
                {errors.name && <p className="text-xs text-red-500">{errors.name.message}</p>}
              </div>
              <div className="space-y-1">
                <Label>GST No</Label>
                <Input {...register('gst_no')} placeholder="e.g. 24AAAAA0000A1Z5" />
              </div>
              <div className="space-y-1">
                <Label>Phone</Label>
                <Input {...register('phone')} placeholder="+91 XXXXX XXXXX" />
              </div>
              <div className="col-span-2 space-y-1">
                <Label>Email</Label>
                <Input {...register('email')} type="email" placeholder="contact@supplier.com" />
                {errors.email && <p className="text-xs text-red-500">{errors.email.message}</p>}
              </div>
            </div>
            <div className="space-y-1">
              <Label>Address</Label>
              <Textarea {...register('address')} rows={2} placeholder="Full address" />
            </div>
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-3">
                <Switch id="sup-subcontractor" checked={watch('is_subcontractor')} onCheckedChange={v => setValue('is_subcontractor', v)} />
                <Label htmlFor="sup-subcontractor">Is Subcontractor</Label>
              </div>
              <div className="flex items-center gap-3">
                <Switch id="sup-active" checked={watch('is_active')} onCheckedChange={v => setValue('is_active', v)} />
                <Label htmlFor="sup-active">Active</Label>
              </div>
            </div>
            {isSubcontractor && (
              <div className="space-y-1 rounded-lg bg-blue-50/60 border border-blue-100 p-3">
                <Label>Default Godown</Label>
                <Select value={watch('default_godown_id') ?? '__none__'} onValueChange={v => setValue('default_godown_id', v === '__none__' ? null : v)}>
                  <SelectTrigger><SelectValue placeholder="Select this subcontractor's godown" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">None</SelectItem>
                    {godowns.map(g => <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>)}
                  </SelectContent>
                </Select>
                <p className="text-xs text-gray-500">Auto-selected wherever this subcontractor is chosen (e.g. production vouchers).</p>
              </div>
            )}
            <DialogFooter className="gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={saving}>
                {saving && <Loader2 className="w-4 h-4 animate-spin mr-1" />}
                {editing ? 'Save Changes' : 'Create'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={open => { if (!open) setDeleteTarget(null); }}
        title="Delete Supplier?"
        description={`"${deleteTarget?.name}" will be permanently deleted.`}
        confirmLabel="Delete"
        onConfirm={handleDelete}
      />
    </div>
  );
}
