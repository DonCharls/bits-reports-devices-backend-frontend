import Link from 'next/link'
import { ChevronDown } from 'lucide-react'
import { CSSProperties, ReactNode } from 'react'
import { LucideIcon } from 'lucide-react'

interface SubMenuItem {
  href: string
  label: string
  icon: LucideIcon
  isActive: boolean
}

interface SidebarSubMenuProps {
  /** Main nav item */
  href: string
  label: string
  icon: LucideIcon
  /** Whether the parent group is active */
  isGroupActive: boolean
  /** Whether the submenu is expanded */
  isOpen: boolean
  /** Toggle submenu open/close */
  onToggle: () => void
  /** Whether sidebar is collapsed */
  collapsed: boolean
  /** Label style for collapse animation */
  labelStyle: CSSProperties
  /** Close the mobile sidebar */
  onClose?: () => void
  /** Sub-items to render */
  subItems: SubMenuItem[]
  /** Optional badge (e.g. pending count) */
  badge?: ReactNode
}

export function SidebarSubMenu({
  href, label, icon: Icon,
  isGroupActive, isOpen, onToggle,
  collapsed, labelStyle, onClose,
  subItems, badge,
}: SidebarSubMenuProps) {
  return (
    <li className="relative" style={{ padding: '0 0 0 16px', overflow: 'visible' }}>
      <div className="flex items-center relative z-10">
        <Link
          href={href}
          onClick={onClose}
          className={`flex items-center gap-4 py-3 flex-1 ${isGroupActive ? 'text-brand' : 'text-white/60 hover:text-white'}`}
          style={{ paddingLeft: '12px' }}
          title={collapsed ? label : undefined}
        >
          <Icon size={22} className={`shrink-0 ${isGroupActive ? 'text-brand' : 'text-white'}`} />
          <span className="font-bold text-lg whitespace-nowrap" style={labelStyle}>{label}</span>
          {badge}
        </Link>
        {!collapsed && (
          <button
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); onToggle(); }}
            className={`p-2 mr-2 rounded-lg transition-colors shrink-0 ${isGroupActive ? 'text-brand' : 'text-white/60 hover:text-white'}`}
            title="Toggle submenu"
          >
            <ChevronDown
              size={16}
              style={{ transition: 'transform 300ms cubic-bezier(0.4, 0, 0.2, 1)', transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}
            />
          </button>
        )}
      </div>
      {!collapsed && (
        <div
          style={{
            maxHeight: isOpen ? `${subItems.length * 56}px` : '0px',
            overflow: 'hidden',
            transition: 'max-height 300ms cubic-bezier(0.4, 0, 0.2, 1)',
          }}
        >
          {subItems.map((sub) => {
            const SubIcon = sub.icon
            return (
              <div key={sub.href} className="pl-4 pr-3 pb-2 relative z-10">
                <Link
                  href={sub.href}
                  onClick={onClose}
                  className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-semibold transition-colors ${sub.isActive
                    ? isGroupActive ? 'text-brand' : 'text-white'
                    : isGroupActive ? 'text-brand/60 hover:text-brand' : 'text-white/60 hover:text-white'
                    }`}
                >
                  <SubIcon size={15} className="shrink-0" />
                  {sub.label}
                </Link>
              </div>
            )
          })}
        </div>
      )}
    </li>
  )
}
