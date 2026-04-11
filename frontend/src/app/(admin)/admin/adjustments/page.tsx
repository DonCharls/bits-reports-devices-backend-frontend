"use client"

export const dynamic = 'force-dynamic'

import React, { useState, useEffect, useCallback } from 'react';
import { useToast } from '@/hooks/useToast';
import ToastContainer from '@/components/ui/ToastContainer';
import { Search, Loader2, CheckCircle2, XCircle, Clock, ChevronLeft, ChevronRight, AlertCircle, X } from 'lucide-react';
import { useHorizontalDragScroll } from '@/hooks/useHorizontalDragScroll';

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
    return d.toLocaleTimeString('en-US', { timeZone: 'Asia/Manila', hour: '2-digit', minute: '2-digit', hour12: true });
  } catch { return '—'; }
}

function formatTimestamp(iso: string): string {
  try {
    return new Date(iso).toLocaleString('en-US', {
      timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hour12: true,
    });
  } catch { return iso; }
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-US', {
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

export default function AdminAdjustmentsPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('pending');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 15;
  const dragScrollRef = useHorizontalDragScroll();

  const [adjustments, setAdjustments] = useState<Adjustment[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalCount, setTotalCount] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  // Reject modal state
  const [rejectingId, setRejectingId] = useState<number | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const { toasts, showToast, dismissToast } = useToast();

  // Approve confirmation modal
  const [approvingId, setApprovingId] = useState<number | null>(null);

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
  useEffect(() => { setCurrentPage(1); }, [searchQuery, statusFilter]);


  const handleApprove = async (id: number) => {
    setApprovingId(null);
    setActionLoading(true);
    try {
      const res = await fetch(`/api/attendance/adjustments/${id}/review`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ action: 'approve' }),
      });
      const data = await res.json();
      if (data.success) {
        showToast('success', 'Adjustment Approved', 'Adjustment approved and applied!');
        fetchAdjustments();
      } else {
        showToast('error', 'Approval Failed', data.message || 'Failed to approve');
      }
    } catch (e: any) {
      showToast('error', 'Approval Failed', e.message || 'Network error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleReject = async () => {
    if (!rejectingId) return;
    if (!rejectionReason.trim()) {
      showToast('warning', 'Reason Required', 'Please provide a reason for rejection.');
      return;
    }
    setActionLoading(true);
    try {
      const res = await fetch(`/api/attendance/adjustments/${rejectingId}/review`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ action: 'reject', rejectionReason: rejectionReason.trim() }),
      });
      const data = await res.json();
      if (data.success) {
        showToast('success', 'Adjustment Rejected', 'Adjustment rejected.');
        setRejectingId(null);
        setRejectionReason('');
        fetchAdjustments();
      } else {
        showToast('error', 'Rejection Failed', data.message || 'Failed to reject');
      }
    } catch (e: any) {
      showToast('error', 'Rejection Failed', e.message || 'Network error');
    } finally {
      setActionLoading(false);
    }
  };

  const pendingCount = statusFilter === 'pending' ? totalCount : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black text-slate-800 tracking-tight">Approval Queue</h1>
          <p className="text-slate-500 text-sm font-medium mt-0.5">Review and approve attendance adjustments submitted by HR</p>
        </div>
        {pendingCount !== null && pendingCount > 0 && (
          <div className="flex items-center gap-2 px-4 py-2 bg-yellow-50 border border-yellow-200 rounded-xl">
            <Clock className="w-4 h-4 text-yellow-600" />
            <span className="text-sm font-bold text-yellow-700">{pendingCount} pending</span>
          </div>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-col md:flex-row items-center bg-white p-2 rounded-2xl border border-slate-200 shadow-sm gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input placeholder="Search employee or HR..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium outline-none focus:ring-2 focus:ring-red-500/20" />
        </div>
        <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-1">
          {[
            { value: 'pending', label: 'Pending' },
            { value: 'approved', label: 'Approved' },
            { value: 'rejected', label: 'Rejected' },
            { value: '', label: 'All' },
          ].map(s => (
            <button key={s.value} onClick={() => setStatusFilter(s.value)}
              className={`px-3 py-1.5 rounded-md text-[10px] font-black uppercase tracking-wider transition-all ${statusFilter === s.value ? 'bg-red-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div ref={dragScrollRef} className="overflow-x-auto scrollbar-hide">
          <table className="w-full text-left text-sm border-collapse table-auto min-w-[1200px]">
            <thead className="bg-slate-50 text-slate-400 font-bold uppercase text-[10px] tracking-widest border-b border-slate-100">
              <tr>
                <th className="px-4 py-3.5">Submitted</th>
                <th className="px-4 py-3.5">Employee</th>
                <th className="px-4 py-3.5">Att. Date</th>
                <th className="px-4 py-3.5">Original Time</th>
                <th className="px-4 py-3.5">Requested Time</th>
                <th className="px-4 py-3.5">Reason</th>
                <th className="px-4 py-3.5">Submitted By</th>
                <th className="px-4 py-3.5 text-center">Status</th>
                <th className="px-4 py-3.5 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={9} className="px-6 py-24 text-center">
                    <div className="flex items-center justify-center gap-2 text-slate-400">
                      <Loader2 className="w-5 h-5 animate-spin" />
                      <span className="font-bold uppercase text-[10px] tracking-widest">Loading...</span>
                    </div>
                  </td>
                </tr>
              ) : adjustments.length > 0 ? adjustments.map((adj) => {
                const sc = statusConfig[adj.status] || statusConfig.pending;
                const StatusIcon = sc.icon;
                return (
                  <tr key={adj.id} className="hover:bg-red-50/40 transition-colors duration-200">
                    <td className="px-4 py-3 font-mono text-[10px] text-slate-500 whitespace-nowrap">{formatTimestamp(adj.submittedAt)}</td>
                    <td className="px-4 py-3">
                      <p className="font-bold text-slate-700 text-sm">{empName(adj.attendance?.employee)}</p>
                      <p className="text-[10px] text-slate-400">{adj.attendance?.employee?.branch || '—'} • {adj.attendance?.employee?.Department?.name || '—'}</p>
                    </td>
                    <td className="px-4 py-3 text-xs font-bold text-slate-600 whitespace-nowrap">{formatDate(adj.attendance?.date)}</td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="text-[10px] text-slate-500">
                        <div>In: <span className="font-mono font-bold">{formatTime(adj.originalCheckIn)}</span></div>
                        <div>Out: <span className="font-mono font-bold">{formatTime(adj.originalCheckOut)}</span></div>
                      </div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="text-[10px] text-blue-600 font-bold">
                        <div>In: <span className="font-mono">{formatTime(adj.requestedCheckIn)}</span></div>
                        <div>Out: <span className="font-mono">{formatTime(adj.requestedCheckOut)}</span></div>
                      </div>
                    </td>
                    <td className="px-4 py-3 max-w-[180px]">
                      <p className="text-[11px] font-medium text-slate-600 truncate" title={adj.reason}>{adj.reason}</p>
                      {adj.rejectionReason && (
                        <p className="text-[10px] text-red-500 font-medium mt-1 truncate" title={adj.rejectionReason}>❌ {adj.rejectionReason}</p>
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
                    <td className="px-4 py-3 text-center">
                      {adj.status === 'pending' ? (
                        <div className="flex items-center justify-center gap-1.5">
                          <button onClick={() => setApprovingId(adj.id)} disabled={actionLoading}
                            className="px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-[10px] font-black uppercase tracking-wider hover:bg-emerald-700 transition-all shadow-sm disabled:opacity-50 active:scale-95">
                            ✅ Approve
                          </button>
                          <button onClick={() => { setRejectingId(adj.id); setRejectionReason(''); }} disabled={actionLoading}
                            className="px-3 py-1.5 bg-red-600 text-white rounded-lg text-[10px] font-black uppercase tracking-wider hover:bg-red-700 transition-all shadow-sm disabled:opacity-50 active:scale-95">
                            ❌ Reject
                          </button>
                        </div>
                      ) : (
                        <span className="text-[10px] text-slate-400 font-medium">
                          {adj.reviewedBy ? `${adj.reviewedBy.firstName} ${adj.reviewedBy.lastName}` : '—'}
                          {adj.reviewedAt && <><br />{formatTimestamp(adj.reviewedAt)}</>}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              }) : (
                <tr>
                  <td colSpan={9} className="px-6 py-24 text-center text-slate-400 font-bold uppercase text-[10px] tracking-widest">
                    {statusFilter === 'pending' ? 'No pending adjustments — all caught up! 🎉' : 'No adjustment records found'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
              Page <span className="text-slate-700">{currentPage}</span> of <span className="text-slate-700">{totalPages}</span> · {totalCount} total
            </p>
            <div className="flex items-center gap-1">
              <button onClick={() => setCurrentPage(p => Math.max(p - 1, 1))} disabled={currentPage === 1}
                className="h-8 w-8 flex items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-red-50 disabled:opacity-40 transition-all">
                <ChevronLeft size={16} />
              </button>
              {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                const page = totalPages <= 5 ? i + 1 : currentPage <= 3 ? i + 1 : currentPage >= totalPages - 2 ? totalPages - 4 + i : currentPage - 2 + i;
                return (
                  <button key={page} onClick={() => setCurrentPage(page)}
                    className={`h-8 w-8 flex items-center justify-center rounded-lg text-xs font-bold transition-all ${currentPage === page ? 'bg-red-600 text-white shadow-md shadow-red-600/20' : 'border border-slate-200 text-slate-600 hover:bg-red-50'}`}>
                    {page}
                  </button>
                );
              })}
              <button onClick={() => setCurrentPage(p => Math.min(p + 1, totalPages))} disabled={currentPage >= totalPages}
                className="h-8 w-8 flex items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-red-50 disabled:opacity-40 transition-all">
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Reject Modal */}
      {rejectingId !== null && (
        <div className="fixed inset-0 bg-slate-950/40 backdrop-blur-sm z-100 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="p-5 bg-red-600 text-white flex justify-between items-center">
              <h3 className="font-bold text-lg tracking-tight">Reject Adjustment</h3>
              <button onClick={() => setRejectingId(null)} className="text-white/70 hover:text-white">
                <X size={20} />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-sm text-slate-600">Please provide a reason for rejecting this adjustment request.</p>
              <div className="space-y-1">
                <label className="text-[9px] font-black uppercase text-slate-400 tracking-wider">Rejection Reason <span className="text-red-500">*</span></label>
                <textarea value={rejectionReason} onChange={e => setRejectionReason(e.target.value)}
                  placeholder="e.g., Insufficient evidence, Incorrect time values..."
                  className={`w-full p-3 bg-slate-50 border rounded-xl h-24 text-xs outline-none focus:ring-2 focus:ring-red-500/20 resize-none ${!rejectionReason.trim() ? 'border-red-300' : 'border-slate-200'}`} />
                {!rejectionReason.trim() && (
                  <p className="text-[10px] text-red-500 font-medium flex items-center gap-1">
                    <AlertCircle size={10} />
                    Rejection reason is required.
                  </p>
                )}
              </div>
            </div>
            <div className="p-5 bg-slate-50 flex gap-3">
              <button onClick={() => setRejectingId(null)} className="flex-1 px-4 py-3 text-sm font-bold text-slate-500 hover:text-slate-800 transition-colors">Cancel</button>
              <button onClick={handleReject} disabled={actionLoading || !rejectionReason.trim()}
                className="flex-1 px-4 py-3 bg-red-600 text-white rounded-xl text-sm font-black shadow-lg shadow-red-600/30 hover:bg-red-700 transition-all active:scale-95 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed">
                {actionLoading && <Loader2 size={15} className="animate-spin" />}
                Confirm Rejection
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Approve Confirmation Modal */}
      {approvingId && (
        <div className="fixed inset-0 bg-slate-950/40 backdrop-blur-sm z-[150] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="p-6 text-center space-y-4">
              <div className="w-14 h-14 rounded-full bg-emerald-100 flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-7 h-7 text-emerald-600" />
              </div>
              <div>
                <h3 className="text-lg font-black text-slate-800 tracking-tight">Approve Adjustment?</h3>
                <p className="text-sm text-slate-500 mt-1">The attendance record will be updated with the requested changes.</p>
              </div>
              <div className="flex gap-3 pt-2">
                <button onClick={() => setApprovingId(null)} className="flex-1 px-4 py-2.5 border border-slate-200 text-slate-600 rounded-xl text-sm font-bold hover:bg-slate-50 transition-all">Cancel</button>
                <button onClick={() => handleApprove(approvingId)} disabled={actionLoading} className="flex-1 px-4 py-2.5 bg-emerald-600 text-white rounded-xl text-sm font-bold hover:bg-emerald-700 disabled:opacity-50 transition-all shadow-lg shadow-emerald-200 active:scale-95">
                  {actionLoading ? 'Approving…' : 'Approve'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}
