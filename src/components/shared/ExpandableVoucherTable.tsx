'use client';

import { Fragment, useState, type ReactNode } from 'react';
import { ChevronRight, ChevronDown } from 'lucide-react';
import { formatNumber } from '@/lib/utils';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';

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
}

/** A voucher list table whose rows expand to reveal their line items at a glance (#8). */
export function ExpandableVoucherTable<T extends { id: string; _items?: ExpandItem[] }>({
  columns, rows, onRowClick,
}: Props<T>) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const totalCols = columns.length + 1;
  const showDetail = rows.some(r => (r._items ?? []).some(i => i.detail != null && i.detail !== ''));

  return (
    <div className="border rounded-xl overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="bg-gray-50">
            <TableHead className="w-10" />
            {columns.map((c, i) => (
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
                  {columns.map((c, i) => (
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
  );
}
