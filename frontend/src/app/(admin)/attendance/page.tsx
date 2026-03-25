'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { useAttendanceStream, AttendanceStreamPayload } from '@/hooks/useAttendanceStream'
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
  // Always use PHT (Asia/Manila) date so the filter is correct regardless of the client machine's timezone
  const [selectedDate, setSelectedDate] = useState(() =>
    new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' })
  )

  // Pagination
  const [currentPage, setCurrentPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const rowsPerPage = 10

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

  /* ── Helpers ── */
  const getPHTTime = (date: Date) => {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Manila', hour: 'numeric', minute: 'numeric', hour12: false
    }).formatToParts(date)
    return {
      hour: parseInt(parts.find(p => p.type === 'hour')?.value || '0'),
      minute: parseInt(parts.find(p => p.type === 'minute')?.value || '0'),
    }
  }

  const formatLate = (mins: number | null | undefined): string => {
    if (!mins || mins <= 0) return '—'
    const h = Math.floor(mins / 60)
    const m = mins % 60
    return h > 0 ? `${h}h ${m}m` : `${m}m`
  }

  /** Convert decimal hours (e.g. 1.53) to "1h 32m" */
  const fmtHours = (hours: number): string => {
    if (!hours || hours <= 0) return '—'
    const h = Math.floor(hours)
    const m = Math.round((hours - h) * 60)
    if (h === 0) return `${m}m`
    if (m === 0) return `${h}h`
    return `${h}h ${m}m`
  }

  /** Convert minutes to "Xh Ym" */
  const fmtMins = (mins: number): string => {
    if (!mins || mins <= 0) return '—'
    const h = Math.floor(mins / 60)
    const m = Math.round(mins % 60)
    if (h === 0) return `${m}m`
    if (m === 0) return `${h}h`
    return `${h}h ${m}m`
  }

  /* ── Debounce search ── */
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchTerm), 400)
    return () => clearTimeout(t)
  }, [searchTerm])

  /* ── Reset page on filter change ── */
  useEffect(() => {
    setCurrentPage(1)
  }, [activeBranchId, selectedDate, selectedStatus, selectedDeptId, debouncedSearch])

  /* ── Fetch branches ── */
  useEffect(() => {
    const run = async () => {
      try {
        const res = await fetch('/api/branches', { credentials: 'include' })
        if (res.ok) {
          const data = await res.json()
          if (data.success && data.branches) {
            setBranches(data.branches)
          }
        }
      } catch { /* ignore */ }
    }
    run()
  }, [])

  /* ── Fetch departments ── */
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

  /* ── Fetch records ── */
  const fetchRecords = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({
        startDate: selectedDate,
        endDate: selectedDate,
        limit: '9999',
      })
      // Branch tab uses the branch NAME (employee.branch is a plain string, not a relation)
      if (activeBranchId !== 'all') {
        const branchName = branches.find(b => b.id === activeBranchId)?.name
        if (branchName) params.append('branchName', branchName)
      }
      if (selectedStatus !== 'all') params.append('status', selectedStatus)
      if (selectedDeptId !== 'all') {
        params.append('departmentId', selectedDeptId)
        // Also send the name so the backend OR filter can match the legacy string field
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

          // STRICTLY USE BACKEND SHIFT-AWARE VALUES. No frontend fallback math.
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

        // Fetch all active employees and inject absent rows
        let allEmployees: any[] = []
        try {
          const empRes = await fetch('/api/employees?limit=9999', { credentials: 'include' })
          const empData = await empRes.json()
          if (empData.success) allEmployees = (empData.employees || empData.data || []).filter((e: any) => (e.role === 'USER' || !e.role) && (e.employmentStatus === 'ACTIVE' || !e.employmentStatus))
        } catch { /* ignore */ }

        // Determine which employees have no record today
        const presentIds = new Set(mapped.map((r: any) => r.employeeId))
        // Filter allEmployees by the currently active branch tab
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
  }, [activeBranchId, selectedDate, selectedStatus, selectedDeptId, currentPage, debouncedSearch, branches])

  // ── SSE: live attendance updates ─────────────────────────────────────
  // Instead of manually merging SSE records (which would bypass absent-row
  // generation and stats calculation), we simply re-fetch when a new record
  // arrives for the currently viewed date. This is still far better than
  // polling — we only re-fetch when something actually changes.
  const handleStreamRecord = useCallback((payload: AttendanceStreamPayload) => {
    const recordDateStr = new Date(payload.record.date)
      .toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' })
    // Only re-fetch if the new record is for the date currently on screen
    if (recordDateStr === selectedDate) {
      fetchRecords()
    }
  }, [selectedDate, fetchRecords])

  useAttendanceStream({
    onRecord: handleStreamRecord,
    onConnected: fetchRecords,
  })

  useEffect(() => { fetchRecords() }, [fetchRecords])

  /* ── Export ── */
  const handleExport = () => {
    const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']
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
    allRows.push(['Present', presentCount,        '', 'Overtime Total', `${stats.totalOvertime}h`])
    allRows.push(['Late',    lateCount,           '', 'Undertime Total', `${stats.totalUndertime}h`])
    allRows.push(['Anomaly', anomalyCount])
    allRows.push(['Absent',  absentCount])
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
        r.overtimeMinutes  > 0 ? `+${fmtMins(r.overtimeMinutes)}`  : '—',
        r.undertimeMinutes > 0 ? `-${fmtMins(r.undertimeMinutes)}` : '—',
        statusLabel,
      ])
    })

    allRows.push([])
    allRows.push([`${records.length} employee record${records.length !== 1 ? 's' : ''} · ${selectedDate}`])

    // ── Build workbook ──
    const worksheet = XLSX.utils.aoa_to_sheet(allRows)
    worksheet['!cols'] = [
      { wch: 4  },  // #
      { wch: 25 },  // Employee
      { wch: 18 },  // Branch
      { wch: 18 },  // Department
      { wch: 15 },  // Shift
      { wch: 12 },  // Check In
      { wch: 12 },  // Check Out
      { wch: 14 },  // Hours Worked
      { wch: 12 },  // Late By
      { wch: 10 },  // Overtime
      { wch: 10 },  // Undertime
      { wch: 12 },  // Status
    ]
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Attendance')
    XLSX.writeFile(workbook, `Attendance_${branchLabel.replace(/\s+/g, '_')}_${selectedDate}.xlsx`)
  }

  const activeBranch = activeBranchId !== 'all' ? branches.find(b => b.id === activeBranchId) : null

  return (
    <div className="space-y-5">

      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <Fingerprint className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h2 className="text-2xl sm:text-3xl font-bold text-foreground">Biometric Attendance</h2>
            <p className="text-muted-foreground text-sm mt-0.5">
              {new Date(selectedDate + 'T00:00:00').toLocaleDateString('en-US', {
                weekday: 'long', month: 'long', day: 'numeric', year: 'numeric'
              })}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Input
            type="date"
            value={selectedDate}
            onChange={e => setSelectedDate(e.target.value)}
            className="bg-secondary border-border text-foreground w-40"
          />
          <Button onClick={handleExport} className="bg-primary hover:bg-primary/90 gap-2 shrink-0">
            <Download className="w-4 h-4" />
            Export
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

      {/* ── Stats Cards ── */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Avg Hours', value: `${stats.avgHours}h`, icon: Timer, color: 'text-primary', bg: 'bg-primary/20' },
          { label: 'Overtime', value: `${stats.totalOvertime}h`, icon: TrendingUp, color: 'text-green-400', bg: 'bg-green-500/20' },
          { label: 'Undertime', value: `${stats.totalUndertime}h`, icon: TrendingDown, color: 'text-red-400', bg: 'bg-red-500/20' },
        ].map(s => {
          const Icon = s.icon
          return (
            <Card key={s.label} className="bg-card border-border p-3 sm:p-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-muted-foreground text-[10px] font-bold uppercase tracking-widest">{s.label}</p>
                  <p className={`text-xl sm:text-2xl font-black mt-1 ${s.color}`}>{s.value}</p>
                </div>
                <div className={`${s.bg} p-2 rounded-lg shrink-0`}>
                  <Icon className={`w-4 h-4 ${s.color}`} />
                </div>
              </div>
            </Card>
          )
        })}
      </div>

      {/* ── Branch Tab Bar ── */}
      <div className="flex items-end gap-1 overflow-x-auto scrollbar-none">
        {/* All Branches tab */}
        <button
          onClick={() => setActiveBranchId('all')}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-t-xl text-sm font-bold transition-all duration-200 border-b-2 whitespace-nowrap ${activeBranchId === 'all'
            ? 'bg-card border-b-transparent text-primary shadow-sm border border-border border-b-card'
            : 'bg-secondary/40 border-b-transparent text-muted-foreground hover:text-foreground hover:bg-secondary'
            }`}
        >
          <GitBranch className={`w-3.5 h-3.5 ${activeBranchId === 'all' ? 'text-primary' : 'text-muted-foreground'}`} />
          All Branches
        </button>

        {branches.length === 0 ? (
          <span className="px-4 py-2.5 text-xs text-muted-foreground italic">Loading branches...</span>
        ) : (
          branches.map(branch => {
            const isActive = activeBranchId === branch.id
            return (
              <button
                key={branch.id}
                onClick={() => setActiveBranchId(branch.id)}
                className={`flex items-center gap-2 px-5 py-2.5 rounded-t-xl text-sm font-bold transition-all duration-200 border-b-2 whitespace-nowrap ${isActive
                  ? 'bg-card border-b-transparent text-primary shadow-sm border border-border border-b-card'
                  : 'bg-secondary/40 border-b-transparent text-muted-foreground hover:text-foreground hover:bg-secondary'
                  }`}
              >
                <MapPin className={`w-3.5 h-3.5 ${isActive ? 'text-primary' : 'text-muted-foreground'}`} />
                {branch.name}
              </button>
            )
          })
        )}
      </div>

      {/* ── Main Card ── */}
      <Card className="bg-card border-border rounded-2xl shadow-md overflow-hidden rounded-tl-none">

        {/* Card header with inline mini-stats */}
        <div className="px-6 py-4 border-b border-border bg-secondary/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
              {activeBranchId === 'all'
                ? <GitBranch className="w-4 h-4 text-primary" />
                : <Building2 className="w-4 h-4 text-primary" />}
            </div>
            <div>
              <h3 className="text-base font-bold text-foreground leading-tight">
                {activeBranchId === 'all' ? 'All Branches' : activeBranch?.name}
              </h3>
              {activeBranch?.address && (
                <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                  <MapPin className="w-3 h-3" />{activeBranch.address}
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-center">
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Present</p>
              <p className="text-xl font-black text-emerald-500">{stats.totalPresent}</p>
            </div>
            <div className="w-px h-8 bg-border" />
            <div className="text-center">
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Late</p>
              <p className="text-xl font-black text-yellow-400">{stats.totalLate}</p>
            </div>
            <div className="w-px h-8 bg-border" />
            <div className="text-center">
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Absent</p>
              <p className="text-xl font-black text-red-400">{stats.totalAbsent}</p>
            </div>
            <div className="w-px h-8 bg-border" />
            <div className="text-center">
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Total</p>
              <p className="text-xl font-black text-foreground">{stats.total}</p>
            </div>
          </div>
        </div>

        {/* Filters row */}
        <div className="px-4 py-3 border-b border-border bg-secondary/10 flex flex-col sm:flex-row items-start sm:items-center gap-3">
          <div className="relative flex-1 max-w-xs w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search employee..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="pl-10 bg-secondary border-border text-foreground placeholder:text-muted-foreground"
            />
          </div>
          <div className="flex gap-2 w-full sm:w-auto">
            <Select value={selectedDeptId} onValueChange={setSelectedDeptId}>
              <SelectTrigger className="w-40 bg-secondary border-border text-foreground text-sm">
                <SelectValue placeholder="Department" />
              </SelectTrigger>
              <SelectContent className="bg-secondary border-border">
                <SelectItem value="all">All Departments</SelectItem>
                {departments.map(d => (
                  <SelectItem key={d.id} value={String(d.id)}>{d.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={selectedStatus} onValueChange={setSelectedStatus}>
              <SelectTrigger className="w-36 bg-secondary border-border text-foreground text-sm">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent className="bg-secondary border-border">
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="present">Present</SelectItem>
                <SelectItem value="late">Late</SelectItem>
                <SelectItem value="absent">Absent</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="sticky top-0 z-10">
              <tr className="border-b border-border bg-secondary/50 backdrop-blur-sm">
                <th className="px-4 sm:px-6 py-4 text-xs font-bold text-muted-foreground uppercase tracking-wider">Employee</th>
                <th className="px-4 sm:px-6 py-4 text-xs font-bold text-muted-foreground uppercase tracking-wider hidden sm:table-cell">Branch</th>
                <th className="px-4 sm:px-6 py-4 text-xs font-bold text-muted-foreground uppercase tracking-wider hidden sm:table-cell">Department</th>
                <th className="px-4 sm:px-6 py-4 text-xs font-bold text-muted-foreground uppercase tracking-wider hidden sm:table-cell">Check In</th>
                <th className="px-4 sm:px-6 py-4 text-xs font-bold text-muted-foreground uppercase tracking-wider hidden sm:table-cell">Check Out</th>
                <th className="px-4 sm:px-6 py-4 text-xs font-bold text-muted-foreground uppercase tracking-wider hidden md:table-cell">Shift</th>
                <th className="px-4 sm:px-6 py-4 text-xs font-bold text-muted-foreground uppercase tracking-wider hidden md:table-cell">Late</th>
                <th className="px-4 sm:px-6 py-4 text-xs font-bold text-muted-foreground uppercase tracking-wider">Hours</th>
                <th className="px-4 sm:px-6 py-4 text-xs font-bold text-muted-foreground uppercase tracking-wider hidden md:table-cell">OT</th>
                <th className="px-4 sm:px-6 py-4 text-xs font-bold text-muted-foreground uppercase tracking-wider hidden md:table-cell">UT</th>
                <th className="px-4 sm:px-6 py-4 text-xs font-bold text-muted-foreground uppercase tracking-wider">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                <tr>
                  <td colSpan={11} className="px-6 py-12 text-center">
                    <div className="flex flex-col items-center gap-2 text-muted-foreground">
                      <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                      <span className="text-sm">Loading attendance data...</span>
                    </div>
                  </td>
                </tr>
              ) : records.length === 0 ? (
                <tr>
                  <td colSpan={11} className="px-6 py-14 text-center">
                    <div className="flex flex-col items-center gap-3 text-muted-foreground">
                      <Fingerprint className="w-10 h-10 text-muted-foreground/30" />
                      <div>
                        <p className="text-sm font-medium">No biometric records found</p>
                        <p className="text-xs mt-0.5">
                          No attendance for <strong>{activeBranchId === 'all' ? 'any branch' : activeBranch?.name}</strong> on this date.
                        </p>
                      </div>
                    </div>
                  </td>
                </tr>
              ) : (
                records
                  .slice((currentPage - 1) * rowsPerPage, currentPage * rowsPerPage)
                  .map((record, index) => (<tr
                    key={record.id}
                    className={`hover:bg-primary/5 transition-colors ${index % 2 === 0 ? 'bg-transparent' : 'bg-secondary/10'}`}
                  >
                    <td className="px-4 sm:px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold text-sm shrink-0">
                          {record.employeeName.charAt(0)}
                        </div>
                        <div className="min-w-0">
                          <span className="text-sm font-medium text-foreground block truncate">{record.employeeName}</span>
                          <span className="text-xs text-muted-foreground sm:hidden">{record.department}</span>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 sm:px-6 py-4 text-xs text-muted-foreground hidden sm:table-cell">{record.branchName}</td>
                    <td className="px-4 sm:px-6 py-4 hidden sm:table-cell">
                      <Badge variant="outline" className="bg-secondary/50 text-foreground border-border text-xs">
                        {record.department}
                      </Badge>
                    </td>
                    <td className="px-4 sm:px-6 py-4 text-sm font-mono text-emerald-400 hidden sm:table-cell">
                      <div className="flex flex-col">
                        <span>{record.checkIn}</span>
                        {record.gracePeriodApplied && (
                          <span className="text-[9px] text-slate-400 mt-0.5" title="Check-in was late but within allowed grace period">
                            Grace Period
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 sm:px-6 py-4 text-sm font-mono text-foreground hidden sm:table-cell">
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
                    <td className="px-4 sm:px-6 py-4 hidden md:table-cell">
                      {record.shiftCode ? (
                        <Badge
                          variant="outline"
                          className={record.isNightShift
                            ? 'bg-purple-500/20 text-purple-400 border-purple-500/30 text-xs font-bold'
                            : 'bg-blue-500/20 text-blue-400 border-blue-500/30 text-xs font-bold'}
                        >
                          {record.shiftCode}
                        </Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground italic">No shift</span>
                      )}
                    </td>
                    <td className="px-4 sm:px-6 py-4 hidden md:table-cell">
                      {record.lateMinutes && record.lateMinutes > 0 ? (
                        <span className="text-xs font-bold text-amber-500 bg-amber-500/10 px-2 py-0.5 rounded-full whitespace-nowrap">
                          {formatLate(record.lateMinutes)}
                        </span>
                      ) : record.gracePeriodApplied ? (
                        <span className="text-[10px] text-muted-foreground font-bold whitespace-nowrap">
                          0m (Grace)
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-4 sm:px-6 py-4 text-sm font-mono text-foreground">
                      {record.isShiftActive ? (
                        <span className="text-muted-foreground text-xs italic">Live</span>
                      ) : (
                        fmtHours(record.totalHours)
                      )}
                    </td>
                    <td className="px-4 sm:px-6 py-4 hidden md:table-cell">
                      <span className={`text-sm font-medium ${record.overtimeMinutes > 0 ? 'text-green-400' : 'text-muted-foreground'}`}>
                        {record.overtimeMinutes > 0 ? `+${fmtMins(record.overtimeMinutes)}` : '—'}
                      </span>
                    </td>
                    <td className="px-4 sm:px-6 py-4 hidden md:table-cell">
                      <span className={`text-sm font-medium ${record.undertimeMinutes > 0 ? 'text-red-400' : 'text-muted-foreground'}`}>
                        {record.undertimeMinutes > 0 ? `-${fmtMins(record.undertimeMinutes)}` : '—'}
                      </span>
                    </td>
                    <td className="px-4 sm:px-6 py-4">
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
                  ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="px-4 sm:px-6 py-4 bg-secondary/20 border-t border-border flex items-center justify-between">
            <span className="text-xs text-muted-foreground">
              Page {currentPage} of {totalPages}
            </span>
            <div className="flex items-center gap-1">
              <Button
                variant="outline" size="sm"
                onClick={() => setCurrentPage(p => Math.max(p - 1, 1))}
                disabled={currentPage === 1}
                className="h-8 px-2 border-border text-foreground hover:bg-secondary disabled:opacity-50"
              >
                <ChevronLeft className="w-4 h-4" />
              </Button>
              {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => i + 1).map(page => (
                <Button
                  key={page}
                  variant={currentPage === page ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setCurrentPage(page)}
                  className={`h-8 w-8 p-0 hidden sm:flex ${currentPage === page ? 'bg-primary text-white' : 'border-border text-foreground hover:bg-secondary'}`}
                >
                  {page}
                </Button>
              ))}
              <Button
                variant="outline" size="sm"
                onClick={() => setCurrentPage(p => Math.min(p + 1, totalPages))}
                disabled={currentPage >= totalPages}
                className="h-8 px-2 border-border text-foreground hover:bg-secondary disabled:opacity-50"
              >
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  )
}