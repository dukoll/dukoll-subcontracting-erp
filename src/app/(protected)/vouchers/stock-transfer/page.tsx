'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, ArrowRightLeft } from 'lucide-react';
import { toast } from 'sonner';

import { createClient } from '@/lib/supabase/client';
import { formatDate, voucherStatusColor } from '@/lib/utils';
import type { UserRole, StockTransferVoucher } from '@/types';

import { PageHeader } from '@/components/shared/PageHeader';
import { EmptyState } from '@/components/shared/EmptyState';
import { ExpandableVoucherTable, type ExpandItem, type VoucherColumn } from '@/components/shared/ExpandableVoucherTable';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';

type Row = StockTransferVoucher & { _items?: ExpandItem[] };

export default function StockTransferPage() {
  const router = useRouter();
  const [vouchers, setVouchers] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function init() {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('stock_transfer_vouchers')
        .select('*, from_godown:godowns!from_godown_id(id, name), to_godown:godowns!to_godown_id(id, name), items:stock_transfer_items(quantity, item:items(item_name), uom:uoms(abbreviation))')
        .order('date', { ascending: false })
        .order('created_at', { ascending: false });

      if (error) {
        toast.error('Failed to load stock transfer vouchers');
      } else {
        setVouchers((data ?? []).map((v: StockTransferVoucher & { items?: { quantity: number; item?: { item_name: string }; uom?: { abbreviation: string } }[] }) => ({
          ...v,
          _items: (v.items ?? []).map(it => ({ name: it.item?.item_name ?? '—', qty: it.quantity, uom: it.uom?.abbreviation })),
        })));
      }
      setLoading(false);
    }
    init();
  }, []);

  const columns: VoucherColumn<Row>[] = [
    { header: 'Voucher No', render: v => <span className="font-mono text-sm font-medium">{v.voucher_no}</span> },
    { header: 'Date', render: v => formatDate(v.date) },
    { header: 'From Godown', render: v => v.from_godown?.name ?? '—' },
    { header: 'To Godown', render: v => <span className="flex items-center gap-1"><ArrowRightLeft className="w-3 h-3 text-gray-400" />{v.to_godown?.name ?? '—'}</span> },
    { header: 'Status', render: v => <Badge className={voucherStatusColor(v.status)}>{v.status.charAt(0).toUpperCase() + v.status.slice(1)}</Badge> },
  ];

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <PageHeader
        title="Stock Transfer Vouchers"
        description="Transfer stock between godowns"
        breadcrumbs={[{ label: 'Vouchers' }, { label: 'Stock Transfer' }]}
        actions={<Button onClick={() => router.push('/vouchers/stock-transfer/new')}><Plus className="w-4 h-4 mr-2" />New Stock Transfer</Button>}
      />

      {loading ? (
        <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full rounded-lg" />)}</div>
      ) : vouchers.length === 0 ? (
        <EmptyState
          icon={ArrowRightLeft}
          title="No stock transfer vouchers yet"
          description="Create a stock transfer to move goods between godowns."
          action={<Button onClick={() => router.push('/vouchers/stock-transfer/new')}><Plus className="w-4 h-4 mr-2" />New Stock Transfer</Button>}
        />
      ) : (
        <ExpandableVoucherTable columns={columns} rows={vouchers} onRowClick={id => router.push(`/vouchers/stock-transfer/${id}`)} />
      )}
    </div>
  );
}
