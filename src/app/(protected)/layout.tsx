import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { AppShell } from '@/components/layout/AppShell';
import type { UserRole } from '@/types';

export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect('/auth/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, role, email')
    .eq('id', user.id)
    .single();

  if (!profile) redirect('/auth/login');

  return (
    <AppShell
      userName={profile.full_name}
      role={profile.role as UserRole}
    >
      {children}
    </AppShell>
  );
}
