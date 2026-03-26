'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { LogIn, LogOut, Timer, CalendarDays, Clock } from 'lucide-react'

import { employeeSelfApi } from '@/lib/api'
import { useAttendanceStream, AttendanceStreamPayload } from '@/hooks/useAttendanceStream'

interface AttendanceRecord {
  id: number
  date: string
  checkInTime: string
  checkOutTime: string | null
  status: string
  notes: string | null
}

const phtStr = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' })

function getWeekDates(): { start: string, end: string } {
  const now = new Date()
  const todayIndex = now.getDay()
  const monday = new Date(now)
  monday.setDate(now.getDate() - ((todayIndex === 0 ? 7 : todayIndex) - 1))
  monday.setHours(0, 0, 0, 0)
  
  const friday = new Date(monday)
  friday.setDate(monday.getDate() + 4)
  
  return {
    start: phtStr(monday),
    end: phtStr(friday)
  }
}

export default function EmployeeDashboard() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [userName, setUserName] = useState('')
  const [todayRecord, setTodayRecord] = useState<AttendanceRecord | null>(null)
  const [weeklyStats, setWeeklyStats] = useState({ present: 0, late: 0, totalHours: 0 })

  const loadData = useCallback(async () => {
      try {
        // Fetch User Profile First
        const profileRes = await employeeSelfApi.getProfile()
        if (profileRes.success && profileRes.profile) {
          setUserName(profileRes.profile.firstName)
        }

        // Fetch Today's Attendance
        const todayStr = phtStr(new Date())
        const attData = await employeeSelfApi.getAttendance(todayStr, todayStr)
        if (attData.success && attData.data?.length > 0) {
          setTodayRecord(attData.data[0])
        }

        // Fetch Weekly Attendance
        const { start, end } = getWeekDates()
        const weekData = await employeeSelfApi.getAttendance(start, end)
        if (weekData.success) {
          const records: AttendanceRecord[] = weekData.data || []
          
          let present = 0
          let late = 0
          let totalMs = 0

          records.forEach(r => {
            if (r.checkInTime) {
              if (r.status.toLowerCase() === 'late') late++
              else present++

              if (r.checkOutTime) {
                totalMs += new Date(r.checkOutTime).getTime() - new Date(r.checkInTime).getTime()
              }
            }
          })

          setWeeklyStats({
            present,
            late,
            totalHours: Math.floor(totalMs / (1000 * 60 * 60))
          })
        }
      } catch (err) {
        console.error(err)
      } finally {
        setLoading(false)
      }
  }, [])

  // Handle SSE live records
  const handleStreamRecord = useCallback((payload: AttendanceStreamPayload) => {
    // Only update if the event is for today
    const todayStr = phtStr(new Date())
    const recDateStr = payload.record.date ? phtStr(new Date(payload.record.date)) : ''
    
    if (todayStr === recDateStr) {
      setTodayRecord(prev => ({
        id: payload.record.id,
        date: payload.record.date,
        checkInTime: payload.record.checkInTime,
        checkOutTime: payload.record.checkOutTime,
        status: payload.record.status,
        notes: prev?.notes || null
      }))
    }
  }, [])

  useAttendanceStream({
    onRecord: handleStreamRecord,
    endpoint: '/api/me/attendance/stream'
  })

  useEffect(() => {
    loadData()
    // 30-second refresh fallback to sync weekly stats and metrics periodically
    const t = setInterval(loadData, 30_000)
    return () => clearInterval(t)
  }, [loadData])

  if (loading) {
    return (
      <div className="flex flex-col gap-4 animate-pulse">
        <div className="h-8 bg-gray-200 rounded w-64 mb-4"></div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="h-48 bg-gray-200 rounded-xl"></div>
          <div className="h-48 bg-gray-200 rounded-xl"></div>
        </div>
      </div>
    )
  }

  const formatTime = (timeStr?: string | null) => {
    if (!timeStr) return '--:--'
    return new Date(timeStr).toLocaleTimeString('en-US', { timeZone: 'Asia/Manila', hour: '2-digit', minute: '2-digit' })
  }

  return (
    <div className="max-w-6xl mx-auto flex flex-col gap-6 lg:gap-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl lg:text-3xl font-black text-slate-900 tracking-tight">
          Hello, {userName}! 👋
        </h1>
        <p className="text-slate-500 font-medium mt-1">
          {new Date().toLocaleDateString('en-PH', {
            timeZone: 'Asia/Manila',
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
          })}
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Today's Status */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-1 bg-red-500" />
          <h2 className="text-sm font-bold text-slate-500 uppercase tracking-widest mb-6 flex items-center gap-2">
            <Clock className="w-4 h-4 text-red-500" /> Today's Status
          </h2>
          
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-emerald-50 rounded-xl p-4 flex flex-col">
              <span className="text-xs font-bold text-emerald-600 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <LogIn className="w-3.5 h-3.5" /> Check-in
              </span>
              <span className="text-2xl lg:text-3xl font-black text-slate-800 tracking-tighter">
                {formatTime(todayRecord?.checkInTime)}
              </span>
            </div>
            
            <div className="bg-amber-50 rounded-xl p-4 flex flex-col">
              <span className="text-xs font-bold text-amber-600 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <LogOut className="w-3.5 h-3.5" /> Check-out
              </span>
              <span className="text-2xl lg:text-3xl font-black text-slate-800 tracking-tighter">
                {formatTime(todayRecord?.checkOutTime)}
              </span>
            </div>
          </div>

          <div className="mt-6 flex items-center justify-between border-t border-slate-100 pt-4">
            <span className="text-sm text-slate-500 font-medium">Status</span>
            {todayRecord ? (
              <span className={`px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider ${
                todayRecord.status.toLowerCase() === 'late' 
                  ? 'bg-amber-100 text-amber-700' 
                  : 'bg-emerald-100 text-emerald-700'
              }`}>
                {todayRecord.status}
              </span>
            ) : (
              <span className="px-3 py-1 bg-slate-100 text-slate-500 rounded-full text-xs font-black uppercase tracking-wider">
                Not checked in
              </span>
            )}
          </div>
        </div>

        {/* Weekly Summary */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-1 bg-indigo-500" />
          <h2 className="text-sm font-bold text-slate-500 uppercase tracking-widest mb-6 flex items-center gap-2">
            <CalendarDays className="w-4 h-4 text-indigo-500" /> This Week
          </h2>

          <div className="grid grid-cols-3 gap-4 h-[calc(100%-3rem)]">
             <div className="flex flex-col items-center justify-center p-4 bg-slate-50 rounded-xl text-center">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Days Present</span>
              <span className="text-3xl font-black text-emerald-600">{weeklyStats.present}</span>
            </div>
            <div className="flex flex-col items-center justify-center p-4 bg-slate-50 rounded-xl text-center">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Days Late</span>
              <span className="text-3xl font-black text-amber-500">{weeklyStats.late}</span>
            </div>
            <div className="flex flex-col items-center justify-center p-4 bg-slate-50 rounded-xl text-center">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Total Hours</span>
              <span className="text-3xl font-black text-indigo-600">{weeklyStats.totalHours}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
