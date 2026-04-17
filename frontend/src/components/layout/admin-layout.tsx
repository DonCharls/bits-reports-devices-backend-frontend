'use client'

import React, { useState } from "react"
import { useAuth } from '@/hooks/useAuth'
import { AdminSidebar } from './admin-sidebar'
import { AdminTopbar } from './admin-topbar'

export function AdminLayout({ children }: { children: React.ReactNode }) {
    const { isLoading, isAuthenticated } = useAuth('ADMIN')
    const [sidebarOpen, setSidebarOpen] = useState(false)
    const [sidebarCollapsed, setSidebarCollapsed] = useState(false)

    // Show loading state while checking auth
    if (isLoading || !isAuthenticated) {
        return (
            <div className="flex h-screen items-center justify-center bg-gray-50">
                <div className="text-gray-500">Loading...</div>
            </div>
        )
    }

    return (
        <div className="h-screen bg-gray-50 overflow-hidden relative">

            {/* Top Bar - full width, above everything */}
            <AdminTopbar onMenuClick={() => setSidebarOpen(true)} />

            {/* Mobile Overlay */}
            {sidebarOpen && (
                <div
                    className="fixed inset-0 bg-slate-900/50 z-40 lg:hidden backdrop-blur-sm transition-opacity"
                    onClick={() => setSidebarOpen(false)}
                />
            )}

            {/* Sidebar */}
            <AdminSidebar
                isOpen={sidebarOpen}
                isCollapsed={sidebarCollapsed}
                onClose={() => setSidebarOpen(false)}
                onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
            />

            {/* Main Content Area */}
            <div className={`h-[calc(100vh-4rem)] mt-16 transition-all duration-300 ${sidebarCollapsed ? 'lg:ml-24' : 'lg:ml-68'}`}>
                <main className="h-full overflow-y-auto scrollbar-hide p-4 md:p-8">
                    {children}
                </main>
            </div>
        </div>
    )
}