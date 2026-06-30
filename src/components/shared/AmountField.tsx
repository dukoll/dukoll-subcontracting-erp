import { canSeePricing } from '@/lib/permissions';
import type { UserRole } from '@/types';

interface AmountFieldProps {
  role: UserRole;
  value: React.ReactNode;
  className?: string;
}

/**
 * Renders the value only if the user has pricing access (admin/accounting).
 * For all other roles returns null — used to hide rate/amount/cost columns.
 */
export function AmountField({ role, value, className }: AmountFieldProps) {
  if (!canSeePricing(role)) return null;
  return <span className={className}>{value}</span>;
}

/**
 * Used for table headers — returns null for non-pricing roles.
 */
export function AmountHeader({ role, label }: { role: UserRole; label: string }) {
  if (!canSeePricing(role)) return null;
  return <>{label}</>;
}
