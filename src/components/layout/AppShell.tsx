'use client';

import { useState, useEffect } from 'react';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import type { UserRole } from '@/types';

interface AppShellProps {
  userName: string;
  role: UserRole;
  children: React.ReactNode;
}

export function AppShell({ userName, role, children }: AppShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);   // mobile drawer
  const [collapsed, setCollapsed] = useState(false);       // desktop icon rail

  // Remember the collapsed preference across sessions.
  useEffect(() => {
    if (localStorage.getItem('sidebar-collapsed') === '1') setCollapsed(true);
  }, []);

  function toggleCollapse() {
    setCollapsed(prev => {
      const next = !prev;
      localStorage.setItem('sidebar-collapsed', next ? '1' : '0');
      return next;
    });
  }

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      {/* Desktop sidebar */}
      <div className="hidden lg:flex lg:flex-shrink-0">
        <Sidebar role={role} collapsed={collapsed} onToggleCollapse={toggleCollapse} />
      </div>

      {/* Mobile sidebar overlay (always full width) */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 flex lg:hidden">
          <div
            className="fixed inset-0 bg-black/50"
            onClick={() => setSidebarOpen(false)}
          />
          <div className="relative z-50">
            <Sidebar role={role} onClose={() => setSidebarOpen(false)} />
          </div>
        </div>
      )}

      {/* Main content */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <Header
          userName={userName}
          role={role}
          onMenuClick={() => setSidebarOpen(true)}
        />
        <main className="flex-1 overflow-y-auto">
          <div className="p-4 sm:p-6 lg:p-8 max-w-screen-2xl mx-auto">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
