import { createClient } from '@/lib/supabase/client';

export interface Outflow {
  item_id: string;
  godown_id: string;
  qty: number;
  item_name?: string; // fallback label if the balance view has no row
}

const EPS = 1e-6;

/**
 * Given a list of stock out-movements (item leaving a godown), returns a list of
 * human-readable shortfall messages for any that exceed the currently available
 * balance. Empty array means every movement is covered.
 *
 * Available balance comes from v_stock_balance, which only counts SUBMITTED
 * vouchers — so this is the real on-hand stock the movement would draw from.
 */
export async function getStockShortfalls(outflows: Outflow[]): Promise<string[]> {
  // Aggregate quantities per item+godown (a voucher can list the same item twice).
  const need = new Map<string, { item_id: string; godown_id: string; qty: number; name?: string }>();
  for (const o of outflows) {
    if (!o.item_id || !o.godown_id || !(o.qty > 0)) continue;
    const key = `${o.item_id}|${o.godown_id}`;
    const cur = need.get(key) ?? { item_id: o.item_id, godown_id: o.godown_id, qty: 0, name: o.item_name };
    cur.qty += o.qty;
    if (o.item_name) cur.name = o.item_name;
    need.set(key, cur);
  }
  const entries = [...need.values()];
  if (entries.length === 0) return [];

  const supabase = createClient();
  const { data } = await supabase
    .from('v_stock_balance')
    .select('item_id, godown_id, balance_qty, item_name, godown_name, uom_abbr')
    .in('item_id', [...new Set(entries.map(e => e.item_id))])
    .in('godown_id', [...new Set(entries.map(e => e.godown_id))]);

  const bal = new Map<string, { qty: number; item: string; godown: string; uom: string }>();
  for (const r of (data ?? []) as Array<{ item_id: string; godown_id: string; balance_qty: number; item_name: string; godown_name: string; uom_abbr: string }>) {
    bal.set(`${r.item_id}|${r.godown_id}`, {
      qty: Number(r.balance_qty) || 0,
      item: r.item_name,
      godown: r.godown_name,
      uom: r.uom_abbr ?? '',
    });
  }

  const shortfalls: string[] = [];
  for (const e of entries) {
    const info = bal.get(`${e.item_id}|${e.godown_id}`);
    const available = info?.qty ?? 0;
    if (e.qty > available + EPS) {
      const name = info?.item ?? e.name ?? 'Item';
      const godown = info?.godown ? ` at ${info.godown}` : '';
      const uom = info?.uom ? ` ${info.uom}` : '';
      shortfalls.push(`${name}${godown}: need ${e.qty}${uom}, only ${available}${uom} available`);
    }
  }
  return shortfalls;
}

/** Standard toast message body for an insufficient-stock error. */
export function stockErrorMessage(shortfalls: string[]): string {
  return `Not enough stock for this movement:\n${shortfalls.join('\n')}\n\nPlease increase the stock (receive/produce/transfer more) before proceeding.`;
}
