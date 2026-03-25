"use client";
import React, { useState, useRef, useEffect, useCallback, Suspense } from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import {
  LayoutDashboard,
  Users,
  Clock,
  FileText,
  X,
  Menu,
  ChevronDown,
  UserX,
  History,
  Building2,
  Fingerprint,
} from 'lucide-react';

function SidebarInner({ isMobileOpen, setIsMobileOpen, isCollapsed, setIsCollapsed }: any) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const listRef = useRef<HTMLUListElement>(null);
  const [indicator, setIndicator] = useState<{ top: number; height: number } | null>(null);
  const [hasMounted, setHasMounted] = useState(false);
  const [isLg, setIsLg] = useState(false);

  // On mobile (<lg) the sidebar should NEVER appear collapsed — labels must always show
  const collapsed = isCollapsed && isLg;

  useEffect(() => {
    const mql = window.matchMedia('(min-width: 1024px)');
    setIsLg(mql.matches);
    const handler = (e: MediaQueryListEvent) => setIsLg(e.matches);
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, []);

  const currentStatus = searchParams.get('status') || 'Active';
  const isInactivePage = pathname === '/hr/employees' && currentStatus === 'Inactive';
  const isAuditPage = pathname === '/hr/adjust';
  const isOnEmployees = pathname === '/hr/employees';
  const isOnReports = pathname === '/hr/reports' || isAuditPage;
  const isOnOrganization = pathname.startsWith('/hr/departments') || pathname.startsWith('/hr/branches');
  const isOnShifts = pathname.startsWith('/hr/shifts');

  const [employeesOpen, setEmployeesOpen] = useState(isOnEmployees || isInactivePage);
  const [reportsOpen, setReportsOpen] = useState(isOnReports);

  // All rendered <li> items in order for indicator measurement
  const allItems = [
    { href: '/hr/dashboard' },
    { href: '/hr/attendance' },
    { href: '/hr/employees', matchPrefix: '/hr/employees' },
    { href: '/hr/shifts', matchPrefix: '/hr/shifts' },
    { href: '/hr/departments', matchFn: (p: string) => p.startsWith('/hr/departments') || p.startsWith('/hr/branches') },
    { href: '/hr/reports', matchFn: (p: string) => p.startsWith('/hr/reports') || p === '/hr/adjust' },
  ];

  const activeIndex = allItems.findIndex(item =>
    'matchFn' in item ? item.matchFn?.(pathname) : item.matchPrefix ? pathname.startsWith(item.matchPrefix) : pathname === item.href
  );

  const updateIndicator = useCallback(() => {
    if (!listRef.current || activeIndex < 0) return;
    const items = listRef.current.querySelectorAll<HTMLLIElement>(':scope > li');
    const activeLi = items[activeIndex];
    if (!activeLi) return;
    setIndicator({ top: activeLi.offsetTop, height: activeLi.offsetHeight });
  }, [activeIndex]);

  useEffect(() => {
    updateIndicator();
    const timer = setTimeout(() => setHasMounted(true), 50);
    return () => clearTimeout(timer);
  }, [updateIndicator]);

  // Re-measure after submenu animations complete
  useEffect(() => {
    const timer = setTimeout(updateIndicator, 320);
    return () => clearTimeout(timer);
  }, [employeesOpen, reportsOpen, collapsed, updateIndicator]);

  const labelStyle = {
    opacity: collapsed ? 0 : 1,
    width: collapsed ? 0 : 'auto',
    overflow: 'hidden' as const,
    transition: 'opacity 300ms cubic-bezier(0.4, 0, 0.2, 1), width 300ms cubic-bezier(0.4, 0, 0.2, 1)',
  };

  return (
    <aside className={`
      fixed top-24 bottom-4 left-4 z-[60] bg-[#E60000] flex flex-col transition-all duration-300 ease-in-out overflow-y-auto overflow-x-hidden scrollbar-hide
      rounded-[20px]
      ${isMobileOpen ? 'translate-x-0' : '-translate-x-[120%]'}
      w-72 lg:translate-x-0
      ${collapsed ? 'lg:w-20' : 'lg:w-63'}
    `}>

      {/* Header */}
      <div className="flex items-center h-20 shrink-0 px-7 justify-start relative">
        <div className="w-6 flex items-center justify-center shrink-0">
          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="text-white hover:bg-white/10 p-2 rounded-xl transition-colors hidden lg:block"
          >
            <Menu size={24} />
          </button>
        </div>
        <span
          className="font-bold text-xl text-white whitespace-nowrap ml-4"
          style={labelStyle}
        >
          HR Panel
        </span>
        <button onClick={() => setIsMobileOpen(false)} className="lg:hidden absolute right-8 text-white p-2">
          <X size={24} />
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 mt-2 relative flex flex-col min-h-0">
        <ul ref={listRef} className="relative">

          {/* Sliding indicator */}
          {indicator && activeIndex >= 0 && (
            <div
              className="absolute left-4 right-0 bg-gray-50 rounded-l-[30px] z-0"
              style={{
                top: indicator.top,
                height: indicator.height,
                transition: hasMounted
                  ? 'top 350ms cubic-bezier(0.4, 0, 0.2, 1), height 350ms cubic-bezier(0.4, 0, 0.2, 1)'
                  : 'none',
              }}
            >
              <div className="absolute right-0 -top-[30px] w-[30px] h-[30px] bg-gray-50 hidden lg:block" style={{ opacity: collapsed ? 0 : 1 }}>
                <div className="absolute inset-0 bg-[#E60000] rounded-br-[30px]" />
              </div>
              <div className="absolute right-0 -bottom-[30px] w-[30px] h-[30px] bg-gray-50 hidden lg:block" style={{ opacity: collapsed ? 0 : 1 }}>
                <div className="absolute inset-0 bg-[#E60000] rounded-tr-[30px]" />
              </div>
            </div>
          )}

          {/* Dashboard */}
          <li className="relative" style={{ padding: '0 0 0 16px', overflow: 'visible' }}>
            <Link
              href="/hr/dashboard"
              onClick={() => setIsMobileOpen(false)}
              className={`flex items-center gap-4 py-3 relative z-10 ${pathname === '/hr/dashboard' ? 'text-[#E60000]' : 'text-white/60 hover:text-white'}`}
              style={{ paddingLeft: '12px', paddingRight: collapsed ? '12px' : '24px' }}
              title={collapsed ? 'Dashboard' : undefined}
            >
              <LayoutDashboard size={22} className={`shrink-0 ${pathname === '/hr/dashboard' ? 'text-[#E60000]' : 'text-white'}`} />
              <span className="font-bold text-lg whitespace-nowrap" style={labelStyle}>Dashboard</span>
            </Link>
          </li>

          {/* Attendance */}
          <li className="relative" style={{ padding: '0 0 0 16px', overflow: 'visible' }}>
            <Link
              href="/hr/attendance"
              onClick={() => setIsMobileOpen(false)}
              className={`flex items-center gap-4 py-3 relative z-10 ${pathname === '/hr/attendance' ? 'text-[#E60000]' : 'text-white/60 hover:text-white'}`}
              style={{ paddingLeft: '12px', paddingRight: collapsed ? '12px' : '24px' }}
              title={collapsed ? 'Attendance' : undefined}
            >
              <Fingerprint size={22} className={`shrink-0 ${pathname === '/hr/attendance' ? 'text-[#E60000]' : 'text-white'}`} />
              <span className="font-bold text-lg whitespace-nowrap" style={labelStyle}>Attendance</span>
            </Link>
          </li>

          {/* Employees (with submenu) */}
          <li className="relative" style={{ padding: '0 0 0 16px', overflow: 'visible' }}>
            <div className="flex items-center relative z-10">
              <Link
                href="/hr/employees?status=Active"
                onClick={() => setIsMobileOpen(false)}
                className={`flex items-center gap-4 py-3 flex-1 ${isOnEmployees || isInactivePage ? 'text-[#E60000]' : 'text-white/60 hover:text-white'}`}
                style={{ paddingLeft: '12px' }}
                title={collapsed ? 'Employees' : undefined}
              >
                <Users size={22} className={`shrink-0 ${isOnEmployees || isInactivePage ? 'text-[#E60000]' : 'text-white'}`} />
                <span className="font-bold text-lg whitespace-nowrap" style={labelStyle}>Employees</span>
              </Link>
              {!collapsed && (
                <button
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); setEmployeesOpen(o => !o); }}
                  className={`p-2 mr-2 rounded-lg transition-colors shrink-0 ${isOnEmployees || isInactivePage ? 'text-[#E60000]' : 'text-white/60 hover:text-white'}`}
                  title="Toggle submenu"
                >
                  <ChevronDown
                    size={16}
                    style={{ transition: 'transform 300ms cubic-bezier(0.4, 0, 0.2, 1)', transform: employeesOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}
                  />
                </button>
              )}
            </div>

            {/* Inactive sub-item */}
            {!collapsed && (
              <div
                style={{
                  maxHeight: employeesOpen ? '56px' : '0px',
                  overflow: 'hidden',
                  transition: 'max-height 300ms cubic-bezier(0.4, 0, 0.2, 1)',
                }}
              >
                <div className="pl-4 pr-3 pb-2 relative z-10">
                  <Link
                    href="/hr/employees?status=Inactive"
                    onClick={() => setIsMobileOpen(false)}
                    className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-semibold transition-colors ${isInactivePage
                      ? 'text-[#E60000]'
                      : isOnEmployees
                        ? 'text-[#E60000]/60 hover:text-[#E60000]'
                        : 'text-white/60 hover:text-white'
                      }`}
                  >
                    <UserX size={15} className="shrink-0" />
                    Inactive Employees
                  </Link>
                </div>
              </div>
            )}
          </li>

          {/* Shifts */}
          <li className="relative" style={{ padding: '0 0 0 16px', overflow: 'visible' }}>
            <Link
              href="/hr/shifts"
              onClick={() => setIsMobileOpen(false)}
              className={`flex items-center gap-4 py-3 relative z-10 ${isOnShifts ? 'text-[#E60000]' : 'text-white/60 hover:text-white'}`}
              style={{ paddingLeft: '12px', paddingRight: collapsed ? '12px' : '24px' }}
              title={collapsed ? 'Shifts' : undefined}
            >
              <Clock size={22} className={`shrink-0 ${isOnShifts ? 'text-[#E60000]' : 'text-white'}`} />
              <span className="font-bold text-lg whitespace-nowrap" style={labelStyle}>Shifts</span>
            </Link>
          </li>

          {/* Organization */}
          <li className="relative" style={{ padding: '0 0 0 16px', overflow: 'visible' }}>
            <Link
              href="/hr/departments"
              onClick={() => setIsMobileOpen(false)}
              className={`flex items-center gap-4 py-3 relative z-10 ${isOnOrganization ? 'text-[#E60000]' : 'text-white/60 hover:text-white'}`}
              style={{ paddingLeft: '12px', paddingRight: collapsed ? '12px' : '24px' }}
              title={collapsed ? 'Organization' : undefined}
            >
              <Building2 size={22} className={`shrink-0 ${isOnOrganization ? 'text-[#E60000]' : 'text-white'}`} />
              <span className="font-bold text-lg whitespace-nowrap" style={labelStyle}>Organization</span>
            </Link>
          </li>

          {/* Reports (with submenu) */}
          <li className="relative" style={{ padding: '0 0 0 16px', overflow: 'visible' }}>
            <div className="flex items-center relative z-10">
              <Link
                href="/hr/reports"
                onClick={() => setIsMobileOpen(false)}
                className={`flex items-center gap-4 py-3 flex-1 ${isOnReports ? 'text-[#E60000]' : 'text-white/60 hover:text-white'}`}
                style={{ paddingLeft: '12px' }}
                title={collapsed ? 'Reports' : undefined}
              >
                <FileText size={22} className={`shrink-0 ${isOnReports ? 'text-[#E60000]' : 'text-white'}`} />
                <span className="font-bold text-lg whitespace-nowrap" style={labelStyle}>Reports</span>
              </Link>
              {!collapsed && (
                <button
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); setReportsOpen(o => !o); }}
                  className={`p-2 mr-2 rounded-lg transition-colors shrink-0 ${isOnReports ? 'text-[#E60000]' : 'text-white/60 hover:text-white'}`}
                  title="Toggle submenu"
                >
                  <ChevronDown
                    size={16}
                    style={{ transition: 'transform 300ms cubic-bezier(0.4, 0, 0.2, 1)', transform: reportsOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}
                  />
                </button>
              )}
            </div>

            {/* Adjustment Logs sub-item */}
            {!collapsed && (
              <div
                style={{
                  maxHeight: reportsOpen ? '56px' : '0px',
                  overflow: 'hidden',
                  transition: 'max-height 300ms cubic-bezier(0.4, 0, 0.2, 1)',
                }}
              >
                <div className="pl-4 pr-3 pb-2 relative z-10">
                  <Link
                    href="/hr/adjust"
                    onClick={() => setIsMobileOpen(false)}
                    className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-semibold transition-colors ${isAuditPage
                      ? 'text-[#E60000]'
                      : isOnReports
                        ? 'text-[#E60000]/60 hover:text-[#E60000]'
                        : 'text-white/60 hover:text-white'
                      }`}
                  >
                    <History size={15} className="shrink-0" />
                    Adjustment Logs
                  </Link>
                </div>
              </div>
            )}
          </li>

        </ul>
      </nav>
    </aside>
  );
}

export default function Sidebar(props: any) {
  return (
    <Suspense fallback={null}>
      <SidebarInner {...props} />
    </Suspense>
  );
}