"use client"

export const dynamic = 'force-dynamic'

import React, { useState, useRef, useEffect, useCallback, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { useHorizontalDragScroll } from '@/hooks/useHorizontalDragScroll';
import { useToast } from '@/hooks/useToast';
import ToastContainer from '@/components/ui/ToastContainer';
import * as XLSX from 'xlsx';
import { AttendanceStats } from '@/features/attendance/components/AttendanceStats';
import { AttendanceFilters } from '@/features/attendance/components/AttendanceFilters';
import { AttendanceTable } from '@/features/attendance/components/AttendanceTable';
import { AttendanceEditModal } from '@/features/attendance/components/AttendanceEditModal';
import { fmtHours, formatLate, fmtMins, toTimeInput } from '@/features/attendance/utils/attendance-formatters';

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
            <span>{selectedDate === getTodayDate() ? 'Today, ' + new Date(selectedDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : new Date(selectedDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
          </button>
          <button onClick={exportToCSV} className="flex items-center gap-2 px-4 py-2.5 bg-red-600 text-white rounded-xl text-sm font-bold hover:bg-red-700 transition-all shadow-lg shadow-red-600/20 active:scale-95">
            <Download className="w-4 h-4" /> Export Log
          </button>
        </div>
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm font-medium px-4 py-3 rounded-xl flex items-center gap-2"><AlertCircle className="w-4 h-4" />{error}</div>}

      <AttendanceStats stats={stats} />

      <AttendanceFilters
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        branchFilter={branchFilter}
        setBranchFilter={setBranchFilter}
        deptFilter={deptFilter}
        setDeptFilter={setDeptFilter}
        statusFilter={statusFilter}
        setStatusFilter={setStatusFilter}
        branches={branches}
        departments={departments}
        statuses={statuses}
      />

      <AttendanceTable
        loading={loading}
        records={records}
        sortedRecords={sortedRecords}
        sortKeyStr={sortKeyStr}
        sortOrder={sortOrder}
        handleSort={handleSort}
        currentPage={currentPage}
        setCurrentPage={setCurrentPage}
        totalPages={totalPages}
        rowsPerPage={rowsPerPage}
        handleEditClick={handleEditClick}
      />

      <AttendanceEditModal
        editingLog={editingLog}
        setEditingLog={setEditingLog}
        role={role}
        editCheckIn={editCheckIn}
        setEditCheckIn={setEditCheckIn}
        editCheckOut={editCheckOut}
        setEditCheckOut={setEditCheckOut}
        editReason={editReason}
        setEditReason={setEditReason}
        showCancelModal={showCancelModal}
        setShowCancelModal={setShowCancelModal}
        handleApplyChanges={handleApplyChanges}
        actionLoading={actionLoading}
      />

      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}

export default function AttendanceDashboard({ role }: AttendanceDashboardProps) {
  return (
    <Suspense fallback={<div className="p-8 text-center text-slate-400 font-medium">Loading workspace...</div>}>
      <AttendanceContent role={role} />
    </Suspense>
  );
}

