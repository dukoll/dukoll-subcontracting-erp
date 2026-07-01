'use client';

import { useState, useEffect, useCallback } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Plus, Pencil, Trash2, Loader2, Tags } from 'lucide-react';
import { toast } from 'sonner';

import { createClient } from '@/lib/supabase/client';
import type { ItemGroup, UserRole } from '@/types';
import { PageHeader } from '@/components/shared/PageHeader';
import { EmptyState } from '@/components/shared/EmptyState';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table';

const schema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  description: z.string().max(500).optional().nullable(),
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

export default function ItemGroupsPage() {
  const [groups, setGroups] = useState<ItemGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ItemGroup | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ItemGroup | null>(null);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const role = useRole();
  const isAdmin = role === 'admin';

  const q = search.trim().toLowerCase();
  const filteredGroups = groups.filter(g =>
    !q || `${g.name} ${g.description ?? ''}`.toLowerCase().includes(q)
  );

  const { register, handleSubmit, reset, setValue, watch, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: '', description: '', is_active: true },
  });

  const fetchGroups = useCallback(async () => {
    setLoading(true);
    const supabase = createClient();
    const { data, error } = await supabase
      .from('item_groups')
      .select('*')
      .order('name');
    if (error) toast.error('Failed to load item groups');
    else setGroups(data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchGroups(); }, [fetchGroups]);

  function openAdd() {
    setEditing(null);
    reset({ name: '', description: '', is_active: true });
    setDialogOpen(true);
  }

  function openEdit(g: ItemGroup) {
    setEditing(g);
    reset({ name: g.name, description: g.description ?? '', is_active: g.is_active });
    setDialogOpen(true);
  }

  async function onSubmit(values: FormValues) {
    setSaving(true);
    const supabase = createClient();
    try {
      if (editing) {
        const { error } = await supabase.from('item_groups').update(values).eq('id', editing.id);
        if (error) throw error;
        toast.success('Item group updated');
      } else {
        const { error } = await supabase.from('item_groups').insert(values);
        if (error) throw error;
        toast.success('Item group created');
      }
      setDialogOpen(false);
      fetchGroups();
    } catch (err: unknown) {
      toast.error((err as Error).message ?? 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    const supabase = createClient();
    const { error } = await supabase.from('item_groups').delete().eq('id', deleteTarget.id);
    if (error) toast.error(error.message);
    else { toast.success('Item group deleted'); fetchGroups(); }
    setDeleteTarget(null);
  }

  return (
    <div>
      <PageHeader
        title="Item Groups"
        description="Organise items into logical categories."
        breadcrumbs={[{ label: 'Masters', href: '/masters/items' }, { label: 'Item Groups' }]}
        actions={isAdmin ? <Button size="sm" onClick={openAdd}><Plus className="w-4 h-4 mr-1" />Add Group</Button> : undefined}
      />

      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>
      ) : groups.length === 0 ? (
        <EmptyState icon={Tags} title="No item groups" description="Create your first item group." action={isAdmin ? <Button size="sm" onClick={openAdd}><Plus className="w-4 h-4 mr-1" />Add Group</Button> : undefined} />
      ) : (
        <>
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <Input className="w-full sm:w-72" placeholder="Search name or description…" value={search} onChange={e => setSearch(e.target.value)} />
          {search && <Button variant="ghost" size="sm" onClick={() => setSearch('')}>Clear</Button>}
        </div>
        <div className="rounded-lg border bg-white overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Status</TableHead>
                {isAdmin && <TableHead className="w-24 text-right">Actions</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredGroups.length === 0 && (
                <TableRow><TableCell colSpan={isAdmin ? 4 : 3} className="text-center text-gray-400 py-8">No item groups match your search.</TableCell></TableRow>
              )}
              {filteredGroups.map(g => (
                <TableRow key={g.id}>
                  <TableCell className="font-medium">{g.name}</TableCell>
                  <TableCell className="text-gray-500 text-sm">{g.description ?? '—'}</TableCell>
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

      {/* Add / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{editing ? 'Edit Item Group' : 'Add Item Group'}</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-1">
              <Label>Name <span className="text-red-500">*</span></Label>
              <Input {...register('name')} placeholder="e.g. Packaging" />
              {errors.name && <p className="text-xs text-red-500">{errors.name.message}</p>}
            </div>
            <div className="space-y-1">
              <Label>Description</Label>
              <Textarea {...register('description')} rows={2} placeholder="Optional description" />
            </div>
            <div className="flex items-center gap-3">
              <Switch id="ig-active" checked={watch('is_active')} onCheckedChange={v => setValue('is_active', v)} />
              <Label htmlFor="ig-active">Active</Label>
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
        title="Delete Item Group?"
        description={`"${deleteTarget?.name}" will be permanently deleted. Items linked to this group may be affected.`}
        confirmLabel="Delete"
        onConfirm={handleDelete}
      />
    </div>
  );
}
