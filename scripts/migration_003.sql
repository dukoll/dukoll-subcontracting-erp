-- ============================================================
-- Migration 003 — run ONCE in the Supabase SQL editor.
-- Bundles every pending database change:
--   #4  Stock only moves on SUBMIT (draft vouchers no longer affect stock)
--   #5  Assign a BOM to a subcontractor
--   #6  Admin-created users with a username (login by username OR email)
-- Safe to re-run (idempotent).
-- ============================================================

-- ── #4  Submit-gated stock: views count only status = 'approved' ─────
CREATE OR REPLACE VIEW v_stock_balance AS
WITH mv AS (
  SELECT pvi.item_id, pvi.godown_id, pvi.quantity AS in_qty, 0 AS out_qty, pv.date
  FROM   purchase_voucher_items pvi JOIN purchase_vouchers pv ON pv.id = pvi.voucher_id
  WHERE  pv.status = 'approved'
  UNION ALL
  SELECT sti.item_id, stv.from_godown_id, 0, sti.quantity, stv.date
  FROM   stock_transfer_items sti JOIN stock_transfer_vouchers stv ON stv.id = sti.voucher_id
  WHERE  stv.status = 'approved'
  UNION ALL
  SELECT sti.item_id, stv.to_godown_id, sti.quantity, 0, stv.date
  FROM   stock_transfer_items sti JOIN stock_transfer_vouchers stv ON stv.id = sti.voucher_id
  WHERE  stv.status = 'approved'
  UNION ALL
  SELECT pvi.item_id, pvi.godown_id, 0, pvi.quantity, pv.date
  FROM   production_voucher_items pvi JOIN production_vouchers pv ON pv.id = pvi.voucher_id
  WHERE  pv.status = 'approved' AND pvi.movement_type = 'consumed'
  UNION ALL
  SELECT pv.finished_item_id, pv.finished_goods_godown_id, pv.production_quantity, 0, pv.date
  FROM   production_vouchers pv WHERE pv.status = 'approved'
  UNION ALL
  SELECT svi.item_id, svi.godown_id, 0, svi.quantity, sv.date
  FROM   sales_voucher_items svi JOIN sales_vouchers sv ON sv.id = svi.voucher_id
  WHERE  sv.status = 'approved'
)
SELECT
  mv.item_id, i.item_name, i.item_type,
  mv.godown_id, g.name AS godown_name, g.godown_type,
  u.name AS uom_name, u.abbreviation AS uom_abbr,
  SUM(mv.in_qty) AS total_in, SUM(mv.out_qty) AS total_out,
  SUM(mv.in_qty) - SUM(mv.out_qty) AS balance_qty
FROM   mv
JOIN   items   i ON i.id = mv.item_id
JOIN   godowns g ON g.id = mv.godown_id
JOIN   uoms    u ON u.id = i.uom_id
GROUP  BY mv.item_id, i.item_name, i.item_type,
          mv.godown_id, g.name, g.godown_type, u.name, u.abbreviation;

CREATE OR REPLACE VIEW v_stock_ledger AS
  SELECT pv.date, 'Purchase'::text AS voucher_type, pv.voucher_no, pvi.item_id, pvi.godown_id,
         pvi.quantity AS in_qty, 0::NUMERIC AS out_qty
  FROM   purchase_voucher_items pvi JOIN purchase_vouchers pv ON pv.id = pvi.voucher_id
  WHERE  pv.status = 'approved'
UNION ALL
  SELECT stv.date,'Stock Transfer (Out)', stv.voucher_no, sti.item_id, stv.from_godown_id, 0, sti.quantity
  FROM   stock_transfer_items sti JOIN stock_transfer_vouchers stv ON stv.id = sti.voucher_id
  WHERE  stv.status = 'approved'
UNION ALL
  SELECT stv.date,'Stock Transfer (In)', stv.voucher_no, sti.item_id, stv.to_godown_id, sti.quantity, 0
  FROM   stock_transfer_items sti JOIN stock_transfer_vouchers stv ON stv.id = sti.voucher_id
  WHERE  stv.status = 'approved'
UNION ALL
  SELECT pv.date,'Production (Consumed)', pv.voucher_no, pvi.item_id, pvi.godown_id, 0, pvi.quantity
  FROM   production_voucher_items pvi JOIN production_vouchers pv ON pv.id = pvi.voucher_id
  WHERE  pv.status = 'approved' AND pvi.movement_type = 'consumed'
UNION ALL
  SELECT pv.date,'Production (Finished)', pv.voucher_no, pv.finished_item_id, pv.finished_goods_godown_id,
         pv.production_quantity, 0
  FROM   production_vouchers pv WHERE pv.status = 'approved'
UNION ALL
  SELECT sv.date,'Sales/Dispatch', sv.voucher_no, svi.item_id, svi.godown_id, 0, svi.quantity
  FROM   sales_voucher_items svi JOIN sales_vouchers sv ON sv.id = svi.voucher_id
  WHERE  sv.status = 'approved';

-- ── #5  Assign a BOM to a subcontractor ──────────────────────────────
ALTER TABLE bom_headers
  ADD COLUMN IF NOT EXISTS subcontractor_id UUID REFERENCES suppliers(id);

-- ── #6  Username on profiles + login-by-username lookup ──────────────
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS username TEXT;

-- Case-insensitive uniqueness for usernames (ignores NULLs).
CREATE UNIQUE INDEX IF NOT EXISTS profiles_username_lower_key
  ON profiles (lower(username)) WHERE username IS NOT NULL;

-- Resolve a username to its email so the login screen can accept either.
-- SECURITY DEFINER so it can read profiles before the user is signed in.
CREATE OR REPLACE FUNCTION get_email_for_username(p_username TEXT)
RETURNS TEXT LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT email FROM profiles WHERE lower(username) = lower(p_username) LIMIT 1;
$$;
GRANT EXECUTE ON FUNCTION get_email_for_username(TEXT) TO anon, authenticated;
