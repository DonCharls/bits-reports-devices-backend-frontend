"use client"
import React, { useState, useEffect } from 'react';
import {
  Download,
  Calendar,
  Search,
  ChevronRight,
  FileText,
  ChevronLeft,
  X as XIcon,
  Eye,
} from 'lucide-react';

// Types matching backend response
type Employee = {
  id: number
  firstName: string
  lastName: string
  role?: string
  department: string | null
  Department?: { name: string } | null
  branch: string | null
  position: string | null
  employmentStatus: string
}

type AttendanceRecord = {
  id: number
  employeeId: number
  date: string
  checkInTime: string
  checkOutTime: string | null
  status: string
  employee: Employee
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
  absent: number
  overtime: number
  undertime: number
  totalHours: number
}

export default function ReportsPage() {
  const [reportData, setReportData] = useState<ReportRow[]>([]);
  const [allRecords, setAllRecords] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedDept, setSelectedDept] = useState('all');
  const [selectedBranch, setSelectedBranch] = useState('all');

  // Default to current month
  const now = new Date();
  const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
  const [startDate, setStartDate] = useState(firstDay.toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(now.toISOString().split('T')[0]);

  const [currentPage, setCurrentPage] = useState(1);
  const rowsPerPage = 10;

  // Individual employee report
  const [selectedEmployee, setSelectedEmployee] = useState<ReportRow | null>(null);

  // Derive filter options from data
  const departments = Array.from(new Set(reportData.map(e => e.department).filter(Boolean)));
  const branches = Array.from(new Set(reportData.map(e => e.branch).filter(Boolean)));

  // Fetch report data
  const fetchReportData = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const headers = { 'Authorization': `Bearer ${token}` };

      const [empRes, attRes] = await Promise.all([
        fetch('/api/employees', { headers }),
        fetch(`/api/attendance?startDate=${startDate}&endDate=${endDate}&limit=10000`, { headers })
      ]);

      if (empRes.status === 401 || attRes.status === 401) {
        localStorage.removeItem('token');
        window.location.href = '/login';
        return;
      }

      const empData = await empRes.json();
      const attData = await attRes.json();

      if (!empData.success || !attData.success) {
        console.error('Failed to fetch data:', empData.message, attData.message);
        setLoading(false);
        return;
      }

      const employees: Employee[] = empData.employees;
      const records: AttendanceRecord[] = attData.data;

      // Calculate working days in the date range (weekdays only)
      const start = new Date(startDate + 'T00:00:00');
      const end = new Date(endDate + 'T00:00:00');
      let totalWorkingDays = 0;
      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        const day = d.getDay();
        if (day !== 0 && day !== 6) totalWorkingDays++;
      }

      // Group attendance records by employeeId
      const attendanceByEmployee = new Map<number, AttendanceRecord[]>();
      records.forEach((rec: AttendanceRecord) => {
        const existing = attendanceByEmployee.get(rec.employeeId) || [];
        existing.push(rec);
        attendanceByEmployee.set(rec.employeeId, existing);
      });

      // Standard work hours: 8 hours per day
      const STANDARD_HOURS = 8;

      // Build report rows
      const rows: ReportRow[] = employees
        .filter((emp: Employee) => emp.employmentStatus === 'ACTIVE' && (!emp.role || emp.role === 'USER'))
        .map((emp: Employee) => {
          const empRecords = attendanceByEmployee.get(emp.id) || [];

          let present = 0;
          let late = 0;
          let totalHours = 0;
          let overtimeHours = 0;
          let undertimeHours = 0;

          empRecords.forEach((rec: AttendanceRecord) => {
            const isLate = rec.status === 'late' || new Date(rec.checkInTime).getHours() >= 9;
            if (isLate) late++;
            present++;

            // Calculate hours worked
            if (rec.checkOutTime) {
              const checkIn = new Date(rec.checkInTime).getTime();
              const checkOut = new Date(rec.checkOutTime).getTime();
              const hoursWorked = (checkOut - checkIn) / (1000 * 60 * 60);
              totalHours += hoursWorked;

              if (hoursWorked > STANDARD_HOURS) {
                overtimeHours += hoursWorked - STANDARD_HOURS;
              } else if (hoursWorked < STANDARD_HOURS) {
                undertimeHours += STANDARD_HOURS - hoursWorked;
              }
            }
          });

          const absent = Math.max(0, totalWorkingDays - present);

          return {
            id: emp.id,
            name: `${emp.firstName} ${emp.lastName}`,
            department: emp.Department?.name || emp.department || '-',
            branch: emp.branch || '-',
            totalDays: totalWorkingDays,
            present,
            leave: 0, // placeholder — leave tracking not yet implemented
            late,
            absent,
            overtime: parseFloat(overtimeHours.toFixed(1)),
            undertime: parseFloat(undertimeHours.toFixed(1)),
            totalHours: parseFloat(totalHours.toFixed(2))
          };
        });

      setReportData(rows);
      setAllRecords(records);
    } catch (error) {
      console.error('Error fetching report data:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReportData();
  }, [startDate, endDate]);

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

  const handleExport = () => {
    const headers = ['Employee', 'Leave', 'Absents', 'Lates', 'Overtime', 'Undertime', 'Total (Hrs)'];
    const rows = filteredData.map(e => [
      e.name,
      e.leave,
      e.absent,
      e.late,
      `+${e.overtime}h`,
      `-${e.undertime}h`,
      e.totalHours.toFixed(2)
    ]);

    rows.push([]);
    rows.push(['--- SUMMARY ---']);
    rows.push(['Total Employees', filteredData.length]);
    rows.push(['Period', `${formatDateShort(startDate)} to ${formatDateShort(endDate)}`]);

    const csvContent = [headers, ...rows].map(row => row.join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Attendance_Report_${formatDateShort(startDate)}_${formatDateShort(endDate)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  // Get individual employee's attendance records
  const getEmployeeRecords = (employeeId: number) => {
    return allRecords
      .filter(r => r.employeeId === employeeId)
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  };

  // Export individual employee report
  const handleExportIndividual = (emp: ReportRow) => {
    const records = getEmployeeRecords(emp.id);
    const headers = ['Date', 'Check In', 'Check Out', 'Hours Worked', 'Status'];
    const rows = records.map(r => {
      const checkIn = new Date(r.checkInTime);
      const checkOut = r.checkOutTime ? new Date(r.checkOutTime) : null;
      const hours = checkOut ? ((checkOut.getTime() - checkIn.getTime()) / (1000 * 60 * 60)).toFixed(2) : '—';
      const status = r.status === 'late' || checkIn.getHours() >= 9 ? 'Late' : 'On Time';
      return [
        new Date(r.date).toLocaleDateString('en-CA'),
        checkIn.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
        checkOut ? checkOut.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : '—',
        hours,
        status
      ];
    });

    rows.push([]);
    rows.push(['--- SUMMARY ---']);
    rows.push(['Employee', emp.name]);
    rows.push(['Department', emp.department]);
    rows.push(['Branch', emp.branch]);
    rows.push(['Period', `${startDate} to ${endDate}`]);
    rows.push(['Days Present', String(emp.present)]);
    rows.push(['Days Late', String(emp.late)]);
    rows.push(['Days Absent', String(emp.absent)]);
    rows.push(['Overtime', `+${emp.overtime}h`]);
    rows.push(['Undertime', `-${emp.undertime}h`]);
    rows.push(['Total Hours', emp.totalHours.toFixed(2)]);

    const csvContent = [headers, ...rows].map(row => row.join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Report_${emp.name.replace(/\s+/g, '_')}_${startDate}_to_${endDate}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const formatDateShort = (d: string) => {
    const date = new Date(d + 'T00:00:00');
    return `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()}`;
  };

  // Compute individual report data for modal
  const empRecords = selectedEmployee ? getEmployeeRecords(selectedEmployee.id) : [];
  const attendanceRate = selectedEmployee && selectedEmployee.totalDays > 0 ? Math.round((selectedEmployee.present / selectedEmployee.totalDays) * 100) : 0;

  return (
    <div className="space-y-6">
      {/* Individual Employee Report Modal */}
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

            {/* Modal Body */}
            <div className="overflow-y-auto flex-1 min-h-0">
              {/* Summary Stats */}
              <div className="grid grid-cols-5 divide-x divide-slate-100 border-b border-slate-100">
                <div className="p-4 text-center">
                  <p className="text-[9px] font-black uppercase text-slate-400 tracking-widest">Rate</p>
                  <p className="text-xl font-black text-slate-800 mt-1">{attendanceRate}%</p>
                </div>
                <div className="p-4 text-center">
                  <p className="text-[9px] font-black uppercase text-slate-400 tracking-widest">Present</p>
                  <p className="text-xl font-black text-green-500 mt-1">{selectedEmployee.present}</p>
                </div>
                <div className="p-4 text-center">
                  <p className="text-[9px] font-black uppercase text-slate-400 tracking-widest">Late</p>
                  <p className="text-xl font-black text-yellow-500 mt-1">{selectedEmployee.late}</p>
                </div>
                <div className="p-4 text-center">
                  <p className="text-[9px] font-black uppercase text-slate-400 tracking-widest">Absent</p>
                  <p className="text-xl font-black text-red-500 mt-1">{selectedEmployee.absent}</p>
                </div>
                <div className="p-4 text-center">
                  <p className="text-[9px] font-black uppercase text-slate-400 tracking-widest">Hours</p>
                  <p className="text-xl font-black text-slate-800 mt-1">{selectedEmployee.totalHours.toFixed(1)}</p>
                </div>
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
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {empRecords.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-5 py-16 text-center text-slate-400 font-bold uppercase text-xs tracking-widest">
                        No attendance records found
                      </td>
                    </tr>
                  ) : (
                    empRecords.map((record) => {
                      const checkIn = new Date(record.checkInTime);
                      const checkOut = record.checkOutTime ? new Date(record.checkOutTime) : null;
                      const hoursWorked = checkOut ? ((checkOut.getTime() - checkIn.getTime()) / (1000 * 60 * 60)) : 0;
                      const isLate = record.status === 'late' || checkIn.getHours() >= 9;
                      const recordDate = new Date(record.date);

                      return (
                        <tr key={record.id} className="hover:bg-red-50/50 transition-colors duration-200">
                          <td className="px-5 py-3.5">
                            <p className="font-bold text-slate-700 text-xs">
                              {recordDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
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
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider ${
                              isLate
                                ? 'bg-yellow-50 text-yellow-600 border border-yellow-200'
                                : 'bg-green-50 text-green-600 border border-green-200'
                            }`}>
                              {isLate ? 'Late' : 'On Time'}
                            </span>
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

      {/* Header */}
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

      {/* Filter Bar */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5">
        <div className="flex flex-col lg:flex-row gap-4">
          {/* FROM */}
          <div className="flex-1 min-w-0">
            <label className="text-slate-400 text-[10px] uppercase tracking-widest font-bold block mb-1.5">From</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-white text-sm font-medium text-slate-700 focus:ring-2 focus:ring-red-500/20 outline-none transition-all"
            />
          </div>
          {/* TO */}
          <div className="flex-1 min-w-0">
            <label className="text-slate-400 text-[10px] uppercase tracking-widest font-bold block mb-1.5">To</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-white text-sm font-medium text-slate-700 focus:ring-2 focus:ring-red-500/20 outline-none transition-all"
            />
          </div>
          {/* BRANCH */}
          <div className="flex-1 min-w-0">
            <label className="text-slate-400 text-[10px] uppercase tracking-widest font-bold block mb-1.5">Branch</label>
            <select
              value={selectedBranch}
              onChange={(e) => { setSelectedBranch(e.target.value); setCurrentPage(1); }}
              className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-white text-sm font-medium text-slate-700 focus:ring-2 focus:ring-red-500/20 outline-none transition-all appearance-none cursor-pointer"
            >
              <option value="all">All Branches</option>
              {branches.map(branch => (
                <option key={branch} value={branch}>{branch}</option>
              ))}
            </select>
          </div>
          {/* DEPARTMENT */}
          <div className="flex-1 min-w-0">
            <label className="text-slate-400 text-[10px] uppercase tracking-widest font-bold block mb-1.5">Department</label>
            <select
              value={selectedDept}
              onChange={(e) => { setSelectedDept(e.target.value); setCurrentPage(1); }}
              className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-white text-sm font-medium text-slate-700 focus:ring-2 focus:ring-red-500/20 outline-none transition-all appearance-none cursor-pointer"
            >
              <option value="all">All Departments</option>
              {departments.map(dept => (
                <option key={dept} value={dept}>{dept}</option>
              ))}
            </select>
          </div>
          {/* SEARCH */}
          <div className="flex-1 min-w-0">
            <label className="text-slate-400 text-[10px] uppercase tracking-widest font-bold block mb-1.5">Search</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300" />
              <input
                placeholder="Search employees..."
                className="w-full pl-10 pr-3 py-2.5 rounded-xl border border-slate-200 bg-white text-sm font-medium text-slate-700 placeholder:text-slate-300 focus:ring-2 focus:ring-red-500/20 outline-none transition-all"
                value={searchTerm}
                onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Preview Records Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {/* Section label */}
        <div className="px-6 py-4 border-b border-slate-100">
          <h3 className="text-sm font-bold text-slate-700 uppercase tracking-widest">Preview Records</h3>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-slate-400 font-bold uppercase text-[10px] tracking-widest border-b border-slate-100">
              <tr>
                <th className="px-6 py-4">Employee</th>
                <th className="px-6 py-4">Leave</th>
                <th className="px-6 py-4">Absents</th>
                <th className="px-6 py-4">Lates</th>
                <th className="px-6 py-4">Overtime</th>
                <th className="px-6 py-4">Undertime</th>
                <th className="px-6 py-4">Total (Hrs)</th>
                <th className="px-6 py-4">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={8} className="px-6 py-12 text-center text-slate-400 font-bold text-xs">Loading report data...</td>
                </tr>
              ) : paginatedData.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-6 py-20 text-center text-slate-400 font-bold uppercase text-xs tracking-widest">No records found</td>
                </tr>
              ) : (
                paginatedData.map((employee) => (
                  <tr
                    key={employee.id}
                    className="hover:bg-red-50/30 transition-colors duration-200"
                  >
                    <td className="px-6 py-5">
                      <span className="font-bold text-slate-800">{employee.name}</span>
                    </td>
                    <td className="px-6 py-5">
                      <span className="text-sm font-medium text-slate-700">{employee.leave}</span>
                    </td>
                    <td className="px-6 py-5">
                      <span className={`text-sm font-bold ${employee.absent > 0 ? 'text-red-500' : 'text-slate-700'}`}>
                        {employee.absent}
                      </span>
                    </td>
                    <td className="px-6 py-5">
                      <span className={`text-sm font-bold ${employee.late > 0 ? 'text-red-500' : 'text-slate-700'}`}>
                        {employee.late}
                      </span>
                    </td>
                    <td className="px-6 py-5">
                      <span className={`text-sm font-bold ${employee.overtime > 0 ? 'text-blue-600' : 'text-slate-700'}`}>
                        +{employee.overtime}h
                      </span>
                    </td>
                    <td className="px-6 py-5">
                      <span className={`text-sm font-bold ${employee.undertime > 0 ? 'text-red-500' : 'text-slate-700'}`}>
                        -{employee.undertime}h
                      </span>
                    </td>
                    <td className="px-6 py-5">
                      <span className="text-sm font-bold text-slate-800 font-mono">{employee.totalHours.toFixed(2)}</span>
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
                ))
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
            <button
              onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
              disabled={currentPage === 1}
              className="px-3 py-1.5 rounded-lg text-xs font-bold text-slate-500 hover:bg-white hover:border-slate-200 border border-transparent transition-colors disabled:opacity-30"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => i + 1).map(page => (
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
              onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
              disabled={currentPage === totalPages}
              className="px-3 py-1.5 rounded-lg text-xs font-bold text-slate-500 hover:bg-white hover:border-slate-200 border border-transparent transition-colors disabled:opacity-30"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
