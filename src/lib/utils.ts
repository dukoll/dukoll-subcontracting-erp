import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { format } from 'date-fns';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(date: string | Date | null): string {
  if (!date) return '—';
  return format(new Date(date), 'dd/MM/yyyy');
}

export function formatCurrency(amount: number | null | undefined): string {
  if (amount == null) return '—';
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function formatNumber(n: number | null | undefined, decimals = 3): string {
  if (n == null) return '—';
  return new Intl.NumberFormat('en-IN', {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
  }).format(n);
}

export function generateVoucherNo(prefix: string): string {
  const now = new Date();
  const yymm = format(now, 'yyMM');
  const rand = Math.floor(Math.random() * 9000) + 1000;
  return `${prefix}-${yymm}-${rand}`;
}

export function slugify(str: string): string {
  return str.toLowerCase().replace(/\s+/g, '-').replace(/[^\w-]/g, '');
}

export function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1).replace(/_/g, ' ');
}

export function itemTypeLabel(type: string): string {
  const map: Record<string, string> = {
    raw_material: 'Raw Material',
    packing_material: 'Packing Material',
    finished_goods: 'Finished Goods',
    service: 'Service',
  };
  return map[type] ?? type;
}

export function godownTypeLabel(type: string): string {
  const map: Record<string, string> = {
    company: 'Company',
    subcontractor: 'Subcontractor',
    raw_material_store: 'Raw Material Store',
    finished_goods_store: 'Finished Goods Store',
    production_floor: 'Production Floor',
  };
  return map[type] ?? type;
}

export function roleLabel(role: string): string {
  const map: Record<string, string> = {
    admin: 'Admin',
    accounting: 'Accounting',
    store: 'Store',
    production: 'Production',
    viewer: 'Viewer',
  };
  return map[role] ?? role;
}

export function voucherStatusColor(status: string): string {
  const map: Record<string, string> = {
    approved: 'bg-green-100 text-green-800',
    draft: 'bg-yellow-100 text-yellow-800',
    cancelled: 'bg-red-100 text-red-800',
  };
  return map[status] ?? 'bg-gray-100 text-gray-800';
}
