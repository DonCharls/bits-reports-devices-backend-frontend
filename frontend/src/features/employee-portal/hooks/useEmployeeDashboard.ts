import { useState, useEffect, useCallback } from 'react'
import { employeeSelfApi } from '@/lib/api'
import { useAttendanceStream, AttendanceStreamPayload } from '@/features/attendance/hooks/useAttendanceStream'
import { PortalAttendanceRecord } from '../utils/portal-types'

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

export function useEmployeeDashboard() {
  const [loading, setLoading] = useState(true)
  const [userName, setUserName] = useState('')
  const [todayRecord, setTodayRecord] = useState<PortalAttendanceRecord | null>(null)
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
        setTodayRecord(attData.data[0] as unknown as PortalAttendanceRecord)
      }

      // Fetch Weekly Attendance
      const { start, end } = getWeekDates()
      const weekData = await employeeSelfApi.getAttendance(start, end)
      if (weekData.success) {
        const records: PortalAttendanceRecord[] = (weekData.data as unknown as PortalAttendanceRecord[]) || []
        
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
    } catch (err: unknown) {
      if (err instanceof Error) {
        console.error(err.message)
      } else {
        console.error('An unexpected error occurred')
      }
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
      } as PortalAttendanceRecord))
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

  return { loading, userName, todayRecord, weeklyStats }
}
