'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Plus, Pencil, Trash2, Loader2, Package, Search, X } from 'lucide-react';
import { toast } from 'sonner';

import { createClient } from '@/lib/supabase/client';
import type { Item, ItemGroup, UOM, UserRole } from '@/types';
import { itemTypeLabel, formatNumber } from '@/lib/utils';
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

const ITEM_TYPES = ['raw_material', 'packing_material', 'finished_goods', 'service'] as const;

const schema = z.object({
  item_name: z.string().min(1, 'Item name is required').max(200),
  item_group_id: z.string().nullable().optional(),
  uom_id: z.string().nullable().optional(),
  item_type: z.enum(ITEM_TYPES),
  weight_kg: z.coerce.number().nonnegative('Weight must be 0 or more').nullable().optional(),
  description: z.string().max(500).nullable().optional(),
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

const ITEM_TYPE_COLOR: Record<string, string> = {
  raw_material: 'bg-blue-100 text-blue-800',
  packing_material: 'bg-purple-100 text-purple-800',
  finished_goods: 'bg-green-100 text-green-800',
  service: 'bg-orange-100 text-orange-800',
};

export default function ItemsPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [groups, setGroups] = useState<ItemGroup[]>([]);
  const [uoms, setUoms] = useState<UOM[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Item | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Item | null>(null);
  const [saving, setSaving] = useState(false);
  const role = useRole();
  const isAdmin = role === 'admin';

  // ── Filters (#3) ──
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState<string>('all');
  const [filterGroup, setFilterGroup] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');

  const { register, handleSubmit, reset, setValue, watch, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { item_name: '', item_group_id: null, uom_id: null, item_type: 'raw_material', weight_kg: null, description: '', is_active: true },
  });

  const fetchAll = useCallback(async () => {
    setLoading(true);
    const supabase = createClient();
    const [itemsRes, groupsRes, uomsRes] = await Promise.all([
      supabase.from('items').select('*, item_group:item_groups(id,name), uom:uoms(id,name,abbreviation)').order('item_name'),
      supabase.from('item_groups').select('*').eq('is_active', true).order('name'),
      supabase.from('uoms').select('*').eq('is_active', true).order('name'),
    ]);
    if (itemsRes.error) toast.error('Failed to load items');
    else setItems(itemsRes.data ?? []);
    setGroups(groupsRes.data ?? []);
    setUoms(uomsRes.data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const filtered = useMemo(() => {
    return items.filter(item => {
      if (search && !item.item_name.toLowerCase().includes(search.toLowerCase())) return false;
      if (filterType !== 'all' && item.item_type !== filterType) return false;
      if (filterGroup !== 'all' && item.item_group_id !== filterGroup) return false;
      if (filterStatus === 'active' && !item.is_active) return false;
      if (filterStatus === 'inactive' && item.is_active) return false;
      return true;
    });
  }, [items, search, filterType, filterGroup, filterStatus]);

  const hasFilters = search || filterType !== 'all' || filterGroup !== 'all' || filterStatus !== 'all';
  function clearFilters() {
    setSearch(''); setFilterType('all'); setFilterGroup('all'); setFilterStatus('all');
  }

  function openAdd() {
    setEditing(null);
    reset({ item_name: '', item_group_id: null, uom_id: null, item_type: 'raw_material', weight_kg: null, description: '', is_active: true });
    setDialogOpen(true);
  }

  function openEdit(item: Item) {
    setEditing(item);
    reset({
      item_name: item.item_name,
      item_group_id: item.item_group_id ?? null,
      uom_id: item.uom_id ?? null,
      item_type: item.item_type,
      weight_kg: item.weight_kg ?? null,
      description: item.description ?? '',
      is_active: item.is_active,
    });
    setDialogOpen(true);
  }

  async function onSubmit(values: FormValues) {
    setSaving(true);
    const supabase = createClient();
    const payload = {
      item_name: values.item_name,
      item_type: values.item_type,
      description: values.description || null,
      is_active: values.is_active,
      item_group_id: values.item_group_id || null,
      uom_id: values.uom_id || null,
      weight_kg: values.weight_kg === undefined || values.weight_kg === null || Number.isNaN(values.weight_kg) ? null : values.weight_kg,
    };
    try {
      if (editing) {
        const { error } = await supabase.from('items').update(payload).eq('id', editing.id);
        if (error) throw error;
        toast.success('Item updated');
      } else {
        const { error } = await supabase.from('items').insert(payload);
        if (error) throw error;
        toast.success('Item created');
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
    const { error } = await supabase.from('items').delete().eq('id', deleteTarget.id);
    if (error) toast.error(error.message);
    else { toast.success('Item deleted'); fetchAll(); }
    setDeleteTarget(null);
  }

  return (
    <div>
      <PageHeader
        title="Items"
        description="Manage raw materials, packing materials, finished goods and services."
        breadcrumbs={[{ label: 'Masters' }, { label: 'Items' }]}
        actions={isAdmin ? <Button size="sm" onClick={openAdd}><Plus className="w-4 h-4 mr-1" />Add Item</Button> : undefined}
      />

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-2 mb-4">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name..." className="pl-9" />
        </div>
        <Select value={filterType} onValueChange={setFilterType}>
          <SelectTrigger className="w-full sm:w-44"><SelectValue placeholder="Type" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            {ITEM_TYPES.map(t => <SelectItem key={t} value={t}>{itemTypeLabel(t)}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterGroup} onValueChange={setFilterGroup}>
          <SelectTrigger className="w-full sm:w-44"><SelectValue placeholder="Group" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Groups</SelectItem>
            {groups.map(g => <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-full sm:w-36"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
          </SelectContent>
        </Select>
        {hasFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters} className="shrink-0">
            <X className="w-4 h-4 mr-1" />Clear
          </Button>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>
      ) : items.length === 0 ? (
        <EmptyState icon={Package} title="No items" description="Create your first item." action={isAdmin ? <Button size="sm" onClick={openAdd}><Plus className="w-4 h-4 mr-1" />Add Item</Button> : undefined} />
      ) : (
        <div className="rounded-lg border bg-white overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Item Name</TableHead>
                <TableHead>Group</TableHead>
                <TableHead>UOM</TableHead>
                <TableHead className="text-right">Weight (Kg)</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Status</TableHead>
                {isAdmin && <TableHead className="w-24 text-right">Actions</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map(item => (
                <TableRow key={item.id}>
                  <TableCell className="font-medium">{item.item_name}</TableCell>
                  <TableCell className="text-gray-500 text-sm">{item.item_group?.name ?? '—'}</TableCell>
                  <TableCell className="text-gray-500 text-sm">{item.uom ? `${item.uom.name} (${item.uom.abbreviation})` : '—'}</TableCell>
                  <TableCell className="text-right font-mono text-sm">{item.weight_kg != null ? formatNumber(item.weight_kg) : '—'}</TableCell>
                  <TableCell>
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${ITEM_TYPE_COLOR[item.item_type]}`}>
                      {itemTypeLabel(item.item_type)}
                    </span>
                  </TableCell>
                  <TableCell><Badge variant={item.is_active ? 'default' : 'secondary'}>{item.is_active ? 'Active' : 'Inactive'}</Badge></TableCell>
                  {isAdmin && (
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button size="icon" variant="ghost" onClick={() => openEdit(item)}><Pencil className="w-4 h-4" /></Button>
                        <Button size="icon" variant="ghost" className="text-red-500 hover:text-red-600" onClick={() => setDeleteTarget(item)}><Trash2 className="w-4 h-4" /></Button>
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              ))}
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={isAdmin ? 7 : 6} className="text-center text-gray-400 py-10">
                    No items match the current filters.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{editing ? 'Edit Item' : 'Add Item'}</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-1">
              <Label>Item Name <span className="text-red-500">*</span></Label>
              <Input {...register('item_name')} placeholder="e.g. Tile Adhesive DU250" />
              {errors.item_name && <p className="text-xs text-red-500">{errors.item_name.message}</p>}
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label>Item Type <span className="text-red-500">*</span></Label>
                <Select value={watch('item_type')} onValueChange={v => setValue('item_type', v as FormValues['item_type'])}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ITEM_TYPES.map(t => <SelectItem key={t} value={t}>{itemTypeLabel(t)}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Weight (Kg)</Label>
                <Input {...register('weight_kg')} type="number" step="0.001" min="0" placeholder="e.g. 50" />
                {errors.weight_kg && <p className="text-xs text-red-500">{errors.weight_kg.message}</p>}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label>Item Group</Label>
                <Select value={watch('item_group_id') ?? '__none__'} onValueChange={v => setValue('item_group_id', v === '__none__' ? null : v)}>
                  <SelectTrigger><SelectValue placeholder="Select group" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">None</SelectItem>
                    {groups.map(g => <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Default UOM</Label>
                <Select value={watch('uom_id') ?? '__none__'} onValueChange={v => setValue('uom_id', v === '__none__' ? null : v)}>
                  <SelectTrigger><SelectValue placeholder="Select UOM" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">None</SelectItem>
                    {uoms.map(u => <SelectItem key={u.id} value={u.id}>{u.name} ({u.abbreviation})</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1">
              <Label>Description</Label>
              <Textarea {...register('description')} rows={2} placeholder="Optional description" />
            </div>
            <div className="flex items-center gap-3">
              <Switch id="item-active" checked={watch('is_active')} onCheckedChange={v => setValue('is_active', v)} />
              <Label htmlFor="item-active">Active</Label>
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
        title="Delete Item?"
        description={`"${deleteTarget?.item_name}" will be permanently deleted. This may affect linked transactions.`}
        confirmLabel="Delete"
        onConfirm={handleDelete}
      />
    </div>
  );
}
