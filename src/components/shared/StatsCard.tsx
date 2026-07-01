import React from 'react';
import { cn } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';
import type { LucideIcon } from 'lucide-react';

interface StatsCardProps {
  label: string;
  value: string | number;
  sub?: string;
  icon: LucideIcon;
  color?: 'blue' | 'green' | 'orange' | 'purple' | 'red';
  className?: string;
}

const colorMap = {
  blue:   { bg: 'bg-red-50',   icon: 'bg-red-100 text-red-600',   value: 'text-red-700' },
  green:  { bg: 'bg-green-50',  icon: 'bg-green-100 text-green-600', value: 'text-green-700' },
  orange: { bg: 'bg-orange-50', icon: 'bg-orange-100 text-orange-600', value: 'text-orange-700' },
  purple: { bg: 'bg-purple-50', icon: 'bg-purple-100 text-purple-600', value: 'text-purple-700' },
  red:    { bg: 'bg-red-50',    icon: 'bg-red-100 text-red-600',     value: 'text-red-700' },
};

export function StatsCard({ label, value, sub, icon: Icon, color = 'blue', className }: StatsCardProps) {
  const colors = colorMap[color];
  return (
    <Card className={cn('overflow-hidden', className)}>
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm font-medium text-gray-500">{label}</p>
            <p className={cn('text-2xl font-bold mt-1', colors.value)}>{value}</p>
            {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
          </div>
          <div className={cn('p-3 rounded-xl', colors.icon)}>
            <Icon className="w-6 h-6" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
