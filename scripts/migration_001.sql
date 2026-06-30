-- ============================================================
-- Migration 001 — ERP change requests (item/supplier/customer/BOM/voucher)
-- Safe to run once on the existing database.
-- ============================================================

-- ── #1 Item Master: remove item_code, add weight (Kg) ──────────
-- v_stock_balance depends on items.item_code, so drop it first, then recreate.
DROP VIEW IF EXISTS v_stock_balance;
ALTER TABLE items DROP COLUMN IF EXISTS item_code;
ALTER TABLE items ADD COLUMN IF NOT EXISTS weight_kg NUMERIC(12,3);

-- ── #6 + #11 Suppliers: remove code, add default godown ────────
ALTER TABLE suppliers DROP COLUMN IF EXISTS code;
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS default_godown_id UUID REFERENCES godowns(id);

-- ── #15 Customers: remove code + address, add city ─────────────
ALTER TABLE customers DROP COLUMN IF EXISTS code;
ALTER TABLE customers DROP COLUMN IF EXISTS address;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS city TEXT;

-- ── #5 BOM: remove wastage percentage ──────────────────────────
ALTER TABLE bom_headers DROP COLUMN IF EXISTS wastage_pct;
ALTER TABLE bom_items   DROP COLUMN IF EXISTS wastage_pct;

-- ── #9 Production: single source godown on the header ──────────
ALTER TABLE production_vouchers ADD COLUMN IF NOT EXISTS source_godown_id UUID REFERENCES godowns(id);

-- ── #12 Sales: single godown on the header ─────────────────────
ALTER TABLE sales_vouchers ADD COLUMN IF NOT EXISTS godown_id UUID REFERENCES godowns(id);

-- ── Recreate v_stock_balance without item_code ─────────────────
CREATE OR REPLACE VIEW v_stock_balance AS
WITH mv AS (
  SELECT pvi.item_id, pvi.godown_id, pvi.quantity AS in_qty, 0 AS out_qty, pv.date
  FROM   purchase_voucher_items pvi JOIN purchase_vouchers pv ON pv.id = pvi.voucher_id
  WHERE  pv.status != 'cancelled'
  UNION ALL
  SELECT sti.item_id, stv.from_godown_id, 0, sti.quantity, stv.date
  FROM   stock_transfer_items sti JOIN stock_transfer_vouchers stv ON stv.id = sti.voucher_id
  WHERE  stv.status != 'cancelled'
  UNION ALL
  SELECT sti.item_id, stv.to_godown_id, sti.quantity, 0, stv.date
  FROM   stock_transfer_items sti JOIN stock_transfer_vouchers stv ON stv.id = sti.voucher_id
  WHERE  stv.status != 'cancelled'
  UNION ALL
  SELECT pvi.item_id, pvi.godown_id, 0, pvi.quantity, pv.date
  FROM   production_voucher_items pvi JOIN production_vouchers pv ON pv.id = pvi.voucher_id
  WHERE  pv.status != 'cancelled' AND pvi.movement_type = 'consumed'
  UNION ALL
  SELECT pv.finished_item_id, pv.finished_goods_godown_id, pv.production_quantity, 0, pv.date
  FROM   production_vouchers pv WHERE pv.status != 'cancelled'
  UNION ALL
  SELECT svi.item_id, svi.godown_id, 0, svi.quantity, sv.date
  FROM   sales_voucher_items svi JOIN sales_vouchers sv ON sv.id = svi.voucher_id
  WHERE  sv.status != 'cancelled'
)
SELECT
  mv.item_id,
  i.item_name,
  i.item_type,
  mv.godown_id,
  g.name   AS godown_name,
  g.godown_type,
  u.name         AS uom_name,
  u.abbreviation AS uom_abbr,
  SUM(mv.in_qty)  AS total_in,
  SUM(mv.out_qty) AS total_out,
  SUM(mv.in_qty) - SUM(mv.out_qty) AS balance_qty
FROM   mv
JOIN   items   i ON i.id = mv.item_id
JOIN   godowns g ON g.id = mv.godown_id
JOIN   uoms    u ON u.id = i.uom_id
GROUP  BY mv.item_id, i.item_name, i.item_type,
          mv.godown_id, g.name, g.godown_type, u.name, u.abbreviation;

-- ── #13 Sequential voucher numbering (PREFIX-001, continuous) ───
CREATE TABLE IF NOT EXISTS number_sequences (
  prefix        TEXT PRIMARY KEY,
  current_value INTEGER NOT NULL DEFAULT 0
);

CREATE OR REPLACE FUNCTION next_voucher_no(p_prefix TEXT)
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v INTEGER;
BEGIN
  INSERT INTO number_sequences(prefix, current_value) VALUES (p_prefix, 1)
  ON CONFLICT (prefix) DO UPDATE SET current_value = number_sequences.current_value + 1
  RETURNING current_value INTO v;
  RETURN p_prefix || '-' || lpad(v::text, 3, '0');
END;
$$;

-- Assign a sequential voucher_no on insert when one isn't supplied.
CREATE OR REPLACE FUNCTION assign_voucher_no()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.voucher_no IS NULL OR NEW.voucher_no = '' THEN
    NEW.voucher_no := next_voucher_no(TG_ARGV[0]);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS st_assign_no ON stock_transfer_vouchers;
CREATE TRIGGER st_assign_no BEFORE INSERT ON stock_transfer_vouchers
  FOR EACH ROW EXECUTE FUNCTION assign_voucher_no('ST');

DROP TRIGGER IF EXISTS pr_assign_no ON production_vouchers;
CREATE TRIGGER pr_assign_no BEFORE INSERT ON production_vouchers
  FOR EACH ROW EXECUTE FUNCTION assign_voucher_no('PR');

-- Allow authenticated users to call the generator (used indirectly by triggers).
GRANT EXECUTE ON FUNCTION next_voucher_no(TEXT) TO authenticated;
