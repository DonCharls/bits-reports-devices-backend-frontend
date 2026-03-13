'use client'

// HR Shift Management page — same logic and design as Admin Shifts page
// HR role can create/edit/toggle/delete shifts
import { useState, useEffect, useCallback } from 'react'
import {
    Clock, Plus, Search, Edit2, Trash2, ToggleLeft, ToggleRight,
    AlertTriangle, Moon, Sun, X as XIcon, Users, Shield, Coffee
} from 'lucide-react'

interface Shift {
    id: number
    shiftCode: string
    name: string
    startTime: string
    endTime: string
    graceMinutes: number
    breakMinutes: number
    isNightShift: boolean
    isActive: boolean
    description: string | null
    workDays: string
    halfDays: string
    _count: { Employee: number }
}

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const

const emptyForm = {
    shiftCode: '', name: '', startTime: '', endTime: '',
    graceMinutes: 0, breakMinutes: 60, isNightShift: false, description: '',
    workDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'] as string[],
    halfDays: [] as string[],
}

function formatTime(t: string) {
    if (!t) return ''
    const [h, m] = t.split(':')
    const hour = parseInt(h)
    const suffix = hour >= 12 ? 'PM' : 'AM'
    const display = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour
    return `${display}:${m} ${suffix}`
}

function calcDuration(start: string, end: string, isNight: boolean) {
    if (!start || !end) return '--'
    const [sh, sm] = start.split(':').map(Number)
    const [eh, em] = end.split(':').map(Number)
    let mins = (eh * 60 + em) - (sh * 60 + sm)
    if (isNight && mins <= 0) mins += 24 * 60
    const h = Math.floor(mins / 60), m = mins % 60
    return `${h}h${m > 0 ? ` ${m}m` : ''}`
}

export default function HRShiftsPage() {
    const [shifts, setShifts] = useState<Shift[]>([])
    const [loading, setLoading] = useState(true)
    const [searchTerm, setSearchTerm] = useState('')
    const [filterActive, setFilterActive] = useState<'all' | 'active' | 'inactive'>('all')
    const [isFormOpen, setIsFormOpen] = useState(false)
    const [editingShift, setEditingShift] = useState<Shift | null>(null)
    const [form, setForm] = useState({ ...emptyForm })
    const [formLoading, setFormLoading] = useState(false)
    const [formError, setFormError] = useState('')
    const [deleteTarget, setDeleteTarget] = useState<Shift | null>(null)
    const [deleteLoading, setDeleteLoading] = useState(false)
    const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null)

    const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
        setToast({ msg, type })
        setTimeout(() => setToast(null), 3500)
    }

    const fetchShifts = useCallback(async () => {
        try {
            const token = localStorage.getItem('token')
            const res = await fetch('/api/shifts', { headers: { Authorization: `Bearer ${token}` } })
            const data = await res.json()
            if (data.success) setShifts(data.shifts)
        } catch (e) { console.error(e) }
        finally { setLoading(false) }
    }, [])

    useEffect(() => { fetchShifts() }, [fetchShifts])

    const filtered = shifts.filter(s => {
        const matchSearch = s.name.toLowerCase().includes(searchTerm.toLowerCase()) || s.shiftCode.toLowerCase().includes(searchTerm.toLowerCase())
        const matchStatus = filterActive === 'all' ? true : filterActive === 'active' ? s.isActive : !s.isActive
        return matchSearch && matchStatus
    })

    const openCreate = () => { setEditingShift(null); setForm({ ...emptyForm }); setFormError(''); setIsFormOpen(true) }
    const openEdit = (s: Shift) => {
        setEditingShift(s)
        let parsedDays: string[] = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']
        try { parsedDays = JSON.parse(s.workDays || '[]') } catch { }
        let parsedHalfDays: string[] = []
        try { parsedHalfDays = JSON.parse(s.halfDays || '[]') } catch { }
        setForm({ shiftCode: s.shiftCode, name: s.name, startTime: s.startTime, endTime: s.endTime, graceMinutes: s.graceMinutes, breakMinutes: s.breakMinutes, isNightShift: s.isNightShift, description: s.description || '', workDays: parsedDays, halfDays: parsedHalfDays })
        setFormError(''); setIsFormOpen(true)
    }

    const handleSubmit = async () => {
        if (!form.shiftCode.trim() || !form.name.trim() || !form.startTime || !form.endTime) { setFormError('Shift Code, Name, Start Time, and End Time are required.'); return }
        setFormLoading(true); setFormError('')
        try {
            const token = localStorage.getItem('token')
            const url = editingShift ? `/api/shifts/${editingShift.id}` : '/api/shifts'
            const method = editingShift ? 'PUT' : 'POST'
            const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(form) })
            const data = await res.json()
            if (!data.success) { setFormError(data.message || 'An error occurred'); return }
            showToast(editingShift ? 'Shift updated!' : 'Shift created!')
            setIsFormOpen(false); fetchShifts()
        } catch { setFormError('Failed to save shift.') }
        finally { setFormLoading(false) }
    }

    const handleToggle = async (s: Shift) => {
        try {
            const token = localStorage.getItem('token')
            const res = await fetch(`/api/shifts/${s.id}/toggle`, { method: 'PATCH', headers: { Authorization: `Bearer ${token}` } })
            const data = await res.json()
            if (data.success) { showToast(data.message); fetchShifts() }
        } catch { showToast('Failed to toggle shift', 'error') }
    }

    const handleDelete = async () => {
        if (!deleteTarget) return
        setDeleteLoading(true)
        try {
            const token = localStorage.getItem('token')
            const res = await fetch(`/api/shifts/${deleteTarget.id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } })
            const data = await res.json()
            if (data.success) { showToast('Shift deleted'); setDeleteTarget(null); fetchShifts() }
            else showToast(data.message || 'Delete failed', 'error')
        } catch { showToast('Failed to delete', 'error') }
        finally { setDeleteLoading(false) }
    }

    const activeCount = shifts.filter(s => s.isActive).length

    return (
        <div className="space-y-6 relative">
            {toast && (
                <div className={`fixed bottom-8 left-1/2 -translate-x-1/2 px-6 py-4 rounded-2xl shadow-2xl z-[200] text-white text-sm font-bold tracking-tight animate-in fade-in slide-in-from-bottom-4 duration-300 ${toast.type === 'success' ? 'bg-slate-700' : 'bg-red-600'}`}>
                    {toast.msg}
                </div>
            )}

            {deleteTarget && (
                <div className="fixed inset-0 z-[150] flex items-center justify-center bg-slate-950/40 backdrop-blur-sm">
                    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm mx-4 overflow-hidden">
                        <div className="p-6 text-center space-y-4">
                            <div className="w-14 h-14 rounded-full bg-red-100 flex items-center justify-center mx-auto"><AlertTriangle className="w-7 h-7 text-red-600" /></div>
                            <div>
                                <h3 className="text-lg font-black text-slate-800 tracking-tight">Delete Shift?</h3>
                                <p className="text-sm text-slate-500 mt-1"><span className="font-bold text-slate-700">{deleteTarget.name}</span> will be permanently removed.</p>
                                {deleteTarget._count.Employee > 0 && (
                                    <p className="text-xs text-amber-600 font-bold mt-2 bg-amber-50 rounded-xl p-2">⚠️ {deleteTarget._count.Employee} employee(s) assigned — reassign them first.</p>
                                )}
                            </div>
                            <div className="flex gap-3 pt-2">
                                <button onClick={() => setDeleteTarget(null)} className="flex-1 px-4 py-2.5 border border-slate-200 text-slate-600 rounded-xl text-sm font-bold hover:bg-slate-50 transition-all">Cancel</button>
                                <button onClick={handleDelete} disabled={deleteLoading || deleteTarget._count.Employee > 0} className="flex-1 px-4 py-2.5 bg-red-600 text-white rounded-xl text-sm font-bold hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg shadow-red-200 active:scale-95">
                                    {deleteLoading ? 'Deleting…' : 'Delete'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {isFormOpen && (
                <div className="fixed inset-0 bg-slate-950/40 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
                    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
                        <div className="p-5 bg-red-600 text-white flex justify-between items-center shrink-0">
                            <div>
                                <h3 className="font-bold text-lg leading-tight tracking-tight">{editingShift ? 'Edit Shift' : 'New Shift'}</h3>
                                <p className="text-[10px] text-red-100 opacity-90 uppercase font-black tracking-widest mt-0.5">{editingShift ? 'Modify shift schedule' : 'Create a shift schedule'}</p>
                            </div>
                            <button onClick={() => setIsFormOpen(false)} className="text-white/80 hover:text-white transition-colors"><XIcon className="w-5 h-5" /></button>
                        </div>
                        <div className="p-6 space-y-4 overflow-y-auto">
                            {formError && <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-xs font-bold text-red-700">{formError}</div>}
                            <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-1">
                                    <label className="text-[9px] font-black uppercase text-slate-400">Shift Code</label>
                                    <input type="text" placeholder="e.g. MS-01" value={form.shiftCode} onChange={e => setForm(f => ({ ...f, shiftCode: e.target.value.toUpperCase() }))} className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:ring-2 focus:ring-red-500/20 outline-none tracking-wider" />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-[9px] font-black uppercase text-slate-400">Shift Name</label>
                                    <input type="text" placeholder="e.g. Morning Shift" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:ring-2 focus:ring-red-500/20 outline-none" />
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-1">
                                    <label className="text-[9px] font-black uppercase text-slate-400">Start Time</label>
                                    <input type="time" value={form.startTime} onChange={e => setForm(f => ({ ...f, startTime: e.target.value }))} className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:ring-2 focus:ring-red-500/20 outline-none" />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-[9px] font-black uppercase text-slate-400">End Time</label>
                                    <input type="time" value={form.endTime} onChange={e => setForm(f => ({ ...f, endTime: e.target.value }))} className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:ring-2 focus:ring-red-500/20 outline-none" />
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-1">
                                    <label className="text-[9px] font-black uppercase text-slate-400">Grace Period (mins)</label>
                                    <input type="number" min={0} max={60} value={form.graceMinutes} onChange={e => setForm(f => ({ ...f, graceMinutes: parseInt(e.target.value) || 0 }))} className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:ring-2 focus:ring-red-500/20 outline-none" />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-[9px] font-black uppercase text-slate-400">Break Duration (mins)</label>
                                    <input type="number" min={0} max={180} value={form.breakMinutes} onChange={e => setForm(f => ({ ...f, breakMinutes: parseInt(e.target.value) || 0 }))} className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:ring-2 focus:ring-red-500/20 outline-none" />
                                </div>
                            </div>
                            <div className="flex items-center justify-between bg-slate-50 border border-slate-200 rounded-xl p-3">
                                <div className="flex items-center gap-2">
                                    <Moon size={15} className="text-indigo-500" />
                                    <div>
                                        <p className="text-xs font-bold text-slate-700">Overnight / Night Shift</p>
                                        <p className="text-[10px] text-slate-400">Enable if shift crosses midnight</p>
                                    </div>
                                </div>
                                <button onClick={() => setForm(f => ({ ...f, isNightShift: !f.isNightShift }))} className={`relative w-11 h-6 rounded-full transition-colors ${form.isNightShift ? 'bg-indigo-600' : 'bg-slate-300'}`}>
                                    <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${form.isNightShift ? 'translate-x-5' : 'translate-x-0'}`} />
                                </button>
                            </div>
                            <div className="space-y-1">
                                <label className="text-[9px] font-black uppercase text-slate-400">Description (optional)</label>
                                <textarea placeholder="Brief description..." value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={2} className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:ring-2 focus:ring-red-500/20 outline-none resize-none" />
                            </div>
                            {/* Work Days */}
                            <div className="space-y-2">
                                <label className="text-[9px] font-black uppercase text-slate-400">Work Days</label>
                                <div className="flex flex-wrap gap-2">
                                    {DAYS.map(day => {
                                        const isWeekend = day === 'Sat' || day === 'Sun'
                                        const active = form.workDays.includes(day)
                                        const isHalf = form.halfDays.includes(day)
                                        return (
                                            <div key={day} className="flex flex-col items-center gap-1">
                                                <button type="button"
                                                    onClick={() => setForm(f => ({ ...f, workDays: active ? f.workDays.filter(d => d !== day) : [...f.workDays, day], halfDays: active ? f.halfDays.filter(d => d !== day) : f.halfDays }))}
                                                    className={`px-3 py-1.5 rounded-xl text-[11px] font-black transition-all border ${active ? isWeekend ? 'bg-red-100 border-red-300 text-red-700' : 'bg-red-600 border-red-600 text-white' : 'bg-slate-50 border-slate-200 text-slate-400 hover:border-slate-300'}`}
                                                >{day}</button>
                                                {active && (
                                                    <button type="button"
                                                        title={isHalf ? 'Full day — click to remove' : 'Mark as half day'}
                                                        onClick={() => setForm(f => ({ ...f, halfDays: isHalf ? f.halfDays.filter(d => d !== day) : [...f.halfDays, day] }))}
                                                        className={`text-[9px] font-black px-1.5 py-0.5 rounded-md transition-all ${isHalf ? 'bg-orange-400 text-white' : 'bg-slate-100 text-slate-400 hover:bg-orange-100 hover:text-orange-500'}`}
                                                    >½</button>
                                                )}
                                            </div>
                                        )
                                    })}
                                </div>
                                <p className="text-[10px] text-slate-400 font-medium">
                                    {form.workDays.length} day(s) selected
                                    {form.halfDays.length > 0 && <span className="text-orange-500 font-bold"> · Half days: {form.halfDays.join(', ')}</span>}
                                    {' '}· Rest days: {DAYS.filter(d => !form.workDays.includes(d)).join(', ') || 'None'}
                                </p>
                            </div>
                            {(form.startTime && form.endTime) && (
                                <div className="bg-red-50 border border-red-100 rounded-xl p-3 flex items-center gap-3">
                                    <Clock size={16} className="text-red-500 shrink-0" />
                                    <div className="text-xs text-red-700 font-bold">
                                        {formatTime(form.startTime)} → {formatTime(form.endTime)}
                                        <span className="text-red-400 font-medium ml-2">({calcDuration(form.startTime, form.endTime, form.isNightShift)} · {form.breakMinutes}m break)</span>
                                    </div>
                                </div>
                            )}
                        </div>
                        <div className="p-5 bg-slate-50 flex gap-3 shrink-0">
                            <button onClick={() => setIsFormOpen(false)} className="flex-1 px-4 py-3.5 text-sm font-bold text-slate-500 hover:text-slate-800 transition-colors">Discard</button>
                            <button onClick={handleSubmit} disabled={formLoading} className="flex-1 px-4 py-3.5 bg-red-600 text-white rounded-xl text-sm font-black shadow-lg shadow-red-600/30 hover:bg-red-700 disabled:opacity-70 transition-all active:scale-95">
                                {formLoading ? 'Saving…' : editingShift ? 'Save Changes' : 'Create Shift'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <div className="flex flex-col lg:flex-row justify-between lg:items-center gap-4">
                <div>
                    <h1 className="text-2xl font-black text-slate-800 tracking-tight">Shift Management</h1>
                    <p className="text-slate-500 text-sm font-medium">Define and manage employee work shift schedules.</p>
                </div>
                <button onClick={openCreate} className="bg-red-600 text-white px-6 py-2.5 rounded-xl font-bold text-sm shadow-lg shadow-red-600/20 hover:bg-red-700 transition-all active:scale-95 flex items-center justify-center gap-2 self-start lg:self-center">
                    <Plus size={18} />New Shift
                </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="bg-white border border-slate-200 rounded-2xl p-5 flex items-start justify-between">
                    <div><p className="text-sm text-slate-400 font-medium">Total Shifts</p><p className="text-3xl font-bold text-slate-800 mt-1">{shifts.length}</p><p className="text-xs text-slate-400 mt-1">Configured schedules</p></div>
                    <div className="p-2.5 rounded-lg bg-red-50"><Clock className="w-5 h-5 text-red-600" /></div>
                </div>
                <div className="bg-white border border-slate-200 rounded-2xl p-5 flex items-start justify-between">
                    <div><p className="text-sm text-slate-400 font-medium">Active Shifts</p><p className="text-3xl font-bold text-slate-800 mt-1">{activeCount}</p><p className="text-xs text-slate-400 mt-1">Currently in use</p></div>
                    <div className="p-2.5 rounded-lg bg-emerald-50"><Shield className="w-5 h-5 text-emerald-600" /></div>
                </div>
                <div className="bg-white border border-slate-200 rounded-2xl p-5 flex items-start justify-between">
                    <div><p className="text-sm text-slate-400 font-medium">Total Assigned</p><p className="text-3xl font-bold text-slate-800 mt-1">{shifts.reduce((a, s) => a + s._count.Employee, 0)}</p><p className="text-xs text-slate-400 mt-1">Employees on shifts</p></div>
                    <div className="p-2.5 rounded-lg bg-blue-50"><Users className="w-5 h-5 text-blue-600" /></div>
                </div>
            </div>

            <div className="flex flex-col md:flex-row items-center bg-white px-6 py-3 rounded-2xl border border-slate-200 shadow-sm gap-4">
                <div className="relative w-full md:w-64">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                    <input type="text" placeholder="Search shifts..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-600 outline-none w-full focus:ring-2 focus:ring-red-500/10 focus:border-red-200 transition-all" />
                </div>
                <div className="flex items-center gap-2 ml-auto">
                    {(['all', 'active', 'inactive'] as const).map(f => (
                        <button key={f} onClick={() => setFilterActive(f)} className={`px-4 py-1.5 rounded-xl text-xs font-bold capitalize transition-all ${filterActive === f ? 'bg-red-600 text-white shadow-sm' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>{f}</button>
                    ))}
                </div>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <table className="w-full text-left text-sm border-collapse">
                    <thead className="bg-slate-50 text-slate-400 font-bold uppercase text-[10px] tracking-widest border-b border-slate-100">
                        <tr>
                            <th className="px-6 py-5">Shift</th>
                            <th className="px-6 py-5">Schedule</th>
                            <th className="px-6 py-5">Work Days</th>
                            <th className="px-6 py-5">Grace / Break</th>
                            <th className="px-6 py-5">Employees</th>
                            <th className="px-6 py-5 text-center">Status</th>
                            <th className="px-6 py-5 text-center">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {loading ? (
                            <tr><td colSpan={7} className="px-6 py-24 text-center text-slate-400 font-bold uppercase text-[10px] tracking-widest">Loading shifts…</td></tr>
                        ) : filtered.length > 0 ? filtered.map(s => (
                            <tr key={s.id} className="hover:bg-red-50/30 transition-colors duration-200">
                                <td className="px-6 py-4">
                                    <div className="flex items-center gap-3">
                                        <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${s.isNightShift ? 'bg-indigo-100' : 'bg-amber-100'}`}>
                                            {s.isNightShift ? <Moon size={16} className="text-indigo-600" /> : <Sun size={16} className="text-amber-600" />}
                                        </div>
                                        <div>
                                            <p className="font-bold text-slate-700 text-sm">{s.name}</p>
                                            <p className="text-[10px] font-black text-slate-400 tracking-wider">{s.shiftCode}</p>
                                        </div>
                                    </div>
                                </td>
                                <td className="px-6 py-4">
                                    <p className="text-xs font-bold text-slate-700">{formatTime(s.startTime)} – {formatTime(s.endTime)}</p>
                                    <p className="text-[10px] text-slate-400 font-medium">{calcDuration(s.startTime, s.endTime, s.isNightShift)} shift</p>
                                </td>
                                <td className="px-6 py-4">
                                    {(() => {
                                        let days: string[] = []
                                        let halfs: string[] = []
                                        try { days = JSON.parse(s.workDays || '[]') } catch { }
                                        try { halfs = JSON.parse(s.halfDays || '[]') } catch { }
                                        return (
                                            <div className="flex flex-wrap gap-1">
                                                {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(d => {
                                                    const on = days.includes(d)
                                                    const half = halfs.includes(d)
                                                    const isWeekend = d === 'Sat' || d === 'Sun'
                                                    return (
                                                        <div key={d} className="flex flex-col items-center gap-0.5">
                                                            <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-md ${on ? isWeekend ? 'bg-red-100 text-red-600' : 'bg-slate-700 text-white' : 'bg-slate-100 text-slate-300'}`}>{d}</span>
                                                            {on && half && <span className="text-[8px] font-black bg-orange-400 text-white px-1 rounded-sm">½</span>}
                                                        </div>
                                                    )
                                                })}
                                            </div>
                                        )
                                    })()}
                                </td>
                                <td className="px-6 py-4">
                                    <div className="flex items-center gap-3">
                                        <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-lg">{s.graceMinutes}m grace</span>
                                        <div className="flex items-center gap-1 text-[10px] font-bold text-slate-500"><Coffee size={11} className="text-slate-400" />{s.breakMinutes}m break</div>
                                    </div>
                                </td>
                                <td className="px-6 py-4"><div className="flex items-center gap-1.5"><Users size={13} className="text-slate-400" /><span className="text-xs font-bold text-slate-600">{s._count.Employee}</span></div></td>
                                <td className="px-6 py-4 text-center">
                                    <span className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider ${s.isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-400'}`}>{s.isActive ? 'Active' : 'Inactive'}</span>
                                </td>
                                <td className="px-6 py-4">
                                    <div className="flex items-center gap-1">
                                        <button onClick={() => handleToggle(s)} title={s.isActive ? 'Deactivate' : 'Activate'} className={`p-2.5 rounded-xl transition-all active:scale-90 ${s.isActive ? 'text-emerald-500 hover:bg-emerald-50' : 'text-slate-400 hover:bg-slate-100'}`}>
                                            {s.isActive ? <ToggleRight size={18} /> : <ToggleLeft size={18} />}
                                        </button>
                                        <button onClick={() => openEdit(s)} title="Edit" className="p-2.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-all active:scale-90"><Edit2 size={16} /></button>
                                        <button onClick={() => setDeleteTarget(s)} title="Delete" className="p-2.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all active:scale-90"><Trash2 size={16} /></button>
                                    </div>
                                </td>
                            </tr>
                        )) : (
                            <tr><td colSpan={7} className="px-6 py-24 text-center text-slate-400 font-bold uppercase text-[10px] tracking-widest">No shifts found</td></tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    )
}
