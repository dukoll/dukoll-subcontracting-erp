'use client';

import { useState, isValidElement, Children, type ReactNode } from 'react';
import { Check, ChevronDown, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Input } from '@/components/ui/input';

/**
 * Drop-in, type-to-search replacement for the shadcn <Select> compound API.
 * Swap the import from '@/components/ui/searchable-select' to this file and every existing
 * <Select><SelectTrigger><SelectValue/></SelectTrigger><SelectContent>
 * {items.map(i => <SelectItem value=.. >label</SelectItem>)}</SelectContent></Select>
 * keeps working — but with a search box that partial-matches option labels.
 */

interface Opt { value: string; label: string; disabled?: boolean }

/* eslint-disable @typescript-eslint/no-explicit-any */

// Marker components — they render nothing; <Select> reads their props/children.
export function SelectTrigger(_: any) { return null; }
export function SelectValue(_: any) { return null; }
export function SelectContent(_: any) { return null; }
export function SelectItem(_: any) { return null; }
export function SelectGroup(_: any) { return null; }
export function SelectLabel(_: any) { return null; }
export function SelectSeparator(_: any) { return null; }

function textOf(node: ReactNode): string {
  if (node == null || node === false || node === true) return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(textOf).join('');
  if (isValidElement(node)) return textOf((node.props as any).children);
  return '';
}

function collectOptions(node: ReactNode, out: Opt[]) {
  Children.forEach(node as any, (child: any) => {
    if (!isValidElement(child)) return;
    const props: any = child.props;
    if (child.type === SelectItem) {
      out.push({ value: String(props.value ?? ''), label: textOf(props.children), disabled: !!props.disabled });
    } else if (props?.children) {
      collectOptions(props.children, out);
    }
  });
}

interface SelectProps {
  value?: string;
  onValueChange?: (value: string) => void;
  children: ReactNode;
  disabled?: boolean;
}

export function Select({ value, onValueChange, children, disabled }: SelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const options: Opt[] = [];
  collectOptions(children, options);

  // Pull the placeholder / trigger sizing out of the declarative markers.
  let placeholder = 'Select...';
  let triggerClassName = '';
  let triggerId: string | undefined;
  Children.forEach(children as any, (child: any) => {
    if (isValidElement(child) && child.type === SelectTrigger) {
      const tp: any = child.props;
      triggerClassName = tp.className ?? '';
      triggerId = tp.id;
      Children.forEach(tp.children, (gc: any) => {
        if (isValidElement(gc) && gc.type === SelectValue && (gc.props as any).placeholder) {
          placeholder = (gc.props as any).placeholder;
        }
      });
    }
  });

  const selected = options.find(o => o.value === value);
  const q = query.trim().toLowerCase();
  const filtered = q ? options.filter(o => o.label.toLowerCase().includes(q)) : options;

  return (
    <Popover open={open} onOpenChange={o => { if (!disabled) { setOpen(o); if (!o) setQuery(''); } }}>
      <PopoverTrigger asChild>
        <button
          type="button"
          id={triggerId}
          disabled={disabled}
          className={cn(
            'flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
            triggerClassName,
          )}
        >
          <span className={cn('truncate', !selected && 'text-muted-foreground')}>
            {selected ? selected.label : placeholder}
          </span>
          <ChevronDown className="h-4 w-4 opacity-50 shrink-0 ml-2" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="p-0 w-[var(--radix-popover-trigger-width)] min-w-[10rem]" align="start">
        <div className="p-2 border-b">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input autoFocus value={query} onChange={e => setQuery(e.target.value)} placeholder="Type to search..." className="h-8 pl-8" />
          </div>
        </div>
        <div className="max-h-60 overflow-y-auto p-1">
          {filtered.length === 0 && (
            <div className="px-2 py-3 text-sm text-center text-muted-foreground">No results found</div>
          )}
          {filtered.map(o => (
            <button
              key={o.value}
              type="button"
              disabled={o.disabled}
              onClick={() => { onValueChange?.(o.value); setOpen(false); setQuery(''); }}
              className={cn(
                'flex w-full items-center justify-between rounded-sm px-2 py-1.5 text-sm text-left hover:bg-accent disabled:opacity-50 disabled:pointer-events-none',
                o.value === value && 'bg-accent font-medium',
              )}
            >
              <span className="truncate">{o.label || <span className="text-muted-foreground">—</span>}</span>
              {o.value === value && <Check className="h-4 w-4 shrink-0" />}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
