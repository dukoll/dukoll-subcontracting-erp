'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, ShoppingCart } from 'lucide-react';
import { toast } from 'sonner';

import { createClient } from '@/lib/supabase/client';
import { canSeePricing } from '@/lib/permissions';
import { formatDate, formatCurrency, voucherStatusColor, voucherStatusLabel } from '@/lib/utils';
import type { UserRole, PurchaseVoucher } from '@/types';

import { PageHeader } from '@/components/shared/PageHeader';
import { EmptyState } from '@/components/shared/EmptyState';
import { VoucherFilters } from '@/components/shared/VoucherFilters';
import { ExpandableVoucherTable, type ExpandItem, type VoucherColumn } from '@/components/shared/ExpandableVoucherTable';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';

type Row = PurchaseVoucher & { _items?: ExpandItem[] };

export default function PurchaseVouchersPage() {
  const router = useRouter();
  const [role, setRole] = useState<UserRole>('store');
  const [vouchers, setVouchers] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');

  useEffect(() => {
    async function init() {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
        if (profile) setRole(profile.role as UserRole);
      }
      const { data, error } = await supabase
        .from('purchase_vouchers')
        .select('*, supplier:suppliers(id, name), items:purchase_voucher_items(quantity, item:items(item_name), uom:uoms(abbreviation), godown:godowns(name))')
        .order('date', { ascending: false })
        .order('created_at', { ascending: false });

      if (error) {
        toast.error('Failed to load purchase vouchers');
      } else {
        setVouchers((data ?? []).map((v: PurchaseVoucher & { items?: { quantity: number; item?: { item_name: string }; uom?: { abbreviation: string }; godown?: { name: string } }[] }) => ({
          ...v,
          _items: (v.items ?? []).map(it => ({ name: it.item?.item_name ?? '—', qty: it.quantity, uom: it.uom?.abbreviation, detail: it.godown?.name })),
        })));
      }
      setLoading(false);
    }
    init();
  }, []);

  const showPricing = canSeePricing(role);

  const q = search.trim().toLowerCase();
  const filtered = vouchers.filter(v => {
    if (status && v.status !== status) return false;
    if (q && !(`${v.voucher_no} ${v.supplier?.name ?? ''}`.toLowerCase().includes(q))) return false;
    return true;
  });

  const columns: VoucherColumn<Row>[] = [
    { header: 'Voucher No', render: v => <span className="font-mono text-sm font-medium">{v.voucher_no}</span> },
    { header: 'Date', render: v => formatDate(v.date) },
    { header: 'Supplier', render: v => v.supplier?.name ?? '—' },
    { header: 'Godown', render: v => (v as Row & { items?: { godown?: { name: string } }[] }).items?.[0]?.godown?.name ?? '—' },
    { header: 'Items', className: 'text-center', render: v => (v._items?.length ?? 0) },
    ...(showPricing ? [{ header: 'Total Amount', className: 'text-right', render: (v: Row) => <span className="font-medium">{formatCurrency(v.total_amount)}</span> }] : []),
    { header: 'Status', render: v => <Badge className={voucherStatusColor(v.status)}>{voucherStatusLabel(v.status)}</Badge> },
  ];

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <PageHeader
        title="Purchase Vouchers"
        description="Record goods received from suppliers"
        breadcrumbs={[{ label: 'Vouchers' }, { label: 'Purchase' }]}
        actions={<Button onClick={() => router.push('/vouchers/purchase/new')}><Plus className="w-4 h-4 mr-2" />New Purchase Voucher</Button>}
      />

      {loading ? (
        <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full rounded-lg" />)}</div>
      ) : vouchers.length === 0 ? (
        <EmptyState
          icon={ShoppingCart}
          title="No purchase vouchers yet"
          description="Create your first purchase voucher to record incoming goods."
          action={<Button onClick={() => router.push('/vouchers/purchase/new')}><Plus className="w-4 h-4 mr-2" />New Purchase Voucher</Button>}
        />
      ) : (
        <>
          <VoucherFilters search={search} onSearch={setSearch} status={status} onStatus={setStatus} searchPlaceholder="Search voucher no or supplier…" />
          {filtered.length === 0 ? (
            <EmptyState icon={ShoppingCart} title="No matching vouchers" description="Try adjusting the search or status filter." />
          ) : (
            <ExpandableVoucherTable columns={columns} rows={filtered} storageKey="purchase-vouchers" onRowClick={id => router.push(`/vouchers/purchase/${id}`)} />
          )}
        </>
      )}
    </div>
  );
}
