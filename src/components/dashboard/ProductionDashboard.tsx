'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Factory, ClipboardList, Package } from 'lucide-react';
import { StatsCard } from '@/components/shared/StatsCard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { createClient } from '@/lib/supabase/client';
import { formatDate, formatNumber } from '@/lib/utils';

export function ProductionDashboard({ name }: { name: string }) {
  const [stats, setStats] = useState({ todayQty: 0, todayBatches: 0, activeBOMs: 0 });
  const [recent, setRecent] = useState<{ no: string; item: string; qty: number; date: string }[]>([]);

  useEffect(() => {
    async function load() {
      const supabase = createClient();
      const today = new Date().toISOString().slice(0, 10);

      const [todayProd, boms] = await Promise.all([
        supabase.from('production_vouchers').select('voucher_no,production_quantity,date,finished_item_id')
          .eq('date', today).eq('status', 'approved'),
        supabase.from('bom_headers').select('id', { count: 'exact', head: true }).eq('is_active', true),
      ]);

      const todayData = todayProd.data ?? [];
      setStats({
        todayQty: todayData.reduce((s, r) => s + Number(r.production_quantity), 0),
        todayBatches: todayData.length,
        activeBOMs: boms.count ?? 0,
      });

      const recent = await supabase
        .from('production_vouchers')
        .select('voucher_no, production_quantity, date, finished_item:finished_item_id(item_name)')
        .order('created_at', { ascending: false })
        .limit(5);

      setRecent((recent.data ?? []).map(r => ({
        no: r.voucher_no,
        item: (r.finished_item as { item_name: string } | null)?.item_name ?? '',
        qty: r.production_quantity,
        date: r.date,
      })));
    }
    load();
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Production Dashboard</h1>
        <p className="text-gray-500 text-sm mt-1">Welcome, {name}</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <StatsCard label="Today's Output (Kg)" value={formatNumber(stats.todayQty, 0)} icon={Factory}       color="green" />
        <StatsCard label="Today's Batches"     value={stats.todayBatches}               icon={ClipboardList} color="blue" />
        <StatsCard label="Active BOMs"         value={stats.activeBOMs}                 icon={Package}       color="purple" />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Link href="/vouchers/production/new" className="flex items-center justify-center p-4 rounded-xl bg-green-600 text-white font-semibold hover:bg-green-700 transition">
          + New Production
        </Link>
        <Link href="/masters/bom" className="flex items-center justify-center p-4 rounded-xl bg-white border border-gray-200 hover:border-red-300 transition text-sm font-medium text-gray-700">
          View BOMs
        </Link>
        <Link href="/reports/production" className="flex items-center justify-center p-4 rounded-xl bg-white border border-gray-200 hover:border-red-300 transition text-sm font-medium text-gray-700">
          Production Report
        </Link>
        <Link href="/reports/stock-balance" className="flex items-center justify-center p-4 rounded-xl bg-white border border-gray-200 hover:border-red-300 transition text-sm font-medium text-gray-700">
          Stock Balance
        </Link>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Recent Production</CardTitle>
        </CardHeader>
        <CardContent>
          {recent.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-6">No production recorded yet.</p>
          ) : (
            <div className="space-y-2">
              {recent.map((v, i) => (
                <div key={i} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                  <div>
                    <div className="text-sm font-mono text-gray-700">{v.no}</div>
                    <div className="text-xs text-gray-500">{v.item}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-semibold text-green-700">{formatNumber(v.qty, 0)} Kg</div>
                    <div className="text-xs text-gray-400">{formatDate(v.date)}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
