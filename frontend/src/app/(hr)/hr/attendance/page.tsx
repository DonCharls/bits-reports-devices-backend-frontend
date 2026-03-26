"use client"

export const dynamic = 'force-dynamic'

import React, { useState, useRef, useEffect, useCallback, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { useHorizontalDragScroll } from '@/hooks/useHorizontalDragScroll';
import * as XLSX from 'xlsx';
import { useTableSort } from '@/hooks/useTableSort';
import { SortableHeader } from '@/components/ui/SortableHeader';
import {
  Search,
  Calendar as CalendarIcon,
  Clock,
  Edit2,
  ChevronDown,
  ChevronUp,
  Loader2,
  AlertCircle,
  Download,
  TrendingUp,
  TrendingDown,
  Timer,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';

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

function AttendanceContent() {
  const searchParams = useSearchParams();

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
  const [editingLog, setEditingLog] = useState<AttendanceRecord | null>(null);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [showSuccessToast, setShowSuccessToast] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [editCheckIn, setEditCheckIn] = useState('');
  const [editCheckOut, setEditCheckOut] = useState('');
  const [editStatus, setEditStatus] = useState('present');
  const [editReason, setEditReason] = useState('');
  const [stats, setStats] = useState({ onTime: 0, late: 0, absent: 0, total: 0, avgHours: '0', totalOT: '0', totalUT: '0' });
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
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

  const { sortedData: sortedRecords, sortKey, sortOrder, handleSort } = useTableSort<AttendanceRecord>({
    initialData: records
  });
  const sortKeyStr = sortKey as string | null;

  useEffect(() => {
    if (showSuccessToast) {
      const t = setTimeout(() => setShowSuccessToast(false), 3000);
      return () => clearTimeout(t);
    }
  }, [showSuccessToast]);

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
          // For present/late: use computed lateMinutes (always accurate based on actual checkIn vs shift)
          // For absent or other: use stored DB status
          const dbStatus = (log.status || '').toLowerCase();
          const status = dbStatus === 'absent' ? 'absent' : (lateMinutes > 0 ? 'late' : 'present');
          return {
            id: log.id,
            employeeId: log.employeeId,
            employeeName: emp.firstName ? `${emp.firstName} ${emp.lastName}` : 'Unknown',
            department: emp.Department?.name || emp.department || 'General',
            branchName: emp.branch || '—',
            date: new Date(log.date).toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' }),
            checkIn: checkIn.toLocaleTimeString('en-US', { timeZone: 'Asia/Manila', hour: '2-digit', minute: '2-digit', hour12: true }),
            checkOut: checkOut ? checkOut.toLocaleTimeString('en-US', { timeZone: 'Asia/Manila', hour: '2-digit', minute: '2-digit', hour12: true }) : '—',
            status, lateMinutes, totalHours, overtimeMinutes, undertimeMinutes, shiftCode,
            isNightShift: emp.Shift?.isNightShift ?? false,
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

        let full = [...mapped, ...absentRows];

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
    setEditStatus(row.status === 'late' ? 'late' : row.status === 'absent' ? 'absent' : 'present');
    setEditReason('');
  };

  const handleApplyChanges = async () => {
    if (!editingLog) return;
    if (String(editingLog.id).startsWith('absent-')) {
      alert('Cannot edit an absent record — the employee has no clock-in/out entry for this day.');
      return;
    }
    setActionLoading(true);
    try {
      const body: any = { reason: editReason };
      // Only send manual status if no time changes (let backend auto-recalculate when times change)
      if (editCheckIn) body.checkInTime = `${editingLog.date}T${editCheckIn}:00+08:00`;
      if (editCheckOut) body.checkOutTime = `${editingLog.date}T${editCheckOut}:00+08:00`;
      if (!editCheckIn && !editCheckOut) body.status = editStatus;

      const res = await fetch(`/api/attendance/${editingLog.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.success) {
        setShowSuccessToast(true);
        setEditingLog(null);
        fetchRecords();
      } else {
        alert(data.message || 'Update failed');
      }
    } catch (e: any) {
      alert(e.message || 'Network error');
    } finally {
      setActionLoading(false);
    }
  };

  const exportToCSV = () => {
    const headers = ['Employee', 'Department', 'Branch', 'Date', 'Check In', 'Check Out', 'Shift', 'Late', 'Hours', 'OT', 'UT', 'Status'];
    const rows = sortedRecords.map(r => [
      r.employeeName, r.department, r.branchName, r.date, r.checkIn, r.checkOut,
      r.shiftCode || 'No Shift', formatLate(r.lateMinutes),
      r.totalHours > 0 ? r.totalHours.toFixed(2) : '—',
      r.overtimeMinutes > 0 ? (r.overtimeMinutes / 60).toFixed(2) : '—',
      r.undertimeMinutes > 0 ? (r.undertimeMinutes / 60).toFixed(2) : '—',
      r.status.charAt(0).toUpperCase() + r.status.slice(1),
    ]);
    const csv = [headers, ...rows].map(row => row.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url; link.download = `Attendance_HR_${selectedDate}.csv`; link.click();
    URL.revokeObjectURL(url);
  };

  const branches = ['All Branches', 'Main Office', 'Tayud Branch', 'Makati Branch'];
  const departments = ['All Departments', 'Purchasing', 'Human Resources', 'I.T.', 'Engineering'];
  const statuses = [
    { value: 'all', label: 'All Status' },
    { value: 'present', label: 'On Time' },
    { value: 'late', label: 'Late' },
    { value: 'absent', label: 'Absent' },
  ];

  const CustomSelect = ({ value, options, onChange, id }: { value: string; options: { value: string; label: string }[]; onChange: (v: string) => void; id: string }) => {
    const isOpen = openDropdown === id;
    const label = options.find(o => o.value === value)?.label ?? value;
    return (
      <div className="relative min-w-[160px]">
        <button onClick={(e) => { e.stopPropagation(); setOpenDropdown(isOpen ? null : id); }}
          className={`w-full flex items-center justify-between px-4 py-2.5 bg-[#df0808] text-white rounded-lg text-xs font-bold transition-all ${isOpen ? 'rounded-b-none' : 'shadow-md'}`}>
          <span>{label}</span>
          {isOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>
        {isOpen && (
          <div className="absolute top-full left-0 right-0 z-50 flex flex-col">
            {options.map((opt) => (
              <button key={opt.value}
                className="w-full text-left px-4 py-2.5 bg-[#c21414] text-white hover:bg-red-500 transition-colors text-xs font-bold mt-[1px] rounded-sm last:rounded-b-lg shadow-sm"
                onClick={() => { onChange(opt.value); setOpenDropdown(null); }}>
                {opt.label}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6 relative" onClick={() => setOpenDropdown(null)}>
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-800 tracking-tight">Attendance Logs</h1>
          <p className="text-slate-500 text-sm font-medium">Monitor and manage daily employee time records</p>
        </div>
        <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto relative">
          <input type="date" ref={dateInputRef} className="absolute opacity-0 pointer-events-none" onChange={e => setSelectedDate(e.target.value)} value={selectedDate} />
          <button onClick={() => dateInputRef.current?.showPicker()} className="flex items-center justify-center gap-2 px-6 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-bold text-slate-600 hover:bg-slate-50 hover:border-red-200 transition-all shadow-sm w-full sm:w-auto">
            <CalendarIcon size={16} className="text-red-500" />
            <span>{selectedDate === getTodayDate() ? `Today, ${new Date(selectedDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` : new Date(selectedDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
          </button>
          <button onClick={exportToCSV} className="flex items-center justify-center gap-2 px-6 py-2.5 bg-red-600 text-white rounded-xl text-sm font-bold shadow-lg shadow-red-600/20 hover:bg-red-700 transition-all active:scale-95 w-full sm:w-auto">
            <Download size={16} /><span>Export Log</span>
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Avg Hours', value: `${stats.avgHours}h`, icon: Timer, color: 'text-blue-500', bg: 'bg-blue-500/10' },
          { label: 'Overtime', value: `${stats.totalOT}h`, icon: TrendingUp, color: 'text-emerald-500', bg: 'bg-emerald-500/10' },
          { label: 'Undertime', value: `${stats.totalUT}h`, icon: TrendingDown, color: 'text-red-500', bg: 'bg-red-500/10' },
        ].map(s => {
          const Icon = s.icon;
          return (
            <div key={s.label} className="bg-white rounded-2xl border border-slate-100 p-4 shadow-sm">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{s.label}</p>
                  <p className={`text-2xl font-black mt-1 ${s.color}`}>{s.value}</p>
                </div>
                <div className={`${s.bg} p-2 rounded-xl`}><Icon className={`w-4 h-4 ${s.color}`} /></div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Mini stats */}
      <div className="flex items-center gap-4 bg-white px-5 py-3 rounded-2xl border border-slate-100 shadow-sm w-fit">
        <div className="text-center"><p className="text-[9px] font-black uppercase tracking-wider text-slate-400">On Time</p><p className="text-xl font-black text-slate-700">{stats.onTime}</p></div>
        <div className="w-px h-8 bg-slate-100" />
        <div className="text-center"><p className="text-[9px] font-black uppercase tracking-wider text-slate-400">Late</p><p className="text-xl font-black text-yellow-500">{stats.late}</p></div>
        <div className="w-px h-8 bg-slate-100" />
        <div className="text-center"><p className="text-[9px] font-black uppercase tracking-wider text-slate-400">Absent</p><p className="text-xl font-black text-red-500">{stats.absent}</p></div>
        <div className="w-px h-8 bg-slate-100" />
        <div className="text-center"><p className="text-[9px] font-black uppercase tracking-wider text-slate-400">Total</p><p className="text-xl font-black text-slate-700">{stats.total}</p></div>
      </div>

      {/* Filters */}
      {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm font-medium px-4 py-3 rounded-xl flex items-center gap-2"><AlertCircle size={16} />{error}</div>}
      <div className="flex flex-col md:flex-row gap-2 bg-white p-2 rounded-2xl border border-slate-200 shadow-sm" onClick={e => e.stopPropagation()}>
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input type="text" placeholder="Search employees..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-red-500/20 outline-none" />
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          <CustomSelect id="branch" value={branchFilter} options={branches.map(b => ({ value: b, label: b }))} onChange={setBranchFilter} />
          <CustomSelect id="dept" value={deptFilter} options={departments.map(d => ({ value: d, label: d }))} onChange={setDeptFilter} />
          <CustomSelect id="status" value={statusFilter} options={statuses} onChange={setStatusFilter} />
        </div>
      </div>

      {/* Table (desktop) + Cards (mobile) */}
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
            <div className="px-6 py-16 text-center text-slate-400 font-bold uppercase text-[10px] tracking-widest">No attendance records found</div>
          ) : (
            <div className="divide-y divide-slate-100">
              {sortedRecords
                .slice((currentPage - 1) * rowsPerPage, currentPage * rowsPerPage)
                .map(row => (
                  <div key={row.id} className="p-4 hover:bg-red-50/30 transition-colors">
                    {/* Header: Name + Status + Edit */}
                    <div className="flex items-start justify-between gap-2 mb-3">
                      <div className="min-w-0 flex-1">
                        <p className="font-bold text-slate-700 text-sm truncate">{row.employeeName}</p>
                        <p className="text-[10px] text-slate-400 font-medium">{row.department} • {row.branchName}</p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className={`font-black text-[10px] uppercase px-2.5 py-1 rounded-full border whitespace-nowrap ${row.status === 'present' ? 'text-emerald-600 bg-emerald-50 border-emerald-100'
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

                    {/* Grid: Clock In/Out + Details */}
                    <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                      <div>
                        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Clock In</p>
                        <p className="font-mono text-green-600 font-bold text-sm">{row.checkIn}</p>
                      </div>
                      <div>
                        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Clock Out</p>
                        <p className="font-mono text-slate-600 font-bold text-sm">{row.checkOut}</p>
                      </div>
                      <div>
                        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Shift</p>
                        {row.shiftCode ? (
                          <span className={`text-[10px] font-black px-2 py-0.5 rounded-md border ${row.isNightShift ? 'bg-purple-100 text-purple-600 border-purple-200' : 'bg-blue-100 text-blue-600 border-blue-200'}`}>
                            {row.shiftCode}
                          </span>
                        ) : (
                          <span className="text-[10px] text-slate-400 italic">No shift</span>
                        )}
                      </div>
                      <div>
                        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Hours</p>
                        <p className="font-mono text-slate-700 font-bold text-sm">{fmtHours(row.totalHours)}</p>
                      </div>
                    </div>

                    {/* Bottom row: Late / OT / UT */}
                    {(row.lateMinutes > 0 || row.overtimeMinutes > 0 || row.undertimeMinutes > 0) && (
                      <div className="flex items-center gap-3 mt-2 pt-2 border-t border-slate-50">
                        {row.lateMinutes > 0 && (
                          <span className="text-[10px] font-bold text-yellow-600 bg-yellow-50 border border-yellow-100 px-2 py-0.5 rounded-full">
                            Late {formatLate(row.lateMinutes)}
                          </span>
                        )}
                        {row.overtimeMinutes > 0 && (
                          <span className="text-[10px] font-bold text-emerald-600">
                            OT +{fmtMins(row.overtimeMinutes)}
                          </span>
                        )}
                        {row.undertimeMinutes > 0 && (
                          <span className="text-[10px] font-bold text-red-500">
                            UT -{fmtMins(row.undertimeMinutes)}
                          </span>
                        )}
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
                <SortableHeader label="Department" sortKey="department" currentSortKey={sortKeyStr} currentSortOrder={sortOrder} onSort={handleSort} className="px-6 py-4" />
                <SortableHeader label="Branch" sortKey="branchName" currentSortKey={sortKeyStr} currentSortOrder={sortOrder} onSort={handleSort} className="px-6 py-4" />
                <SortableHeader label="Shift" sortKey="shiftCode" currentSortKey={sortKeyStr} currentSortOrder={sortOrder} onSort={handleSort} className="px-6 py-4" />
                <SortableHeader label="Clock In" sortKey="checkIn" currentSortKey={sortKeyStr} currentSortOrder={sortOrder} onSort={handleSort} className="px-6 py-4" />
                <SortableHeader label="Clock Out" sortKey="checkOut" currentSortKey={sortKeyStr} currentSortOrder={sortOrder} onSort={handleSort} className="px-6 py-4" />
                <SortableHeader label="Late" sortKey="lateMinutes" currentSortKey={sortKeyStr} currentSortOrder={sortOrder} onSort={handleSort} className="px-6 py-4" />
                <SortableHeader label="Hours" sortKey="totalHours" currentSortKey={sortKeyStr} currentSortOrder={sortOrder} onSort={handleSort} className="px-6 py-4" />
                <SortableHeader label="OT" sortKey="overtimeMinutes" currentSortKey={sortKeyStr} currentSortOrder={sortOrder} onSort={handleSort} className="px-6 py-4" />
                <SortableHeader label="UT" sortKey="undertimeMinutes" currentSortKey={sortKeyStr} currentSortOrder={sortOrder} onSort={handleSort} className="px-6 py-4" />
                <SortableHeader label="Status" sortKey="status" currentSortKey={sortKeyStr} currentSortOrder={sortOrder} onSort={handleSort} className="px-6 py-4 text-center" />
                <th className="px-6 py-4 text-center">Actions</th>
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
                <tr><td colSpan={12} className="px-6 py-16 text-center text-slate-400 font-bold uppercase text-[10px] tracking-widest">No attendance records found</td></tr>
              ) : (
                sortedRecords
                  .slice((currentPage - 1) * rowsPerPage, currentPage * rowsPerPage)
                  .map(row => (
                    <tr key={row.id} className="hover:bg-red-50/40 transition-colors duration-200 group cursor-default">
                      <td className="px-6 py-4">
                        <p className="font-bold text-slate-700">{row.employeeName}</p>
                        <p className="text-[10px] text-slate-400 font-medium">{row.branchName}</p>
                      </td>
                      <td className="px-6 py-4 text-xs font-medium text-slate-500">{row.department}</td>
                      <td className="px-6 py-4 text-xs font-medium text-slate-500">{row.branchName}</td>
                      <td className="px-6 py-4">
                        {row.shiftCode ? (
                          <span className={`text-[10px] font-black px-2.5 py-1 rounded-lg border whitespace-nowrap ${row.isNightShift ? 'bg-purple-100 text-purple-600 border-purple-200' : 'bg-blue-100 text-blue-600 border-blue-200'}`}>
                            {row.shiftCode}
                          </span>
                        ) : (
                          <span className="text-[10px] text-slate-400 font-medium italic">No shift</span>
                        )}
                      </td>
                      <td className={`px-6 py-4 font-mono font-bold text-sm ${
                        row.status === 'late' ? 'text-yellow-600' :
                        row.status === 'present' ? 'text-green-600' :
                        'text-slate-400'
                      }`}>{row.checkIn}</td>
                      <td className="px-6 py-4 font-mono text-slate-600 font-bold text-sm">{row.checkOut}</td>
                      <td className="px-6 py-4 text-center">
                        {row.lateMinutes > 0 ? (
                          <span className="text-[10px] font-black text-yellow-600 bg-yellow-50 border border-yellow-100 px-2.5 py-1 rounded-full whitespace-nowrap">
                            {formatLate(row.lateMinutes)}
                          </span>
                        ) : <span className="text-[10px] text-slate-300 font-black">—</span>}
                      </td>
                      <td className="px-6 py-4 font-mono text-slate-700 font-bold text-sm">{fmtHours(row.totalHours)}</td>
                      <td className="px-6 py-4">
                        <span className={`text-sm font-bold ${row.overtimeMinutes > 0 ? 'text-emerald-600' : 'text-slate-300'}`}>
                          {row.overtimeMinutes > 0 ? `+${fmtMins(row.overtimeMinutes)}` : '—'}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`text-sm font-bold ${row.undertimeMinutes > 0 ? 'text-red-500' : 'text-slate-300'}`}>
                          {row.undertimeMinutes > 0 ? `-${fmtMins(row.undertimeMinutes)}` : '—'}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <span className={`font-black text-[10px] uppercase px-3 py-1 rounded-full border whitespace-nowrap ${row.status === 'present' ? 'text-emerald-600 bg-emerald-50 border-emerald-100'
                            : row.status === 'late' ? 'text-yellow-600 bg-yellow-50 border-yellow-100'
                              : 'text-red-600 bg-red-50 border-red-100'
                          }`}>
                          {row.status === 'present' ? 'On Time' : row.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-center">
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
              <div className="space-y-1">
                <label className="text-[9px] font-black uppercase text-slate-400 tracking-wider">Attendance Status</label>
                <select value={editStatus} onChange={(e) => setEditStatus(e.target.value)}
                  className="w-full p-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 outline-none focus:ring-2 focus:ring-red-500/20">
                  <option value="present">Present</option>
                  <option value="late">Late</option>
                  <option value="absent">Absent</option>
                </select>
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
                <label className="text-[9px] font-black uppercase text-slate-400 tracking-wider">Reason for Adjustment</label>
                <textarea value={editReason} onChange={(e) => setEditReason(e.target.value)}
                  placeholder="e.g., Biometric error, Official business..."
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl h-16 text-xs outline-none focus:ring-2 focus:ring-red-500/20 resize-none" />
              </div>
              <div className="bg-amber-50 border border-amber-100 p-3 rounded-xl flex gap-3 shadow-sm">
                <AlertCircle size={18} className="text-amber-600 shrink-0" />
                <p className="text-[10px] text-amber-800 leading-relaxed font-medium">
                  <strong className="block mb-0.5 tracking-tight uppercase">Audit Log Notice</strong>
                  These changes will be logged under your account for audit purposes.
                </p>
              </div>
            </div>
            <div className="p-5 bg-slate-50 flex gap-3 shrink-0">
              <button onClick={() => setShowCancelModal(true)} className="flex-1 px-4 py-3.5 text-sm font-bold text-slate-500 hover:text-slate-800 transition-colors">Cancel</button>
              <button
                onClick={handleApplyChanges}
                disabled={actionLoading || String(editingLog.id).startsWith('absent-')}
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
        <div className="fixed inset-0 bg-slate-950/40 backdrop-blur-sm z-[150] flex items-center justify-center p-4">
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

      {/* Success toast */}
      {showSuccessToast && (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 bg-slate-800 text-white px-6 py-4 rounded-2xl shadow-2xl flex items-center gap-3 animate-in fade-in slide-in-from-bottom-4 duration-300 z-[110]">
          <span className="text-sm font-bold tracking-tight">Record corrected and logged successfully!</span>
        </div>
      )}
    </div>
  );
}

export default function AttendancePage() {
  return (
    <Suspense fallback={<div className="p-8 text-center font-bold text-slate-400">Loading...</div>}>
      <AttendanceContent />
    </Suspense>
  );
}