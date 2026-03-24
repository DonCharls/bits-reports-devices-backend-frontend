import React from 'react';
import { Download, X as XIcon, Clock, Calendar, AlertTriangle } from 'lucide-react';
import { ReportRow, AttendanceRecord } from '../types';
import {
  formatShiftTime,
  formatLateHrs,
  getRecordStatusFromBackend,
  formatHrsMins,
} from '../utils/formatters';

interface EmployeeModalProps {
  employee: ReportRow;
  records: AttendanceRecord[];
  startDate: string;
  endDate: string;
  onClose: () => void;
  onExport: (employee: ReportRow, records: AttendanceRecord[]) => void;
}

export const EmployeeModal: React.FC<EmployeeModalProps> = ({
  employee,
  records,
  startDate,
  endDate,
  onClose,
  onExport,
}) => {
  const attendanceRate =
    employee.totalDays > 0
      ? Math.round((employee.present / employee.totalDays) * 100)
      : 0;

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
              onClick={() => onExport(employee, records)}
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
                color: 'text-slate-800',
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
                <th className="px-5 py-3">Date</th>
                <th className="px-5 py-3">Check In</th>
                <th className="px-5 py-3">Check Out</th>
                <th className="px-5 py-3">Worked Hrs</th>
                <th className="px-5 py-3">Late</th>
                <th className="px-5 py-3">OT</th>
                <th className="px-5 py-3">UT</th>
                <th className="px-5 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {records.length === 0 ? (
                <tr>
                  <td
                    colSpan={8}
                    className="px-5 py-16 text-center text-slate-400 font-bold uppercase text-xs tracking-widest"
                  >
                    No attendance records found
                  </td>
                </tr>
              ) : (
                records.map((record) => {
                  const checkIn = new Date(record.checkInTime);
                  const checkOut = record.checkOutTime
                    ? new Date(record.checkOutTime)
                    : null;
                  
                  // Enforce backend totalHours exclusively
                  const hoursWorked = record.totalHours ?? 0;
                  const statusType = getRecordStatusFromBackend(record);
                  const lateMins = record.lateMinutes ?? 0;
                  const otMins = record.overtimeMinutes ?? 0;
                  const utMins = record.undertimeMinutes ?? 0;

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
                        <span className="text-xs font-bold text-slate-700">
                          {checkIn.toLocaleTimeString('en-US', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      </td>
                      <td className="px-5 py-3.5">
                        <span className="text-xs font-bold text-slate-700">
                          {checkOut
                            ? checkOut.toLocaleTimeString('en-US', {
                                hour: '2-digit',
                                minute: '2-digit',
                              })
                            : '—'}
                        </span>
                      </td>
                      <td className="px-5 py-3.5">
                        <span className="text-xs font-bold text-slate-600">
                          {hoursWorked > 0 ? `${hoursWorked.toFixed(2)}` : '—'}
                        </span>
                      </td>
                      <td className="px-5 py-3.5">
                        <span className="text-xs font-bold text-yellow-600">
                          {lateMins > 0 ? formatLateHrs(lateMins) : '—'}
                        </span>
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
                        {statusType === 'early-out' ? (
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
};
