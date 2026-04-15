import React from 'react';
import { Download, X as XIcon, CalendarSearch, Edit2 } from 'lucide-react';
import { ReportRow, AttendanceRecord } from '@/types/reports';
import { formatDateShort, formatLateHrs, formatHrsMins } from '@/features/reports/lib/formatters';
import type { HRTableRowData } from '../hooks/useEmployeeModalData';

export interface HRTimelineViewProps {
    employee: ReportRow;
    records: AttendanceRecord[];
    exportSource: 'admin-panel' | 'hr-panel';
    hrTableRows: HRTableRowData[];
    logSearchDate: string;
    logDateRef: React.RefObject<HTMLInputElement | null>;
    onLogSearchDateChange: (value: string) => void;
    onClose: () => void;
    onExport: (employee: ReportRow, records: AttendanceRecord[], expSrc: 'admin-panel' | 'hr-panel') => void;
}

export function HRTimelineView({
    employee,
    records,
    exportSource,
    hrTableRows,
    logSearchDate,
    logDateRef,
    onLogSearchDateChange,
    onClose,
    onExport,
}: HRTimelineViewProps) {
    return (
        <div className="fixed inset-0 bg-slate-950/40 backdrop-blur-sm z-[100] flex items-center justify-center p-4 animate-in fade-in duration-300">
            <div className="bg-white rounded-[2rem] shadow-2xl w-full max-w-lg overflow-hidden flex flex-col h-[600px] animate-in slide-in-from-bottom-8 ease-out duration-500">
                <div className="p-5 bg-red-600 text-white flex justify-between items-center shrink-0">
                    <div className="flex items-center gap-3">
                        <Edit2 size={18} />
                        <h3 className="font-bold text-lg tracking-tight uppercase">Historical Timeline</h3>
                    </div>
                    <button onClick={() => { onClose(); onLogSearchDateChange(""); }} className="p-2 hover:bg-red-700 rounded-full transition-colors outline-none">
                        <XIcon size={20} />
                    </button>
                </div>

                <div className="p-8 space-y-6 flex-1 overflow-y-auto">
                    <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                        <p className="text-sm font-bold text-slate-800 leading-none">{employee.name}</p>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mt-1.5">{employee.department} • {employee.branch}</p>
                    </div>

                    <div className="grid grid-cols-3 md:grid-cols-5 gap-2">
                        {[
                            { label: 'Present', val: employee.present, color: 'text-emerald-600', bg: 'bg-emerald-50' },
                            { label: 'Lates', val: employee.late, color: 'text-orange-500', bg: 'bg-orange-50' },
                            { label: 'Late Time', val: formatLateHrs(employee.lateMinutes), color: 'text-orange-600', bg: 'bg-orange-600/10' },
                            { label: 'Overtime', val: employee.overtime > 0 ? formatHrsMins(employee.overtime) : '—', color: 'text-blue-600', bg: 'bg-blue-50' },
                            { label: 'Total Hrs', val: employee.totalHours.toFixed(1), color: 'text-slate-700', bg: 'bg-slate-100' },
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
                            <input type="date" ref={logDateRef} value={logSearchDate} onChange={(e) => onLogSearchDateChange(e.target.value)} className="absolute opacity-0 pointer-events-none" />
                            <button onClick={() => logDateRef.current?.showPicker()} className="w-full flex items-center justify-between px-3 py-2.5 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-700 outline-none shadow-sm hover:border-red-200 transition-all">
                                <span>{logSearchDate ? formatDateShort(logSearchDate) : "Select Date"}</span>
                                <CalendarSearch size={14} className="text-slate-400" />
                            </button>
                            {logSearchDate && (<button onClick={() => onLogSearchDateChange("")} className="absolute -right-8 top-1/2 -translate-y-1/2 text-slate-400 hover:text-red-500"><XIcon size={12} /></button>)}
                        </div>
                    </div>

                    <div className="border border-slate-100 rounded-xl overflow-hidden shadow-inner">
                        <table className="w-full text-center text-[11px] border-collapse bg-white">
                            <thead className="bg-slate-50 text-slate-400 font-black uppercase tracking-widest border-b border-slate-100">
                                <tr>
                                    <th className="py-3 text-center">Date</th>
                                    <th className="py-3 text-center">Shift</th>
                                    <th className="py-3 text-center">Type</th>
                                    <th className="py-3 text-center">Duration</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50">
                                {hrTableRows.length > 0 ? hrTableRows.map((detail, idx) => (
                                    <tr key={idx} className="hover:bg-slate-50 transition-colors">
                                        <td className="py-2.5 text-slate-500 font-medium">{detail.date}</td>
                                        <td className="py-2.5 font-bold text-slate-700">{detail.shift || "-"}</td>
                                        <td className={`py-2.5 font-bold uppercase ${detail.colorClass}`}>{detail.type}</td>
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
                    <button onClick={onClose} className="flex-1 px-4 py-4 text-sm font-bold text-slate-500 hover:text-slate-800 transition-colors uppercase tracking-widest outline-none">Close History</button>
                    <button onClick={() => onExport(employee, records, exportSource)} className="flex-1 px-4 py-4 bg-red-600 text-white rounded-xl text-sm font-black shadow-lg hover:bg-red-700 transition-all uppercase tracking-widest active:scale-95 outline-none flex items-center justify-center gap-2">
                        <Download size={16} /> Export Detailed
                    </button>
                </div>
            </div>
        </div>
    );
}
