'use client'

import { useRef, useState, useEffect, useCallback, ReactNode } from 'react'
import { Menu, X } from 'lucide-react'

interface BaseSidebarProps {
  /** Whether the mobile sidebar is open */
  isOpen: boolean
  /** Whether the sidebar is collapsed (desktop only) */
  isCollapsed: boolean
  /** Called to close the mobile sidebar */
  onClose: () => void
  /** Called to toggle collapse (desktop only) */
  onToggleCollapse: () => void
  /** Title shown in the sidebar header (e.g. "Admin Panel", "HR Panel", "My Portal") */
  title: string
  /** The computed index of the currently active nav item, used to position the sliding indicator */
  activeIndex: number
  /** Additional dependency values that should trigger indicator re-measurement (e.g. submenu open states) */
  indicatorDeps?: any[]
  /** The expanded desktop width class (e.g. "lg:w-63", "lg:w-64") */
  expandedWidth?: string
  /** Children: the <li> elements for the nav list */
  children: ReactNode
}

export function BaseSidebar({
  isOpen, isCollapsed, onClose, onToggleCollapse,
  title, activeIndex, indicatorDeps = [],
  expandedWidth = 'lg:w-63',
  children,
}: BaseSidebarProps) {
  const listRef = useRef<HTMLUListElement>(null)
  const [indicator, setIndicator] = useState<{ top: number; height: number } | null>(null)
  const [hasMounted, setHasMounted] = useState(false)
  const [isLg, setIsLg] = useState(false)

  // On mobile (<lg) the sidebar should NEVER appear collapsed — labels must always show
  const collapsed = isCollapsed && isLg

  useEffect(() => {
    const mql = window.matchMedia('(min-width: 1024px)')
    setIsLg(mql.matches)
    const handler = (e: MediaQueryListEvent) => setIsLg(e.matches)
    mql.addEventListener('change', handler)
    return () => mql.removeEventListener('change', handler)
  }, [])

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

  // Re-measure after submenu animation completes
  useEffect(() => {
    const timer = setTimeout(updateIndicator, 320)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collapsed, updateIndicator, ...indicatorDeps])

  const labelStyle = {
    opacity: collapsed ? 0 : 1,
    width: collapsed ? 0 : 'auto',
    overflow: 'hidden' as const,
    transition: 'opacity 300ms cubic-bezier(0.4, 0, 0.2, 1), width 300ms cubic-bezier(0.4, 0, 0.2, 1)',
  }

  return (
    <aside className={`
      fixed top-24 bottom-4 left-4 z-[60] bg-[#E60000] flex flex-col transition-all duration-300 ease-in-out overflow-y-auto overflow-x-hidden scrollbar-hide
      rounded-[20px]
      ${isOpen ? 'translate-x-0' : '-translate-x-[120%]'}
      w-72 lg:translate-x-0
      ${collapsed ? 'lg:w-20' : expandedWidth}
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
          style={labelStyle}
        >
          {title}
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

          {children}

        </ul>
      </nav>
    </aside>
  )
}

/** Shared label style hook for sidebar nav items */
export function useSidebarCollapsed(isCollapsed: boolean) {
  const [isLg, setIsLg] = useState(false)
  useEffect(() => {
    const mql = window.matchMedia('(min-width: 1024px)')
    setIsLg(mql.matches)
    const handler = (e: MediaQueryListEvent) => setIsLg(e.matches)
    mql.addEventListener('change', handler)
    return () => mql.removeEventListener('change', handler)
  }, [])

  const collapsed = isCollapsed && isLg

  const labelStyle = {
    opacity: collapsed ? 0 : 1,
    width: collapsed ? 0 : 'auto',
    overflow: 'hidden' as const,
    transition: 'opacity 300ms cubic-bezier(0.4, 0, 0.2, 1), width 300ms cubic-bezier(0.4, 0, 0.2, 1)',
  }

  return { collapsed, labelStyle }
}
