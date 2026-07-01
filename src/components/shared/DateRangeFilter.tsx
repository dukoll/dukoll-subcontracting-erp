'use client';

import { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export type DateRangePreset = '7' | '30' | 'custom';

export function todayISO(): string {
  return new Date().toISOString().split('T')[0];
}

export function daysAgoISO(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().split('T')[0];
}

interface DateRangeFilterProps {
  from: string;
  to: string;
  onChange: (from: string, to: string) => void;
  defaultPreset?: DateRangePreset;
  className?: string;
}

/**
 * Date-range picker for reports. Presets: Past 7 days / Past 30 days / Custom.
 * Defaults to "Past 7 days". Start/end date inputs appear only when Custom is
 * selected. Presets compute from/to and push them to the parent via onChange.
 */
export function DateRangeFilter({ from, to, onChange, defaultPreset = '7', className }: DateRangeFilterProps) {
  const [preset, setPreset] = useState<DateRangePreset>(defaultPreset);

  useEffect(() => {
    if (preset === '7') onChange(daysAgoISO(7), todayISO());
    else if (preset === '30') onChange(daysAgoISO(30), todayISO());
    // 'custom' keeps the current from/to for manual editing
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preset]);

  return (
    <div className={cn('flex flex-wrap items-end gap-3', className)}>
      <div className="grid gap-1.5">
        <Label>Period</Label>
        <Select value={preset} onValueChange={v => setPreset(v as DateRangePreset)}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="7">Past 7 days</SelectItem>
            <SelectItem value="30">Past 30 days</SelectItem>
            <SelectItem value="custom">Custom</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {preset === 'custom' && (
        <>
          <div className="grid gap-1.5">
            <Label>Start Date</Label>
            <Input type="date" className="w-40" value={from} onChange={e => onChange(e.target.value, to)} />
          </div>
          <div className="grid gap-1.5">
            <Label>End Date</Label>
            <Input type="date" className="w-40" value={to} onChange={e => onChange(from, e.target.value)} />
          </div>
        </>
      )}
    </div>
  );
}
