"use client";
import React, { useState } from 'react';
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
  LucideIcon
} from 'lucide-react';


interface SubmenuItem {
  name: string;
  icon: LucideIcon;
  filter?: string; 
  href?: string;  
}

interface MenuItem {
  name: string;
  href: string;
  icon: LucideIcon;
  hasSubmenu?: boolean;
  submenu?: SubmenuItem[];
}

export default function Sidebar({ isMobileOpen, setIsMobileOpen, isCollapsed, setIsCollapsed }: any) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isEmployeesOpen, setIsEmployeesOpen] = useState(false);
  const [isReportsOpen, setIsReportsOpen] = useState(false);

  const menuItems: MenuItem[] = [
    { name: 'Dashboard', href: '/hr/dashboard', icon: LayoutDashboard },
    { name: 'Attendance', href: '/hr/attendance', icon: Clock },
    { 
      name: 'Employees', 
      href: '/hr/employees', 
      icon: Users,
      hasSubmenu: true,
      submenu: [{ name: 'Inactive', filter: 'Inactive', icon: UserX }]
    },
    { 
      name: 'Reports', 
      href: '/hr/reports', 
      icon: FileText,
      hasSubmenu: true,
      submenu: [{ name: 'Adjustment Logs', href: '/hr/adjusts', icon: History }]
    },
  ];

  const currentStatus = searchParams.get('status') || 'Active';
  const isInactivePage = pathname === '/hr/employees' && currentStatus === 'Inactive';
  const isAuditPage = pathname === '/hr/adjusts';

  const activeIndex = menuItems.findIndex(item => {
    if (item.href === '/hr/employees') {
        return pathname === item.href && currentStatus === 'Active';
    }
    return pathname === item.href;
  });

  const getIndicatorStyles = () => {
    const itemHeight = 60;
    const submenuOffset = 52; 

    const leftPos = isCollapsed ? '16px' : '14px'; 
    const width = isCollapsed ? 'calc(100% - 16px)' : 'calc(100% - 14px)';
    
    if (isInactivePage) {
      const topPos = (isCollapsed || !isEmployeesOpen) ? (2 * itemHeight) : ((2 * itemHeight) + 60);
      const height = (isCollapsed || !isEmployeesOpen) ? '56px' : '44px';
      const left = (isCollapsed || !isEmployeesOpen) ? leftPos : '35px';
      const rad = (isCollapsed || !isEmployeesOpen) ? '30px 0 0 30px' : '22px 0 0 22px';

      return { 
        top: `${topPos}px`, 
        height: height, 
        left: left, 
        width: isCollapsed ? width : `calc(100% - ${left})`,
        borderRadius: rad 
      };
    }

    if (isAuditPage) {
      const employeesSubmenuHeight = (isEmployeesOpen && !isCollapsed) ? submenuOffset : 0;
      const topPos = (isCollapsed || !isReportsOpen) ? (3 * itemHeight + employeesSubmenuHeight) : ((3 * itemHeight) + 60 + employeesSubmenuHeight);
      const height = (isCollapsed || !isReportsOpen) ? '56px' : '44px';
      const left = (isCollapsed || !isReportsOpen) ? leftPos : '35px';
      const rad = (isCollapsed || !isReportsOpen) ? '30px 0 0 30px' : '22px 0 0 22px';

      return { 
        top: `${topPos}px`, 
        height: height, 
        left: left, 
        width: isCollapsed ? width : `calc(100% - ${left})`,
        borderRadius: rad 
      };
    }

    let baseTop = activeIndex * itemHeight;
   
    if (activeIndex > 2 && isEmployeesOpen && !isCollapsed) {
      baseTop += submenuOffset;
    }

    return { 
      top: `${baseTop}px`, 
      height: '56px', 
      left: leftPos, 
      width: width,
      borderRadius: '30px 0 0 30px' 
    };
  };

  const styles = getIndicatorStyles();

  return (
    <aside className={`
      fixed top-24 bottom-4 left-4 z-[60] bg-[#E60000] flex flex-col transition-all duration-300 ease-in-out overflow-hidden
      rounded-[20px]
      ${isMobileOpen ? 'translate-x-0' : '-translate-x-[120%]'} 
      lg:translate-x-0
      ${isCollapsed ? 'lg:w-20' : 'lg:w-63'}
    `}>

      <div className="flex items-center h-20 shrink-0 px-7 justify-start relative">
        <div className="w-6 flex items-center justify-center shrink-0">
          <button 
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="text-white hover:bg-white/10 p-2 rounded-xl transition-colors"
          >
            <Menu size={24} />
          </button>
        </div>
        <button onClick={() => setIsMobileOpen(false)} className="lg:hidden absolute right-8 text-white p-2">
          <X size={24} />
        </button>
      </div>

      <nav className="flex-1 mt-2 relative flex flex-col h-full">
        {(activeIndex !== -1 || isInactivePage || isAuditPage) && (
          <div 
            className="absolute right-0 bg-slate-50 z-0 hidden lg:block"
            style={{ 
              height: styles.height, 
              top: styles.top, 
              left: styles.left,
              width: styles.width,
              borderRadius: styles.borderRadius,
              transition: 'all 450ms cubic-bezier(0.4, 0, 0.2, 1)'
            }}
          >
            <div className="absolute right-0 -top-10 w-10 h-10 bg-slate-50 pointer-events-none before:content-[''] before:absolute before:inset-0 before:bg-[#E60000] before:rounded-br-[30px]" />
            <div className="absolute right-0 -bottom-10 w-10 h-10 bg-slate-50 pointer-events-none before:content-[''] before:absolute before:inset-0 before:bg-[#E60000] before:rounded-tr-[30px]" />
          </div>
        )}

        <ul className="space-y-1 relative z-10">
          {menuItems.map((item) => {
            const isEmployeeMain = item.href === '/hr/employees';
            const isReportsMain = item.href === '/hr/reports';
            
            const isMainActive = (pathname === item.href && (isEmployeeMain ? currentStatus === 'Active' : true) && !isInactivePage && !isAuditPage) || 
                                (isEmployeeMain && isInactivePage && !isEmployeesOpen) ||
                                (isReportsMain && isAuditPage && !isReportsOpen);
            
            const IconToDisplay = (isCollapsed && isInactivePage && isEmployeeMain) ? UserX : (isCollapsed && isAuditPage && isReportsMain) ? History : item.icon;

            return (
              <li key={item.name} className="flex flex-col">
                <div className="flex justify-start relative">
                  <Link
                    href={isEmployeeMain && isInactivePage && isCollapsed ? `${item.href}?status=Inactive` : isReportsMain && isAuditPage && isCollapsed ? `/hr/adjusts` : (isEmployeeMain ? `${item.href}?status=Active` : item.href)}
                    className={`flex items-center h-[56px] w-full transition-all duration-300 rounded-l-[30px] px-7 gap-6
                      ${isMainActive || (isCollapsed && isInactivePage && isEmployeeMain) || (isCollapsed && isAuditPage && isReportsMain) ? 'text-[#E60000]' : 'text-white/60 hover:text-white'}
                    `}
                  >
                    <div className="w-6 h-6 flex items-center justify-center shrink-0 relative">
                      {(isMainActive || (isCollapsed && isInactivePage && isEmployeeMain) || (isCollapsed && isAuditPage && isReportsMain)) && (
                        <div className="absolute inset-[-6px] bg-red-300/50 rounded-full animate-in fade-in zoom-in duration-300" />
                      )}
                      <IconToDisplay size={22} className="relative z-10" />
                    </div>
                    {!isCollapsed && (
                      <div className="flex items-center justify-between w-full">
                        <span className="font-bold text-lg tracking-tight whitespace-nowrap">
                          {item.name}
                        </span>
                        {item.hasSubmenu && (
                          <button 
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              if(isEmployeeMain) setIsEmployeesOpen(!isEmployeesOpen);
                              if(isReportsMain) setIsReportsOpen(!isReportsOpen);
                            }}
                            className="p-1 hover:bg-white/10 rounded-lg transition-colors"
                          >
                            <ChevronDown 
                              size={18} 
                              className={`${isMainActive ? 'text-[#E60000]' : 'text-white'} transition-transform duration-300 ${(isEmployeeMain && isEmployeesOpen) || (isReportsMain && isReportsOpen) ? 'rotate-180' : ''}`} 
                            />
                          </button>
                        )}
                      </div>
                    )}
                  </Link>
                </div>

                {item.hasSubmenu && ((isEmployeeMain && isEmployeesOpen) || (isReportsMain && isReportsOpen)) && !isCollapsed && (
                  <ul className="mt-1 ml-0 space-y-1 animate-in slide-in-from-top-2 duration-300">
                    {item.submenu?.map((sub) => {
                      const isSubActive = sub.href ? pathname === sub.href : (pathname === item.href && currentStatus === sub.filter);
                      return (
                        <li key={sub.name}>
                          <Link
                            href={sub.href || `${item.href}?status=${sub.filter}`}
                            className={`flex items-center h-[46px] w-full transition-all duration-300 rounded-l-[22px] px-7 gap-5
                              ${isSubActive ? 'text-[#E60000]' : 'text-white/50 hover:text-white'}
                            `}
                          >
                            <div className="w-6 h-6 flex items-center justify-center shrink-0 ml-5 relative">
                                {isSubActive && (
                                    <div className="absolute inset-[-5px] bg-red-400/40 rounded-full animate-in fade-in zoom-in duration-300" />
                                )}
                                <sub.icon size={18} className="relative z-10" />
                            </div>
                            <span className="font-bold text-md tracking-tight whitespace-nowrap">
                              {sub.name}
                            </span>
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      </nav>
    </aside>
  );
}