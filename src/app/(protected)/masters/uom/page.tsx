'use client';

import { useState, useEffect, useCallback } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Plus, Pencil, Trash2, Loader2, Ruler } from 'lucide-react';
import { toast } from 'sonner';

import { createClient } from '@/lib/supabase/client';
import type { UOM, UserRole } from '@/types';
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
  name: z.string().min(1, 'Name is required').max(100),
  abbreviation: z.string().min(1, 'Abbreviation is required').max(20),
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

export default function UOMPage() {
  const [uoms, setUoms] = useState<UOM[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<UOM | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<UOM | null>(null);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const role = useRole();
  const isAdmin = role === 'admin';

  const q = search.trim().toLowerCase();
  const filteredUoms = uoms.filter(u =>
    !q || `${u.name} ${u.abbreviation}`.toLowerCase().includes(q)
  );

  const { register, handleSubmit, reset, setValue, watch, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: '', abbreviation: '', is_active: true },
  });

  const fetchUoms = useCallback(async () => {
    setLoading(true);
    const supabase = createClient();
    const { data, error } = await supabase.from('uoms').select('*').order('name');
    if (error) toast.error('Failed to load UOMs');
    else setUoms(data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchUoms(); }, [fetchUoms]);

  function openAdd() {
    setEditing(null);
    reset({ name: '', abbreviation: '', is_active: true });
    setDialogOpen(true);
  }

  function openEdit(u: UOM) {
    setEditing(u);
    reset({ name: u.name, abbreviation: u.abbreviation, is_active: u.is_active });
    setDialogOpen(true);
  }

  async function onSubmit(values: FormValues) {
    setSaving(true);
    const supabase = createClient();
    try {
      if (editing) {
        const { error } = await supabase.from('uoms').update(values).eq('id', editing.id);
        if (error) throw error;
        toast.success('UOM updated');
      } else {
        const { error } = await supabase.from('uoms').insert(values);
        if (error) throw error;
        toast.success('UOM created');
      }
      setDialogOpen(false);
      fetchUoms();
    } catch (err: unknown) {
      toast.error((err as Error).message ?? 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    const supabase = createClient();
    const { error } = await supabase.from('uoms').delete().eq('id', deleteTarget.id);
    if (error) toast.error(error.message);
    else { toast.success('UOM deleted'); fetchUoms(); }
    setDeleteTarget(null);
  }

  return (
    <div>
      <PageHeader
        title="Units of Measure"
        description="Define measurement units used across items and transactions."
        breadcrumbs={[{ label: 'Masters', href: '/masters/items' }, { label: 'UOM' }]}
        actions={isAdmin ? <Button size="sm" onClick={openAdd}><Plus className="w-4 h-4 mr-1" />Add UOM</Button> : undefined}
      />

      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>
      ) : uoms.length === 0 ? (
        <EmptyState icon={Ruler} title="No units of measure" description="Add your first UOM." action={isAdmin ? <Button size="sm" onClick={openAdd}><Plus className="w-4 h-4 mr-1" />Add UOM</Button> : undefined} />
      ) : (
        <>
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <Input className="w-full sm:w-72" placeholder="Search name or abbreviation…" value={search} onChange={e => setSearch(e.target.value)} />
          {search && <Button variant="ghost" size="sm" onClick={() => setSearch('')}>Clear</Button>}
        </div>
        <CustomizableTable
          storageKey="uom"
          rows={filteredUoms}
          rowKey={u => u.id}
          empty="No units match your search."
          columns={[
            { id: 'name', header: 'Name', className: 'font-medium', cell: u => u.name },
            { id: 'abbr', header: 'Abbreviation', cell: u => <span className="font-mono text-sm bg-gray-100 px-2 py-0.5 rounded">{u.abbreviation}</span> },
            { id: 'status', header: 'Status', cell: u => <Badge variant={u.is_active ? 'default' : 'secondary'}>{u.is_active ? 'Active' : 'Inactive'}</Badge> },
            ...(isAdmin ? [{ id: 'actions', header: 'Actions', alwaysVisible: true, className: 'w-24 text-right', cell: (u: UOM) => (
              <div className="flex justify-end gap-1">
                <Button size="icon" variant="ghost" onClick={() => openEdit(u)}><Pencil className="w-4 h-4" /></Button>
                <Button size="icon" variant="ghost" className="text-red-500 hover:text-red-600" onClick={() => setDeleteTarget(u)}><Trash2 className="w-4 h-4" /></Button>
              </div>
            ) }] : []),
          ] as TableColumn<UOM>[]}
        />
        </>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>{editing ? 'Edit UOM' : 'Add UOM'}</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-1">
              <Label>Name <span className="text-red-500">*</span></Label>
              <Input {...register('name')} placeholder="e.g. Kilogram" />
              {errors.name && <p className="text-xs text-red-500">{errors.name.message}</p>}
            </div>
            <div className="space-y-1">
              <Label>Abbreviation <span className="text-red-500">*</span></Label>
              <Input {...register('abbreviation')} placeholder="e.g. KG" />
              {errors.abbreviation && <p className="text-xs text-red-500">{errors.abbreviation.message}</p>}
            </div>
            <div className="flex items-center gap-3">
              <Switch id="uom-active" checked={watch('is_active')} onCheckedChange={v => setValue('is_active', v)} />
              <Label htmlFor="uom-active">Active</Label>
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
        title="Delete UOM?"
        description={`"${deleteTarget?.name}" will be permanently deleted.`}
        confirmLabel="Delete"
        onConfirm={handleDelete}
      />
    </div>
  );
}
