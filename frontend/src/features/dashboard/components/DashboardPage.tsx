'use client';

import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAttendanceStream, AttendanceStreamPayload } from '@/features/attendance/hooks/useAttendanceStream';
import { useDeviceStream, DeviceStatusPayload, DeviceConnectedPayload } from '@/features/devices/hooks/useDeviceStream';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell
} from 'recharts';
import {
    Fingerprint, Users, CheckCircle2, XCircle, Activity, RadioTower,
    ArrowRight, UserCheck, UserX, Timer, Clock, CalendarDays,
    LogIn, LogOut, MapPin, ArrowUpRight, ArrowDownRight,
    RefreshCw
} from 'lucide-react';

export interface DashboardPageProps {
    role: 'admin' | 'hr';
}

interface Branch { id: number; name: string; address?: string; }
interface Device { id: number; name: string; ip: string; port: number; location?: string; isActive: boolean; syncEnabled: boolean; }
interface DeviceWithStatus extends Device { online: boolean | null; }

interface BranchData {
    name: string;
    percentage: number;
    color: string;
}

interface LiveRecord {
    id: string;
    employee: string;
    department: string;
    branch: string;
    eventType: 'check-in' | 'check-out';
    time: string;
    eventTs: number;
    status: 'on-time' | 'late' | 'absent' | 'undertime';
    shiftType: string;
}

interface WeekDay {
    day: string;
    present: number;
    late: number;
    absent: number;
}

const phtStr = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function getInitials(name: string) {
    const parts = name.trim().split(' ');
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    return name.slice(0, 2).toUpperCase();
}

function Skeleton({ className }: { className?: string }) {
    return <div className={`animate-pulse bg-slate-200 rounded-lg ${className ?? ''}`} />;
}

function getWeekDates(): { day: string; date: Date }[] {
    const now = new Date();
    const todayIndex = now.getDay();
    const monday = new Date(now);
    monday.setDate(now.getDate() - ((todayIndex === 0 ? 7 : todayIndex) - 1));
    monday.setHours(0, 0, 0, 0);
    return Array.from({ length: 5 }, (_, i) => {
        const d = new Date(monday);
        d.setDate(monday.getDate() + i);
        return { day: dayNames[d.getDay()], date: d };
    });
}

function ChartTooltip({ active, payload, label }: any) {
    if (!active || !payload?.length) return null;
    return (
        <div className="bg-white border border-slate-200 rounded-lg shadow-lg px-3 py-2 text-xs">
            <p className="font-black text-slate-700 mb-1">{label}</p>
            {payload.map((p: any) => (
                <div key={p.name} className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full" style={{ background: p.fill }} />
                    <span className="text-slate-600 capitalize">{p.name}</span>
                    <span className="ml-auto font-black text-slate-800">{p.value}</span>
                </div>
            ))}
        </div>
    );
}

export function DashboardPage({ role }: DashboardPageProps) {
    const router = useRouter();
    const basePath = role === 'admin' ? '' : '/hr';

    const [loading, setLoading] = useState(true);
    const [devices, setDevices] = useState<DeviceWithStatus[]>([]);
    const activityScrollRef = useRef<HTMLDivElement>(null);

    const [branchPresence, setBranchPresence] = useState<BranchData[]>([]);
    const [activity, setActivity] = useState<LiveRecord[]>([]);
    const [weeklyData, setWeeklyData] = useState<WeekDay[]>([]);
    const [totalEmployees, setTotalEmployees] = useState(0);
    const [totalPresent, setTotalPresent] = useState(0);
    const [totalLate, setTotalLate] = useState(0);
    const [totalAbsent, setTotalAbsent] = useState(0);

    const [globalSyncEnabled, setGlobalSyncEnabled] = useState(true);

    const load = useCallback(async () => {
        try {
            const todayStr = phtStr(new Date());
            const weekDates = getWeekDates();
            const weekStart = phtStr(weekDates[0].date);
            const weekEnd = phtStr(weekDates[4].date);

            const [bRes, dRes, eRes, aRes, wRes, sRes] = await Promise.all([
                fetch('/api/branches', { credentials: 'include' }),
                fetch('/api/devices', { credentials: 'include' }),
                fetch('/api/employees?limit=5000', { credentials: 'include' }),
                fetch(`/api/attendance?startDate=${todayStr}&endDate=${todayStr}&limit=5000`, { credentials: 'include' }),
                fetch(`/api/attendance?startDate=${weekStart}&endDate=${weekEnd}&limit=5000`, { credentials: 'include' }),
                fetch('/api/system/sync-status', { credentials: 'include' }),
            ]);
            if (eRes.status === 401) { router.replace('/login'); return; }

            const bd = bRes.ok ? await bRes.json() : { success: false };
            const dd = dRes.ok ? await dRes.json() : { success: false };
            const ed = await eRes.json();
            const ad = await aRes.json();
            const wd = await wRes.json();
            const sd = sRes.ok ? await sRes.json() : { success: false };

            const branchList: Branch[] = bd.success ? (bd.branches || bd.data || []) : [];
            const deviceList: Device[] = dd.success ? (dd.devices || dd.data || []) : [];
            const allEmps: any[] = ed.success ? (ed.employees || ed.data || []) : [];
            const emps = allEmps.filter((e: any) => e.role === 'USER' || !e.role);
            const atts: any[] = (ad.success ? (ad.data || []) : []).filter((a: any) => {
                const emp = a.employee || a.Employee || {};
                return emp.role === 'USER' || !emp.role;
            });
            const weekAtts: any[] = (wd.success ? (wd.data || []) : []).filter((a: any) => {
                const emp = a.employee || a.Employee || {};
                return emp.role === 'USER' || !emp.role;
            });

            const activeCount = emps.filter(e => e.employmentStatus === 'ACTIVE').length;
            setTotalEmployees(activeCount);

            const todayPHTStr = phtStr(new Date());
            const weekly: WeekDay[] = weekDates.map(({ day, date }) => {
                const dateStr = phtStr(date);
                const dayAtts = weekAtts.filter(a => {
                    const recDate = a.date ? phtStr(new Date(a.date)) : '';
                    return recDate === dateStr;
                });

                const late = dayAtts.filter(a => a.checkInTime && a.lateMinutes > 0).length;
                const present = dayAtts.filter(a => a.checkInTime && (!a.lateMinutes || a.lateMinutes === 0)).length;
                const absent = dateStr <= todayPHTStr ? Math.max(0, activeCount - present - late) : 0;
                return { day, present, late, absent };
            });
            setWeeklyData(weekly);

            const devicesWithStatus: DeviceWithStatus[] = deviceList.map(dev => ({
                ...dev,
                syncEnabled: (dev as any).syncEnabled ?? true,
                online: dev.isActive
            }));
            setDevices(devicesWithStatus);

            if (sd && sd.success) {
                setGlobalSyncEnabled(sd.status.globalSyncEnabled);
            }

            const bPresence: BranchData[] = branchList.map(b => {
                const branchEmps = emps.filter(e => e.branch === b.name && e.employmentStatus === 'ACTIVE');
                const branchAtts = atts.filter(a => a.employee?.branch === b.name && a.checkInTime);
                const total = branchEmps.length;
                const present = branchAtts.length;
                const pct = total === 0 ? 0 : Math.round((present / total) * 100);
                const color = pct >= 80 ? 'bg-emerald-500' : pct >= 50 ? 'bg-amber-500' : 'bg-rose-500';
                return { name: b.name, percentage: pct, color };
            });
            setBranchPresence(bPresence);

            const todayLate = atts.filter(a => a.checkInTime && a.lateMinutes > 0).length;
            const todayPresent = atts.filter(a => a.checkInTime && (!a.lateMinutes || a.lateMinutes === 0)).length;
            setTotalPresent(todayPresent);
            setTotalLate(todayLate);
            setTotalAbsent(Math.max(0, activeCount - todayPresent - todayLate));

            const events: LiveRecord[] = [];
            for (const r of atts) {
                const empName = `${r.employee?.firstName || ''} ${r.employee?.lastName || ''}`.trim();
                const dept = r.employee?.Department?.name || r.employee?.department || '—';
                const branch = r.employee?.branch || '—';
                const ciStatus: LiveRecord['status'] = r.status === 'absent' ? 'absent' : (r.lateMinutes > 0 ? 'late' : 'on-time');

                if (r.checkInTime) {
                    events.push({
                        id: `${r.id}-in`,
                        employee: empName,
                        department: dept,
                        branch,
                        eventType: 'check-in',
                        time: new Date(r.checkInTime).toLocaleTimeString('en-US', { timeZone: 'Asia/Manila', hour: '2-digit', minute: '2-digit' }),
                        eventTs: new Date(r.checkInTime).getTime(),
                        status: ciStatus,
                        shiftType: r.shiftType || 'MORNING',
                    });
                }

                if (r.checkOutTime) {
                    events.push({
                        id: `${r.id}-out`,
                        employee: empName,
                        department: dept,
                        branch,
                        eventType: 'check-out',
                        time: new Date(r.checkOutTime).toLocaleTimeString('en-US', { timeZone: 'Asia/Manila', hour: '2-digit', minute: '2-digit' }),
                        eventTs: new Date(r.checkOutTime).getTime(),
                        status: r.undertimeMinutes > 0 ? 'undertime' : 'on-time',
                        shiftType: r.shiftType || 'MORNING',
                    });
                }
            }

            events.sort((a, b) => b.eventTs - a.eventTs);
            setActivity(events.slice(0, 15));
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    }, [router]);

    const handleStreamRecord = useCallback((payload: AttendanceStreamPayload) => {
        const emp = payload.record.employee;
        const empName = emp
            ? `${emp.firstName}${(emp as any).middleName ? ` ${(emp as any).middleName[0]}.` : ''} ${emp.lastName}${(emp as any).suffix ? ` ${(emp as any).suffix}` : ''}`.trim()
            : 'Unknown';
        const isLate = payload.record.lateMinutes > 0;
        const isUndertime = payload.record.undertimeMinutes > 0;

        const newEntry: LiveRecord = {
            id: `stream-${payload.record.id}-${payload.type}-${payload.record.checkOutTime ?? 'in'}`,
            employee: empName,
            department: emp?.Department?.name || emp?.department || '—',
            branch: emp?.branch || '—',
            eventType: payload.type === 'check-in' ? 'check-in' : 'check-out',
            time: new Date(payload.type === 'check-in' ? payload.record.checkInTime : payload.record.checkOutTime!).toLocaleTimeString('en-US', {
                timeZone: 'Asia/Manila',
                hour: '2-digit',
                minute: '2-digit',
            }),
            eventTs: new Date(payload.type === 'check-in' ? payload.record.checkInTime : payload.record.checkOutTime!).getTime(),
            status: payload.type === 'check-in' ? (isLate ? 'late' : 'on-time') : (isUndertime ? 'undertime' : 'on-time'),
            shiftType: 'MORNING',
        };

        setActivity(prev => [newEntry, ...prev].slice(0, 15));

        if (payload.type === 'check-in') {
            if (isLate) {
                setTotalLate(prev => prev + 1);
            } else {
                setTotalPresent(prev => prev + 1);
            }
            setTotalAbsent(prev => Math.max(0, prev - 1));
        }
    }, []);

    useAttendanceStream({
        onRecord: handleStreamRecord,
    });

    const handleDeviceConnected = useCallback((payload: DeviceConnectedPayload) => {
        setDevices(prev => prev.map(d => {
            const fresh = payload.devices.find(sd => sd.id === d.id);
            if (!fresh) return d;
            return { ...d, online: fresh.isActive, isActive: fresh.isActive, syncEnabled: fresh.syncEnabled };
        }));
    }, []);

    const handleDeviceStatusChange = useCallback((payload: DeviceStatusPayload) => {
        setDevices(prev => prev.map(d =>
            d.id === payload.id
                ? { ...d, online: payload.isActive, isActive: payload.isActive }
                : d
        ));
    }, []);

    useDeviceStream({
        onConnected: handleDeviceConnected,
        onStatusChange: handleDeviceStatusChange,
    });

    useEffect(() => {
        if (activityScrollRef.current) {
            activityScrollRef.current.scrollTop = 0;
        }
    }, [activity]);

    useEffect(() => {
        fetch('/api/auth/me', { credentials: 'include' })
            .then(r => { if (!r.ok) router.replace('/login'); })
            .catch(() => router.replace('/login'));
        load();
        const t = setInterval(load, 30_000);
        return () => clearInterval(t);
    }, [load]);

    if (loading) return (
        <div className="flex flex-col gap-3 min-h-[calc(100vh-4rem)] lg:h-[calc(100vh-4rem)]">
            <div className="h-7 w-44 animate-pulse bg-slate-200 rounded-lg" />
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-[68px] rounded-xl" />)}
            </div>
            <div className="flex-1 grid grid-cols-1 lg:grid-cols-3 gap-3 min-h-0">
                <div className="lg:col-span-2 space-y-3">
                    <Skeleton className="h-56 lg:h-48 rounded-xl" />
                    <Skeleton className="h-24 rounded-xl" />
                </div>
                <Skeleton className="h-64 lg:h-auto rounded-xl" />
            </div>
        </div>
    );

    const onlineDevices = devices.filter(d => d.online).length;
    const offlineDevices = devices.filter(d => !d.online).length;
    const todayName = dayNames[new Date().getDay()];

    return (
        <div className="flex flex-col gap-2.5 min-h-[calc(100vh-4rem)] lg:h-[calc(100vh-4rem)] lg:overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between shrink-0">
                <div>
                    <h1 className="text-lg lg:text-xl font-black text-slate-900 tracking-tight">
                        {role === 'admin' ? 'System Overview' : 'HR Overview'}
                    </h1>
                    <p className="text-slate-500 text-xs font-semibold">
                        {new Date().toLocaleDateString('en-PH', {
                            timeZone: 'Asia/Manila',
                            weekday: 'long',
                            year: 'numeric',
                            month: 'long',
                            day: 'numeric',
                        })}
                    </p>
                </div>
            </div>

            {/* KPI Stats */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 shrink-0">
                {[
                    { label: 'Employees', value: totalEmployees, icon: Users, color: 'text-blue-600', bg: 'bg-blue-50', accent: 'border-blue-100', path: `${basePath}/employees` },
                    { label: 'On Time', value: totalPresent, icon: UserCheck, color: 'text-emerald-600', bg: 'bg-emerald-50', accent: 'border-emerald-100', path: `${basePath}/attendance?status=Present` },
                    { label: 'Late', value: totalLate, icon: Timer, color: 'text-amber-600', bg: 'bg-amber-50', accent: 'border-amber-100', path: `${basePath}/attendance?status=Late` },
                    { label: 'Absent', value: totalAbsent, icon: UserX, color: 'text-rose-600', bg: 'bg-rose-50', accent: 'border-rose-100', path: `${basePath}/attendance?status=Absent` },
                ].map(s => (
                    <div key={s.label} onClick={() => router.push(s.path)} className={`bg-white rounded-xl border ${s.accent} shadow-sm px-3 lg:px-4 py-2.5 lg:py-3 flex items-center gap-2.5 cursor-pointer hover:shadow-md transition-all active:scale-95`}>
                        <div className={`w-8 h-8 lg:w-9 lg:h-9 rounded-lg ${s.bg} flex items-center justify-center shrink-0`}>
                            <s.icon className={`w-4 h-4 lg:w-[18px] lg:h-[18px] ${s.color}`} />
                        </div>
                        <div>
                            <p className="text-xl lg:text-2xl font-black text-slate-900 leading-none">{s.value}</p>
                            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-0.5">{s.label}</p>
                        </div>
                    </div>
                ))}
            </div>

            {/* Main content */}
            <div className="flex-1 grid grid-cols-1 lg:grid-cols-3 gap-2.5 min-h-0">
                
                {/* Left 2/3 */}
                <div className="lg:col-span-2 flex flex-col gap-2.5 min-h-0">
                    {/* Weekly Attendance Chart */}
                    <div className="bg-white rounded-xl border border-slate-100 shadow-sm flex flex-col min-h-[260px] lg:min-h-0 lg:flex-1">
                        <div className="flex items-center justify-between px-4 py-2 border-b border-slate-100 shrink-0">
                            <h2 className="text-xs font-black text-slate-600 uppercase tracking-widest flex items-center gap-1.5">
                                <CalendarDays className="w-3.5 h-3.5 text-red-500" /> Weekly Attendance
                            </h2>
                            <span className="text-xs text-slate-500 font-bold">Mon – Fri</span>
                        </div>
                        <div className="flex-1 min-h-0 p-3">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={weeklyData} barGap={2} barCategoryGap="20%">
                                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                                    <XAxis dataKey="day" tick={{ fontSize: 11, fontWeight: 700, fill: '#64748b' }} axisLine={false} tickLine={false} />
                                    <YAxis tick={{ fontSize: 10, fontWeight: 600, fill: '#94a3b8' }} axisLine={false} tickLine={false} width={32} />
                                    <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(0,0,0,0.03)', radius: 4 }} />
                                    <Bar dataKey="present" fill="#10b981" radius={[4, 4, 0, 0]} name="Present">
                                        {weeklyData.map((entry, i) => <Cell key={i} opacity={entry.day === todayName ? 1 : 0.7} />)}
                                    </Bar>
                                    <Bar dataKey="late" fill="#f59e0b" radius={[4, 4, 0, 0]} name="Late">
                                        {weeklyData.map((entry, i) => <Cell key={i} opacity={entry.day === todayName ? 1 : 0.7} />)}
                                    </Bar>
                                    <Bar dataKey="absent" fill="#f43f5e" radius={[4, 4, 0, 0]} name="Absent">
                                        {weeklyData.map((entry, i) => <Cell key={i} opacity={entry.day === todayName ? 1 : 0.7} />)}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </div>

                    {/* Devices or Branch Presence toggled by role, but to align both, HR gets Branch Presence, Admin gets Devices here */}
                     <div className="bg-white rounded-xl border border-slate-100 shadow-sm shrink-0">
                         {role === 'hr' ? (
                             <>
                             <div className="flex items-center justify-between px-4 py-2 border-b border-slate-100">
                                <h2 className="text-xs font-black text-slate-600 uppercase tracking-widest flex items-center gap-1.5">
                                    <MapPin className="w-3.5 h-3.5 text-red-500" /> Branch Presence
                                </h2>
                            </div>
                            <div className="p-2">
                                {branchPresence.length === 0 ? (
                                    <div className="flex flex-col items-center justify-center py-4 gap-1.5">
                                        <MapPin className="w-6 h-6 text-slate-200" />
                                        <p className="text-slate-400 text-sm font-semibold">No branches configured</p>
                                    </div>
                                ) : (
                                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                                        {branchPresence.map(branch => (
                                            <div
                                                key={branch.name}
                                                onClick={() => router.push(`${basePath}/attendance?branch=${encodeURIComponent(branch.name)}`)}
                                                className={`rounded-lg border p-2 flex items-center gap-2 cursor-pointer hover:opacity-80 transition-opacity ${branch.percentage >= 80 ? 'border-emerald-100 bg-emerald-50/30' : branch.percentage >= 50 ? 'border-amber-100 bg-amber-50/30' : 'border-rose-100 bg-rose-50/30'}`}
                                            >
                                                <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${branch.percentage >= 80 ? 'bg-emerald-100' : branch.percentage >= 50 ? 'bg-amber-100' : 'bg-rose-100'}`}>
                                                    <MapPin className={`w-3.5 h-3.5 ${branch.percentage >= 80 ? 'text-emerald-600' : branch.percentage >= 50 ? 'text-amber-500' : 'text-rose-500'}`} />
                                                </div>
                                                <div className="min-w-0 flex-1">
                                                    <p className="text-xs font-bold text-slate-800 truncate leading-tight">{branch.name}</p>
                                                    <p className="text-[10px] text-slate-500 font-mono">{branch.percentage}% present</p>
                                                </div>
                                                {branch.percentage >= 80 ? <ArrowUpRight className="w-3.5 h-3.5 text-emerald-500 shrink-0" /> : branch.percentage >= 50 ? <ArrowDownRight className="w-3.5 h-3.5 text-amber-400 shrink-0" /> : <ArrowDownRight className="w-3.5 h-3.5 text-rose-400 shrink-0" />}
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                             </>
                         ) : (
                             <>
                             <div className="flex items-center justify-between px-4 py-2 border-b border-slate-100">
                                <h2 className="text-xs font-black text-slate-600 uppercase tracking-widest flex items-center gap-1.5">
                                    <RadioTower className="w-3.5 h-3.5 text-red-500" /> Devices
                                    {!globalSyncEnabled && (
                                        <span className="ml-1 text-[9px] bg-red-100 text-red-600 px-1.5 py-0.5 rounded font-black border border-red-200">
                                            SYNC PAUSED
                                        </span>
                                    )}
                                </h2>
                                <div className="flex gap-1.5">
                                    <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase text-emerald-600 bg-emerald-50 border border-emerald-100 px-2 py-0.5 rounded-full">
                                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />{onlineDevices} on
                                    </span>
                                    <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase text-rose-500 bg-rose-50 border border-rose-100 px-2 py-0.5 rounded-full">
                                        <span className="w-1.5 h-1.5 rounded-full bg-rose-400" />{offlineDevices} off
                                    </span>
                                </div>
                            </div>
                            <div className="p-2">
                                {devices.length === 0 ? (
                                    <div className="flex flex-col items-center justify-center py-4 gap-1.5">
                                        <Fingerprint className="w-6 h-6 text-slate-200" />
                                        <p className="text-slate-400 text-sm font-semibold">No devices configured</p>
                                    </div>
                                ) : (
                                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                                        {devices.map(dev => (
                                            <div
                                                key={dev.id}
                                                className={`rounded-lg border p-2 flex items-center gap-2 ${dev.online ? 'border-emerald-100 bg-emerald-50/30' : 'border-rose-100 bg-rose-50/30'}`}
                                            >
                                                <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${dev.online ? 'bg-emerald-100' : 'bg-rose-100'}`}>
                                                    <Fingerprint className={`w-3.5 h-3.5 ${dev.online ? 'text-emerald-600' : 'text-rose-500'}`} />
                                                </div>
                                                <div className="min-w-0 flex-1">
                                                    <p className="text-xs font-bold text-slate-800 truncate leading-tight">{dev.name}</p>
                                                    <p className="text-[10px] text-slate-500 font-mono">{dev.ip}:{dev.port}</p>
                                                </div>
                                                <div className="flex items-center gap-1 shrink-0">
                                                    {!dev.syncEnabled && (
                                                        <span className="text-[8px] font-black uppercase text-amber-600 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded-full leading-none" title="Sync disabled">
                                                            Sync Off
                                                        </span>
                                                    )}
                                                    {dev.online ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> : <XCircle className="w-3.5 h-3.5 text-rose-400" />}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                             </>
                         )}
                     </div>
                </div>

                {/* Right 1/3 */}
                <div className="flex flex-col gap-2.5 min-h-0">
                    {/* Activity Feed */}
                    <div className="bg-white rounded-xl border border-slate-100 shadow-sm flex flex-col min-h-[280px] lg:min-h-0 lg:flex-1 overflow-hidden">
                        <div className="flex items-center justify-between px-4 py-2 border-b border-slate-100 shrink-0">
                            <h2 className="text-xs font-black text-slate-600 uppercase tracking-widest flex items-center gap-1.5">
                                <Activity className="w-3.5 h-3.5 text-red-500" /> Activity
                            </h2>
                            <button
                                onClick={() => router.push(`${basePath}/attendance`)}
                                className="flex items-center gap-0.5 text-xs font-black text-red-600 hover:text-red-700 uppercase tracking-wider transition-colors"
                            >
                                All <ArrowRight className="w-3 h-3" />
                            </button>
                        </div>
                        <div ref={activityScrollRef} className="flex-1 overflow-y-auto min-h-0">
                            {activity.length === 0 ? (
                                <div className="flex flex-col items-center justify-center h-full gap-3 px-6 py-8 lg:py-0">
                                    <div className="relative w-16 h-16">
                                        <div className="absolute inset-0 bg-slate-100 rounded-full" />
                                        <div className="absolute inset-2 bg-slate-50 rounded-full flex items-center justify-center">
                                            <Clock className="w-6 h-6 text-slate-300" />
                                        </div>
                                        <div className="absolute -right-1 -top-1 w-5 h-5 bg-red-50 rounded-full flex items-center justify-center border-2 border-white">
                                            <Activity className="w-2.5 h-2.5 text-red-400" />
                                        </div>
                                    </div>
                                    <div className="text-center">
                                        <p className="text-slate-500 font-bold text-sm">No activity yet today</p>
                                        <p className="text-slate-400 text-xs mt-0.5 leading-relaxed">Check-ins will appear here as employees scan</p>
                                    </div>
                                </div>
                            ) : (
                                <div className="divide-y divide-slate-50">
                                    {activity.map(a => (
                                        <div key={a.id} className="flex items-center gap-3 px-3 lg:px-4 py-2.5 hover:bg-slate-50/70 transition-colors">
                                            <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${a.eventType === 'check-in' ? 'bg-gradient-to-br from-emerald-400 to-emerald-600' : 'bg-gradient-to-br from-slate-300 to-slate-500'}`}>
                                                <span className="text-white text-[10px] font-black">{getInitials(a.employee)}</span>
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="font-bold text-slate-800 text-xs leading-tight truncate">{a.employee || '—'}</p>
                                                <p className="text-[10px] text-slate-400 truncate mt-0.5">
                                                    {a.department || '—'}
                                                    {a.branch && a.branch !== '—' ? <span className="text-slate-300"> · </span> : ''}
                                                    {a.branch && a.branch !== '—' ? <span className="text-slate-400">{a.branch}</span> : ''}
                                                </p>
                                            </div>
                                            <div className="shrink-0 text-right hidden sm:block">
                                                <div className="flex items-center gap-1 justify-end">
                                                    {a.eventType === 'check-in' ? <LogIn className="w-3.5 h-3.5 text-emerald-500" /> : <LogOut className="w-3.5 h-3.5 text-slate-400" />}
                                                    <span className="text-[10px] font-mono text-slate-600">{a.time}</span>
                                                </div>
                                            </div>
                                            <div className="flex flex-col items-end gap-0.5 shrink-0">
                                                <span className={`text-[10px] font-black px-1.5 py-0.5 rounded-full ${a.eventType === 'check-in' ? 'bg-blue-50 text-blue-700' : 'bg-slate-50 text-slate-500'}`}>
                                                    {a.eventType === 'check-in' ? 'Check-in' : 'Check-out'}
                                                </span>
                                                <span className={`text-[10px] font-black px-1.5 py-0.5 rounded-full ${a.status === 'on-time' ? 'bg-emerald-50 text-emerald-700' : a.status === 'late' ? 'bg-amber-50 text-amber-700' : a.status === 'undertime' ? 'bg-orange-50 text-orange-700' : 'bg-rose-50 text-rose-700'}`}>
                                                    {a.status === 'on-time' ? 'On Time' : a.status === 'late' ? 'Late' : a.status === 'undertime' ? 'Undertime' : 'Absent'}
                                                </span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                    
                    {/* Secondary module block (Devices for HR, since Admin got devices on the left) */}
                    {role === 'hr' && (
                        <div className="bg-white rounded-xl border border-slate-100 shadow-sm shrink-0">
                             <div className="flex items-center justify-between px-4 py-2 border-b border-slate-100">
                                <h2 className="text-xs font-black text-slate-600 uppercase tracking-widest flex items-center gap-1.5">
                                    <RadioTower className="w-3.5 h-3.5 text-red-500" /> Devices
                                </h2>
                                <div className="flex gap-1.5">
                                    <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase text-emerald-600 bg-emerald-50 border border-emerald-100 px-2 py-0.5 rounded-full">
                                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />{onlineDevices} on
                                    </span>
                                    <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase text-rose-500 bg-rose-50 border border-rose-100 px-2 py-0.5 rounded-full">
                                        <span className="w-1.5 h-1.5 rounded-full bg-rose-400" />{offlineDevices} off
                                    </span>
                                </div>
                            </div>
                            <div className="p-2">
                                {devices.length === 0 ? (
                                    <div className="flex flex-col items-center justify-center py-4 gap-1.5">
                                        <Fingerprint className="w-6 h-6 text-slate-200" />
                                        <p className="text-slate-400 text-sm font-semibold">No devices configured</p>
                                    </div>
                                ) : (
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                        {devices.slice(0, 4).map(dev => (
                                            <div
                                                key={dev.id}
                                                className={`rounded-lg border p-2 flex items-center gap-2 ${dev.online ? 'border-emerald-100 bg-emerald-50/30' : 'border-rose-100 bg-rose-50/30'}`}
                                            >
                                                <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${dev.online ? 'bg-emerald-100' : 'bg-rose-100'}`}>
                                                    <Fingerprint className={`w-3.5 h-3.5 ${dev.online ? 'text-emerald-600' : 'text-rose-500'}`} />
                                                </div>
                                                <div className="min-w-0 flex-1">
                                                    <p className="text-xs font-bold text-slate-800 truncate leading-tight">{dev.name}</p>
                                                    <p className="text-[10px] text-slate-500 font-mono">{dev.ip}:{dev.port}</p>
                                                </div>
                                                <div className="flex items-center gap-1 shrink-0">
                                                    {!dev.syncEnabled && (
                                                        <span className="text-[8px] font-black uppercase text-amber-600 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded-full leading-none" title="Sync disabled">
                                                            Sync Off
                                                        </span>
                                                    )}
                                                    {dev.online ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> : <XCircle className="w-3.5 h-3.5 text-rose-400" />}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
