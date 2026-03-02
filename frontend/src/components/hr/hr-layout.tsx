"use client";
import React, { useState } from 'react';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import Sidebar from './hr-sidebar';
import TopBar from './hr-topbar';

export default function HRLayout({ children }: { children: React.ReactNode }) {
    const { isLoading, isAuthenticated } = useAuth('HR');
    const [isMobileOpen, setIsMobileOpen] = useState(false);
    const [isCollapsed, setIsCollapsed] = useState(false);
    const pathname = usePathname();

    // Show loading state while checking auth
    if (isLoading || !isAuthenticated) {
        return (
            <div className="flex h-screen items-center justify-center bg-white">
                <div className="text-gray-500">Loading...</div>
            </div>
        );
    }

    return (
        <div className="h-screen bg-white overflow-hidden relative">

            {/* Top Bar - full width, above everything */}
            <TopBar setIsMobileOpen={setIsMobileOpen} />

            {/* Mobile Overlay */}
            {isMobileOpen && (
                <div
                    className="fixed inset-0 bg-slate-900/50 z-40 lg:hidden backdrop-blur-sm transition-opacity"
                    onClick={() => setIsMobileOpen(false)}
                />
            )}

            {/* Sidebar */}
            <Sidebar isMobileOpen={isMobileOpen} setIsMobileOpen={setIsMobileOpen} isCollapsed={isCollapsed} setIsCollapsed={setIsCollapsed} />

            {/* Main Content Area */}
            <div className={`h-[calc(100vh-4rem)] mt-16 transition-all duration-300 ${isCollapsed ? 'lg:ml-20' : 'lg:ml-72'}`}>
                <main className="h-full overflow-y-auto p-4 md:p-8">
                    {/* key={pathname} ensures the smooth page transition triggers on navigation */}
                    <div
                        key={pathname}
                        className="max-w-7xl mx-auto animate-in fade-in slide-in-from-bottom-2 duration-500 ease-out"
                    >
                        {children}
                    </div>
                </main>
            </div>
        </div>
    );
}
