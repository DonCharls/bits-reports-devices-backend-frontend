'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Users, Clock, FileText, LayoutDashboard, UserCog, UserX, ChevronDown, Building2, Menu, X, Fingerprint, RadioTower, ScrollText, Server, History, FileCheck } from 'lucide-react'
import { useRef, useState, useEffect, useCallback } from 'react'

interface AdminSidebarProps {
  isOpen: boolean
  isCollapsed: boolean
  onClose: () => void
  onToggleCollapse: () => void
}

export function AdminSidebar({ isOpen, isCollapsed, onClose, onToggleCollapse }: AdminSidebarProps) {
  const pathname = usePathname()
  const listRef = useRef<HTMLUListElement>(null)
  const [indicator, setIndicator] = useState<{ top: number; height: number } | null>(null)
  const [hasMounted, setHasMounted] = useState(false)
  const [pendingCount, setPendingCount] = useState<number>(0)
  const [isLg, setIsLg] = useState(false)

  const fetchPendingCount = useCallback(async () => {
    try {
      const res = await fetch('/api/attendance/adjustments?limit=1&status=pending')
      const data = await res.json()
      if (data.success) {
        setPendingCount(data.meta.total)
      }
    } catch (err) {
      console.error('Failed to fetch pending count:', err)
    }
  }, [])

  useEffect(() => {
    fetchPendingCount()
    const interval = setInterval(fetchPendingCount, 120000) // 2 minutes
    return () => clearInterval(interval)
  }, [fetchPendingCount])

  const isOnEmployees = pathname.startsWith('/employees')
  const isOnReports = pathname.startsWith('/admin/reports') || pathname === '/admin/adjust' || pathname.startsWith('/admin/adjust/')

  // Inactive sub-item is toggleable anytime by clicking the chevron
  const [inactiveOpen, setInactiveOpen] = useState(isOnEmployees)
  const [reportsOpen, setReportsOpen] = useState(isOnReports)

  // On mobile (<lg) the sidebar should NEVER appear collapsed — labels must always show
  const collapsed = isCollapsed && isLg

  useEffect(() => {
    const mql = window.matchMedia('(min-width: 1024px)')
    setIsLg(mql.matches)
    const handler = (e: MediaQueryListEvent) => setIsLg(e.matches)
    mql.addEventListener('change', handler)
    return () => mql.removeEventListener('change', handler)
  }, [])

  // Flat list matching rendered <li> order for indicator
  const allItems = [
    { href: '/dashboard' },
    { href: '/attendance' },
    { href: '/admin/adjustments' },
    { href: '/employees', matchPrefix: '/employees' },
    { href: '/shifts' },
    { href: '/organization' },
    { href: '/devices' },
    { href: '/admin/reports', matchPrefix: '/admin/reports' }, // Used for index match
    { href: '/admin/logs' },
    { href: '/admin/system' },
    { href: '/admin/user-accounts' },
  ]

  const activeIndex = allItems.findIndex(item => {
    if (item.matchPrefix === '/admin/reports') return isOnReports;
    if (item.matchPrefix) return pathname.startsWith(item.matchPrefix)
    return pathname === item.href
  })

  const updateIndicator = useCallback(() => {
    if (!listRef.current || activeIndex < 0) return
    const items = listRef.current.querySelectorAll<HTMLLIElement>(':scope > li')
    const activeLi = items[activeIndex]
    if (!activeLi) return
    setIndicator({ top: activeLi.offsetTop, height: activeLi.offsetHeight })
  }, [activeIndex])

  useEffect(() => {
    updateIndicator()
    const timer = setTimeout(() => setHasMounted(true), 50)
    return () => clearTimeout(timer)
  }, [updateIndicator])

  // Re-measure after sub-item animation completes
  useEffect(() => {
    const timer = setTimeout(updateIndicator, 320)
    return () => clearTimeout(timer)
  }, [inactiveOpen, reportsOpen, collapsed, updateIndicator])

  const labelStyle = {
    opacity: collapsed ? 0 : 1,
    width: collapsed ? 0 : 'auto',
    overflow: 'hidden',
    transition: 'opacity 300ms cubic-bezier(0.4, 0, 0.2, 1), width 300ms cubic-bezier(0.4, 0, 0.2, 1)'
  }

  return (
    <aside className={`
      fixed top-24 bottom-4 left-4 z-[60] bg-[#E60000] flex flex-col transition-all duration-300 ease-in-out overflow-y-auto overflow-x-hidden scrollbar-hide
      rounded-[20px]
      ${isOpen ? 'translate-x-0' : '-translate-x-[120%]'}
      w-72 lg:translate-x-0
      ${collapsed ? 'lg:w-20' : 'lg:w-63'}
    `}>

      {/* Header Section */}
      <div className="flex items-center h-20 shrink-0 px-7 justify-start relative">
        <div className="w-6 flex items-center justify-center shrink-0">
          <button
            onClick={onToggleCollapse}
            className="text-white hover:bg-white/10 p-2 rounded-xl transition-colors hidden lg:block"
          >
            <Menu size={24} />
          </button>
        </div>

        {/* --- Admin Panel Title --- */}
        <span
          className="font-bold text-xl text-white whitespace-nowrap ml-4"
          style={labelStyle}
        >
          Admin Panel
        </span>

        <button onClick={onClose} className="lg:hidden absolute right-8 text-white p-2">
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
              href="/dashboard"
              onClick={onClose}
              className={`flex items-center gap-4 py-3 relative z-10 ${pathname === '/dashboard' ? 'text-[#E60000]' : 'text-white/60 hover:text-white'}`}
              style={{ paddingLeft: '12px', paddingRight: collapsed ? '12px' : '24px' }}
              title={collapsed ? 'Dashboard' : undefined}
            >
              <LayoutDashboard size={22} className={`shrink-0 ${pathname === '/dashboard' ? 'text-[#E60000]' : 'text-white'}`} />
              <span className="font-bold text-lg whitespace-nowrap" style={labelStyle}>Dashboard</span>
            </Link>
          </li>

          {/* Attendance */}
          <li className="relative" style={{ padding: '0 0 0 16px', overflow: 'visible' }}>
            <Link
              href="/attendance"
              onClick={onClose}
              className={`flex items-center gap-4 py-3 relative z-10 ${pathname === '/attendance' ? 'text-[#E60000]' : 'text-white/60 hover:text-white'}`}
              style={{ paddingLeft: '12px', paddingRight: collapsed ? '12px' : '24px' }}
              title={collapsed ? 'Attendance' : undefined}
            >
              <Fingerprint size={22} className={`shrink-0 ${pathname === '/attendance' ? 'text-[#E60000]' : 'text-white'}`} />
              <span className="font-bold text-lg whitespace-nowrap" style={labelStyle}>Attendance</span>
            </Link>
          </li>

          <li className="relative" style={{ padding: '0 0 0 16px', overflow: 'visible' }}>
            <Link
              href="/admin/adjustments"
              onClick={onClose}
              className={`flex items-center gap-4 py-3 relative z-10 ${pathname === '/admin/adjustments' ? 'text-[#E60000]' : 'text-white/60 hover:text-white'}`}
              style={{ paddingLeft: '12px', paddingRight: collapsed ? '12px' : '24px' }}
              title={collapsed ? 'Approval Queue' : undefined}
            >
              <FileCheck size={22} className={`shrink-0 ${pathname === '/admin/adjustments' ? 'text-[#E60000]' : 'text-white'}`} />
              <span className="font-bold text-lg whitespace-nowrap" style={labelStyle}>Approval Queue</span>
              {!collapsed && pendingCount > 0 && (
                <span
                  style={labelStyle}
                  className={`ml-auto mr-4 px-2 py-0.5 text-[10px] font-black rounded-full shadow-sm transition-colors duration-300 ${pathname === '/admin/adjustments' ? 'bg-[#E60000] text-white' : 'bg-white text-[#E60000]'}`}
                >
                  {pendingCount > 99 ? '99+' : pendingCount}
                </span>
              )}
            </Link>
          </li>

          {/* Employees (with submenu) */}
          <li className="relative" style={{ padding: '0 0 0 16px', overflow: 'visible' }}>
            <div className="flex items-center relative z-10">
              <Link
                href="/employees"
                onClick={onClose}
                className={`flex items-center gap-4 py-3 flex-1 ${isOnEmployees ? 'text-[#E60000]' : 'text-white/60 hover:text-white'}`}
                style={{ paddingLeft: '12px' }}
                title={collapsed ? 'Employees' : undefined}
              >
                <Users size={22} className={`shrink-0 ${isOnEmployees ? 'text-[#E60000]' : 'text-white'}`} />
                <span className="font-bold text-lg whitespace-nowrap" style={labelStyle}>Employees</span>
              </Link>
              {!collapsed && (
                <button
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); setInactiveOpen(o => !o); }}
                  className={`p-2 mr-2 rounded-lg transition-colors shrink-0 ${isOnEmployees ? 'text-[#E60000]' : 'text-white/60 hover:text-white'}`}
                  title="Toggle submenu"
                >
                  <ChevronDown
                    size={16}
                    style={{ transition: 'transform 300ms cubic-bezier(0.4, 0, 0.2, 1)', transform: inactiveOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}
                  />
                </button>
              )}
            </div>
            {!collapsed && (
              <div
                style={{
                  maxHeight: inactiveOpen ? '56px' : '0px',
                  overflow: 'hidden',
                  transition: 'max-height 300ms cubic-bezier(0.4, 0, 0.2, 1)',
                }}
              >
                <div className="pl-4 pr-3 pb-2 relative z-10">
                  <Link
                    href="/employees/inactive"
                    onClick={onClose}
                    className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-semibold transition-colors ${pathname === '/employees/inactive'
                      ? isOnEmployees ? 'text-[#E60000]' : 'text-white'
                      : isOnEmployees ? 'text-[#E60000]/60 hover:text-[#E60000]' : 'text-white/60 hover:text-white'
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
              href="/shifts"
              onClick={onClose}
              className={`flex items-center gap-4 py-3 relative z-10 ${pathname === '/shifts' ? 'text-[#E60000]' : 'text-white/60 hover:text-white'}`}
              style={{ paddingLeft: '12px', paddingRight: collapsed ? '12px' : '24px' }}
              title={collapsed ? 'Shifts' : undefined}
            >
              <Clock size={22} className={`shrink-0 ${pathname === '/shifts' ? 'text-[#E60000]' : 'text-white'}`} />
              <span className="font-bold text-lg whitespace-nowrap" style={labelStyle}>Shifts</span>
            </Link>
          </li>

          {/* Organization */}
          <li className="relative" style={{ padding: '0 0 0 16px', overflow: 'visible' }}>
            <Link
              href="/organization"
              onClick={onClose}
              className={`flex items-center gap-4 py-3 relative z-10 ${pathname === '/organization' ? 'text-[#E60000]' : 'text-white/60 hover:text-white'}`}
              style={{ paddingLeft: '12px', paddingRight: collapsed ? '12px' : '24px' }}
              title={collapsed ? 'Organization' : undefined}
            >
              <Building2 size={22} className={`shrink-0 ${pathname === '/organization' ? 'text-[#E60000]' : 'text-white'}`} />
              <span className="font-bold text-lg whitespace-nowrap" style={labelStyle}>Organization</span>
            </Link>
          </li>

          {/* Devices */}
          <li className="relative" style={{ padding: '0 0 0 16px', overflow: 'visible' }}>
            <Link
              href="/devices"
              onClick={onClose}
              className={`flex items-center gap-4 py-3 relative z-10 ${pathname === '/devices' ? 'text-[#E60000]' : 'text-white/60 hover:text-white'}`}
              style={{ paddingLeft: '12px', paddingRight: collapsed ? '12px' : '24px' }}
              title={collapsed ? 'Devices' : undefined}
            >
              <RadioTower size={22} className={`shrink-0 ${pathname === '/devices' ? 'text-[#E60000]' : 'text-white'}`} />
              <span className="font-bold text-lg whitespace-nowrap" style={labelStyle}>Devices</span>
            </Link>
          </li>

          {/* Reports (with submenu) */}
          <li className="relative" style={{ padding: '0 0 0 16px', overflow: 'visible' }}>
            <div className="flex items-center relative z-10">
              <Link
                href="/admin/reports"
                onClick={onClose}
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
                    href="/admin/adjust"
                    onClick={onClose}
                    className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-semibold transition-colors ${pathname === '/admin/adjust'
                      ? isOnReports ? 'text-[#E60000]' : 'text-white'
                      : isOnReports ? 'text-[#E60000]/60 hover:text-[#E60000]' : 'text-white/60 hover:text-white'
                      }`}
                  >
                    <History size={15} className="shrink-0" />
                    Adjustment Logs
                  </Link>
                </div>
              </div>
            )}
          </li>

          {/* System Logs */}
          <li className="relative" style={{ padding: '0 0 0 16px', overflow: 'visible' }}>
            <Link
              href="/admin/logs"
              onClick={onClose}
              className={`flex items-center gap-4 py-3 relative z-10 ${pathname === '/admin/logs' ? 'text-[#E60000]' : 'text-white/60 hover:text-white'}`}
              style={{ paddingLeft: '12px', paddingRight: collapsed ? '12px' : '24px' }}
              title={collapsed ? 'System Logs' : undefined}
            >
              <ScrollText size={22} className={`shrink-0 ${pathname === '/admin/logs' ? 'text-[#E60000]' : 'text-white'}`} />
              <span className="font-bold text-lg whitespace-nowrap" style={labelStyle}>System Logs</span>
            </Link>
          </li>

          {/* System Settings */}
          <li className="relative" style={{ padding: '0 0 0 16px', overflow: 'visible' }}>
            <Link
              href="/admin/system"
              onClick={onClose}
              className={`flex items-center gap-4 py-3 relative z-10 ${pathname === '/admin/system' ? 'text-[#E60000]' : 'text-white/60 hover:text-white'}`}
              style={{ paddingLeft: '12px', paddingRight: collapsed ? '12px' : '24px' }}
              title={collapsed ? 'System Settings' : undefined}
            >
              <Server size={22} className={`shrink-0 ${pathname === '/admin/system' ? 'text-[#E60000]' : 'text-white'}`} />
              <span className="font-bold text-lg whitespace-nowrap" style={labelStyle}>System Settings</span>
            </Link>
          </li>

          {/* User Accounts */}
          <li className="relative" style={{ padding: '0 0 0 16px', overflow: 'visible' }}>
            <Link
              href="/admin/user-accounts"
              onClick={onClose}
              className={`flex items-center gap-4 py-3 relative z-10 ${pathname === '/admin/user-accounts' ? 'text-[#E60000]' : 'text-white/60 hover:text-white'}`}
              style={{ paddingLeft: '12px', paddingRight: collapsed ? '12px' : '24px' }}
              title={collapsed ? 'User Accounts' : undefined}
            >
              <UserCog size={22} className={`shrink-0 ${pathname === '/admin/user-accounts' ? 'text-[#E60000]' : 'text-white'}`} />
              <span className="font-bold text-lg whitespace-nowrap" style={labelStyle}>User Accounts</span>
            </Link>
          </li>

        </ul>
      </nav>
    </aside>
  )
}