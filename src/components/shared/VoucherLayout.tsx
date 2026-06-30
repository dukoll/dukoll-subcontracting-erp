import React from 'react';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { VoucherStatus } from '@/types';

interface VoucherLayoutProps {
  title: string;
  voucherNo: string;
  date: string;
  status: VoucherStatus;
  children: React.ReactNode;
  actions?: React.ReactNode;
}

const STATUS_STYLES: Record<VoucherStatus, string> = {
  approved:  'bg-green-100 text-green-800',
  draft:     'bg-yellow-100 text-yellow-800',
  cancelled: 'bg-red-100 text-red-800',
};

export function VoucherLayout({ title, voucherNo, date, status, children, actions }: VoucherLayoutProps) {
  return (
    <Card>
      <CardHeader className="border-b">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <CardTitle className="text-lg">{title}</CardTitle>
            <div className="flex items-center gap-3 mt-2 text-sm text-gray-500">
              <span className="font-mono font-semibold text-gray-800">{voucherNo}</span>
              <span>•</span>
              <span>{date}</span>
              <Badge className={cn('text-xs', STATUS_STYLES[status])}>{status.toUpperCase()}</Badge>
            </div>
          </div>
          {actions && <div className="flex gap-2">{actions}</div>}
        </div>
      </CardHeader>
      <CardContent className="pt-4">{children}</CardContent>
    </Card>
  );
}

interface SectionProps {
  title: string;
  children: React.ReactNode;
  className?: string;
}

export function VoucherSection({ title, children, className }: SectionProps) {
  return (
    <div className={cn('space-y-3', className)}>
      <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide border-b pb-2">{title}</h3>
      {children}
    </div>
  );
}
