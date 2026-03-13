"use client";
import React, { useState, useRef, useEffect, useCallback } from 'react';
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
} from 'lucide-react';

export default function Sidebar({ isMobileOpen, setIsMobileOpen, isCollapsed, setIsCollapsed }: any) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const listRef = useRef<HTMLUListElement>(null);
  const [indicator, setIndicator] = useState<{ top: number; height: number } | null>(null);
  const [hasMounted, setHasMounted] = useState(false);

  const currentStatus = searchParams.get('status') || 'Active';
  const isInactivePage = pathname === '/hr/employees' && currentStatus === 'Inactive';
  const isAuditPage = pathname === '/hr/adjusts';
  const isOnEmployees = pathname === '/hr/employees';
  const isOnReports = pathname === '/hr/reports' || isAuditPage;

  const [employeesOpen, setEmployeesOpen] = useState(isOnEmployees || isInactivePage);
  const [reportsOpen, setReportsOpen] = useState(isOnReports);

  // All rendered <li> items in order for indicator measurement
  const allItems = [
    { href: '/hr/dashboard' },
    { href: '/hr/attendance' },
    { href: '/hr/employees', matchPrefix: '/hr/employees' },
    { href: '/hr/reports', matchPrefix: '/hr/reports' },
  ];

  const activeIndex = allItems.findIndex(item =>
    item.matchPrefix ? pathname.startsWith(item.matchPrefix) : pathname === item.href
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
  }, [employeesOpen, reportsOpen, isCollapsed, updateIndicator]);

  const labelStyle = {
    opacity: isCollapsed ? 0 : 1,
    width: isCollapsed ? 0 : 'auto',
    overflow: 'hidden' as const,
    transition: 'opacity 300ms cubic-bezier(0.4, 0, 0.2, 1), width 300ms cubic-bezier(0.4, 0, 0.2, 1)',
  };

  return (
    <aside className={`
      fixed top-24 bottom-4 left-4 z-[10] bg-[#E60000] flex flex-col transition-all duration-300 ease-in-out overflow-hidden
      rounded-[20px]
      ${isMobileOpen ? 'translate-x-0' : '-translate-x-[120%]'} 
      lg:translate-x-0
      ${isCollapsed ? 'lg:w-20' : 'lg:w-63'}
    `}>

      {/* Header */}
      <div className="flex items-center h-20 shrink-0 px-7 justify-start relative">
        <div className="w-6 flex items-center justify-center shrink-0">
          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="text-white hover:bg-white/10 p-2 rounded-xl transition-colors"
          >
            <Menu size={24} />
          </button>
        </div>
        <span
          className="font-bold text-xl text-white whitespace-nowrap ml-4"
          style={labelStyle}
        >
          Timekeeper Panel
        </span>
        <button onClick={() => setIsMobileOpen(false)} className="lg:hidden absolute right-8 text-white p-2">
          <X size={24} />
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 mt-2 relative flex flex-col h-full">
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
              <div className="absolute right-0 -top-[30px] w-[30px] h-[30px] bg-gray-50 hidden lg:block" style={{ opacity: isCollapsed ? 0 : 1 }}>
                <div className="absolute inset-0 bg-[#E60000] rounded-br-[30px]" />
              </div>
              <div className="absolute right-0 -bottom-[30px] w-[30px] h-[30px] bg-gray-50 hidden lg:block" style={{ opacity: isCollapsed ? 0 : 1 }}>
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
              style={{ paddingLeft: '12px', paddingRight: isCollapsed ? '12px' : '24px' }}
              title={isCollapsed ? 'Dashboard' : undefined}
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
              style={{ paddingLeft: '12px', paddingRight: isCollapsed ? '12px' : '24px' }}
              title={isCollapsed ? 'Attendance' : undefined}
            >
              <Clock size={22} className={`shrink-0 ${pathname === '/hr/attendance' ? 'text-[#E60000]' : 'text-white'}`} />
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
                title={isCollapsed ? 'Employees' : undefined}
              >
                <Users size={22} className={`shrink-0 ${isOnEmployees || isInactivePage ? 'text-[#E60000]' : 'text-white'}`} />
                <span className="font-bold text-lg whitespace-nowrap" style={labelStyle}>Employees</span>
              </Link>
              {!isCollapsed && (
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
            {!isCollapsed && (
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

          {/* Reports (with submenu) */}
          <li className="relative" style={{ padding: '0 0 0 16px', overflow: 'visible' }}>
            <div className="flex items-center relative z-10">
              <Link
                href="/hr/reports"
                onClick={() => setIsMobileOpen(false)}
                className={`flex items-center gap-4 py-3 flex-1 ${isOnReports ? 'text-[#E60000]' : 'text-white/60 hover:text-white'}`}
                style={{ paddingLeft: '12px' }}
                title={isCollapsed ? 'Reports' : undefined}
              >
                <FileText size={22} className={`shrink-0 ${isOnReports ? 'text-[#E60000]' : 'text-white'}`} />
                <span className="font-bold text-lg whitespace-nowrap" style={labelStyle}>Reports</span>
              </Link>
              {!isCollapsed && (
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
            {!isCollapsed && (
              <div
                style={{
                  maxHeight: reportsOpen ? '56px' : '0px',
                  overflow: 'hidden',
                  transition: 'max-height 300ms cubic-bezier(0.4, 0, 0.2, 1)',
                }}
              >
                <div className="pl-4 pr-3 pb-2 relative z-10">
                  <Link
                    href="/hr/adjusts"
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