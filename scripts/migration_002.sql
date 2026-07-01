-- ============================================================
-- Migration 002 — Submit workflow: only SUBMITTED vouchers affect stock
-- ------------------------------------------------------------
-- Previously the stock views counted every voucher that was not
-- 'cancelled' (so drafts already moved stock). The app now has an
-- explicit Submit step: a voucher stays 'draft' until submitted, and
-- only 'approved' (= submitted) vouchers change stock everywhere.
--
-- These views are recreated to count ONLY status = 'approved'.
-- Existing vouchers are intentionally left as 'draft' (per decision):
-- their stock will appear once they are submitted from the app.
--
-- Safe to run once on the existing database (Supabase SQL editor).
-- ============================================================

-- ── Stock Balance View (submitted only) ───────────────────────
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

-- ── Stock Ledger View (submitted only) ────────────────────────
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
