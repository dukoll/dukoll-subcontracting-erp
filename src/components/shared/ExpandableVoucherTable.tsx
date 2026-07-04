'use client';

import { Fragment, useState, useEffect, type ReactNode } from 'react';
import { ChevronRight, ChevronDown, Columns3 } from 'lucide-react';
import { formatNumber } from '@/lib/utils';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';

export interface ExpandItem {
  name: string;
  qty: number;
  uom?: string | null;
  detail?: string | null;
}

export interface VoucherColumn<T> {
  header: string;
  render: (row: T) => ReactNode;
  className?: string;
}

interface Props<T extends { id: string; _items?: ExpandItem[] }> {
  columns: VoucherColumn<T>[];
  rows: T[];
  onRowClick: (id: string) => void;
  /** If set, the user's chosen columns are remembered under this key. */
  storageKey?: string;
}

/** A voucher list table whose rows expand to reveal their line items at a glance (#8),
 *  with a per-table column chooser. */
export function ExpandableVoucherTable<T extends { id: string; _items?: ExpandItem[] }>({
  columns, rows, onRowClick, storageKey,
}: Props<T>) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [hidden, setHidden] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!storageKey) return;
    try {
      const raw = localStorage.getItem(`cols:${storageKey}`);
      if (raw) setHidden(new Set(JSON.parse(raw) as string[]));
    } catch { /* ignore */ }
  }, [storageKey]);

  function toggleCol(header: string) {
    setHidden(prev => {
      const next = new Set(prev);
      if (next.has(header)) next.delete(header); else next.add(header);
      if (storageKey) { try { localStorage.setItem(`cols:${storageKey}`, JSON.stringify(Array.from(next))); } catch { /* ignore */ } }
      return next;
    });
  }

  const visibleColumns = columns.filter(c => !hidden.has(c.header));
  const totalCols = visibleColumns.length + 1;
  const showDetail = rows.some(r => (r._items ?? []).some(i => i.detail != null && i.detail !== ''));

  return (
    <div>
      <div className="flex justify-end mb-2">
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm"><Columns3 className="w-4 h-4 mr-1.5" />Columns</Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-56 p-2">
            <div className="text-xs font-medium text-gray-500 px-1 pb-1.5">Show columns</div>
            {columns.map((c, i) => (
              <label key={i} className="flex items-center gap-2 px-1 py-1.5 text-sm rounded hover:bg-accent cursor-pointer">
                <input type="checkbox" className="accent-red-600" checked={!hidden.has(c.header)} onChange={() => toggleCol(c.header)} />
                {c.header}
              </label>
            ))}
          </PopoverContent>
        </Popover>
      </div>
      <div className="border rounded-xl overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="bg-gray-50">
            <TableHead className="w-10" />
            {visibleColumns.map((c, i) => (
              <TableHead key={i} className={c.className}>{c.header}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map(row => {
            const isOpen = expanded === row.id;
            const items = row._items ?? [];
            return (
              <Fragment key={row.id}>
                <TableRow className="cursor-pointer hover:bg-gray-50" onClick={() => onRowClick(row.id)}>
                  <TableCell
                    className="w-10 text-gray-400"
                    onClick={e => { e.stopPropagation(); setExpanded(isOpen ? null : row.id); }}
                  >
                    <button type="button" aria-label={isOpen ? 'Collapse' : 'Expand'} className="p-1 hover:text-gray-700">
                      {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                    </button>
                  </TableCell>
                  {visibleColumns.map((c, i) => (
                    <TableCell key={i} className={c.className}>{c.render(row)}</TableCell>
                  ))}
                </TableRow>
                {isOpen && (
                  <TableRow className="bg-gray-50/60 hover:bg-gray-50/60">
                    <TableCell colSpan={totalCols} className="p-0">
                      <div className="px-12 py-3">
                        <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Items</div>
                        {items.length > 0 ? (
                          <table className="w-full text-sm max-w-2xl">
                            <thead>
                              <tr className="text-xs text-gray-500">
                                <th className="text-left py-1 font-medium">Item</th>
                                <th className="text-right py-1 font-medium w-28">Qty</th>
                                <th className="text-left py-1 pl-4 font-medium w-20">UOM</th>
                                {showDetail && <th className="text-left py-1 pl-4 font-medium">Detail</th>}
                              </tr>
                            </thead>
                            <tbody>
                              {items.map((it, idx) => (
                                <tr key={idx} className="border-t border-gray-200">
                                  <td className="py-1.5 font-medium text-gray-800">{it.name}</td>
                                  <td className="py-1.5 text-right font-mono">{formatNumber(it.qty)}</td>
                                  <td className="py-1.5 pl-4 text-gray-500">{it.uom ?? '—'}</td>
                                  {showDetail && <td className="py-1.5 pl-4 text-gray-500">{it.detail ?? '—'}</td>}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        ) : (
                          <div className="text-sm text-gray-400">No items</div>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                )}
              </Fragment>
            );
          })}
        </TableBody>
      </Table>
      </div>
    </div>
  );
}
