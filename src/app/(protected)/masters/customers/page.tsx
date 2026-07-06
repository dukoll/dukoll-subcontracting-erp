'use client';

import { useState, useEffect, useCallback } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Plus, Pencil, Trash2, Loader2, Users } from 'lucide-react';
import { toast } from 'sonner';

import { createClient } from '@/lib/supabase/client';
import type { Customer, UserRole } from '@/types';
import { PageHeader } from '@/components/shared/PageHeader';
import { EmptyState } from '@/components/shared/EmptyState';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { CustomizableTable, type TableColumn } from '@/components/shared/CustomizableTable';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table';

const schema = z.object({
  name: z.string().min(1, 'Name is required').max(200),
  phone: z.string().max(20).nullable().optional(),
  email: z.string().email('Invalid email').nullable().optional().or(z.literal('')),
  city: z.string().max(120).nullable().optional(),
  gst_no: z.string().max(20).nullable().optional(),
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

export default function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Customer | null>(null);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const role = useRole();
  const isAdmin = role === 'admin';

  const q = search.trim().toLowerCase();
  const filteredCustomers = customers.filter(c =>
    !q || `${c.name} ${c.city ?? ''} ${c.phone ?? ''} ${c.gst_no ?? ''}`.toLowerCase().includes(q)
  );

  const { register, handleSubmit, reset, setValue, watch, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: '', phone: '', email: '', city: '', gst_no: '', is_active: true },
  });

  const fetchCustomers = useCallback(async () => {
    setLoading(true);
    const supabase = createClient();
    const { data, error } = await supabase.from('customers').select('*').order('name');
    if (error) toast.error('Failed to load customers');
    else setCustomers(data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchCustomers(); }, [fetchCustomers]);

  function openAdd() {
    setEditing(null);
    reset({ name: '', phone: '', email: '', city: '', gst_no: '', is_active: true });
    setDialogOpen(true);
  }

  function openEdit(c: Customer) {
    setEditing(c);
    reset({
      name: c.name,
      phone: c.phone ?? '',
      email: c.email ?? '',
      city: c.city ?? '',
      gst_no: c.gst_no ?? '',
      is_active: c.is_active,
    });
    setDialogOpen(true);
  }

  async function onSubmit(values: FormValues) {
    setSaving(true);
    const supabase = createClient();
    const payload = {
      name: values.name,
      is_active: values.is_active,
      phone: values.phone || null,
      email: values.email || null,
      city: values.city || null,
      gst_no: values.gst_no || null,
    };
    try {
      if (editing) {
        const { error } = await supabase.from('customers').update(payload).eq('id', editing.id);
        if (error) throw error;
        toast.success('Customer updated');
      } else {
        const { error } = await supabase.from('customers').insert(payload);
        if (error) throw error;
        toast.success('Customer created');
      }
      setDialogOpen(false);
      fetchCustomers();
    } catch (err: unknown) {
      toast.error((err as Error).message ?? 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    const supabase = createClient();
    const { error } = await supabase.from('customers').delete().eq('id', deleteTarget.id);
    if (error) toast.error(error.message);
    else { toast.success('Customer deleted'); fetchCustomers(); }
    setDeleteTarget(null);
  }

  return (
    <div>
      <PageHeader
        title="Customers"
        description="Manage your customer accounts."
        breadcrumbs={[{ label: 'Masters', href: '/masters/items' }, { label: 'Customers' }]}
        actions={isAdmin ? <Button size="sm" onClick={openAdd}><Plus className="w-4 h-4 mr-1" />Add Customer</Button> : undefined}
      />

      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>
      ) : customers.length === 0 ? (
        <EmptyState icon={Users} title="No customers" description="Add your first customer." action={isAdmin ? <Button size="sm" onClick={openAdd}><Plus className="w-4 h-4 mr-1" />Add Customer</Button> : undefined} />
      ) : (
        <>
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <Input className="w-full sm:w-72" placeholder="Search name, city, phone or GST…" value={search} onChange={e => setSearch(e.target.value)} />
          {search && <Button variant="ghost" size="sm" onClick={() => setSearch('')}>Clear</Button>}
        </div>
        <CustomizableTable
          storageKey="customers"
          rows={filteredCustomers}
          rowKey={c => c.id}
          empty="No customers match your search."
          columns={[
            { id: 'name', header: 'Name', className: 'font-medium', cell: c => c.name },
            { id: 'city', header: 'City', className: 'text-gray-500 text-sm', cell: c => c.city ?? '—' },
            { id: 'phone', header: 'Phone', className: 'text-gray-500 text-sm', cell: c => c.phone ?? '—' },
            { id: 'email', header: 'Email', defaultHidden: true, className: 'text-gray-500 text-sm', cell: c => c.email ?? '—' },
            { id: 'gst', header: 'GST No', className: 'text-gray-500 text-sm font-mono', cell: c => c.gst_no ?? '—' },
            { id: 'status', header: 'Status', cell: c => <Badge variant={c.is_active ? 'default' : 'secondary'}>{c.is_active ? 'Active' : 'Inactive'}</Badge> },
            ...(isAdmin ? [{ id: 'actions', header: 'Actions', alwaysVisible: true, className: 'w-24 text-right', cell: (c: Customer) => (
              <div className="flex justify-end gap-1">
                <Button size="icon" variant="ghost" onClick={() => openEdit(c)}><Pencil className="w-4 h-4" /></Button>
                <Button size="icon" variant="ghost" className="text-red-500 hover:text-red-600" onClick={() => setDeleteTarget(c)}><Trash2 className="w-4 h-4" /></Button>
              </div>
            ) }] : []),
          ] as TableColumn<Customer>[]}
        />
        </>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{editing ? 'Edit Customer' : 'Add Customer'}</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2 space-y-1">
                <Label>Name <span className="text-red-500">*</span></Label>
                <Input {...register('name')} placeholder="Customer company name" />
                {errors.name && <p className="text-xs text-red-500">{errors.name.message}</p>}
              </div>
              <div className="space-y-1">
                <Label>City</Label>
                <Input {...register('city')} placeholder="e.g. Ahmedabad" />
              </div>
              <div className="space-y-1">
                <Label>GST No</Label>
                <Input {...register('gst_no')} placeholder="e.g. 24AAAAA0000A1Z5" />
              </div>
              <div className="space-y-1">
                <Label>Phone</Label>
                <Input {...register('phone')} placeholder="+91 XXXXX XXXXX" />
              </div>
              <div className="space-y-1">
                <Label>Email</Label>
                <Input {...register('email')} type="email" placeholder="contact@customer.com" />
                {errors.email && <p className="text-xs text-red-500">{errors.email.message}</p>}
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Switch id="cust-active" checked={watch('is_active')} onCheckedChange={v => setValue('is_active', v)} />
              <Label htmlFor="cust-active">Active</Label>
            </div>
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
        title="Delete Customer?"
        description={`"${deleteTarget?.name}" will be permanently deleted.`}
        confirmLabel="Delete"
        onConfirm={handleDelete}
      />
    </div>
  );
}
