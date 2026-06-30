'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Truck } from 'lucide-react';
import { toast } from 'sonner';

import { createClient } from '@/lib/supabase/client';
import { canSeePricing } from '@/lib/permissions';
import { formatDate, formatCurrency, voucherStatusColor } from '@/lib/utils';
import type { UserRole, SalesVoucher } from '@/types';

import { PageHeader } from '@/components/shared/PageHeader';
import { EmptyState } from '@/components/shared/EmptyState';
import { ExpandableVoucherTable, type ExpandItem, type VoucherColumn } from '@/components/shared/ExpandableVoucherTable';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';

type Row = SalesVoucher & { _items?: ExpandItem[] };

export default function SalesVouchersPage() {
  const router = useRouter();
  const [role, setRole] = useState<UserRole>('store');
  const [vouchers, setVouchers] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function init() {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
        if (profile) setRole(profile.role as UserRole);
      }
      const { data, error } = await supabase
        .from('sales_vouchers')
        .select('*, customer:customers(id, name, city), items:sales_voucher_items(quantity, item:items(item_name), uom:uoms(abbreviation))')
        .order('date', { ascending: false })
        .order('created_at', { ascending: false });

      if (error) {
        toast.error('Failed to load sales vouchers');
      } else {
        setVouchers((data ?? []).map((v: SalesVoucher & { items?: { quantity: number; item?: { item_name: string }; uom?: { abbreviation: string } }[] }) => ({
          ...v,
          _items: (v.items ?? []).map(it => ({ name: it.item?.item_name ?? '—', qty: it.quantity, uom: it.uom?.abbreviation })),
        })));
      }
      setLoading(false);
    }
    init();
  }, []);

  const showPricing = canSeePricing(role);

  const columns: VoucherColumn<Row>[] = [
    { header: 'Sales Order No', render: v => <span className="font-mono text-sm font-medium">{v.voucher_no}</span> },
    { header: 'Date', render: v => formatDate(v.date) },
    { header: 'Customer', render: v => v.customer?.name ?? '—' },
    { header: 'City', render: v => v.customer?.city ?? '—' },
    ...(showPricing ? [{ header: 'Total Amount', className: 'text-right', render: (v: Row) => <span className="font-medium">{formatCurrency(v.total_amount)}</span> }] : []),
    { header: 'Status', render: v => <Badge className={voucherStatusColor(v.status)}>{v.status.charAt(0).toUpperCase() + v.status.slice(1)}</Badge> },
  ];

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <PageHeader
        title="Sales / Dispatch Vouchers"
        description="Record goods dispatched to customers"
        breadcrumbs={[{ label: 'Vouchers' }, { label: 'Sales' }]}
        actions={<Button onClick={() => router.push('/vouchers/sales/new')}><Plus className="w-4 h-4 mr-2" />New Sales Voucher</Button>}
      />

      {loading ? (
        <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full rounded-lg" />)}</div>
      ) : vouchers.length === 0 ? (
        <EmptyState
          icon={Truck}
          title="No sales vouchers yet"
          description="Create a sales voucher to record dispatched goods."
          action={<Button onClick={() => router.push('/vouchers/sales/new')}><Plus className="w-4 h-4 mr-2" />New Sales Voucher</Button>}
        />
      ) : (
        <ExpandableVoucherTable columns={columns} rows={vouchers} onRowClick={id => router.push(`/vouchers/sales/${id}`)} />
      )}
    </div>
  );
}
