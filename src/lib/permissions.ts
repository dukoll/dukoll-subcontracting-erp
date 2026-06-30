import type { UserRole } from '@/types';

export interface RoleCapabilities {
  canSeePricing: boolean;
  canAdd: boolean;
  canEdit: boolean;
  canDelete: boolean;
  canApprove: boolean;
  canAccessAdmin: boolean;
  canAccessPricing: boolean;
}

const ROLE_CAPS: Record<UserRole, RoleCapabilities> = {
  admin: {
    canSeePricing:    true,
    canAdd:           true,
    canEdit:          true,
    canDelete:        true,
    canApprove:       true,
    canAccessAdmin:   true,
    canAccessPricing: true,
  },
  accounting: {
    canSeePricing:    true,
    canAdd:           true,
    canEdit:          true,
    canDelete:        false,
    canApprove:       false,
    canAccessAdmin:   false,
    canAccessPricing: true,
  },
  store: {
    canSeePricing:    false,
    canAdd:           true,
    canEdit:          false,
    canDelete:        false,
    canApprove:       false,
    canAccessAdmin:   false,
    canAccessPricing: false,
  },
  production: {
    canSeePricing:    false,
    canAdd:           true,
    canEdit:          false,
    canDelete:        false,
    canApprove:       false,
    canAccessAdmin:   false,
    canAccessPricing: false,
  },
  viewer: {
    canSeePricing:    false,
    canAdd:           false,
    canEdit:          false,
    canDelete:        false,
    canApprove:       false,
    canAccessAdmin:   false,
    canAccessPricing: false,
  },
};

export function getRoleCapabilities(role: UserRole): RoleCapabilities {
  return ROLE_CAPS[role] ?? ROLE_CAPS.viewer;
}

export function canSeePricing(role: UserRole): boolean {
  return role === 'admin' || role === 'accounting';
}

export function canAccessRoute(role: UserRole, pathname: string): boolean {
  if (pathname.startsWith('/admin') && role !== 'admin') return false;
  if (pathname.startsWith('/pricing') && !canSeePricing(role)) return false;
  if (pathname.startsWith('/reports/price-history') && !canSeePricing(role)) return false;
  if (pathname.startsWith('/reports/cost-report') && !canSeePricing(role)) return false;
  if (pathname.startsWith('/reports/invoice-report') && !canSeePricing(role)) return false;
  if (pathname.startsWith('/reports/variance-report') && !canSeePricing(role)) return false;
  return true;
}

export const SIDEBAR_NAV = (role: UserRole) => {
  const isAdmin = role === 'admin';
  const isPricing = canSeePricing(role);
  const isProduction = role === 'production' || isAdmin;
  const isStore = role === 'store' || isAdmin || role === 'accounting';

  return [
    {
      label: 'Dashboard',
      href: '/dashboard',
      icon: 'LayoutDashboard',
      always: true,
    },
    {
      label: 'Masters',
      icon: 'Database',
      always: isAdmin,
      children: [
        { label: 'Items',       href: '/masters/items' },
        { label: 'Item Groups', href: '/masters/item-groups' },
        { label: 'Godowns',     href: '/masters/godowns' },
        { label: 'UOM',         href: '/masters/uom' },
        { label: 'BOM',         href: '/masters/bom' },
        { label: 'Suppliers',   href: '/masters/suppliers' },
        { label: 'Customers',   href: '/masters/customers' },
      ],
    },
    {
      label: 'Vouchers',
      icon: 'FileText',
      always: true,
      children: [
        { label: 'Purchase',       href: '/vouchers/purchase',       show: isStore },
        { label: 'Stock Transfer', href: '/vouchers/stock-transfer', show: isStore },
        { label: 'Production',     href: '/vouchers/production',     show: isProduction },
        { label: 'Sales/Dispatch', href: '/vouchers/sales',          show: isStore },
      ].filter(c => c.show !== false),
    },
    {
      label: 'Pricing',
      icon: 'IndianRupee',
      always: isPricing,
      children: [
        { label: 'Raw Material Prices',   href: '/pricing/raw-material-prices' },
        { label: 'Cost Calculator',        href: '/pricing/cost-calculator' },
        { label: 'Subcontractor Invoice',  href: '/pricing/subcontractor-invoice' },
      ],
    },
    {
      label: 'Reports',
      icon: 'BarChart3',
      always: true,
      children: [
        { label: 'Stock Balance',         href: '/reports/stock-balance' },
        { label: 'Stock Ledger',          href: '/reports/stock-ledger' },
        { label: 'Production Report',     href: '/reports/production' },
        { label: 'Sales Report',          href: '/reports/sales' },
        ...(isPricing ? [
          { label: 'Price History',         href: '/reports/price-history' },
          { label: 'Cost Report',           href: '/reports/cost-report' },
          { label: 'Invoice Report',        href: '/reports/invoice-report' },
          { label: 'Variance Report',       href: '/reports/variance-report' },
        ] : []),
      ],
    },
    {
      label: 'Admin',
      icon: 'ShieldCheck',
      always: isAdmin,
      children: [
        { label: 'Users',       href: '/admin/users' },
        { label: 'Permissions', href: '/admin/permissions' },
        { label: 'Audit Logs',  href: '/admin/audit-logs' },
      ],
    },
  ].filter(item => item.always);
};
