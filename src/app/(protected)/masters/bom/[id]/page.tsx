'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Pencil, Trash2, Loader2, ArrowLeft, Plus, Save, X, Copy } from 'lucide-react';
import { toast } from 'sonner';
import Link from 'next/link';

import { createClient } from '@/lib/supabase/client';
import type { BOMHeader, BOMItem, Item, UOM, UserRole, Supplier } from '@/types';
import { formatDate, formatNumber } from '@/lib/utils';
import { PageHeader } from '@/components/shared/PageHeader';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table';

const bomItemSchema = z.object({
  id: z.string().optional(),
  item_id: z.string().min(1, 'Item required'),
  quantity: z.coerce.number().positive(),
  uom_id: z.string().nullable().optional(),
  seq_no: z.coerce.number().int().positive().nullable().optional(),
  notes: z.string().nullable().optional(),
});

const schema = z.object({
  bom_code: z.string().min(1),
  finished_item_id: z.string().min(1),
  subcontractor_id: z.string().nullable().optional(),
  output_quantity: z.coerce.number().positive(),
  uom_id: z.string().nullable().optional(),
  effective_from: z.string().min(1),
  effective_to: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  is_active: z.boolean(),
  bom_items: z.array(bomItemSchema).min(1),
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

export default function BOMDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [bom, setBom] = useState<BOMHeader | null>(null);
  const [bomItems, setBomItems] = useState<BOMItem[]>([]);
  const [finishedItems, setFinishedItems] = useState<Item[]>([]);
  const [allItems, setAllItems] = useState<Item[]>([]);
  const [uoms, setUoms] = useState<UOM[]>([]);
  const [subcontractors, setSubcontractors] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [editMode, setEditMode] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const role = useRole();
  const isAdmin = role === 'admin';

  const { register, handleSubmit, control, setValue, watch, reset, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { bom_items: [] },
  });
  const { fields, append, remove } = useFieldArray({ control, name: 'bom_items' });

  const fetchBom = useCallback(async () => {
    setLoading(true);
    const supabase = createClient();
    const [bomRes, itemsRes, uomsRes, subsRes] = await Promise.all([
      supabase
        .from('bom_headers')
        .select('*, finished_item:items!bom_headers_finished_item_id_fkey(*), uom:uoms(*), subcontractor:suppliers!subcontractor_id(id, name)')
        .eq('id', id)
        .single(),
      supabase.from('items').select('*').eq('is_active', true).order('item_name'),
      supabase.from('uoms').select('*').eq('is_active', true).order('name'),
      supabase.from('suppliers').select('id,name').eq('is_active', true).eq('is_subcontractor', true).order('name'),
    ]);
    const biRes = await supabase
      .from('bom_items')
      .select('*, item:items(id, item_name), uom:uoms(id, name, abbreviation)')
      .eq('bom_id', id)
      .order('seq_no', { ascending: true, nullsFirst: false });

    if (bomRes.error || !bomRes.data) {
      toast.error('BOM not found');
      router.push('/masters/bom');
      return;
    }
    const bomData = bomRes.data as BOMHeader;
    setBom(bomData);
    setBomItems(biRes.data ?? []);
    const items = itemsRes.data ?? [];
    setFinishedItems(items.filter(i => i.item_type === 'finished_goods'));
    setAllItems(items.filter(i => ['raw_material', 'packing_material'].includes(i.item_type)));
    setUoms(uomsRes.data ?? []);
    setSubcontractors((subsRes.data ?? []) as Supplier[]);

    reset({
      bom_code: bomData.bom_code,
      finished_item_id: bomData.finished_item_id,
      subcontractor_id: bomData.subcontractor_id ?? null,
      output_quantity: bomData.output_quantity,
      uom_id: bomData.uom_id ?? null,
      effective_from: bomData.effective_from,
      effective_to: bomData.effective_to ?? null,
      notes: bomData.notes ?? '',
      is_active: bomData.is_active,
      bom_items: (biRes.data ?? []).map(bi => ({
        id: bi.id,
        item_id: bi.item_id,
        quantity: bi.quantity,
        uom_id: bi.uom_id ?? null,
        seq_no: bi.seq_no ?? undefined,
        notes: bi.notes ?? '',
      })),
    });
    setLoading(false);
  }, [id, router, reset]);

  useEffect(() => { fetchBom(); }, [fetchBom]);

  async function onSubmit(values: FormValues) {
    setSaving(true);
    const supabase = createClient();
    try {
      const { error: headerError } = await supabase.from('bom_headers').update({
        bom_code: values.bom_code,
        finished_item_id: values.finished_item_id,
        subcontractor_id: values.subcontractor_id || null,
        output_quantity: values.output_quantity,
        uom_id: values.uom_id || null,
        effective_from: values.effective_from,
        effective_to: values.effective_to || null,
        notes: values.notes || null,
        is_active: values.is_active,
      }).eq('id', id);
      if (headerError) throw headerError;

      await supabase.from('bom_items').delete().eq('bom_id', id);
      const newItems = values.bom_items.map((item, idx) => ({
        bom_id: id,
        item_id: item.item_id,
        quantity: item.quantity,
        uom_id: item.uom_id || null,
        seq_no: item.seq_no ?? idx + 1,
        notes: item.notes || null,
      }));
      const { error: itemsError } = await supabase.from('bom_items').insert(newItems);
      if (itemsError) throw itemsError;

      toast.success('BOM updated');
      setEditMode(false);
      fetchBom();
    } catch (err: unknown) {
      toast.error((err as Error).message ?? 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    const supabase = createClient();
    await supabase.from('bom_items').delete().eq('bom_id', id);
    const { error } = await supabase.from('bom_headers').delete().eq('id', id);
    if (error) toast.error(error.message);
    else { toast.success('BOM deleted'); router.push('/masters/bom'); }
  }

  if (loading) {
    return <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>;
  }
  if (!bom) return null;

  return (
    <div>
      <PageHeader
        title={bom.bom_code}
        description={`BOM for ${bom.finished_item?.item_name ?? '—'}`}
        breadcrumbs={[
          { label: 'Masters', href: '/masters/items' },
          { label: 'BOM', href: '/masters/bom' },
          { label: bom.bom_code },
        ]}
        actions={
          <div className="flex gap-2">
            <Link href="/masters/bom"><Button variant="outline" size="sm"><ArrowLeft className="w-4 h-4 mr-1" />Back</Button></Link>
            {isAdmin && !editMode && (
              <>
                <Link href={`/masters/bom/new?from=${bom.id}`}><Button size="sm" variant="outline"><Copy className="w-4 h-4 mr-1" />Duplicate</Button></Link>
                <Button size="sm" onClick={() => setEditMode(true)}><Pencil className="w-4 h-4 mr-1" />Edit</Button>
                <Button size="sm" variant="destructive" onClick={() => setDeleteOpen(true)}><Trash2 className="w-4 h-4 mr-1" />Delete</Button>
              </>
            )}
            {isAdmin && editMode && (
              <>
                <Button size="sm" variant="outline" onClick={() => { setEditMode(false); fetchBom(); }}><X className="w-4 h-4 mr-1" />Cancel</Button>
                <Button size="sm" onClick={handleSubmit(onSubmit)} disabled={saving}>
                  {saving ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Save className="w-4 h-4 mr-1" />}Save
                </Button>
              </>
            )}
          </div>
        }
      />

      {!editMode ? (
        <div className="space-y-6">
          <Card className="p-6">
            <h2 className="text-base font-semibold mb-4">BOM Details</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-x-8 gap-y-4 text-sm">
              <div><div className="text-gray-500 text-xs uppercase font-medium mb-1">BOM Code</div><div className="font-mono font-medium">{bom.bom_code}</div></div>
              <div><div className="text-gray-500 text-xs uppercase font-medium mb-1">Finished Item</div><div>{bom.finished_item?.item_name}</div></div>
              <div><div className="text-gray-500 text-xs uppercase font-medium mb-1">Subcontractor</div><div>{bom.subcontractor?.name ?? <span className="text-gray-400 italic">Any</span>}</div></div>
              <div><div className="text-gray-500 text-xs uppercase font-medium mb-1">Output Qty</div><div>{formatNumber(bom.output_quantity)} {bom.uom?.abbreviation ?? ''}</div></div>
              <div><div className="text-gray-500 text-xs uppercase font-medium mb-1">Effective From</div><div>{formatDate(bom.effective_from)}</div></div>
              <div><div className="text-gray-500 text-xs uppercase font-medium mb-1">Effective To</div><div>{bom.effective_to ? formatDate(bom.effective_to) : <span className="text-gray-400 italic">No end date</span>}</div></div>
              <div><div className="text-gray-500 text-xs uppercase font-medium mb-1">Status</div><Badge variant={bom.is_active ? 'default' : 'secondary'}>{bom.is_active ? 'Active' : 'Inactive'}</Badge></div>
              {bom.notes && <div className="col-span-2 md:col-span-3"><div className="text-gray-500 text-xs uppercase font-medium mb-1">Notes</div><div className="text-gray-700">{bom.notes}</div></div>}
            </div>
          </Card>

          <Card className="p-6">
            <h2 className="text-base font-semibold mb-4">Components / Raw Materials</h2>
            <div className="rounded-lg border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">#</TableHead>
                    <TableHead>Item</TableHead>
                    <TableHead>Quantity</TableHead>
                    <TableHead>UOM</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {bomItems.length === 0 ? (
                    <TableRow><TableCell colSpan={4} className="text-center text-gray-400 py-8">No components defined</TableCell></TableRow>
                  ) : bomItems.map((bi, idx) => (
                    <TableRow key={bi.id}>
                      <TableCell className="text-gray-400 text-sm">{bi.seq_no ?? idx + 1}</TableCell>
                      <TableCell className="font-medium text-sm">{bi.item?.item_name}</TableCell>
                      <TableCell className="text-sm">{formatNumber(bi.quantity)}</TableCell>
                      <TableCell className="text-sm text-gray-500">{bi.uom?.abbreviation ?? '—'}</TableCell>
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
            <h2 className="text-base font-semibold mb-4">BOM Header</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <div className="space-y-1">
                <Label>BOM Code <span className="text-red-500">*</span></Label>
                <Input {...register('bom_code')} />
                {errors.bom_code && <p className="text-xs text-red-500">{errors.bom_code.message}</p>}
              </div>
              <div className="col-span-2 space-y-1">
                <Label>Finished Item <span className="text-red-500">*</span></Label>
                <Select value={watch('finished_item_id')} onValueChange={v => setValue('finished_item_id', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {finishedItems.map(i => <SelectItem key={i.id} value={i.id}>{i.item_name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-2 md:col-span-3 space-y-1">
                <Label>Subcontractor <span className="text-gray-400 font-normal">(optional — restricts this BOM in production)</span></Label>
                <Select value={watch('subcontractor_id') ?? '__none__'} onValueChange={v => setValue('subcontractor_id', v === '__none__' ? null : v)}>
                  <SelectTrigger><SelectValue placeholder="Any subcontractor" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Any subcontractor</SelectItem>
                    {subcontractors.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Output Qty <span className="text-red-500">*</span></Label>
                <Input {...register('output_quantity')} type="number" step="0.001" min="0.001" />
              </div>
              <div className="space-y-1">
                <Label>Output UOM</Label>
                <Select value={watch('uom_id') ?? '__none__'} onValueChange={v => setValue('uom_id', v === '__none__' ? null : v)}>
                  <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">None</SelectItem>
                    {uoms.map(u => <SelectItem key={u.id} value={u.id}>{u.name} ({u.abbreviation})</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Effective From <span className="text-red-500">*</span></Label>
                <Input {...register('effective_from')} type="date" />
              </div>
              <div className="space-y-1">
                <Label>Effective To</Label>
                <Input {...register('effective_to')} type="date" />
              </div>
              <div className="col-span-2 md:col-span-3 space-y-1">
                <Label>Notes</Label>
                <Textarea {...register('notes')} rows={2} />
              </div>
              <div className="flex items-center gap-3">
                <Switch id="edit-bom-active" checked={watch('is_active')} onCheckedChange={v => setValue('is_active', v)} />
                <Label htmlFor="edit-bom-active">Active</Label>
              </div>
            </div>
          </Card>

          <Card className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold">Components</h2>
              <Button type="button" size="sm" variant="outline"
                onClick={() => append({ item_id: '', quantity: 1, uom_id: null, seq_no: fields.length + 1, notes: '' })}
              >
                <Plus className="w-4 h-4 mr-1" />Add Row
              </Button>
            </div>
            <div className="space-y-3">
              <div className="grid grid-cols-12 gap-2 text-xs font-medium text-gray-500 px-1">
                <div className="col-span-1">#</div>
                <div className="col-span-6">Item</div>
                <div className="col-span-2">Qty</div>
                <div className="col-span-2">UOM</div>
                <div className="col-span-1"></div>
              </div>
              <Separator />
              {fields.map((field, idx) => (
                <div key={field.id} className="grid grid-cols-12 gap-2 items-start">
                  <div className="col-span-1 pt-2 text-sm text-gray-400 text-center">{idx + 1}</div>
                  <div className="col-span-6">
                    <Select
                      value={watch(`bom_items.${idx}.item_id`)}
                      onValueChange={v => {
                        setValue(`bom_items.${idx}.item_id`, v);
                        const item = allItems.find(i => i.id === v);
                        if (item?.uom_id) setValue(`bom_items.${idx}.uom_id`, item.uom_id);
                      }}
                    >
                      <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Select item" /></SelectTrigger>
                      <SelectContent>
                        {allItems.map(i => <SelectItem key={i.id} value={i.id}>{i.item_name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="col-span-2">
                    <Input {...register(`bom_items.${idx}.quantity`)} type="number" step="0.001" className="h-9 text-sm" />
                  </div>
                  <div className="col-span-2">
                    <Select
                      value={watch(`bom_items.${idx}.uom_id`) ?? '__none__'}
                      onValueChange={v => setValue(`bom_items.${idx}.uom_id`, v === '__none__' ? null : v)}
                    >
                      <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="UOM" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">—</SelectItem>
                        {uoms.map(u => <SelectItem key={u.id} value={u.id}>{u.abbreviation}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="col-span-1 pt-1">
                    {fields.length > 1 && (
                      <Button type="button" size="icon" variant="ghost" className="h-8 w-8 text-red-400 hover:text-red-600" onClick={() => remove(idx)}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Delete BOM?"
        description={`BOM "${bom.bom_code}" and all its components will be permanently deleted.`}
        confirmLabel="Delete BOM"
        onConfirm={handleDelete}
      />
    </div>
  );
}
