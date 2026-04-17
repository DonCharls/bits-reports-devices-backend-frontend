import React from 'react';
import { Download, X as XIcon, Clock, Calendar, AlertTriangle } from 'lucide-react';
import { ReportRow, AttendanceRecord } from '@/types/reports';
import {
    formatShiftTime,
    formatLateHrs,
    formatHrsMins,
} from '@/features/reports/lib/formatters';
import { SortableHeader } from '@/components/ui/SortableHeader';
import type { TableRowData } from '../hooks/useEmployeeModalData';

export interface AdminDetailViewProps {
    employee: ReportRow;
    records: AttendanceRecord[];
    startDate: string;
    endDate: string;
    exportSource: 'admin-panel' | 'hr-panel';
    attendanceRate: number;
    sortedData: TableRowData[];
    sortKeyStr: string | null;
    sortOrder: 'asc' | 'desc' | null;
    handleSort: (key: string) => void;
    onClose: () => void;
    onExport: (employee: ReportRow, records: AttendanceRecord[], expSrc: 'admin-panel' | 'hr-panel') => void;
}

export function AdminDetailView({
    employee,
    records,
    startDate,
    endDate,
    exportSource,
    attendanceRate,
    sortedData,
    sortKeyStr,
    sortOrder,
    handleSort,
    onClose,
    onExport,
}: AdminDetailViewProps) {
    return (
        <div className="fixed inset-0 bg-slate-950/40 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-4xl overflow-hidden flex flex-col max-h-[90vh]">
                {/* Modal Header */}
                <div className="p-5 bg-red-600 text-white flex justify-between items-center shrink-0">
                    <div>
                        <h3 className="font-bold text-lg leading-tight tracking-tight">
                            {employee.name}
                        </h3>
                        <p className="text-[10px] text-red-100 opacity-90 uppercase font-black tracking-widest mt-0.5">
                            {employee.department} · {employee.branch}
                        </p>
                        {/* SHIFT BADGE */}
                        {employee.shift ? (
                            <div className="flex items-center gap-1.5 mt-1.5">
                                <Clock className="w-3 h-3 text-red-200" />
                                <span className="text-[10px] text-red-100 font-bold">
                                    {employee.shift.name} ·{' '}
                                    {formatShiftTime(employee.shift.startTime)} –{' '}
                                    {formatShiftTime(employee.shift.endTime)}
                                </span>
                            </div>
                        ) : (
                            <div className="flex items-center gap-1.5 mt-1.5">
                                <Clock className="w-3 h-3 text-red-200" />
                                <span className="text-[10px] text-red-200 font-bold italic">
                                    No shift assigned (default 8AM)
                                </span>
                            </div>
                        )}
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => onExport(employee, records, exportSource)}
                            className="flex items-center gap-1.5 px-3 py-2 bg-white/20 hover:bg-white/30 text-white rounded-xl text-xs font-bold transition-colors"
                        >
                            <Download className="w-3.5 h-3.5" />
                            Export
                        </button>
                        <button
                            onClick={onClose}
                            className="text-white/80 hover:text-white transition-colors"
                        >
                            <XIcon className="w-5 h-5" />
                        </button>
                    </div>
                </div>

                {/* Anomaly warning banner */}
                {employee.hasAnomaly && (
                    <div className="flex items-center gap-3 px-5 py-2.5 bg-orange-50 border-b border-orange-100">
                        <AlertTriangle className="w-4 h-4 text-orange-500 shrink-0" />
                        <p className="text-xs font-bold text-orange-700">
                            This employee has check-ins that are more than 4 hours outside
                            their assigned shift time. These are flagged as{' '}
                            <strong>Anomaly</strong> and may require HR review.
                        </p>
                    </div>
                )}

                {/* Modal Body */}
                <div className="overflow-y-auto flex-1 min-h-0">
                    {/* Summary Stats */}
                    <div className="grid grid-cols-6 divide-x divide-slate-100 border-b border-slate-100">
                        {[
                            {
                                label: 'Attendance Rate',
                                value: `${attendanceRate}%`,
                                sub: `${employee.present} of ${employee.totalDays} days`,
                                color: attendanceRate >= 90 ? 'text-green-600' : attendanceRate >= 70 ? 'text-yellow-600' : 'text-red-600',
                            },
                            {
                                label: 'Present',
                                value: employee.present,
                                color: 'text-green-500',
                            },
                            {
                                label: 'Late',
                                value: employee.lateMinutes > 0 ? formatLateHrs(employee.lateMinutes) : '—',
                                color: 'text-yellow-500',
                                small: true,
                            },
                            {
                                label: 'Overtime',
                                value: employee.overtime > 0 ? formatHrsMins(employee.overtime) : '—',
                                color: 'text-blue-500',
                                small: true, 
                            },
                            {
                                label: 'Undertime',
                                value: employee.undertime > 0 ? formatHrsMins(employee.undertime) : '—',
                                color: 'text-red-500',
                                small: true,
                            },
                            {
                                label: 'Hours',
                                value: employee.totalHours.toFixed(2),
                                color: 'text-slate-800',
                            },
                        ].map((s, i) => (
                            <div key={i} className="p-4 text-center flex flex-col justify-center">
                                <p className="text-[9px] font-black uppercase text-slate-400 tracking-widest">
                                    {s.label}
                                </p>
                                <p
                                    className={`${
                                        s.small ? 'text-sm' : 'text-xl'
                                    } font-black ${s.color} mt-1`}
                                >
                                    {s.value}
                                </p>
                                {'sub' in s && s.sub && (
                                    <p className="text-[9px] text-slate-400 font-bold mt-0.5">{s.sub}</p>
                                )}
                            </div>
                        ))}
                    </div>

                    {/* Date range */}
                    <div className="flex items-center gap-2 px-5 py-3 bg-slate-50 border-b border-slate-100">
                        <Calendar className="w-3.5 h-3.5 text-slate-400" />
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                            {new Date(startDate + 'T00:00:00').toLocaleDateString('en-US', {
                                month: 'short',
                                day: 'numeric',
                                year: 'numeric',
                            })}{' '}
                            —{' '}
                            {new Date(endDate + 'T00:00:00').toLocaleDateString('en-US', {
                                month: 'short',
                                day: 'numeric',
                                year: 'numeric',
                            })}
                        </span>
                    </div>

                    {/* Daily Attendance Table */}
                    <table className="w-full text-left text-sm">
                        <thead className="bg-slate-50 text-slate-400 font-bold uppercase text-[10px] tracking-widest border-b border-slate-100 sticky top-0 z-10">
                            <tr>
                                <SortableHeader label="Date" sortKey="loopDateStr" currentSortKey={sortKeyStr} currentSortOrder={sortOrder} onSort={handleSort} className="px-5 py-3" />
                                <SortableHeader label="Check In" sortKey="checkInVal" currentSortKey={sortKeyStr} currentSortOrder={sortOrder} onSort={handleSort} className="px-5 py-3" />
                                <SortableHeader label="Check Out" sortKey="checkOutVal" currentSortKey={sortKeyStr} currentSortOrder={sortOrder} onSort={handleSort} className="px-5 py-3" />
                                <SortableHeader label="Worked Hrs" sortKey="workedHrsVal" currentSortKey={sortKeyStr} currentSortOrder={sortOrder} onSort={handleSort} className="px-5 py-3" />
                                <SortableHeader label="Late" sortKey="lateMinsVal" currentSortKey={sortKeyStr} currentSortOrder={sortOrder} onSort={handleSort} className="px-5 py-3" />
                                <SortableHeader label="OT" sortKey="otMinsVal" currentSortKey={sortKeyStr} currentSortOrder={sortOrder} onSort={handleSort} className="px-5 py-3" />
                                <SortableHeader label="UT" sortKey="utMinsVal" currentSortKey={sortKeyStr} currentSortOrder={sortOrder} onSort={handleSort} className="px-5 py-3" />
                                <SortableHeader label="Status" sortKey="statusType" currentSortKey={sortKeyStr} currentSortOrder={sortOrder} onSort={handleSort} className="px-5 py-3" />
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {sortedData.length === 0 ? (
                                <tr>
                                    <td
                                        colSpan={8}
                                        className="px-5 py-16 text-center text-slate-400 font-bold uppercase text-xs tracking-widest"
                                    >
                                        No attendance records found
                                    </td>
                                </tr>
                            ) : (
                                sortedData.map((row) => {
                                    const { loopDate, loopDateStr, record, statusType, missingStatus, isFuture, checkInVal: checkIn, checkOutVal: checkOut, workedHrsVal: hoursWorked, lateMinsVal: lateMins, otMinsVal: otMins, utMinsVal: utMins } = row;

                                    // If no record exists for this date in the range
                                    if (!record) {
                                        const statusColor = missingStatus === 'Upcoming' ? 'bg-blue-50 text-blue-600 border-blue-200' :
                                                            missingStatus === 'Absent' ? 'bg-red-50 text-red-600 border-red-200' :
                                                            'bg-slate-100 text-slate-500 border-slate-200';

                                        return (
                                            <tr key={loopDateStr} className="hover:bg-slate-50/50 transition-colors duration-200">
                                                <td className="px-5 py-3.5">
                                                   <p className="font-bold text-slate-700 text-xs">
                                                      {loopDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                                                   </p>
                                                </td>
                                                <td colSpan={6} className="px-5 py-3.5 text-center">
                                                   <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                                                      {isFuture ? 'Scheduled' : 'No Record'}
                                                   </span>
                                                </td>
                                                <td className="px-5 py-3.5">
                                                   <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider border w-fit ${statusColor}`}>
                                                      {missingStatus}
                                                   </span>
                                                </td>
                                            </tr>
                                        );
                                    }

                                    // Record exists
                                    // Row highlight for anomaly
                                    const rowBg =
                                        statusType === 'anomaly'
                                            ? 'bg-orange-50/60 hover:bg-orange-50'
                                            : 'hover:bg-red-50/50';

                                    return (
                                        <tr
                                            key={record.id}
                                            className={`transition-colors duration-200 ${rowBg}`}
                                        >
                                            <td className="px-5 py-3.5">
                                                <p className="font-bold text-slate-700 text-xs">
                                                    {new Date(record.date).toLocaleDateString('en-US', {
                                                        weekday: 'short',
                                                        month: 'short',
                                                        day: 'numeric',
                                                    })}
                                                </p>
                                            </td>
                                            <td className="px-5 py-3.5">
                                                <div className="flex flex-col">
                                                    <span className="text-xs font-bold text-slate-700">
                                                        {checkIn!.toLocaleTimeString('en-US', {
                                                            hour: '2-digit',
                                                            minute: '2-digit',
                                                        })}
                                                    </span>
                                                    {record.gracePeriodApplied && (
                                                        <span className="text-[9px] text-slate-400 mt-0.5" title="Check-in was late but within allowed grace period">
                                                            Grace Period
                                                        </span>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="px-5 py-3.5">
                                                {record.isShiftActive ? (
                                                    <span className="inline-flex items-center gap-2 text-blue-500 font-bold text-[10px] uppercase tracking-wider">
                                                        <span className="relative flex h-2 w-2">
                                                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                                                            <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
                                                        </span>
                                                        Active
                                                    </span>
                                                ) : (
                                                    <span className="text-xs font-bold text-slate-700">
                                                        {checkOut
                                                            ? checkOut.toLocaleTimeString('en-US', {
                                                                  hour: '2-digit',
                                                                  minute: '2-digit',
                                                              })
                                                            : '—'}
                                                    </span>
                                                )}
                                            </td>
                                            <td className="px-5 py-3.5">
                                                {record.isShiftActive ? (
                                                    <span className="text-muted-foreground text-xs italic">Live</span>
                                                ) : (
                                                    <span className="text-xs font-bold text-slate-600">
                                                        {hoursWorked > 0 ? `${hoursWorked.toFixed(2)}` : '—'}
                                                    </span>
                                                )}
                                            </td>
                                            <td className="px-5 py-3.5">
                                                {lateMins > 0 ? (
                                                    <span className="text-xs font-bold text-yellow-600">
                                                        {formatLateHrs(lateMins)}
                                                    </span>
                                                ) : record.gracePeriodApplied ? (
                                                    <span className="text-[10px] text-slate-400 font-bold whitespace-nowrap">
                                                        0m (Grace)
                                                    </span>
                                                ) : (
                                                    <span className="text-xs font-bold text-slate-300">—</span>
                                                )}
                                            </td>
                                            <td className="px-5 py-3.5">
                                                <span className="text-xs font-bold text-blue-600">
                                                    {otMins > 0 ? formatHrsMins(otMins / 60) : '—'}
                                                </span>
                                            </td>
                                            <td className="px-5 py-3.5">
                                                <span className="text-xs font-bold text-red-500">
                                                    {utMins > 0 ? formatHrsMins(utMins / 60) : '—'}
                                                </span>
                                            </td>
                                            <td className="px-5 py-3.5">
                                                {statusType === 'in-progress' ? (
                                                    <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider bg-blue-50 text-blue-600 border border-blue-200 w-fit">
                                                        In Progress
                                                    </span>
                                                ) : statusType === 'early-out' ? (
                                                    <div className="flex flex-col">
                                                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider bg-purple-100 text-purple-700 border border-purple-200">
                                                            Early Out
                                                        </span>
                                                        <span className="text-[9px] font-bold text-purple-500 mt-1">Left before shift</span>
                                                    </div>
                                                ) : statusType === 'anomaly' ? (
                                                    <div className="flex flex-col">
                                                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider bg-orange-100 text-orange-700 border border-orange-200">
                                                            <AlertTriangle className="w-3 h-3" />
                                                            Anomaly
                                                        </span>
                                                        <span className="text-[9px] font-bold text-orange-600 mt-1">Out of shift</span>
                                                    </div>
                                                ) : statusType === 'late' ? (
                                                    <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider bg-yellow-50 text-yellow-600 border border-yellow-200 w-fit">
                                                        Late
                                                    </span>
                                                ) : (
                                                    <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider bg-green-50 text-green-600 border border-green-200 w-fit">
                                                        On Time
                                                    </span>
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
                <div className="p-4 bg-slate-50 border-t border-slate-100 shrink-0 flex justify-between items-center">
                    <span className="text-[10px] text-slate-400 font-bold">
                        {records.length} record{records.length !== 1 ? 's' : ''} ·{' '}
                        {employee.totalDays} working days
                    </span>
                    <span className="text-[10px] text-slate-500 font-bold">
                        Total Hours: {employee.totalHours.toFixed(2)}
                    </span>
                </div>
            </div>
        </div>
    );
}
