'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Factory } from 'lucide-react';
import { toast } from 'sonner';

import { createClient } from '@/lib/supabase/client';
import { formatDate, formatNumber, voucherStatusColor } from '@/lib/utils';
import type { UserRole, ProductionVoucher } from '@/types';

import { PageHeader } from '@/components/shared/PageHeader';
import { EmptyState } from '@/components/shared/EmptyState';
import { ExpandableVoucherTable, type ExpandItem, type VoucherColumn } from '@/components/shared/ExpandableVoucherTable';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';

type Row = ProductionVoucher & { _items?: ExpandItem[] };

export default function ProductionVouchersPage() {
  const router = useRouter();
  const [vouchers, setVouchers] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function init() {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('production_vouchers')
        .select('*, subcontractor:suppliers!subcontractor_id(id, name), finished_item:items!finished_item_id(id, item_name), uom:uoms!uom_id(id, abbreviation), items:production_voucher_items(quantity, movement_type, item:items(item_name), uom:uoms(abbreviation))')
        .order('date', { ascending: false })
        .order('created_at', { ascending: false });

      if (error) {
        toast.error('Failed to load production vouchers');
      } else {
        setVouchers((data ?? []).map((v: ProductionVoucher & { items?: { quantity: number; movement_type: string; item?: { item_name: string }; uom?: { abbreviation: string } }[] }) => ({
          ...v,
          _items: (v.items ?? [])
            .sort((a, b) => (a.movement_type === 'produced' ? -1 : 1))
            .map(it => ({ name: it.item?.item_name ?? '—', qty: it.quantity, uom: it.uom?.abbreviation, detail: it.movement_type === 'produced' ? 'Produced' : 'Consumed' })),
        })));
      }
      setLoading(false);
    }
    init();
  }, []);

  const columns: VoucherColumn<Row>[] = [
    { header: 'Voucher No', render: v => <span className="font-mono text-sm font-medium">{v.voucher_no}</span> },
    { header: 'Date', render: v => formatDate(v.date) },
    { header: 'Subcontractor', render: v => v.subcontractor?.name ?? '—' },
    { header: 'Finished Item', render: v => v.finished_item?.item_name ?? '—' },
    { header: 'Production Qty', className: 'text-right', render: v => <>{formatNumber(v.production_quantity)} <span className="text-gray-500 text-xs">{v.uom?.abbreviation ?? ''}</span></> },
    { header: 'Status', render: v => <Badge className={voucherStatusColor(v.status)}>{v.status.charAt(0).toUpperCase() + v.status.slice(1)}</Badge> },
  ];

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <PageHeader
        title="Production Vouchers"
        description="Record subcontractor production batches"
        breadcrumbs={[{ label: 'Vouchers' }, { label: 'Production' }]}
        actions={<Button onClick={() => router.push('/vouchers/production/new')}><Plus className="w-4 h-4 mr-2" />New Production Voucher</Button>}
      />

      {loading ? (
        <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full rounded-lg" />)}</div>
      ) : vouchers.length === 0 ? (
        <EmptyState
          icon={Factory}
          title="No production vouchers yet"
          description="Create a production voucher to record a subcontractor batch."
          action={<Button onClick={() => router.push('/vouchers/production/new')}><Plus className="w-4 h-4 mr-2" />New Production Voucher</Button>}
        />
      ) : (
        <ExpandableVoucherTable columns={columns} rows={vouchers} onRowClick={id => router.push(`/vouchers/production/${id}`)} />
      )}
    </div>
  );
}
