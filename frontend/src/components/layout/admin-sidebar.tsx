'use client'

import { usePathname } from 'next/navigation'
import {
  Users, Clock, FileText, LayoutDashboard, UserCog, UserX, Building2, Fingerprint, RadioTower, ScrollText, Server, History, FileCheck
} from 'lucide-react'
import { useState, useEffect, useCallback } from 'react'
import { BaseSidebar, useSidebarCollapsed } from './shared/BaseSidebar'
import { SidebarNavItem } from './shared/SidebarNavItem'
import { SidebarSubMenu } from './shared/SidebarSubMenu'

interface AdminSidebarProps {
  isOpen: boolean
  isCollapsed: boolean
  onClose: () => void
  onToggleCollapse: () => void
}

export function AdminSidebar({ isOpen, isCollapsed, onClose, onToggleCollapse }: AdminSidebarProps) {
  const pathname = usePathname()
  const { collapsed, labelStyle } = useSidebarCollapsed(isCollapsed)

  const [pendingCount, setPendingCount] = useState<number>(0)

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
  const isOnReports = pathname.startsWith('/reports') || pathname === '/adjust' || pathname.startsWith('/adjust/')
  const isOnSystem = pathname.startsWith('/logs') || pathname.startsWith('/system') || pathname.startsWith('/user-accounts')

  const [inactiveOpen, setInactiveOpen] = useState(isOnEmployees)
  const [reportsOpen, setReportsOpen] = useState(isOnReports)
  const [systemOpen, setSystemOpen] = useState(isOnSystem)

  // Flat list matching rendered <li> order for indicator
  const allItems = [
    { href: '/dashboard' },
    { href: '/attendance' },
    { href: '/adjustments' },
    { href: '/employees', matchPrefix: '/employees' },
    { href: '/shifts' },
    { href: '/organization' },
    { href: '/devices' },
    { href: '/reports', matchFn: () => isOnReports },
    { href: '/system', matchFn: () => isOnSystem },
  ]

  const activeIndex = allItems.findIndex(item =>
    'matchFn' in item && item.matchFn ? item.matchFn() :
    'matchPrefix' in item && item.matchPrefix ? pathname.startsWith(item.matchPrefix) :
    pathname === item.href
  )

  return (
    <BaseSidebar
      isOpen={isOpen}
      isCollapsed={isCollapsed}
      onClose={onClose}
      onToggleCollapse={onToggleCollapse}
      title="Admin Panel"
      activeIndex={activeIndex}
      indicatorDeps={[inactiveOpen, reportsOpen, systemOpen]}
      expandedWidth="lg:w-63"
    >
      {/* Dashboard */}
      <SidebarNavItem href="/dashboard" label="Dashboard" icon={LayoutDashboard} active={pathname === '/dashboard'} collapsed={collapsed} labelStyle={labelStyle} onClick={onClose} />

      {/* Attendance */}
      <SidebarNavItem href="/attendance" label="Attendance" icon={Fingerprint} active={pathname === '/attendance'} collapsed={collapsed} labelStyle={labelStyle} onClick={onClose} />

      {/* Approval Queue */}
      <SidebarNavItem
        href="/adjustments"
        label="Approval Queue"
        icon={FileCheck}
        active={pathname === '/adjustments'}
        collapsed={collapsed}
        labelStyle={labelStyle}
        onClick={onClose}
        badge={!collapsed && pendingCount > 0 ? (
          <span
            style={labelStyle}
            className={`ml-auto mr-4 px-2 py-0.5 text-[10px] font-black rounded-full shadow-sm transition-colors duration-300 ${pathname === '/adjustments' ? 'bg-[#E60000] text-white' : 'bg-white text-[#E60000]'}`}
          >
            {pendingCount > 99 ? '99+' : pendingCount}
          </span>
        ) : undefined}
      />

      {/* Employees (with submenu) */}
      <SidebarSubMenu
        href="/employees"
        label="Employees"
        icon={Users}
        isGroupActive={isOnEmployees}
        isOpen={inactiveOpen}
        onToggle={() => setInactiveOpen(o => !o)}
        collapsed={collapsed}
        labelStyle={labelStyle}
        onClose={onClose}
        subItems={[
          {
            href: '/employees/inactive',
            label: 'Inactive Employees',
            icon: UserX,
            isActive: pathname === '/employees/inactive',
          },
        ]}
      />

      {/* Shifts */}
      <SidebarNavItem href="/shifts" label="Shifts" icon={Clock} active={pathname === '/shifts'} collapsed={collapsed} labelStyle={labelStyle} onClick={onClose} />

      {/* Organization */}
      <SidebarNavItem href="/organization" label="Organization" icon={Building2} active={pathname === '/organization'} collapsed={collapsed} labelStyle={labelStyle} onClick={onClose} />

      {/* Devices */}
      <SidebarNavItem href="/devices" label="Devices" icon={RadioTower} active={pathname === '/devices'} collapsed={collapsed} labelStyle={labelStyle} onClick={onClose} />

      {/* Reports (with submenu) */}
      <SidebarSubMenu
        href="/reports"
        label="Reports"
        icon={FileText}
        isGroupActive={isOnReports}
        isOpen={reportsOpen}
        onToggle={() => setReportsOpen(o => !o)}
        collapsed={collapsed}
        labelStyle={labelStyle}
        onClose={onClose}
        subItems={[
          {
            href: '/adjust',
            label: 'Adjustment Logs',
            icon: History,
            isActive: pathname === '/adjust',
          },
        ]}
      />

      {/* System Administration (with submenu) */}
      <SidebarSubMenu
        href="/system"
        label="Administration"
        icon={Server}
        isGroupActive={isOnSystem}
        isOpen={systemOpen}
        onToggle={() => setSystemOpen(o => !o)}
        collapsed={collapsed}
        labelStyle={labelStyle}
        onClose={onClose}
        subItems={[
          {
            href: '/system',
            label: 'System Settings',
            icon: Server,
            isActive: pathname === '/system',
          },
          {
            href: '/logs',
            label: 'System Logs',
            icon: ScrollText,
            isActive: pathname === '/logs',
          },
          {
            href: '/user-accounts',
            label: 'User Accounts',
            icon: UserCog,
            isActive: pathname === '/user-accounts',
          },
        ]}
      />
    </BaseSidebar>
  )
}