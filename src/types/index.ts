export type UserRole = 'admin' | 'accounting' | 'store' | 'production' | 'viewer';
export type ItemType = 'raw_material' | 'packing_material' | 'finished_goods' | 'service';
export type GodownType = 'company' | 'subcontractor' | 'raw_material_store' | 'finished_goods_store' | 'production_floor';
export type VoucherStatus = 'draft' | 'approved' | 'cancelled';
export type MovementType = 'consumed' | 'produced';

export interface Profile {
  id: string;
  full_name: string;
  email: string;
  role: UserRole;
  phone: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ModulePermission {
  id: string;
  user_id: string;
  module: string;
  can_view: boolean;
  can_add: boolean;
  can_edit: boolean;
  can_delete: boolean;
  can_approve: boolean;
}

export interface ItemGroup {
  id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  created_at: string;
}

export interface UOM {
  id: string;
  name: string;
  abbreviation: string;
  is_active: boolean;
}

export interface Item {
  id: string;
  item_name: string;
  item_group_id: string | null;
  uom_id: string | null;
  item_type: ItemType;
  weight_kg: number | null;
  description: string | null;
  is_active: boolean;
  created_at: string;
  // joins
  item_group?: ItemGroup;
  uom?: UOM;
}

export interface Godown {
  id: string;
  name: string;
  godown_type: GodownType;
  parent_godown_id: string | null;
  address: string | null;
  is_active: boolean;
}

export interface Supplier {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  gst_no: string | null;
  is_subcontractor: boolean;
  default_godown_id: string | null;
  is_active: boolean;
  // joins
  default_godown?: Godown;
}

export interface Customer {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  city: string | null;
  gst_no: string | null;
  is_active: boolean;
}

export interface BOMHeader {
  id: string;
  bom_code: string;
  finished_item_id: string;
  subcontractor_id: string | null;
  output_quantity: number;
  uom_id: string | null;
  effective_from: string;
  effective_to: string | null;
  is_active: boolean;
  notes: string | null;
  created_at: string;
  // joins
  finished_item?: Item;
  subcontractor?: Supplier;
  uom?: UOM;
  bom_items?: BOMItem[];
}

export interface BOMItem {
  id: string;
  bom_id: string;
  item_id: string;
  quantity: number;
  uom_id: string | null;
  seq_no: number | null;
  notes: string | null;
  // joins
  item?: Item;
  uom?: UOM;
}

export interface PurchaseVoucher {
  id: string;
  voucher_no: string;
  date: string;
  supplier_id: string | null;
  supplier_invoice_no: string | null;
  supplier_invoice_date: string | null;
  status: VoucherStatus;
  total_amount: number | null;
  notes: string | null;
  created_at: string;
  // joins
  supplier?: Supplier;
  items?: PurchaseVoucherItem[];
}

export interface PurchaseVoucherItem {
  id: string;
  voucher_id: string;
  item_id: string;
  quantity: number;
  uom_id: string | null;
  godown_id: string | null;
  rate: number | null;
  amount: number | null;
  seq_no: number | null;
  // joins
  item?: Item;
  uom?: UOM;
  godown?: Godown;
}

export interface StockTransferVoucher {
  id: string;
  voucher_no: string;
  date: string;
  from_godown_id: string;
  to_godown_id: string;
  status: VoucherStatus;
  transfer_value: number | null;
  notes: string | null;
  created_at: string;
  // joins
  from_godown?: Godown;
  to_godown?: Godown;
  items?: StockTransferItem[];
}

export interface StockTransferItem {
  id: string;
  voucher_id: string;
  item_id: string;
  quantity: number;
  uom_id: string | null;
  transfer_rate: number | null;
  seq_no: number | null;
  // joins
  item?: Item;
  uom?: UOM;
}

export interface ProductionVoucher {
  id: string;
  voucher_no: string;
  date: string;
  subcontractor_id: string | null;
  bom_id: string | null;
  finished_item_id: string;
  production_quantity: number;
  uom_id: string | null;
  source_godown_id: string | null;
  finished_goods_godown_id: string;
  status: VoucherStatus;
  production_cost: number | null;
  notes: string | null;
  created_at: string;
  // joins
  subcontractor?: Supplier;
  bom?: BOMHeader;
  finished_item?: Item;
  source_godown?: Godown;
  finished_goods_godown?: Godown;
  uom?: UOM;
  items?: ProductionVoucherItem[];
}

export interface ProductionVoucherItem {
  id: string;
  voucher_id: string;
  item_id: string;
  quantity: number;
  uom_id: string | null;
  godown_id: string | null;
  movement_type: MovementType;
  cost: number | null;
  seq_no: number | null;
  // joins
  item?: Item;
  uom?: UOM;
  godown?: Godown;
}

export interface SalesVoucher {
  id: string;
  voucher_no: string;
  date: string;
  customer_id: string | null;
  godown_id: string | null;
  status: VoucherStatus;
  total_amount: number | null;
  notes: string | null;
  created_at: string;
  // joins
  customer?: Customer;
  godown?: Godown;
  items?: SalesVoucherItem[];
}

export interface SalesVoucherItem {
  id: string;
  voucher_id: string;
  item_id: string;
  quantity: number;
  uom_id: string | null;
  godown_id: string | null;
  rate: number | null;
  amount: number | null;
  cost_per_unit: number | null;
  seq_no: number | null;
  // joins
  item?: Item;
  uom?: UOM;
  godown?: Godown;
}

export interface RawMaterialPrice {
  id: string;
  item_id: string;
  supplier_id: string | null;
  price_per_uom: number;
  uom_id: string | null;
  effective_from: string;
  effective_to: string | null;
  is_active: boolean;
  remarks: string | null;
  created_at: string;
  // joins
  item?: Item;
  supplier?: Supplier;
  uom?: UOM;
}

export interface AuditLog {
  id: string;
  user_id: string | null;
  action: string;
  table_name: string | null;
  record_id: string | null;
  old_values: Record<string, unknown> | null;
  new_values: Record<string, unknown> | null;
  ip_address: string | null;
  created_at: string;
  // joins
  user?: Profile;
}

export interface StockBalance {
  item_id: string;
  item_name: string;
  item_type: ItemType;
  godown_id: string;
  godown_name: string;
  godown_type: GodownType;
  uom_name: string;
  uom_abbr: string;
  total_in: number;
  total_out: number;
  balance_qty: number;
}

export interface StockLedgerRow {
  date: string;
  voucher_type: string;
  voucher_no: string;
  item_id: string;
  godown_id: string;
  in_qty: number;
  out_qty: number;
}

export interface ActionResult<T = void> {
  success: boolean;
  data?: T;
  error?: string;
}
