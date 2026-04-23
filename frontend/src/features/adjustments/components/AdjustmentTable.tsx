'use client'

import React from 'react'
import Link from 'next/link'
import { Loader2, CheckCircle2, XCircle, Clock, ExternalLink, LucideIcon } from 'lucide-react'
import { SortableHeader } from '@/components/ui/SortableHeader'
import { Adjustment } from '@/features/adjustments/types'
import { formatTime, formatTimestamp, formatDate, empName } from '../hooks/useAdjustmentList'

const statusConfig: Record<string, { label: string; bg: string; text: string; border: string; icon: LucideIcon }> = {
    pending: { label: 'Pending', bg: 'bg-yellow-50', text: 'text-yellow-700', border: 'border-yellow-200', icon: Clock },
    approved: { label: 'Approved', bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200', icon: CheckCircle2 },
    rejected: { label: 'Rejected', bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-200', icon: XCircle },
}

export interface AdjustmentTableProps {
    loading: boolean
    sortedAdjustments: Adjustment[]
    sortKeyStr: string | null
    sortOrder: 'asc' | 'desc' | null
    statusFilter: string
    isAdmin: boolean
    actionLoading: boolean
    handleSort: (key: string) => void
    onApprove: (id: number) => void
    onReject: (id: number) => void
}

export function AdjustmentTable({
    loading,
    sortedAdjustments,
    sortKeyStr,
    sortOrder,
    statusFilter,
    isAdmin,
    actionLoading,
    handleSort,
    onApprove,
    onReject,
}: AdjustmentTableProps) {
    return (
        <table className="w-full text-left text-sm border-collapse table-auto min-w-[1200px]">
            <thead className="bg-slate-50 text-slate-400 font-bold uppercase text-[10px] tracking-widest border-b border-slate-100">
                <tr>
                    <SortableHeader label="Submitted" sortKey="submittedAt" currentSortKey={sortKeyStr} currentSortOrder={sortOrder} onSort={handleSort} className="px-4 py-3.5" />
                    <SortableHeader label="Employee" sortKey="attendance.employee.lastName" currentSortKey={sortKeyStr} currentSortOrder={sortOrder} onSort={handleSort} className="px-4 py-3.5" />
                    <th className="px-4 py-3.5">Original Time</th>
                    <th className="px-4 py-3.5">Requested Time</th>
                    <th className="px-4 py-3.5">Reason</th>
                    <SortableHeader label="Submitted By" sortKey="submittedBy.lastName" currentSortKey={sortKeyStr} currentSortOrder={sortOrder} onSort={handleSort} className="px-4 py-3.5" />
                    <SortableHeader label="Status" sortKey="status" currentSortKey={sortKeyStr} currentSortOrder={sortOrder} onSort={handleSort} className="px-4 py-3.5 text-center" />
                    <th className="px-4 py-3.5 text-center">{isAdmin ? 'Actions / Reviewed' : 'Reviewed By'}</th>
                </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
                {loading ? (
                    <tr>
                        <td colSpan={8} className="px-6 py-24 text-center">
                            <div className="flex items-center justify-center gap-2 text-slate-400">
                                <Loader2 className="w-5 h-5 animate-spin" />
                                <span className="font-bold uppercase text-[10px] tracking-widest">Loading...</span>
                            </div>
                        </td>
                    </tr>
                ) : sortedAdjustments.length > 0 ? sortedAdjustments.map((adj) => {
                    const sc = statusConfig[adj.status] || statusConfig.pending
                    const StatusIcon = sc.icon
                    return (
                        <tr key={adj.id} className="hover:bg-red-50/40 transition-colors duration-200">
                            <td className="px-4 py-3 font-mono text-[10px] text-slate-500 whitespace-nowrap">{formatTimestamp(adj.submittedAt)}</td>
                            <td className="px-4 py-3">
                                <p className="font-bold text-slate-700 text-sm">{empName(adj.attendance?.employee)}</p>
                                <p className="text-[10px] text-slate-400 font-medium">
                                    {adj.attendance?.employee?.branch?.name || '—'} • {adj.attendance?.employee?.Department?.name || '—'}
                                </p>
                                <p className="text-[10px] text-slate-400 font-medium mt-0.5">{formatDate(adj.attendance?.date)}</p>
                            </td>
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
                                    <p className="text-[10px] text-red-500 font-medium mt-1 truncate flex items-center gap-1" title={adj.rejectionReason}><XCircle size={10} className="shrink-0" /> {adj.rejectionReason}</p>
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
                                {isAdmin && adj.status === 'pending' ? (
                                    <div className="flex items-center justify-center gap-1.5">
                                        <button onClick={() => onApprove(adj.id)} disabled={actionLoading}
                                            className="px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-[10px] font-black uppercase tracking-wider hover:bg-emerald-700 transition-all shadow-sm disabled:opacity-50 active:scale-95 inline-flex items-center gap-1">
                                            <CheckCircle2 size={10} /> Approve
                                        </button>
                                        <button onClick={() => onReject(adj.id)} disabled={actionLoading}
                                            className="px-3 py-1.5 bg-red-600 text-white rounded-lg text-[10px] font-black uppercase tracking-wider hover:bg-red-700 transition-all shadow-sm disabled:opacity-50 active:scale-95 inline-flex items-center gap-1">
                                            <XCircle size={10} /> Reject
                                        </button>
                                    </div>
                                ) : (
                                    <span className="text-[10px] text-slate-400 font-medium block text-center">
                                        {adj.reviewedBy ? `${adj.reviewedBy.firstName} ${adj.reviewedBy.lastName}` : '—'}
                                        {adj.reviewedAt && <><br />{formatTimestamp(adj.reviewedAt)}</>}
                                        {adj.status === 'approved' && (
                                            <Link
                                                href={`/adjustments?tab=history&entityId=${adj.attendanceId}`}
                                                className="mt-1.5 flex items-center justify-center gap-1 text-[9px] font-black uppercase tracking-wider text-red-600 hover:text-red-800 transition-colors"
                                            >
                                                <ExternalLink size={9} />
                                                View Audit Detail
                                            </Link>
                                        )}
                                    </span>
                                )}
                            </td>
                        </tr>
                    )
                }) : (
                    <tr>
                        <td colSpan={8} className="px-6 py-24 text-center text-slate-400 font-bold uppercase text-[10px] tracking-widest">
                            {statusFilter === 'pending' ? 'No pending adjustments — all caught up!' : 'No adjustment records found'}
                        </td>
                    </tr>
                )}
            </tbody>
        </table>
    )
}
