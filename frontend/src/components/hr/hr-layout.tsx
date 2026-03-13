'use client'

import React, { useState } from "react"
import Sidebar from './hr-sidebar'
import TopBar from './hr-topbar'

export function HRLayout({ children }: { children: React.ReactNode }) {
    const [isMobileOpen, setIsMobileOpen] = useState(false)
    const [isCollapsed, setIsCollapsed] = useState(false)

    return (
        <div className="relative min-h-screen bg-slate-50 flex flex-col">

            <header className="fixed top-0 left-0 right-0 z-[100] h-16">
                <TopBar setIsMobileOpen={setIsMobileOpen} />
            </header>

            <div className="flex flex-1 pt-16">
                <Sidebar
                    isMobileOpen={isMobileOpen}
                    setIsMobileOpen={setIsMobileOpen}
                    isCollapsed={isCollapsed}
                    setIsCollapsed={setIsCollapsed}
                />

                <main
                    className={`flex-1 min-w-0 transition-all duration-300 p-6 
                    ${isCollapsed ? 'lg:ml-24' : 'lg:ml-64'} 
                    ml-0`}
                >

                    <div className="w-full h-full relative">
                        {children}
                    </div>
                </main>
            </div>
        </div>
    )
}