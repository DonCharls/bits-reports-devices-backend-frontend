import React from 'react';
import { Search } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface AttendanceFiltersProps {
  searchQuery: string;
  setSearchQuery: (val: string) => void;
  branchFilter: string;
  setBranchFilter: (val: string) => void;
  deptFilter: string;
  setDeptFilter: (val: string) => void;
  statusFilter: string;
  setStatusFilter: (val: string) => void;
  branches: string[];
  departments: string[];
  statuses: { value: string; label: string }[];
}

export function AttendanceFilters({
  searchQuery,
  setSearchQuery,
  branchFilter,
  setBranchFilter,
  deptFilter,
  setDeptFilter,
  statusFilter,
  setStatusFilter,
  branches,
  departments,
  statuses,
}: AttendanceFiltersProps) {
  return (
    <div className="flex flex-col md:flex-row gap-2 bg-white p-2 rounded-2xl border border-slate-200 shadow-sm">
      <div className="relative flex-1">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input
          placeholder="Search employee..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium outline-none focus:ring-2 focus:ring-red-500/20"
        />
      </div>
      <div className="flex gap-2">
        <Select value={branchFilter} onValueChange={setBranchFilter}>
          <SelectTrigger className="w-44 bg-white border-slate-200 font-bold text-xs uppercase tracking-widest">
            <SelectValue placeholder="Branch" />
          </SelectTrigger>
          <SelectContent className="bg-white border-slate-200">
            {branches.map(b => (
              <SelectItem key={b} value={b}>{b.toUpperCase()}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={deptFilter} onValueChange={setDeptFilter}>
          <SelectTrigger className="w-52 bg-white border-slate-200 font-bold text-xs uppercase tracking-widest">
            <SelectValue placeholder="Department" />
          </SelectTrigger>
          <SelectContent className="bg-white border-slate-200">
            {departments.map(d => (
              <SelectItem key={d} value={d}>{d.toUpperCase()}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-36 bg-white border-slate-200 font-bold text-xs uppercase tracking-widest">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent className="bg-white border-slate-200">
            {statuses.map(s => (
              <SelectItem key={s.value} value={s.value}>{s.label.toUpperCase()}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
