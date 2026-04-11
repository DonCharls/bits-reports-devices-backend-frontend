import React from 'react';
import { AlertCircle, ChevronLeft, ChevronRight, Edit2 } from 'lucide-react';
import { SortableHeader } from '@/components/ui/SortableHeader';
import { fmtHours, formatLate, fmtMins } from '../utils/attendance-formatters';

interface AttendanceTableProps {
  loading: boolean;
  records: any[];
  sortedRecords: any[];
  sortKeyStr: string | null;
  sortOrder: 'asc' | 'desc' | null;
  handleSort: (key: any) => void;
  currentPage: number;
  setCurrentPage: React.Dispatch<React.SetStateAction<number>>;
  totalPages: number;
  rowsPerPage: number;
  handleEditClick: (row: any) => void;
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
                    <span className={`font-black text-[10px] uppercase px-3 py-1 rounded-full border whitespace-nowrap ${row.status === 'present' ? 'text-emerald-600 bg-emerald-50 border-emerald-100'
                      : row.status === 'late' ? 'text-yellow-600 bg-yellow-50 border-yellow-100'
                        : 'text-red-600 bg-red-50 border-red-100'
                    }`}>
                      {row.status === 'present' ? 'On Time' : row.status}
                    </span>
                    <button onClick={() => handleEditClick(row)} className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all">
                      <Edit2 size={14} />
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                  <div><p className="text-[10px] text-slate-400 font-black uppercase tracking-widest mb-1">Clock In</p><p className="font-mono text-emerald-600 font-black text-sm">{row.checkIn}</p></div>
                  <div><p className="text-[10px] text-slate-400 font-black uppercase tracking-widest mb-1">Clock Out</p>
                    {(row as any).notes?.includes('Early punch detected') ? (
                      <span className="text-[10px] font-bold text-orange-500">🔶 Early punch flagged</span>
                    ) : row.checkOut === '—' && (row as any).notes?.includes('No checkout recorded') ? (
                      <span className="text-[10px] font-bold text-amber-600">⚠️ No checkout</span>
                    ) : (
                      <p className="font-mono text-slate-600 font-black text-sm">{row.checkOut}</p>
                    )}
                  </div>
                  <div><p className="text-[10px] text-slate-400 font-black uppercase tracking-widest mb-1">Shift</p>
                    {row.shiftCode ? <span className={`text-[10px] font-black px-2 py-0.5 rounded-md border ${row.isNightShift ? 'bg-purple-100 text-purple-600 border-purple-200' : 'bg-blue-100 text-blue-600 border-blue-200'}`}>{row.shiftCode}</span> : <span className="text-[10px] text-slate-400 italic font-medium">No shift</span>}
                  </div>
                  <div><p className="text-[10px] text-slate-400 font-black uppercase tracking-widest mb-1">Hours</p><p className="font-mono text-slate-700 font-black text-sm">{fmtHours(row.totalHours)}</p></div>
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
                  <td className={`px-4 py-4 text-sm font-mono font-bold ${row.status === 'late' ? 'text-yellow-600' : row.status === 'present' ? 'text-emerald-600' : 'text-slate-400'}`}>{row.checkIn}</td>
                  <td className="px-4 py-4 text-sm font-mono text-slate-600 font-bold">
                    {(row as any).notes?.includes('Early punch detected') ? (
                      <div className="flex flex-col">
                        {row.checkOut !== '—' ? (
                          <span>{row.checkOut}</span>
                        ) : null}
                        <span className="inline-flex items-center gap-1 text-orange-500 font-bold text-[10px] uppercase tracking-wider whitespace-nowrap mt-0.5" title={(row as any).notes}>
                          <AlertCircle className="w-3 h-3" />
                          Early punch flagged
                        </span>
                      </div>
                    ) : row.checkOut === '—' && (row as any).notes?.includes('No checkout recorded') ? (
                      <span className="inline-flex items-center gap-1 text-amber-600 font-bold text-[10px] uppercase tracking-wider whitespace-nowrap" title={(row as any).notes}>
                        <AlertCircle className="w-3 h-3" />
                        No checkout
                      </span>
                    ) : (
                      row.checkOut
                    )}
                  </td>
                  <td className="px-4 py-4 text-center">
                    {row.lateMinutes > 0 ? (
                      <span className="text-[10px] font-black text-yellow-600 bg-yellow-50 border border-yellow-100 px-2.5 py-1 rounded-full whitespace-nowrap">{formatLate(row.lateMinutes)}</span>
                    ) : <span className="text-[10px] text-slate-300 font-black">—</span>}
                  </td>
                  <td className="px-4 py-4 text-sm font-mono text-slate-700 font-bold text-center">{fmtHours(row.totalHours)}</td>
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
                    <span className={`font-black text-[10px] uppercase px-3 py-1 rounded-full border whitespace-nowrap ${row.status === 'present' ? 'text-emerald-600 bg-emerald-50 border-emerald-100'
                      : row.status === 'late' ? 'text-yellow-600 bg-yellow-50 border-yellow-100'
                        : row.status === 'incomplete' ? 'text-amber-600 bg-amber-50 border-amber-100'
                          : 'text-red-600 bg-red-50 border-red-100'
                    }`}>
                      {row.status === 'present' ? 'On Time' : row.status}
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
      {totalPages > 1 && (
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
          <span className="text-xs font-medium text-slate-400">
            Page {currentPage} of {totalPages} &middot; {records.length} employees
          </span>
          <div className="flex items-center gap-1">
            <button onClick={() => setCurrentPage(p => Math.max(p - 1, 1))} disabled={currentPage === 1}
              className="h-8 w-8 flex items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-red-50 hover:border-red-200 hover:text-red-600 disabled:opacity-40 disabled:cursor-not-allowed transition-all">
              <ChevronLeft size={16} />
            </button>
            {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
              const page = totalPages <= 5 ? i + 1 : currentPage <= 3 ? i + 1 : currentPage >= totalPages - 2 ? totalPages - 4 + i : currentPage - 2 + i;
              return (
                <button key={page} onClick={() => setCurrentPage(page)}
                  className={`h-8 w-8 flex items-center justify-center rounded-lg text-xs font-bold transition-all ${currentPage === page ? 'bg-red-600 text-white border border-red-600 shadow-md shadow-red-600/20' : 'border border-slate-200 text-slate-600 hover:bg-red-50 hover:border-red-200 hover:text-red-600'}`}>
                  {page}
                </button>
              );
            })}
            <button onClick={() => setCurrentPage(p => Math.min(p + 1, totalPages))} disabled={currentPage >= totalPages}
              className="h-8 w-8 flex items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-red-50 hover:border-red-200 hover:text-red-600 disabled:opacity-40 disabled:cursor-not-allowed transition-all">
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
