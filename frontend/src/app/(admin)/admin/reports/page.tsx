  "use client"
import React, { useState, useEffect } from 'react';
import {
  Download,
  Calendar,
  Search,
  ChevronRight,
  ChevronLeft,
  X as XIcon,
  AlertTriangle,
  Clock,
} from 'lucide-react';
import * as XLSX from 'xlsx';

// Types matching backend response
type EmployeeShift = {
  id: number
  name: string
  startTime: string    // e.g. "08:00"
  endTime: string
  graceMinutes: number
}

type AttendanceRecord = {
  id: number
  employeeId: number
  date: string
  checkInTime: string
  checkOutTime: string | null
  status: string
  employee: {
    id: number
    firstName: string
    lastName: string
    department: string | null
    Department?: { name: string } | null
    branch: string | null
    Shift?: EmployeeShift | null
  }
}

type ReportRow = {
  id: number
  name: string
  department: string
  branch: string
  totalDays: number
  present: number
  leave: number
  late: number
  lateMinutes: number
  absent: number
  overtime: number
  undertime: number
  totalHours: number
  shift: EmployeeShift | null
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Returns late minutes vs shift threshold (negative = early, positive = late) */
const getLateByMins = (checkIn: Date, shift: EmployeeShift | null, recordDate: Date): number => {
  let thresholdMs: number;
  if (shift) {
    const [h, m] = shift.startTime.split(':').map(Number);
    const graceMins = shift.graceMinutes ?? 0;
    const dateMs = recordDate.getTime() + 8 * 60 * 60 * 1000;
    const shiftStartMs = dateMs + (h * 60 + m) * 60 * 1000 - 8 * 60 * 60 * 1000;
    thresholdMs = shiftStartMs + graceMins * 60 * 1000;
  } else {
    const checkInPHT = new Date(checkIn.getTime() + 8 * 60 * 60 * 1000);
    thresholdMs = new Date(checkInPHT).setUTCHours(8, 0, 0, 0) - 8 * 60 * 60 * 1000;
  }
  return Math.round((checkIn.getTime() - thresholdMs) / 60000);
};

/**
 * Determine the status label for a single attendance record.
 * Returns 'anomaly' | 'late' | 'on-time'
 *
 * "Anomaly" = employee tapped in MORE THAN 4 hours away from their expected shift start
 * (either extremely early or extremely late — indicates they tapped on the wrong day/shift)
 */
const getRecordStatus = (
  checkIn: Date,
  shift: EmployeeShift | null,
  recordDate: Date,
  dbStatus: string
): 'anomaly' | 'late' | 'on-time' => {
  const ANOMALY_THRESHOLD_MINS = 4 * 60; // 4 hours

  if (shift) {
    const [h, m] = shift.startTime.split(':').map(Number);
    const dateMs = recordDate.getTime() + 8 * 60 * 60 * 1000;
    const shiftStartMs = dateMs + (h * 60 + m) * 60 * 1000 - 8 * 60 * 60 * 1000;
    const diffMins = Math.abs(Math.round((checkIn.getTime() - shiftStartMs) / 60000));
    if (diffMins > ANOMALY_THRESHOLD_MINS) return 'anomaly';
  }

  const lateMins = getLateByMins(checkIn, shift, recordDate);
  if (dbStatus === 'late' || lateMins > 0) return 'late';
  return 'on-time';
};

const formatLateHrs = (mins: number) => {
  if (mins === 0) return '0m';
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
};

const formatDateShort = (d: string) => {
  const date = new Date(d + 'T00:00:00');
  return `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()}`;
};

const formatShiftTime = (t: string) => {
  // "08:00" → "8:00 AM", "22:00" → "10:00 PM"
  const [h, m] = t.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
};

// ─── Component ───────────────────────────────────────────────────────────────

export default function ReportsPage() {
  const [reportData, setReportData] = useState<ReportRow[]>([]);
  const [allRecords, setAllRecords] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedDept, setSelectedDept] = useState('all');
  const [selectedBranch, setSelectedBranch] = useState('all');

  // Default to current month — use PHT (Asia/Manila) so the date doesn't shift to the previous day
  const [startDate, setStartDate] = useState(() => {
    const now = new Date();
    const phtNow = now.toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' }); // 'en-CA' gives YYYY-MM-DD
    const [y, m] = phtNow.split('-');
    return `${y}-${m}-01`; // First day of current month in PHT
  });
  const [endDate, setEndDate] = useState(
    () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' })
  );

  const [currentPage, setCurrentPage] = useState(1);
  const rowsPerPage = 10;

  const [selectedEmployee, setSelectedEmployee] = useState<ReportRow | null>(null);

  const departments = Array.from(new Set(reportData.map(e => e.department).filter(Boolean)));
  const branches = Array.from(new Set(reportData.map(e => e.branch).filter(Boolean)));

  const fetchReportData = async () => {
    setLoading(true);
    try {
      const [empRes, attRes] = await Promise.all([
        fetch('/api/employees', { credentials: 'include' }),
        fetch(`/api/attendance?startDate=${startDate}&endDate=${endDate}&limit=10000`, { credentials: 'include' })
      ]);

      if (empRes.status === 401 || attRes.status === 401) {
        window.location.href = '/login';
        return;
      }

      const empData = await empRes.json();
      const attData = attRes.ok ? await attRes.json() : { success: false };

      if (!empData.success) {
        console.error('Failed to fetch employees');
        setLoading(false);
        return;
      }

      const emps: any[] = empData.employees || empData.data || [];
      const records: AttendanceRecord[] = attData.success ? (attData.data || []) : [];

      // Store raw records for the individual employee modal
      setAllRecords(records);

      // Build per-employee report rows
      const activeEmps = emps.filter((e: any) => e.employmentStatus === 'ACTIVE' && e.role === 'USER');
      const rowMap = new Map<number, ReportRow>();

      activeEmps.forEach((e: any) => {
        rowMap.set(e.id, {
          id: e.id,
          name: `${e.firstName} ${e.lastName}`.trim(),
          department: e.Department?.name || e.department || '—',
          branch: e.branch || '—',
          totalDays: 0,
          present: 0,
          leave: 0,
          late: 0,
          lateMinutes: 0,
          absent: 0,
          overtime: 0,
          undertime: 0,
          totalHours: 0,
          shift: e.Shift ? { id: e.Shift.id, name: e.Shift.name, startTime: e.Shift.startTime, endTime: e.Shift.endTime, graceMinutes: e.Shift.graceMinutes ?? 0 } : null,
        });
      });

      records.forEach((r) => {
        const row = rowMap.get(r.employeeId);
        if (!row) return;
        row.totalDays++;
        const checkIn = new Date(r.checkInTime);
        const recordDate = new Date(r.date);
        const lateMins = getLateByMins(checkIn, row.shift, recordDate);
        if (lateMins > 0) { row.late++; row.lateMinutes += lateMins; }
        else row.present++;

        if (r.checkOutTime) {
          const checkOut = new Date(r.checkOutTime);
          const hrs = (checkOut.getTime() - checkIn.getTime()) / 3600000;
          row.totalHours += hrs;
          if (hrs > 8) row.overtime += Math.round(hrs - 8);
          else if (hrs < 8) row.undertime += Math.round(8 - hrs);
        }
      });

      setReportData(Array.from(rowMap.values()));
    } catch (error) {
      console.error('Error fetching report data:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchReportData(); }, [startDate, endDate]);

  const getEmployeeRecords = (employeeId: number) =>
    allRecords
      .filter(r => r.employeeId === employeeId)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  /** Does this employee have at least one anomaly record? */
  const hasAnomalyRecords = (emp: ReportRow): boolean => {
    const records = getEmployeeRecords(emp.id);
    return records.some(r => {
      const checkIn = new Date(r.checkInTime);
      const recordDate = new Date(r.date);
      return getRecordStatus(checkIn, emp.shift, recordDate, r.status) === 'anomaly';
    });
  };

  const filteredData = reportData.filter(emp => {
    const matchesSearch = emp.name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesDept = selectedDept === 'all' || emp.department === selectedDept;
    const matchesBranch = selectedBranch === 'all' || emp.branch === selectedBranch;
    return matchesSearch && matchesDept && matchesBranch;
  });

  const totalPages = Math.ceil(filteredData.length / rowsPerPage) || 1;
  const paginatedData = filteredData.slice(
    (currentPage - 1) * rowsPerPage,
    currentPage * rowsPerPage
  );

  // ─── Export handlers ────────────────────────────────────────────────────────

  const handleExport = () => {
    const allRows: (string | number)[][] = [];
    const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'];
    const s = new Date(startDate + 'T00:00:00');
    const e = new Date(endDate + 'T00:00:00');
    const fmtFullDate = (d: Date) => `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;

    allRows.push(['Period', `${fmtFullDate(s)} to ${fmtFullDate(e)}`]);
    allRows.push(['Total Employees', filteredData.length]);
    allRows.push([]);

    allRows.push(['Employee', 'Shift', 'Leave', 'Absents', 'Late (Days)', 'Late (Duration)', 'Overtime', 'Undertime', 'Total (Hrs)']);
    filteredData.forEach(e => {
      const shiftLabel = e.shift ? `${e.shift.name} (${formatShiftTime(e.shift.startTime)}–${formatShiftTime(e.shift.endTime)})` : 'No Shift';
      allRows.push([e.name, shiftLabel, e.leave, e.absent, e.late, formatLateHrs(e.lateMinutes), `+${e.overtime}h`, `-${e.undertime}h`, e.totalHours.toFixed(2)]);
    });

    const worksheet = XLSX.utils.aoa_to_sheet(allRows);
    worksheet['!cols'] = [{ wch: 25 }, { wch: 25 }, { wch: 10 }, { wch: 10 }, { wch: 12 }, { wch: 15 }, { wch: 12 }, { wch: 12 }, { wch: 12 }];
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Report');
    XLSX.writeFile(workbook, `Attendance_Report_${formatDateShort(startDate)}_${formatDateShort(endDate)}.xlsx`);
  };

  const handleExportIndividual = (emp: ReportRow) => {
    const records = getEmployeeRecords(emp.id);
    const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'];
    const fmtFullDate = (d: Date) => `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;

    const allRows: (string | number)[][] = [];
    allRows.push(['Employee', emp.name, '', 'Branch', emp.branch]);
    allRows.push(['Department', emp.department]);
    allRows.push(['Shift', emp.shift ? `${emp.shift.name} · ${formatShiftTime(emp.shift.startTime)}–${formatShiftTime(emp.shift.endTime)}` : 'No shift assigned']);
    allRows.push([]);

    allRows.push(['RATE', 'PRESENT', 'LATE DAYS', 'LATE TOTAL', 'ABSENT', 'TOTAL HOURS']);
    const rate = emp.totalDays > 0 ? Math.round((emp.present / emp.totalDays) * 100) : 0;
    allRows.push([`${rate}%`, emp.present, emp.late, formatLateHrs(emp.lateMinutes), emp.absent, emp.totalHours.toFixed(2)]);
    allRows.push([]);

    const s = new Date(startDate + 'T00:00:00');
    const e = new Date(endDate + 'T00:00:00');
    allRows.push(['Period', `${fmtFullDate(s)} — ${fmtFullDate(e)}`]);
    allRows.push([]);

    allRows.push(['Date', 'Day', 'Check In', 'Check Out', 'Hours', 'Status', 'Late By / Note']);
    records.forEach(r => {
      const checkIn = new Date(r.checkInTime);
      const checkOut = r.checkOutTime ? new Date(r.checkOutTime) : null;
      const hoursWorked = checkOut ? ((checkOut.getTime() - checkIn.getTime()) / (1000 * 60 * 60)).toFixed(2) : '—';
      const recordDate = new Date(r.date);
      const statusLabel = getRecordStatus(checkIn, emp.shift, recordDate, r.status);
      const lateMins = getLateByMins(checkIn, emp.shift, recordDate);
      allRows.push([
        fmtFullDate(new Date(r.checkInTime)),
        DAYS[new Date(r.checkInTime).getDay()],
        checkIn.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
        checkOut ? checkOut.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : '—',
        hoursWorked,
        statusLabel === 'anomaly' ? 'ANOMALY – Out of Shift' : statusLabel === 'late' ? 'Late' : 'On Time',
        statusLabel === 'anomaly' ? 'Check-in is >4h from expected shift start' : statusLabel === 'late' ? formatLateHrs(lateMins) : '—'
      ]);
    });

    allRows.push([]);
    allRows.push([`${records.length} record${records.length !== 1 ? 's' : ''} · ${emp.totalDays} working days`]);

    const worksheet = XLSX.utils.aoa_to_sheet(allRows);
    worksheet['!cols'] = [{ wch: 18 }, { wch: 15 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 22 }, { wch: 30 }];
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Attendance');
    XLSX.writeFile(workbook, `Report_${emp.name.replace(/\s+/g, '_')}_${startDate}_to_${endDate}.xlsx`);
  };

  // ─── Modal data ─────────────────────────────────────────────────────────────

  const empRecords = selectedEmployee ? getEmployeeRecords(selectedEmployee.id) : [];
  const attendanceRate = selectedEmployee && selectedEmployee.totalDays > 0
    ? Math.round((selectedEmployee.present / selectedEmployee.totalDays) * 100) : 0;

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">

      {/* ── Individual Employee Report Modal ──────────────────────────────────── */}
      {selectedEmployee && (
        <div className="fixed inset-0 bg-slate-950/40 backdrop-blur-sm z-100 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-3xl overflow-hidden flex flex-col max-h-[90vh]">

            {/* Modal Header */}
            <div className="p-5 bg-red-600 text-white flex justify-between items-center shrink-0">
              <div>
                <h3 className="font-bold text-lg leading-tight tracking-tight">{selectedEmployee.name}</h3>
                <p className="text-[10px] text-red-100 opacity-90 uppercase font-black tracking-widest mt-0.5">
                  {selectedEmployee.department} · {selectedEmployee.branch}
                </p>
                {/* ① SHIFT BADGE in modal header */}
                {selectedEmployee.shift ? (
                  <div className="flex items-center gap-1.5 mt-1.5">
                    <Clock className="w-3 h-3 text-red-200" />
                    <span className="text-[10px] text-red-100 font-bold">
                      {selectedEmployee.shift.name} · {formatShiftTime(selectedEmployee.shift.startTime)} – {formatShiftTime(selectedEmployee.shift.endTime)}
                    </span>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 mt-1.5">
                    <Clock className="w-3 h-3 text-red-200" />
                    <span className="text-[10px] text-red-200 font-bold italic">No shift assigned (default 8AM)</span>
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleExportIndividual(selectedEmployee)}
                  className="flex items-center gap-1.5 px-3 py-2 bg-white/20 hover:bg-white/30 text-white rounded-xl text-xs font-bold transition-colors"
                >
                  <Download className="w-3.5 h-3.5" />
                  Export
                </button>
                <button onClick={() => setSelectedEmployee(null)} className="text-white/80 hover:text-white transition-colors">
                  <XIcon className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Anomaly warning banner — shown if any records are flagged */}
            {empRecords.some(r => getRecordStatus(new Date(r.checkInTime), selectedEmployee.shift, new Date(r.date), r.status) === 'anomaly') && (
              <div className="flex items-center gap-3 px-5 py-2.5 bg-orange-50 border-b border-orange-100">
                <AlertTriangle className="w-4 h-4 text-orange-500 shrink-0" />
                <p className="text-xs font-bold text-orange-700">
                  This employee has check-ins that are more than 4 hours outside their assigned shift time. These are flagged as <strong>Anomaly</strong> and may require HR review.
                </p>
              </div>
            )}

            {/* Modal Body */}
            <div className="overflow-y-auto flex-1 min-h-0">
              {/* Summary Stats */}
              <div className="grid grid-cols-6 divide-x divide-slate-100 border-b border-slate-100">
                {[
                  { label: 'Rate', value: `${attendanceRate}%`, color: 'text-slate-800' },
                  { label: 'Present', value: selectedEmployee.present, color: 'text-green-500' },
                  { label: 'Late Days', value: selectedEmployee.late, color: 'text-yellow-500' },
                  { label: 'Late Total', value: formatLateHrs(selectedEmployee.lateMinutes), color: 'text-yellow-500', small: true },
                  { label: 'Absent', value: selectedEmployee.absent, color: 'text-red-500' },
                  { label: 'Hours', value: selectedEmployee.totalHours.toFixed(1), color: 'text-slate-800' },
                ].map((s, i) => (
                  <div key={i} className="p-4 text-center">
                    <p className="text-[9px] font-black uppercase text-slate-400 tracking-widest">{s.label}</p>
                    <p className={`${s.small ? 'text-base' : 'text-xl'} font-black ${s.color} mt-1`}>{s.value}</p>
                  </div>
                ))}
              </div>

              {/* Date range */}
              <div className="flex items-center gap-2 px-5 py-3 bg-slate-50 border-b border-slate-100">
                <Calendar className="w-3.5 h-3.5 text-slate-400" />
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                  {new Date(startDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} — {new Date(endDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                </span>
              </div>

              {/* Daily Attendance Table */}
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-slate-400 font-bold uppercase text-[10px] tracking-widest border-b border-slate-100 sticky top-0">
                  <tr>
                    <th className="px-5 py-3">Date</th>
                    <th className="px-5 py-3">Check In</th>
                    <th className="px-5 py-3">Check Out</th>
                    <th className="px-5 py-3">Hours</th>
                    <th className="px-5 py-3">Status</th>
                    <th className="px-5 py-3">Late By</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {empRecords.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-5 py-16 text-center text-slate-400 font-bold uppercase text-xs tracking-widest">
                        No attendance records found
                      </td>
                    </tr>
                  ) : (
                    empRecords.map((record) => {
                      const checkIn = new Date(record.checkInTime);
                      const checkOut = record.checkOutTime ? new Date(record.checkOutTime) : null;
                      const hoursWorked = checkOut ? ((checkOut.getTime() - checkIn.getTime()) / (1000 * 60 * 60)) : 0;
                      const recordDate = new Date(record.date);
                      const statusType = getRecordStatus(checkIn, selectedEmployee.shift, recordDate, record.status);
                      const lateMins = getLateByMins(checkIn, selectedEmployee.shift, recordDate);

                      // ② Row highlight for anomaly
                      const rowBg = statusType === 'anomaly'
                        ? 'bg-orange-50/60 hover:bg-orange-50'
                        : 'hover:bg-red-50/50';

                      return (
                        <tr key={record.id} className={`transition-colors duration-200 ${rowBg}`}>
                          <td className="px-5 py-3.5">
                            <p className="font-bold text-slate-700 text-xs">
                              {new Date(record.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                            </p>
                          </td>
                          <td className="px-5 py-3.5">
                            <span className="text-xs font-bold text-slate-700">
                              {checkIn.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </td>
                          <td className="px-5 py-3.5">
                            <span className="text-xs font-bold text-slate-700">
                              {checkOut ? checkOut.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : '—'}
                            </span>
                          </td>
                          <td className="px-5 py-3.5">
                            <span className="text-xs font-bold text-slate-600">
                              {hoursWorked > 0 ? `${hoursWorked.toFixed(2)}` : '—'}
                            </span>
                          </td>
                          <td className="px-5 py-3.5">
                            {statusType === 'anomaly' ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider bg-orange-100 text-orange-700 border border-orange-200">
                                <AlertTriangle className="w-3 h-3" />
                                Anomaly
                              </span>
                            ) : statusType === 'late' ? (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider bg-yellow-50 text-yellow-600 border border-yellow-200">
                                Late
                              </span>
                            ) : (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider bg-green-50 text-green-600 border border-green-200">
                                On Time
                              </span>
                            )}
                          </td>
                          <td className="px-5 py-3.5">
                            {statusType === 'anomaly' ? (
                              <span className="text-[10px] font-bold text-orange-600">Out of shift window</span>
                            ) : statusType === 'late' ? (
                              <span className="text-xs font-bold text-yellow-600">{formatLateHrs(lateMins > 0 ? lateMins : 0)}</span>
                            ) : (
                              <span className="text-xs font-bold text-slate-300">—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Modal Footer */}
            <div className="p-4 bg-slate-50 border-t border-slate-100 shrink-0">
              <span className="text-[10px] text-slate-400 font-bold">
                {empRecords.length} record{empRecords.length !== 1 ? 's' : ''} · {selectedEmployee.totalDays} working days
              </span>
            </div>
          </div>
        </div>
      )}

      {/* ── Page Header ───────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl sm:text-3xl font-black text-slate-800">Attendance Reports</h2>
          <p className="text-slate-400 text-sm mt-0.5">Export overall attendance records</p>
        </div>
        <button
          onClick={handleExport}
          className="flex items-center gap-2 px-5 py-3 bg-red-600 hover:bg-red-700 text-white font-bold text-sm rounded-xl transition-colors shadow-lg shadow-red-600/20"
        >
          <Download className="w-4 h-4" />
          Attendance Report: {formatDateShort(startDate)} – {formatDateShort(endDate)}
        </button>
      </div>

      {/* ── Filter Bar ────────────────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5">
        <div className="flex flex-col lg:flex-row gap-4">
          <div className="flex-1 min-w-0">
            <label className="text-slate-400 text-[10px] uppercase tracking-widest font-bold block mb-1.5">From</label>
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-white text-sm font-medium text-slate-700 focus:ring-2 focus:ring-red-500/20 outline-none transition-all" />
          </div>
          <div className="flex-1 min-w-0">
            <label className="text-slate-400 text-[10px] uppercase tracking-widest font-bold block mb-1.5">To</label>
            <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-white text-sm font-medium text-slate-700 focus:ring-2 focus:ring-red-500/20 outline-none transition-all" />
          </div>
          <div className="flex-1 min-w-0">
            <label className="text-slate-400 text-[10px] uppercase tracking-widest font-bold block mb-1.5">Branch</label>
            <select value={selectedBranch} onChange={(e) => { setSelectedBranch(e.target.value); setCurrentPage(1); }}
              className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-white text-sm font-medium text-slate-700 focus:ring-2 focus:ring-red-500/20 outline-none transition-all appearance-none cursor-pointer">
              <option value="all">All Branches</option>
              {branches.map(b => <option key={b} value={b}>{b}</option>)}
            </select>
          </div>
          <div className="flex-1 min-w-0">
            <label className="text-slate-400 text-[10px] uppercase tracking-widest font-bold block mb-1.5">Department</label>
            <select value={selectedDept} onChange={(e) => { setSelectedDept(e.target.value); setCurrentPage(1); }}
              className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-white text-sm font-medium text-slate-700 focus:ring-2 focus:ring-red-500/20 outline-none transition-all appearance-none cursor-pointer">
              <option value="all">All Departments</option>
              {departments.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
          <div className="flex-1 min-w-0">
            <label className="text-slate-400 text-[10px] uppercase tracking-widest font-bold block mb-1.5">Search</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300" />
              <input placeholder="Search employees..."
                className="w-full pl-10 pr-3 py-2.5 rounded-xl border border-slate-200 bg-white text-sm font-medium text-slate-700 placeholder:text-slate-300 focus:ring-2 focus:ring-red-500/20 outline-none transition-all"
                value={searchTerm} onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }} />
            </div>
          </div>
        </div>
      </div>

      {/* ── Preview Records Table ─────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100">
          <h3 className="text-sm font-bold text-slate-700 uppercase tracking-widest">Preview Records</h3>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-slate-400 font-bold uppercase text-[10px] tracking-widest border-b border-slate-100">
              <tr>
                {/* ① SHIFT column */}
                <th className="px-6 py-4">Employee</th>
                <th className="px-6 py-4">Shift</th>
                <th className="px-6 py-4 text-center">Leave</th>
                <th className="px-6 py-4 text-center">Absents</th>
                <th className="px-6 py-4 text-center">Late (Days)</th>
                <th className="px-6 py-4 text-center">Late (Hrs)</th>
                <th className="px-6 py-4 text-center">Overtime</th>
                <th className="px-6 py-4 text-center">Undertime</th>
                <th className="px-6 py-4 text-center">Total (Hrs)</th>
                <th className="px-6 py-4 text-center"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr><td colSpan={10} className="px-6 py-12 text-center text-slate-400 font-bold text-xs">Loading report data...</td></tr>
              ) : paginatedData.length === 0 ? (
                <tr><td colSpan={10} className="px-6 py-20 text-center text-slate-400 font-bold uppercase text-xs tracking-widest">No records found</td></tr>
              ) : (
                paginatedData.map((employee) => {
                  const hasAnomaly = hasAnomalyRecords(employee);
                  return (
                    <tr key={employee.id} className="hover:bg-red-50/30 transition-colors duration-200">
                      <td className="px-6 py-5">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-slate-800">{employee.name}</span>
                          {/* ② Anomaly warning icon on employee name */}
                          {hasAnomaly && (
                            <span title="This employee has anomalous check-in records">
                              <AlertTriangle className="w-3.5 h-3.5 text-orange-500 shrink-0" />
                            </span>
                          )}
                        </div>
                      </td>
                      {/* ① Shift cell */}
                      <td className="px-6 py-5">
                        {employee.shift ? (
                          <div>
                            <p className="text-xs font-bold text-slate-700">{employee.shift.name}</p>
                            <p className="text-[10px] text-slate-400 font-medium mt-0.5">
                              {formatShiftTime(employee.shift.startTime)} – {formatShiftTime(employee.shift.endTime)}
                            </p>
                          </div>
                        ) : (
                          <span className="text-[10px] text-slate-300 font-bold italic">No shift</span>
                        )}
                      </td>
                      <td className="px-6 py-5 text-center"><span className="text-sm font-medium text-slate-700">{employee.leave}</span></td>
                      <td className="px-6 py-5 text-center">
                        <span className={`text-sm font-bold ${employee.absent > 0 ? 'text-red-500' : 'text-slate-700'}`}>{employee.absent}</span>
                      </td>
                      <td className="px-6 py-5 text-center">
                        <span className={`text-sm font-bold ${employee.late > 0 ? 'text-yellow-600' : 'text-slate-700'}`}>{employee.late}</span>
                      </td>
                      <td className="px-6 py-5 text-center">
                        <span className={`text-sm font-bold ${employee.lateMinutes > 0 ? 'text-yellow-600' : 'text-slate-700'}`}>{formatLateHrs(employee.lateMinutes)}</span>
                      </td>
                      <td className="px-6 py-5 text-center">
                        <span className={`text-sm font-bold ${employee.overtime > 0 ? 'text-blue-600' : 'text-slate-700'}`}>+{employee.overtime}h</span>
                      </td>
                      <td className="px-6 py-5 text-center">
                        <span className={`text-sm font-bold ${employee.undertime > 0 ? 'text-red-500' : 'text-slate-700'}`}>-{employee.undertime}h</span>
                      </td>
                      <td className="px-6 py-5 text-center">
                        <span className="text-sm font-bold font-mono text-slate-800">{employee.totalHours.toFixed(2)}</span>
                      </td>
                      <td className="px-6 py-5">
                        <button
                          onClick={() => setSelectedEmployee(employee)}
                          className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-full transition-colors shadow-sm"
                        >
                          View History
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
          <span className="text-xs text-slate-400 font-bold">
            Showing {paginatedData.length} of {filteredData.length} records · Page {currentPage} of {totalPages}
          </span>
          <div className="flex items-center gap-1">
            <button onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))} disabled={currentPage === 1}
              className="px-3 py-1.5 rounded-lg text-xs font-bold text-slate-500 hover:bg-white hover:border-slate-200 border border-transparent transition-colors disabled:opacity-30">
              <ChevronLeft className="w-4 h-4" />
            </button>
            {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => i + 1).map(page => (
              <button key={page} onClick={() => setCurrentPage(page)}
                className={`h-8 w-8 rounded-lg text-xs font-bold transition-colors ${currentPage === page ? 'bg-red-600 text-white' : 'text-slate-500 hover:bg-white hover:border-slate-200 border border-transparent'}`}>
                {page}
              </button>
            ))}
            <button onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))} disabled={currentPage === totalPages}
              className="px-3 py-1.5 rounded-lg text-xs font-bold text-slate-500 hover:bg-white hover:border-slate-200 border border-transparent transition-colors disabled:opacity-30">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
