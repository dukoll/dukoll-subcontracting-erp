'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { IndianRupee, TrendingUp, FileText, AlertTriangle } from 'lucide-react';
import { StatsCard } from '@/components/shared/StatsCard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { createClient } from '@/lib/supabase/client';
import { formatCurrency, formatDate } from '@/lib/utils';

export function AccountingDashboard({ name }: { name: string }) {
  const [stats, setStats] = useState({ activePrices: 0, monthProd: 0, priceChanges: 0 });
  const [recentPrices, setRecentPrices] = useState<{ item: string; price: number; date: string }[]>([]);

  useEffect(() => {
    async function load() {
      const supabase = createClient();
      const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10);

      const [prices, monthProd, priceChanges] = await Promise.all([
        supabase.from('raw_material_prices').select('id', { count: 'exact', head: true }).eq('is_active', true),
        supabase.from('production_vouchers').select('production_quantity').gte('date', startOfMonth).eq('status', 'approved'),
        supabase.from('raw_material_prices').select('id', { count: 'exact', head: true }).gte('created_at', startOfMonth),
      ]);

      setStats({
        activePrices: prices.count ?? 0,
        monthProd: (monthProd.data ?? []).reduce((s, r) => s + Number(r.production_quantity), 0),
        priceChanges: priceChanges.count ?? 0,
      });

      const rp = await supabase
        .from('raw_material_prices')
        .select('price_per_uom, effective_from, item:item_id(item_name)')
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(5);

      setRecentPrices((rp.data ?? []).map(r => ({
        item: (r.item as { item_name: string } | null)?.item_name ?? '',
        price: r.price_per_uom,
        date: r.effective_from,
      })));
    }
    load();
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Accounting Dashboard</h1>
        <p className="text-gray-500 text-sm mt-1">Welcome, {name}</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <StatsCard label="Active Price Entries"   value={stats.activePrices}                   icon={IndianRupee}  color="green" />
        <StatsCard label="Month Production (Kg)"  value={stats.monthProd.toLocaleString('en-IN')} icon={TrendingUp}   color="blue" />
        <StatsCard label="Price Changes This Month" value={stats.priceChanges}                icon={AlertTriangle} color="orange" />
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {[
          { label: 'Raw Material Prices',   href: '/pricing/raw-material-prices' },
          { label: 'Cost Calculator',        href: '/pricing/cost-calculator' },
          { label: 'Subcontractor Invoice',  href: '/pricing/subcontractor-invoice' },
          { label: 'Cost Report',            href: '/reports/cost-report' },
          { label: 'Invoice Report',         href: '/reports/invoice-report' },
          { label: 'Price History',          href: '/reports/price-history' },
        ].map(item => (
          <Link
            key={item.label}
            href={item.href}
            className="flex items-center justify-center p-4 rounded-xl bg-white border border-gray-200 hover:border-red-300 hover:shadow-sm transition text-sm font-medium text-gray-700 text-center"
          >
            {item.label}
          </Link>
        ))}
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Current Active Prices</CardTitle>
        </CardHeader>
        <CardContent>
          {recentPrices.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-6">No prices configured yet.</p>
          ) : (
            <div className="space-y-2">
              {recentPrices.map((p, i) => (
                <div key={i} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                  <div className="text-sm text-gray-700">{p.item}</div>
                  <div className="text-right">
                    <div className="text-sm font-semibold text-green-700">{formatCurrency(p.price)}</div>
                    <div className="text-xs text-gray-400">From {formatDate(p.date)}</div>
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
