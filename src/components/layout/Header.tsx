'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Menu, Bell, LogOut, User, ChevronDown } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';
import { roleLabel } from '@/lib/utils';
import type { UserRole } from '@/types';

interface HeaderProps {
  userName: string;
  role: UserRole;
  onMenuClick: () => void;
}

export function Header({ userName, role, onMenuClick }: HeaderProps) {
  const router = useRouter();
  const [dropOpen, setDropOpen] = useState(false);

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    toast.success('Signed out');
    router.push('/auth/login');
    router.refresh();
  }

  const initials = userName
    .split(' ')
    .map(n => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  return (
    <header className="h-16 bg-white border-b border-gray-200 flex items-center px-4 gap-4 sticky top-0 z-10">
      {/* Mobile menu toggle */}
      <button
        onClick={onMenuClick}
        className="lg:hidden p-2 rounded-lg text-gray-500 hover:bg-gray-100 touch-target"
        aria-label="Open menu"
      >
        <Menu className="w-5 h-5" />
      </button>

      {/* Page title spacer */}
      <div className="flex-1" />

      {/* Notification bell */}
      <button className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 touch-target relative">
        <Bell className="w-5 h-5" />
      </button>

      {/* User menu */}
      <div className="relative">
        <button
          onClick={() => setDropOpen(v => !v)}
          className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-gray-100 transition touch-target"
        >
          <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
            {initials}
          </div>
          <div className="hidden sm:block text-left">
            <div className="text-sm font-medium text-gray-900 leading-none">{userName}</div>
            <div className="text-xs text-gray-500 mt-0.5">{roleLabel(role)}</div>
          </div>
          <ChevronDown className="w-4 h-4 text-gray-400 hidden sm:block" />
        </button>

        {dropOpen && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setDropOpen(false)} />
            <div className="absolute right-0 mt-1 w-48 bg-white rounded-xl shadow-lg border border-gray-200 py-1 z-20">
              <div className="px-4 py-2 border-b border-gray-100">
                <div className="text-sm font-medium text-gray-900 truncate">{userName}</div>
                <div className="text-xs text-gray-500 capitalize">{roleLabel(role)}</div>
              </div>
              <button
                onClick={handleLogout}
                className="w-full flex items-center gap-2 px-4 py-2 text-sm text-red-600 hover:bg-red-50 transition"
              >
                <LogOut className="w-4 h-4" />
                Sign Out
              </button>
            </div>
          </>
        )}
      </div>
    </header>
  );
}
