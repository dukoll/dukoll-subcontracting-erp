-- ============================================================
-- Migration 005 — semi-finished goods + BOM-less (manual) production
-- Run once in the Supabase SQL editor.
-- ============================================================

-- New item type for in-house intermediates used in multi-level BOMs.
ALTER TYPE item_type ADD VALUE IF NOT EXISTS 'semi_finished_goods';

-- Allow production vouchers without a BOM (ad-hoc / R&D batches).
ALTER TABLE production_vouchers ALTER COLUMN bom_id DROP NOT NULL;
