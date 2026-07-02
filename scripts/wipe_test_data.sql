-- ============================================================
-- ONE-TIME: wipe all test data for a fresh start.
-- Keeps user logins (auth.users + profiles). Deletes ALL vouchers,
-- prices, and ALL master data (full blank slate).
-- IRREVERSIBLE — make sure a backup exists before running.
-- ============================================================

TRUNCATE
  purchase_voucher_items, purchase_vouchers,
  stock_transfer_items,  stock_transfer_vouchers,
  production_voucher_items, production_vouchers,
  sales_voucher_items, sales_vouchers,
  raw_material_prices,
  bom_items, bom_headers,
  items, item_groups, uoms, godowns, suppliers, customers
RESTART IDENTITY CASCADE;

-- Restart voucher numbering (PR-001, ST-001, …)
DELETE FROM number_sequences;

-- Clear audit + backup history from testing (ignore if a table is absent)
DO $$ BEGIN
  IF to_regclass('public.audit_logs') IS NOT NULL THEN EXECUTE 'TRUNCATE audit_logs'; END IF;
  IF to_regclass('public.backup_log') IS NOT NULL THEN EXECUTE 'TRUNCATE backup_log'; END IF;
END $$;
