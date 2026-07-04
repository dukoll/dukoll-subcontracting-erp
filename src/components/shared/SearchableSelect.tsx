'use client';

import { useState } from 'react';
import { Check, ChevronsUpDown, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Input } from '@/components/ui/input';

export interface SelectOption {
  value: string;
  label: string;
}

interface SearchableSelectProps {
  value: string;
  onValueChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  emptyText?: string;
  disabled?: boolean;
  id?: string;
  className?: string; // applied to the trigger
}

/**
 * A type-to-search dropdown that is a drop-in replacement for the shadcn Select
 * in places that map an array of options. Built on Popover so no extra deps.
 */
export function SearchableSelect({
  value, onValueChange, options, placeholder = 'Select...', emptyText = 'No results found',
  disabled, id, className,
}: SearchableSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const selected = options.find(o => o.value === value);
  const q = query.trim().toLowerCase();
  const filtered = q ? options.filter(o => o.label.toLowerCase().includes(q)) : options;

  return (
    <Popover open={open} onOpenChange={o => { setOpen(o); if (!o) setQuery(''); }}>
      <PopoverTrigger asChild>
        <button
          type="button"
          id={id}
          disabled={disabled}
          className={cn(
            'flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
            className,
          )}
        >
          <span className={cn('truncate', !selected && 'text-muted-foreground')}>
            {selected ? selected.label : placeholder}
          </span>
          <ChevronsUpDown className="h-4 w-4 opacity-50 shrink-0 ml-2" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="p-0 w-[var(--radix-popover-trigger-width)] min-w-[12rem]" align="start">
        <div className="p-2 border-b">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input autoFocus value={query} onChange={e => setQuery(e.target.value)} placeholder="Type to search..." className="h-8 pl-8" />
          </div>
        </div>
        <div className="max-h-60 overflow-y-auto p-1">
          {filtered.length === 0 && (
            <div className="px-2 py-3 text-sm text-center text-muted-foreground">{emptyText}</div>
          )}
          {filtered.map(o => (
            <button
              key={o.value}
              type="button"
              onClick={() => { onValueChange(o.value); setOpen(false); setQuery(''); }}
              className={cn(
                'flex w-full items-center justify-between rounded-sm px-2 py-1.5 text-sm text-left hover:bg-accent',
                o.value === value && 'bg-accent',
              )}
            >
              <span className="truncate">{o.label}</span>
              {o.value === value && <Check className="h-4 w-4 shrink-0" />}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
