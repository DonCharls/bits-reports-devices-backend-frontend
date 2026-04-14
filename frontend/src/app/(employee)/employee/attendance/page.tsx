'use client'

import React, { useState, useEffect } from 'react'
import { CalendarDays, Filter } from 'lucide-react'
import { DataTablePagination } from '@/components/ui/DataTablePagination'

import { employeeSelfApi } from '@/lib/api'

interface AttendanceRecord {
  id: number
  date: string
  checkInTime: string
  checkOutTime: string | null
  status: string
  notes: string | null
  totalHours: number
  lateMinutes: number
  overtimeMinutes: number
  undertimeMinutes: number
  shiftCode: string | null
  isShiftActive: boolean
  gracePeriodApplied: boolean
}

const phtStr = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' })

export default function MyAttendancePage() {
  const [loading, setLoading] = useState(true)
  const [records, setRecords] = useState<AttendanceRecord[]>([])
  
  // Default to current month
  const today = new Date()
  const firstDay = new Date(today.getFullYear(), today.getMonth(), 1)
  const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0)
  
  const [startDate, setStartDate] = useState(phtStr(firstDay))
  const [endDate, setEndDate] = useState(phtStr(lastDay))

  const [currentPage, setCurrentPage] = useState(1)
  const rowsPerPage = 10

  const fetchRecords = async () => {
    setLoading(true)
    try {
      const res = await employeeSelfApi.getAttendance(startDate, endDate)
      if (res.success) {
        setRecords((res.data as unknown as AttendanceRecord[]) || [])
      }
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchRecords()
  }, [])

  const handleApplyFilter = () => {
    setCurrentPage(1)
    fetchRecords()
  }

  const paginatedRecords = records.slice((currentPage - 1) * rowsPerPage, currentPage * rowsPerPage)

  const formatTime = (timeStr?: string | null) => {
    if (!timeStr) return '--:--'
    return new Date(timeStr).toLocaleTimeString('en-US', { timeZone: 'Asia/Manila', hour: '2-digit', minute: '2-digit' })
  }

  const calculateHours = (inTime: string, outTime: string | null) => {
    if (!outTime) return '--'
    const diffMs = new Date(outTime).getTime() - new Date(inTime).getTime()
    const hrs = Math.floor(diffMs / (1000 * 60 * 60))
    const mins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60))
    return `${hrs}h ${mins}m`
  }

  const fmtMins = (mins: number | null | undefined): string => {
    if (!mins || mins <= 0) return '—'
    const h = Math.floor(mins / 60)
    const m = Math.round(mins % 60)
    if (h === 0) return `${m}m`
    if (m === 0) return `${h}h`
    return `${h}h ${m}m`
  }

  return (
    <div className="max-w-6xl mx-auto flex flex-col gap-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
            <CalendarDays className="w-6 h-6 text-red-600" /> My Attendance
          </h1>
          <p className="text-slate-500 text-sm mt-1">View your personal attendance history</p>
        </div>

        {/* Date Filter */}
        <div className="flex items-end gap-3 bg-white p-3 rounded-xl border border-slate-200 shadow-sm">
          <div>
            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">From</label>
            <input 
              type="date" 
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="text-sm bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 outline-none focus:border-red-500 transition-colors"
            />
          </div>
          <div>
            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">To</label>
            <input 
              type="date" 
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="text-sm bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 outline-none focus:border-red-500 transition-colors"
            />
          </div>
          <button 
            onClick={handleApplyFilter}
            className="bg-red-600 hover:bg-red-700 text-white p-2 rounded-lg transition-colors"
            title="Filter"
          >
            <Filter className="w-4 h-4" />
          </button>
        </div>
      </div>

      {loading ? (
        <div className="bg-white rounded-xl border border-slate-200 h-96 flex items-center justify-center animate-pulse">
           <div className="text-slate-400 font-bold">Loading records...</div>
        </div>
      ) : records.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 h-64 flex flex-col items-center justify-center gap-3">
          <CalendarDays className="w-12 h-12 text-slate-200" />
          <p className="text-slate-500 font-semibold">No attendance records found for this period</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead className="bg-slate-50 border-b border-slate-200 text-xs uppercase tracking-widest text-slate-500">
                <tr>
                  <th className="px-6 py-4 font-black">Date</th>
                  <th className="px-6 py-4 font-black">Check In</th>
                  <th className="px-6 py-4 font-black">Check Out</th>
                  <th className="px-6 py-4 font-black">Total Time</th>
                  <th className="px-6 py-4 font-black text-emerald-600">OT</th>
                  <th className="px-6 py-4 font-black text-red-500">UT</th>
                  <th className="px-6 py-4 font-black">Status</th>
                </tr>
              </thead>
               <tbody className="divide-y divide-slate-100">
                {paginatedRecords.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="font-bold text-slate-800">
                        {new Date(r.date || r.checkInTime).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </div>
                      <div className="text-[10px] text-slate-400 font-mono">
                        {new Date(r.date || r.checkInTime).toLocaleDateString('en-US', { weekday: 'short' })}
                      </div>
                    </td>
                    <td className="px-6 py-4 font-mono text-slate-600">{formatTime(r.checkInTime)}</td>
                    <td className="px-6 py-4 font-mono text-slate-600">{formatTime(r.checkOutTime)}</td>
                    <td className="px-6 py-4 font-semibold text-slate-700">
                      {calculateHours(r.checkInTime, r.checkOutTime)}
                    </td>
                    <td className="px-6 py-4">
                      <span className={`text-sm font-bold ${r.overtimeMinutes > 0 ? 'text-emerald-600' : 'text-slate-300'}`}>
                        {r.overtimeMinutes > 0 ? `+${fmtMins(r.overtimeMinutes)}` : '—'}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`text-sm font-bold ${r.undertimeMinutes > 0 ? 'text-red-500' : 'text-slate-300'}`}>
                        {r.undertimeMinutes > 0 ? `-${fmtMins(r.undertimeMinutes)}` : '—'}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${
                        r.status.toLowerCase() === 'late' 
                          ? 'bg-amber-100 text-amber-700' 
                          : r.status.toLowerCase() === 'absent'
                            ? 'bg-rose-100 text-rose-700'
                            : r.status.toLowerCase() === 'in_progress'
                              ? 'bg-blue-100 text-blue-700'
                              : 'bg-emerald-100 text-emerald-700'
                      }`}>
                        {r.status === 'IN_PROGRESS' ? 'In Progress' : r.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <DataTablePagination
        currentPage={currentPage}
        totalPages={Math.ceil(records.length / rowsPerPage)}
        onPageChange={setCurrentPage}
        totalCount={records.length}
        pageSize={rowsPerPage}
        entityName="records"
        loading={loading}
      />
    </div>
  )
}
