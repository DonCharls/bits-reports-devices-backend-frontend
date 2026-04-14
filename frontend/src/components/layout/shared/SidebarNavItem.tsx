import Link from 'next/link'
import { LucideIcon } from 'lucide-react'
import { CSSProperties, ReactNode } from 'react'

interface SidebarNavItemProps {
  href: string
  label: string
  icon: LucideIcon
  active: boolean
  collapsed: boolean
  labelStyle: CSSProperties
  onClick?: () => void
  /** Optional: right-side badge or extra content */
  badge?: ReactNode
}

export function SidebarNavItem({
  href, label, icon: Icon, active, collapsed, labelStyle, onClick, badge,
}: SidebarNavItemProps) {
  return (
    <li className="relative" style={{ padding: '0 0 0 16px', overflow: 'visible' }}>
      <Link
        href={href}
        onClick={onClick}
        className={`flex items-center gap-4 py-3 relative z-10 ${active ? 'text-[#E60000]' : 'text-white/60 hover:text-white'}`}
        style={{ paddingLeft: '12px', paddingRight: collapsed ? '12px' : '24px' }}
        title={collapsed ? label : undefined}
      >
        <Icon size={22} className={`shrink-0 ${active ? 'text-[#E60000]' : 'text-white'}`} />
        <span className="font-bold text-lg whitespace-nowrap" style={labelStyle}>{label}</span>
        {badge}
      </Link>
    </li>
  )
}
