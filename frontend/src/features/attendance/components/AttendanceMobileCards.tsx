import React from 'react'
import { Edit2, Fingerprint, PenLine, AlertTriangle } from 'lucide-react'
import { fmtHours, formatLate, fmtMins } from '../utils/attendance-formatters'
import { AttendanceRecord } from '../types'

interface AttendanceMobileCardsProps {
  loading: boolean
  records: AttendanceRecord[]
  sortedRecords: AttendanceRecord[]
  currentPage: number
  rowsPerPage: number
  handleEditClick: (row: AttendanceRecord) => void
}

export function AttendanceMobileCards({
  loading,
  records,
  sortedRecords,
  currentPage,
  rowsPerPage,
  handleEditClick,
}: AttendanceMobileCardsProps) {
  if (loading) {
    return (
      <div className="px-6 py-16 text-center">
        <div className="flex flex-col items-center gap-2 text-slate-400">
          <div className="w-6 h-6 border-2 border-red-500 border-t-transparent rounded-full animate-spin" />
          <span className="text-sm font-medium">Loading attendance...</span>
        </div>
      </div>
    )
  }

  if (records.length === 0) {
    return (
      <div className="px-6 py-16 text-center text-slate-400 font-black uppercase text-[10px] tracking-widest">
        No attendance records found
      </div>
    )
  }

  return (
    <div className="divide-y divide-slate-100">
      {sortedRecords.slice((currentPage - 1) * rowsPerPage, currentPage * rowsPerPage).map(row => (
        <div key={row.id} className="p-4 hover:bg-red-50/30 transition-colors">
          <div className="flex items-start justify-between gap-2 mb-3">
            <div className="min-w-0 flex-1">
              <p className="font-black text-slate-700 text-sm truncate uppercase tracking-tight">{row.employeeName}</p>
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-0.5">{row.department} • {row.branchName}</p>
            </div>
            <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
              <span className={`font-black text-[10px] uppercase px-3 py-1 rounded-full border whitespace-nowrap ${
                row.displayStatus === 'present' ? 'text-emerald-600 bg-emerald-50 border-emerald-100'
                : row.displayStatus === 'IN_PROGRESS' ? 'text-blue-500 bg-blue-500/10 border-blue-500/20'
                : row.displayStatus === 'late' ? 'text-yellow-600 bg-yellow-50 border-yellow-100'
                : row.displayStatus === 'missing_checkout' ? 'text-amber-700 bg-amber-50 border-amber-200'
                : 'text-red-600 bg-red-50 border-red-100'
              }`}>
                {row.displayStatus === 'present' ? 'On Time' : row.displayStatus === 'IN_PROGRESS' ? 'In Progress' : row.displayStatus === 'missing_checkout' ? 'Missing Checkout' : row.displayStatus}
              </span>
              {row.isEdited && (
                <span className="font-black text-[10px] uppercase px-2 py-0.5 rounded-full border whitespace-nowrap text-violet-600 bg-violet-50 border-violet-100">
                  Edited
                </span>
              )}
              <button onClick={() => handleEditClick(row)} className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all">
                <Edit2 size={14} />
              </button>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-2">
            <div>
              <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest mb-1">Clock In</p>
              <p className="font-mono text-emerald-600 font-black text-sm">{row.checkIn}</p>
              {row.checkIn !== '—' && (
                <div title={row.checkInDevice ?? 'Manual'} className="inline-flex items-center gap-1 mt-1 bg-slate-50 border border-slate-100 px-1.5 py-0.5 rounded-md transition-colors w-fit max-w-[130px]">
                  <Fingerprint className="w-2.5 h-2.5 text-slate-400 shrink-0 opacity-80" />
                  <span className="text-[9px] text-slate-500 font-bold truncate leading-none pt-px">{row.checkInDevice ?? 'Manual'}</span>
                </div>
              )}
            </div>
            <div>
              <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest mb-1">Clock Out</p>
              {row.notes?.includes('Early punch detected') ? (
                <span className="text-[10px] font-bold text-orange-500">Early punch flagged</span>
              ) : row.displayStatus === 'missing_checkout' ? (
                <div className="flex flex-col gap-1">
                  <span className="text-[10px] font-bold text-amber-600">No checkout</span>
                  <button onClick={() => handleEditClick(row)} className="text-[10px] font-bold text-red-600 hover:text-red-700 hover:underline transition-colors">Resolve</button>
                </div>
              ) : row.checkOut === '—' && row.notes?.includes('No checkout recorded') ? (
                <div className="flex flex-col gap-1">
                  <span className="text-[10px] font-bold text-amber-600">No checkout</span>
                  <button onClick={() => handleEditClick(row)} className="text-[10px] font-bold text-red-600 hover:text-red-700 hover:underline transition-colors">Resolve</button>
                </div>
              ) : (
                <>
                  <p className="font-mono text-slate-600 font-black text-sm">
                    {row.checkoutSource === 'auto_closed' && <span title="Auto-closed (estimated)"><AlertTriangle className="w-3 h-3 text-amber-500 inline mr-0.5" /></span>}
                    {row.checkOut}
                    {row.checkoutSource === 'auto_closed' && <span className="text-[9px] text-amber-600 font-bold ml-1">(estimated)</span>}
                  </p>
                  {row.checkOut !== '—' && (
                    row.checkoutSource === 'manual' ? (
                      <div title="Manually set" className="inline-flex items-center gap-1 mt-1 bg-amber-50 border border-amber-100 px-1.5 py-0.5 rounded-md transition-colors w-fit max-w-[130px]">
                        <PenLine className="w-2.5 h-2.5 text-amber-500 shrink-0 opacity-80" />
                        <span className="text-[9px] text-amber-600 font-bold truncate leading-none pt-px">Manual</span>
                      </div>
                    ) : row.checkoutSource === 'auto_closed' ? (
                      <div title="Auto-closed — estimated checkout" className="inline-flex items-center gap-1 mt-1 bg-amber-50 border border-amber-100 px-1.5 py-0.5 rounded-md transition-colors w-fit max-w-[130px]">
                        <AlertTriangle className="w-2.5 h-2.5 text-amber-500 shrink-0 opacity-80" />
                        <span className="text-[9px] text-amber-600 font-bold truncate leading-none pt-px">Auto-Closed</span>
                      </div>
                    ) : (
                      <div title={row.checkOutDevice ?? 'Manual'} className="inline-flex items-center gap-1 mt-1 bg-slate-50 border border-slate-100 px-1.5 py-0.5 rounded-md transition-colors w-fit max-w-[130px]">
                        <Fingerprint className="w-2.5 h-2.5 text-slate-400 shrink-0 opacity-80" />
                        <span className="text-[9px] text-slate-500 font-bold truncate leading-none pt-px">{row.checkOutDevice ?? 'Manual'}</span>
                      </div>
                    )
                  )}
                </>
              )}
            </div>
            <div>
              <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest mb-1">Shift</p>
              {row.shiftCode
                ? <span className={`text-[10px] font-black px-2 py-0.5 rounded-md border ${row.isNightShift ? 'bg-purple-100 text-purple-600 border-purple-200' : 'bg-blue-100 text-blue-600 border-blue-200'}`}>{row.shiftCode}</span>
                : <span className="text-[10px] text-slate-400 italic font-medium">No shift</span>
              }
            </div>
            <div>
              <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest mb-1">Hours</p>
              <p className="font-mono text-slate-700 font-black text-sm">
                {row.isShiftActive ? <span className="text-slate-400 text-xs italic">Live</span> : fmtHours(row.totalHours)}
              </p>
            </div>
          </div>
          {(row.lateMinutes > 0 || row.overtimeMinutes > 0 || row.undertimeMinutes > 0) && (
            <div className="flex items-center gap-3 mt-2 pt-2 border-t border-slate-50">
              {row.lateMinutes > 0 && <span className="text-[10px] font-bold text-yellow-600 bg-yellow-50 border border-yellow-100 px-2 py-0.5 rounded-full">Late {formatLate(row.lateMinutes)}</span>}
              {row.overtimeMinutes > 0 && <span className="text-[10px] font-bold text-emerald-600">OT +{fmtMins(row.overtimeMinutes)}</span>}
              {row.undertimeMinutes > 0 && <span className="text-[10px] font-bold text-red-500">UT -{fmtMins(row.undertimeMinutes)}</span>}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
