-- ============================================================
-- DUKOLL ERP - Seed Data
-- Run AFTER schema.sql
-- Note: Admin user must first be created via Supabase Auth UI
--       or the signup page. Then manually set role = 'admin'
--       in the profiles table.
-- ============================================================

-- ── UOM Master ───────────────────────────────────────────────
INSERT INTO uoms (name, abbreviation) VALUES
  ('Kilogram',    'Kg'),
  ('Metric Ton',  'MT'),
  ('Bag',         'Bag'),
  ('Nos',         'Nos'),
  ('Litre',       'Ltr'),
  ('Square Meter','SqM')
ON CONFLICT (name) DO NOTHING;

-- ── Item Groups ───────────────────────────────────────────────
INSERT INTO item_groups (name, description) VALUES
  ('Polymer',        'Polymer raw materials supplied by company'),
  ('Cement',         'Cement procured by subcontractor'),
  ('Sand',           'Sand procured by subcontractor'),
  ('Empty Bags',     'Packing / empty bags supplied by company'),
  ('Finished Goods', 'Manufactured finished goods'),
  ('Service Charge', 'Labour and service charges')
ON CONFLICT (name) DO NOTHING;

-- ── Godowns ───────────────────────────────────────────────────
INSERT INTO godowns (name, godown_type) VALUES
  ('Company Main Godown',         'company'),
  ('Subcontractor Godown',        'subcontractor'),
  ('Raw Material Store',          'raw_material_store'),
  ('Finished Goods Store',        'finished_goods_store'),
  ('Production Floor',            'production_floor')
ON CONFLICT (name) DO NOTHING;

-- ── Items ─────────────────────────────────────────────────────
INSERT INTO items (item_code, item_name, item_group_id, uom_id, item_type) VALUES
  (
    'RM-POL-001', 'Polymer DP-100',
    (SELECT id FROM item_groups WHERE name = 'Polymer'),
    (SELECT id FROM uoms WHERE name = 'Kilogram'),
    'raw_material'
  ),
  (
    'RM-CEM-001', 'OPC Cement 53 Grade',
    (SELECT id FROM item_groups WHERE name = 'Cement'),
    (SELECT id FROM uoms WHERE name = 'Kilogram'),
    'raw_material'
  ),
  (
    'RM-SND-001', 'Dry River Sand',
    (SELECT id FROM item_groups WHERE name = 'Sand'),
    (SELECT id FROM uoms WHERE name = 'Kilogram'),
    'raw_material'
  ),
  (
    'PM-BAG-001', 'Empty HDPE Bag 25Kg',
    (SELECT id FROM item_groups WHERE name = 'Empty Bags'),
    (SELECT id FROM uoms WHERE name = 'Nos'),
    'packing_material'
  ),
  (
    'FG-TA-001', 'Tile Adhesive DU250',
    (SELECT id FROM item_groups WHERE name = 'Finished Goods'),
    (SELECT id FROM uoms WHERE name = 'Kilogram'),
    'finished_goods'
  ),
  (
    'SVC-LAB-001', 'Labour / Service Charge',
    (SELECT id FROM item_groups WHERE name = 'Service Charge'),
    (SELECT id FROM uoms WHERE name = 'Kilogram'),
    'service'
  )
ON CONFLICT (item_code) DO NOTHING;

-- ── Suppliers ─────────────────────────────────────────────────
INSERT INTO suppliers (name, code, phone, is_subcontractor) VALUES
  ('Dukoll Main Polymer Supplier',  'SUP-001', '9999000001', false),
  ('Ravi Construction Subcontractor', 'SC-001', '9999000002', true),
  ('Sharma Sand & Cement Supplier', 'SUP-002', '9999000003', false)
ON CONFLICT (code) DO NOTHING;

-- ── Customers ─────────────────────────────────────────────────
INSERT INTO customers (name, code, phone) VALUES
  ('Internal Transfer - Company', 'CUST-INT', ''),
  ('DU Buildtech Pvt Ltd',        'CUST-001', '9888000001'),
  ('Rajesh Constructions',        'CUST-002', '9888000002')
ON CONFLICT (code) DO NOTHING;

-- ── BOM for Tile Adhesive DU250 ───────────────────────────────
INSERT INTO bom_headers (
  bom_code, finished_item_id, output_quantity, uom_id,
  effective_from, is_active, notes
) VALUES (
  'BOM-TA-001',
  (SELECT id FROM items WHERE item_code = 'FG-TA-001'),
  1000,
  (SELECT id FROM uoms WHERE name = 'Kilogram'),
  '2024-01-01',
  true,
  'Standard BOM for Tile Adhesive DU250 - 1000 Kg batch'
) ON CONFLICT (bom_code) DO NOTHING;

INSERT INTO bom_items (bom_id, item_id, quantity, uom_id, seq_no) VALUES
  (
    (SELECT id FROM bom_headers WHERE bom_code = 'BOM-TA-001'),
    (SELECT id FROM items WHERE item_code = 'RM-POL-001'),
    20, (SELECT id FROM uoms WHERE name = 'Kilogram'), 1
  ),
  (
    (SELECT id FROM bom_headers WHERE bom_code = 'BOM-TA-001'),
    (SELECT id FROM items WHERE item_code = 'RM-CEM-001'),
    350, (SELECT id FROM uoms WHERE name = 'Kilogram'), 2
  ),
  (
    (SELECT id FROM bom_headers WHERE bom_code = 'BOM-TA-001'),
    (SELECT id FROM items WHERE item_code = 'RM-SND-001'),
    630, (SELECT id FROM uoms WHERE name = 'Kilogram'), 3
  ),
  (
    (SELECT id FROM bom_headers WHERE bom_code = 'BOM-TA-001'),
    (SELECT id FROM items WHERE item_code = 'PM-BAG-001'),
    50, (SELECT id FROM uoms WHERE name = 'Nos'), 4
  );

-- ── Sample Raw Material Prices ────────────────────────────────
-- (These will only be visible to Admin and Accounting users)
INSERT INTO raw_material_prices (item_id, price_per_uom, uom_id, effective_from, is_active, remarks)
VALUES
  (
    (SELECT id FROM items WHERE item_code = 'RM-POL-001'),
    120.00,
    (SELECT id FROM uoms WHERE name = 'Kilogram'),
    '2024-01-01', true,
    'Opening price for Polymer DP-100'
  ),
  (
    (SELECT id FROM items WHERE item_code = 'RM-CEM-001'),
    7.00,
    (SELECT id FROM uoms WHERE name = 'Kilogram'),
    '2024-01-01', true,
    'Opening price for OPC Cement'
  ),
  (
    (SELECT id FROM items WHERE item_code = 'RM-SND-001'),
    2.00,
    (SELECT id FROM uoms WHERE name = 'Kilogram'),
    '2024-01-01', true,
    'Opening price for Dry River Sand'
  ),
  (
    (SELECT id FROM items WHERE item_code = 'PM-BAG-001'),
    8.00,
    (SELECT id FROM uoms WHERE name = 'Nos'),
    '2024-01-01', true,
    'Opening price for Empty HDPE Bags'
  ),
  (
    (SELECT id FROM items WHERE item_code = 'SVC-LAB-001'),
    1.00,
    (SELECT id FROM uoms WHERE name = 'Kilogram'),
    '2024-01-01', true,
    'Labour charge per Kg of finished goods'
  );
