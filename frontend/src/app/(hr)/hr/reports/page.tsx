"use client"
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Download, Search, X, AlertTriangle, CalendarSearch, ChevronUp, ChevronDown, ChevronLeft, ChevronRight, Edit2 } from 'lucide-react';
import { useHorizontalDragScroll } from '@/hooks/useHorizontalDragScroll';
import * as XLSX from 'xlsx';
import { useTableSort } from '@/hooks/useTableSort';
import { SortableHeader } from '@/components/ui/SortableHeader';

/* ── Formatters (matching Admin) ────────────────────────────── */
const formatHrsMins = (hrs: number) => {
  if (hrs === 0) return '—';
  const totalMins = Math.round(hrs * 60);
  const h = Math.floor(totalMins / 60);
  const m = totalMins % 60;
  return h > 0 && m > 0 ? `${h}h ${m}m` : h > 0 ? `${h}h` : `${m}m`;
};

const formatLateHrs = (mins: number) => {
  if (mins === 0) return '0m';
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
};

const formatShiftTime = (t: string) => {
  const [h, m] = t.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
};

const formatDateShort = (d: string) => {
  const date = new Date(d + 'T00:00:00');
  return `${String(date.getDate()).padStart(2, '0')}/${String(
    date.getMonth() + 1
  ).padStart(2, '0')}/${date.getFullYear()}`;
};

/* ── Page Component ─────────────────────────────────────────── */
export default function ReportsPage() {
  const [fromDate, setFromDate] = useState(() => {
    const d = new Date(); d.setDate(1);
    return d.toISOString().slice(0, 10);
  });
  const [toDate, setToDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [viewingDetails, setViewingDetails] = useState<any>(null);
  const [logSearchDate, setLogSearchDate] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [deptFilter, setDeptFilter] = useState("all");
  const [branchFilter, setBranchFilter] = useState("all");
  const logDateRef = useRef<HTMLInputElement>(null);
  const dragScrollRef = useHorizontalDragScroll();

  const [currentPage, setCurrentPage] = useState(1);
  const rowsPerPage = 10;

  const [reportData, setReportData] = useState<any[]>([]);
  const [departments, setDepartments] = useState<string[]>([]);
  const [branches, setBranches] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  // Fetch real data from API
  useEffect(() => {
    const fetchReportData = async () => {
      setLoading(true);
      try {
        const [empRes, attRes] = await Promise.all([
          fetch('/api/employees', { credentials: 'include' }),
          fetch(`/api/attendance?startDate=${fromDate}&endDate=${toDate}&limit=10000`, { credentials: 'include' }),
        ]);
        if (empRes.status === 401 || attRes.status === 401) { window.location.href = '/login'; return; }

        const empData = await empRes.json();
        const attData = attRes.ok ? await attRes.json() : { success: false };
        if (!empData.success || !attData.success) { setLoading(false); return; }

        const emps: any[] = empData.employees || empData.data || [];
        const records: any[] = attData.data || [];

        // Filter: only ACTIVE USERs (excludes ADMIN, HR roles)
        const activeEmps = emps.filter((e: any) => e.employmentStatus === 'ACTIVE' && e.role === 'USER');

        // Build department + branch lists from real data
        const deptSet = new Set<string>();
        const branchSet = new Set<string>();
        activeEmps.forEach((e: any) => {
          const dept = e.Department?.name || e.department;
          if (dept) deptSet.add(dept);
          if (e.branch) branchSet.add(e.branch);
        });
        setDepartments(Array.from(deptSet).sort());
        setBranches(Array.from(branchSet).sort());

        // Build per-employee report rows
        const rowMap = new Map<number, any>();
        activeEmps.forEach((e: any) => {
          rowMap.set(e.id, {
            id: e.id,
            zkId: e.zkId ?? 999999,
            name: `${e.firstName} ${e.lastName}`.trim(),
            dept: e.Department?.name || e.department || '—',
            branch: e.branch || '—',
            present: 0,
            late: 0,
            totalHours: 0,
            totalOvertime: 0,
            totalUndertime: 0,
            lateMinutes: 0,
            hasAnomaly: false,
            shift: e.Shift ? {
              name: e.Shift.name,
              startTime: e.Shift.startTime,
              endTime: e.Shift.endTime,
              graceMinutes: e.Shift.graceMinutes ?? 0,
              breakMinutes: e.Shift.breakMinutes ?? 60,
            } : null,
            details: [] as any[],
          });
        });

        // Aggregate attendance records using API-provided metrics directly
        records.forEach((r: any) => {
          const row = rowMap.get(r.employeeId);
          if (!row) return;

          const lateMins = r.lateMinutes ?? 0;
          const otMins = r.overtimeMinutes ?? 0;
          const utMins = r.undertimeMinutes ?? 0;
          const hrs = r.totalHours ?? 0;

          if (lateMins > 0) {
            row.late++;
            row.lateMinutes += lateMins;
          } else {
            row.present++;
          }
          row.totalHours += hrs;
          row.totalOvertime += otMins / 60;
          row.totalUndertime += utMins / 60;
          if (r.isAnomaly) row.hasAnomaly = true;

          // Build detail log entries for View History modal
          const dateStr = r.date ? new Date(r.date).toISOString().slice(0, 10) : '—';
          const shiftCode = r.shiftCode || r.employee?.Shift?.name || '';
          if (lateMins > 0) {
            row.details.push({ date: dateStr, shift: shiftCode, type: 'Late', duration: `${lateMins}m` });
          }
          if (otMins > 0) {
            row.details.push({ date: dateStr, shift: shiftCode, type: 'Overtime', duration: `${(otMins / 60).toFixed(1)}h` });
          }
          if (utMins > 0) {
            row.details.push({ date: dateStr, shift: shiftCode, type: 'Undertime', duration: `${(utMins / 60).toFixed(1)}h` });
          }
        });

        // Finalize rows
        const rows = Array.from(rowMap.values());
        rows.forEach((r: any) => {
          r.totalOvertime = parseFloat(r.totalOvertime.toFixed(2));
          r.totalUndertime = parseFloat(r.totalUndertime.toFixed(2));
        });

        setReportData(rows);
      } catch (err) {
        console.error('Error fetching report data:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchReportData();
  }, [fromDate, toDate]);

  const filteredData = useMemo(() => {
    return reportData
      .filter(emp => {
        const matchesSearch = emp.name.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesDept = deptFilter === "all" || emp.dept === deptFilter;
        const matchesBranch = branchFilter === "all" || emp.branch === branchFilter;
        return matchesSearch && matchesDept && matchesBranch;
      })
      .sort((a, b) => (a.zkId ?? 999999) - (b.zkId ?? 999999));
  }, [reportData, searchQuery, deptFilter, branchFilter]);

  const { sortedData: sortedFilteredData, sortKey, sortOrder, handleSort } = useTableSort({
    initialData: filteredData
  });
  const sortKeyStr = sortKey as string | null;

  const totalPages = Math.ceil(sortedFilteredData.length / rowsPerPage) || 1;
  const paginatedData = sortedFilteredData.slice(
    (currentPage - 1) * rowsPerPage,
    currentPage * rowsPerPage
  );

  // Reset page on filter change
  useEffect(() => { setCurrentPage(1); }, [searchQuery, deptFilter, branchFilter]);

  const getPageNumbers = () => {
    const pages = [];
    const maxVisible = 5;
    let start = Math.max(1, currentPage - Math.floor(maxVisible / 2));
    let end = start + maxVisible - 1;
    if (end > totalPages) { end = totalPages; start = Math.max(1, end - maxVisible + 1); }
    for (let i = start; i <= end; i++) pages.push(i);
    return pages;
  };

  const detailsFiltered = useMemo(() => {
    if (!viewingDetails) return [];
    return viewingDetails.details
      .filter((log: any) => logSearchDate ? log.date === logSearchDate : true)
      .sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [viewingDetails, logSearchDate]);

  const { sortedData: sortedDetails, sortKey: sortKeyDetails, sortOrder: sortOrderDetails, handleSort: handleSortDetails } = useTableSort<any>({
    initialData: detailsFiltered
  });
  const sortKeyDetailsStr = sortKeyDetails as string | null;

  const handleExportIndividual = (emp: any) => {
    const reportInfo = [
      ["INDIVIDUAL ATTENDANCE SUMMARY"],
      ["BITS"],
      [],
      ["Employee Name:", emp.name],
      ["Department:", emp.dept],
      ["Branch:", emp.branch],
      ["Report Range:", `${formatDateShort(fromDate)} - ${formatDateShort(toDate)}`],
      ["Generated At:", new Date().toLocaleString()],
      [],
      ["METRICS OVERVIEW"],
      ["Total Rendered Hours:", emp.totalHours.toFixed(2)],
      ["Overtime Hours:", emp.totalOvertime],
      ["Undertime Hours:", emp.totalUndertime],
      ["Late Count:", emp.late],
      ["Late Duration:", formatLateHrs(emp.lateMinutes)],
      [],
      ["DETAILED LOGS"],
      ["Date", "Shift", "Type", "Duration/Remark"]
    ];

    const logData = emp.details.map((log: any) => [log.date, log.shift, log.type, log.duration]);
    const worksheet = XLSX.utils.aoa_to_sheet([...reportInfo, ...logData]);
    worksheet['!cols'] = [{ wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 20 }];
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Individual Report");
    XLSX.writeFile(workbook, `Attendance_${emp.name.replace(/\s+/g, '_')}.xlsx`);
  };

  const handleExport = () => {
    const reportInfo = [
      ["HR ATTENDANCE REPORT"],
      ["BITS"],
      [],
      ["Report Date Range:", `${formatDateShort(fromDate)} - ${formatDateShort(toDate)}`],
      ["Generated By:", "HR Admin"],
      [],
      ["Employee Records:"],
      ['Employee Name', 'Branch', 'Department', 'Present', 'Late', 'Late Duration', 'Overtime', 'Undertime', 'Hours Worked']
    ];

    const tableData = sortedFilteredData.map(row => [
      row.name,
      row.branch,
      row.dept,
      row.present,
      row.late,
      formatLateHrs(row.lateMinutes),
      formatHrsMins(row.totalOvertime),
      formatHrsMins(row.totalUndertime),
      row.totalHours.toFixed(2),
    ]);

    const worksheet = XLSX.utils.aoa_to_sheet([...reportInfo, ...tableData]);
    worksheet['!cols'] = [
      { wch: 25 }, { wch: 20 }, { wch: 20 }, { wch: 10 },
      { wch: 10 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 15 }
    ];
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Report");
    XLSX.writeFile(workbook, `Attendance Report.xlsx`);
  };

  return (
    <div className="space-y-6 pb-6">

      {/* ── Page Header ──────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl sm:text-3xl font-black text-slate-800">
            Attendance Reports
          </h2>
          <p className="text-slate-400 text-sm mt-0.5">
            Export overall attendance records
          </p>
        </div>
        <button
          onClick={handleExport}
          className="flex items-center gap-2 px-5 py-3 bg-red-600 hover:bg-red-700 text-white font-bold text-sm rounded-xl transition-colors shadow-lg shadow-red-600/20"
        >
          <Download className="w-4 h-4" />
          Attendance Report: {formatDateShort(fromDate)} – {formatDateShort(toDate)}
        </button>
      </div>

      {/* ── Filter Bar (matching Admin) ──────────────────────── */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5">
        <div className="flex flex-col lg:flex-row gap-4">
          <div className="flex-1 min-w-0">
            <label className="text-slate-400 text-[10px] uppercase tracking-widest font-bold block mb-1.5">From</label>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-white text-sm font-medium text-slate-700 focus:ring-2 focus:ring-red-500/20 outline-none transition-all"
            />
          </div>
          <div className="flex-1 min-w-0">
            <label className="text-slate-400 text-[10px] uppercase tracking-widest font-bold block mb-1.5">To</label>
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-white text-sm font-medium text-slate-700 focus:ring-2 focus:ring-red-500/20 outline-none transition-all"
            />
          </div>
          <div className="flex-1 min-w-0">
            <label className="text-slate-400 text-[10px] uppercase tracking-widest font-bold block mb-1.5">Branch</label>
            <select
              value={branchFilter}
              onChange={(e) => setBranchFilter(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-white text-sm font-medium text-slate-700 focus:ring-2 focus:ring-red-500/20 outline-none transition-all appearance-none cursor-pointer"
            >
              <option value="all">All Branches</option>
              {branches.map((b) => <option key={b} value={b}>{b}</option>)}
            </select>
          </div>
          <div className="flex-1 min-w-0">
            <label className="text-slate-400 text-[10px] uppercase tracking-widest font-bold block mb-1.5">Department</label>
            <select
              value={deptFilter}
              onChange={(e) => setDeptFilter(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-white text-sm font-medium text-slate-700 focus:ring-2 focus:ring-red-500/20 outline-none transition-all appearance-none cursor-pointer"
            >
              <option value="all">All Departments</option>
              {departments.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
          <div className="flex-1 min-w-0">
            <label className="text-slate-400 text-[10px] uppercase tracking-widest font-bold block mb-1.5">Search</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300" />
              <input
                placeholder="Search employees..."
                className="w-full pl-10 pr-3 py-2.5 rounded-xl border border-slate-200 bg-white text-sm font-medium text-slate-700 placeholder:text-slate-300 focus:ring-2 focus:ring-red-500/20 outline-none transition-all"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>
        </div>
      </div>

      {/* ── Preview Records Table (matching Admin) ───────────── */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100">
          <h3 className="text-sm font-bold text-slate-700 uppercase tracking-widest">
            Preview Records
          </h3>
        </div>

        <div ref={dragScrollRef} className="overflow-x-auto scrollbar-hide">
          <table className="w-full text-left text-sm min-w-[900px]">
            <thead className="text-slate-400 font-bold uppercase text-[10px] tracking-widest border-b border-slate-100">
              <tr>
                <SortableHeader label="Employee" sortKey="name" currentSortKey={sortKeyStr} currentSortOrder={sortOrder} onSort={handleSort} className="px-6 py-4" />
                <SortableHeader label="Shift" sortKey="shift.name" currentSortKey={sortKeyStr} currentSortOrder={sortOrder} onSort={handleSort} className="px-6 py-4" />
                <SortableHeader label="Present" sortKey="present" currentSortKey={sortKeyStr} currentSortOrder={sortOrder} onSort={handleSort} className="px-6 py-4 text-center items-center justify-center" />
                <SortableHeader label="Late" sortKey="late" currentSortKey={sortKeyStr} currentSortOrder={sortOrder} onSort={handleSort} className="px-6 py-4 text-center items-center justify-center" />
                <SortableHeader label="Overtime" sortKey="totalOvertime" currentSortKey={sortKeyStr} currentSortOrder={sortOrder} onSort={handleSort} className="px-6 py-4 text-center items-center justify-center" />
                <SortableHeader label="Undertime" sortKey="totalUndertime" currentSortKey={sortKeyStr} currentSortOrder={sortOrder} onSort={handleSort} className="px-6 py-4 text-center items-center justify-center" />
                <SortableHeader label="Hours Worked" sortKey="totalHours" currentSortKey={sortKeyStr} currentSortOrder={sortOrder} onSort={handleSort} className="px-6 py-4 text-center items-center justify-center" />
                <th className="px-6 py-4 text-center"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={8} className="px-6 py-12 text-center text-slate-400 font-bold text-xs">
                    Loading report data...
                  </td>
                </tr>
              ) : paginatedData.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-6 py-20 text-center text-slate-400 font-bold uppercase text-xs tracking-widest">
                    No records found
                  </td>
                </tr>
              ) : (
                paginatedData.map((emp) => (
                  <tr key={emp.id} className="hover:bg-red-50/30 transition-colors duration-200">
                    <td className="px-6 py-5">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-800">{emp.name}</span>
                        {emp.hasAnomaly && (
                          <span title="This employee has anomalous check-in records">
                            <AlertTriangle className="w-3.5 h-3.5 text-orange-500 shrink-0" />
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-5">
                      {emp.shift ? (
                        <div>
                          <p className="text-xs font-bold text-slate-700">{emp.shift.name}</p>
                          <p className="text-[10px] text-slate-400 font-medium mt-0.5">
                            {formatShiftTime(emp.shift.startTime)} – {formatShiftTime(emp.shift.endTime)}
                          </p>
                        </div>
                      ) : (
                        <span className="text-[10px] text-slate-300 font-bold italic">No shift</span>
                      )}
                    </td>
                    <td className="px-6 py-5 text-center">
                      <span className="text-sm font-bold text-slate-700">{emp.present}</span>
                    </td>
                    <td className="px-6 py-5 text-center">
                      {emp.lateMinutes > 0 ? (
                        <span className="text-sm font-bold text-yellow-600">{formatLateHrs(emp.lateMinutes)}</span>
                      ) : (
                        <span className="text-sm font-bold text-slate-300">—</span>
                      )}
                    </td>
                    <td className="px-6 py-5 text-center">
                      <span className={`text-sm font-bold ${emp.totalOvertime > 0 ? 'text-blue-600' : 'text-slate-300'}`}>
                        {emp.totalOvertime > 0 ? formatHrsMins(emp.totalOvertime) : '—'}
                      </span>
                    </td>
                    <td className="px-6 py-5 text-center">
                      <span className={`text-sm font-bold ${emp.totalUndertime > 0 ? 'text-red-500' : 'text-slate-300'}`}>
                        {emp.totalUndertime > 0 ? formatHrsMins(emp.totalUndertime) : '—'}
                      </span>
                    </td>
                    <td className="px-6 py-5 text-center">
                      <span className="text-sm font-bold font-mono text-slate-800">{emp.totalHours.toFixed(2)}</span>
                    </td>
                    <td className="px-6 py-5">
                      <button
                        onClick={() => setViewingDetails(emp)}
                        className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-full transition-colors shadow-sm"
                      >
                        View History
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* ── Pagination ──────────────────────────────────────── */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3">
          <span className="text-xs text-slate-400 font-bold">
            Showing {paginatedData.length} of {sortedFilteredData.length} records · Page {currentPage} of {totalPages}
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
              disabled={currentPage === 1}
              className="px-3 py-1.5 rounded-lg text-xs font-bold text-slate-500 hover:bg-white hover:border-slate-200 border border-transparent transition-colors disabled:opacity-30"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            {getPageNumbers().map((page) => (
              <button
                key={page}
                onClick={() => setCurrentPage(page)}
                className={`h-8 w-8 rounded-lg text-xs font-bold transition-colors ${
                  currentPage === page
                    ? 'bg-red-600 text-white'
                    : 'text-slate-500 hover:bg-white hover:border-slate-200 border border-transparent'
                }`}
              >
                {page}
              </button>
            ))}
            <button
              onClick={() => setCurrentPage((prev) => Math.min(prev + 1, totalPages))}
              disabled={currentPage === totalPages}
              className="px-3 py-1.5 rounded-lg text-xs font-bold text-slate-500 hover:bg-white hover:border-slate-200 border border-transparent transition-colors disabled:opacity-30"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* ── Employee Detail Modal ─────────────────────────────── */}
      {viewingDetails && (
        <div className="fixed inset-0 bg-slate-950/40 backdrop-blur-sm z-[100] flex items-center justify-center p-4 animate-in fade-in duration-300">
          <div className="bg-white rounded-[2rem] shadow-2xl w-full max-w-lg overflow-hidden flex flex-col h-[600px] animate-in slide-in-from-bottom-8 ease-out duration-500">
            <div className="p-5 bg-red-600 text-white flex justify-between items-center shrink-0">
              <div className="flex items-center gap-3">
                <Edit2 size={18} />
                <h3 className="font-bold text-lg tracking-tight uppercase">Historical Timeline</h3>
              </div>
              <button onClick={() => { setViewingDetails(null); setLogSearchDate(""); }} className="p-2 hover:bg-red-700 rounded-full transition-colors outline-none"><X size={20} /></button>
            </div>

            <div className="p-8 space-y-6 flex-1 overflow-y-auto">
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                <p className="text-sm font-bold text-slate-800 leading-none">{viewingDetails.name}</p>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mt-1.5">{viewingDetails.dept} • {viewingDetails.branch}</p>
              </div>

              <div className="grid grid-cols-3 md:grid-cols-5 gap-2">
                {[
                  { label: 'Present', val: viewingDetails.present, color: 'text-emerald-600', bg: 'bg-emerald-50' },
                  { label: 'Lates', val: viewingDetails.late, color: 'text-orange-500', bg: 'bg-orange-50' },
                  { label: 'Late Time', val: formatLateHrs(viewingDetails.lateMinutes), color: 'text-orange-600', bg: 'bg-orange-600/10' },
                  { label: 'Overtime', val: viewingDetails.totalOvertime > 0 ? formatHrsMins(viewingDetails.totalOvertime) : '—', color: 'text-blue-600', bg: 'bg-blue-50' },
                  { label: 'Total Hrs', val: viewingDetails.totalHours.toFixed(1), color: 'text-slate-700', bg: 'bg-slate-100' },
                ].map((stat, i) => (
                  <div key={i} className={`${stat.bg} p-2.5 rounded-lg border border-black/5`}>
                    <p className="text-[8px] font-black uppercase text-slate-400 tracking-wider mb-0.5">{stat.label}</p>
                    <p className={`text-xs font-black ${stat.color}`}>{stat.val}</p>
                  </div>
                ))}
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider flex items-center gap-2">Filter Log Timeline</label>
                <div className="relative">
                  <input type="date" ref={logDateRef} value={logSearchDate} onChange={(e) => setLogSearchDate(e.target.value)} className="absolute opacity-0 pointer-events-none" />
                  <button onClick={() => logDateRef.current?.showPicker()} className="w-full flex items-center justify-between px-3 py-2.5 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-700 outline-none shadow-sm hover:border-red-200 transition-all">
                    <span>{logSearchDate ? formatDateShort(logSearchDate) : "Select Date"}</span>
                    <CalendarSearch size={14} className="text-slate-400" />
                  </button>
                  {logSearchDate && (<button onClick={() => setLogSearchDate("")} className="absolute -right-8 top-1/2 -translate-y-1/2 text-slate-400 hover:text-red-500"><X size={12} /></button>)}
                </div>
              </div>

              <div className="border border-slate-100 rounded-xl overflow-hidden shadow-inner">
                <table className="w-full text-center text-[11px] border-collapse bg-white">
                  <thead className="bg-slate-50 text-slate-400 font-black uppercase tracking-widest border-b border-slate-100">
                    <tr>
                      <SortableHeader label="Date" sortKey="date" currentSortKey={sortKeyDetailsStr} currentSortOrder={sortOrderDetails} onSort={handleSortDetails} className="py-3 text-center items-center justify-center" />
                      <SortableHeader label="Shift" sortKey="shift" currentSortKey={sortKeyDetailsStr} currentSortOrder={sortOrderDetails} onSort={handleSortDetails} className="py-3 text-center items-center justify-center" />
                      <SortableHeader label="Type" sortKey="type" currentSortKey={sortKeyDetailsStr} currentSortOrder={sortOrderDetails} onSort={handleSortDetails} className="py-3 text-center items-center justify-center" />
                      <SortableHeader label="Duration" sortKey="duration" currentSortKey={sortKeyDetailsStr} currentSortOrder={sortOrderDetails} onSort={handleSortDetails} className="py-3 text-center items-center justify-center" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {sortedDetails.length > 0 ? sortedDetails.map((detail: any, idx: number) => (
                      <tr key={idx} className="hover:bg-slate-50 transition-colors">
                        <td className="py-2.5 text-slate-500 font-medium">{detail.date}</td>
                        <td className="py-2.5 font-bold text-slate-700">{detail.shift || "-"}</td>
                        <td className="py-2.5 font-bold uppercase text-slate-700">{detail.type}</td>
                        <td className="py-2.5 font-bold text-slate-700 font-mono">{detail.duration}</td>
                      </tr>
                    )) : (
                      <tr><td colSpan={4} className="py-10 uppercase font-black text-slate-300 tracking-widest text-[10px]">No logs found</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="p-6 bg-slate-50 border-t border-slate-100 flex gap-4 shrink-0">
              <button onClick={() => setViewingDetails(null)} className="flex-1 px-4 py-4 text-sm font-bold text-slate-500 hover:text-slate-800 transition-colors uppercase tracking-widest outline-none">Close History</button>
              <button onClick={() => handleExportIndividual(viewingDetails)} className="flex-1 px-4 py-4 bg-red-600 text-white rounded-xl text-sm font-black shadow-lg hover:bg-red-700 transition-all uppercase tracking-widest active:scale-95 outline-none flex items-center justify-center gap-2">
                <Download size={16} /> Export Detailed
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}