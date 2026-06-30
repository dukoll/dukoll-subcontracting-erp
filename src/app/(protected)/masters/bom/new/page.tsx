'use client';

import { Suspense, useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Plus, Trash2, Loader2, ArrowLeft, Copy } from 'lucide-react';
import { toast } from 'sonner';
import Link from 'next/link';

import { createClient } from '@/lib/supabase/client';
import type { Item, UOM } from '@/types';
import { PageHeader } from '@/components/shared/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';

const bomItemSchema = z.object({
  item_id: z.string().min(1, 'Item is required'),
  quantity: z.coerce.number().positive('Qty must be positive'),
  uom_id: z.string().nullable().optional(),
  seq_no: z.coerce.number().int().positive().nullable().optional(),
  notes: z.string().nullable().optional(),
});

const schema = z.object({
  bom_code: z.string().min(1, 'BOM code is required').max(50),
  finished_item_id: z.string().min(1, 'Finished item is required'),
  output_quantity: z.coerce.number().positive('Output qty must be positive'),
  uom_id: z.string().nullable().optional(),
  effective_from: z.string().min(1, 'Effective from date is required'),
  effective_to: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  is_active: z.boolean().default(true),
  bom_items: z.array(bomItemSchema).min(1, 'At least one raw material is required'),
});
type FormValues = z.infer<typeof schema>;

function nextCodeFrom(last: string | undefined): string {
  if (!last) return 'BOM-001';
  const match = last.match(/(\d+)$/);
  if (!match) return 'BOM-001';
  const next = String(parseInt(match[1]) + 1).padStart(3, '0');
  return `${last.replace(/\d+$/, '')}${next}`;
}

function BOMNewForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const duplicateFrom = searchParams.get('from');

  const [finishedItems, setFinishedItems] = useState<Item[]>([]);
  const [allItems, setAllItems] = useState<Item[]>([]);
  const [uoms, setUoms] = useState<UOM[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [duplicatedCode, setDuplicatedCode] = useState<string | null>(null);

  const { register, handleSubmit, control, setValue, watch, reset, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      bom_code: '',
      finished_item_id: '',
      output_quantity: 1,
      uom_id: null,
      effective_from: new Date().toISOString().split('T')[0],
      effective_to: null,
      notes: '',
      is_active: true,
      bom_items: [{ item_id: '', quantity: 1, uom_id: null, seq_no: 1, notes: '' }],
    },
  });

  const { fields, append, remove } = useFieldArray({ control, name: 'bom_items' });

  useEffect(() => {
    async function load() {
      const supabase = createClient();
      const [itemsRes, uomsRes, existingBoms] = await Promise.all([
        supabase.from('items').select('*').eq('is_active', true).order('item_name'),
        supabase.from('uoms').select('*').eq('is_active', true).order('name'),
        supabase.from('bom_headers').select('bom_code').order('bom_code', { ascending: false }).limit(1),
      ]);

      const items = itemsRes.data ?? [];
      setFinishedItems(items.filter(i => i.item_type === 'finished_goods'));
      setAllItems(items.filter(i => ['raw_material', 'packing_material'].includes(i.item_type)));
      setUoms(uomsRes.data ?? []);

      const suggestedCode = nextCodeFrom(existingBoms.data?.[0]?.bom_code);

      if (duplicateFrom) {
        // #4 — Duplicate: load source BOM + items, prefill with a fresh code
        const [{ data: src }, { data: srcItems }] = await Promise.all([
          supabase.from('bom_headers').select('*').eq('id', duplicateFrom).single(),
          supabase.from('bom_items').select('*').eq('bom_id', duplicateFrom).order('seq_no', { ascending: true, nullsFirst: false }),
        ]);
        if (src) {
          const srcHeader = src as { bom_code: string; finished_item_id: string; output_quantity: number; uom_id: string | null; effective_to: string | null; notes: string | null };
          setDuplicatedCode(srcHeader.bom_code);
          reset({
            bom_code: suggestedCode,
            finished_item_id: srcHeader.finished_item_id,
            output_quantity: srcHeader.output_quantity,
            uom_id: srcHeader.uom_id ?? null,
            effective_from: new Date().toISOString().split('T')[0],
            effective_to: srcHeader.effective_to ?? null,
            notes: srcHeader.notes ?? '',
            is_active: true,
            bom_items: (srcItems ?? []).length > 0
              ? (srcItems ?? []).map((bi, idx) => ({
                  item_id: bi.item_id, quantity: bi.quantity, uom_id: bi.uom_id ?? null,
                  seq_no: bi.seq_no ?? idx + 1, notes: bi.notes ?? '',
                }))
              : [{ item_id: '', quantity: 1, uom_id: null, seq_no: 1, notes: '' }],
          });
        } else {
          setValue('bom_code', suggestedCode);
        }
      } else {
        setValue('bom_code', suggestedCode);
      }
      setLoading(false);
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [duplicateFrom]);

  async function onSubmit(values: FormValues) {
    setSaving(true);
    const supabase = createClient();
    try {
      const { data: header, error: headerError } = await supabase
        .from('bom_headers')
        .insert({
          bom_code: values.bom_code,
          finished_item_id: values.finished_item_id,
          output_quantity: values.output_quantity,
          uom_id: values.uom_id || null,
          effective_from: values.effective_from,
          effective_to: values.effective_to || null,
          notes: values.notes || null,
          is_active: values.is_active,
        })
        .select('id')
        .single();

      if (headerError) throw headerError;

      const bomItems = values.bom_items.map((item, idx) => ({
        bom_id: header.id,
        item_id: item.item_id,
        quantity: item.quantity,
        uom_id: item.uom_id || null,
        seq_no: item.seq_no ?? idx + 1,
        notes: item.notes || null,
      }));

      const { error: itemsError } = await supabase.from('bom_items').insert(bomItems);
      if (itemsError) throw itemsError;

      toast.success('BOM created successfully');
      router.push('/masters/bom');
    } catch (err: unknown) {
      toast.error((err as Error).message ?? 'Failed to save BOM');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>;
  }

  return (
    <div>
      <PageHeader
        title={duplicatedCode ? 'Duplicate BOM' : 'New Bill of Materials'}
        description="Define the recipe for a finished product."
        breadcrumbs={[
          { label: 'Masters', href: '/masters/items' },
          { label: 'BOM', href: '/masters/bom' },
          { label: duplicatedCode ? 'Duplicate' : 'New' },
        ]}
        actions={
          <Link href="/masters/bom">
            <Button variant="outline" size="sm"><ArrowLeft className="w-4 h-4 mr-1" />Back</Button>
          </Link>
        }
      />

      {duplicatedCode && (
        <div className="mb-4 flex items-center gap-2 rounded-lg bg-amber-50 border border-amber-200 px-4 py-2.5 text-sm text-amber-800">
          <Copy className="w-4 h-4" />
          Duplicating from <span className="font-mono font-medium">{duplicatedCode}</span>. Review and edit before saving — this creates a new BOM.
        </div>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        <Card className="p-6">
          <h2 className="text-base font-semibold mb-4">BOM Header</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div className="space-y-1">
              <Label>BOM Code <span className="text-red-500">*</span></Label>
              <Input {...register('bom_code')} placeholder="e.g. BOM-001" />
              {errors.bom_code && <p className="text-xs text-red-500">{errors.bom_code.message}</p>}
            </div>

            <div className="col-span-2 space-y-1">
              <Label>Finished Item <span className="text-red-500">*</span></Label>
              <Select
                value={watch('finished_item_id')}
                onValueChange={v => {
                  setValue('finished_item_id', v);
                  const item = finishedItems.find(i => i.id === v);
                  if (item?.uom_id) setValue('uom_id', item.uom_id);
                }}
              >
                <SelectTrigger><SelectValue placeholder="Select finished item" /></SelectTrigger>
                <SelectContent>
                  {finishedItems.map(i => (
                    <SelectItem key={i.id} value={i.id}>{i.item_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.finished_item_id && <p className="text-xs text-red-500">{errors.finished_item_id.message}</p>}
            </div>

            <div className="space-y-1">
              <Label>Output Quantity <span className="text-red-500">*</span></Label>
              <Input {...register('output_quantity')} type="number" step="0.001" min="0.001" />
              {errors.output_quantity && <p className="text-xs text-red-500">{errors.output_quantity.message}</p>}
            </div>

            <div className="space-y-1">
              <Label>Output UOM</Label>
              <Select value={watch('uom_id') ?? '__none__'} onValueChange={v => setValue('uom_id', v === '__none__' ? null : v)}>
                <SelectTrigger><SelectValue placeholder="Select UOM" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">None</SelectItem>
                  {uoms.map(u => <SelectItem key={u.id} value={u.id}>{u.name} ({u.abbreviation})</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label>Effective From <span className="text-red-500">*</span></Label>
              <Input {...register('effective_from')} type="date" />
              {errors.effective_from && <p className="text-xs text-red-500">{errors.effective_from.message}</p>}
            </div>

            <div className="space-y-1">
              <Label>Effective To</Label>
              <Input {...register('effective_to')} type="date" />
            </div>

            <div className="col-span-2 md:col-span-3 space-y-1">
              <Label>Notes</Label>
              <Textarea {...register('notes')} rows={2} placeholder="Optional notes" />
            </div>

            <div className="flex items-center gap-3">
              <Switch id="bom-active" checked={watch('is_active')} onCheckedChange={v => setValue('is_active', v)} />
              <Label htmlFor="bom-active">Active</Label>
            </div>
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold">Raw Materials / Components</h2>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => append({ item_id: '', quantity: 1, uom_id: null, seq_no: fields.length + 1, notes: '' })}
            >
              <Plus className="w-4 h-4 mr-1" />Add Row
            </Button>
          </div>
          {errors.bom_items && typeof errors.bom_items === 'object' && 'message' in errors.bom_items && (
            <p className="text-xs text-red-500 mb-3">{errors.bom_items.message as string}</p>
          )}

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
                      {allItems.map(i => (
                        <SelectItem key={i.id} value={i.id}>{i.item_name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {errors.bom_items?.[idx]?.item_id && (
                    <p className="text-xs text-red-500 mt-0.5">{errors.bom_items[idx]?.item_id?.message}</p>
                  )}
                </div>
                <div className="col-span-2">
                  <Input
                    {...register(`bom_items.${idx}.quantity`)}
                    type="number" step="0.001" min="0.001"
                    className="h-9 text-sm"
                    placeholder="Qty"
                  />
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

        <div className="flex justify-end gap-3 pb-8">
          <Link href="/masters/bom">
            <Button type="button" variant="outline">Cancel</Button>
          </Link>
          <Button type="submit" disabled={saving}>
            {saving && <Loader2 className="w-4 h-4 animate-spin mr-1" />}
            Save BOM
          </Button>
        </div>
      </form>
    </div>
  );
}

export default function BOMNewPage() {
  return (
    <Suspense fallback={<div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>}>
      <BOMNewForm />
    </Suspense>
  );
}
