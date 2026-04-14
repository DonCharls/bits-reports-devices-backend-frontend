import React from 'react';
import { AlertCircle, Edit2, Fingerprint } from 'lucide-react';
import { DataTablePagination } from '@/components/ui/DataTablePagination';
import { SortableHeader } from '@/components/ui/SortableHeader';
import { fmtHours, formatLate, fmtMins } from '../utils/attendance-formatters';
import { AttendanceRecord } from '../types';

interface AttendanceTableProps {
  loading: boolean;
  records: AttendanceRecord[];
  sortedRecords: AttendanceRecord[];
  sortKeyStr: string | null;
  sortOrder: 'asc' | 'desc' | null;
  handleSort: (key: keyof AttendanceRecord) => void;
  currentPage: number;
  setCurrentPage: React.Dispatch<React.SetStateAction<number>>;
  totalPages: number;
  rowsPerPage: number;
  handleEditClick: (row: AttendanceRecord) => void;
}

export function AttendanceTable({
  loading,
  records,
  sortedRecords,
  sortKeyStr,
  sortOrder,
  handleSort,
  currentPage,
  setCurrentPage,
  totalPages,
  rowsPerPage,
  handleEditClick,
}: AttendanceTableProps) {
  return (
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
          <div className="px-6 py-16 text-center text-slate-400 font-black uppercase text-[10px] tracking-widest">No attendance records found</div>
        ) : (
          <div className="divide-y divide-slate-100">
            {sortedRecords.slice((currentPage - 1) * rowsPerPage, currentPage * rowsPerPage).map(row => (
              <div key={row.id} className="p-4 hover:bg-red-50/30 transition-colors">
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-black text-slate-700 text-sm truncate uppercase tracking-tight">{row.employeeName}</p>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-0.5">{row.department} • {row.branchName}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={`font-black text-[10px] uppercase px-3 py-1 rounded-full border whitespace-nowrap ${row.displayStatus === 'present' ? 'text-emerald-600 bg-emerald-50 border-emerald-100'
                      : row.displayStatus === 'IN_PROGRESS' ? 'text-blue-500 bg-blue-500/10 border-blue-500/20'
                      : row.displayStatus === 'late' ? 'text-yellow-600 bg-yellow-50 border-yellow-100'
                        : 'text-red-600 bg-red-50 border-red-100'
                    }`}>
                      {row.displayStatus === 'present' ? 'On Time' : row.displayStatus === 'IN_PROGRESS' ? 'In Progress' : row.displayStatus}
                    </span>
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
                  <div><p className="text-[10px] text-slate-400 font-black uppercase tracking-widest mb-1">Clock Out</p>
                    {row.notes?.includes('Early punch detected') ? (
                      <span className="text-[10px] font-bold text-orange-500">🔶 Early punch flagged</span>
                    ) : row.checkOut === '—' && row.notes?.includes('No checkout recorded') ? (
                      <span className="text-[10px] font-bold text-amber-600">⚠️ No checkout</span>
                    ) : (
                      <>
                        <p className="font-mono text-slate-600 font-black text-sm">{row.checkOut}</p>
                        {row.checkOut !== '—' && (
                          <div title={row.checkOutDevice ?? 'Manual'} className="inline-flex items-center gap-1 mt-1 bg-slate-50 border border-slate-100 px-1.5 py-0.5 rounded-md transition-colors w-fit max-w-[130px]">
                            <Fingerprint className="w-2.5 h-2.5 text-slate-400 shrink-0 opacity-80" />
                            <span className="text-[9px] text-slate-500 font-bold truncate leading-none pt-px">{row.checkOutDevice ?? 'Manual'}</span>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                  <div><p className="text-[10px] text-slate-400 font-black uppercase tracking-widest mb-1">Shift</p>
                    {row.shiftCode ? <span className={`text-[10px] font-black px-2 py-0.5 rounded-md border ${row.isNightShift ? 'bg-purple-100 text-purple-600 border-purple-200' : 'bg-blue-100 text-blue-600 border-blue-200'}`}>{row.shiftCode}</span> : <span className="text-[10px] text-slate-400 italic font-medium">No shift</span>}
                  </div>
                  <div><p className="text-[10px] text-slate-400 font-black uppercase tracking-widest mb-1">Hours</p><p className="font-mono text-slate-700 font-black text-sm">{row.isShiftActive ? <span className="text-slate-400 text-xs italic">Live</span> : fmtHours(row.totalHours)}</p></div>
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
        )}
      </div>

      {/* ── Desktop Table View ── */}
      <div className="overflow-x-auto scrollbar-hide hidden lg:block">
        <table className="w-full text-left text-sm border-collapse min-w-[1100px]">
          <thead className="bg-slate-50 text-slate-400 font-bold uppercase text-[10px] tracking-widest border-b border-slate-100">
            <tr>
              <SortableHeader label="Employee" sortKey="employeeName" currentSortKey={sortKeyStr} currentSortOrder={sortOrder} onSort={handleSort} className="px-6 py-4" />
              <SortableHeader label="Department" sortKey="department" currentSortKey={sortKeyStr} currentSortOrder={sortOrder} onSort={handleSort} className="px-4 py-4" />
              <SortableHeader label="Branch" sortKey="branchName" currentSortKey={sortKeyStr} currentSortOrder={sortOrder} onSort={handleSort} className="px-4 py-4" />
              <SortableHeader label="Shift" sortKey="shiftCode" currentSortKey={sortKeyStr} currentSortOrder={sortOrder} onSort={handleSort} className="px-4 py-4 text-center" />
              <SortableHeader label="Clock In" sortKey="checkIn" currentSortKey={sortKeyStr} currentSortOrder={sortOrder} onSort={handleSort} className="px-4 py-4" />
              <SortableHeader label="Clock Out" sortKey="checkOut" currentSortKey={sortKeyStr} currentSortOrder={sortOrder} onSort={handleSort} className="px-4 py-4" />
              <SortableHeader label="Late" sortKey="lateMinutes" currentSortKey={sortKeyStr} currentSortOrder={sortOrder} onSort={handleSort} className="px-4 py-4 text-center text-yellow-500" />
              <SortableHeader label="Hours" sortKey="totalHours" currentSortKey={sortKeyStr} currentSortOrder={sortOrder} onSort={handleSort} className="px-4 py-4 text-center" />
              <SortableHeader label="OT" sortKey="overtimeMinutes" currentSortKey={sortKeyStr} currentSortOrder={sortOrder} onSort={handleSort} className="px-4 py-4 text-center text-emerald-500" />
              <SortableHeader label="UT" sortKey="undertimeMinutes" currentSortKey={sortKeyStr} currentSortOrder={sortOrder} onSort={handleSort} className="px-4 py-4 text-center text-red-500" />
              <SortableHeader label="Status" sortKey="status" currentSortKey={sortKeyStr} currentSortOrder={sortOrder} onSort={handleSort} className="px-4 py-4 text-center" />
              <th className="px-4 py-4 text-center">Actions</th>
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
              <tr><td colSpan={12} className="px-6 py-16 text-center text-slate-400 font-black uppercase text-[10px] tracking-widest">No attendance records found</td></tr>
            ) : (
              sortedRecords.slice((currentPage - 1) * rowsPerPage, currentPage * rowsPerPage).map(row => (
                <tr key={row.id} className="hover:bg-red-50/40 transition-colors duration-200 group cursor-default">
                  <td className="px-6 py-4 flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-red-600/20 flex items-center justify-center text-red-600 font-bold text-[10px] shrink-0 uppercase tracking-tight">{row.employeeName.charAt(0)}</div>
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-slate-700 leading-tight uppercase tracking-tight">{row.employeeName}</p>
                      <p className="text-[10px] text-slate-400 font-medium uppercase tracking-widest mt-0.5">{row.branchName}</p>
                    </div>
                  </td>
                  <td className="px-4 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest leading-none">{row.department}</td>
                  <td className="px-4 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest leading-none">{row.branchName}</td>
                  <td className="px-4 py-4 text-center">
                    {row.shiftCode ? (
                      <span className={`text-[9px] font-black px-2.5 py-1 rounded-lg border uppercase tracking-widest whitespace-nowrap ${row.isNightShift ? 'bg-purple-100 text-purple-600 border-purple-200' : 'bg-blue-100 text-blue-600 border-blue-200'}`}>{row.shiftCode}</span>
                    ) : (
                      <span className="text-[10px] text-slate-400 italic font-medium">No Shift</span>
                    )}
                  </td>
                  <td className={`px-4 py-4 text-sm font-mono font-bold ${row.status === 'late' ? 'text-yellow-600' : row.status === 'present' ? 'text-emerald-600' : 'text-slate-400'}`}>
                    <div className="flex flex-col">
                      <span>{row.checkIn}</span>
                      {row.gracePeriodApplied && (
                        <span className="text-[9px] text-slate-400 mt-0.5" title="Check-in was late but within allowed grace period">Grace Period</span>
                      )}
                      {row.checkIn !== '—' && (
                        <div title={row.checkInDevice ?? 'Manual'} className="inline-flex items-center gap-1 mt-1 bg-slate-50 hover:bg-slate-100/50 border border-slate-100 px-1.5 py-0.5 rounded-md transition-colors w-fit max-w-[130px]">
                          <Fingerprint className="w-2.5 h-2.5 text-slate-400 shrink-0 opacity-80" />
                          <span className="text-[9px] text-slate-500 font-bold truncate leading-none pt-px">{row.checkInDevice ?? 'Manual'}</span>
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-4 text-sm font-mono text-slate-600 font-bold">
                    {(row as any).notes?.includes('Early punch detected') ? (
                      <div className="flex flex-col">
                        {row.isShiftActive ? (
                          <span className="inline-flex items-center gap-2 text-blue-500 font-bold text-[10px] uppercase tracking-wider">
                            <span className="relative flex h-2 w-2"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span><span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span></span>Active
                          </span>
                        ) : row.checkOut !== '—' ? (
                          <span>{row.checkOut}</span>
                        ) : null}
                        <span className="inline-flex items-center gap-1 text-orange-500 font-bold text-[10px] uppercase tracking-wider whitespace-nowrap mt-0.5" title={(row as any).notes}>
                          <AlertCircle className="w-3 h-3" /> Early punch flagged
                        </span>
                      </div>
                    ) : row.isShiftActive ? (
                      <span className="inline-flex items-center gap-2 text-blue-500 font-bold text-[10px] uppercase tracking-wider">
                        <span className="relative flex h-2 w-2"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span><span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span></span>Active
                      </span>
                    ) : row.checkOut === '—' && (row as any).notes?.includes('No checkout recorded') ? (
                      <span className="inline-flex items-center gap-1 text-amber-600 font-bold text-[10px] uppercase tracking-wider whitespace-nowrap" title={(row as any).notes}>
                        <AlertCircle className="w-3 h-3" /> No checkout
                      </span>
                    ) : (
                      <div className="flex flex-col">
                        <span>{row.checkOut}</span>
                        {row.checkOut !== '—' && (
                          <div title={row.checkOutDevice ?? 'Manual'} className="inline-flex items-center gap-1 mt-1 bg-slate-50 hover:bg-slate-100/50 border border-slate-100 px-1.5 py-0.5 rounded-md transition-colors w-fit max-w-[130px]">
                            <Fingerprint className="w-2.5 h-2.5 text-slate-400 shrink-0 opacity-80" />
                            <span className="text-[9px] text-slate-500 font-bold truncate leading-none pt-px">{row.checkOutDevice ?? 'Manual'}</span>
                          </div>
                        )}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-4 text-center">
                    {row.lateMinutes > 0 ? (
                      <span className="text-[10px] font-black text-yellow-600 bg-yellow-50 border border-yellow-100 px-2.5 py-1 rounded-full whitespace-nowrap">{formatLate(row.lateMinutes)}</span>
                    ) : row.gracePeriodApplied ? (
                      <span className="text-[10px] text-slate-400 font-bold whitespace-nowrap">0m (Grace)</span>
                    ) : <span className="text-[10px] text-slate-300 font-black">—</span>}
                  </td>
                  <td className="px-4 py-4 text-sm font-mono text-slate-700 font-bold text-center">
                    {row.isShiftActive ? <span className="text-slate-400 text-xs italic">Live</span> : fmtHours(row.totalHours)}
                  </td>
                  <td className="px-4 py-4 text-center">
                    <span className={`text-sm font-bold ${row.overtimeMinutes > 0 ? 'text-emerald-600' : 'text-slate-300'}`}>
                      {row.overtimeMinutes > 0 ? `+${fmtMins(row.overtimeMinutes)}` : '—'}
                    </span>
                  </td>
                  <td className="px-4 py-4 text-center">
                    <span className={`text-sm font-bold ${row.undertimeMinutes > 0 ? 'text-red-500' : 'text-slate-300'}`}>
                      {row.undertimeMinutes > 0 ? `-${fmtMins(row.undertimeMinutes)}` : '—'}
                    </span>
                  </td>
                  <td className="px-4 py-4 text-center">
                    <span className={`font-black text-[10px] uppercase px-3 py-1 rounded-full border whitespace-nowrap ${row.displayStatus === 'present' ? 'text-emerald-600 bg-emerald-50 border-emerald-100'
                      : row.displayStatus === 'IN_PROGRESS' ? 'text-blue-500 bg-blue-500/10 border-blue-500/20'
                        : row.displayStatus === 'late' ? 'text-yellow-600 bg-yellow-50 border-yellow-100'
                          : row.displayStatus === 'incomplete' ? 'text-amber-600 bg-amber-50 border-amber-100'
                            : 'text-red-600 bg-red-50 border-red-100'
                    }`}>
                      {row.displayStatus === 'present' ? 'On Time' : row.displayStatus === 'IN_PROGRESS' ? 'In Progress' : row.displayStatus}
                    </span>
                  </td>
                  <td className="px-4 py-4 text-center">
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
      <DataTablePagination
        currentPage={currentPage}
        totalPages={totalPages}
        onPageChange={setCurrentPage}
        totalCount={records.length}
        pageSize={rowsPerPage}
        entityName="attendance records"
        loading={loading}
      />
    </div>
  );
}
