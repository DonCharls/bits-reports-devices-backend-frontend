"use client"
import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { History, Search, CalendarSearch, X, ChevronUp, ChevronDown, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import { useHorizontalDragScroll } from '@/hooks/useHorizontalDragScroll';
import { useTableSort } from '@/hooks/useTableSort';
import { SortableHeader } from '@/components/ui/SortableHeader';

interface AuditLog {
  id: number;
  field: string;
  oldValue: string | null;
  newValue: string | null;
  reason: string | null;
  createdAt: string;
  attendance: {
    employee: {
      firstName: string;
      lastName: string;
      branch: string | null;
      role: string;
    };
  };
  adjustedBy: {
    firstName: string;
    lastName: string;
    role: string;
  };
}

const fieldLabels: Record<string, string> = {
  checkInTime: 'Time-In',
  checkOutTime: 'Time-Out',
  status: 'Status',
};

function formatValue(field: string, value: string | null): string {
  if (!value) return 'None';
  if (field === 'status') {
    const lower = value.toLowerCase();
    if (lower === 'present') return 'On Time';
    return value.charAt(0).toUpperCase() + value.slice(1);
  }
  // ISO date string → formatted 12-hour time
  try {
    const d = new Date(value);
    if (isNaN(d.getTime())) return value;
    return d.toLocaleTimeString('en-US', {
      timeZone: 'Asia/Manila',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
  } catch {
    return value;
  }
}

function formatTimestamp(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString('en-US', {
      timeZone: 'Asia/Manila',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
  } catch {
    return iso;
  }
}

function getChangeColor(field: string, newValue: string | null): string {
  if (!newValue) return 'text-emerald-600';
  if (field === 'status') {
    const lower = newValue.toLowerCase();
    return lower === 'late' ? 'text-yellow-500' : 'text-emerald-600';
  }
  if (field === 'checkInTime') {
    try {
      const d = new Date(newValue);
      if (!isNaN(d.getTime())) {
        // Convert to PHT and check if after 8:30 AM
        const pht = new Date(d.getTime() + 8 * 60 * 60 * 1000);
        const mins = pht.getUTCHours() * 60 + pht.getUTCMinutes();
        return mins > 8 * 60 + 30 ? 'text-yellow-500' : 'text-emerald-600';
      }
    } catch { }
  }
  return 'text-emerald-600';
}

export default function AdjustmentsPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [branchFilter, setBranchFilter] = useState("All Branches");
  const [logDate, setLogDate] = useState("");
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const logDateRef = useRef<HTMLInputElement>(null);

  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 15;

  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [branches, setBranches] = useState<string[]>(["All Branches"]);
  const dragScrollRef = useHorizontalDragScroll();
  const [loading, setLoading] = useState(true);
  const [totalCount, setTotalCount] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  const fetchLogs = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      params.set('page', String(currentPage));
      params.set('limit', String(itemsPerPage));
      if (searchQuery) params.set('search', searchQuery);
      if (branchFilter && branchFilter !== 'All Branches') params.set('branch', branchFilter);
      if (logDate) params.set('date', logDate);

      const res = await fetch(`/api/attendance/audit-logs?${params.toString()}`, { credentials: 'include' });
      if (res.status === 401) { window.location.href = '/login'; return; }
      if (!res.ok) {
        const errData = await res.json().catch(() => null);
        throw new Error(errData?.message || `Server error ${res.status}`);
      }
      const data = await res.json();

      if (data.success) {
        setAuditLogs(data.data);
        setTotalCount(data.meta.total);
        setTotalPages(data.meta.totalPages);

        // Extract unique branches for the filter
        const branchSet = new Set<string>();
        data.data.forEach((log: AuditLog) => {
          if (log.attendance?.employee?.branch) {
            branchSet.add(log.attendance.employee.branch);
          }
        });
        setBranches(prev => {
          const merged = new Set([...prev, ...branchSet]);
          return Array.from(merged).sort();
        });
      }
    } catch (err) {
      console.error('Failed to fetch audit logs:', err);
    } finally {
      setLoading(false);
    }
  }, [currentPage, searchQuery, branchFilter, logDate]);

  // Also fetch all branches on mount
  useEffect(() => {
    fetch('/api/branches', { credentials: 'include' })
      .then(r => r.json())
      .then(d => {
        if (d.success) {
          const names = (d.branches || d.data || []).map((b: any) => b.name);
          setBranches(names);
        }
      })
      .catch(() => { });
  }, []);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, branchFilter, logDate]);

  const formatDateLabel = (dateStr: string) => {
    if (!dateStr) return "Select Date";
    const [year, month, day] = dateStr.split("-");
    return `${day}/${month}/${year}`;
  };

  const groupedLogs = useMemo(() => {
    const groups: { key: string; logs: AuditLog[] }[] = [];
    const groupMap = new Map<string, AuditLog[]>();
    auditLogs.forEach((log) => {
      const emp = log.attendance?.employee;
      const adj = log.adjustedBy;
      const key = `${adj?.firstName}_${adj?.lastName}_${emp?.firstName}_${emp?.lastName}_${log.createdAt.slice(0, 16)}`;
      if (!groupMap.has(key)) {
        const arr: AuditLog[] = [];
        groupMap.set(key, arr);
        groups.push({ key, logs: arr });
      }
      if (log.oldValue !== log.newValue) {
        groupMap.get(key)!.push(log);
      }
    });

    return groups.filter(g => g.logs.length > 0).map(group => {
      const first = group.logs[0];
      const emp = first.attendance?.employee;
      const adjuster = first.adjustedBy;
      const employeeName = emp ? `${emp.firstName} ${emp.lastName}` : 'Unknown';
      const adjusterName = adjuster ? `${adjuster.firstName} ${adjuster.lastName}` : 'System';
      const branch = emp?.branch || '—';
      const reason = group.logs.find(l => l.reason)?.reason || '—';

      return {
        ...group,
        createdAt: first.createdAt,
        adjusterName,
        employeeName,
        branch,
        reason,
        first
      };
    });
  }, [auditLogs]);

  const { sortedData: sortedGroupedLogs, sortKey, sortOrder, handleSort } = useTableSort({
    initialData: groupedLogs
  });
  const sortKeyStr = sortKey as string | null;

  const CustomSelect = ({ value, options, onChange, id }: any) => {
    const isOpen = openDropdown === id;
    return (
      <div className="relative min-w-[180px]">
        <button
          onClick={(e) => { e.stopPropagation(); setOpenDropdown(isOpen ? null : id); }}
          className={`w-full flex items-center justify-between px-5 py-3 bg-[#df0808] text-white rounded-lg text-xs font-bold transition-all ${isOpen ? 'rounded-b-none' : 'shadow-md'}`}
        >
          <span>{value}</span>
          {isOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>
        {isOpen && (
          <div className="absolute top-full left-0 right-0 z-50 flex flex-col pt-1">
            <button
              className="w-full text-left px-5 py-3 bg-[#c21414] text-white hover:bg-red-500 transition-colors text-xs font-bold first:mt-0 mt-px rounded-sm shadow-sm"
              onClick={() => {
                onChange("All Branches");
                setOpenDropdown(null);
              }}
            >
              All Branches
            </button>
            {options.map((opt: string) => (
              <button
                key={opt}
                className="w-full text-left px-5 py-3 bg-[#c21414] text-white hover:bg-red-500 transition-colors text-xs font-bold first:mt-0 mt-px rounded-sm last:rounded-b-lg shadow-sm"
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
    <div className="space-y-6 relative" onClick={() => setOpenDropdown(null)}>
      <div className="flex flex-col lg:flex-row justify-between lg:items-center gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-800 tracking-tight leading-none">Adjustment Logs</h1>
          <p className="text-slate-500 text-sm font-medium mt-1">Full audit trail of manual biometric data modifications</p>
        </div>
      </div>

      <div className="flex flex-col md:flex-row items-center bg-white p-2 rounded-2xl border border-slate-200 shadow-sm gap-4" onClick={(e) => e.stopPropagation()}>
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search employee or admin..."
            className="w-full md:w-64 pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-red-400/20 outline-none transition-all"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2 ml-auto">
          <div className="relative">
            <input
              type="date"
              ref={logDateRef}
              value={logDate}
              onChange={(e) => setLogDate(e.target.value)}
              className="absolute opacity-0 pointer-events-none"
            />
            <button
              onClick={() => logDateRef.current?.showPicker()}
              className="min-w-[180px] flex items-center justify-between px-5 py-3 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-600 outline-none shadow-sm hover:border-red-200 transition-all"
            >
              <div className="flex items-center gap-3">
                <CalendarSearch size={14} className="text-slate-400" />
                <span>{formatDateLabel(logDate)}</span>
              </div>
              {logDate && (
                <X
                  size={14}
                  className="text-slate-400 hover:text-red-500 transition-colors"
                  onClick={(e) => { e.stopPropagation(); setLogDate(""); }}
                />
              )}
            </button>
          </div>
          <CustomSelect id="branch" value={branchFilter} options={branches} onChange={setBranchFilter} />
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div ref={dragScrollRef} className="overflow-x-auto scrollbar-hide">
          <table className="w-full text-left text-sm border-collapse table-auto min-w-[900px]">
            <thead className="bg-slate-50 text-slate-400 font-bold uppercase text-[10px] tracking-widest border-b border-slate-100">
              <tr>
                <SortableHeader label="Timestamp" sortKey="createdAt" currentSortKey={sortKeyStr} currentSortOrder={sortOrder} onSort={handleSort} className="px-4 py-3.5" />
                <SortableHeader label="Adjusted By" sortKey="adjusterName" currentSortKey={sortKeyStr} currentSortOrder={sortOrder} onSort={handleSort} className="px-4 py-3.5" />
                <SortableHeader label="Branch" sortKey="branch" currentSortKey={sortKeyStr} currentSortOrder={sortOrder} onSort={handleSort} className="px-4 py-3.5" />
                <SortableHeader label="Target Employee" sortKey="employeeName" currentSortKey={sortKeyStr} currentSortOrder={sortOrder} onSort={handleSort} className="px-4 py-3.5" />
                <th className="px-4 py-3.5">Modified Field</th>
                <th className="px-4 py-3.5">Changes Made</th>
                <th className="px-4 py-3.5 text-right pr-10">Reason</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-6 py-24 text-center">
                    <div className="flex items-center justify-center gap-2 text-slate-400">
                      <Loader2 className="w-5 h-5 animate-spin" />
                      <span className="font-bold uppercase text-[10px] tracking-widest">Loading audit logs...</span>
                    </div>
                  </td>
                </tr>
              ) : sortedGroupedLogs.length > 0 ? sortedGroupedLogs.map((group) => (
                <tr key={group.key} className="hover:bg-red-50 transition-colors duration-200 group cursor-default">
                  <td className="px-4 py-2.5 font-mono text-[10px] text-slate-500 whitespace-nowrap align-top">{formatTimestamp(group.createdAt)}</td>
                  <td className="px-4 py-2.5 font-bold text-slate-700 underline decoration-red-100 underline-offset-4 decoration-2 align-top">{group.adjusterName}</td>
                  <td className="px-4 py-2.5 font-medium text-slate-500 text-xs align-top">{group.branch}</td>
                  <td className="px-4 py-2.5 font-bold text-slate-700 align-top">{group.employeeName}</td>
                  <td className="px-4 py-2.5 align-top">
                    <div className="flex flex-col gap-1.5">
                      {group.logs.map((log: any) => (
                        <span key={log.id} className="text-[10px] font-black uppercase tracking-tight text-slate-600">
                          {fieldLabels[log.field] || log.field}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-2.5 align-top">
                    <div className="flex flex-col gap-1.5">
                      {group.logs.map((log: any) => (
                        <div key={log.id} className="flex items-center gap-2 whitespace-nowrap">
                          <span className="text-[10px] text-slate-400 line-through decoration-slate-300">
                            {formatValue(log.field, log.oldValue)}
                          </span>
                          <span className={`text-xs font-black ${getChangeColor(log.field, log.newValue)}`}>
                            → {formatValue(log.field, log.newValue)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-right pr-10 align-top">
                    <p className="text-[11px] font-medium text-slate-500 leading-relaxed max-w-[200px] ml-auto">
                      {group.reason}
                    </p>
                  </td>
                </tr>
              )) : (
                <tr>
                  <td colSpan={7} className="px-6 py-24 text-center text-slate-400 font-bold uppercase text-[10px] tracking-widest">
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
              <button
                onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                disabled={currentPage === 1}
                className="p-2 bg-white border border-slate-200 rounded-lg text-slate-400 hover:text-red-600 disabled:opacity-50 disabled:hover:text-slate-400 transition-all shadow-sm"
              >
                <ChevronLeft size={16} />
              </button>
              <div className="flex items-center gap-1">
                {[...Array(Math.min(totalPages, 5))].map((_, i) => {
                  const pageNum = totalPages <= 5 ? i + 1 : Math.max(1, Math.min(currentPage - 2, totalPages - 4)) + i;
                  return (
                    <button
                      key={pageNum}
                      onClick={() => setCurrentPage(pageNum)}
                      className={`w-8 h-8 rounded-lg text-xs font-black transition-all ${currentPage === pageNum ? 'bg-red-600 text-white shadow-md shadow-red-200' : 'bg-white border border-slate-200 text-slate-400 hover:bg-slate-50'}`}
                    >
                      {pageNum}
                    </button>
                  );
                })}
              </div>
              <button
                onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                disabled={currentPage === totalPages || totalPages === 0}
                className="p-2 bg-white border border-slate-200 rounded-lg text-slate-400 hover:text-red-600 disabled:opacity-50 disabled:hover:text-slate-400 transition-all shadow-sm"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}