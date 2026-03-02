"use client";
import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { User, Menu, Settings, LogOut, ChevronDown } from 'lucide-react';
import Image from 'next/image';

export default function TopBar({ setIsMobileOpen }: { setIsMobileOpen: (val: boolean) => void }) {
  const router = useRouter();
  const [time, setTime] = useState(new Date());
  const [mounted, setMounted] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isDeviceOnline, setIsDeviceOnline] = useState(true); 
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [userName, setUserName] = useState('');

  useEffect(() => {
    setMounted(true);
    try {
      const employee = localStorage.getItem('employee');
      if (employee) {
        const parsed = JSON.parse(employee);
        setUserName(`${parsed.firstName} ${parsed.lastName}`);
      }
    } catch {
      setUserName('HR');
    }
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => {
      clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsProfileOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('employee');
    router.push('/login');
  };

  return (
    <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-4 md:px-8 fixed top-0 left-0 right-0 z-70">
      <div className="flex items-center gap-4 flex-1">
        <button onClick={() => setIsMobileOpen(true)} className="lg:hidden p-2 text-slate-600 hover:bg-slate-100 rounded-lg">
          <Menu size={24} />
        </button>
        <div className="flex items-center gap-3">
          
          <div className="relative h-11 w-11 overflow-hidden rounded-xl border border-red-700 bg-[#FE0908]">
            <Image src="/images/av.jpg" alt="Logo" fill className="object-contain" priority quality={100} />
          </div>
          <h1 className="text-[#E60000] font-black text-2xl tracking-tighter uppercase whitespace-nowrap">BITS</h1>
        </div>
      </div>

      <div className="flex items-center gap-3 md:gap-6">
        <button 
          onClick={() => setIsDeviceOnline(!isDeviceOnline)}
          className={`hidden md:flex items-center gap-3 px-3 py-1.5 border rounded-full transition-all duration-300 ${
            isDeviceOnline 
            ? 'bg-emerald-50 border-emerald-100 text-emerald-700 hover:bg-emerald-100' 
            : 'bg-rose-50 border-rose-100 text-rose-700 hover:bg-rose-100'
          }`}
        >
          <div className="relative flex h-2 w-2">
            <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${isDeviceOnline ? 'bg-emerald-400' : 'bg-rose-400'}`}></span>
            <span className={`relative inline-flex rounded-full h-2 w-2 ${isDeviceOnline ? 'bg-emerald-500' : 'bg-rose-500'}`}></span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] font-black uppercase tracking-tighter">
              {isDeviceOnline ? 'ZK-Device Online' : 'ZK-Device Offline'}
            </span>
          </div>
        </button>

        <div className="hidden sm:block text-right border-l pl-6 border-slate-200">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-none mb-1">System Time</p>
          <p className="text-sm font-black text-slate-700 font-mono tracking-tighter">{mounted ? time.toLocaleTimeString() : ''}</p>
        </div>

        <div className="relative" ref={dropdownRef}>
          <button onClick={() => setIsProfileOpen(!isProfileOpen)} className="flex items-center gap-2 group p-1 rounded-full hover:bg-slate-50 transition-colors">
            <div className="h-9 w-9 rounded-full bg-red-600 flex items-center justify-center text-white shadow-lg shadow-red-200 group-hover:scale-105 transition-transform overflow-hidden">
              <User size={18} />
            </div>
            <ChevronDown size={14} className={`text-slate-400 transition-transform duration-200 ${isProfileOpen ? 'rotate-180' : ''}`} />
          </button>

          {isProfileOpen && (
            <div className="absolute right-0 mt-2 w-52 bg-white border border-slate-200 rounded-2xl shadow-xl py-2 z-50 origin-top-right animate-in fade-in slide-in-from-top-4 zoom-in-95 duration-200 ease-out">
              <div className="px-4 py-3 border-b border-slate-50 text-center">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Signed in as</p>
                <p className="text-sm font-black text-slate-800 uppercase tracking-tight">{userName || 'Mwehehe'}</p>
              </div>
              <div className="p-1">
                <Link href="/hr/settings" onClick={() => setIsProfileOpen(false)} className="w-full flex items-center gap-3 px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 hover:text-slate-900 rounded-xl transition-colors">
                  <Settings size={16} /> Account Settings
                </Link>
              </div>
              <div className="p-1 border-t border-slate-50 mt-1">
                <button onClick={handleLogout} className="w-full flex items-center gap-3 px-3 py-2 text-sm font-semibold text-red-600 hover:bg-red-50 rounded-xl transition-colors text-left">
                  <LogOut size={16} /> Logout
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}