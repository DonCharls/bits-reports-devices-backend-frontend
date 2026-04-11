'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, CalendarDays, Clock, UserCircle, Menu, X } from 'lucide-react'
import { useRef, useState, useEffect, useCallback } from 'react'

interface EmployeeSidebarProps {
  isOpen: boolean
  isCollapsed: boolean
  onClose: () => void
  onToggleCollapse: () => void
}

export function EmployeeSidebar({ isOpen, isCollapsed, onClose, onToggleCollapse }: EmployeeSidebarProps) {
  const pathname = usePathname()
  const listRef = useRef<HTMLUListElement>(null)
  const [indicator, setIndicator] = useState<{ top: number; height: number } | null>(null)
  const [hasMounted, setHasMounted] = useState(false)
  const [isLg, setIsLg] = useState(false)

  // On mobile (<lg) the sidebar should NEVER appear collapsed
  const collapsed = isCollapsed && isLg

  useEffect(() => {
    const mql = window.matchMedia('(min-width: 1024px)')
    setIsLg(mql.matches)
    const handler = (e: MediaQueryListEvent) => setIsLg(e.matches)
    mql.addEventListener('change', handler)
    return () => mql.removeEventListener('change', handler)
  }, [])

  const navItems = [
    { label: 'Dashboard', href: '/employee/dashboard', icon: LayoutDashboard },
    { label: 'My Attendance', href: '/employee/attendance', icon: CalendarDays },
    { label: 'My Shift', href: '/employee/shift', icon: Clock },
    { label: 'My Profile', href: '/employee/profile', icon: UserCircle },
  ]

  const activeIndex = navItems.findIndex(item => pathname.startsWith(item.href))

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

  useEffect(() => {
    const timer = setTimeout(updateIndicator, 320)
    return () => clearTimeout(timer)
  }, [collapsed, updateIndicator])

  return (
    <aside className={`
      fixed top-24 bottom-4 left-4 z-[60] bg-[#E60000] flex flex-col transition-all duration-300 ease-in-out overflow-y-auto overflow-x-hidden scrollbar-hide
      rounded-[20px]
      ${isOpen ? 'translate-x-0' : '-translate-x-[120%]'}
      w-72 lg:translate-x-0
      ${collapsed ? 'lg:w-20' : 'lg:w-64'}
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

        <span
          className="font-bold text-xl text-white whitespace-nowrap ml-4"
          style={{
            opacity: collapsed ? 0 : 1,
            width: collapsed ? 0 : 'auto',
            overflow: 'hidden',
            transition: 'opacity 300ms cubic-bezier(0.4, 0, 0.2, 1), width 300ms cubic-bezier(0.4, 0, 0.2, 1)'
          }}
        >
          My Portal
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

          {navItems.map((item) => {
            const Icon = item.icon
            const active = pathname.startsWith(item.href)
            return (
              <li key={item.href} className="relative" style={{ padding: '0 0 0 16px', overflow: 'visible' }}>
                <Link
                  href={item.href}
                  onClick={onClose}
                  className={`flex items-center gap-4 py-3 relative z-10 ${active ? 'text-[#E60000]' : 'text-white/60 hover:text-white'}`}
                  style={{ paddingLeft: '12px', paddingRight: collapsed ? '12px' : '24px' }}
                  title={collapsed ? item.label : undefined}
                >
                  <Icon size={22} className={`shrink-0 ${active ? 'text-[#E60000]' : 'text-white'}`} />
                  <span className="font-bold text-lg whitespace-nowrap" style={{ opacity: collapsed ? 0 : 1, width: collapsed ? 0 : 'auto', overflow: 'hidden', transition: 'opacity 300ms cubic-bezier(0.4, 0, 0.2, 1), width 300ms cubic-bezier(0.4, 0, 0.2, 1)' }}>
                    {item.label}
                  </span>
                </Link>
              </li>
            )
          })}

        </ul>
      </nav>
    </aside>
  )
}
