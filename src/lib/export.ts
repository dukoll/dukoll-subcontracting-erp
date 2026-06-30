/**
 * Export an array of objects to a CSV file and trigger a download.
 * Client-side only.
 */
export function exportToCSV<T extends Record<string, unknown>>(
  rows: T[],
  filename: string,
  columns?: { key: keyof T; label: string }[]
): void {
  if (rows.length === 0) return;

  const cols = columns ?? Object.keys(rows[0]).map(k => ({ key: k as keyof T, label: k }));

  const escape = (val: unknown): string => {
    if (val == null) return '';
    const str = String(val);
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const header = cols.map(c => escape(c.label)).join(',');
  const body = rows
    .map(row => cols.map(c => escape(row[c.key])).join(','))
    .join('\n');

  const csv = `${header}\n${body}`;
  const blob = new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename.endsWith('.csv') ? filename : `${filename}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
