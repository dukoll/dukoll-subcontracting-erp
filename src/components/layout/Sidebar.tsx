'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import {
  LayoutDashboard, Database, FileText, IndianRupee, BarChart3,
  ShieldCheck, ChevronDown, ChevronRight, X, PanelLeftClose, PanelLeftOpen
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { UserRole } from '@/types';
import { SIDEBAR_NAV } from '@/lib/permissions';
import { DukollLogo } from '@/components/shared/DukollLogo';

const ICON_MAP: Record<string, React.ElementType> = {
  LayoutDashboard, Database, FileText, IndianRupee, BarChart3, ShieldCheck,
};

interface SidebarProps {
  role: UserRole;
  onClose?: () => void;            // mobile drawer close button
  collapsed?: boolean;             // desktop icon-rail mode
  onToggleCollapse?: () => void;   // desktop collapse/expand toggle
}

export function Sidebar({ role, onClose, collapsed = false, onToggleCollapse }: SidebarProps) {
  const pathname = usePathname();
  const nav = SIDEBAR_NAV(role);
  const [open, setOpen] = useState<string[]>([]);

  function toggle(label: string) {
    setOpen(prev => prev.includes(label) ? prev.filter(l => l !== label) : [...prev, label]);
  }

  function isActive(href: string) {
    return pathname === href || pathname.startsWith(href + '/');
  }

  return (
    <aside
      className={cn(
        'flex flex-col h-full bg-gray-900 text-white transition-[width] duration-200',
        collapsed ? 'w-16' : 'w-64'
      )}
    >
      {/* Header */}
      <div
        className={cn(
          'flex items-center border-b border-gray-700 px-3 py-5',
          collapsed ? 'justify-center' : 'justify-between'
        )}
      >
        {!collapsed && (
          <Link href="/dashboard" className="flex items-center" onClick={onClose}>
            <DukollLogo className="h-7 w-auto text-white" />
          </Link>
        )}
        {onToggleCollapse && (
          <button
            onClick={onToggleCollapse}
            className="hidden lg:block text-gray-400 hover:text-white p-1"
            title={collapsed ? 'Expand menu' : 'Collapse menu'}
          >
            {collapsed ? <PanelLeftOpen className="w-5 h-5" /> : <PanelLeftClose className="w-5 h-5" />}
          </button>
        )}
        {onClose && (
          <button onClick={onClose} className="lg:hidden text-gray-400 hover:text-white p-1">
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto overflow-x-hidden py-4 px-2 space-y-1">
        {nav.map(item => {
          const Icon = ICON_MAP[item.icon];
          const hasChildren = item.children && item.children.length > 0;
          const isExpanded = open.includes(item.label);

          if (!hasChildren) {
            return (
              <Link
                key={item.label}
                href={item.href!}
                onClick={onClose}
                title={item.label}
                className={cn(
                  'flex items-center rounded-lg text-sm font-medium transition-colors',
                  collapsed ? 'justify-center px-2 py-2.5' : 'gap-3 px-3 py-2.5',
                  isActive(item.href!)
                    ? 'bg-red-600 text-white'
                    : 'text-gray-300 hover:bg-gray-800 hover:text-white'
                )}
              >
                {Icon && <Icon className="w-5 h-5 flex-shrink-0" />}
                {!collapsed && item.label}
              </Link>
            );
          }

          const anyChildActive = item.children!.some(c => isActive(c.href));

          return (
            <div key={item.label}>
              <button
                onClick={() => {
                  if (collapsed) {
                    // expand the rail first, then open this group
                    onToggleCollapse?.();
                    setOpen(prev => prev.includes(item.label) ? prev : [...prev, item.label]);
                  } else {
                    toggle(item.label);
                  }
                }}
                title={item.label}
                className={cn(
                  'w-full flex items-center rounded-lg text-sm font-medium transition-colors',
                  collapsed ? 'justify-center px-2 py-2.5' : 'gap-3 px-3 py-2.5',
                  anyChildActive
                    ? 'bg-gray-800 text-white'
                    : 'text-gray-300 hover:bg-gray-800 hover:text-white'
                )}
              >
                {Icon && <Icon className="w-5 h-5 flex-shrink-0" />}
                {!collapsed && (
                  <>
                    <span className="flex-1 text-left">{item.label}</span>
                    {isExpanded
                      ? <ChevronDown className="w-4 h-4" />
                      : <ChevronRight className="w-4 h-4" />}
                  </>
                )}
              </button>

              {!collapsed && isExpanded && (
                <div className="ml-4 mt-1 space-y-0.5">
                  {item.children!.map(child => (
                    <Link
                      key={child.href}
                      href={child.href}
                      onClick={onClose}
                      className={cn(
                        'flex items-center gap-2 pl-6 pr-3 py-2 rounded-lg text-sm transition-colors',
                        isActive(child.href)
                          ? 'bg-red-600 text-white font-medium'
                          : 'text-gray-400 hover:bg-gray-800 hover:text-white'
                      )}
                    >
                      <span className="w-1.5 h-1.5 rounded-full bg-current flex-shrink-0" />
                      {child.label}
                    </Link>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      {/* Role badge */}
      {!collapsed && (
        <div className="px-4 py-3 border-t border-gray-700">
          <span className="text-xs text-gray-500 uppercase tracking-wider">Role: </span>
          <span className="text-xs text-red-400 font-semibold capitalize">{role}</span>
        </div>
      )}
    </aside>
  );
}
