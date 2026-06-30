'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Package, TrendingDown, TrendingUp, Truck } from 'lucide-react';
import { StatsCard } from '@/components/shared/StatsCard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { createClient } from '@/lib/supabase/client';
import { formatDate } from '@/lib/utils';

export function StoreDashboard({ name }: { name: string }) {
  const [stats, setStats] = useState({ todayInward: 0, todayOutward: 0, transfers: 0 });
  const [recent, setRecent] = useState<{ type: string; no: string; date: string }[]>([]);

  useEffect(() => {
    async function load() {
      const supabase = createClient();
      const today = new Date().toISOString().slice(0, 10);

      const [pv, st, sv] = await Promise.all([
        supabase.from('purchase_vouchers').select('id', { count: 'exact', head: true }).eq('date', today),
        supabase.from('stock_transfer_vouchers').select('id', { count: 'exact', head: true }).eq('date', today),
        supabase.from('sales_vouchers').select('id', { count: 'exact', head: true }).eq('date', today),
      ]);
      setStats({ todayInward: pv.count ?? 0, todayOutward: sv.count ?? 0, transfers: st.count ?? 0 });

      const [pvr, str] = await Promise.all([
        supabase.from('purchase_vouchers').select('voucher_no,date').order('created_at', { ascending: false }).limit(3),
        supabase.from('stock_transfer_vouchers').select('voucher_no,date').order('created_at', { ascending: false }).limit(3),
      ]);
      setRecent([
        ...(pvr.data ?? []).map(v => ({ type: 'Purchase', no: v.voucher_no, date: v.date })),
        ...(str.data ?? []).map(v => ({ type: 'Transfer', no: v.voucher_no, date: v.date })),
      ].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5));
    }
    load();
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Store Dashboard</h1>
        <p className="text-gray-500 text-sm mt-1">Welcome, {name}</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <StatsCard label="Today's Inward"   value={stats.todayInward}  icon={TrendingUp}  color="green" />
        <StatsCard label="Today's Outward"  value={stats.todayOutward} icon={TrendingDown} color="orange" />
        <StatsCard label="Transfers Today"  value={stats.transfers}    icon={Truck}        color="blue" />
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {[
          { label: 'New Purchase',   href: '/vouchers/purchase/new' },
          { label: 'Stock Transfer', href: '/vouchers/stock-transfer/new' },
          { label: 'Stock Balance',  href: '/reports/stock-balance' },
          { label: 'Stock Ledger',   href: '/reports/stock-ledger' },
          { label: 'Sales/Dispatch', href: '/vouchers/sales/new' },
        ].map(item => (
          <Link
            key={item.label}
            href={item.href}
            className="flex items-center justify-center p-4 rounded-xl bg-white border border-gray-200 hover:border-blue-300 hover:shadow-sm transition text-sm font-medium text-gray-700"
          >
            {item.label}
          </Link>
        ))}
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Recent Stock Activity</CardTitle>
        </CardHeader>
        <CardContent>
          {recent.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-6">No recent activity.</p>
          ) : (
            <div className="space-y-2">
              {recent.map((v, i) => (
                <div key={i} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                  <div className="flex items-center gap-3">
                    <Badge variant="secondary" className="text-xs">{v.type}</Badge>
                    <span className="text-sm font-mono text-gray-700">{v.no}</span>
                  </div>
                  <span className="text-xs text-gray-400">{formatDate(v.date)}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
