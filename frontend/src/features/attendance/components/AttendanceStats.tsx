import React from 'react';
import { Timer, TrendingUp, TrendingDown } from 'lucide-react';

interface AttendanceStatsProps {
  stats: {
    onTime: number;
    late: number;
    absent: number;
    total: number;
    avgHours: string;
    totalOT: string;
    totalUT: string;
  };
}

export function AttendanceStats({ stats }: AttendanceStatsProps) {
  const statCards = [
    { label: 'Avg Hours', value: `${stats.avgHours}h`, icon: Timer, color: 'text-blue-500', bg: 'bg-blue-500/10' },
    { label: 'Overtime', value: `${stats.totalOT}h`, icon: TrendingUp, color: 'text-emerald-500', bg: 'bg-emerald-500/10' },
    { label: 'Undertime', value: `${stats.totalUT}h`, icon: TrendingDown, color: 'text-red-500', bg: 'bg-red-500/10' },
  ];

  return (
    <>
      {/* Stats Cards */}
      <div className="grid grid-cols-3 gap-3">
        {statCards.map(s => {
          const Icon = s.icon;
          return (
            <div key={s.label} className="bg-white rounded-2xl border border-slate-100 p-3 sm:p-4 shadow-sm">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{s.label}</p>
                  <p className={`text-xl sm:text-2xl font-black mt-1 ${s.color}`}>{s.value}</p>
                </div>
                <div className={`${s.bg} p-2 rounded-xl shrink-0`}>
                  <Icon className={`w-4 h-4 ${s.color}`} />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Mini Stats Bar */}
      <div className="flex items-center gap-4 bg-white px-5 py-3 rounded-2xl border border-slate-100 shadow-sm w-fit">
        <div className="text-center">
          <p className="text-[9px] font-black uppercase tracking-wider text-slate-400">On Time</p>
          <p className="text-xl font-black text-emerald-500">{stats.onTime}</p>
        </div>
        <div className="w-px h-8 bg-slate-100" />
        <div className="text-center">
          <p className="text-[9px] font-black uppercase tracking-wider text-slate-400">Late</p>
          <p className="text-xl font-black text-yellow-500">{stats.late}</p>
        </div>
        <div className="w-px h-8 bg-slate-100" />
        <div className="text-center">
          <p className="text-[9px] font-black uppercase tracking-wider text-slate-400">Absent</p>
          <p className="text-xl font-black text-red-500">{stats.absent}</p>
        </div>
        <div className="w-px h-8 bg-slate-100" />
        <div className="text-center">
          <p className="text-[9px] font-black uppercase tracking-wider text-slate-400">Total</p>
          <p className="text-xl font-black text-slate-700">{stats.total}</p>
        </div>
      </div>
    </>
  );
}
