'use client'

import React, { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import {
    ScrollText, ChevronLeft, ChevronRight,
    LogIn, LogOut, Fingerprint, Clock, CalendarDays,
    Search, RefreshCw, UserPlus, Trash2, Edit, Shield, Bot,
    Info, Wifi, WifiOff, Copy, ClipboardCheck, ClipboardX, FileText,
    Settings, Users, Radio, KeyRound, ChevronDown, AlertTriangle
} from 'lucide-react'

/* ── Types ── */
interface LogEntry {
    id: string
    type: 'timekeeping' | 'system'
    category: string
    timestamp: string
    employeeName: string
    employeeId: number
    action: string
    details: string
    source: string
    status?: string
    level?: 'INFO' | 'WARN' | 'ERROR'
    employeeRole?: string
    metadata?: any
}
interface LogMeta {
    total: number
    page: number
    limit: number
    totalPages: number
    counts: {
        all: number
        auth: number
        attendance: number
        device: number
        employee: number
        config: number
        system: number
        timekeeping: number
    }
}

type CategoryKey = 'all' | 'attendance' | 'auth' | 'device' | 'employee' | 'config' | 'system'
type LevelKey = 'all' | 'INFO' | 'WARN' | 'ERROR'

/* ── Helpers ── */
const phtStr = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' })
function Skeleton({ className }: { className?: string }) {
    return <div className={`animate-pulse bg-slate-200 rounded-lg ${className ?? ''}`} />
}

/* ── Category Tab Config ── */
const CATEGORY_TABS: { key: CategoryKey; label: string; icon: React.ElementType; color: string }[] = [
    { key: 'all', label: 'All', icon: ScrollText, color: 'text-slate-600' },
    { key: 'attendance', label: 'Attendance', icon: Fingerprint, color: 'text-violet-600' },
    { key: 'auth', label: 'Auth', icon: KeyRound, color: 'text-emerald-600' },
    { key: 'device', label: 'Device', icon: Radio, color: 'text-sky-600' },
    { key: 'employee', label: 'Employee', icon: Users, color: 'text-amber-600' },
    { key: 'config', label: 'Config', icon: Settings, color: 'text-indigo-600' },
    { key: 'system', label: 'System', icon: Bot, color: 'text-slate-500' },
]

/* ── Page ── */
export default function SystemLogsPage() {
    const router = useRouter()
    const [logs, setLogs] = useState<LogEntry[]>([])
    const [meta, setMeta] = useState<LogMeta | null>(null)
    const [loading, setLoading] = useState(true)
    const [refreshing, setRefreshing] = useState(false)
    const [expandedLogId, setExpandedLogId] = useState<string | null>(null)

    // Filters
    const [activeCategory, setActiveCategory] = useState<CategoryKey>('all')
    const [activeLevel, setActiveLevel] = useState<LevelKey>('all')
    const [startDate, setStartDate] = useState(() => {
        const d = new Date()
        d.setDate(d.getDate() - 7)
        return phtStr(d)
    })
    const [endDate, setEndDate] = useState(() => phtStr(new Date()))
    const [searchQuery, setSearchQuery] = useState('')
    const [page, setPage] = useState(1)
    const [levelDropdownOpen, setLevelDropdownOpen] = useState(false)
    const limit = 30

    const fetchLogs = useCallback(async () => {
        try {
            const params = new URLSearchParams({
                startDate,
                endDate,
                category: activeCategory,
                level: activeLevel,
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
    }, [router, startDate, endDate, activeCategory, activeLevel, page])

    useEffect(() => { fetchLogs() }, [fetchLogs])

    // Close dropdown on outside click
    useEffect(() => {
        const handler = () => setLevelDropdownOpen(false)
        if (levelDropdownOpen) document.addEventListener('click', handler)
        return () => document.removeEventListener('click', handler)
    }, [levelDropdownOpen])

    const handleRefresh = () => { setRefreshing(true); fetchLogs() }
    const handleCategoryChange = (cat: CategoryKey) => {
        setActiveCategory(cat)
        setPage(1)
    }
    const handleLevelChange = (level: LevelKey) => {
        setActiveLevel(level)
        setPage(1)
        setLevelDropdownOpen(false)
    }

    // Filter logs by search query (client-side)
    const filteredLogs = searchQuery.trim()
        ? logs.filter(l =>
            l.employeeName.toLowerCase().includes(searchQuery.toLowerCase()) ||
            l.action.toLowerCase().includes(searchQuery.toLowerCase()) ||
            l.details?.toLowerCase().includes(searchQuery.toLowerCase()) ||
            l.source?.toLowerCase().includes(searchQuery.toLowerCase())
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
        const a = action.toUpperCase()
        if (a.includes('CHECK_IN') || a === 'CHECK IN') return <LogIn className="w-4 h-4 text-emerald-600" />
        if (a.includes('CHECK_OUT') || a === 'CHECK OUT') return <LogOut className="w-4 h-4 text-blue-600" />
        if (a === 'LOGIN') return <LogIn className="w-4 h-4 text-emerald-600" />
        if (a === 'FAILED_LOGIN') return <LogIn className="w-4 h-4 text-red-500" />
        if (a === 'LOGOUT') return <LogOut className="w-4 h-4 text-slate-500" />
        if (a === 'DEVICE SCAN') return <Fingerprint className="w-4 h-4 text-slate-500" />
        if (a === 'DEVICE_CONNECT') return <Wifi className="w-4 h-4 text-emerald-500" />
        if (a === 'DEVICE_DISCONNECT') return <WifiOff className="w-4 h-4 text-red-500" />
        if (a === 'DUPLICATE_PUNCH') return <Copy className="w-4 h-4 text-amber-500" />
        if (a === 'SUSPICIOUS_CHECKOUT') return <AlertTriangle className="w-4 h-4 text-orange-500" />
        if (a === 'ADJUSTMENT_SUBMIT') return <FileText className="w-4 h-4 text-blue-500" />
        if (a === 'ADJUSTMENT_APPROVE') return <ClipboardCheck className="w-4 h-4 text-emerald-500" />
        if (a === 'ADJUSTMENT_REJECT') return <ClipboardX className="w-4 h-4 text-red-500" />
        if (a === 'CREATE') return <UserPlus className="w-4 h-4 text-emerald-600" />
        if (a === 'UPDATE') return <Edit className="w-4 h-4 text-blue-600" />
        if (a === 'DELETE') return <Trash2 className="w-4 h-4 text-red-600" />
        if (a === 'STATUS_CHANGE') return <Shield className="w-4 h-4 text-amber-600" />
        if (a === 'AUTO_CHECKOUT') return <Bot className="w-4 h-4 text-violet-600" />
        if (a === 'FLAG_MISSING_CHECKOUT') return <Bot className="w-4 h-4 text-orange-500" />
        if (a === 'EXPORT') return <FileText className="w-4 h-4 text-indigo-500" />
        if (a === 'SYNC') return <RefreshCw className="w-4 h-4 text-sky-500" />
        return <Clock className="w-4 h-4 text-slate-400" />
    }

    const getActionBadge = (action: string) => {
        const a = action.toUpperCase()
        if (a.includes('CHECK_IN') || a === 'CHECK IN' || a === 'CREATE' || a === 'LOGIN' || a === 'DEVICE_CONNECT' || a === 'ADJUSTMENT_APPROVE') return 'bg-emerald-50 text-emerald-700 border-emerald-200'
        if (a.includes('CHECK_OUT') || a === 'CHECK OUT' || a === 'UPDATE' || a === 'SYNC' || a === 'ADJUSTMENT_SUBMIT') return 'bg-blue-50 text-blue-700 border-blue-200'
        if (a === 'DELETE' || a === 'FAILED_LOGIN' || a === 'DEVICE_DISCONNECT' || a === 'ADJUSTMENT_REJECT') return 'bg-red-50 text-red-700 border-red-200'
        if (a === 'STATUS_CHANGE' || a === 'DUPLICATE_PUNCH') return 'bg-amber-50 text-amber-700 border-amber-200'
        if (a === 'SUSPICIOUS_CHECKOUT') return 'bg-orange-50 text-orange-700 border-orange-200'
        if (a === 'AUTO_CHECKOUT' || a === 'FLAG_MISSING_CHECKOUT') return 'bg-violet-50 text-violet-700 border-violet-200'
        if (a === 'EXPORT') return 'bg-indigo-50 text-indigo-700 border-indigo-200'
        if (a === 'LOGOUT') return 'bg-slate-50 text-slate-600 border-slate-200'
        return 'bg-slate-50 text-slate-600 border-slate-200'
    }

    const getLevelBadge = (level?: string) => {
        if (level === 'ERROR') return 'bg-red-50 text-red-700 border-red-200'
        if (level === 'WARN') return 'bg-amber-50 text-amber-700 border-amber-200'
        return 'bg-slate-50 text-slate-600 border-slate-200'
    }

    const getCategoryBadge = (category?: string) => {
        const c = category?.toLowerCase()
        if (c === 'attendance') return 'bg-violet-50 text-violet-700 border-violet-200'
        if (c === 'auth') return 'bg-emerald-50 text-emerald-700 border-emerald-200'
        if (c === 'device') return 'bg-sky-50 text-sky-700 border-sky-200'
        if (c === 'employee') return 'bg-amber-50 text-amber-700 border-amber-200'
        if (c === 'config') return 'bg-indigo-50 text-indigo-700 border-indigo-200'
        if (c === 'system') return 'bg-slate-50 text-slate-600 border-slate-200'
        return 'bg-slate-50 text-slate-600 border-slate-200'
    }

    const getAvatarBg = (role?: string) => {
        const r = role?.toUpperCase();
        if (!r || r === 'SYSTEM') return 'bg-gradient-to-br from-slate-400 to-slate-500'
        if (r === 'ADMIN') return 'bg-gradient-to-br from-blue-500 to-indigo-600'
        if (r === 'HR') return 'bg-gradient-to-br from-emerald-500 to-teal-600'
        if (r === 'USER' || r === 'EMPLOYEE') return 'bg-gradient-to-br from-amber-500 to-orange-600'
        return 'bg-gradient-to-br from-slate-400 to-slate-500'
    }

    const formatActionLabel = (action: string) => {
        return action.replace(/_/g, ' ')
    }

    /* ── Loading skeleton ── */
    if (loading) return (
        <div className="flex flex-col gap-4 p-4 lg:p-5 min-h-[calc(100vh-4rem)]">
            <div className="flex items-center justify-between">
                <Skeleton className="h-8 w-48" />
                <Skeleton className="h-9 w-28 rounded-lg" />
            </div>
            <div className="flex gap-2 overflow-x-auto">
                {[1, 2, 3, 4, 5, 6, 7].map(i => <Skeleton key={i} className="h-9 w-24 rounded-lg shrink-0" />)}
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
                        Audit trail for all system activities
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
            <div className="flex flex-col gap-2 shrink-0">
                {/* Category Tabs */}
                <div className="flex bg-slate-100 rounded-lg p-0.5 overflow-x-auto scrollbar-hide">
                    {CATEGORY_TABS.map(tab => {
                        const Icon = tab.icon
                        const count = meta?.counts[tab.key] ?? 0
                        const active = activeCategory === tab.key
                        return (
                            <button
                                key={tab.key}
                                onClick={() => handleCategoryChange(tab.key)}
                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-bold transition-all whitespace-nowrap shrink-0 ${active
                                    ? 'bg-white text-slate-900 shadow-sm'
                                    : 'text-slate-500 hover:text-slate-700'
                                    }`}
                            >
                                <Icon className={`w-3.5 h-3.5 ${active ? tab.color : 'text-slate-400'}`} />
                                {tab.label}
                                <span className={`text-[10px] ${active ? 'text-red-500' : 'text-slate-400'}`}>
                                    {count}
                                </span>
                            </button>
                        )
                    })}
                </div>

                {/* Second row: Level filter + Date filters + Search */}
                <div className="flex flex-col sm:flex-row flex-wrap items-start sm:items-center gap-2">
                    {/* Level Filter Dropdown */}
                    <div className="relative">
                        <button
                            onClick={(e) => { e.stopPropagation(); setLevelDropdownOpen(!levelDropdownOpen) }}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${activeLevel !== 'all'
                                ? activeLevel === 'ERROR'
                                    ? 'bg-red-50 text-red-700 border-red-200'
                                    : activeLevel === 'WARN'
                                        ? 'bg-amber-50 text-amber-700 border-amber-200'
                                        : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                                }`}
                        >
                            {activeLevel === 'all' ? 'All Levels' : activeLevel}
                            <ChevronDown className="w-3 h-3" />
                        </button>
                        {levelDropdownOpen && (
                            <div className="absolute top-full left-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-lg z-50 min-w-[120px] py-1">
                                {(['all', 'INFO', 'WARN', 'ERROR'] as LevelKey[]).map(level => (
                                    <button
                                        key={level}
                                        onClick={(e) => { e.stopPropagation(); handleLevelChange(level) }}
                                        className={`w-full text-left px-3 py-1.5 text-xs font-bold transition-colors ${activeLevel === level ? 'bg-slate-100 text-slate-900' : 'text-slate-600 hover:bg-slate-50'}`}
                                    >
                                        {level === 'all' ? 'All Levels' : (
                                            <span className="flex items-center gap-2">
                                                <span className={`w-1.5 h-1.5 rounded-full ${level === 'ERROR' ? 'bg-red-500' : level === 'WARN' ? 'bg-amber-500' : 'bg-emerald-500'}`} />
                                                {level}
                                            </span>
                                        )}
                                    </button>
                                ))}
                            </div>
                        )}
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
            </div>

            {/* ── Logs ── */}
            <div className="flex-1 bg-white rounded-xl border border-slate-100 shadow-sm flex flex-col min-h-0 overflow-hidden">

                {/* Desktop Table Header (hidden on mobile) */}
                <div className="hidden lg:grid grid-cols-[140px_1fr_150px_1fr_100px_90px_70px] gap-3 px-4 py-2.5 bg-slate-50 border-b border-slate-100 text-[10px] font-black text-slate-500 uppercase tracking-widest shrink-0">
                    <span>Timestamp</span>
                    <span>Employee</span>
                    <span>Action</span>
                    <span>Details</span>
                    <span>Source</span>
                    <span>Category</span>
                    <span>Level</span>
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
                                    <div 
                                        onClick={() => setExpandedLogId(expandedLogId === log.id ? null : log.id)}
                                        className={`hidden lg:grid grid-cols-[140px_1fr_150px_1fr_100px_90px_70px] gap-3 px-4 py-2.5 border-b border-slate-50 transition-colors cursor-pointer items-center ${expandedLogId === log.id ? 'bg-slate-50' : 'hover:bg-slate-50/50'}`}
                                    >
                                        {/* Timestamp */}
                                        <div>
                                            <p className="text-xs font-semibold text-slate-700">{time}</p>
                                            <p className="text-[10px] text-slate-400 font-medium">{date}</p>
                                        </div>

                                        {/* Employee */}
                                        <div className="flex items-center gap-2 min-w-0">
                                            <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 shadow-sm ${getAvatarBg(log.employeeRole)}`}>
                                                <span className="text-white text-[9px] font-black">
                                                    {log.employeeName === 'System' ? 'SY' : log.employeeName?.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() || '??'}
                                                </span>
                                            </div>
                                            <span className="text-xs font-bold text-slate-800 truncate">{log.employeeName}</span>
                                        </div>

                                        {/* Action */}
                                        <div className="flex items-center gap-1.5">
                                            {getActionIcon(log.action)}
                                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${getActionBadge(log.action)}`}>
                                                {formatActionLabel(log.action)}
                                            </span>
                                        </div>

                                        {/* Details */}
                                        <p className="text-xs text-slate-500 truncate" title={log.details}>{log.details}</p>

                                        {/* Source */}
                                        <p className="text-xs font-semibold text-slate-600 truncate">{log.source}</p>

                                        {/* Category */}
                                        <div>
                                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border w-fit capitalize ${getCategoryBadge(log.category)}`}>
                                                {log.category || 'system'}
                                            </span>
                                        </div>

                                        {/* Level */}
                                        <div>
                                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border w-fit ${getLevelBadge(log.level)}`}>
                                                {log.level || 'INFO'}
                                            </span>
                                        </div>
                                    </div>

                                    {/* Mobile card (< lg) */}
                                    <div 
                                        onClick={() => setExpandedLogId(expandedLogId === log.id ? null : log.id)}
                                        className={`lg:hidden px-4 py-3 border-b border-slate-50 transition-colors cursor-pointer ${expandedLogId === log.id ? 'bg-slate-50' : 'hover:bg-slate-50/50'}`}
                                    >
                                        <div className="flex items-start justify-between gap-2">
                                            <div className="flex items-center gap-2 min-w-0 flex-1">
                                                <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 shadow-sm ${getAvatarBg(log.employeeRole)}`}>
                                                    <span className="text-white text-[10px] font-black">
                                                        {log.employeeName === 'System' ? 'SY' : log.employeeName?.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() || '??'}
                                                    </span>
                                                </div>
                                                <div className="min-w-0">
                                                    <p className="text-sm font-bold text-slate-800 truncate">{log.employeeName}</p>
                                                    <p className="text-[10px] text-slate-400 font-medium">{date} · {time}</p>
                                                </div>
                                            </div>
                                            <div className="flex flex-col gap-1 items-end">
                                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border shrink-0 capitalize ${getCategoryBadge(log.category)}`}>
                                                    {log.category || 'system'}
                                                </span>
                                                <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full border shrink-0 ${getLevelBadge(log.level)}`}>
                                                    {log.level || 'INFO'}
                                                </span>
                                            </div>
                                        </div>
                                        <div className="mt-2 flex items-center gap-2 flex-wrap">
                                            <div className="flex items-center gap-1">
                                                {getActionIcon(log.action)}
                                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${getActionBadge(log.action)}`}>
                                                    {formatActionLabel(log.action)}
                                                </span>
                                            </div>
                                            {log.source && (
                                                <span className="text-[10px] font-semibold text-slate-400">
                                                    via {log.source}
                                                </span>
                                            )}
                                        </div>
                                        {log.details && (
                                            <p className="text-xs text-slate-500 mt-1.5 line-clamp-2">{log.details}</p>
                                        )}
                                    </div>
                                    
                                    {/* Expanded Metadata Viewer */}
                                    {expandedLogId === log.id && (
                                        <div className="px-4 lg:px-[156px] py-4 bg-slate-50/80 border-b border-slate-100 shadow-inner">
                                            <div className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                                                <Info className="w-4 h-4 text-blue-500" /> Event Details & Context
                                            </div>
                                            
                                            {log.metadata && Object.keys(log.metadata).length > 0 ? (
                                                <div className="mt-3 flex flex-col gap-3">
                                                    {/* Render human-readable array updates if they exist */}
                                                    {Array.isArray(log.metadata.updates) && log.metadata.updates.length > 0 && (
                                                        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                                                            <h4 className="text-[10px] font-black uppercase tracking-wider text-indigo-500 mb-3">Actual Changes</h4>
                                                            <ul className="space-y-2">
                                                                {log.metadata.updates.map((update: string, i: number) => (
                                                                    <li key={i} className="flex items-start gap-2 text-xs font-medium text-slate-700">
                                                                        <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 mt-1.5 shrink-0" />
                                                                        {update}
                                                                    </li>
                                                                ))}
                                                            </ul>
                                                        </div>
                                                    )}

                                                    {/* Render distinct error card if an error exists */}
                                                    {(log.metadata.error || log.metadata.errorMessage) && (
                                                        <div className="bg-red-50 p-4 rounded-xl border border-red-100 shadow-sm flex flex-col gap-1">
                                                            <span className="text-[10px] font-black uppercase tracking-wider text-red-500">Error Details</span>
                                                            <span className="text-xs font-bold text-red-700 break-all">{log.metadata.error || log.metadata.errorMessage}</span>
                                                        </div>
                                                    )}

                                                    {/* Render other primitive info fields, stripping objects/arrays and internal fields */}
                                                    {Object.entries(log.metadata).filter(([key, val]) => 
                                                        key !== 'updates' && 
                                                        key !== 'error' && 
                                                        key !== 'errorMessage' && 
                                                        key !== 'body' && 
                                                        key !== 'password' &&
                                                        key !== 'changedFields' &&
                                                        key !== 'category' &&  // Don't show category in metadata details
                                                        typeof val !== 'object'
                                                    ).length > 0 && (
                                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                                                            {Object.entries(log.metadata).filter(([key, val]) => 
                                                                key !== 'updates' && 
                                                                key !== 'error' && 
                                                                key !== 'errorMessage' && 
                                                                key !== 'body' && 
                                                                key !== 'password' &&
                                                                key !== 'changedFields' &&
                                                                key !== 'category' &&
                                                                typeof val !== 'object'
                                                            ).map(([key, value]) => (
                                                                <div key={key} className="flex flex-col gap-1 bg-slate-50 p-3 rounded-lg border border-slate-100">
                                                                    <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">{key.replace(/([A-Z])/g, ' $1').trim()}</span>
                                                                    <span className="text-xs font-semibold text-slate-800 break-all">
                                                                        {String(value)}
                                                                    </span>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                            ) : (
                                                <p className="text-[11px] text-slate-400 font-medium italic mt-2 ml-1">
                                                    No additional metadata payload was attached to this event.
                                                </p>
                                            )}
                                        </div>
                                    )}
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