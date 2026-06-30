'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { canSeePricing } from '@/lib/permissions';
import { formatCurrency, formatNumber, formatDate } from '@/lib/utils';
import type { UserRole, ProductionVoucher } from '@/types';
import { PageHeader } from '@/components/shared/PageHeader';
import { AccessDenied } from '@/components/shared/AccessDenied';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { FileText } from 'lucide-react';

interface ConsumedLine {
  item_id: string;
  item_name: string;
  item_type: string;
  quantity: number;
  uom_abbr: string;
  rate: number | null;
  amount: number;
}

interface InvoiceCalc {
  voucher: ProductionVoucher;
  lines: ConsumedLine[];
  materialTotal: number;
  labourCharge: number;
  otherCharges: number;
  totalInvoice: number;
}

export default function SubcontractorInvoicePage() {
  const [role, setRole] = useState<UserRole | null>(null);
  const [vouchers, setVouchers] = useState<ProductionVoucher[]>([]);
  const [selectedVoucher, setSelectedVoucher] = useState('');
  const [labourCharge, setLabourCharge] = useState('');
  const [otherCharges, setOtherCharges] = useState('');
  const [calc, setCalc] = useState<InvoiceCalc | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    async function init() {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
      if (profile) setRole(profile.role as UserRole);
      const { data } = await supabase
        .from('production_vouchers')
        .select('*, finished_item:finished_item_id(*), subcontractor:subcontractor_id(*), uom:uom_id(*), bom:bom_id(*)')
        .eq('status', 'approved')
        .order('date', { ascending: false });
      if (data) setVouchers(data as ProductionVoucher[]);
    }
    init();
  }, []);

  if (role === null) return <div className="p-8 text-center text-gray-400">Loading...</div>;
  if (!canSeePricing(role)) return <AccessDenied />;

  async function loadInvoice() {
    if (!selectedVoucher) return;
    setLoading(true);
    const supabase = createClient();
    const voucher = vouchers.find(v => v.id === selectedVoucher);
    if (!voucher) { setLoading(false); return; }

    const { data: vItems } = await supabase
      .from('production_voucher_items')
      .select('*, item:item_id(*), uom:uom_id(*)')
      .eq('voucher_id', selectedVoucher)
      .eq('movement_type', 'consumed');

    const lines: ConsumedLine[] = [];
    for (const vi of vItems ?? []) {
      const { data: priceData } = await supabase
        .from('raw_material_prices')
        .select('price_per_uom')
        .eq('item_id', vi.item_id)
        .lte('effective_from', voucher.date)
        .or(`effective_to.is.null,effective_to.gte.${voucher.date}`)
        .eq('is_active', true)
        .order('effective_from', { ascending: false })
        .limit(1)
        .single();

      const rate = priceData?.price_per_uom ?? null;
      lines.push({
        item_id: vi.item_id,
        item_name: vi.item?.item_name ?? '—',
        item_type: vi.item?.item_type ?? '',
        quantity: vi.quantity,
        uom_abbr: vi.uom?.abbreviation ?? '',
        rate,
        amount: rate != null ? vi.quantity * rate : 0,
      });
    }

    const materialTotal = lines.reduce((s, l) => s + l.amount, 0);
    const labour = parseFloat(labourCharge) || 0;
    const other = parseFloat(otherCharges) || 0;

    setCalc({ voucher, lines, materialTotal, labourCharge: labour, otherCharges: other, totalInvoice: materialTotal + labour + other });
    setLoading(false);
  }

  const voucher = vouchers.find(v => v.id === selectedVoucher);

  return (
    <div className="p-6">
      <PageHeader
        title="Subcontractor Invoice Calculator"
        description="Calculate the invoice value for a production voucher"
        breadcrumbs={[{ label: 'Pricing' }, { label: 'Subcontractor Invoice' }]}
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-1">
          <CardHeader><CardTitle className="flex items-center gap-2"><FileText className="w-5 h-5" />Parameters</CardTitle></CardHeader>
          <CardContent className="grid gap-4">
            <div className="grid gap-1.5">
              <Label>Production Voucher *</Label>
              <Select value={selectedVoucher} onValueChange={setSelectedVoucher}>
                <SelectTrigger><SelectValue placeholder="Select voucher" /></SelectTrigger>
                <SelectContent>
                  {vouchers.map(v => (
                    <SelectItem key={v.id} value={v.id}>
                      {v.voucher_no} — {formatDate(v.date)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {voucher && (
              <div className="text-sm text-gray-600 bg-gray-50 rounded p-3 space-y-1">
                <div><span className="font-medium">Item: </span>{voucher.finished_item?.item_name}</div>
                <div><span className="font-medium">Qty: </span>{formatNumber(voucher.production_quantity)} {voucher.uom?.abbreviation}</div>
                <div><span className="font-medium">Subcontractor: </span>{voucher.subcontractor?.name ?? '—'}</div>
                <div><span className="font-medium">Date: </span>{formatDate(voucher.date)}</div>
              </div>
            )}
            <div className="grid gap-1.5">
              <Label>Labour / Service Charge (₹)</Label>
              <Input type="number" step="0.01" value={labourCharge} onChange={e => setLabourCharge(e.target.value)} placeholder="0.00" />
            </div>
            <div className="grid gap-1.5">
              <Label>Other Charges (₹)</Label>
              <Input type="number" step="0.01" value={otherCharges} onChange={e => setOtherCharges(e.target.value)} placeholder="0.00" />
            </div>
            <Button onClick={loadInvoice} disabled={!selectedVoucher || loading} className="w-full">
              {loading ? 'Loading...' : 'Calculate Invoice'}
            </Button>
          </CardContent>
        </Card>

        <div className="lg:col-span-2">
          {calc ? (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>Invoice Breakdown</CardTitle>
                  <Badge className="bg-green-100 text-green-800">Approved</Badge>
                </div>
                <p className="text-sm text-gray-500">
                  Voucher: {calc.voucher.voucher_no} | Date: {formatDate(calc.voucher.date)} | Subcontractor: {calc.voucher.subcontractor?.name ?? '—'}
                </p>
              </CardHeader>
              <CardContent>
                <div className="rounded-lg border overflow-hidden mb-4">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Item</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead className="text-right">Qty</TableHead>
                        <TableHead>UOM</TableHead>
                        <TableHead className="text-right">Rate</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {calc.lines.map((line, i) => (
                        <TableRow key={i}>
                          <TableCell className="font-medium">{line.item_name}</TableCell>
                          <TableCell>
                            <Badge variant="secondary" className="text-xs">
                              {line.item_type === 'raw_material' ? 'RM' : line.item_type === 'packing_material' ? 'PM' : line.item_type}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">{formatNumber(line.quantity)}</TableCell>
                          <TableCell>{line.uom_abbr}</TableCell>
                          <TableCell className="text-right">
                            {line.rate != null ? formatCurrency(line.rate) : <span className="text-amber-600 text-xs">No price</span>}
                          </TableCell>
                          <TableCell className="text-right font-medium">{formatCurrency(line.amount)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                <div className="space-y-2 text-sm">
                  <div className="flex justify-between font-semibold">
                    <span>Material Total</span>
                    <span>{formatCurrency(calc.materialTotal)}</span>
                  </div>
                  <div className="flex justify-between text-gray-600">
                    <span>Labour / Service Charge</span>
                    <span>{formatCurrency(calc.labourCharge)}</span>
                  </div>
                  <div className="flex justify-between text-gray-600">
                    <span>Other Charges</span>
                    <span>{formatCurrency(calc.otherCharges)}</span>
                  </div>
                  <Separator />
                  <div className="flex justify-between items-center pt-1">
                    <span className="text-lg font-bold">Total Invoice Value</span>
                    <Badge className="text-base px-4 py-1.5 bg-blue-600">{formatCurrency(calc.totalInvoice)}</Badge>
                  </div>
                </div>

                {calc.lines.some(l => l.rate === null) && (
                  <p className="mt-3 text-xs text-amber-600 bg-amber-50 rounded p-2">
                    Some items have no effective price on {formatDate(calc.voucher.date)}. Invoice may be understated.
                  </p>
                )}
              </CardContent>
            </Card>
          ) : (
            <div className="flex items-center justify-center h-64 border-2 border-dashed rounded-lg text-gray-400">
              <div className="text-center">
                <FileText className="w-10 h-10 mx-auto mb-2 opacity-30" />
                <p>Select a production voucher and click Calculate</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
