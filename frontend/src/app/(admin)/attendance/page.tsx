'use client'

import { useSearchParams } from 'next/navigation'

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
  Edit2,
  Loader2,
} from 'lucide-react'
import { useToast } from '@/hooks/useToast'
import ToastContainer from '@/components/ui/ToastContainer'
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

  // Edit state
  const [editingLog, setEditingLog] = useState<any | null>(null)
  const [editCheckIn, setEditCheckIn] = useState('')
  const [editCheckOut, setEditCheckOut] = useState('')
  const [editReason, setEditReason] = useState('')
  const [showCancelModal, setShowCancelModal] = useState(false)
  const [actionLoading, setActionLoading] = useState(false)
  const { toasts, showToast, dismissToast } = useToast()

  // Filters
  const [searchTerm, setSearchTerm] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const searchParams = useSearchParams()
  const [selectedStatus, setSelectedStatus] = useState(() => {
    const param = searchParams.get('status')?.toLowerCase()
    if (param === 'late') return 'late'
    if (param === 'absent') return 'absent'
    if (param === 'present') return 'present'
    return 'all'
  })
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
          // Data status: reflects attendance accuracy regardless of shift activity (used for filtering & counting)
          const status = isEarlyOut ? 'early-out' : isAnomaly ? 'anomaly' : lateMinutes > 0 ? 'late' : undertimeMinutes > 0 ? 'undertime' : (log.status || 'present')
          // Display status: preserves IN_PROGRESS for active shifts (used for UI badge & clock-out indicator)
          const displayStatus = isShiftActive ? 'IN_PROGRESS' : status

          return {
            id: log.id,
            employeeId: log.employeeId,
            employeeName: emp.firstName ? `${emp.firstName}${emp.middleName ? ` ${emp.middleName[0]}.` : ''} ${emp.lastName}${emp.suffix ? ` ${emp.suffix}` : ''}` : 'Unknown',
            branchName: emp.branch || '—',
            department: emp.Department?.name || emp.department || 'General',
            date: new Date(log.date).toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' }),
            checkIn: checkIn.toLocaleTimeString('en-US', { timeZone: 'Asia/Manila', hour: '2-digit', minute: '2-digit', hour12: true }),
            checkOut: checkOut
              ? checkOut.toLocaleTimeString('en-US', { timeZone: 'Asia/Manila', hour: '2-digit', minute: '2-digit', hour12: true })
              : '—',
            lateMinutes,
            status,
            displayStatus,
            shiftCode,
            isNightShift: emp.Shift?.isNightShift ?? false,
            totalHours,
            overtimeMinutes,
            undertimeMinutes,
            isAnomaly,
            isShiftActive,
            gracePeriodApplied,
            notes: log.notes || null,
            checkInDevice: log.checkInDeviceName ?? null,
            checkOutDevice: log.checkOutDeviceName ?? null,
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
        const selectedDeptName = selectedDeptId !== 'all' ? departments.find(d => String(d.id) === selectedDeptId)?.name : null
        const absentRows = allEmployees
          .filter((e: any) => {
            if (presentIds.has(e.id)) return false
            if (branchName && e.branch !== branchName) return false
            if (selectedDeptName) {
              const empDept = e.Department?.name || e.department || ''
              if (empDept !== selectedDeptName) return false
            }
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
            displayStatus: 'absent',
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
        let filtered = debouncedSearch
          ? full.filter((r: any) => r.employeeName.toLowerCase().includes(debouncedSearch.toLowerCase()))
          : full

        if (selectedDeptName) {
          filtered = filtered.filter((r: any) => r.department === selectedDeptName)
        }

        // Snapshot before status filter — stats should always reflect the full view
        const preFilteredByStatus = filtered

        if (selectedStatus !== 'all') {
          filtered = filtered.filter((r: any) => r.status === selectedStatus)
        }

        setRecords(filtered)
        setTotalPages(Math.max(1, Math.ceil(filtered.length / rowsPerPage)))
        setStats({
          totalPresent: preFilteredByStatus.filter((r: any) => r.status === 'present').length,
          totalLate: preFilteredByStatus.filter((r: any) => r.status === 'late').length,
          totalAbsent: preFilteredByStatus.filter((r: any) => r.status === 'absent').length,
          total: preFilteredByStatus.length,
          avgHours: preFilteredByStatus.length > 0
            ? (preFilteredByStatus.filter((r: any) => r.totalHours > 0).reduce((s: number, r: any) => s + r.totalHours, 0) /
              (preFilteredByStatus.filter((r: any) => r.totalHours > 0).length || 1)).toFixed(1)
            : '0',
          totalOvertime: (preFilteredByStatus.reduce((s: number, r: any) => s + (r.overtimeMinutes ?? 0), 0) / 60).toFixed(1),
          totalUndertime: (preFilteredByStatus.reduce((s: number, r: any) => s + (r.undertimeMinutes ?? 0), 0) / 60).toFixed(1),
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

  // Convert "07:45 AM" → "07:45" for time input
  const toTimeInput = (str: string): string => {
    if (!str || str === '—') return ''
    try {
      const d = new Date(`1970-01-01 ${str}`)
      if (isNaN(d.getTime())) return ''
      return d.toTimeString().slice(0, 5)
    } catch { return '' }
  }

  const handleEditClick = (row: any) => {
    setEditingLog(row)
    setEditCheckIn(toTimeInput(row.checkIn))
    setEditCheckOut(toTimeInput(row.checkOut))
    setEditReason('')
  }

  const handleApplyChanges = async () => {
    if (!editingLog) return
    if (String(editingLog.id).startsWith('absent-')) {
      showToast('error', 'Cannot Edit', 'Cannot edit an absent record — the employee has no clock-in/out entry for this day.')
      return
    }
    setActionLoading(true)
    try {
      const body: any = { reason: editReason }
      if (editCheckIn) body.checkInTime = `${editingLog.date}T${editCheckIn}:00+08:00`
      if (editCheckOut) body.checkOutTime = `${editingLog.date}T${editCheckOut}:00+08:00`

      const res = await fetch(`/api/attendance/${editingLog.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (data.success) {
        showToast('success', 'Record Updated', 'Attendance record successfully updated!')
        setEditingLog(null)
        fetchRecords()
      } else {
        showToast('error', 'Update Failed', data.message || 'Update failed')
      }
    } catch (e: any) {
      showToast('error', 'Network Error', e.message || 'Network error')
    } finally {
      setActionLoading(false)
    }
  }

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

    const fileName = `Attendance_${branchLabel.replace(/\s+/g, '_')}_${selectedDate}.xlsx`
    const worksheet = XLSX.utils.aoa_to_sheet(allRows)
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Attendance')
    XLSX.writeFile(workbook, fileName)

    // Log the export event
    fetch('/api/logs/export-event', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        exportType: 'attendance',
        entityType: 'Attendance',
        source: 'admin-panel',
        details: `Exported attendance records (${records.length} rows) for ${selectedDate}`,
        filters: { branch: branchLabel, date: selectedDate, department: selectedDeptId !== 'all' ? selectedDeptId : undefined, status: selectedStatus !== 'all' ? selectedStatus : undefined },
        recordCount: records.length,
        fileFormat: 'xlsx',
        fileName,
      }),
    }).catch(() => { })
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
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">On Time</p>
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
              <SelectTrigger className="w-52 bg-card border-border font-bold text-xs uppercase tracking-widest"><SelectValue placeholder="Department" /></SelectTrigger>
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
                      <div className="flex items-center gap-2 shrink-0">
                        <span className={`font-black text-[10px] uppercase px-3 py-1 rounded-full border whitespace-nowrap ${row.displayStatus === 'present' ? 'text-emerald-500 bg-emerald-500/10 border-emerald-500/20'
                          : row.displayStatus === 'IN_PROGRESS' ? 'text-blue-500 bg-blue-500/10 border-blue-500/20'
                            : row.displayStatus === 'late' ? 'text-yellow-500 bg-yellow-500/10 border-yellow-500/20'
                              : 'text-red-500 bg-red-500/10 border-red-500/20'
                          }`}>
                          {row.displayStatus === 'present' ? 'On Time' : row.displayStatus === 'IN_PROGRESS' ? 'In Progress' : row.displayStatus}
                        </span>
                        <button onClick={() => handleEditClick(row)} className="p-1.5 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded-lg transition-all">
                          <Edit2 size={14} />
                        </button>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-[10px] text-muted-foreground font-black uppercase tracking-widest mb-1">Clock In</p>
                        <p className="font-mono text-emerald-500 font-black text-sm">{row.checkIn}</p>
                        {row.checkIn !== '—' && (
                          <p className="text-xs text-gray-500 mt-0.5 truncate">
                            📍 {row.checkInDevice ?? 'Manual'}
                          </p>
                        )}
                      </div>
                      <div><p className="text-[10px] text-muted-foreground font-black uppercase tracking-widest mb-1">Clock Out</p>
                        {row.notes?.includes('Early punch detected') ? (
                          <span className="text-[10px] font-bold text-orange-500">🔶 Early punch flagged</span>
                        ) : row.checkOut === '—' && row.notes?.includes('No checkout recorded') ? (
                          <span className="text-[10px] font-bold text-amber-600">⚠️ No checkout</span>
                        ) : (
                          <>
                            <p className="font-mono text-muted-foreground font-black text-sm">{row.checkOut}</p>
                            {row.checkOut !== '—' && (
                              <p className="text-xs text-gray-500 mt-0.5 truncate">📍 {row.checkOutDevice ?? 'Manual'}</p>
                            )}
                          </>
                        )}
                      </div>
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
                  <th className="px-4 py-4 text-[10px] font-bold text-muted-foreground uppercase tracking-widest leading-tight text-center">Actions</th>
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
                        {record.checkIn !== '—' && (
                          <span className="text-xs text-gray-500 mt-0.5 truncate max-w-[120px]">
                            📍 {record.checkInDevice ?? 'Manual'}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-4 text-sm font-mono text-muted-foreground font-bold">
                      {record.notes?.includes('Early punch detected') ? (
                        <div className="flex flex-col">
                          {record.isShiftActive ? (
                            <span className="inline-flex items-center gap-2 text-blue-500 font-bold text-[10px] uppercase tracking-wider">
                              <span className="relative flex h-2 w-2">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
                              </span>
                              Active
                            </span>
                          ) : record.checkOut !== '—' ? (
                            <span>{record.checkOut}</span>
                          ) : null}
                          <span className="inline-flex items-center gap-1 text-orange-500 font-bold text-[10px] uppercase tracking-wider whitespace-nowrap mt-0.5" title={record.notes}>
                            <AlertCircle className="w-3 h-3" />
                            Early punch flagged
                          </span>
                        </div>
                      ) : record.isShiftActive ? (
                        <span className="inline-flex items-center gap-2 text-blue-500 font-bold text-[10px] uppercase tracking-wider">
                          <span className="relative flex h-2 w-2">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
                          </span>
                          Active
                        </span>
                      ) : record.checkOut === '—' && record.notes?.includes('No checkout recorded') ? (
                        <span className="inline-flex items-center gap-1 text-amber-600 font-bold text-[10px] uppercase tracking-wider whitespace-nowrap" title={record.notes}>
                          <AlertCircle className="w-3 h-3" />
                          No checkout
                        </span>
                      ) : (
                        <div className="flex flex-col">
                          <span>{record.checkOut}</span>
                          {record.checkOut !== '—' && (
                            <span className="text-[9px] text-gray-500 font-medium mt-0.5 truncate max-w-[120px]">
                              📍 {record.checkOutDevice ?? 'Manual'}
                            </span>
                          )}
                        </div>
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
                            record.displayStatus === 'present'
                              ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                              : record.displayStatus === 'IN_PROGRESS'
                                ? 'bg-blue-500/20 text-blue-400 border-blue-500/30'
                                : record.displayStatus === 'late'
                                  ? 'bg-amber-500/20 text-amber-400 border-amber-500/30'
                                  : record.displayStatus === 'undertime'
                                    ? 'bg-rose-500/20 text-rose-400 border-rose-500/30'
                                    : record.displayStatus === 'incomplete'
                                      ? 'bg-amber-500/20 text-amber-500 border-amber-500/30'
                                      : record.displayStatus === 'absent'
                                        ? 'bg-red-500/20 text-red-400 border-red-500/30'
                                        : 'bg-secondary/50 text-muted-foreground border-border'
                          }
                        >
                          {record.displayStatus === 'IN_PROGRESS' ? 'In Progress' : record.displayStatus ? record.displayStatus.charAt(0).toUpperCase() + record.displayStatus.slice(1) : '—'}
                        </Badge>
                      )}
                    </td>
                    <td className="px-4 py-4 text-center">
                      <button onClick={() => handleEditClick(record)} className="p-2 text-muted-foreground hover:text-primary hover:bg-primary/10 rounded-lg transition-all">
                        <Edit2 size={16} />
                      </button>
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

      {/* Edit Modal */}
      {editingLog && (
        <div className="fixed inset-0 bg-slate-950/40 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-card rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in duration-200 flex flex-col border border-border">
            <div className="p-5 bg-primary text-primary-foreground flex justify-between items-center shrink-0">
              <h3 className="font-bold text-lg leading-tight tracking-tight">Manual Time Changes</h3>
            </div>
            <div className="p-6 space-y-4">
              <div className="bg-secondary p-3 rounded-xl border border-border">
                <p className="text-sm font-bold text-foreground leading-none">{editingLog.employeeName}</p>
                <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider mt-1">
                  {editingLog.department} • {editingLog.branchName}
                  {editingLog.shiftCode && <span className="ml-2">• {editingLog.shiftCode}</span>}
                </p>
              </div>
              {String(editingLog.id).startsWith('absent-') && (
                <div className="bg-amber-500/10 border border-amber-500/20 p-3 rounded-xl flex gap-3">
                  <AlertCircle size={16} className="text-amber-500 shrink-0 mt-0.5" />
                  <p className="text-xs font-medium text-amber-200">This employee has no existing clock-in record for this day. Changes cannot be saved.</p>
                </div>
              )}
              <div className="bg-blue-500/10 border border-blue-500/20 p-3 rounded-xl flex gap-3">
                <Clock size={16} className="text-blue-400 shrink-0 mt-0.5" />
                <p className="text-[10px] text-blue-300 leading-relaxed font-medium">
                  <strong className="block mb-0.5 tracking-tight uppercase">Auto-Computed Status</strong>
                  Status will be automatically determined based on the employee&apos;s assigned shift schedule and the recorded time-in / time-out.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[9px] font-black uppercase text-muted-foreground tracking-wider flex items-center gap-1.5"><Clock size={10} className="text-emerald-500" /> Clock In</label>
                  <input type="time" value={editCheckIn} onChange={(e) => setEditCheckIn(e.target.value)}
                    className="w-full p-2 bg-secondary border border-border rounded-xl text-xs font-bold text-foreground outline-none focus:ring-2 focus:ring-primary/20" />
                </div>
                <div className="space-y-1">
                  <label className="text-[9px] font-black uppercase text-muted-foreground tracking-wider flex items-center gap-1.5"><Clock size={10} className="text-red-500" /> Clock Out</label>
                  <input type="time" value={editCheckOut} onChange={(e) => setEditCheckOut(e.target.value)}
                    className="w-full p-2 bg-secondary border border-border rounded-xl text-xs font-bold text-foreground outline-none focus:ring-2 focus:ring-primary/20" />
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-[9px] font-black uppercase text-muted-foreground tracking-wider">Reason for Adjustment <span className="text-red-500">*</span></label>
                <textarea value={editReason} onChange={(e) => setEditReason(e.target.value)}
                  placeholder="e.g., Biometric error, Official business..."
                  className={`w-full p-3 bg-secondary border rounded-xl h-16 text-xs outline-none focus:ring-2 focus:ring-primary/20 resize-none text-foreground ${!editReason.trim() ? 'border-red-500/50' : 'border-border'}`} />
                {!editReason.trim() && (
                  <p className="text-[10px] text-red-400 font-medium flex items-center gap-1">
                    <AlertCircle size={10} />
                    Reason is required. Please provide a reason before submitting.
                  </p>
                )}
              </div>
              <div className="bg-primary/10 border border-primary/20 p-3 rounded-xl flex gap-3 shadow-sm">
                <AlertCircle size={18} className="text-primary shrink-0" />
                <p className="text-[10px] text-foreground/80 leading-relaxed font-medium">
                  <strong className="block mb-0.5 tracking-tight uppercase">Admin Override</strong>
                  This change will bypass the adjustment queue and update the record permanently.
                </p>
              </div>
            </div>
            <div className="p-5 bg-secondary/50 flex gap-3 shrink-0 border-t border-border">
              <button onClick={() => setShowCancelModal(true)} className="flex-1 px-4 py-3.5 text-sm font-bold text-muted-foreground hover:text-foreground transition-colors">Cancel</button>
              <button
                onClick={handleApplyChanges}
                disabled={actionLoading || String(editingLog.id).startsWith('absent-') || !editReason.trim()}
                className="flex-1 px-4 py-3.5 bg-primary text-primary-foreground rounded-xl text-sm font-black shadow-lg hover:bg-primary/90 transition-all active:scale-95 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {actionLoading && <Loader2 size={15} className="animate-spin" />}
                Apply Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cancel confirm modal */}
      {showCancelModal && (
        <div className="fixed inset-0 bg-slate-950/40 backdrop-blur-sm z-[150] flex items-center justify-center p-4">
          <div className="bg-card rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden animate-in fade-in zoom-in duration-200 border border-border">
            <div className="p-6 text-center space-y-4">
              <h3 className="text-lg font-black text-foreground tracking-tight">Discard changes?</h3>
              <p className="text-sm font-medium text-muted-foreground">Your unsaved modifications will be lost.</p>
              <div className="flex gap-3 pt-2">
                <button onClick={() => setShowCancelModal(false)} className="flex-1 px-4 py-2.5 border border-border text-muted-foreground rounded-xl text-sm font-bold hover:bg-secondary transition-all">Cancel</button>
                <button onClick={() => { setEditingLog(null); setShowCancelModal(false); }} className="flex-1 px-4 py-2.5 bg-primary text-primary-foreground rounded-xl text-sm font-bold hover:bg-primary/90 transition-all active:scale-95">Yes</button>
              </div>
            </div>
          </div>
        </div>
      )}

      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </div>
  )
}