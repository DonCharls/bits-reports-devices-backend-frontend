"use client"
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { History, Search, CalendarSearch, X, ChevronLeft, ChevronRight, Loader2, CheckCircle2, XCircle, Clock } from 'lucide-react';
import { useHorizontalDragScroll } from '@/hooks/useHorizontalDragScroll';
import { useTableSort } from '@/hooks/useTableSort';
import { SortableHeader } from '@/components/ui/SortableHeader';

interface Adjustment {
  id: number;
  attendanceId: number;
  originalCheckIn: string | null;
  originalCheckOut: string | null;
  requestedCheckIn: string | null;
  requestedCheckOut: string | null;
  reason: string;
  status: string;
  rejectionReason: string | null;
  submittedAt: string;
  reviewedAt: string | null;
  attendance: {
    date: string;
    employee: {
      firstName: string;
      lastName: string;
      middleName?: string | null;
      suffix?: string | null;
      branch: string | null;
      Department?: { name: string } | null;
    };
  };
  submittedBy: { firstName: string; lastName: string };
  reviewedBy: { firstName: string; lastName: string } | null;
}

function formatTime(iso: string | null): string {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleTimeString('en-US', {
      timeZone: 'Asia/Manila', hour: '2-digit', minute: '2-digit', hour12: true,
    });
  } catch { return '—'; }
}

function formatTimestamp(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString('en-US', {
      timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hour12: true,
    });
  } catch { return iso; }
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('en-US', {
      timeZone: 'Asia/Manila', month: 'short', day: 'numeric', year: 'numeric',
    });
  } catch { return iso; }
}

function empName(emp: any): string {
  if (!emp) return 'Unknown';
  return `${emp.firstName}${emp.middleName ? ` ${emp.middleName[0]}.` : ''} ${emp.lastName}${emp.suffix ? ` ${emp.suffix}` : ''}`;
}

const statusConfig: Record<string, { label: string; bg: string; text: string; border: string; icon: any }> = {
  pending: { label: 'Pending', bg: 'bg-yellow-50', text: 'text-yellow-700', border: 'border-yellow-200', icon: Clock },
  approved: { label: 'Approved', bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200', icon: CheckCircle2 },
  rejected: { label: 'Rejected', bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-200', icon: XCircle },
};

export default function AdjustmentsPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [logDate, setLogDate] = useState("");
  const logDateRef = useRef<HTMLInputElement>(null);
  const dragScrollRef = useHorizontalDragScroll();

  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 15;

  const [adjustments, setAdjustments] = useState<Adjustment[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalCount, setTotalCount] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  const fetchAdjustments = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      params.set('page', String(currentPage));
      params.set('limit', String(itemsPerPage));
      if (searchQuery) params.set('search', searchQuery);
      if (statusFilter) params.set('status', statusFilter);

      const res = await fetch(`/api/attendance/adjustments?${params.toString()}`, { credentials: 'include' });
      if (res.status === 401) { window.location.href = '/login'; return; }
      const data = await res.json();

      if (data.success) {
        setAdjustments(data.data);
        setTotalCount(data.meta.total);
        setTotalPages(data.meta.totalPages);
      }
    } catch (err) {
      console.error('Failed to fetch adjustments:', err);
    } finally {
      setLoading(false);
    }
  }, [currentPage, searchQuery, statusFilter]);

  useEffect(() => { fetchAdjustments(); }, [fetchAdjustments]);
  useEffect(() => { setCurrentPage(1); }, [searchQuery, statusFilter, logDate]);

  const { sortedData: sortedAdjustments, sortKey, sortOrder, handleSort } = useTableSort<Adjustment>({
    initialData: adjustments
  });
  const sortKeyStr = sortKey as string | null;

  const formatDateLabel = (dateStr: string) => {
    if (!dateStr) return "Select Date";
    const [year, month, day] = dateStr.split("-");
    return `${day}/${month}/${year}`;
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row justify-between lg:items-center gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-800 tracking-tight leading-none">Adjustment Logs</h1>
          <p className="text-slate-500 text-sm font-medium mt-1">Track attendance adjustment requests and their approval status</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col md:flex-row items-center bg-white p-2 rounded-2xl border border-slate-200 shadow-sm gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input
            type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search employee or HR..."
            className="w-full md:w-64 pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-red-400/20 outline-none transition-all"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2 ml-auto">
          <div className="relative">
            <input type="date" ref={logDateRef} value={logDate} onChange={(e) => setLogDate(e.target.value)}
              className="absolute opacity-0 pointer-events-none" />
            <button onClick={() => logDateRef.current?.showPicker()}
              className="min-w-[180px] flex items-center justify-between px-5 py-3 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-600 outline-none shadow-sm hover:border-red-200 transition-all">
              <div className="flex items-center gap-3">
                <CalendarSearch size={14} className="text-slate-400" />
                <span>{formatDateLabel(logDate)}</span>
              </div>
              {logDate && (
                <X size={14} className="text-slate-400 hover:text-red-500 transition-colors"
                  onClick={(e) => { e.stopPropagation(); setLogDate(""); }} />
              )}
            </button>
          </div>

          {/* Status filter buttons */}
          <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-1">
            {[
              { value: '', label: 'All' },
              { value: 'pending', label: 'Pending' },
              { value: 'approved', label: 'Approved' },
              { value: 'rejected', label: 'Rejected' },
            ].map(s => (
              <button key={s.value} onClick={() => setStatusFilter(s.value)}
                className={`px-3 py-1.5 rounded-md text-[10px] font-black uppercase tracking-wider transition-all ${statusFilter === s.value
                  ? 'bg-red-600 text-white shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
                }`}>
                {s.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div ref={dragScrollRef} className="overflow-x-auto scrollbar-hide">
          <table className="w-full text-left text-sm border-collapse table-auto min-w-[1100px]">
            <thead className="bg-slate-50 text-slate-400 font-bold uppercase text-[10px] tracking-widest border-b border-slate-100">
              <tr>
                <SortableHeader label="Submitted" sortKey="submittedAt" currentSortKey={sortKeyStr} currentSortOrder={sortOrder} onSort={handleSort} className="px-4 py-3.5" />
                <SortableHeader label="Employee" sortKey="attendance.employee.lastName" currentSortKey={sortKeyStr} currentSortOrder={sortOrder} onSort={handleSort} className="px-4 py-3.5" />
                <th className="px-4 py-3.5">Original Time</th>
                <th className="px-4 py-3.5">Requested Time</th>
                <th className="px-4 py-3.5">Reason</th>
                <SortableHeader label="Submitted By" sortKey="submittedBy.lastName" currentSortKey={sortKeyStr} currentSortOrder={sortOrder} onSort={handleSort} className="px-4 py-3.5" />
                <SortableHeader label="Status" sortKey="status" currentSortKey={sortKeyStr} currentSortOrder={sortOrder} onSort={handleSort} className="px-4 py-3.5 text-center" />
                <th className="px-4 py-3.5">Reviewed By</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={8} className="px-6 py-24 text-center">
                    <div className="flex items-center justify-center gap-2 text-slate-400">
                      <Loader2 className="w-5 h-5 animate-spin" />
                      <span className="font-bold uppercase text-[10px] tracking-widest">Loading adjustments...</span>
                    </div>
                  </td>
                </tr>
              ) : sortedAdjustments.length > 0 ? sortedAdjustments.map((adj) => {
                const sc = statusConfig[adj.status] || statusConfig.pending;
                const StatusIcon = sc.icon;
                return (
                  <tr key={adj.id} className="hover:bg-red-50/40 transition-colors duration-200 cursor-default">
                    <td className="px-4 py-3 font-mono text-[10px] text-slate-500 whitespace-nowrap">
                      {formatTimestamp(adj.submittedAt)}
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-bold text-slate-700 text-sm">{empName(adj.attendance?.employee)}</p>
                      <p className="text-[10px] text-slate-400 font-medium">{adj.attendance?.employee?.branch || '—'} • {adj.attendance?.employee?.Department?.name || '—'}</p>
                      <p className="text-[10px] text-slate-400 font-medium mt-0.5">{formatDate(adj.attendance?.date)}</p>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="text-[10px] text-slate-500">
                        <div>In: <span className="font-mono font-bold">{formatTime(adj.originalCheckIn)}</span></div>
                        <div>Out: <span className="font-mono font-bold">{formatTime(adj.originalCheckOut)}</span></div>
                      </div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="text-[10px] text-emerald-600 font-bold">
                        <div>In: <span className="font-mono">{formatTime(adj.requestedCheckIn)}</span></div>
                        <div>Out: <span className="font-mono">{formatTime(adj.requestedCheckOut)}</span></div>
                      </div>
                    </td>
                    <td className="px-4 py-3 max-w-[200px]">
                      <p className="text-[11px] font-medium text-slate-600 leading-relaxed truncate" title={adj.reason}>{adj.reason}</p>
                      {adj.rejectionReason && (
                        <p className="text-[10px] text-red-500 font-medium mt-1 truncate" title={adj.rejectionReason}>
                          ❌ {adj.rejectionReason}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3 font-bold text-slate-700 text-sm whitespace-nowrap">
                      {adj.submittedBy ? `${adj.submittedBy.firstName} ${adj.submittedBy.lastName}` : '—'}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-flex items-center gap-1 font-black text-[10px] uppercase px-3 py-1 rounded-full border whitespace-nowrap ${sc.bg} ${sc.text} ${sc.border}`}>
                        <StatusIcon size={10} />
                        {sc.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-500 whitespace-nowrap">
                      {adj.reviewedBy ? (
                        <div>
                          <p className="font-bold text-slate-700">{adj.reviewedBy.firstName} {adj.reviewedBy.lastName}</p>
                          {adj.reviewedAt && <p className="text-[10px] text-slate-400">{formatTimestamp(adj.reviewedAt)}</p>}
                        </div>
                      ) : '—'}
                    </td>
                  </tr>
                );
              }) : (
                <tr>
                  <td colSpan={8} className="px-6 py-24 text-center text-slate-400 font-bold uppercase text-[10px] tracking-widest">
                    No adjustment logs found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
              Showing <span className="text-slate-700">{((currentPage - 1) * itemsPerPage) + 1}</span> to <span className="text-slate-700">{Math.min(currentPage * itemsPerPage, totalCount)}</span> of <span className="text-slate-700">{totalCount}</span> records
            </p>
            <div className="flex items-center gap-2">
              <button onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))} disabled={currentPage === 1}
                className="p-2 bg-white border border-slate-200 rounded-lg text-slate-400 hover:text-red-600 disabled:opacity-50 transition-all shadow-sm">
                <ChevronLeft size={16} />
              </button>
              <div className="flex items-center gap-1">
                {[...Array(Math.min(totalPages, 5))].map((_, i) => {
                  const pageNum = totalPages <= 5 ? i + 1 : Math.max(1, Math.min(currentPage - 2, totalPages - 4)) + i;
                  return (
                    <button key={pageNum} onClick={() => setCurrentPage(pageNum)}
                      className={`w-8 h-8 rounded-lg text-xs font-black transition-all ${currentPage === pageNum ? 'bg-red-600 text-white shadow-md shadow-red-200' : 'bg-white border border-slate-200 text-slate-400 hover:bg-slate-50'}`}>
                      {pageNum}
                    </button>
                  );
                })}
              </div>
              <button onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))} disabled={currentPage === totalPages || totalPages === 0}
                className="p-2 bg-white border border-slate-200 rounded-lg text-slate-400 hover:text-red-600 disabled:opacity-50 transition-all shadow-sm">
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}