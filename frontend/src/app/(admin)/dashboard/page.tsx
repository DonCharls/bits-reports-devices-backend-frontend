'use client'

import React, { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts'
import { Users, Clock, AlertCircle, TrendingUp, Building2, FileText, ArrowRight } from 'lucide-react'
import { DEPARTMENTS } from '@/types/departments'
import { BRANCHES } from '@/types/branches'

// ─── Color tokens ────────────────────────────────────────
const RED    = '#C8102E'
const ORANGE = '#F26522'
const GOLD   = '#D4A84B'

interface EmpStats   { total: number; active: number }
interface AttStats   { present: number; late: number; absent: number; overtime: number; undertime: number }
interface WeekDay    { day: string; present: number; late: number; absent: number }
interface DeptStat   { name: string; total: number; present: number; rate: number }
interface Activity   {
  id: number | string
  employee: string
  department: string
  branch: string
  action: string
  time: string
  status: 'on-time' | 'late' | 'absent'
}

export default function Dashboard() {
  const router = useRouter()
  const [loading, setLoading]           = useState(true)
  const [empStats, setEmpStats]         = useState<EmpStats>({ total: 0, active: 0 })
  const [attStats, setAttStats]         = useState<AttStats>({ present: 0, late: 0, absent: 0, overtime: 0, undertime: 0 })
  const [rate, setRate]                 = useState(0)
  const [weekly, setWeekly]             = useState<WeekDay[]>([])
  const [deptStats, setDeptStats]       = useState<DeptStat[]>([])
  const [activity, setActivity]         = useState<Activity[]>([])
  const [updatedAt, setUpdatedAt]       = useState('')

  const load = useCallback(async () => {
    try {
      const token = localStorage.getItem('token')
      if (!token) { router.replace('/login'); return }

      const today    = new Date()
      const offset   = today.getTimezoneOffset()
      const local    = new Date(today.getTime() - offset * 60000)
      const todayStr = local.toISOString().split('T')[0]
      const dow      = local.getDay()
      const monOff   = dow === 0 ? 6 : dow - 1
      const monday   = new Date(local); monday.setDate(monday.getDate() - monOff)
      const monStr   = monday.toISOString().split('T')[0]

      setUpdatedAt(local.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' }))

      const [eRes, aRes] = await Promise.all([
        fetch('/api/employees',   { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`/api/attendance?startDate=${monStr}&endDate=${todayStr}&limit=5000`,
              { headers: { Authorization: `Bearer ${token}` } }),
      ])
      if (eRes.status === 401) { localStorage.removeItem('token'); router.replace('/login'); return }

      const ed = await eRes.json()
      const ad = await aRes.json()
      const emps: any[] = ed.success ? (ed.employees || ed.data || []) : []
      const atts: any[] = ad.success ? (ad.data || []) : []

      setEmpStats({ total: emps.length, active: emps.filter((e: any) => e.employmentStatus === 'ACTIVE').length })

      const todayRecs = atts.filter((r: any) => new Date(r.date).toISOString().split('T')[0] === todayStr)

      let present = 0, late = 0, ot = 0, ut = 0
      todayRecs.forEach((r: any) => {
        const ci = r.checkInTime  ? new Date(r.checkInTime)  : null
        const co = r.checkOutTime ? new Date(r.checkOutTime) : null
        const isLate = r.status === 'late' || (ci && (ci.getHours() > 8 || (ci.getHours() === 8 && ci.getMinutes() > 0)))
        if (isLate) late++; else if (ci) present++
        if (ci && co) {
          const h = (co.getTime() - ci.getTime()) / 3600000
          h > 8 ? (ot += h - 8) : (ut += 8 - h)
        }
      })
      const absent = Math.max(0, emps.length - present - late)
      setAttStats({ present, late, absent, overtime: Math.round(ot), undertime: Math.round(ut) })
      setRate(emps.length > 0 ? Math.round(((present + late) / emps.length) * 100) : 0)

      // ── Weekly trend ──────────────────────────────────
      const days = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun']
      const trend: WeekDay[] = []
      for (let i = 0; i < 7; i++) {
        const d = new Date(monday); d.setDate(d.getDate() + i)
        if (d > local) break
        const ds = d.toISOString().split('T')[0]
        const recs = atts.filter((r: any) => new Date(r.date).toISOString().split('T')[0] === ds)
        let p = 0, l = 0
        recs.forEach((r: any) => {
          const ci = r.checkInTime ? new Date(r.checkInTime) : null
          ;(r.status === 'late' || (ci && (ci.getHours() > 8 || (ci.getHours() === 8 && ci.getMinutes() > 0)))) ? l++ : ci ? p++ : void 0
        })
        trend.push({ day: days[i], present: p, late: l, absent: Math.max(0, emps.length - p - l) })
      }
      setWeekly(trend)

      // ── Department breakdown ──────────────────────────
      const dmap = new Map<string, { total: number; present: number }>()
      DEPARTMENTS.forEach(d => dmap.set(d, { total: 0, present: 0 }))
      emps.forEach((e: any) => { if (e.department && dmap.has(e.department)) dmap.get(e.department)!.total++ })
      todayRecs.forEach((r: any) => {
        const e = r.employee || emps.find((x: any) => x.id === r.employeeId)
        if (e?.department && dmap.has(e.department)) dmap.get(e.department)!.present++
      })
      const dArr: DeptStat[] = []
      dmap.forEach((v, name) => {
        if (v.total > 0) dArr.push({ name, total: v.total, present: v.present, rate: Math.round((v.present / v.total) * 100) })
      })
      dArr.sort((a, b) => b.total - a.total)
      setDeptStats(dArr)

      // ── Today's Activity ──────────────────────────────
      const sorted = [...todayRecs]
        .filter((r: any) => r.checkInTime || r.checkOutTime)
        .sort((a: any, b: any) => {
          const ta = new Date(b.checkOutTime || b.checkInTime).getTime()
          const tb = new Date(a.checkOutTime || a.checkInTime).getTime()
          return ta - tb
        })
        .slice(0, 5)

      setActivity(sorted.map((r: any, i: number) => {
        const e    = r.employee || emps.find((x: any) => x.id === r.employeeId) || {}
        const name = `${e.firstName || ''} ${e.lastName || ''}`.trim() || `Employee #${r.employeeId}`
        const isOut = !!r.checkOutTime
        const ts    = new Date(isOut ? r.checkOutTime : r.checkInTime)
        const ci    = r.checkInTime ? new Date(r.checkInTime) : null
        const isLate = r.status === 'late' || (ci && (ci.getHours() > 8 || (ci.getHours() === 8 && ci.getMinutes() > 0)))
        return {
          id: r.id || i,
          employee: name,
          department: e.department || e.dept || '—',
          branch: e.branch || '—',
          action: isOut ? 'Out' : 'In',
          time: ts.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
          status: isLate ? 'late' as const : 'on-time' as const,
        }
      }))

    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }, [router])

  useEffect(() => {
    const token    = localStorage.getItem('token')
    const employee = localStorage.getItem('employee')
    if (!token || !employee) { router.replace('/login'); return }
    load()
    // auto-refresh every 30s
    const t = setInterval(load, 30000)
    return () => clearInterval(t)
  }, [load, router])

  if (loading) return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="flex flex-col items-center gap-3">
        <div className="w-10 h-10 rounded-full border-4 border-t-transparent animate-spin"
          style={{ borderColor: `${RED} transparent ${RED} ${RED}` }} />
        <p className="text-sm text-muted-foreground">Loading dashboard...</p>
      </div>
    </div>
  )

  const statCards = [
    { label: 'Total Employees', value: empStats.total,  sub: `${empStats.active} active`,     icon: Users,        color: '#6366f1', bg: '#6366f115' },
    { label: 'On time',   value: attStats.present, sub: `${rate}% rate`,                icon: Clock,        color: '#22c55e', bg: '#22c55e15' },
    { label: 'Late',            value: attStats.late,   sub: `+${attStats.overtime}h overtime`,icon: TrendingUp,   color: GOLD,      bg: `${GOLD}20`  },
    { label: 'Absent',          value: attStats.absent, sub: `${attStats.undertime}h undertime`,icon: AlertCircle, color: RED,       bg: `${RED}15`   },
  ]

  return (
    <div className="space-y-5">

      {/* ── Header ─────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Dashboard</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            Welcome to BITS Admin Panel — here&apos;s today&apos;s overview
          </p>
        </div>
        <Button style={{ backgroundColor: RED }} className="gap-2 text-white hover:opacity-90">
          <FileText className="w-4 h-4" />
          Generate Report
        </Button>
      </div>

      {/* ── 4 Stat Cards ───────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map(({ label, value, sub, icon: Icon, color, bg }) => (
          <Card key={label} className="bg-card border-border p-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-muted-foreground">{label}</p>
                <p className="text-3xl font-bold text-foreground mt-1">{value}</p>
                <p className="text-xs mt-1" style={{ color }}>{sub}</p>
              </div>
              <div className="p-2.5 rounded-lg" style={{ backgroundColor: bg }}>
                <Icon className="w-5 h-5" style={{ color }} />
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* ── Chart + Departments ─────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* Weekly Attendance Chart */}
        <Card className="bg-card border-border p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-semibold text-foreground">Weekly Attendance</h3>
            <Badge variant="outline" className="text-xs" style={{ backgroundColor: `${RED}10`, color: RED, borderColor: `${RED}40` }}>
              This Week
            </Badge>
          </div>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={weekly} barCategoryGap="35%" barGap={2}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
              <XAxis dataKey="day" tick={{ fill: '#6b7280', fontSize: 12 }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fill: '#9ca3af', fontSize: 11 }} tickLine={false} axisLine={false} allowDecimals={false} />
              <Tooltip
                cursor={{ fill: 'rgba(0,0,0,0.03)' }}
                contentStyle={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, fontSize: 12, boxShadow: '0 4px 16px rgba(0,0,0,0.08)' }}
                labelStyle={{ color: '#374151', fontWeight: 600 }}
              />
              <Bar dataKey="present" name="Present" fill="#22c55e" radius={[4, 4, 0, 0]} />
              <Bar dataKey="late"    name="Late"    fill={GOLD}      radius={[4, 4, 0, 0]} />
              <Bar dataKey="absent"  name="Absent"  fill={RED}       radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>

        {/* Departments Breakdown */}
        <Card className="bg-card border-border p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-semibold text-foreground">Departments</h3>
            <Building2 className="w-4 h-4 text-muted-foreground" />
          </div>
          <div className="space-y-4 overflow-y-auto" style={{ maxHeight: 280 }}>
            {deptStats.length > 0 ? deptStats.map((dept, i) => {
              const cols = [RED, ORANGE, GOLD, '#6366f1', '#22c55e']
              const col  = cols[i % cols.length]
              return (
                <div key={dept.name}>
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-sm font-medium text-foreground">{dept.name}</p>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">{dept.total} emp</span>
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                        style={{ backgroundColor: `${col}15`, color: col }}>
                        {dept.rate}%
                      </span>
                    </div>
                  </div>
                  {/* Progress bar */}
                  <div className="h-2 rounded-full bg-gray-100">
                    <div
                      className="h-2 rounded-full transition-all duration-500"
                      style={{ width: `${dept.rate}%`, backgroundColor: col }}
                    />
                  </div>
                </div>
              )
            }) : (
              <p className="text-sm text-muted-foreground text-center py-10">No department data yet</p>
            )}
          </div>
        </Card>
      </div>

      {/* ── Today's Activity Table ──────────────────────── */}
      <Card className="bg-card border-border p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <h3 className="text-base font-semibold text-foreground">Today&apos;s Activity</h3>
            <span className="flex items-center gap-1 text-xs font-medium text-green-600">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
              Live
            </span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-muted-foreground">Updated {updatedAt}</span>
            <button className="flex items-center gap-1 text-xs font-medium hover:opacity-80 transition-opacity"
              style={{ color: RED }}>
              View All <ArrowRight className="w-3 h-3" />
            </button>
          </div>
        </div>

        {activity.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-2 px-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Employee</th>
                  <th className="text-left py-2 px-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Branch</th>
                  <th className="text-left py-2 px-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Action</th>
                  <th className="text-left py-2 px-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Time</th>
                  <th className="text-left py-2 px-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Status</th>
                </tr>
              </thead>
              <tbody>
                {activity.map((row) => (
                  <tr key={row.id} className="border-b border-border/50 hover:bg-secondary/30 transition-colors">
                    <td className="py-3 px-3">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0"
                          style={{ backgroundColor: row.status === 'late' ? RED : '#6366f1' }}>
                          {row.employee.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <p className="font-medium text-foreground">{row.employee}</p>
                          <p className="text-[11px] text-muted-foreground">{row.department}</p>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-3">
                      <span className="px-2 py-0.5 rounded-full text-xs bg-secondary text-muted-foreground">
                        {row.branch}
                      </span>
                    </td>
                    <td className="py-3 px-3">
                      <span className="flex items-center gap-1 text-sm font-medium"
                        style={{ color: row.action === 'In' ? '#22c55e' : '#6366f1' }}>
                        {row.action === 'In' ? '→' : '←'} {row.action}
                      </span>
                    </td>
                    <td className="py-3 px-3 font-mono text-muted-foreground text-xs">{row.time}</td>
                    <td className="py-3 px-3">
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold"
                        style={{
                          backgroundColor: row.status === 'late'    ? `${RED}15`      :
                                           row.status === 'absent'  ? '#6b728015'     :
                                           `${GOLD}20`,
                          color:           row.status === 'late'    ? RED             :
                                           row.status === 'absent'  ? '#6b7280'       :
                                           GOLD,
                        }}>
                        {row.status === 'on-time' ? 'On Time' : row.status === 'late' ? 'Late' : 'Absent'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="py-12 text-center">
            <p className="text-sm text-muted-foreground">No activity recorded today</p>
          </div>
        )}
      </Card>
    </div>
  )
}
