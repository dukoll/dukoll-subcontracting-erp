'use client';

import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface VoucherFiltersProps {
  search: string;
  onSearch: (v: string) => void;
  status: string;
  onStatus: (v: string) => void;
  searchPlaceholder?: string;
}

/**
 * Shared filter bar for voucher list pages: free-text search + status filter
 * (All / Draft / Submitted / Cancelled). Filtering is done client-side by the
 * parent; this component only owns the controls.
 */
export function VoucherFilters({ search, onSearch, status, onStatus, searchPlaceholder }: VoucherFiltersProps) {
  const active = search || status;
  return (
    <div className="flex flex-wrap items-center gap-3 mb-4">
      <div className="relative w-full sm:w-72">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <Input
          className="pl-9"
          placeholder={searchPlaceholder ?? 'Search…'}
          value={search}
          onChange={e => onSearch(e.target.value)}
        />
      </div>
      <Select value={status} onValueChange={onStatus}>
        <SelectTrigger className="w-44"><SelectValue placeholder="All statuses" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="">All statuses</SelectItem>
          <SelectItem value="draft">Draft</SelectItem>
          <SelectItem value="approved">Submitted</SelectItem>
          <SelectItem value="cancelled">Cancelled</SelectItem>
        </SelectContent>
      </Select>
      {active && (
        <Button variant="ghost" size="sm" onClick={() => { onSearch(''); onStatus(''); }}>Clear</Button>
      )}
    </div>
  );
}
