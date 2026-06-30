import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { AdminDashboard } from '@/components/dashboard/AdminDashboard';
import { StoreDashboard } from '@/components/dashboard/StoreDashboard';
import { ProductionDashboard } from '@/components/dashboard/ProductionDashboard';
import { AccountingDashboard } from '@/components/dashboard/AccountingDashboard';
import type { UserRole } from '@/types';

export default async function DashboardPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/auth/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, full_name')
    .eq('id', user.id)
    .single();

  const role = (profile?.role ?? 'viewer') as UserRole;
  const name = profile?.full_name ?? 'User';

  if (role === 'admin') return <AdminDashboard name={name} />;
  if (role === 'accounting') return <AccountingDashboard name={name} />;
  if (role === 'store') return <StoreDashboard name={name} />;
  if (role === 'production') return <ProductionDashboard name={name} />;

  // Viewer
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-gray-900">Welcome, {name}</h1>
      <p className="text-gray-500">You have read-only access. Contact your administrator for more permissions.</p>
    </div>
  );
}
