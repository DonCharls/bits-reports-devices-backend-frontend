"use client"
import React, { useState, useMemo } from 'react';
import { Download, Search, X, AlertTriangle, CalendarCheck, CalendarSearch } from 'lucide-react';

export default function ReportsPage() {
  const [fromDate, setFromDate] = useState("2026-01-01");
  const [toDate, setToDate] = useState("2026-01-30");
  const [viewingDetails, setViewingDetails] = useState<any>(null);
  const [logSearchDate, setLogSearchDate] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [deptFilter, setDeptFilter] = useState("All Departments");
  const [branchFilter, setBranchFilter] = useState("All Branches");

  const reportData = [
    {
      id: "EMP-001", name: "Mark Anthony", branch: "Main Office", dept: "Purchasing", totalLeave: 0, totalAbsents: 0, totalHours: 176.00, totalOvertime: 5.5, totalUndertime: 0, totalLates: 0,
      details: [
        { date: "2026-02-05", type: "Overtime", duration: "2h", remark: "Project Deadline" },
        { date: "2026-01-12", type: "Overtime", duration: "3.5h", remark: "System Audit" },
        { date: "2026-01-15", type: "Overtime", duration: "1h", remark: "Office Cleanup" }
      ]
    },
    {
      id: "EMP-002", name: "Sarah Jenkins", branch: "Makita Branch", dept: "Human Resources", totalLeave: 2, totalAbsents: 1, totalHours: 152.50, totalOvertime: 0, totalUndertime: 2.5, totalLates: 3,
      details: [
        { date: "2026-02-08", type: "Late", duration: "15m", remark: "Heavy traffic along the main highway" },
        { date: "2026-02-10", type: "Absent", duration: "1 Day", remark: "Personal Emergency - No Call" },
        { date: "2026-01-15", type: "Leave", duration: "2 Days", remark: "Sick Leave with Medical Certificate" },
        { date: "2026-01-20", type: "Late", duration: "5m", remark: "Biometric terminal synchronization error" },
        { date: "2025-12-25", type: "Leave", duration: "1 Day", remark: "Company Holiday" }
      ]
    },
    {
      id: "EMP-003", name: "Ariadne Arsolon", branch: "Tayud Branch", dept: "Engineering", totalLeave: 1, totalAbsents: 0, totalHours: 168.00, totalOvertime: 2.0, totalUndertime: 0.5, totalLates: 1,
      details: [
        { date: "2026-01-03", type: "Late", duration: "10m", remark: "Delayed by client meeting" },
        { date: "2026-01-20", type: "Leave", duration: "1 Day", remark: "Approved Vacation Leave" }
      ]
    },
  ];

  const filteredData = useMemo(() => {
    return reportData.filter(emp => {
      const matchesSearch = emp.name.toLowerCase().includes(searchQuery.toLowerCase()) || emp.id.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesDept = deptFilter === "All Departments" || emp.dept === deptFilter;
      const matchesBranch = branchFilter === "All Branches" || emp.branch === branchFilter;
      return matchesSearch && matchesDept && matchesBranch;
    });
  }, [searchQuery, deptFilter, branchFilter]);

  const groupedLogs = useMemo(() => {
    if (!viewingDetails) return {};
    const filtered = viewingDetails.details.filter((log: any) => logSearchDate ? log.date === logSearchDate : true);
    return filtered.reduce((acc: any, log: any) => {
      const month = new Date(log.date).toLocaleString('default', { month: 'long', year: 'numeric' });
      if (!acc[month]) acc[month] = [];
      acc[month].push(log);
      return acc;
    }, {});
  }, [viewingDetails, logSearchDate]);

  const formatDateLabel = (dateStr: string) => {
    if (!dateStr) return "";
    const [year, month, day] = dateStr.split("-");
    return `${day}/${month}/${year}`;
  };

  const handleExport = () => {
    const escapeCSV = (val: any) => `"${String(val ?? '').replace(/"/g, '""')}"`;
    const rows = [
      [`From:`, formatDateLabel(fromDate)],
      [`To:`, formatDateLabel(toDate)],
      [],
      ['Employee Name', 'Branch', 'Department', 'Overtime (Hrs)', 'Undertime (Hrs)', 'Lates', 'Absents', 'Leave Days', 'Total Rendered Hours'],
      ...filteredData.map(row => [row.name, row.branch, row.dept, row.totalOvertime, row.totalUndertime, row.totalLates, row.totalAbsents, row.totalLeave, row.totalHours]),
    ];
    const csv = rows.map(r => r.map(escapeCSV).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Attendance_Report_${formatDateLabel(fromDate)}_to_${formatDateLabel(toDate)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4 pb-4">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 shrink-0">
        <div>
          <h1 className="text-2xl font-black text-slate-800 tracking-tight leading-none">Attendance Reports</h1>
          <p className="text-slate-500 text-sm font-medium">Export overall attendance records</p>
        </div>
        <button onClick={handleExport} className="flex items-center justify-center gap-2 bg-[#E60000] text-white px-6 py-2.5 rounded-xl font-bold text-sm shadow-lg shadow-red-600/20 hover:bg-red-700 active:scale-95 transition-all tracking-tight">
          <Download size={16} /> Attendance Report: {formatDateLabel(fromDate)} - {formatDateLabel(toDate)}
        </button>
      </div>

      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm shrink-0">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
          <div className="space-y-1">
            <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 ml-1">From</label>
            <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-slate-700 outline-none focus:ring-2 focus:ring-red-500/10 focus:border-red-500 transition-all" />
          </div>
          <div className="space-y-1">
            <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 ml-1">To</label>
            <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-slate-700 outline-none focus:ring-2 focus:ring-red-500/10 focus:border-red-500 transition-all" />
          </div>
          <div className="space-y-1">
            <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 ml-1">Branch</label>
            <select value={branchFilter} onChange={(e) => setBranchFilter(e.target.value)} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-slate-600 outline-none focus:ring-2 focus:ring-red-500/10 focus:border-red-500 transition-all">
              <option>All Branches</option>
              <option>Main Office</option>
              <option>Makita Branch</option>
              <option>Tayud Branch</option>
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 ml-1">Department</label>
            <select value={deptFilter} onChange={(e) => setDeptFilter(e.target.value)} className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-slate-700 outline-none focus:ring-2 focus:ring-red-500/10 focus:border-red-500 transition-all">
              <option>All Departments</option>
              <option>Purchasing</option>
              <option>Human Resources</option>
              <option>Engineering</option>
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 ml-1">Search</label>
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
              <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Search employees..." className="w-full pl-7 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs outline-none focus:ring-2 focus:ring-red-500/10 focus:border-red-500 transition-all" />
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
        <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center shrink-0">
          <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Preview Records</span>
        </div>
        <div className="overflow-auto max-h-[360px]">
          <table className="w-full text-left text-sm border-collapse min-w-[900px]">
            <thead className="bg-white text-slate-400 text-[10px] uppercase font-black tracking-widest border-b border-slate-100 sticky top-0 z-10">
              <tr>
                <th className="px-6 py-4 bg-white">Employee</th>
                <th className="px-6 py-4 text-center bg-white">Leave</th>
                <th className="px-6 py-4 text-center bg-white">Absents</th>
                <th className="px-6 py-4 text-center bg-white">Lates</th>
                <th className="px-6 py-4 text-center bg-white">Overtime</th>
                <th className="px-6 py-4 text-center bg-white">Undertime</th>
                <th className="px-6 py-4 text-center bg-white">Total (Hrs)</th>
                <th className="px-6 py-4 text-right bg-white pr-10">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filteredData.length > 0 ? filteredData.map((emp) => (
                <tr key={emp.id} className="hover:bg-red-50/30 transition-colors group cursor-default h-[64px]">
                  <td className="px-6 py-4 font-bold text-slate-700 underline decoration-red-100 underline-offset-4 decoration-2">{emp.name}</td>
                  <td className="px-6 py-4 text-center font-medium text-slate-500">{emp.totalLeave}</td>
                  <td className="px-6 py-4 text-center font-medium text-red-500">{emp.totalAbsents}</td>
                  <td className="px-6 py-4 text-center font-medium text-orange-500">{emp.totalLates}</td>
                  <td className="px-6 py-4 text-center font-bold text-blue-600">+{emp.totalOvertime}h</td>
                  <td className="px-6 py-4 text-center font-bold text-amber-600">-{emp.totalUndertime}h</td>
                  <td className="px-6 py-4 text-center font-mono text-slate-600 font-bold">{emp.totalHours.toFixed(2)}</td>
                  <td className="px-6 py-4 text-right pr-6">
                    <button onClick={() => setViewingDetails(emp)} className="inline-flex items-center gap-2 px-4 py-1.5 bg-[#E60000] text-white border border-[#E60000] rounded-lg text-[10px] font-black tracking-wider hover:bg-red-50 hover:text-[#E60000] transition-all shadow-sm active:scale-95 tracking-tight">
                      View History
                    </button>
                  </td>
                </tr>
              )) : (
                <tr><td colSpan={8} className="text-center py-20 font-bold text-slate-400 uppercase text-[10px] tracking-widest">No matching records found</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {viewingDetails && (
        <div className="fixed inset-0 bg-slate-950/40 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col h-[580px] animate-in fade-in zoom-in duration-200">
            <div className="p-5 bg-[#E60000] text-white flex justify-between items-center shrink-0">
              <div>
                <p className="text-[12px] text-red-100 font-medium mt-0.5">Historical Timeline</p>
                <h3 className="font-black text-lg leading-tight tracking-tight uppercase">{viewingDetails.name}</h3>
                <p className="text-[10px] text-red-100 font-medium mt-0.5">
                  {viewingDetails.branch} • {viewingDetails.dept}
                </p>
              </div>
              <button onClick={() => { setViewingDetails(null); setLogSearchDate(""); }} className="p-2 hover:bg-white/10 rounded-xl transition-colors"><X size={20} /></button>
            </div>

            <div className="px-6 pt-5 pb-2 shrink-0">
              <div className="grid grid-cols-3 gap-2">
                {[
                  { label: 'Leave', val: viewingDetails.totalLeave, color: 'text-blue-600', bg: 'bg-blue-50' },
                  { label: 'Absents', val: viewingDetails.totalAbsents, color: 'text-red-600', bg: 'bg-red-50' },
                  { label: 'Lates', val: viewingDetails.totalLates, color: 'text-orange-600', bg: 'bg-orange-50' },
                  { label: 'Overtime', val: `+${viewingDetails.totalOvertime}h`, color: 'text-emerald-600', bg: 'bg-emerald-50' },
                  { label: 'Undertime', val: `-${viewingDetails.totalUndertime}h`, color: 'text-amber-600', bg: 'bg-amber-50' },
                  { label: 'Total Hrs', val: viewingDetails.totalHours.toFixed(1), color: 'text-slate-700', bg: 'bg-slate-100' },
                ].map((stat, i) => (
                  <div key={i} className={`${stat.bg} p-2.5 rounded-2xl border border-black/5`}>
                    <p className="text-[8px] font-black uppercase text-slate-400 tracking-wider mb-0.5">{stat.label}</p>
                    <p className={`text-xs font-black ${stat.color}`}>{stat.val}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="px-6 py-2.5 bg-slate-50 border-b border-slate-100 flex justify-between items-center shrink-0">
              <span className="text-[9px] font-bold text-slate-400 tracking-widest">Filter timeline</span>
              <div className="relative w-36">
                <CalendarSearch className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" size={12} />
                <input type="date" value={logSearchDate} onChange={(e) => setLogSearchDate(e.target.value)} className="w-full pl-7 pr-6 py-1.5 bg-white border border-slate-200 rounded-lg text-[10px] font-bold text-slate-700 outline-none focus:ring-2 focus:ring-red-500/10 focus:border-red-500 transition-all shadow-sm" />
                {logSearchDate && (<button onClick={() => setLogSearchDate("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-red-500"><X size={12} /></button>)}
              </div>
            </div>

            <div className="p-6 flex flex-col flex-1 overflow-hidden">
              <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar space-y-6">
                {Object.keys(groupedLogs).length > 0 ? (
                  Object.entries(groupedLogs).map(([month, logs]: any) => (
                    <div key={month} className="space-y-3">
                      <div className="flex items-center gap-3 sticky top-0 bg-white py-1 z-20">
                        <div className="h-[1px] flex-1 bg-slate-100" />
                        <span className="text-[10px] font-bold text-slate-400 tracking-[0.2em]">{month}</span>
                        <div className="h-[1px] flex-1 bg-slate-100" />
                      </div>
                      <div className="space-y-2">
                        {logs.map((detail: any, idx: number) => (
                          <div key={idx} className="flex items-center justify-between p-3 bg-slate-50 rounded-2xl border border-slate-100">
                            <div className="flex items-center gap-4">
                              <div className={`p-2 rounded-xl ${detail.type === 'Leave' ? 'bg-blue-100 text-blue-600' : detail.type === 'Absent' ? 'bg-red-100 text-red-600' : 'bg-orange-100 text-orange-600'}`}>
                                {detail.type === 'Leave' ? <CalendarCheck size={16} /> : <AlertTriangle size={16} />}
                              </div>
                              <div>
                                <p className="text-[11px] font-bold text-slate-700 tracking-tight">{detail.type}: {detail.duration}</p>
                                <p className="text-[10px] text-slate-400 font-medium">{detail.date}</p>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-20"><p className="text-[10px] font-bold text-slate-300 uppercase tracking-[0.2em] lowercase">No logs found</p></div>
                )}
              </div>
            </div>
            
            <div className="p-4 bg-slate-50 border-t border-slate-100 text-center shrink-0">
               <p className="text-[9px] font-medium text-slate-400 tracking-widest lowercase">End of activity stream</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}