'use client';

import { useState, useEffect, type ReactNode } from 'react';
import { Columns3 } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

export interface TableColumn<T> {
  id: string;
  header: string;
  cell: (row: T) => ReactNode;
  className?: string;
  /** Available in the chooser but hidden until the user turns it on. */
  defaultHidden?: boolean;
  /** Cannot be hidden (e.g. an actions column). Excluded from the chooser. */
  alwaysVisible?: boolean;
}

interface CustomizableTableProps<T> {
  columns: TableColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  /** Persist the chosen columns under this key. */
  storageKey?: string;
  onRowClick?: (row: T) => void;
  empty?: ReactNode;
  /** Optional content rendered to the left of the Columns button. */
  toolbarLeft?: ReactNode;
  /** Optional extra className per row (e.g. to highlight negatives). */
  rowClassName?: (row: T) => string;
}

/**
 * A table with a built-in "Columns" chooser so users can show/hide any of the
 * available fields (remembered per `storageKey`). Extra relevant fields can be
 * offered as `defaultHidden` columns that users opt into.
 */
export function CustomizableTable<T>({
  columns, rows, rowKey, storageKey, onRowClick, empty, toolbarLeft, rowClassName,
}: CustomizableTableProps<T>) {
  const [hidden, setHidden] = useState<Set<string>>(
    () => new Set(columns.filter(c => c.defaultHidden).map(c => c.id)),
  );

  useEffect(() => {
    if (!storageKey) return;
    try {
      const raw = localStorage.getItem(`cols:${storageKey}`);
      if (raw) setHidden(new Set(JSON.parse(raw) as string[]));
    } catch { /* ignore */ }
  }, [storageKey]);

  function toggle(id: string) {
    setHidden(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      if (storageKey) { try { localStorage.setItem(`cols:${storageKey}`, JSON.stringify(Array.from(next))); } catch { /* ignore */ } }
      return next;
    });
  }

  const visible = columns.filter(c => c.alwaysVisible || !hidden.has(c.id));

  return (
    <div>
      <div className="flex items-center justify-between mb-2 gap-2">
        <div className="text-sm text-gray-500">{toolbarLeft}</div>
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm"><Columns3 className="w-4 h-4 mr-1.5" />Columns</Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-56 p-2 max-h-80 overflow-y-auto">
            <div className="text-xs font-medium text-gray-500 px-1 pb-1.5">Show columns</div>
            {columns.filter(c => !c.alwaysVisible).map(c => (
              <label key={c.id} className="flex items-center gap-2 px-1 py-1.5 text-sm rounded hover:bg-accent cursor-pointer">
                <input type="checkbox" className="accent-red-600" checked={!hidden.has(c.id)} onChange={() => toggle(c.id)} />
                {c.header}
              </label>
            ))}
          </PopoverContent>
        </Popover>
      </div>
      <div className="rounded-lg border bg-white overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              {visible.map(c => <TableHead key={c.id} className={c.className}>{c.header}</TableHead>)}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={visible.length} className="text-center text-gray-400 py-10">{empty ?? 'No records'}</TableCell>
              </TableRow>
            ) : rows.map(row => (
              <TableRow
                key={rowKey(row)}
                className={[onRowClick ? 'cursor-pointer hover:bg-gray-50' : '', rowClassName?.(row) ?? ''].filter(Boolean).join(' ') || undefined}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
              >
                {visible.map(c => <TableCell key={c.id} className={c.className}>{c.cell(row)}</TableCell>)}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
