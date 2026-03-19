'use client'

import React, { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import {
    ScrollText, Filter, ChevronLeft, ChevronRight,
    LogIn, LogOut, Fingerprint, Clock, CalendarDays,
    Search, RefreshCw
} from 'lucide-react'

/* ── Types ── */
interface LogEntry {
    id: string
    type: 'timekeeping' | 'system'
    timestamp: string
    employeeName: string
    employeeId: number
    action: string
    details: string
    source: string
    status?: string
}
interface LogMeta {
    total: number
    page: number
    limit: number
    totalPages: number
    counts: { timekeeping: number; system: number }
}

/* ── Helpers ── */
const phtStr = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' })
function Skeleton({ className }: { className?: string }) {
    return <div className={`animate-pulse bg-slate-200 rounded-lg ${className ?? ''}`} />
}

/* ── Page ── */
export default function SystemLogsPage() {
    const router = useRouter()
    const [logs, setLogs] = useState<LogEntry[]>([])
    const [meta, setMeta] = useState<LogMeta | null>(null)
    const [loading, setLoading] = useState(true)
    const [refreshing, setRefreshing] = useState(false)

    // Filters
    const [activeTab, setActiveTab] = useState<'all' | 'timekeeping' | 'system'>('all')
    const [startDate, setStartDate] = useState(() => {
        const d = new Date()
        d.setDate(d.getDate() - 7)
        return phtStr(d)
    })
    const [endDate, setEndDate] = useState(() => phtStr(new Date()))
    const [searchQuery, setSearchQuery] = useState('')
    const [page, setPage] = useState(1)
    const limit = 30

    const fetchLogs = useCallback(async () => {
        try {
            const params = new URLSearchParams({
                startDate,
                endDate,
                type: activeTab,
                page: String(page),
                limit: String(limit),
            })

            const res = await fetch(`/api/logs?${params}`, { credentials: 'include' })

            if (res.status === 401) {
                router.replace('/login')
                return
            }

            const data = await res.json()
            if (data.success) {
                setLogs(data.data || [])
                setMeta(data.meta || null)
            }
        } catch (err) {
            console.error('Failed to fetch logs:', err)
        } finally {
            setLoading(false)
            setRefreshing(false)
        }
    }, [router, startDate, endDate, activeTab, page])

    useEffect(() => { fetchLogs() }, [fetchLogs])

    const handleRefresh = () => { setRefreshing(true); fetchLogs() }
    const handleTabChange = (tab: 'all' | 'timekeeping' | 'system') => {
        setActiveTab(tab)
        setPage(1)
    }

    // Filter logs by search query (client-side)
    const filteredLogs = searchQuery.trim()
        ? logs.filter(l =>
            l.employeeName.toLowerCase().includes(searchQuery.toLowerCase()) ||
            l.action.toLowerCase().includes(searchQuery.toLowerCase()) ||
            l.source.toLowerCase().includes(searchQuery.toLowerCase())
        )
        : logs

    const formatTimestamp = (ts: string) => {
        const d = new Date(ts)
        return {
            date: d.toLocaleDateString('en-PH', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric' }),
            time: d.toLocaleTimeString('en-US', { timeZone: 'Asia/Manila', hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        }
    }

    const getActionIcon = (action: string) => {
        switch (action) {
            case 'Check In': return <LogIn className="w-4 h-4 text-emerald-600" />
            case 'Check Out': return <LogOut className="w-4 h-4 text-blue-600" />
            case 'Device Scan': return <Fingerprint className="w-4 h-4 text-slate-500" />
            default: return <Clock className="w-4 h-4 text-slate-400" />
        }
    }

    const getActionBadge = (action: string, status?: string) => {
        if (action === 'Check In') {
            if (status === 'late') return 'bg-amber-50 text-amber-700 border-amber-200'
            return 'bg-emerald-50 text-emerald-700 border-emerald-200'
        }
        if (action === 'Check Out') return 'bg-blue-50 text-blue-700 border-blue-200'
        return 'bg-slate-50 text-slate-600 border-slate-200'
    }

    const getTypeBadge = (type: string) => {
        return type === 'timekeeping'
            ? 'bg-violet-50 text-violet-700 border-violet-200'
            : 'bg-slate-50 text-slate-600 border-slate-200'
    }

    /* ── Loading skeleton ── */
    if (loading) return (
        <div className="flex flex-col gap-4 p-4 lg:p-5 min-h-[calc(100vh-4rem)]">
            <div className="flex items-center justify-between">
                <Skeleton className="h-8 w-48" />
                <Skeleton className="h-9 w-28 rounded-lg" />
            </div>
            <div className="flex gap-2">
                {[1, 2, 3].map(i => <Skeleton key={i} className="h-9 w-28 rounded-lg" />)}
            </div>
            <div className="space-y-2">
                {[...Array(8)].map((_, i) => <Skeleton key={i} className="h-14 rounded-lg" />)}
            </div>
        </div>
    )

    return (
        <div className="flex flex-col gap-4 p-4 lg:p-5 min-h-[calc(100vh-4rem)] lg:h-[calc(100vh-4rem)] lg:overflow-hidden">

            {/* ── Header ── */}
            <div className="flex items-center justify-between shrink-0">
                <div>
                    <h1 className="text-lg lg:text-xl font-black text-slate-900 tracking-tight flex items-center gap-2">
                        <ScrollText className="w-5 h-5 text-red-500" /> System Logs
                    </h1>
                    <p className="text-slate-500 text-xs font-semibold mt-0.5">
                        Timekeeping activities & system events
                    </p>
                </div>
                <button
                    onClick={handleRefresh}
                    disabled={refreshing}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 text-slate-600 rounded-lg text-xs font-bold hover:bg-slate-50 hover:border-slate-300 transition-all active:scale-95 disabled:opacity-50 shadow-sm"
                >
                    <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
                    Refresh
                </button>
            </div>

            {/* ── Filters Bar ── */}
            <div className="flex flex-col sm:flex-row flex-wrap items-start sm:items-center gap-2 shrink-0">
                {/* Type Tabs */}
                <div className="flex bg-slate-100 rounded-lg p-0.5 w-full sm:w-auto">
                    {([
                        { key: 'all', label: 'All', count: meta ? meta.counts.timekeeping + meta.counts.system : 0 },
                        { key: 'timekeeping', label: 'Timekeeping', count: meta?.counts.timekeeping ?? 0 },
                        { key: 'system', label: 'System', count: meta?.counts.system ?? 0 },
                    ] as const).map(tab => (
                        <button
                            key={tab.key}
                            onClick={() => handleTabChange(tab.key)}
                            className={`flex-1 sm:flex-none px-3 py-1.5 rounded-md text-xs font-bold transition-all ${activeTab === tab.key
                                    ? 'bg-white text-slate-900 shadow-sm'
                                    : 'text-slate-500 hover:text-slate-700'
                                }`}
                        >
                            {tab.label}
                            <span className={`ml-1.5 text-[10px] ${activeTab === tab.key ? 'text-red-500' : 'text-slate-400'}`}>
                                {tab.count}
                            </span>
                        </button>
                    ))}
                </div>

                <div className="h-6 w-px bg-slate-200 hidden sm:block" />

                {/* Date Filters */}
                <div className="flex items-center gap-1.5 w-full sm:w-auto">
                    <CalendarDays className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <input
                        type="date"
                        value={startDate}
                        onChange={e => { setStartDate(e.target.value); setPage(1) }}
                        className="px-2 py-1 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 bg-white focus:outline-none focus:border-red-300 focus:ring-1 focus:ring-red-100 flex-1 sm:flex-none min-w-0"
                    />
                    <span className="text-slate-400 text-xs">to</span>
                    <input
                        type="date"
                        value={endDate}
                        onChange={e => { setEndDate(e.target.value); setPage(1) }}
                        className="px-2 py-1 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 bg-white focus:outline-none focus:border-red-300 focus:ring-1 focus:ring-red-100 flex-1 sm:flex-none min-w-0"
                    />
                </div>

                {/* Search */}
                <div className="relative w-full sm:w-auto sm:ml-auto">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                    <input
                        type="text"
                        placeholder="Search logs..."
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        className="pl-8 pr-3 py-1.5 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 bg-white focus:outline-none focus:border-red-300 focus:ring-1 focus:ring-red-100 w-full sm:w-44"
                    />
                </div>
            </div>

            {/* ── Logs ── */}
            <div className="flex-1 bg-white rounded-xl border border-slate-100 shadow-sm flex flex-col min-h-0 overflow-hidden">

                {/* Desktop Table Header (hidden on mobile) */}
                <div className="hidden lg:grid grid-cols-[140px_1fr_120px_1fr_120px_100px] gap-3 px-4 py-2.5 bg-slate-50 border-b border-slate-100 text-[10px] font-black text-slate-500 uppercase tracking-widest shrink-0">
                    <span>Timestamp</span>
                    <span>Employee</span>
                    <span>Action</span>
                    <span>Details</span>
                    <span>Source</span>
                    <span>Type</span>
                </div>

                {/* Mobile Header */}
                <div className="lg:hidden px-4 py-2.5 bg-slate-50 border-b border-slate-100 text-[10px] font-black text-slate-500 uppercase tracking-widest shrink-0">
                    Log Entries
                </div>

                {/* Body */}
                <div className="flex-1 overflow-y-auto min-h-0">
                    {filteredLogs.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-full gap-3 py-16">
                            <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center">
                                <ScrollText className="w-7 h-7 text-slate-300" />
                            </div>
                            <div className="text-center">
                                <p className="text-slate-500 font-bold text-sm">No logs found</p>
                                <p className="text-slate-400 text-xs mt-0.5">
                                    Try adjusting your date range or filters
                                </p>
                            </div>
                        </div>
                    ) : (
                        filteredLogs.map(log => {
                            const { date, time } = formatTimestamp(log.timestamp)
                            return (
                                <div key={log.id}>
                                    {/* Desktop row (lg+) */}
                                    <div className="hidden lg:grid grid-cols-[140px_1fr_120px_1fr_120px_100px] gap-3 px-4 py-2.5 border-b border-slate-50 hover:bg-slate-50/50 transition-colors items-center">
                                        {/* Timestamp */}
                                        <div>
                                            <p className="text-xs font-semibold text-slate-700">{time}</p>
                                            <p className="text-[10px] text-slate-400 font-medium">{date}</p>
                                        </div>

                                        {/* Employee */}
                                        <div className="flex items-center gap-2 min-w-0">
                                            <div className="w-7 h-7 rounded-full bg-linear-to-br from-red-500 to-rose-600 flex items-center justify-center shrink-0">
                                                <span className="text-white text-[9px] font-black">
                                                    {log.employeeName?.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() || '??'}
                                                </span>
                                            </div>
                                            <span className="text-xs font-bold text-slate-800 truncate">{log.employeeName}</span>
                                        </div>

                                        {/* Action */}
                                        <div className="flex items-center gap-1.5">
                                            {getActionIcon(log.action)}
                                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${getActionBadge(log.action, log.status)}`}>
                                                {log.action}
                                            </span>
                                        </div>

                                        {/* Details */}
                                        <p className="text-xs text-slate-500 truncate">{log.details}</p>

                                        {/* Source */}
                                        <p className="text-xs font-semibold text-slate-600 truncate">{log.source}</p>

                                        {/* Type */}
                                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border w-fit ${getTypeBadge(log.type)}`}>
                                            {log.type === 'timekeeping' ? 'Timekeeping' : 'System'}
                                        </span>
                                    </div>

                                    {/* Mobile card (< lg) */}
                                    <div className="lg:hidden px-4 py-3 border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                                        <div className="flex items-start justify-between gap-2">
                                            <div className="flex items-center gap-2 min-w-0 flex-1">
                                                <div className="w-8 h-8 rounded-full bg-linear-to-br from-red-500 to-rose-600 flex items-center justify-center shrink-0">
                                                    <span className="text-white text-[10px] font-black">
                                                        {log.employeeName?.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() || '??'}
                                                    </span>
                                                </div>
                                                <div className="min-w-0">
                                                    <p className="text-sm font-bold text-slate-800 truncate">{log.employeeName}</p>
                                                    <p className="text-[10px] text-slate-400 font-medium">{date} · {time}</p>
                                                </div>
                                            </div>
                                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border shrink-0 ${getTypeBadge(log.type)}`}>
                                                {log.type === 'timekeeping' ? 'Time' : 'Sys'}
                                            </span>
                                        </div>
                                        <div className="mt-2 flex items-center gap-2 flex-wrap">
                                            <div className="flex items-center gap-1">
                                                {getActionIcon(log.action)}
                                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${getActionBadge(log.action, log.status)}`}>
                                                    {log.action}
                                                </span>
                                            </div>
                                            {log.source && (
                                                <span className="text-[10px] font-semibold text-slate-400">
                                                    via {log.source}
                                                </span>
                                            )}
                                        </div>
                                        {log.details && (
                                            <p className="text-xs text-slate-500 mt-1.5 truncate">{log.details}</p>
                                        )}
                                    </div>
                                </div>
                            )
                        })
                    )}
                </div>

                {/* Pagination Footer */}
                {meta && meta.totalPages > 1 && (
                    <div className="flex items-center justify-between px-4 py-2.5 bg-slate-50 border-t border-slate-100 shrink-0">
                        <p className="text-xs text-slate-500 font-semibold">
                            <span className="hidden sm:inline">Showing </span><span className="font-bold text-slate-700">{(page - 1) * limit + 1}–{Math.min(page * limit, meta.total)}</span> of{' '}
                            <span className="font-bold text-slate-700">{meta.total}</span>
                        </p>
                        <div className="flex items-center gap-1">
                            <button
                                onClick={() => setPage(p => Math.max(1, p - 1))}
                                disabled={page <= 1}
                                className="p-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-40 transition-colors"
                            >
                                <ChevronLeft className="w-3.5 h-3.5" />
                            </button>
                            <span className="text-xs font-bold text-slate-700 px-2">
                                {page} / {meta.totalPages}
                            </span>
                            <button
                                onClick={() => setPage(p => Math.min(meta.totalPages, p + 1))}
                                disabled={page >= meta.totalPages}
                                className="p-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-40 transition-colors"
                            >
                                <ChevronRight className="w-3.5 h-3.5" />
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    )
}