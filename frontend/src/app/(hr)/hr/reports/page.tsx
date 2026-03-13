"use client"
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Download, Search, X, AlertTriangle, CalendarSearch, ChevronUp, ChevronDown, Edit2 } from 'lucide-react';
import * as XLSX from 'xlsx';

export default function ReportsPage() {
  const [fromDate, setFromDate] = useState("2026-01-01");
  const [toDate, setToDate] = useState("2026-01-30");
  const [viewingDetails, setViewingDetails] = useState<any>(null);
  const [logSearchDate, setLogSearchDate] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [deptFilter, setDeptFilter] = useState("All Departments");
  const [branchFilter, setBranchFilter] = useState("All Branches");
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const fromDateRef = useRef<HTMLInputElement>(null);
  const toDateRef = useRef<HTMLInputElement>(null);
  const logDateRef = useRef<HTMLInputElement>(null);

  const departments = ["All Departments", "Purchasing", "Human Resources", "Engineering"];
  const branches = ["All Branches", "Main Office", "Makati Branch", "Tayud Branch"];

  const reportData = [
    {
      name: "Mark Anthony", branch: "Main Office", dept: "Purchasing", totalAbsents: 0, totalHours: 176.00, totalOvertime: 5.5, totalUndertime: 0, totalLates: 0, lateDuration: "0m",
      details: [
        { date: "2026-02-05", type: "Overtime", duration: "2h", shift: "" },
        { date: "2026-01-12", type: "Overtime", duration: "3.5h", shift: "" }
      ]
    },
    {
      name: "Sarah Jenkins", branch: "Makati Branch", dept: "Human Resources", totalAbsents: 1, totalHours: 152.50, totalOvertime: 0, totalUndertime: 2.5, totalLates: 3, lateDuration: "45m",
      details: [
        { date: "2026-02-08", type: "Late", duration: "15m", shift: "" },
        { date: "2026-02-10", type: "Absent", duration: "8hr", shift: "" },
        { date: "2026-01-20", type: "Late", duration: "20m", shift: "" },
        { date: "2026-01-21", type: "Late", duration: "10m", shift: "" }
      ]
    },
    {
      name: "Ariadne Arsolon", branch: "Tayud Branch", dept: "Engineering", totalAbsents: 0, totalHours: 168.00, totalOvertime: 2.0, totalUndertime: 0.5, totalLates: 1, lateDuration: "10m",
      details: [
        { date: "2026-01-03", type: "Late", duration: "10m", shift: "" }
      ]
    },
  ];

  const filteredData = useMemo(() => {
    return reportData
      .filter(emp => {
        const matchesSearch = emp.name.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesDept = deptFilter === "All Departments" || emp.dept === deptFilter;
        const matchesBranch = branchFilter === "All Branches" || emp.branch === branchFilter;
        return matchesSearch && matchesDept && matchesBranch;
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [searchQuery, deptFilter, branchFilter]);

  const summary = useMemo(() => {
    return {
      totalEmployees: filteredData.length,
      totalPresent: filteredData.length - filteredData.reduce((acc, curr) => acc + (curr.totalAbsents > 0 ? 1 : 0), 0),
      totalLate: filteredData.reduce((acc, curr) => acc + curr.totalLates, 0),
      totalAbsences: filteredData.reduce((acc, curr) => acc + curr.totalAbsents, 0)
    };
  }, [filteredData]);

  const sortedDetails = useMemo(() => {
    if (!viewingDetails) return [];
    return viewingDetails.details
      .filter((log: any) => logSearchDate ? log.date === logSearchDate : true)
      .sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [viewingDetails, logSearchDate]);

  const formatDateLabel = (dateStr: string) => {
    if (!dateStr) return "";
    const [year, month, day] = dateStr.split("-");
    return `${day}/${month}/${year}`;
  };

  const handleExportIndividual = (emp: any) => {
    const reportInfo = [
      ["INDIVIDUAL ATTENDANCE SUMMARY"],
      ["BITS"],
      [],
      ["Employee Name:", emp.name],
      ["Department:", emp.dept],
      ["Branch:", emp.branch],
      ["Report Range:", `${formatDateLabel(fromDate)} - ${formatDateLabel(toDate)}`],
      ["Generated At:", new Date().toLocaleString()],
      [],
      ["METRICS OVERVIEW"],
      ["Total Rendered Hours:", emp.totalHours.toFixed(2)],
      ["Overtime Hours:", emp.totalOvertime],
      ["Undertime Hours:", emp.totalUndertime],
      ["Days of Absents:", emp.totalAbsents],
      ["Total Late Count:", emp.totalLates],
      ["Total Late Duration:", emp.lateDuration],
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
      ["Report Date Range:", `${formatDateLabel(fromDate)} - ${formatDateLabel(toDate)}`],
      ["Generated By:", "HR Admin"],
      [],
      ["Summary Section:"],
      ["Total Employees:", summary.totalEmployees],
      ["Total Present:", summary.totalPresent],
      ["Total Late:", summary.totalLate],
      ["Total Absences:", summary.totalAbsences],
      [],
      ["Employee Records:"],
      ['Employee Name', 'Branch', 'Department', 'Overtime (Hrs)', 'Undertime (Hrs)', 'Lates (Count)', 'Late Duration', 'Absents', 'Total Rendered Hours']
    ];

    const tableData = filteredData.map(row => [
      row.name,
      row.branch,
      row.dept,
      row.totalOvertime,
      row.totalUndertime,
      row.totalLates,
      row.lateDuration,
      row.totalAbsents,
      row.totalHours
    ]);

    const worksheet = XLSX.utils.aoa_to_sheet([...reportInfo, ...tableData]);
    const wscols = [
      { wch: 25 }, { wch: 20 }, { wch: 20 }, { wch: 15 },
      { wch: 15 }, { wch: 12 }, { wch: 15 }, { wch: 10 }, { wch: 22 }
    ];
    worksheet['!cols'] = wscols;
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Report");
    XLSX.writeFile(workbook, `Attendance Report.xlsx`);
  };

  const CustomSelect = ({ value, options, onChange, id, variant = "primary" }: any) => {
    const isOpen = openDropdown === id;
    const isModalVariant = variant === "modal";

    return (
      <div className="relative flex-1">
        <button
          onClick={(e) => { e.stopPropagation(); setOpenDropdown(isOpen ? null : id); }}
          className={`w-full flex items-center justify-between px-4 py-2 rounded-lg text-xs font-bold transition-all outline-none ${isModalVariant
            ? `bg-slate-50 border border-slate-200 text-slate-700 ${isOpen ? 'ring-2 ring-red-500/20 border-red-300' : ''}`
            : `bg-[#df0808] text-white ${isOpen ? 'rounded-b-none' : 'shadow-sm'}`
            }`}
        >
          <span>{value}</span>
          {isOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>
        {isOpen && (
          <div className="absolute top-full left-0 right-0 z-50 flex flex-col pt-1 animate-in fade-in slide-in-from-top-1 duration-200">
            {options.map((opt: string) => (
              <button
                key={opt}
                className={`w-full text-left px-4 py-2 transition-colors text-xs font-bold mt-[1px] rounded-sm last:rounded-b-lg shadow-sm flex items-center gap-2 ${isModalVariant
                  ? 'bg-[#800000] text-white hover:bg-[#990000]'
                  : 'bg-[#c21414] text-white hover:bg-red-500'
                  }`}
                onClick={() => {
                  onChange(opt);
                  setOpenDropdown(null);
                }}
              >
                {opt}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-4 pb-4 relative" onClick={() => setOpenDropdown(null)}>
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 shrink-0">
        <div>
          <h1 className="text-2xl font-black text-slate-800 tracking-tight leading-none uppercase">Attendance Reports</h1>
          <p className="text-slate-500 text-sm font-medium tracking-tight">Export overall attendance records</p>
        </div>
        <button onClick={handleExport} className="flex items-center justify-center gap-2 bg-[#E60000] text-white px-5 py-2.5 rounded-lg font-bold text-sm shadow-md hover:bg-red-700 active:scale-95 transition-all tracking-tight uppercase">
          <Download size={16} /> Export Report
        </button>
      </div>

      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm shrink-0" onClick={(e) => e.stopPropagation()}>
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
          <div className="space-y-1">
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Search</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
              <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Search..." className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs outline-none focus:ring-2 focus:ring-red-500/10 transition-all font-bold text-slate-700" />
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">From Date</label>
            <div className="relative">
              <input type="date" ref={fromDateRef} value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="absolute opacity-0 pointer-events-none" />
              <button onClick={() => fromDateRef.current?.showPicker()} className="w-full flex items-center justify-between px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-slate-700 outline-none hover:border-red-400 transition-all shadow-sm">
                <span>{formatDateLabel(fromDate)}</span>
                <CalendarSearch size={14} className="text-slate-400" />
              </button>
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">To Date</label>
            <div className="relative">
              <input type="date" ref={toDateRef} value={toDate} onChange={(e) => setToDate(e.target.value)} className="absolute opacity-0 pointer-events-none" />
              <button onClick={() => toDateRef.current?.showPicker()} className="w-full flex items-center justify-between px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-slate-700 outline-none hover:border-red-400 transition-all shadow-sm">
                <span>{formatDateLabel(toDate)}</span>
                <CalendarSearch size={14} className="text-slate-400" />
              </button>
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Branch</label>
            <CustomSelect id="branch" value={branchFilter} options={branches} onChange={setBranchFilter} />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 ml-1">Department</label>
            <CustomSelect id="dept" value={deptFilter} options={departments} onChange={setDeptFilter} />
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
        <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center shrink-0">
          <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Attendance Summary Preview</span>
        </div>
        <div className="overflow-auto max-h-[360px]">
          <table className="w-full text-left text-sm border-collapse min-w-[1000px]">
            <thead className="bg-white text-slate-400 text-[10px] uppercase font-black tracking-widest border-b border-slate-100 sticky top-0 z-10">
              <tr>
                <th className="px-4 py-4 bg-white">Employee</th>
                <th className="px-4 py-4 text-center bg-white">Absents</th>
                <th className="px-4 py-4 text-center bg-white">Late Count</th>
                <th className="px-4 py-4 text-center bg-white">Late Minutes</th>
                <th className="px-4 py-4 text-center bg-white">Overtime</th>
                <th className="px-4 py-4 text-center bg-white">Undertime</th>
                <th className="px-4 py-4 text-center bg-white">Total (Hrs)</th>
                <th className="px-4 py-4 text-right bg-white pr-10">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filteredData.map((emp, index) => (
                <tr key={index} className="hover:bg-red-50/50 transition-colors group h-[58px]">
                  <td className="px-6 py-3 font-bold text-slate-700 underline decoration-red-100 underline-offset-4 decoration-2">{emp.name}</td>
                  <td className="px-4 py-3 text-center font-medium text-red-500">{emp.totalAbsents}</td>
                  <td className="px-4 py-3 text-center font-medium text-orange-500">{emp.totalLates}</td>
                  <td className="px-4 py-3 text-center font-medium text-orange-600 font-bold">{emp.lateDuration}</td><td className="px-4 py-3 text-center font-bold text-blue-600">+{emp.totalOvertime}h</td>
                  <td className="px-4 py-3 text-center font-bold text-amber-600">-{emp.totalUndertime}h</td>
                  <td className="px-4 py-3 text-center font-mono text-slate-600 font-bold">{emp.totalHours.toFixed(2)}</td>
                  <td className="px-4 py-3 text-right pr-6">
                    <button onClick={() => setViewingDetails(emp)} className="px-4 py-2 bg-[#E60000] text-white rounded-lg text-[10px] font-black tracking-wider hover:bg-red-700 transition-all shadow-sm active:scale-95 uppercase">
                      VIEW HISTORY
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

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

              <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
                {[
                  { label: 'Absents', val: viewingDetails.totalAbsents, color: 'text-red-600', bg: 'bg-red-50' },
                  { label: 'Lates', val: viewingDetails.totalLates, color: 'text-orange-500', bg: 'bg-orange-50' },
                  { label: 'Late Time', val: viewingDetails.lateDuration, color: 'text-orange-600', bg: 'bg-orange-600/10' },
                  { label: 'Overtime', val: `+${viewingDetails.totalOvertime}h`, color: 'text-emerald-600', bg: 'bg-emerald-50' },
                  { label: 'Undertime', val: `-${viewingDetails.totalUndertime}h`, color: 'text-amber-600', bg: 'bg-amber-50' },
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
                    <span>{logSearchDate ? formatDateLabel(logSearchDate) : "Select Date"}</span>
                    <CalendarSearch size={14} className="text-slate-400" />
                  </button>
                  {logSearchDate && (<button onClick={() => setLogSearchDate("")} className="absolute -right-8 top-1/2 -translate-y-1/2 text-slate-400 hover:text-red-500"><X size={12} /></button>)}
                </div>
              </div>

              <div className="border border-slate-100 rounded-xl overflow-hidden shadow-inner">
                <table className="w-full text-center text-[11px] border-collapse bg-white">
                  <thead className="bg-slate-50 text-slate-400 font-black uppercase tracking-widest border-b border-slate-100">
                    <tr>
                      <th className="py-3">Date</th>
                      <th className="py-3">Shift</th>
                      <th className="py-3">Type</th>
                      <th className="py-3">Duration</th>
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