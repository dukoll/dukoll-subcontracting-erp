'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Package, TrendingUp, Truck, AlertTriangle,
  Users, IndianRupee, Factory, ClipboardList,
} from 'lucide-react';
import { StatsCard } from '@/components/shared/StatsCard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { createClient } from '@/lib/supabase/client';
import { formatDate, formatCurrency } from '@/lib/utils';

interface AdminDashboardProps { name: string; }

export function AdminDashboard({ name }: AdminDashboardProps) {
  const [stats, setStats] = useState({
    totalItems: 0, todayProduction: 0, todayDispatch: 0,
    totalUsers: 0, pendingApprovals: 0,
  });
  const [recentVouchers, setRecentVouchers] = useState<{ type: string; no: string; date: string; }[]>([]);
  const [stockAlerts, setStockAlerts] = useState<{ name: string; qty: number; uom: string }[]>([]);

  useEffect(() => {
    async function load() {
      const supabase = createClient();
      const today = new Date().toISOString().slice(0, 10);

      const [items, users, prodToday, salesToday] = await Promise.all([
        supabase.from('items').select('id', { count: 'exact', head: true }).eq('is_active', true),
        supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('is_active', true),
        supabase.from('production_vouchers').select('production_quantity').eq('date', today).eq('status', 'approved'),
        supabase.from('sales_vouchers').select('id', { count: 'exact', head: true }).eq('date', today).eq('status', 'approved'),
      ]);

      const todayProd = (prodToday.data ?? []).reduce((s, r) => s + Number(r.production_quantity), 0);

      setStats({
        totalItems: items.count ?? 0,
        totalUsers: users.count ?? 0,
        todayProduction: todayProd,
        todayDispatch: salesToday.count ?? 0,
        pendingApprovals: 0,
      });

      // Recent vouchers
      const [pv, st, pr, sv] = await Promise.all([
        supabase.from('purchase_vouchers').select('voucher_no,date').order('created_at', { ascending: false }).limit(2),
        supabase.from('stock_transfer_vouchers').select('voucher_no,date').order('created_at', { ascending: false }).limit(2),
        supabase.from('production_vouchers').select('voucher_no,date').order('created_at', { ascending: false }).limit(2),
        supabase.from('sales_vouchers').select('voucher_no,date').order('created_at', { ascending: false }).limit(2),
      ]);

      const recent = [
        ...(pv.data ?? []).map(v => ({ type: 'Purchase', no: v.voucher_no, date: v.date })),
        ...(st.data ?? []).map(v => ({ type: 'Transfer', no: v.voucher_no, date: v.date })),
        ...(pr.data ?? []).map(v => ({ type: 'Production', no: v.voucher_no, date: v.date })),
        ...(sv.data ?? []).map(v => ({ type: 'Sales', no: v.voucher_no, date: v.date })),
      ].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 6);
      setRecentVouchers(recent);
    }
    load();
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Admin Dashboard</h1>
        <p className="text-gray-500 text-sm mt-1">Welcome back, {name}</p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatsCard label="Active Items"       value={stats.totalItems}      icon={Package}      color="blue" />
        <StatsCard label="Today's Production" value={`${stats.todayProduction} Kg`} icon={Factory} color="green" />
        <StatsCard label="Today's Dispatch"   value={stats.todayDispatch}   icon={Truck}        color="orange" />
        <StatsCard label="Total Users"        value={stats.totalUsers}      icon={Users}        color="purple" />
      </div>

      {/* Quick Links */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Purchase',    href: '/vouchers/purchase/new',       icon: ClipboardList, color: 'text-blue-600 bg-blue-50' },
          { label: 'Transfer',    href: '/vouchers/stock-transfer/new', icon: Truck,         color: 'text-orange-600 bg-orange-50' },
          { label: 'Production',  href: '/vouchers/production/new',     icon: Factory,       color: 'text-green-600 bg-green-50' },
          { label: 'Pricing',     href: '/pricing/raw-material-prices', icon: IndianRupee,   color: 'text-purple-600 bg-purple-50' },
        ].map(item => (
          <Link
            key={item.label}
            href={item.href}
            className="flex flex-col items-center gap-2 p-4 rounded-xl bg-white border border-gray-200 hover:border-blue-300 hover:shadow-sm transition"
          >
            <div className={`p-3 rounded-xl ${item.color}`}>
              <item.icon className="w-5 h-5" />
            </div>
            <span className="text-sm font-medium text-gray-700">{item.label}</span>
          </Link>
        ))}
      </div>

      {/* Recent Vouchers */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Recent Transactions</CardTitle>
        </CardHeader>
        <CardContent>
          {recentVouchers.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-6">No transactions yet.</p>
          ) : (
            <div className="space-y-2">
              {recentVouchers.map((v, i) => (
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

      {/* Quick Navigation */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Reports</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-2">
            {[
              { label: 'Stock Balance',   href: '/reports/stock-balance' },
              { label: 'Stock Ledger',    href: '/reports/stock-ledger' },
              { label: 'Cost Report',     href: '/reports/cost-report' },
              { label: 'Price History',   href: '/reports/price-history' },
            ].map(r => (
              <Link key={r.label} href={r.href} className="text-sm text-blue-600 hover:underline py-1">
                {r.label}
              </Link>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Masters</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-2">
            {[
              { label: 'Items',     href: '/masters/items' },
              { label: 'BOM',       href: '/masters/bom' },
              { label: 'Godowns',   href: '/masters/godowns' },
              { label: 'Users',     href: '/admin/users' },
            ].map(r => (
              <Link key={r.label} href={r.href} className="text-sm text-blue-600 hover:underline py-1">
                {r.label}
              </Link>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
