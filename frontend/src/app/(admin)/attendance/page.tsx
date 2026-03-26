'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { useAttendanceStream, AttendanceStreamPayload } from '@/hooks/useAttendanceStream'
import { useHorizontalDragScroll } from '@/hooks/useHorizontalDragScroll'
import * as XLSX from 'xlsx'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Fingerprint,
  Search,
  Download,
  MapPin,
  Users,
  Clock,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  Building2,
  TrendingUp,
  TrendingDown,
  Timer,
  GitBranch,
} from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { useTableSort } from '@/hooks/useTableSort'
import { SortableHeader } from '@/components/ui/SortableHeader'

interface Branch {
  id: number
  name: string
  address?: string | null
}

interface Department {
  id: number
  name: string
}

export default function BiometricPage() {
  const [branches, setBranches] = useState<Branch[]>([])
  const [departments, setDepartments] = useState<Department[]>([])
  const [activeBranchId, setActiveBranchId] = useState<'all' | number>('all')
  const [records, setRecords] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Filters
  const [searchTerm, setSearchTerm] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [selectedStatus, setSelectedStatus] = useState('all')
  const [selectedDeptId, setSelectedDeptId] = useState('all')
  // Always use PHT (Asia/Manila) date
  const [selectedDate, setSelectedDate] = useState(() =>
    new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' })
  )

  // Pagination
  const [currentPage, setCurrentPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const rowsPerPage = 10
  const dragScrollRef = useHorizontalDragScroll()

  // Stats
  const [stats, setStats] = useState({
    totalPresent: 0,
    totalLate: 0,
    totalAbsent: 0,
    total: 0,
    avgHours: '0',
    totalOvertime: '0',
    totalUndertime: '0',
  })

  const { sortedData: sortedRecords, sortKey, sortOrder, handleSort } = useTableSort<any>({
    initialData: records
  })
  const sortKeyStr = sortKey as string | null

  /* ── Helpers ── */
  const formatLate = (mins: number | null | undefined): string => {
    if (!mins || mins <= 0) return '—'
    const h = Math.floor(mins / 60)
    const m = mins % 60
    return h > 0 ? `${h}h ${m}m` : `${m}m`
  }

  const fmtHours = (hours: number): string => {
    if (!hours || hours <= 0) return '—'
    const h = Math.floor(hours)
    const m = Math.round((hours - h) * 60)
    if (h === 0) return `${m}m`
    if (m === 0) return `${h}h`
    return `${h}h ${m}m`
  }

  const fmtMins = (mins: number | null | undefined): string => {
    if (!mins || mins <= 0) return '—'
    const h = Math.floor(mins / 60)
    const m = Math.round(mins % 60)
    if (h === 0) return `${m}m`
    if (m === 0) return `${h}h`
    return `${h}h ${m}m`
  }

  /* ── Effects ── */
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchTerm), 400)
    return () => clearTimeout(t)
  }, [searchTerm])

  useEffect(() => {
    setCurrentPage(1)
  }, [activeBranchId, selectedDate, selectedStatus, selectedDeptId, debouncedSearch])

  useEffect(() => {
    const run = async () => {
      try {
        const res = await fetch('/api/branches', { credentials: 'include' })
        if (res.ok) {
          const data = await res.json()
          if (data.success && data.branches) setBranches(data.branches)
        }
      } catch { /* ignore */ }
    }
    run()
  }, [])

  useEffect(() => {
    const run = async () => {
      try {
        const res = await fetch('/api/departments', { credentials: 'include' })
        const data = await res.json()
        if (data.success && data.departments) setDepartments(data.departments)
      } catch { /* ignore */ }
    }
    run()
  }, [])

  const fetchRecords = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({
        startDate: selectedDate,
        endDate: selectedDate,
        limit: '9999',
      })
      if (activeBranchId !== 'all') {
        const branchName = branches.find(b => b.id === activeBranchId)?.name
        if (branchName) params.append('branchName', branchName)
      }
      if (selectedStatus !== 'all') params.append('status', selectedStatus)
      if (selectedDeptId !== 'all') {
        params.append('departmentId', selectedDeptId)
        const deptName = departments.find(d => String(d.id) === selectedDeptId)?.name
        if (deptName) params.append('departmentName', deptName)
      }

      const res = await fetch(`/api/attendance?${params.toString()}`)
      if (res.status === 401) {
        window.location.href = '/login'
        return
      }

      const data = await res.json()
      if (data.success) {
        const userRecords = data.data.filter((log: any) => {
          const emp = log.employee || log.Employee || {}
          return emp.role === 'USER' || !emp.role
        })

        const mapped = userRecords.map((log: any) => {
          const emp = log.employee || log.Employee || {}
          const checkIn = new Date(log.checkInTime)
          const checkOut = log.checkOutTime ? new Date(log.checkOutTime) : null

          const totalHours: number = log.totalHours ?? 0
          const lateMinutes: number = log.lateMinutes ?? 0
          const overtimeMinutes: number = log.overtimeMinutes ?? 0
          const undertimeMinutes: number = log.undertimeMinutes ?? 0
          const shiftCode: string | null = log.shiftCode ?? emp.Shift?.shiftCode ?? null
          const isAnomaly: boolean = log.isAnomaly ?? false
          const isEarlyOut: boolean = log.isEarlyOut ?? false
          const isShiftActive: boolean = log.isShiftActive ?? false
          const gracePeriodApplied: boolean = log.gracePeriodApplied ?? false
          // If shift is active, enforce IN_PROGRESS status to skip penalty labeling for active shifts
          const status = isShiftActive ? 'IN_PROGRESS' : isEarlyOut ? 'early-out' : isAnomaly ? 'anomaly' : lateMinutes > 0 ? 'late' : undertimeMinutes > 0 ? 'undertime' : (log.status || 'present')

          return {
            id: log.id,
            employeeId: log.employeeId,
            employeeName: emp.firstName ? `${emp.firstName} ${emp.lastName}` : 'Unknown',
            branchName: emp.branch || '—',
            department: emp.Department?.name || emp.department || 'General',
            date: new Date(log.date).toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' }),
            checkIn: checkIn.toLocaleTimeString('en-US', { timeZone: 'Asia/Manila', hour: '2-digit', minute: '2-digit', hour12: true }),
            checkOut: checkOut
              ? checkOut.toLocaleTimeString('en-US', { timeZone: 'Asia/Manila', hour: '2-digit', minute: '2-digit', hour12: true })
              : '—',
            lateMinutes,
            status,
            shiftCode,
            isNightShift: emp.Shift?.isNightShift ?? false,
            totalHours,
            overtimeMinutes,
            undertimeMinutes,
            isAnomaly,
            isShiftActive,
            gracePeriodApplied,
          }
        })

        let allEmployees: any[] = []
        try {
          const empRes = await fetch('/api/employees?limit=9999', { credentials: 'include' })
          const empData = await empRes.json()
          if (empData.success) allEmployees = (empData.employees || empData.data || []).filter((e: any) => (e.role === 'USER' || !e.role) && (e.employmentStatus === 'ACTIVE' || !e.employmentStatus))
        } catch { /* ignore */ }

        const presentIds = new Set(mapped.map((r: any) => r.employeeId))
        const branchName = activeBranchId !== 'all' ? branches.find(b => b.id === activeBranchId)?.name : null
        const absentRows = allEmployees
          .filter((e: any) => {
            if (presentIds.has(e.id)) return false
            if (branchName && e.branch !== branchName) return false
            return true
          })
          .map((e: any) => ({
            id: `absent-${e.id}`,
            employeeId: e.id,
            employeeName: `${e.firstName} ${e.lastName}`,
            branchName: e.branch || '—',
            department: e.Department?.name || e.department || 'General',
            date: selectedDate,
            checkIn: '—',
            checkOut: '—',
            lateMinutes: 0,
            status: 'absent',
            shiftCode: e.Shift?.shiftCode ?? null,
            isNightShift: e.Shift?.isNightShift ?? false,
            totalHours: 0,
            overtimeMinutes: 0,
            undertimeMinutes: 0,
            isAnomaly: false,
            isShiftActive: false,
            gracePeriodApplied: false,
          }))

        const full = [...mapped, ...absentRows]
        const filtered = debouncedSearch
          ? full.filter((r: any) => r.employeeName.toLowerCase().includes(debouncedSearch.toLowerCase()))
          : full

        setRecords(filtered)
        setTotalPages(Math.max(1, Math.ceil(filtered.length / rowsPerPage)))
        setStats({
          // Count any recorded presence on site as 'present' for the high level card
          totalPresent: filtered.filter((r: any) => ['present', 'late', 'IN_PROGRESS', 'anomaly', 'early-out'].includes(r.status)).length,
          totalLate: filtered.filter((r: any) => r.status === 'late').length,
          totalAbsent: filtered.filter((r: any) => r.status === 'absent').length,
          total: filtered.length,
          avgHours: filtered.length > 0
            ? (filtered.filter((r: any) => r.totalHours > 0).reduce((s: number, r: any) => s + r.totalHours, 0) /
              (filtered.filter((r: any) => r.totalHours > 0).length || 1)).toFixed(1)
            : '0',
          totalOvertime: (filtered.reduce((s: number, r: any) => s + (r.overtimeMinutes ?? 0), 0) / 60).toFixed(1),
          totalUndertime: (filtered.reduce((s: number, r: any) => s + (r.undertimeMinutes ?? 0), 0) / 60).toFixed(1),
        })
      } else {
        setError(data.message || 'Failed to fetch records')
      }
    } catch (e: any) {
      setError(e.message || 'Network error')
    } finally {
      setLoading(false)
    }
  }, [activeBranchId, selectedDate, selectedStatus, selectedDeptId, debouncedSearch, branches, departments])

  const handleStreamRecord = useCallback((payload: AttendanceStreamPayload) => {
    const recordDateStr = new Date(payload.record.date).toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' })
    if (recordDateStr === selectedDate) fetchRecords()
  }, [selectedDate, fetchRecords])

  useAttendanceStream({
    onRecord: handleStreamRecord,
    onConnected: fetchRecords,
  })

  useEffect(() => { fetchRecords() }, [fetchRecords])

  const handleExport = () => {
    const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
    const date = new Date(selectedDate + 'T00:00:00')
    const formattedDate = `${MONTHS[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`
    const branchLabel = activeBranchId === 'all' ? 'All Branches' : (branches.find(b => b.id === activeBranchId)?.name || 'Branch')

    const presentCount = records.filter(r => r.status === 'present').length
    const lateCount = records.filter(r => r.status === 'late').length
    const anomalyCount = records.filter((r: any) => r.isAnomaly).length
    const absentCount = records.filter(r => r.status === 'absent').length
    const avgHoursNum = parseFloat(stats.avgHours)

    const allRows: (string | number)[][] = []

    // ── Header block ──
    allRows.push(['BITS Attendance Report'])
    allRows.push(['Branch', branchLabel])
    allRows.push(['Date', formattedDate])
    allRows.push(['Generated', new Date().toLocaleString('en-PH', { timeZone: 'Asia/Manila' })])
    allRows.push([])

    // ── Summary stats ──
    allRows.push(['SUMMARY'])
    allRows.push(['Total Employees', records.length, '', 'Avg Hours', `${stats.avgHours}h`])
    allRows.push(['Present', presentCount, '', 'Overtime Total', `${stats.totalOvertime}h`])
    allRows.push(['Late', lateCount, '', 'Undertime Total', `${stats.totalUndertime}h`])
    allRows.push(['Anomaly', anomalyCount])
    allRows.push(['Absent', absentCount])
    allRows.push([])

    // ── Column headers ──
    allRows.push([
      '#', 'Employee', 'Branch', 'Department', 'Shift',
      'Check In', 'Check Out', 'Hours Worked',
      'Late By', 'Overtime', 'Undertime', 'Status'
    ])

    // ── Data rows ──
    records.forEach((r, i) => {
      const statusLabel = r.isAnomaly
        ? 'Anomaly'
        : r.status === 'IN_PROGRESS' ? 'In Progress'
          : r.status.charAt(0).toUpperCase() + r.status.slice(1)
      allRows.push([
        i + 1,
        r.employeeName,
        r.branchName,
        r.department,
        r.shiftCode || 'No Shift',
        r.checkIn,
        r.isShiftActive ? 'ACTIVE' : r.checkOut,
        r.isShiftActive ? 'LIVE' : (r.totalHours > 0 ? fmtHours(r.totalHours) : '—'),
        formatLate(r.lateMinutes),
        r.overtimeMinutes > 0 ? `+${fmtMins(r.overtimeMinutes)}` : '—',
        r.undertimeMinutes > 0 ? `-${fmtMins(r.undertimeMinutes)}` : '—',
        statusLabel
      ])
    })

    const worksheet = XLSX.utils.aoa_to_sheet(allRows)
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Attendance')
    XLSX.writeFile(workbook, `Attendance_${branchLabel.replace(/\s+/g, '_')}_${selectedDate}.xlsx`)
  }

  const activeBranch = activeBranchId !== 'all' ? branches.find(b => b.id === activeBranchId) : null

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <Fingerprint className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h2 className="text-2xl sm:text-3xl font-black text-foreground tracking-tight">Biometric Attendance</h2>
            <p className="text-muted-foreground text-sm font-medium">
              {new Date(selectedDate + 'T00:00:00').toLocaleDateString('en-US', {
                weekday: 'long', month: 'long', day: 'numeric', year: 'numeric'
              })}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Input type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)} className="bg-secondary border-border text-foreground w-44 font-bold" />
          <Button onClick={handleExport} className="bg-primary hover:bg-primary/90 gap-2 shrink-0 font-bold">
            <Download className="w-4 h-4" /> Export
          </Button>
        </div>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Avg Hours', value: `${stats.avgHours}h`, icon: Timer, color: 'text-primary', bg: 'bg-primary/10' },
          { label: 'Overtime', value: `${stats.totalOvertime}h`, icon: TrendingUp, color: 'text-emerald-500', bg: 'bg-emerald-500/10' },
          { label: 'Undertime', value: `${stats.totalUndertime}h`, icon: TrendingDown, color: 'text-red-500', bg: 'bg-red-500/10' },
        ].map(s => {
          const Icon = s.icon
          return (
            <Card key={s.label} className="bg-card border-border p-3 sm:p-4 shadow-sm">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-muted-foreground text-[10px] font-black uppercase tracking-widest">{s.label}</p>
                  <p className={`text-xl sm:text-2xl font-black mt-1 ${s.color}`}>{s.value}</p>
                </div>
                <div className={`${s.bg} p-2 rounded-lg shrink-0`}><Icon className={`w-4 h-4 ${s.color}`} /></div>
              </div>
            </Card>
          )
        })}
      </div>

      <div className="flex items-end gap-1 overflow-x-auto scrollbar-none">
        <button onClick={() => setActiveBranchId('all')} className={`flex items-center gap-2 px-6 py-3 rounded-t-xl text-xs font-black uppercase tracking-widest transition-all duration-200 border-b-2 whitespace-nowrap ${activeBranchId === 'all' ? 'bg-card border-b-transparent text-primary shadow-sm border border-border border-b-card' : 'bg-secondary/40 border-b-transparent text-muted-foreground hover:bg-secondary'}`}>
          <GitBranch className="w-3.5 h-3.5" /> All Branches
        </button>
        {branches.map(branch => (
          <button key={branch.id} onClick={() => setActiveBranchId(branch.id)} className={`flex items-center gap-2 px-6 py-3 rounded-t-xl text-xs font-black uppercase tracking-widest transition-all duration-200 border-b-2 whitespace-nowrap ${activeBranchId === branch.id ? 'bg-card border-b-transparent text-primary shadow-sm border border-border border-b-card' : 'bg-secondary/40 border-b-transparent text-muted-foreground hover:bg-secondary'}`}>
            <MapPin className="w-3.5 h-3.5" /> {branch.name}
          </button>
        ))}
      </div>

      <Card className="bg-card border-border rounded-2xl shadow-md overflow-hidden rounded-tl-none">
        <div className="px-6 py-4 border-b border-border bg-secondary/30 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <h3 className="text-sm font-black text-foreground uppercase tracking-widest">Attendance Logs</h3>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-center">
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Present</p>
              <p className="text-xl font-black text-emerald-500">{stats.totalPresent}</p>
            </div>
            <div className="w-px h-8 bg-border" />
            <div className="text-center"><p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Late</p><p className="text-xl font-black text-yellow-500">{stats.totalLate}</p></div>
            <div className="w-px h-8 bg-border" />
            <div className="text-center"><p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Absent</p><p className="text-xl font-black text-red-500">{stats.totalAbsent}</p></div>
            <div className="w-px h-8 bg-border" />
            <div className="text-center"><p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Total</p><p className="text-xl font-black text-foreground">{stats.total}</p></div>
          </div>
        </div>

        <div className="px-4 py-3 border-b border-border bg-secondary/10 flex flex-col sm:flex-row items-center gap-3">
          <div className="relative flex-1 max-w-sm w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Search employee..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="pl-10 bg-card border-border text-foreground font-medium" />
          </div>
          <div className="flex gap-2">
            <Select value={selectedDeptId} onValueChange={setSelectedDeptId}>
              <SelectTrigger className="w-44 bg-card border-border font-bold text-xs uppercase tracking-widest"><SelectValue placeholder="Department" /></SelectTrigger>
              <SelectContent className="bg-card border-border">
                <SelectItem value="all">ALL DEPARTMENTS</SelectItem>
                {departments.map(d => <SelectItem key={d.id} value={String(d.id)}>{d.name.toUpperCase()}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={selectedStatus} onValueChange={setSelectedStatus}>
              <SelectTrigger className="w-36 bg-card border-border font-bold text-xs uppercase tracking-widest"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent className="bg-card border-border">
                <SelectItem value="all">ALL STATUS</SelectItem>
                <SelectItem value="present">ON TIME</SelectItem>
                <SelectItem value="late">LATE</SelectItem>
                <SelectItem value="absent">ABSENT</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="bg-card">
          {/* ── Mobile Card View ── */}
          <div className="lg:hidden">
            {loading ? (
              <div className="px-6 py-12 text-center text-muted-foreground font-bold">Loading...</div>
            ) : records.length === 0 ? (
              <div className="px-6 py-12 text-center text-muted-foreground font-black uppercase text-[10px] tracking-widest">No biometric records found</div>
            ) : (
              <div className="divide-y divide-border/40">
                {sortedRecords.slice((currentPage - 1) * rowsPerPage, currentPage * rowsPerPage).map(row => (
                  <div key={row.id} className="p-4 hover:bg-primary/5 transition-colors">
                    <div className="flex items-start justify-between gap-2 mb-3">
                      <div className="min-w-0 flex-1">
                        <p className="font-black text-foreground text-sm truncate uppercase tracking-tight">{row.employeeName}</p>
                        <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest mt-0.5">{row.department} • {row.branchName}</p>
                      </div>
                      <div className="shrink-0">
                        <span className={`font-black text-[10px] uppercase px-3 py-1 rounded-full border whitespace-nowrap ${row.status === 'present' ? 'text-emerald-500 bg-emerald-500/10 border-emerald-500/20'
                            : row.status === 'late' ? 'text-yellow-500 bg-yellow-500/10 border-yellow-500/20'
                              : 'text-red-500 bg-red-500/10 border-red-500/20'
                          }`}>
                          {row.status === 'present' ? 'On Time' : row.status}
                        </span>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div><p className="text-[10px] text-muted-foreground font-black uppercase tracking-widest mb-1">Clock In</p><p className="font-mono text-emerald-500 font-black text-sm">{row.checkIn}</p></div>
                      <div><p className="text-[10px] text-muted-foreground font-black uppercase tracking-widest mb-1">Clock Out</p><p className="font-mono text-muted-foreground font-black text-sm">{row.checkOut}</p></div>
                      <div><p className="text-[10px] text-muted-foreground font-black uppercase tracking-widest mb-1">Shift</p>
                        {row.shiftCode ? <span className={`text-[9px] font-black px-2 py-0.5 rounded-md border ${row.isNightShift ? 'bg-purple-500/10 text-purple-400 border-purple-500/20' : 'bg-blue-500/10 text-blue-400 border-blue-500/20'}`}>{row.shiftCode}</span> : <span className="text-[10px] text-muted-foreground italic font-medium">No shift</span>}
                      </div>
                      <div><p className="text-[10px] text-muted-foreground font-black uppercase tracking-widest mb-1">Hours</p><p className="font-mono text-foreground font-black text-sm">{fmtHours(row.totalHours)}</p></div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ── Desktop Table View ── */}
          <div ref={dragScrollRef} className="overflow-x-auto scrollbar-hide hidden lg:block">
            <table className="w-full text-left">
              <thead className="bg-secondary/50 backdrop-blur-sm">
                <tr className="border-b border-border bg-secondary/50 backdrop-blur-sm">
                  <SortableHeader label="Employee" sortKey="employeeName" currentSortKey={sortKeyStr} currentSortOrder={sortOrder} onSort={handleSort} className="px-6 py-4 text-[10px] font-bold text-muted-foreground uppercase tracking-widest leading-tight" />
                  <SortableHeader label="Department" sortKey="department" currentSortKey={sortKeyStr} currentSortOrder={sortOrder} onSort={handleSort} className="px-4 py-4 text-[10px] font-bold text-muted-foreground uppercase tracking-widest leading-tight" />
                  <SortableHeader label="Branch" sortKey="branchName" currentSortKey={sortKeyStr} currentSortOrder={sortOrder} onSort={handleSort} className="px-4 py-4 text-[10px] font-bold text-muted-foreground uppercase tracking-widest leading-tight" />
                  <SortableHeader label="Shift" sortKey="shiftCode" currentSortKey={sortKeyStr} currentSortOrder={sortOrder} onSort={handleSort} className="px-4 py-4 text-[10px] font-bold text-muted-foreground uppercase tracking-widest leading-tight text-center" />
                  <SortableHeader label="Clock In" sortKey="checkIn" currentSortKey={sortKeyStr} currentSortOrder={sortOrder} onSort={handleSort} className="px-4 py-4 text-[10px] font-bold text-muted-foreground uppercase tracking-widest leading-tight" />
                  <SortableHeader label="Clock Out" sortKey="checkOut" currentSortKey={sortKeyStr} currentSortOrder={sortOrder} onSort={handleSort} className="px-4 py-4 text-[10px] font-bold text-muted-foreground uppercase tracking-widest leading-tight" />
                  <SortableHeader label="Late" sortKey="lateMinutes" currentSortKey={sortKeyStr} currentSortOrder={sortOrder} onSort={handleSort} className="px-4 py-4 text-[10px] font-bold text-muted-foreground uppercase tracking-widest leading-tight text-center text-yellow-500" />
                  <SortableHeader label="Hours" sortKey="totalHours" currentSortKey={sortKeyStr} currentSortOrder={sortOrder} onSort={handleSort} className="px-4 py-4 text-[10px] font-bold text-muted-foreground uppercase tracking-widest leading-tight text-center" />
                  <SortableHeader label="OT" sortKey="overtimeMinutes" currentSortKey={sortKeyStr} currentSortOrder={sortOrder} onSort={handleSort} className="px-4 py-4 text-[10px] font-bold text-muted-foreground uppercase tracking-widest leading-tight text-center text-emerald-500" />
                  <SortableHeader label="UT" sortKey="undertimeMinutes" currentSortKey={sortKeyStr} currentSortOrder={sortOrder} onSort={handleSort} className="px-4 py-4 text-[10px] font-bold text-muted-foreground uppercase tracking-widest leading-tight text-center text-red-500" />
                  <SortableHeader label="Status" sortKey="status" currentSortKey={sortKeyStr} currentSortOrder={sortOrder} onSort={handleSort} className="px-4 py-4 text-[10px] font-bold text-muted-foreground uppercase tracking-widest leading-tight text-center" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {sortedRecords.slice((currentPage - 1) * rowsPerPage, currentPage * rowsPerPage).map(record => (
                  <tr key={record.id} className="hover:bg-primary/5 transition-colors">
                    <td className="px-6 py-4 flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold text-[10px] shrink-0 uppercase tracking-tight">{record.employeeName.charAt(0)}</div>
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-foreground leading-tight uppercase tracking-tight">{record.employeeName}</p>
                        <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-widest mt-0.5">{record.branchName}</p>
                      </div>
                    </td>
                    <td className="px-4 py-4 text-[10px] font-bold text-muted-foreground uppercase tracking-widest leading-none outline-none">{record.department}</td>
                    <td className="px-4 py-4 text-[10px] font-bold text-muted-foreground uppercase tracking-widest leading-none outline-none">{record.branchName}</td>
                    <td className="px-4 py-4 text-center">
                      {record.shiftCode ? (
                        <span className={`text-[9px] font-black px-2.5 py-1 rounded-lg border uppercase tracking-widest whitespace-nowrap ${record.isNightShift ? 'bg-purple-500/10 text-purple-400 border-purple-500/20' : 'bg-blue-500/10 text-blue-400 border-blue-500/20'}`}>{record.shiftCode}</span>
                      ) : (
                        <span className="text-[10px] text-muted-foreground italic font-medium">No Shift</span>
                      )}
                    </td>
                    <td className="px-4 py-4 text-sm font-mono font-bold">
                      <div className="flex flex-col">
                        <span className={`${record.status === 'late' ? 'text-yellow-500' :
                            record.status === 'present' ? 'text-emerald-500' :
                              'text-muted-foreground'
                          }`}>{record.checkIn}</span>
                        {record.gracePeriodApplied && (
                          <span className="text-[9px] text-slate-400 mt-0.5" title="Check-in was late but within allowed grace period">
                            Grace Period
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-4 text-sm font-mono text-muted-foreground font-bold">
                      {record.isShiftActive ? (
                        <span className="inline-flex items-center gap-2 text-blue-500 font-bold text-[10px] uppercase tracking-wider">
                          <span className="relative flex h-2 w-2">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
                          </span>
                          Active
                        </span>
                      ) : (
                        record.checkOut
                      )}
                    </td>
                    <td className="px-4 py-4 text-center">
                      {record.lateMinutes && record.lateMinutes > 0 ? (
                        <span className="text-[10px] font-black text-yellow-600 bg-yellow-500/10 border border-yellow-500/20 px-2.5 py-1 rounded-full whitespace-nowrap">
                          {formatLate(record.lateMinutes)}
                        </span>
                      ) : record.gracePeriodApplied ? (
                        <span className="text-[10px] text-muted-foreground font-bold whitespace-nowrap">
                          0m (Grace)
                        </span>
                      ) : <span className="text-[10px] text-muted-foreground/30 font-black">—</span>}
                    </td>
                    <td className="px-4 py-4 text-sm font-mono text-foreground font-bold text-center">
                      {record.isShiftActive ? (
                        <span className="text-muted-foreground text-xs italic">Live</span>
                      ) : (
                        fmtHours(record.totalHours)
                      )}
                    </td>
                    <td className="px-4 py-4 text-center">
                      <span className={`text-sm font-bold ${record.overtimeMinutes > 0 ? 'text-emerald-500' : 'text-muted-foreground/30'}`}>
                        {record.overtimeMinutes > 0 ? `+${fmtMins(record.overtimeMinutes)}` : '—'}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-center">
                      <span className={`text-sm font-bold ${record.undertimeMinutes > 0 ? 'text-red-500' : 'text-muted-foreground/30'}`}>
                        {record.undertimeMinutes > 0 ? `-${fmtMins(record.undertimeMinutes)}` : '—'}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-center">
                      {record.isAnomaly ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider bg-orange-100 text-orange-700 border border-orange-200 whitespace-nowrap">
                          <AlertCircle className="w-3 h-3" />
                          Anomaly
                        </span>
                      ) : (
                        <Badge
                          variant="outline"
                          className={
                            record.status === 'present'
                              ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                              : record.status === 'IN_PROGRESS'
                                ? 'bg-blue-500/20 text-blue-400 border-blue-500/30'
                                : record.status === 'late'
                                  ? 'bg-amber-500/20 text-amber-400 border-amber-500/30'
                                  : record.status === 'undertime'
                                    ? 'bg-rose-500/20 text-rose-400 border-rose-500/30'
                                    : record.status === 'absent'
                                      ? 'bg-red-500/20 text-red-400 border-red-500/30'
                                      : 'bg-secondary/50 text-muted-foreground border-border'
                          }
                        >
                          {record.status === 'IN_PROGRESS' ? 'In Progress' : record.status.charAt(0).toUpperCase() + record.status.slice(1)}
                        </Badge>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {totalPages > 1 && (
          <div className="px-6 py-4 bg-secondary/20 border-t border-border flex items-center justify-between">
            <span className="text-xs font-black text-muted-foreground uppercase tracking-widest">Page {currentPage} of {totalPages}</span>
            <div className="flex items-center gap-1">
              <Button variant="outline" size="sm" onClick={() => setCurrentPage(p => Math.max(p - 1, 1))} disabled={currentPage === 1} className="h-8 border-border text-foreground hover:bg-secondary"><ChevronLeft className="w-4 h-4" /></Button>
              <Button variant="outline" size="sm" onClick={() => setCurrentPage(p => Math.min(p + 1, totalPages))} disabled={currentPage >= totalPages} className="h-8 border-border text-foreground hover:bg-secondary"><ChevronRight className="w-4 h-4" /></Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  )
}