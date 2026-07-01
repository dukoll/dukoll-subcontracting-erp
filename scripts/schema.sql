-- ============================================================
-- DUKOLL SUB-CONTRACTING ERP - Database Schema
-- Run this in your Supabase SQL Editor
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ── Enums ──────────────────────────────────────────────────
CREATE TYPE user_role      AS ENUM ('admin','accounting','store','production','viewer');
CREATE TYPE item_type      AS ENUM ('raw_material','packing_material','finished_goods','service');
CREATE TYPE godown_type    AS ENUM ('company','subcontractor','raw_material_store','finished_goods_store','production_floor');
CREATE TYPE voucher_status AS ENUM ('draft','approved','cancelled');

-- ── Profiles (mirrors auth.users) ──────────────────────────
CREATE TABLE profiles (
  id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name   TEXT        NOT NULL,
  email       TEXT        NOT NULL,
  role        user_role   NOT NULL DEFAULT 'viewer',
  phone       TEXT,
  is_active   BOOLEAN     NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Module-level permission overrides ───────────────────────
CREATE TABLE module_permissions (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID REFERENCES profiles(id) ON DELETE CASCADE,
  module      TEXT NOT NULL,  -- 'masters','vouchers','pricing','reports','admin'
  can_view    BOOLEAN DEFAULT false,
  can_add     BOOLEAN DEFAULT false,
  can_edit    BOOLEAN DEFAULT false,
  can_delete  BOOLEAN DEFAULT false,
  can_approve BOOLEAN DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, module)
);

-- ── Item Groups ─────────────────────────────────────────────
CREATE TABLE item_groups (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name        TEXT NOT NULL UNIQUE,
  description TEXT,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by  UUID REFERENCES profiles(id)
);

-- ── UOM Master ──────────────────────────────────────────────
CREATE TABLE uoms (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name         TEXT NOT NULL UNIQUE,
  abbreviation TEXT NOT NULL,
  is_active    BOOLEAN NOT NULL DEFAULT true,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Item Master ─────────────────────────────────────────────
CREATE TABLE items (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  item_code      TEXT NOT NULL UNIQUE,
  item_name      TEXT NOT NULL,
  item_group_id  UUID REFERENCES item_groups(id),
  uom_id         UUID REFERENCES uoms(id),
  item_type      item_type NOT NULL,
  description    TEXT,
  is_active      BOOLEAN NOT NULL DEFAULT true,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by     UUID REFERENCES profiles(id)
);

-- ── Godown Master ───────────────────────────────────────────
CREATE TABLE godowns (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name             TEXT NOT NULL UNIQUE,
  godown_type      godown_type NOT NULL,
  parent_godown_id UUID REFERENCES godowns(id),
  address          TEXT,
  is_active        BOOLEAN NOT NULL DEFAULT true,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Suppliers / Subcontractors ───────────────────────────────
CREATE TABLE suppliers (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name             TEXT NOT NULL,
  code             TEXT UNIQUE,
  phone            TEXT,
  email            TEXT,
  address          TEXT,
  gst_no           TEXT,
  is_subcontractor BOOLEAN NOT NULL DEFAULT false,
  is_active        BOOLEAN NOT NULL DEFAULT true,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Customers ────────────────────────────────────────────────
CREATE TABLE customers (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name       TEXT NOT NULL,
  code       TEXT UNIQUE,
  phone      TEXT,
  email      TEXT,
  address    TEXT,
  gst_no     TEXT,
  is_active  BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── BOM Headers ─────────────────────────────────────────────
CREATE TABLE bom_headers (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  bom_code         TEXT NOT NULL UNIQUE,
  finished_item_id UUID NOT NULL REFERENCES items(id),
  output_quantity  NUMERIC(15,3) NOT NULL,
  uom_id           UUID REFERENCES uoms(id),
  effective_from   DATE NOT NULL,
  effective_to     DATE,
  wastage_pct      NUMERIC(5,2) NOT NULL DEFAULT 0,
  is_active        BOOLEAN NOT NULL DEFAULT true,
  notes            TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by       UUID REFERENCES profiles(id)
);

-- ── BOM Items ────────────────────────────────────────────────
CREATE TABLE bom_items (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  bom_id       UUID NOT NULL REFERENCES bom_headers(id) ON DELETE CASCADE,
  item_id      UUID NOT NULL REFERENCES items(id),
  quantity     NUMERIC(15,3) NOT NULL,
  uom_id       UUID REFERENCES uoms(id),
  wastage_pct  NUMERIC(5,2) NOT NULL DEFAULT 0,
  seq_no       INTEGER,
  notes        TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Purchase Vouchers ────────────────────────────────────────
CREATE TABLE purchase_vouchers (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  voucher_no            TEXT NOT NULL UNIQUE,
  date                  DATE NOT NULL,
  supplier_id           UUID REFERENCES suppliers(id),
  supplier_invoice_no   TEXT,
  supplier_invoice_date DATE,
  status                voucher_status NOT NULL DEFAULT 'approved',
  total_amount          NUMERIC(15,2),
  notes                 TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by            UUID REFERENCES profiles(id),
  approved_by           UUID REFERENCES profiles(id)
);

CREATE TABLE purchase_voucher_items (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  voucher_id  UUID NOT NULL REFERENCES purchase_vouchers(id) ON DELETE CASCADE,
  item_id     UUID NOT NULL REFERENCES items(id),
  quantity    NUMERIC(15,3) NOT NULL,
  uom_id      UUID REFERENCES uoms(id),
  godown_id   UUID REFERENCES godowns(id),
  rate        NUMERIC(15,4),
  amount      NUMERIC(15,2),
  seq_no      INTEGER,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Stock Transfer Vouchers ──────────────────────────────────
CREATE TABLE stock_transfer_vouchers (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  voucher_no      TEXT NOT NULL UNIQUE,
  date            DATE NOT NULL,
  from_godown_id  UUID NOT NULL REFERENCES godowns(id),
  to_godown_id    UUID NOT NULL REFERENCES godowns(id),
  status          voucher_status NOT NULL DEFAULT 'approved',
  transfer_value  NUMERIC(15,2),
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by      UUID REFERENCES profiles(id),
  approved_by     UUID REFERENCES profiles(id)
);

CREATE TABLE stock_transfer_items (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  voucher_id   UUID NOT NULL REFERENCES stock_transfer_vouchers(id) ON DELETE CASCADE,
  item_id      UUID NOT NULL REFERENCES items(id),
  quantity     NUMERIC(15,3) NOT NULL,
  uom_id       UUID REFERENCES uoms(id),
  transfer_rate NUMERIC(15,4),
  seq_no       INTEGER,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Production Vouchers ──────────────────────────────────────
CREATE TABLE production_vouchers (
  id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  voucher_no              TEXT NOT NULL UNIQUE,
  date                    DATE NOT NULL,
  subcontractor_id        UUID REFERENCES suppliers(id),
  bom_id                  UUID NOT NULL REFERENCES bom_headers(id),
  finished_item_id        UUID NOT NULL REFERENCES items(id),
  production_quantity     NUMERIC(15,3) NOT NULL,
  uom_id                  UUID REFERENCES uoms(id),
  finished_goods_godown_id UUID NOT NULL REFERENCES godowns(id),
  status                  voucher_status NOT NULL DEFAULT 'approved',
  production_cost         NUMERIC(15,2),
  notes                   TEXT,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by              UUID REFERENCES profiles(id),
  approved_by             UUID REFERENCES profiles(id)
);

CREATE TABLE production_voucher_items (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  voucher_id    UUID NOT NULL REFERENCES production_vouchers(id) ON DELETE CASCADE,
  item_id       UUID NOT NULL REFERENCES items(id),
  quantity      NUMERIC(15,3) NOT NULL,
  uom_id        UUID REFERENCES uoms(id),
  godown_id     UUID REFERENCES godowns(id),
  movement_type TEXT NOT NULL CHECK (movement_type IN ('consumed','produced')),
  cost          NUMERIC(15,2),
  seq_no        INTEGER,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Sales / Dispatch Vouchers ────────────────────────────────
CREATE TABLE sales_vouchers (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  voucher_no   TEXT NOT NULL UNIQUE,
  date         DATE NOT NULL,
  customer_id  UUID REFERENCES customers(id),
  status       voucher_status NOT NULL DEFAULT 'approved',
  total_amount NUMERIC(15,2),
  notes        TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by   UUID REFERENCES profiles(id),
  approved_by  UUID REFERENCES profiles(id)
);

CREATE TABLE sales_voucher_items (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  voucher_id    UUID NOT NULL REFERENCES sales_vouchers(id) ON DELETE CASCADE,
  item_id       UUID NOT NULL REFERENCES items(id),
  quantity      NUMERIC(15,3) NOT NULL,
  uom_id        UUID REFERENCES uoms(id),
  godown_id     UUID REFERENCES godowns(id),
  rate          NUMERIC(15,4),
  amount        NUMERIC(15,2),
  cost_per_unit NUMERIC(15,4),
  seq_no        INTEGER,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Raw Material Price Master ────────────────────────────────
CREATE TABLE raw_material_prices (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  item_id         UUID NOT NULL REFERENCES items(id),
  supplier_id     UUID REFERENCES suppliers(id),
  price_per_uom   NUMERIC(15,4) NOT NULL,
  uom_id          UUID REFERENCES uoms(id),
  effective_from  DATE NOT NULL,
  effective_to    DATE,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  remarks         TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by      UUID REFERENCES profiles(id),
  approved_by     UUID REFERENCES profiles(id)
);

-- ── Audit Logs ───────────────────────────────────────────────
CREATE TABLE audit_logs (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID REFERENCES profiles(id),
  action      TEXT NOT NULL,
  table_name  TEXT,
  record_id   UUID,
  old_values  JSONB,
  new_values  JSONB,
  ip_address  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Stock Balance View ────────────────────────────────────────
CREATE OR REPLACE VIEW v_stock_balance AS
WITH mv AS (
  -- Purchase → in
  SELECT pvi.item_id, pvi.godown_id, pvi.quantity AS in_qty, 0 AS out_qty, pv.date
  FROM   purchase_voucher_items pvi JOIN purchase_vouchers pv ON pv.id = pvi.voucher_id
  WHERE  pv.status = 'approved'
  UNION ALL
  -- Transfer out
  SELECT sti.item_id, stv.from_godown_id, 0, sti.quantity, stv.date
  FROM   stock_transfer_items sti JOIN stock_transfer_vouchers stv ON stv.id = sti.voucher_id
  WHERE  stv.status = 'approved'
  UNION ALL
  -- Transfer in
  SELECT sti.item_id, stv.to_godown_id, sti.quantity, 0, stv.date
  FROM   stock_transfer_items sti JOIN stock_transfer_vouchers stv ON stv.id = sti.voucher_id
  WHERE  stv.status = 'approved'
  UNION ALL
  -- Production consumed → out
  SELECT pvi.item_id, pvi.godown_id, 0, pvi.quantity, pv.date
  FROM   production_voucher_items pvi JOIN production_vouchers pv ON pv.id = pvi.voucher_id
  WHERE  pv.status = 'approved' AND pvi.movement_type = 'consumed'
  UNION ALL
  -- Production finished → in
  SELECT pv.finished_item_id, pv.finished_goods_godown_id, pv.production_quantity, 0, pv.date
  FROM   production_vouchers pv WHERE pv.status = 'approved'
  UNION ALL
  -- Sales → out
  SELECT svi.item_id, svi.godown_id, 0, svi.quantity, sv.date
  FROM   sales_voucher_items svi JOIN sales_vouchers sv ON sv.id = svi.voucher_id
  WHERE  sv.status = 'approved'
)
SELECT
  mv.item_id,
  i.item_code,
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
GROUP  BY mv.item_id, i.item_code, i.item_name, i.item_type,
          mv.godown_id, g.name, g.godown_type, u.name, u.abbreviation;

-- ── Stock Ledger View ─────────────────────────────────────────
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

-- ── Triggers ──────────────────────────────────────────────────
-- SECURITY DEFINER + SET search_path is required: the trigger fires as the
-- supabase_auth_admin role, whose search_path excludes public. Without the
-- search_path and schema-qualified names, the insert fails ("Database error
-- creating new user").
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, email, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email,'@',1)),
    NEW.email,
    COALESCE((NEW.raw_user_meta_data->>'role')::public.user_role, 'viewer')
  );
  RETURN NEW;
END;
$$;

-- Returns the current user's role WITHOUT triggering RLS on profiles.
-- Used by the profiles admin policies below to avoid infinite recursion
-- (a policy on profiles that itself SELECTs from profiles recurses).
CREATE OR REPLACE FUNCTION current_user_role()
RETURNS user_role LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid()
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE TRIGGER profiles_updated_at           BEFORE UPDATE ON profiles           FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER items_updated_at              BEFORE UPDATE ON items              FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER item_groups_updated_at        BEFORE UPDATE ON item_groups        FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER bom_headers_updated_at        BEFORE UPDATE ON bom_headers        FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER purchase_vouchers_updated_at  BEFORE UPDATE ON purchase_vouchers  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER stock_transfer_updated_at     BEFORE UPDATE ON stock_transfer_vouchers FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER production_updated_at         BEFORE UPDATE ON production_vouchers FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER sales_updated_at              BEFORE UPDATE ON sales_vouchers      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER prices_updated_at             BEFORE UPDATE ON raw_material_prices  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── Row-Level Security ────────────────────────────────────────
ALTER TABLE profiles              ENABLE ROW LEVEL SECURITY;
ALTER TABLE module_permissions    ENABLE ROW LEVEL SECURITY;
ALTER TABLE item_groups           ENABLE ROW LEVEL SECURITY;
ALTER TABLE uoms                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE items                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE godowns               ENABLE ROW LEVEL SECURITY;
ALTER TABLE suppliers             ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers             ENABLE ROW LEVEL SECURITY;
ALTER TABLE bom_headers           ENABLE ROW LEVEL SECURITY;
ALTER TABLE bom_items             ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_vouchers     ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_voucher_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_transfer_vouchers ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_transfer_items  ENABLE ROW LEVEL SECURITY;
ALTER TABLE production_vouchers   ENABLE ROW LEVEL SECURITY;
ALTER TABLE production_voucher_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales_vouchers        ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales_voucher_items   ENABLE ROW LEVEL SECURITY;
ALTER TABLE raw_material_prices   ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs            ENABLE ROW LEVEL SECURITY;

-- profiles: own row + admin sees all
CREATE POLICY "profiles_select_own"   ON profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "profiles_select_admin" ON profiles FOR SELECT USING (
  current_user_role() = 'admin'
);
CREATE POLICY "profiles_all_admin"    ON profiles FOR ALL USING (
  current_user_role() = 'admin'
) WITH CHECK (current_user_role() = 'admin');

-- module_permissions
CREATE POLICY "mp_select_own"   ON module_permissions FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "mp_all_admin"    ON module_permissions FOR ALL USING (
  (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
);

-- Masters: any authenticated user reads; admin writes
CREATE POLICY "ig_select" ON item_groups FOR SELECT TO authenticated USING (true);
CREATE POLICY "ig_write"  ON item_groups FOR ALL   TO authenticated USING (
  (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
);
CREATE POLICY "uom_select" ON uoms FOR SELECT TO authenticated USING (true);
CREATE POLICY "uom_write"  ON uoms FOR ALL   TO authenticated USING (
  (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
);
CREATE POLICY "items_select" ON items FOR SELECT TO authenticated USING (true);
CREATE POLICY "items_write"  ON items FOR ALL   TO authenticated USING (
  (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
);
CREATE POLICY "godowns_select" ON godowns FOR SELECT TO authenticated USING (true);
CREATE POLICY "godowns_write"  ON godowns FOR ALL   TO authenticated USING (
  (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
);
CREATE POLICY "suppliers_select" ON suppliers FOR SELECT TO authenticated USING (true);
CREATE POLICY "suppliers_write"  ON suppliers FOR ALL   TO authenticated USING (
  (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
);
CREATE POLICY "customers_select" ON customers FOR SELECT TO authenticated USING (true);
CREATE POLICY "customers_write"  ON customers FOR ALL   TO authenticated USING (
  (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
);
CREATE POLICY "bom_h_select" ON bom_headers FOR SELECT TO authenticated USING (true);
CREATE POLICY "bom_h_write"  ON bom_headers FOR ALL   TO authenticated USING (
  (SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin','production')
);
CREATE POLICY "bom_i_select" ON bom_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "bom_i_write"  ON bom_items FOR ALL   TO authenticated USING (
  (SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin','production')
);

-- Vouchers: authenticated reads; admin/accounting/store/production write
CREATE POLICY "pv_select"  ON purchase_vouchers  FOR SELECT TO authenticated USING (true);
CREATE POLICY "pv_write"   ON purchase_vouchers  FOR ALL    TO authenticated USING (
  (SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin','accounting','store')
);
CREATE POLICY "pvi_select" ON purchase_voucher_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "pvi_write"  ON purchase_voucher_items FOR ALL TO authenticated USING (
  (SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin','accounting','store')
);
CREATE POLICY "stv_select" ON stock_transfer_vouchers FOR SELECT TO authenticated USING (true);
CREATE POLICY "stv_write"  ON stock_transfer_vouchers FOR ALL  TO authenticated USING (
  (SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin','accounting','store')
);
CREATE POLICY "sti_select" ON stock_transfer_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "sti_write"  ON stock_transfer_items FOR ALL   TO authenticated USING (
  (SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin','accounting','store')
);
CREATE POLICY "prodv_select" ON production_vouchers FOR SELECT TO authenticated USING (true);
CREATE POLICY "prodv_write"  ON production_vouchers FOR ALL   TO authenticated USING (
  (SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin','accounting','production')
);
CREATE POLICY "prodvi_select" ON production_voucher_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "prodvi_write"  ON production_voucher_items FOR ALL TO authenticated USING (
  (SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin','accounting','production')
);
CREATE POLICY "sv_select" ON sales_vouchers FOR SELECT TO authenticated USING (true);
CREATE POLICY "sv_write"  ON sales_vouchers FOR ALL   TO authenticated USING (
  (SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin','accounting','store')
);
CREATE POLICY "svi_select" ON sales_voucher_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "svi_write"  ON sales_voucher_items FOR ALL   TO authenticated USING (
  (SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin','accounting','store')
);

-- Pricing: admin and accounting only
CREATE POLICY "rmp_select" ON raw_material_prices FOR SELECT TO authenticated USING (
  (SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin','accounting')
);
CREATE POLICY "rmp_write"  ON raw_material_prices FOR ALL   TO authenticated USING (
  (SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin','accounting')
);

-- Audit logs
CREATE POLICY "al_insert" ON audit_logs FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "al_select_own" ON audit_logs FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "al_select_admin" ON audit_logs FOR SELECT USING (
  (SELECT role FROM profiles WHERE id = auth.uid()) = 'admin'
);
