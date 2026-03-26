'use client'

import { useState, useEffect } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogTitle, DialogDescription, DialogTrigger } from '@/components/ui/dialog'
import {
  Plus, Building2, Trash2, AlertTriangle, Search, X as XIcon,
  Users, TrendingUp, LayoutGrid, List, Edit2, MapPin, CheckCircle2, Loader2
} from 'lucide-react'
import { useTableSort } from '@/hooks/useTableSort'
import { SortableHeader } from '@/components/ui/SortableHeader'

// ── Types ──────────────────────────────────────────────────────────
interface Department { id: number; name: string }
interface Branch { id: number; name: string; address?: string | null }

const DEPT_COLORS = [
  { bg: 'bg-red-50', border: 'border-red-100', icon: 'bg-red-500', text: 'text-red-600', light: 'text-red-400', accent: '#C8102E' },
  { bg: 'bg-blue-50', border: 'border-blue-100', icon: 'bg-blue-500', text: 'text-blue-600', light: 'text-blue-400', accent: '#3b82f6' },
  { bg: 'bg-amber-50', border: 'border-amber-100', icon: 'bg-amber-500', text: 'text-amber-600', light: 'text-amber-400', accent: '#f59e0b' },
  { bg: 'bg-emerald-50', border: 'border-emerald-100', icon: 'bg-emerald-500', text: 'text-emerald-600', light: 'text-emerald-400', accent: '#10b981' },
  { bg: 'bg-purple-50', border: 'border-purple-100', icon: 'bg-purple-500', text: 'text-purple-600', light: 'text-purple-400', accent: '#8b5cf6' },
  { bg: 'bg-pink-50', border: 'border-pink-100', icon: 'bg-pink-500', text: 'text-pink-600', light: 'text-pink-400', accent: '#ec4899' },
  { bg: 'bg-cyan-50', border: 'border-cyan-100', icon: 'bg-cyan-500', text: 'text-cyan-600', light: 'text-cyan-400', accent: '#06b6d4' },
  { bg: 'bg-orange-50', border: 'border-orange-100', icon: 'bg-orange-500', text: 'text-orange-600', light: 'text-orange-400', accent: '#f97316' },
  { bg: 'bg-indigo-50', border: 'border-indigo-100', icon: 'bg-indigo-500', text: 'text-indigo-600', light: 'text-indigo-400', accent: '#6366f1' },
  { bg: 'bg-teal-50', border: 'border-teal-100', icon: 'bg-teal-500', text: 'text-teal-600', light: 'text-teal-400', accent: '#14b8a6' },
]

export default function HRDepartmentsPage() {
  // ── State ──
  const [departments, setDepartments] = useState<Department[]>([])
  const [branches, setBranches] = useState<Branch[]>([])
  const [deptCounts, setDeptCounts] = useState<Record<string, number>>({})
  const [branchCounts, setBranchCounts] = useState<Record<string, number>>({})
  const [allEmployees, setAllEmployees] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [apiError, setApiError] = useState<string | null>(null)

  const [searchTerm, setSearchTerm] = useState('')
  const [branchFilter, setBranchFilter] = useState('all')
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')

  // Add dialog
  const [isAddOpen, setIsAddOpen] = useState(false)
  const [addType, setAddType] = useState<'department' | 'branch'>('department')
  const [newName, setNewName] = useState('')
  const [addLoading, setAddLoading] = useState(false)
  const [addError, setAddError] = useState<string | null>(null)

  // Edit department dialog
  const [editingDept, setEditingDept] = useState<Department | null>(null)
  const [editName, setEditName] = useState('')
  const [editLoading, setEditLoading] = useState(false)
  const [editError, setEditError] = useState<string | null>(null)

  // Delete confirmation
  const [confirmDeleteDept, setConfirmDeleteDept] = useState<Department | null>(null)
  const [confirmDeleteBranch, setConfirmDeleteBranch] = useState<Branch | null>(null)
  const [deleteLoading, setDeleteLoading] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  // ── Helpers ──
  const authHeaders = () => ({
    'Content-Type': 'application/json',
  })

  // ── Initial load ──
  useEffect(() => {
    const load = async () => {
      setLoading(true)
      try {
        // Fetch departments
        const deptRes = await fetch('/api/departments', { credentials: 'include' })
        const deptData = await deptRes.json()
        if (deptData.success) {
          setDepartments(deptData.departments)
        }

        // Fetch branches
        const branchRes = await fetch('/api/branches', { credentials: 'include' })
        const branchData = await branchRes.json()
        if (branchData.success) {
          setBranches(branchData.branches)
        }

        // Fetch employees
        const empRes = await fetch('/api/employees', { credentials: 'include' })
        const empData = await empRes.json()
        if (empData.success) {
          const activeEmps = (empData.employees || []).filter((e: any) =>
            e.employmentStatus === 'ACTIVE' && (!e.role || e.role === 'USER')
          )
          setAllEmployees(activeEmps)

          const dCounts: Record<string, number> = {}
          const bCounts: Record<string, number> = {}
          activeEmps.forEach((e: any) => {
            if (e.department) dCounts[e.department] = (dCounts[e.department] || 0) + 1
            if (e.branch) bCounts[e.branch] = (bCounts[e.branch] || 0) + 1
          })
          setDeptCounts(dCounts)
          setBranchCounts(bCounts)
        }
      } catch {
        setApiError('Failed to load data. Please refresh.')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  // ── Filtered departments ──
  const filteredDepts = departments.filter(d => {
    if (!d.name.toLowerCase().includes(searchTerm.toLowerCase())) return false
    if (branchFilter !== 'all') {
      return allEmployees.some(e => (e.Department?.name || e.department) === d.name && e.branch === branchFilter)
    }
    return true
  })

  const { sortedData: sortedDepts, sortKey, sortOrder, handleSort } = useTableSort<Department>({
    initialData: filteredDepts
  })
  const sortKeyStr = sortKey as string | null

  // ── Add ──
  const handleAdd = async () => {
    const trimmed = newName.trim()
    if (!trimmed) return
    setAddLoading(true)
    setAddError(null)
    try {
      const endpoint = addType === 'department' ? '/api/departments' : '/api/branches'
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: authHeaders(),
        credentials: 'include',
        body: JSON.stringify({ name: trimmed }),
      })
      const data = await res.json()
      if (!data.success) {
        setAddError(data.message || 'Failed to create')
        return
      }
      if (addType === 'department') {
        setDepartments(prev => [...prev, data.department].sort((a, b) => a.name.localeCompare(b.name)))
      } else {
        setBranches(prev => [...prev, data.branch].sort((a, b) => a.name.localeCompare(b.name)))
      }
      setNewName('')
      setIsAddOpen(false)
    } catch {
      setAddError('Network error. Please try again.')
    } finally {
      setAddLoading(false)
    }
  }

  // ── Rename department ──
  const handleEditSave = async () => {
    if (!editingDept || !editName.trim()) return
    setEditLoading(true)
    setEditError(null)
    try {
      const res = await fetch(`/api/departments/${editingDept.id}`, {
        method: 'PUT',
        headers: authHeaders(),
        credentials: 'include',
        body: JSON.stringify({ name: editName.trim() }),
      })
      const data = await res.json()
      if (!data.success) {
        setEditError(data.message || 'Failed to rename')
        return
      }
      setDepartments(prev =>
        prev.map(d => d.id === editingDept.id ? data.department : d)
          .sort((a, b) => a.name.localeCompare(b.name))
      )
      // Update counts key if name changed
      if (deptCounts[editingDept.name]) {
        setDeptCounts(prev => {
          const next = { ...prev }
          next[data.department.name] = next[editingDept.name] || 0
          delete next[editingDept.name]
          return next
        })
      }
      setEditingDept(null)
    } catch {
      setEditError('Network error. Please try again.')
    } finally {
      setEditLoading(false)
    }
  }

  // ── Delete department ──
  const handleDeleteDept = async () => {
    if (!confirmDeleteDept) return
    setDeleteLoading(true)
    setDeleteError(null)
    try {
      const res = await fetch(`/api/departments/${confirmDeleteDept.id}`, {
        method: 'DELETE',
        headers: authHeaders(),
        credentials: 'include',
      })
      const data = await res.json()
      if (!data.success) {
        setDeleteError(data.message || 'Failed to delete')
        return
      }
      setDepartments(prev => prev.filter(d => d.id !== confirmDeleteDept.id))
      setConfirmDeleteDept(null)
    } catch {
      setDeleteError('Network error. Please try again.')
    } finally {
      setDeleteLoading(false)
    }
  }

  // ── Delete branch ──
  const handleDeleteBranch = async () => {
    if (!confirmDeleteBranch) return
    setDeleteLoading(true)
    setDeleteError(null)
    try {
      const res = await fetch(`/api/branches/${confirmDeleteBranch.id}`, {
        method: 'DELETE',
        headers: authHeaders(),
        credentials: 'include',
      })
      const data = await res.json()
      if (!data.success) {
        setDeleteError(data.message || 'Failed to delete')
        return
      }
      setBranches(prev => prev.filter(b => b.id !== confirmDeleteBranch.id))
      setConfirmDeleteBranch(null)
    } catch {
      setDeleteError('Network error. Please try again.')
    } finally {
      setDeleteLoading(false)
    }
  }

  // ── Display helpers ──
  const getColor = (index: number) => DEPT_COLORS[index % DEPT_COLORS.length]
  const getInitials = (name: string) => {
    const words = name.replace(' DEPARTMENT', '').split(' ')
    return words.length >= 2 ? words[0][0] + words[1][0] : words[0].substring(0, 2)
  }
  const totalEmployees = allEmployees.length

  // ── Render ──
  return (
    <div className="space-y-6">

      {/* ── Confirm Delete Department ── */}
      {(confirmDeleteDept || confirmDeleteBranch) && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/40 backdrop-blur-sm">
          <div className="bg-card border border-border rounded-2xl shadow-2xl p-6 max-w-sm w-full mx-4">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-red-500/20 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5 text-red-400" />
              </div>
              <div>
                <h3 className="font-semibold text-foreground">
                  Remove {confirmDeleteDept ? 'Department' : 'Branch'}?
                </h3>
                <p className="text-sm text-muted-foreground">This action cannot be undone.</p>
              </div>
            </div>
            <p className="text-sm text-foreground mb-2">
              Are you sure you want to remove <span className="font-medium">
                {confirmDeleteDept?.name || confirmDeleteBranch?.name}
              </span>?
            </p>
            {deleteError && (
              <p className="text-xs text-red-500 bg-red-50 rounded-lg px-3 py-2 mb-3">{deleteError}</p>
            )}
            <div className="flex gap-3 mt-5">
              <Button
                variant="outline"
                className="flex-1 border-border text-foreground hover:bg-secondary"
                onClick={() => {
                  setConfirmDeleteDept(null)
                  setConfirmDeleteBranch(null)
                  setDeleteError(null)
                }}
                disabled={deleteLoading}
              >
                Cancel
              </Button>
              <Button
                className="flex-1 bg-red-600 hover:bg-red-700 text-white"
                onClick={confirmDeleteDept ? handleDeleteDept : handleDeleteBranch}
                disabled={deleteLoading}
              >
                {deleteLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Remove'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── Edit Department Dialog ── */}
      {editingDept && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/40 backdrop-blur-sm">
          <div className="bg-white border-0 rounded-2xl shadow-xl max-w-md w-full mx-4 overflow-hidden">
            <div className="bg-red-600 px-6 py-4 flex items-center justify-between">
              <div>
                <h3 className="text-white font-bold text-lg">Edit Department</h3>
                <p className="text-white/80 text-[10px] uppercase tracking-widest font-bold mt-1">Rename department</p>
              </div>
              <button onClick={() => { setEditingDept(null); setEditError(null) }} className="text-white/80 hover:text-white transition-colors">
                <XIcon className="w-5 h-5" />
              </button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div>
                <label className="text-slate-400 text-[10px] uppercase tracking-widest font-bold">Department Name</label>
                <input
                  placeholder="e.g. LOGISTICS DEPARTMENT"
                  className="mt-1.5 w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-white text-sm font-medium text-slate-700 placeholder:text-slate-300 focus:ring-2 focus:ring-red-500/20 outline-none transition-all"
                  value={editName}
                  onChange={e => setEditName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleEditSave()}
                />
              </div>
              {editError && <p className="text-xs text-red-500 bg-red-50 rounded-lg px-3 py-2">{editError}</p>}
            </div>
            <div className="flex items-center justify-center gap-6 px-6 py-4 border-t border-slate-100">
              <button
                className="text-sm font-bold text-slate-400 hover:text-slate-600 transition-colors"
                onClick={() => { setEditingDept(null); setEditError(null) }}
                disabled={editLoading}
              >
                Cancel
              </button>
              <button
                onClick={handleEditSave}
                disabled={editLoading}
                className="px-8 py-2.5 bg-red-600 hover:bg-red-700 text-white text-sm font-bold rounded-xl transition-colors flex items-center gap-2 disabled:opacity-60"
              >
                {editLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-red-600/10 flex items-center justify-center">
            <Building2 className="w-5 h-5 text-red-600" />
          </div>
          <div>
            <h2 className="text-2xl sm:text-3xl font-bold text-foreground">Organization</h2>
            <p className="text-muted-foreground text-sm mt-0.5">Manage departments & branches</p>
          </div>
        </div>

        <Dialog open={isAddOpen} onOpenChange={v => { setIsAddOpen(v); if (!v) { setNewName(''); setAddError(null) } }}>
          <DialogTrigger asChild>
            <Button className="bg-red-600 hover:bg-red-700 gap-2 text-white shadow-lg shadow-red-600/20">
              <Plus className="w-4 h-4" />
              Add New
            </Button>
          </DialogTrigger>
          <DialogContent showCloseButton={false} className="bg-white border-0 max-w-md p-0 rounded-2xl overflow-hidden shadow-xl">
            <div className="bg-red-600 px-6 py-4 flex items-center justify-between">
              <div>
                <DialogTitle className="text-white font-bold text-lg">Add New</DialogTitle>
                <DialogDescription className="text-white/80 text-[10px] uppercase tracking-widest font-bold mt-1">Create a department or branch</DialogDescription>
              </div>
              <button onClick={() => setIsAddOpen(false)} className="text-white/80 hover:text-white transition-colors">
                <XIcon className="w-5 h-5" />
              </button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div>
                <label className="text-slate-400 text-[10px] uppercase tracking-widest font-bold">Type</label>
                <div className="flex gap-2 mt-1.5">
                  <button
                    onClick={() => setAddType('department')}
                    className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-all border ${addType === 'department'
                      ? 'bg-red-50 border-red-200 text-red-600'
                      : 'bg-slate-50 border-slate-200 text-slate-400 hover:text-slate-600'}`}
                  >
                    <Building2 className="w-4 h-4" />
                    Department
                  </button>
                  <button
                    onClick={() => setAddType('branch')}
                    className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-all border ${addType === 'branch'
                      ? 'bg-red-50 border-red-200 text-red-600'
                      : 'bg-slate-50 border-slate-200 text-slate-400 hover:text-slate-600'}`}
                  >
                    <MapPin className="w-4 h-4" />
                    Branch
                  </button>
                </div>
              </div>
              <div>
                <label className="text-slate-400 text-[10px] uppercase tracking-widest font-bold">
                  {addType === 'department' ? 'Department Name' : 'Branch Name'}
                </label>
                <input
                  placeholder={addType === 'department' ? 'e.g. LOGISTICS DEPARTMENT' : 'e.g. CEBU CITY'}
                  className="mt-1.5 w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-white text-sm font-medium text-slate-700 placeholder:text-slate-300 focus:ring-2 focus:ring-red-500/20 outline-none transition-all"
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleAdd()}
                />
              </div>
              {addError && <p className="text-xs text-red-500 bg-red-50 rounded-lg px-3 py-2">{addError}</p>}
            </div>
            <div className="flex items-center justify-center gap-6 px-6 py-4 border-t border-slate-100">
              <button
                className="text-sm font-bold text-slate-400 hover:text-slate-600 transition-colors"
                onClick={() => { setNewName(''); setIsAddOpen(false); setAddError(null) }}
                disabled={addLoading}
              >
                Discard
              </button>
              <button
                onClick={handleAdd}
                disabled={addLoading}
                className="px-8 py-2.5 bg-red-600 hover:bg-red-700 text-white text-sm font-bold rounded-xl transition-colors flex items-center gap-2 disabled:opacity-60"
              >
                {addLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                {addType === 'department' ? 'Add Department' : 'Add Branch'}
              </button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {apiError && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-600 font-medium">
          {apiError}
        </div>
      )}

      {/* ── Summary Stats ── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="bg-white border-slate-200 p-5">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm text-slate-400 font-medium">Departments</p>
              <p className="text-3xl font-bold text-slate-800 mt-1">{loading ? '—' : departments.length}</p>
              <p className="text-xs text-slate-400 mt-1">Active departments</p>
            </div>
            <div className="p-2.5 rounded-lg bg-red-50"><Building2 className="w-5 h-5 text-red-600" /></div>
          </div>
        </Card>
        <Card className="bg-white border-slate-200 p-5">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm text-slate-400 font-medium">Branches</p>
              <p className="text-3xl font-bold text-slate-800 mt-1">{loading ? '—' : branches.length}</p>
              <p className="text-xs text-slate-400 mt-1">Office locations</p>
            </div>
            <div className="p-2.5 rounded-lg bg-blue-50"><MapPin className="w-5 h-5 text-blue-600" /></div>
          </div>
        </Card>
        <Card className="bg-white border-slate-200 p-5">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm text-slate-400 font-medium">Total Workforce</p>
              <p className="text-3xl font-bold text-slate-800 mt-1">{loading ? '—' : totalEmployees}</p>
              <p className="text-xs text-slate-400 mt-1">Active employees</p>
            </div>
            <div className="p-2.5 rounded-lg bg-emerald-50"><Users className="w-5 h-5 text-emerald-600" /></div>
          </div>
        </Card>
      </div>

      {/* ── Branches Cards ── */}
      <div>
        <h3 className="text-sm font-bold text-slate-400 uppercase tracking-widest mb-3">Branches</h3>
        {loading ? (
          <div className="flex items-center gap-2 text-slate-400 text-sm py-4">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading branches...
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {branches.map(branch => {
              const count = branchCounts[branch.name] || 0
              return (
                <div key={branch.id} className="bg-white border border-slate-200 rounded-xl p-4 flex items-center gap-3 hover:shadow-md transition-all group">
                  <div className="w-10 h-10 rounded-lg bg-blue-500 flex items-center justify-center text-white text-xs font-black shrink-0 shadow-lg shadow-blue-500/20">
                    <MapPin className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-slate-700 text-sm">{branch.name}</p>
                    <p className="text-xs text-slate-400">{count} {count === 1 ? 'employee' : 'employees'}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {count > 0 && (
                      <div className="flex items-center gap-1">
                        <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                        <span className="text-[10px] font-bold text-emerald-500">Active</span>
                      </div>
                    )}
                    <button
                      onClick={() => { setConfirmDeleteBranch(branch); setDeleteError(null) }}
                      title="Remove branch"
                      className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg text-slate-300 hover:text-red-500 hover:bg-red-50 transition-all"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              )
            })}
            {branches.length === 0 && (
              <p className="text-sm text-slate-400 italic py-2">No branches found.</p>
            )}
          </div>
        )}
      </div>

      {/* ── Search + Filter + View Toggle ── */}
      <Card className="bg-white border-slate-200 p-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input
              placeholder="Search departments..."
              className="pl-10 bg-slate-50 border-slate-200 text-slate-700 placeholder:text-slate-300"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
            />
          </div>
          <Select value={branchFilter} onValueChange={setBranchFilter}>
            <SelectTrigger className="w-full sm:w-44 bg-slate-50 border-slate-200 text-slate-700">
              <SelectValue placeholder="Branch" />
            </SelectTrigger>
            <SelectContent className="bg-white border-slate-200">
              <SelectItem value="all">All Branches</SelectItem>
              {branches.map(branch => (
                <SelectItem key={branch.id} value={branch.name}>{branch.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex items-center bg-slate-100 rounded-xl p-1">
            <button
              onClick={() => setViewMode('grid')}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold transition-all ${viewMode === 'grid' ? 'bg-white text-slate-700 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
            >
              <LayoutGrid className="w-3.5 h-3.5" /> Grid
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold transition-all ${viewMode === 'list' ? 'bg-white text-slate-700 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
            >
              <List className="w-3.5 h-3.5" /> List
            </button>
          </div>
        </div>
      </Card>

      {/* ── Departments heading ── */}
      <h3 className="text-sm font-bold text-slate-400 uppercase tracking-widest">
        Departments {branchFilter !== 'all' && <span className="text-red-500">· {branchFilter}</span>}
      </h3>

      {loading ? (
        <div className="flex items-center gap-2 text-slate-400 text-sm py-6">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading departments...
        </div>
      ) : viewMode === 'grid' ? (
        /* ── Grid View ── */
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {sortedDepts.map((dept, index) => {
            const color = getColor(index)
            const count = deptCounts[dept.name] || 0
            const initials = getInitials(dept.name)
            const displayName = dept.name.replace(' DEPARTMENT', '')
            return (
              <div
                key={dept.id}
                className={`group relative ${color.bg} border ${color.border} rounded-2xl p-5 hover:shadow-lg hover:shadow-slate-200/50 transition-all duration-300 hover:-translate-y-0.5`}
              >
                <div className="absolute top-4 right-4 flex gap-1 opacity-0 group-hover:opacity-100 transition-all">
                  <button
                    onClick={() => { setEditingDept(dept); setEditName(dept.name); setEditError(null) }}
                    className="p-2 rounded-xl text-slate-300 hover:text-blue-500 hover:bg-blue-50 transition-all"
                    title="Edit department"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => { setConfirmDeleteDept(dept); setDeleteError(null) }}
                    className="p-2 rounded-xl text-slate-300 hover:text-red-500 hover:bg-red-50 transition-all"
                    title="Remove department"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div className="flex items-start gap-4">
                  <div
                    className={`w-12 h-12 ${color.icon} rounded-xl flex items-center justify-center text-white text-sm font-black shrink-0 shadow-lg`}
                    style={{ boxShadow: `0 4px 14px ${color.accent}30` }}
                  >
                    {initials}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-bold text-slate-700 text-sm leading-tight">{displayName}</h3>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mt-0.5">Department</p>
                  </div>
                </div>
                <div className="mt-4 pt-3 border-t border-slate-200/60 flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <Users className={`w-3.5 h-3.5 ${color.light}`} />
                    <span className="text-xs font-bold text-slate-500">{count} {count === 1 ? 'employee' : 'employees'}</span>
                  </div>
                  {count > 0 && (
                    <div className="flex items-center gap-1">
                      <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                      <span className="text-[10px] font-bold text-emerald-500">Active</span>
                    </div>
                  )}
                </div>
              </div>
            )
          })}
          {sortedDepts.length === 0 && (
            <div className="col-span-full py-20 text-center">
              <Building2 className="w-10 h-10 text-slate-200 mx-auto mb-3" />
              <p className="text-slate-400 font-bold text-xs uppercase tracking-widest">No departments found</p>
            </div>
          )}
        </div>
      ) : (
        /* ── List View ── */
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-slate-400 font-bold uppercase text-[10px] tracking-widest border-b border-slate-100">
                <tr>
                  <th className="px-6 py-4 w-16">#</th>
                  <SortableHeader label="Department" sortKey="name" currentSortKey={sortKeyStr} currentSortOrder={sortOrder} onSort={handleSort} className="px-6 py-4" />
                  <th className="px-6 py-4 w-36">Employees</th>
                  <th className="px-6 py-4 w-32">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sortedDepts.map((dept, index) => {
                  const color = getColor(index)
                  const count = deptCounts[dept.name] || 0
                  const initials = getInitials(dept.name)
                  const displayName = dept.name.replace(' DEPARTMENT', '')
                  return (
                    <tr key={dept.id} className="hover:bg-red-50/50 transition-colors duration-200 group">
                      <td className="px-6 py-4 text-xs font-bold text-slate-400">{String(index + 1).padStart(2, '0')}</td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className={`w-9 h-9 ${color.icon} rounded-lg flex items-center justify-center text-white text-[10px] font-black shrink-0`}>
                            {initials}
                          </div>
                          <div>
                            <span className="font-bold text-slate-700">{displayName}</span>
                            <p className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">Department</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <Users className={`w-3.5 h-3.5 ${color.light}`} />
                          <span className="text-xs font-bold text-slate-500">{count}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex gap-1">
                          <button
                            onClick={() => { setEditingDept(dept); setEditName(dept.name); setEditError(null) }}
                            title="Edit department"
                            className="p-2.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-all active:scale-90"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => { setConfirmDeleteDept(dept); setDeleteError(null) }}
                            title="Remove department"
                            className="p-2.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all active:scale-90"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
                {sortedDepts.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-6 py-20 text-center text-slate-400 font-bold uppercase text-xs tracking-widest">
                      No departments found
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="px-6 py-4 bg-slate-50 border-t border-slate-100">
            <span className="text-xs text-slate-400 font-bold">
              Showing {sortedDepts.length} of {departments.length} department{departments.length !== 1 ? 's' : ''}
            </span>
          </div>
        </div>
      )}
    </div>
  )
}
