'use client';

import { useState, useEffect, useCallback } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Plus, Pencil, Trash2, Loader2, Warehouse } from 'lucide-react';
import { toast } from 'sonner';

import { createClient } from '@/lib/supabase/client';
import type { Godown, UserRole } from '@/types';
import { godownTypeLabel } from '@/lib/utils';
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

const GODOWN_TYPES = ['company', 'subcontractor', 'raw_material_store', 'finished_goods_store', 'production_floor'] as const;

const schema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  godown_type: z.enum(GODOWN_TYPES),
  parent_godown_id: z.string().nullable().optional(),
  address: z.string().max(500).nullable().optional(),
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

export default function GodownsPage() {
  const [godowns, setGodowns] = useState<Godown[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Godown | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Godown | null>(null);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const role = useRole();
  const isAdmin = role === 'admin';

  const q = search.trim().toLowerCase();
  const filteredGodowns = godowns.filter(g => {
    if (typeFilter && g.godown_type !== typeFilter) return false;
    if (q && !g.name.toLowerCase().includes(q)) return false;
    return true;
  });

  const { register, handleSubmit, reset, setValue, watch, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: '', godown_type: 'company', parent_godown_id: null, address: '', is_active: true },
  });

  const fetchGodowns = useCallback(async () => {
    setLoading(true);
    const supabase = createClient();
    const { data, error } = await supabase
      .from('godowns')
      .select('*')
      .order('name');
    if (error) toast.error('Failed to load godowns');
    else setGodowns(data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchGodowns(); }, [fetchGodowns]);

  function openAdd() {
    setEditing(null);
    reset({ name: '', godown_type: 'company', parent_godown_id: null, address: '', is_active: true });
    setDialogOpen(true);
  }

  function openEdit(g: Godown) {
    setEditing(g);
    reset({
      name: g.name,
      godown_type: g.godown_type,
      parent_godown_id: g.parent_godown_id ?? null,
      address: g.address ?? '',
      is_active: g.is_active,
    });
    setDialogOpen(true);
  }

  async function onSubmit(values: FormValues) {
    setSaving(true);
    const supabase = createClient();
    const payload = {
      ...values,
      parent_godown_id: values.parent_godown_id || null,
    };
    try {
      if (editing) {
        const { error } = await supabase.from('godowns').update(payload).eq('id', editing.id);
        if (error) throw error;
        toast.success('Godown updated');
      } else {
        const { error } = await supabase.from('godowns').insert(payload);
        if (error) throw error;
        toast.success('Godown created');
      }
      setDialogOpen(false);
      fetchGodowns();
    } catch (err: unknown) {
      toast.error((err as Error).message ?? 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    const supabase = createClient();
    const { error } = await supabase.from('godowns').delete().eq('id', deleteTarget.id);
    if (error) toast.error(error.message);
    else { toast.success('Godown deleted'); fetchGodowns(); }
    setDeleteTarget(null);
  }

  const parentName = (id: string | null) =>
    id ? (godowns.find(g => g.id === id)?.name ?? '—') : '—';

  const otherGodowns = godowns.filter(g => g.id !== editing?.id);

  return (
    <div>
      <PageHeader
        title="Godowns"
        description="Manage storage locations and warehouses."
        breadcrumbs={[{ label: 'Masters', href: '/masters/items' }, { label: 'Godowns' }]}
        actions={isAdmin ? <Button size="sm" onClick={openAdd}><Plus className="w-4 h-4 mr-1" />Add Godown</Button> : undefined}
      />

      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>
      ) : godowns.length === 0 ? (
        <EmptyState icon={Warehouse} title="No godowns" description="Create your first storage location." action={isAdmin ? <Button size="sm" onClick={openAdd}><Plus className="w-4 h-4 mr-1" />Add Godown</Button> : undefined} />
      ) : (
        <>
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <Input className="w-full sm:w-72" placeholder="Search godown name…" value={search} onChange={e => setSearch(e.target.value)} />
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-52"><SelectValue placeholder="All types" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="">All types</SelectItem>
              {GODOWN_TYPES.map(t => <SelectItem key={t} value={t}>{godownTypeLabel(t)}</SelectItem>)}
            </SelectContent>
          </Select>
          {(search || typeFilter) && <Button variant="ghost" size="sm" onClick={() => { setSearch(''); setTypeFilter(''); }}>Clear</Button>}
        </div>
        <div className="rounded-lg border bg-white overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Parent Godown</TableHead>
                <TableHead>Status</TableHead>
                {isAdmin && <TableHead className="w-24 text-right">Actions</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredGodowns.length === 0 && (
                <TableRow><TableCell colSpan={isAdmin ? 5 : 4} className="text-center text-gray-400 py-8">No godowns match your filters.</TableCell></TableRow>
              )}
              {filteredGodowns.map(g => (
                <TableRow key={g.id}>
                  <TableCell className="font-medium">{g.name}</TableCell>
                  <TableCell><Badge variant="outline">{godownTypeLabel(g.godown_type)}</Badge></TableCell>
                  <TableCell className="text-gray-500 text-sm">{parentName(g.parent_godown_id)}</TableCell>
                  <TableCell><Badge variant={g.is_active ? 'default' : 'secondary'}>{g.is_active ? 'Active' : 'Inactive'}</Badge></TableCell>
                  {isAdmin && (
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button size="icon" variant="ghost" onClick={() => openEdit(g)}><Pencil className="w-4 h-4" /></Button>
                        <Button size="icon" variant="ghost" className="text-red-500 hover:text-red-600" onClick={() => setDeleteTarget(g)}><Trash2 className="w-4 h-4" /></Button>
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
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{editing ? 'Edit Godown' : 'Add Godown'}</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-1">
              <Label>Name <span className="text-red-500">*</span></Label>
              <Input {...register('name')} placeholder="e.g. Main Warehouse" />
              {errors.name && <p className="text-xs text-red-500">{errors.name.message}</p>}
            </div>
            <div className="space-y-1">
              <Label>Type <span className="text-red-500">*</span></Label>
              <Select value={watch('godown_type')} onValueChange={v => setValue('godown_type', v as FormValues['godown_type'])}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {GODOWN_TYPES.map(t => <SelectItem key={t} value={t}>{godownTypeLabel(t)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Parent Godown</Label>
              <Select
                value={watch('parent_godown_id') ?? '__none__'}
                onValueChange={v => setValue('parent_godown_id', v === '__none__' ? null : v)}
              >
                <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">None</SelectItem>
                  {otherGodowns.map(g => <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Address</Label>
              <Textarea {...register('address')} rows={2} placeholder="Optional address" />
            </div>
            <div className="flex items-center gap-3">
              <Switch id="gdwn-active" checked={watch('is_active')} onCheckedChange={v => setValue('is_active', v)} />
              <Label htmlFor="gdwn-active">Active</Label>
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
        title="Delete Godown?"
        description={`"${deleteTarget?.name}" will be permanently deleted.`}
        confirmLabel="Delete"
        onConfirm={handleDelete}
      />
    </div>
  );
}
