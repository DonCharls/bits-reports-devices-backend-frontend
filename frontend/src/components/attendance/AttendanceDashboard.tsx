"use client"

export const dynamic = 'force-dynamic'

import React, { useState, useRef, useEffect, useCallback, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { useHorizontalDragScroll } from '@/hooks/useHorizontalDragScroll';
import { useToast } from '@/hooks/useToast';
import ToastContainer from '@/components/ui/ToastContainer';
import * as XLSX from 'xlsx';
import { useTableSort } from '@/hooks/useTableSort';
import { SortableHeader } from '@/components/ui/SortableHeader';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Search,
  Calendar as CalendarIcon,
  Clock,
  Edit2,
  Loader2,
  AlertCircle,
  Download,
  TrendingUp,
  TrendingDown,
  Timer,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';

export interface AttendanceDashboardProps {
  role: 'admin' | 'hr';
}

interface AttendanceRecord {
  id: number | string;
  employeeId: number;
  employeeName: string;
  department: string;
  branchName: string;
  date: string;
  checkIn: string;
  checkOut: string;
  status: string;
  lateMinutes: number;
  totalHours: number;
  overtimeMinutes: number;
  undertimeMinutes: number;
  shiftCode: string | null;
  isNightShift: boolean;
}

function AttendanceContent({ role }: AttendanceDashboardProps) {
  const searchParams = useSearchParams();
  const { toasts, showToast, dismissToast } = useToast();

  const getTodayDate = () =>
    new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });

  const [selectedDate, setSelectedDate] = useState(getTodayDate());
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [branchFilter, setBranchFilter] = useState('All Branches');
  const [deptFilter, setDeptFilter] = useState('All Departments');
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Dynamic branch/department lists from API
  const [branchesList, setBranchesList] = useState<{ id: number; name: string }[]>([]);
  const [departmentsList, setDepartmentsList] = useState<{ id: number; name: string }[]>([]);
  const [editingLog, setEditingLog] = useState<AttendanceRecord | null>(null);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [editCheckIn, setEditCheckIn] = useState('');
  const [editCheckOut, setEditCheckOut] = useState('');

  const [editReason, setEditReason] = useState('');
  const [stats, setStats] = useState({ onTime: 0, late: 0, absent: 0, total: 0, avgHours: '0', totalOT: '0', totalUT: '0' });

  const dateInputRef = useRef<HTMLInputElement>(null);
  const dragScrollRef = useHorizontalDragScroll();

  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const rowsPerPage = 10;

  // Read query params from dashboard navigation
  useEffect(() => {
    const branchQuery = searchParams.get('branch');
    const statusQuery = searchParams.get('status');
    if (branchQuery) setBranchFilter(branchQuery);
    if (statusQuery) {
      const s = statusQuery.toLowerCase();
      setStatusFilter(s === 'present' ? 'present' : s === 'late' ? 'late' : s === 'absent' ? 'absent' : 'all');
    }
  }, [searchParams]);

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchQuery), 400);
    return () => clearTimeout(t);
  }, [searchQuery]);

  // Reset page on filter change
  useEffect(() => { setCurrentPage(1); }, [selectedDate, statusFilter, debouncedSearch, branchFilter, deptFilter]);

  // Fetch branches from API
  useEffect(() => {
    const run = async () => {
      try {
        const res = await fetch('/api/branches', { credentials: 'include' });
        if (res.ok) {
          const data = await res.json();
          if (data.success && data.branches) setBranchesList(data.branches);
        }
      } catch { /* ignore */ }
    };
    run();
  }, []);

  // Fetch departments from API
  useEffect(() => {
    const run = async () => {
      try {
        const res = await fetch('/api/departments', { credentials: 'include' });
        const data = await res.json();
        if (data.success && data.departments) setDepartmentsList(data.departments);
      } catch { /* ignore */ }
    };
    run();
  }, []);

  const { sortedData: sortedRecords, sortKey, sortOrder, handleSort } = useTableSort<AttendanceRecord>({
    initialData: records
  });
  const sortKeyStr = sortKey as string | null;



  const formatLate = (mins: number): string => {
    if (!mins || mins <= 0) return '—';
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  };

  const fmtHours = (hours: number): string => {
    if (!hours || hours <= 0) return '—';
    const h = Math.floor(hours);
    const m = Math.round((hours - h) * 60);
    if (h === 0) return `${m}m`;
    if (m === 0) return `${h}h`;
    return `${h}h ${m}m`;
  };

  const fmtMins = (mins: number): string => {
    if (!mins || mins <= 0) return '—';
    const h = Math.floor(mins / 60);
    const m = Math.round(mins % 60);
    if (h === 0) return `${m}m`;
    if (m === 0) return `${h}h`;
    return `${h}h ${m}m`;
  };

  const fetchRecords = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        startDate: selectedDate,
        endDate: selectedDate,
        limit: '500',
      });
      if (statusFilter !== 'all') params.append('status', statusFilter);

      const res = await fetch(`/api/attendance?${params}`, { credentials: 'include' });
      if (res.status === 401) { window.location.href = '/login'; return; }

      const data = await res.json();
      if (data.success) {
        const userRecords = data.data.filter((log: any) => {
          const emp = log.employee || {};
          return emp.role === 'USER' || !emp.role;
        });

        const mapped: AttendanceRecord[] = userRecords.map((log: any) => {
          const emp = log.employee || {};
          const checkIn = new Date(log.checkInTime);
          const checkOut = log.checkOutTime ? new Date(log.checkOutTime) : null;
          const totalHours: number = log.totalHours ?? (checkOut ? (checkOut.getTime() - checkIn.getTime()) / (1000 * 60 * 60) : 0);
          const lateMinutes: number = log.lateMinutes ?? 0;
          const overtimeMinutes: number = log.overtimeMinutes ?? 0;
          const undertimeMinutes: number = log.undertimeMinutes ?? 0;
          const shiftCode: string | null = log.shiftCode ?? emp.Shift?.shiftCode ?? null;
          const dbStatus = (log.status || '').toLowerCase();
          const status = dbStatus === 'absent' ? 'absent' : (lateMinutes > 0 ? 'late' : 'present');
          return {
            id: log.id,
            employeeId: log.employeeId,
            employeeName: emp.firstName ? `${emp.firstName}${emp.middleName ? ` ${emp.middleName[0]}.` : ''} ${emp.lastName}${emp.suffix ? ` ${emp.suffix}` : ''}` : 'Unknown',
            department: emp.Department?.name || emp.department || 'General',
            branchName: emp.branch || '—',
            date: new Date(log.date).toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' }),
            checkIn: checkIn.toLocaleTimeString('en-US', { timeZone: 'Asia/Manila', hour: '2-digit', minute: '2-digit', hour12: true }),
            checkOut: checkOut ? checkOut.toLocaleTimeString('en-US', { timeZone: 'Asia/Manila', hour: '2-digit', minute: '2-digit', hour12: true }) : '—',
            status, lateMinutes, totalHours, overtimeMinutes, undertimeMinutes, shiftCode,
            isNightShift: emp.Shift?.isNightShift ?? false,
            notes: log.notes || null,
          };
        });

        // Fetch all active employees to inject absent rows
        let allEmployees: any[] = [];
        try {
          const empRes = await fetch('/api/employees?limit=9999', { credentials: 'include' });
          const empData = await empRes.json();
          if (empData.success) allEmployees = (empData.employees || empData.data || []).filter((e: any) =>
            (e.role === 'USER' || !e.role) && (e.employmentStatus === 'ACTIVE' || !e.employmentStatus)
          );
        } catch { /* ignore */ }

        const presentIds = new Set(mapped.map(r => r.employeeId));
        const absentRows: AttendanceRecord[] = allEmployees
          .filter((e: any) => !presentIds.has(e.id))
          .map((e: any) => ({
            id: `absent-${e.id}`,
            employeeId: e.id,
            employeeName: `${e.firstName} ${e.lastName}`,
            department: e.Department?.name || e.department || 'General',
            branchName: e.branch || '—',
            date: selectedDate,
            checkIn: '—', checkOut: '—', status: 'absent',
            lateMinutes: 0, totalHours: 0, overtimeMinutes: 0, undertimeMinutes: 0,
            shiftCode: e.Shift?.shiftCode ?? null,
            isNightShift: e.Shift?.isNightShift ?? false,
          }));

        let full = (statusFilter === 'all' || statusFilter === 'absent')
          ? [...mapped, ...absentRows]
          : [...mapped];

        // Apply client-side filters
        if (debouncedSearch) full = full.filter(r => r.employeeName.toLowerCase().includes(debouncedSearch.toLowerCase()));
        if (branchFilter !== 'All Branches') full = full.filter(r => r.branchName === branchFilter);
        if (deptFilter !== 'All Departments') full = full.filter(r => r.department === deptFilter);

        setRecords(full);
        setTotalPages(Math.max(1, Math.ceil(full.length / rowsPerPage)));
        setStats({
          onTime: full.filter(r => r.status === 'present').length,
          late: full.filter(r => r.status === 'late').length,
          absent: full.filter(r => r.status === 'absent').length,
          total: full.length,
          avgHours: full.length > 0
            ? (full.filter(r => r.totalHours > 0).reduce((s, r) => s + r.totalHours, 0) /
              (full.filter(r => r.totalHours > 0).length || 1)).toFixed(1) : '0',
          totalOT: (full.reduce((s, r) => s + (r.overtimeMinutes ?? 0), 0) / 60).toFixed(1),
          totalUT: (full.reduce((s, r) => s + (r.undertimeMinutes ?? 0), 0) / 60).toFixed(1),
        });
      } else {
        setError(data.message || 'Failed to fetch attendance');
      }
    } catch (e: any) {
      setError(e.message || 'Network error');
    } finally {
      setLoading(false);
    }
  }, [selectedDate, statusFilter, debouncedSearch, branchFilter, deptFilter]);

  useEffect(() => { fetchRecords(); }, [fetchRecords]);

  // Convert "07:45 AM" → "07:45" for time input
  const toTimeInput = (str: string): string => {
    if (!str || str === '—') return '';
    try {
      const d = new Date(`1970-01-01 ${str}`);
      if (isNaN(d.getTime())) return '';
      return d.toTimeString().slice(0, 5);
    } catch { return ''; }
  };

  const handleEditClick = (row: AttendanceRecord) => {
    setEditingLog(row);
    setEditCheckIn(toTimeInput(row.checkIn));
    setEditCheckOut(toTimeInput(row.checkOut));

    setEditReason('');
  };

  const handleApplyChanges = async () => {
    if (!editingLog) return;
    if (String(editingLog.id).startsWith('absent-')) {
      showToast('error', 'Cannot Edit', 'Cannot edit an absent record — the employee has no clock-in/out entry for this day.');
      return;
    }
    setActionLoading(true);
    try {
      const body: any = { reason: editReason };
      if (editCheckIn) body.checkInTime = `${editingLog.date}T${editCheckIn}:00+08:00`;
      if (editCheckOut) body.checkOutTime = `${editingLog.date}T${editCheckOut}:00+08:00`;

      const res = await fetch(`/api/attendance/${editingLog.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.success) {
        showToast('success', role === 'admin' ? 'Record Updated' : 'Adjustment Submitted', role === 'admin' ? 'Attendance record successfully updated!' : 'Adjustment submitted for admin approval!');
        setEditingLog(null);
        fetchRecords();
      } else {
        showToast('error', 'Update Failed', data.message || 'Update failed');
      }
    } catch (e: any) {
      showToast('error', 'Network Error', e.message || 'Network error');
    } finally {
      setActionLoading(false);
    }
  };

  const exportToCSV = () => {
    const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    const date = new Date(selectedDate + 'T00:00:00');
    const formattedDate = `${MONTHS[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
    const branchLabel = branchFilter === 'All Branches' ? 'All Branches' : branchFilter;
    const deptLabel = deptFilter === 'All Departments' ? 'All Departments' : deptFilter;

    const presentCount = records.filter(r => r.status === 'present').length;
    const lateCount = records.filter(r => r.status === 'late').length;
    const absentCount = records.filter(r => r.status === 'absent').length;

    const allRows: (string | number)[][] = [];

    allRows.push(['BITS Attendance Report']);
    allRows.push(['Branch', branchLabel]);
    allRows.push(['Department', deptLabel]);
    allRows.push(['Date', formattedDate]);
    allRows.push(['Generated', new Date().toLocaleString('en-PH', { timeZone: 'Asia/Manila' })]);
    allRows.push([]);

    allRows.push(['SUMMARY']);
    allRows.push(['Total Employees', records.length, '', 'Avg Hours', `${stats.avgHours}h`]);
    allRows.push(['Present', presentCount, '', 'Overtime Total', `${stats.totalOT}h`]);
    allRows.push(['Late', lateCount, '', 'Undertime Total', `${stats.totalUT}h`]);
    allRows.push(['Absent', absentCount]);
    allRows.push([]);

    allRows.push([
      '#', 'Employee', 'Branch', 'Department', 'Shift',
      'Check In', 'Check Out', 'Hours Worked',
      'Late By', 'Overtime', 'Undertime', 'Status'
    ]);

    sortedRecords.forEach((r, i) => {
      const statusLabel = r.status.charAt(0).toUpperCase() + r.status.slice(1);
      allRows.push([
        i + 1,
        r.employeeName,
        r.branchName,
        r.department,
        r.shiftCode || 'No Shift',
        r.checkIn,
        r.checkOut,
        r.totalHours > 0 ? fmtHours(r.totalHours) : '—',
        formatLate(r.lateMinutes),
        r.overtimeMinutes > 0 ? `+${fmtMins(r.overtimeMinutes)}` : '—',
        r.undertimeMinutes > 0 ? `-${fmtMins(r.undertimeMinutes)}` : '—',
        statusLabel
      ]);
    });

    const fileName = `Attendance_${branchLabel.replace(/\s+/g, '_')}_${selectedDate}.xlsx`;
    const worksheet = XLSX.utils.aoa_to_sheet(allRows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Attendance');
    XLSX.writeFile(workbook, fileName);

    // Log the export event
    fetch('/api/logs/export-event', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        exportType: 'attendance',
        entityType: 'Attendance',
        source: role === 'admin' ? 'admin-panel' : 'hr-panel',
        details: `Exported attendance records (${records.length} rows) for ${selectedDate}`,
        filters: { branch: branchLabel, date: selectedDate, department: deptFilter !== 'All Departments' ? deptFilter : undefined, status: statusFilter !== 'all' ? statusFilter : undefined },
        recordCount: records.length,
        fileFormat: 'xlsx',
        fileName,
      }),
    }).catch(() => {});
  };

  const branches = ['All Branches', ...branchesList.map(b => b.name)];
  const departments = ['All Departments', ...departmentsList.map(d => d.name)];
  const statuses = [
    { value: 'all', label: 'All Status' },
    { value: 'present', label: 'On Time' },
    { value: 'late', label: 'Late' },
    { value: 'absent', label: 'Absent' },
  ];

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black text-slate-800 tracking-tight">Attendance Logs</h1>
          <p className="text-slate-500 text-sm font-medium mt-0.5">
            {new Date(selectedDate + 'T00:00:00').toLocaleDateString('en-US', {
              weekday: 'long', month: 'long', day: 'numeric', year: 'numeric'
            })}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input type="date" ref={dateInputRef} className="absolute opacity-0 pointer-events-none" onChange={e => setSelectedDate(e.target.value)} value={selectedDate} />
          <button onClick={() => dateInputRef.current?.showPicker()} className="flex items-center gap-2 px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-bold text-slate-600 hover:bg-slate-50 hover:border-red-200 transition-all shadow-sm">
            <CalendarIcon className="w-4 h-4 text-red-500" />
            <span>{selectedDate === getTodayDate() ? `Today, ${new Date(selectedDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` : new Date(selectedDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
          </button>
          <button onClick={exportToCSV} className="flex items-center gap-2 px-4 py-2.5 bg-red-600 text-white rounded-xl text-sm font-bold hover:bg-red-700 transition-all shadow-lg shadow-red-600/20 active:scale-95">
            <Download className="w-4 h-4" /> Export Log
          </button>
        </div>
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm font-medium px-4 py-3 rounded-xl flex items-center gap-2"><AlertCircle className="w-4 h-4" />{error}</div>}

      {/* Stats Cards */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Avg Hours', value: `${stats.avgHours}h`, icon: Timer, color: 'text-blue-500', bg: 'bg-blue-500/10' },
          { label: 'Overtime', value: `${stats.totalOT}h`, icon: TrendingUp, color: 'text-emerald-500', bg: 'bg-emerald-500/10' },
          { label: 'Undertime', value: `${stats.totalUT}h`, icon: TrendingDown, color: 'text-red-500', bg: 'bg-red-500/10' },
        ].map(s => {
          const Icon = s.icon;
          return (
            <div key={s.label} className="bg-white rounded-2xl border border-slate-100 p-3 sm:p-4 shadow-sm">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{s.label}</p>
                  <p className={`text-xl sm:text-2xl font-black mt-1 ${s.color}`}>{s.value}</p>
                </div>
                <div className={`${s.bg} p-2 rounded-xl shrink-0`}><Icon className={`w-4 h-4 ${s.color}`} /></div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Mini Stats Bar */}
      <div className="flex items-center gap-4 bg-white px-5 py-3 rounded-2xl border border-slate-100 shadow-sm w-fit">
        <div className="text-center"><p className="text-[9px] font-black uppercase tracking-wider text-slate-400">On Time</p><p className="text-xl font-black text-emerald-500">{stats.onTime}</p></div>
        <div className="w-px h-8 bg-slate-100" />
        <div className="text-center"><p className="text-[9px] font-black uppercase tracking-wider text-slate-400">Late</p><p className="text-xl font-black text-yellow-500">{stats.late}</p></div>
        <div className="w-px h-8 bg-slate-100" />
        <div className="text-center"><p className="text-[9px] font-black uppercase tracking-wider text-slate-400">Absent</p><p className="text-xl font-black text-red-500">{stats.absent}</p></div>
        <div className="w-px h-8 bg-slate-100" />
        <div className="text-center"><p className="text-[9px] font-black uppercase tracking-wider text-slate-400">Total</p><p className="text-xl font-black text-slate-700">{stats.total}</p></div>
      </div>

      {/* Filters */}
      <div className="flex flex-col md:flex-row gap-2 bg-white p-2 rounded-2xl border border-slate-200 shadow-sm">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input placeholder="Search employee..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium outline-none focus:ring-2 focus:ring-red-500/20" />
        </div>
        <div className="flex gap-2">
          <Select value={branchFilter} onValueChange={setBranchFilter}>
            <SelectTrigger className="w-44 bg-white border-slate-200 font-bold text-xs uppercase tracking-widest"><SelectValue placeholder="Branch" /></SelectTrigger>
            <SelectContent className="bg-white border-slate-200">
              {branches.map(b => <SelectItem key={b} value={b}>{b.toUpperCase()}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={deptFilter} onValueChange={setDeptFilter}>
            <SelectTrigger className="w-52 bg-white border-slate-200 font-bold text-xs uppercase tracking-widest"><SelectValue placeholder="Department" /></SelectTrigger>
            <SelectContent className="bg-white border-slate-200">
              {departments.map(d => <SelectItem key={d} value={d}>{d.toUpperCase()}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-36 bg-white border-slate-200 font-bold text-xs uppercase tracking-widest"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent className="bg-white border-slate-200">
              {statuses.map(s => <SelectItem key={s.value} value={s.value}>{s.label.toUpperCase()}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Table Card */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">

        {/* ── Mobile Card View ── */}
        <div className="lg:hidden">
          {loading ? (
            <div className="px-6 py-16 text-center">
              <div className="flex flex-col items-center gap-2 text-slate-400">
                <div className="w-6 h-6 border-2 border-red-500 border-t-transparent rounded-full animate-spin" />
                <span className="text-sm font-medium">Loading attendance...</span>
              </div>
            </div>
          ) : records.length === 0 ? (
            <div className="px-6 py-16 text-center text-slate-400 font-black uppercase text-[10px] tracking-widest">No attendance records found</div>
          ) : (
            <div className="divide-y divide-slate-100">
              {sortedRecords.slice((currentPage - 1) * rowsPerPage, currentPage * rowsPerPage).map(row => (
                <div key={row.id} className="p-4 hover:bg-red-50/30 transition-colors">
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div className="min-w-0 flex-1">
                      <p className="font-black text-slate-700 text-sm truncate uppercase tracking-tight">{row.employeeName}</p>
                      <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-0.5">{row.department} • {row.branchName}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className={`font-black text-[10px] uppercase px-3 py-1 rounded-full border whitespace-nowrap ${row.status === 'present' ? 'text-emerald-600 bg-emerald-50 border-emerald-100'
                        : row.status === 'late' ? 'text-yellow-600 bg-yellow-50 border-yellow-100'
                          : 'text-red-600 bg-red-50 border-red-100'
                      }`}>
                        {row.status === 'present' ? 'On Time' : row.status}
                      </span>
                      <button onClick={() => handleEditClick(row)} className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all">
                        <Edit2 size={14} />
                      </button>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                    <div><p className="text-[10px] text-slate-400 font-black uppercase tracking-widest mb-1">Clock In</p><p className="font-mono text-emerald-600 font-black text-sm">{row.checkIn}</p></div>
                    <div><p className="text-[10px] text-slate-400 font-black uppercase tracking-widest mb-1">Clock Out</p>
                      {(row as any).notes?.includes('Early punch detected') ? (
                        <span className="text-[10px] font-bold text-orange-500">🔶 Early punch flagged</span>
                      ) : row.checkOut === '—' && (row as any).notes?.includes('No checkout recorded') ? (
                        <span className="text-[10px] font-bold text-amber-600">⚠️ No checkout</span>
                      ) : (
                        <p className="font-mono text-slate-600 font-black text-sm">{row.checkOut}</p>
                      )}
                    </div>
                    <div><p className="text-[10px] text-slate-400 font-black uppercase tracking-widest mb-1">Shift</p>
                      {row.shiftCode ? <span className={`text-[10px] font-black px-2 py-0.5 rounded-md border ${row.isNightShift ? 'bg-purple-100 text-purple-600 border-purple-200' : 'bg-blue-100 text-blue-600 border-blue-200'}`}>{row.shiftCode}</span> : <span className="text-[10px] text-slate-400 italic font-medium">No shift</span>}
                    </div>
                    <div><p className="text-[10px] text-slate-400 font-black uppercase tracking-widest mb-1">Hours</p><p className="font-mono text-slate-700 font-black text-sm">{fmtHours(row.totalHours)}</p></div>
                  </div>
                  {(row.lateMinutes > 0 || row.overtimeMinutes > 0 || row.undertimeMinutes > 0) && (
                    <div className="flex items-center gap-3 mt-2 pt-2 border-t border-slate-50">
                      {row.lateMinutes > 0 && <span className="text-[10px] font-bold text-yellow-600 bg-yellow-50 border border-yellow-100 px-2 py-0.5 rounded-full">Late {formatLate(row.lateMinutes)}</span>}
                      {row.overtimeMinutes > 0 && <span className="text-[10px] font-bold text-emerald-600">OT +{fmtMins(row.overtimeMinutes)}</span>}
                      {row.undertimeMinutes > 0 && <span className="text-[10px] font-bold text-red-500">UT -{fmtMins(row.undertimeMinutes)}</span>}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Desktop Table View ── */}
        <div ref={dragScrollRef} className="overflow-x-auto scrollbar-hide hidden lg:block">
          <table className="w-full text-left text-sm border-collapse min-w-[1100px]">
            <thead className="bg-slate-50 text-slate-400 font-bold uppercase text-[10px] tracking-widest border-b border-slate-100">
              <tr>
                <SortableHeader label="Employee" sortKey="employeeName" currentSortKey={sortKeyStr} currentSortOrder={sortOrder} onSort={handleSort} className="px-6 py-4" />
                <SortableHeader label="Department" sortKey="department" currentSortKey={sortKeyStr} currentSortOrder={sortOrder} onSort={handleSort} className="px-4 py-4" />
                <SortableHeader label="Branch" sortKey="branchName" currentSortKey={sortKeyStr} currentSortOrder={sortOrder} onSort={handleSort} className="px-4 py-4" />
                <SortableHeader label="Shift" sortKey="shiftCode" currentSortKey={sortKeyStr} currentSortOrder={sortOrder} onSort={handleSort} className="px-4 py-4 text-center" />
                <SortableHeader label="Clock In" sortKey="checkIn" currentSortKey={sortKeyStr} currentSortOrder={sortOrder} onSort={handleSort} className="px-4 py-4" />
                <SortableHeader label="Clock Out" sortKey="checkOut" currentSortKey={sortKeyStr} currentSortOrder={sortOrder} onSort={handleSort} className="px-4 py-4" />
                <SortableHeader label="Late" sortKey="lateMinutes" currentSortKey={sortKeyStr} currentSortOrder={sortOrder} onSort={handleSort} className="px-4 py-4 text-center text-yellow-500" />
                <SortableHeader label="Hours" sortKey="totalHours" currentSortKey={sortKeyStr} currentSortOrder={sortOrder} onSort={handleSort} className="px-4 py-4 text-center" />
                <SortableHeader label="OT" sortKey="overtimeMinutes" currentSortKey={sortKeyStr} currentSortOrder={sortOrder} onSort={handleSort} className="px-4 py-4 text-center text-emerald-500" />
                <SortableHeader label="UT" sortKey="undertimeMinutes" currentSortKey={sortKeyStr} currentSortOrder={sortOrder} onSort={handleSort} className="px-4 py-4 text-center text-red-500" />
                <SortableHeader label="Status" sortKey="status" currentSortKey={sortKeyStr} currentSortOrder={sortOrder} onSort={handleSort} className="px-4 py-4 text-center" />
                <th className="px-4 py-4 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr><td colSpan={12} className="px-6 py-16 text-center">
                  <div className="flex flex-col items-center gap-2 text-slate-400">
                    <div className="w-6 h-6 border-2 border-red-500 border-t-transparent rounded-full animate-spin" />
                    <span className="text-sm font-medium">Loading attendance...</span>
                  </div>
                </td></tr>
              ) : sortedRecords.length === 0 ? (
                <tr><td colSpan={12} className="px-6 py-16 text-center text-slate-400 font-black uppercase text-[10px] tracking-widest">No attendance records found</td></tr>
              ) : (
                sortedRecords.slice((currentPage - 1) * rowsPerPage, currentPage * rowsPerPage).map(row => (
                  <tr key={row.id} className="hover:bg-red-50/40 transition-colors duration-200 group cursor-default">
                    <td className="px-6 py-4 flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-red-600/20 flex items-center justify-center text-red-600 font-bold text-[10px] shrink-0 uppercase tracking-tight">{row.employeeName.charAt(0)}</div>
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-slate-700 leading-tight uppercase tracking-tight">{row.employeeName}</p>
                        <p className="text-[10px] text-slate-400 font-medium uppercase tracking-widest mt-0.5">{row.branchName}</p>
                      </div>
                    </td>
                    <td className="px-4 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest leading-none">{row.department}</td>
                    <td className="px-4 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest leading-none">{row.branchName}</td>
                    <td className="px-4 py-4 text-center">
                      {row.shiftCode ? (
                        <span className={`text-[9px] font-black px-2.5 py-1 rounded-lg border uppercase tracking-widest whitespace-nowrap ${row.isNightShift ? 'bg-purple-100 text-purple-600 border-purple-200' : 'bg-blue-100 text-blue-600 border-blue-200'}`}>{row.shiftCode}</span>
                      ) : (
                        <span className="text-[10px] text-slate-400 italic font-medium">No Shift</span>
                      )}
                    </td>
                    <td className={`px-4 py-4 text-sm font-mono font-bold ${row.status === 'late' ? 'text-yellow-600' : row.status === 'present' ? 'text-emerald-600' : 'text-slate-400'}`}>{row.checkIn}</td>
                    <td className="px-4 py-4 text-sm font-mono text-slate-600 font-bold">
                      {(row as any).notes?.includes('Early punch detected') ? (
                        <div className="flex flex-col">
                          {row.checkOut !== '—' ? (
                            <span>{row.checkOut}</span>
                          ) : null}
                          <span className="inline-flex items-center gap-1 text-orange-500 font-bold text-[10px] uppercase tracking-wider whitespace-nowrap mt-0.5" title={(row as any).notes}>
                            <AlertCircle className="w-3 h-3" />
                            Early punch flagged
                          </span>
                        </div>
                      ) : row.checkOut === '—' && (row as any).notes?.includes('No checkout recorded') ? (
                        <span className="inline-flex items-center gap-1 text-amber-600 font-bold text-[10px] uppercase tracking-wider whitespace-nowrap" title={(row as any).notes}>
                          <AlertCircle className="w-3 h-3" />
                          No checkout
                        </span>
                      ) : (
                        row.checkOut
                      )}
                    </td>
                    <td className="px-4 py-4 text-center">
                      {row.lateMinutes > 0 ? (
                        <span className="text-[10px] font-black text-yellow-600 bg-yellow-50 border border-yellow-100 px-2.5 py-1 rounded-full whitespace-nowrap">{formatLate(row.lateMinutes)}</span>
                      ) : <span className="text-[10px] text-slate-300 font-black">—</span>}
                    </td>
                    <td className="px-4 py-4 text-sm font-mono text-slate-700 font-bold text-center">{fmtHours(row.totalHours)}</td>
                    <td className="px-4 py-4 text-center">
                      <span className={`text-sm font-bold ${row.overtimeMinutes > 0 ? 'text-emerald-600' : 'text-slate-300'}`}>
                        {row.overtimeMinutes > 0 ? `+${fmtMins(row.overtimeMinutes)}` : '—'}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-center">
                      <span className={`text-sm font-bold ${row.undertimeMinutes > 0 ? 'text-red-500' : 'text-slate-300'}`}>
                        {row.undertimeMinutes > 0 ? `-${fmtMins(row.undertimeMinutes)}` : '—'}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-center">
                      <span className={`font-black text-[10px] uppercase px-3 py-1 rounded-full border whitespace-nowrap ${row.status === 'present' ? 'text-emerald-600 bg-emerald-50 border-emerald-100'
                        : row.status === 'late' ? 'text-yellow-600 bg-yellow-50 border-yellow-100'
                          : row.status === 'incomplete' ? 'text-amber-600 bg-amber-50 border-amber-100'
                            : 'text-red-600 bg-red-50 border-red-100'
                      }`}>
                        {row.status === 'present' ? 'On Time' : row.status}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-center">
                      <button onClick={() => handleEditClick(row)} className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all">
                        <Edit2 size={16} />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">
              Page {currentPage} of {totalPages} &middot; {records.length} employees
            </span>
            <div className="flex items-center gap-1">
              <button onClick={() => setCurrentPage(p => Math.max(p - 1, 1))} disabled={currentPage === 1}
                className="h-8 w-8 flex items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-red-50 hover:border-red-200 hover:text-red-600 disabled:opacity-40 disabled:cursor-not-allowed transition-all">
                <ChevronLeft size={16} />
              </button>
              {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                const page = totalPages <= 5 ? i + 1 : currentPage <= 3 ? i + 1 : currentPage >= totalPages - 2 ? totalPages - 4 + i : currentPage - 2 + i;
                return (
                  <button key={page} onClick={() => setCurrentPage(page)}
                    className={`h-8 w-8 flex items-center justify-center rounded-lg text-xs font-bold transition-all ${currentPage === page ? 'bg-red-600 text-white border border-red-600 shadow-md shadow-red-600/20' : 'border border-slate-200 text-slate-600 hover:bg-red-50 hover:border-red-200 hover:text-red-600'}`}>
                    {page}
                  </button>
                );
              })}
              <button onClick={() => setCurrentPage(p => Math.min(p + 1, totalPages))} disabled={currentPage >= totalPages}
                className="h-8 w-8 flex items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-red-50 hover:border-red-200 hover:text-red-600 disabled:opacity-40 disabled:cursor-not-allowed transition-all">
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Edit Modal */}
      {editingLog && (
        <div className="fixed inset-0 bg-slate-950/40 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in duration-200 flex flex-col">
            <div className="p-5 bg-red-600 text-white flex justify-between items-center shrink-0">
              <h3 className="font-bold text-lg leading-tight tracking-tight">Manual Time Changes</h3>
            </div>
            <div className="p-6 space-y-4">
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                <p className="text-sm font-bold text-slate-800 leading-none">{editingLog.employeeName}</p>
                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mt-1">
                  {editingLog.department} • {editingLog.branchName}
                  {editingLog.shiftCode && <span className="ml-2">• {editingLog.shiftCode}</span>}
                </p>
              </div>
              {String(editingLog.id).startsWith('absent-') && (
                <div className="bg-amber-50 border border-amber-100 p-3 rounded-xl flex gap-3">
                  <AlertCircle size={16} className="text-amber-500 shrink-0 mt-0.5" />
                  <p className="text-xs font-medium text-amber-800">This employee has no existing clock-in record for this day. Changes cannot be saved.</p>
                </div>
              )}
              <div className="bg-blue-50 border border-blue-100 p-3 rounded-xl flex gap-3">
                <Clock size={16} className="text-blue-500 shrink-0 mt-0.5" />
                <p className="text-[10px] text-blue-800 leading-relaxed font-medium">
                  <strong className="block mb-0.5 tracking-tight uppercase">Auto-Computed Status</strong>
                  Status will be automatically determined based on the employee&apos;s assigned shift schedule and the recorded time-in / time-out.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[9px] font-black uppercase text-slate-400 tracking-wider flex items-center gap-1.5"><Clock size={10} className="text-emerald-500" /> Clock In</label>
                  <input type="time" value={editCheckIn} onChange={(e) => setEditCheckIn(e.target.value)}
                    className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 outline-none focus:ring-2 focus:ring-red-500/20" />
                </div>
                <div className="space-y-1">
                  <label className="text-[9px] font-black uppercase text-slate-400 tracking-wider flex items-center gap-1.5"><Clock size={10} className="text-red-500" /> Clock Out</label>
                  <input type="time" value={editCheckOut} onChange={(e) => setEditCheckOut(e.target.value)}
                    className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 outline-none focus:ring-2 focus:ring-red-500/20" />
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-[9px] font-black uppercase text-slate-400 tracking-wider">Reason for Adjustment <span className="text-red-500">*</span></label>
                <textarea value={editReason} onChange={(e) => setEditReason(e.target.value)}
                  placeholder="e.g., Biometric error, Official business..."
                  className={`w-full p-3 bg-slate-50 border rounded-xl h-16 text-xs outline-none focus:ring-2 focus:ring-red-500/20 resize-none ${!editReason.trim() ? 'border-red-300' : 'border-slate-200'}`} />
                {!editReason.trim() && (
                  <p className="text-[10px] text-red-500 font-medium flex items-center gap-1">
                    <AlertCircle size={10} />
                    Reason is required. Please provide a reason before submitting.
                  </p>
                )}
              </div>
              {role === 'hr' ? (
                <div className="bg-amber-50 border border-amber-100 p-3 rounded-xl flex gap-3 shadow-sm">
                  <AlertCircle size={18} className="text-amber-600 shrink-0" />
                  <p className="text-[10px] text-amber-800 leading-relaxed font-medium">
                    <strong className="block mb-0.5 tracking-tight uppercase">Approval Required</strong>
                    Your adjustment will be submitted for admin approval and logged under your account.
                  </p>
                </div>
              ) : (
                <div className="bg-red-50 border border-red-200 p-3 rounded-xl flex gap-3 shadow-sm">
                  <AlertCircle size={18} className="text-red-700 shrink-0" />
                  <p className="text-[10px] text-red-800 leading-relaxed font-medium">
                    <strong className="block mb-0.5 tracking-tight uppercase">Admin Override</strong>
                    This change will bypass the adjustment queue and update the record permanently.
                  </p>
                </div>
              )}
            </div>
            <div className="p-5 bg-slate-50 flex gap-3 shrink-0">
              <button onClick={() => setShowCancelModal(true)} className="flex-1 px-4 py-3.5 text-sm font-bold text-slate-500 hover:text-slate-800 transition-colors">Cancel</button>
              <button
                onClick={handleApplyChanges}
                disabled={actionLoading || String(editingLog.id).startsWith('absent-') || !editReason.trim()}
                className="flex-1 px-4 py-3.5 bg-red-600 text-white rounded-xl text-sm font-black shadow-lg shadow-red-600/30 hover:bg-red-700 transition-all active:scale-95 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
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
        <div className="fixed inset-0 bg-slate-950/40 backdrop-blur-sm z-150 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="p-6 text-center space-y-4">
              <h3 className="text-lg font-black text-slate-800 tracking-tight">Discard changes?</h3>
              <p className="text-sm font-medium text-slate-500">Your unsaved modifications will be lost.</p>
              <div className="flex gap-3 pt-2">
                <button onClick={() => setShowCancelModal(false)} className="flex-1 px-4 py-2.5 border border-slate-200 text-slate-600 rounded-xl text-sm font-bold hover:bg-slate-50 transition-all">Cancel</button>
                <button onClick={() => { setEditingLog(null); setShowCancelModal(false); }} className="flex-1 px-4 py-2.5 bg-red-600 text-white rounded-xl text-sm font-bold hover:bg-red-700 transition-all shadow-lg shadow-red-200 active:scale-95">Yes</button>
              </div>
            </div>
          </div>
        </div>
      )}

      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}

export default function AttendanceDashboard({ role }: AttendanceDashboardProps) {
  return (
    <Suspense fallback={<div className="p-8 text-center font-bold text-slate-400">Loading...</div>}>
      <AttendanceContent role={role} />
    </Suspense>
  );
}