'use client'

import React from "react"
import { useState, useEffect } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogTrigger } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { Search, Plus, Edit2, ChevronLeft, ChevronRight, Upload, AlertTriangle, AlertCircle, X as XIcon } from 'lucide-react'
import { DEPARTMENTS } from '@/types/departments'
import type { Branch } from '@/types/branches'

type Employee = {
  id: number
  zkId: number | null
  employeeNumber: string | null
  firstName: string
  lastName: string
  email: string | null
  role: string
  department: string | null
  position: string | null
  branch: string | null
  contactNumber: string | null
  hireDate: string | null
  employmentStatus: 'ACTIVE' | 'INACTIVE' | 'TERMINATED'
  createdAt: string
}

export default function EmployeesPage() {
  const [employees, setEmployees] = useState<Employee[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedDept, setSelectedDept] = useState<string>('all')
  const [selectedBranch, setSelectedBranch] = useState<string>('all')
  const [isAddOpen, setIsAddOpen] = useState(false)
  const [isImportOpen, setIsImportOpen] = useState(false)
  const [importFile, setImportFile] = useState<File | null>(null)
  const [isImporting, setIsImporting] = useState(false)

  // Edit employee
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null)
  const [editForm, setEditForm] = useState<Partial<Employee>>({})

  // Confirm move-to-inactive dialog
  const [confirmDeactivate, setConfirmDeactivate] = useState<Employee | null>(null)
  const [isDeactivating, setIsDeactivating] = useState(false)

  const [newEmployee, setNewEmployee] = useState({
    firstName: '',
    lastName: '',
    contactNumber: '',
    department: '',
    branch: '',
    email: '',
    hireDate: '',
  })

  const [currentPage, setCurrentPage] = useState(1)
  const rowsPerPage = 10

  const departments = [...DEPARTMENTS]
  const [branches, setBranches] = useState<Branch[]>([])

  const fetchBranches = async () => {
    try {
      const token = localStorage.getItem('token')
      const res = await fetch('/api/branches', {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      const data = await res.json()
      if (data.success) setBranches(data.branches)
    } catch (error) {
      console.error('Error fetching branches:', error)
    }
  }

  const fetchEmployees = async () => {
    setLoading(true)
    try {
      const token = localStorage.getItem('token')
      const res = await fetch('/api/employees', {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      if (res.status === 401) {
        localStorage.removeItem('token')
        window.location.href = '/login'
        return
      }
      const data = await res.json()
      if (data.success) {
        // Active employees page only shows ACTIVE
        setEmployees(data.employees.filter((e: Employee) => e.employmentStatus === 'ACTIVE'))
      }
    } catch (error) {
      console.error('Error fetching employees:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchEmployees()
    fetchBranches()
  }, [])

  const filteredEmployees = employees.filter(emp => {
    const fullName = `${emp.firstName} ${emp.lastName}`.toLowerCase()
    const matchesSearch = fullName.includes(searchTerm.toLowerCase()) ||
      (emp.contactNumber || '').toLowerCase().includes(searchTerm.toLowerCase())
    const matchesDept = selectedDept === 'all' || emp.department === selectedDept
    const matchesBranch = selectedBranch === 'all' || emp.branch === selectedBranch
    return matchesSearch && matchesDept && matchesBranch
  })

  const totalPages = Math.ceil(filteredEmployees.length / rowsPerPage)
  const paginatedEmployees = filteredEmployees.slice(
    (currentPage - 1) * rowsPerPage,
    currentPage * rowsPerPage
  )

  const handleAddEmployee = async () => {
    if (newEmployee.firstName && newEmployee.lastName && newEmployee.department && newEmployee.branch) {
      try {
        const token = localStorage.getItem('token')
        const res = await fetch('/api/employees', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({
            firstName: newEmployee.firstName,
            lastName: newEmployee.lastName,
            contactNumber: newEmployee.contactNumber || undefined,
            department: newEmployee.department,
            branch: newEmployee.branch,
            email: newEmployee.email || undefined,
            hireDate: newEmployee.hireDate || undefined,
          })
        })
        const data = await res.json()
        if (data.success) {
          await fetchEmployees()
          setNewEmployee({ firstName: '', lastName: '', contactNumber: '', department: '', branch: '', email: '', hireDate: '' })
          setIsAddOpen(false)
        } else {
          alert('Failed to add employee: ' + (data.message || 'Unknown error'))
        }
      } catch (error) {
        console.error('Error adding employee:', error)
        alert('Failed to add employee')
      }
    }
  }

  const handleMoveToInactive = async () => {
    if (!confirmDeactivate) return
    setIsDeactivating(true)
    try {
      const token = localStorage.getItem('token')
      const res = await fetch(`/api/employees/${confirmDeactivate.id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      })
      const data = await res.json()
      if (data.success) {
        await fetchEmployees()
        setConfirmDeactivate(null)
      } else {
        alert('Failed to deactivate employee: ' + (data.message || 'Unknown error'))
      }
    } catch (error) {
      console.error('Error deactivating employee:', error)
      alert('Failed to deactivate employee')
    } finally {
      setIsDeactivating(false)
    }
  }

  const handleEdit = (employee: Employee) => {
    setEditingEmployee(employee)
    setEditForm({ ...employee })
  }

  const handleUpdateEmployee = async () => {
    if (!editingEmployee || !editForm) return
    try {
      const token = localStorage.getItem('token')
      const res = await fetch(`/api/employees/${editingEmployee.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(editForm)
      })
      const data = await res.json()
      if (data.success) {
        await fetchEmployees()
        setEditingEmployee(null)
      } else {
        alert('Failed to update employee: ' + (data.message || 'Unknown error'))
      }
    } catch (error) {
      console.error('Error updating employee:', error)
      alert('Failed to update employee')
    }
  }

  return (
    <div className="space-y-6">
      {/* Edit Employee Modal */}
      {editingEmployee && (
        <div className="fixed inset-0 bg-slate-950/40 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-5 bg-red-600 text-white flex justify-between items-center shrink-0">
              <div>
                <h3 className="font-bold text-lg leading-tight tracking-tight">Edit Employee Profile</h3>
                <p className="text-[10px] text-red-100 opacity-90 uppercase font-black tracking-widest mt-0.5">Update employee info</p>
              </div>
              <button onClick={() => setEditingEmployee(null)} className="text-white/80 hover:text-white transition-colors">
                <XIcon className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4 overflow-y-auto">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[9px] font-black uppercase text-slate-400 tracking-wider">First Name</label>
                  <input type="text" value={editForm.firstName || ''} onChange={(e) => setEditForm({ ...editForm, firstName: e.target.value })} className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 outline-none focus:ring-2 focus:ring-red-500/20" />
                </div>
                <div className="space-y-1">
                  <label className="text-[9px] font-black uppercase text-slate-400 tracking-wider">Last Name</label>
                  <input type="text" value={editForm.lastName || ''} onChange={(e) => setEditForm({ ...editForm, lastName: e.target.value })} className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 outline-none focus:ring-2 focus:ring-red-500/20" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[9px] font-black uppercase text-slate-400 tracking-wider">Email Address</label>
                  <input type="email" value={editForm.email || ''} onChange={(e) => setEditForm({ ...editForm, email: e.target.value })} className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 outline-none focus:ring-2 focus:ring-red-500/20" />
                </div>
                <div className="space-y-1">
                  <label className="text-[9px] font-black uppercase text-slate-400 tracking-wider">Contact Number</label>
                  <input type="tel" value={editForm.contactNumber || ''} onChange={(e) => setEditForm({ ...editForm, contactNumber: e.target.value })} className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 outline-none focus:ring-2 focus:ring-red-500/20" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[9px] font-black uppercase text-slate-400 tracking-wider">Department</label>
                  <select value={editForm.department || ''} onChange={(e) => setEditForm({ ...editForm, department: e.target.value })} className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 outline-none focus:ring-2 focus:ring-red-500/20">
                    <option value="" disabled>Select Department</option>
                    {departments.map(d => (<option key={d} value={d}>{d}</option>))}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-[9px] font-black uppercase text-slate-400 tracking-wider">Branch</label>
                  <select value={editForm.branch || ''} onChange={(e) => setEditForm({ ...editForm, branch: e.target.value })} className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 outline-none focus:ring-2 focus:ring-red-500/20">
                    <option value="" disabled>Select Branch</option>
                    {branches.map(b => (<option key={b.id} value={b.name}>{b.name}</option>))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[9px] font-black uppercase text-slate-400 tracking-wider">Date Hired</label>
                  <input type="date" value={editForm.hireDate || ''} onChange={(e) => setEditForm({ ...editForm, hireDate: e.target.value })} className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 outline-none focus:ring-2 focus:ring-red-500/20" />
                </div>
                <div className="space-y-3 px-6">
                  <label className="text-[9px] font-black uppercase text-slate-400 tracking-wider">Status</label>
                  <div className="flex items-center gap-6 px-1 py-1">
                    <label className="flex items-center gap-2 cursor-pointer group">
                      <div className="relative flex items-center justify-center">
                        <input type="radio" name="status" value="ACTIVE" checked={editForm.employmentStatus === 'ACTIVE'} onChange={(e) => setEditForm({ ...editForm, employmentStatus: e.target.value as Employee['employmentStatus'] })} className="peer appearance-none w-4 h-4 border-2 border-slate-300 rounded-full checked:border-red-600 transition-all cursor-pointer" />
                        <div className="absolute w-2 h-2 bg-red-600 rounded-full opacity-0 peer-checked:opacity-100 transition-opacity pointer-events-none" />
                      </div>
                      <span className="text-xs font-bold text-slate-600 group-hover:text-slate-900 transition-colors">Active</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer group">
                      <div className="relative flex items-center justify-center">
                        <input type="radio" name="status" value="INACTIVE" checked={editForm.employmentStatus === 'INACTIVE'} onChange={(e) => setEditForm({ ...editForm, employmentStatus: e.target.value as Employee['employmentStatus'] })} className="peer appearance-none w-4 h-4 border-2 border-slate-300 rounded-full checked:border-red-600 transition-all cursor-pointer" />
                        <div className="absolute w-2 h-2 bg-red-600 rounded-full opacity-0 peer-checked:opacity-100 transition-opacity pointer-events-none" />
                      </div>
                      <span className="text-xs font-bold text-slate-600 group-hover:text-slate-900 transition-colors">Inactive</span>
                    </label>
                  </div>
                </div>
              </div>

              <div className="bg-amber-50 border border-amber-100 p-3 rounded-xl flex gap-3 shadow-sm shadow-amber-600/5">
                <AlertCircle size={18} className="text-amber-600 shrink-0" />
                <div className="text-[10px] text-amber-800 leading-relaxed font-medium">
                  <strong className="block mb-0.5 tracking-tight uppercase">Audit Log Notice</strong>
                  <strong>Warning:</strong> These changes will be logged under your account for audit purposes.
                </div>
              </div>
            </div>

            <div className="p-5 bg-slate-50 flex gap-3 shrink-0">
              <button onClick={() => setEditingEmployee(null)} className="flex-1 px-4 py-3.5 text-sm font-bold text-slate-500 hover:text-slate-800 transition-colors">Cancel</button>
              <button onClick={handleUpdateEmployee} className="flex-1 px-4 py-3.5 bg-red-600 text-white rounded-xl text-sm font-black shadow-lg shadow-red-600/30 hover:bg-red-700 transition-all active:scale-95">Update</button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm Move-to-Inactive Dialog */}
      {confirmDeactivate && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/40 backdrop-blur-sm">
          <div className="bg-card border border-border rounded-2xl shadow-2xl p-6 max-w-sm w-full mx-4">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-amber-500/20 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5 text-amber-400" />
              </div>
              <div>
                <h3 className="font-semibold text-foreground">Move to Inactive?</h3>
                <p className="text-sm text-muted-foreground">This action can be undone from the Inactive list.</p>
              </div>
            </div>
            <p className="text-sm text-foreground mb-6">
              <span className="font-medium">{confirmDeactivate.firstName} {confirmDeactivate.lastName}</span> will be moved to the Inactive employee list and removed from the active roster.
            </p>
            <div className="flex gap-3">
              <Button
                variant="outline"
                className="flex-1 border-border text-foreground hover:bg-secondary"
                onClick={() => setConfirmDeactivate(null)}
                disabled={isDeactivating}
              >
                Cancel
              </Button>
              <Button
                className="flex-1 bg-amber-500 hover:bg-amber-600 text-white"
                onClick={handleMoveToInactive}
                disabled={isDeactivating}
              >
                {isDeactivating ? 'Moving...' : 'Move to Inactive'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
        <div>
          <h2 className="text-2xl sm:text-3xl font-bold text-foreground">Active Employees</h2>
          <p className="text-muted-foreground text-sm mt-1">Manage your active workforce and employee records</p>
        </div>
        <div className="flex gap-2 w-full sm:w-auto">
          {/* Import Excel Button */}
          <Dialog open={isImportOpen} onOpenChange={(open) => { setIsImportOpen(open); if (!open) { setImportFile(null); } }}>
            <DialogTrigger asChild>
              <Button variant="outline" className="flex-1 sm:flex-none border-border text-foreground hover:bg-secondary gap-2">
                <Upload className="w-4 h-4" />
                <span className="hidden xs:inline">Import</span> Excel
              </Button>
            </DialogTrigger>
            <DialogContent showCloseButton={false} className="bg-white border-0 max-w-md p-0 rounded-2xl overflow-hidden shadow-xl">
              <div className="bg-red-600 px-6 py-4 flex items-center justify-between">
                <div>
                  <DialogTitle className="text-white font-bold text-lg">Import Employees</DialogTitle>
                  <DialogDescription className="text-white/80 text-[10px] uppercase tracking-widest font-bold mt-1">Upload from Excel or CSV</DialogDescription>
                </div>
                <button onClick={() => { setIsImportOpen(false); setImportFile(null); }} className="text-white/80 hover:text-white transition-colors">
                  <XIcon className="w-5 h-5" />
                </button>
              </div>
              <div className="px-6 py-5 space-y-4">
                <p className="text-sm text-slate-500 font-medium">
                  Upload an Excel file (.xlsx, .xls) or CSV (.csv) to bulk import employee records.
                </p>
                <div className="border-2 border-dashed border-slate-200 rounded-xl p-6 text-center hover:border-red-300 transition-colors">
                  <Upload className="w-8 h-8 mx-auto text-slate-300 mb-2" />
                  <label htmlFor="excel-upload" className="cursor-pointer">
                    <span className="text-sm text-red-500 font-bold hover:underline">Click to select file</span>
                    <input
                      id="excel-upload"
                      type="file"
                      accept=".xlsx,.xls,.csv"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0]
                        if (file) setImportFile(file)
                      }}
                    />
                  </label>
                  <p className="text-xs text-slate-400 mt-1">Supports .xlsx, .xls, .csv</p>
                </div>
                {importFile && (
                  <div className="flex items-center gap-2 p-3 bg-slate-50 rounded-xl">
                    <Upload className="w-4 h-4 text-red-500" />
                    <span className="text-sm text-slate-700 font-medium flex-1 truncate">{importFile.name}</span>
                    <span className="text-xs text-slate-400">{(importFile.size / 1024).toFixed(1)} KB</span>
                  </div>
                )}
              </div>
              <div className="flex items-center justify-center gap-6 px-6 py-4 border-t border-slate-100">
                <button
                  className="text-sm font-bold text-slate-400 hover:text-slate-600 transition-colors"
                  onClick={() => { setIsImportOpen(false); setImportFile(null); }}
                >
                  Discard
                </button>
                <button
                  className="px-8 py-2.5 bg-red-600 hover:bg-red-700 text-white text-sm font-bold rounded-xl transition-colors disabled:opacity-50"
                  disabled={!importFile || isImporting}
                  onClick={() => {
                    setIsImporting(true)
                    setTimeout(() => {
                      setIsImporting(false)
                      setIsImportOpen(false)
                      setImportFile(null)
                    }, 1500)
                  }}
                >
                  {isImporting ? 'Importing...' : 'Upload & Import'}
                </button>
              </div>
            </DialogContent>
          </Dialog>

          {/* Add Employee Button */}
          <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
            <DialogTrigger asChild>
              <Button className="flex-1 sm:flex-none bg-primary hover:bg-primary/90 gap-2">
                <Plus className="w-4 h-4" />
                Add Employee
              </Button>
            </DialogTrigger>
            <DialogContent showCloseButton={false} className="bg-white border-0 max-w-lg p-0 rounded-2xl overflow-hidden shadow-xl">
              <div className="bg-red-600 px-6 py-4 flex items-center justify-between">
                <div>
                  <DialogTitle className="text-white font-bold text-lg">New Employee Registration</DialogTitle>
                  <DialogDescription className="text-white/80 text-[10px] uppercase tracking-widest font-bold mt-1">Add to employee directory</DialogDescription>
                </div>
                <button onClick={() => setIsAddOpen(false)} className="text-white/80 hover:text-white transition-colors">
                  <XIcon className="w-5 h-5" />
                </button>
              </div>
              <div className="px-6 py-5 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-slate-400 text-[10px] uppercase tracking-widest font-bold">First Name *</label>
                    <input
                      placeholder="First Name"
                      className="mt-1.5 w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-white text-sm font-medium text-slate-700 placeholder:text-slate-300 focus:ring-2 focus:ring-red-500/20 outline-none transition-all"
                      value={newEmployee.firstName}
                      onChange={(e) => setNewEmployee({ ...newEmployee, firstName: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="text-slate-400 text-[10px] uppercase tracking-widest font-bold">Last Name *</label>
                    <input
                      placeholder="Last Name"
                      className="mt-1.5 w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-white text-sm font-medium text-slate-700 placeholder:text-slate-300 focus:ring-2 focus:ring-red-500/20 outline-none transition-all"
                      value={newEmployee.lastName}
                      onChange={(e) => setNewEmployee({ ...newEmployee, lastName: e.target.value })}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-slate-400 text-[10px] uppercase tracking-widest font-bold">Email Address</label>
                    <input
                      type="email"
                      placeholder="Email Address"
                      className="mt-1.5 w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-white text-sm font-medium text-slate-700 placeholder:text-slate-300 focus:ring-2 focus:ring-red-500/20 outline-none transition-all"
                      value={newEmployee.email}
                      onChange={(e) => setNewEmployee({ ...newEmployee, email: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="text-slate-400 text-[10px] uppercase tracking-widest font-bold">Contact Number</label>
                    <input
                      type="tel"
                      placeholder="+63-912-345-6780"
                      className="mt-1.5 w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-white text-sm font-medium text-slate-700 placeholder:text-slate-300 focus:ring-2 focus:ring-red-500/20 outline-none transition-all"
                      value={newEmployee.contactNumber}
                      onChange={(e) => setNewEmployee({ ...newEmployee, contactNumber: e.target.value })}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-slate-400 text-[10px] uppercase tracking-widest font-bold">Department</label>
                    <select
                      className="mt-1.5 w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-white text-sm font-medium text-slate-700 focus:ring-2 focus:ring-red-500/20 outline-none cursor-pointer transition-all appearance-none"
                      value={newEmployee.department}
                      onChange={(e) => setNewEmployee({ ...newEmployee, department: e.target.value })}
                    >
                      <option value="" disabled>e.g. Human Resources</option>
                      {departments.map(dept => (
                        <option key={dept} value={dept}>{dept}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-slate-400 text-[10px] uppercase tracking-widest font-bold">Branch</label>
                    <select
                      className="mt-1.5 w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-white text-sm font-medium text-slate-700 focus:ring-2 focus:ring-red-500/20 outline-none cursor-pointer transition-all appearance-none"
                      value={newEmployee.branch}
                      onChange={(e) => setNewEmployee({ ...newEmployee, branch: e.target.value })}
                    >
                      <option value="" disabled>e.g. Cebu City</option>
                      {branches.map(branch => (
                        <option key={branch.id} value={branch.name}>{branch.name}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-slate-400 text-[10px] uppercase tracking-widest font-bold">Date Hired</label>
                    <input
                      type="date"
                      className="mt-1.5 w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-white text-sm font-medium text-slate-700 focus:ring-2 focus:ring-red-500/20 outline-none transition-all"
                      value={newEmployee.hireDate}
                      onChange={(e) => setNewEmployee({ ...newEmployee, hireDate: e.target.value })}
                    />
                  </div>
                </div>
              </div>
              <div className="flex items-center justify-center gap-6 px-6 py-4 border-t border-slate-100">
                <button
                  className="text-sm font-bold text-slate-400 hover:text-slate-600 transition-colors"
                  onClick={() => {
                  setNewEmployee({ firstName: '', lastName: '', contactNumber: '', department: '', branch: '', email: '', hireDate: '' })
                    setIsAddOpen(false)
                  }}
                >
                  Discard
                </button>
                <button onClick={handleAddEmployee} className="px-8 py-2.5 bg-red-600 hover:bg-red-700 text-white text-sm font-bold rounded-xl transition-colors">
                  Register Employee
                </button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Filters */}
      <Card className="bg-card border-border p-4">
        <div className="flex flex-col sm:flex-row gap-3 sm:gap-4">
          <div className="flex-1 min-w-0">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search by name or contact..."
                className="pl-10 bg-secondary border-border text-foreground placeholder:text-muted-foreground"
                value={searchTerm}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>
          <div className="flex gap-3 w-full sm:w-auto">
            <Select value={selectedDept} onValueChange={setSelectedDept}>
              <SelectTrigger className="flex-1 sm:w-48 bg-secondary border-border text-foreground">
                <SelectValue placeholder="Department" />
              </SelectTrigger>
              <SelectContent className="bg-secondary border-border">
                <SelectItem value="all">All Departments</SelectItem>
                {departments.map(dept => (
                  <SelectItem key={dept} value={dept}>{dept}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={selectedBranch} onValueChange={setSelectedBranch}>
              <SelectTrigger className="flex-1 sm:w-48 bg-secondary border-border text-foreground">
                <SelectValue placeholder="Branch" />
              </SelectTrigger>
              <SelectContent className="bg-secondary border-border">
                <SelectItem value="all">All Branches</SelectItem>
                {branches.map(branch => (
                  <SelectItem key={branch.id} value={branch.name}>{branch.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </Card>

      {/* Employees Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-slate-400 font-bold uppercase text-[10px] tracking-widest border-b border-slate-100">
            <tr>
              <th className="px-6 py-4 w-16">#</th>
              <th className="px-6 py-4">Employee</th>
              <th className="px-6 py-4">Department</th>
              <th className="px-6 py-4">Branch</th>
              <th className="px-6 py-4">Contact</th>
              <th className="px-6 py-4">Joined</th>
              <th className="px-6 py-4">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr>
                <td colSpan={7} className="px-6 py-12 text-center text-slate-400 font-bold text-xs">
                  Loading employees...
                </td>
              </tr>
            ) : paginatedEmployees.length > 0 ? (
              paginatedEmployees.map((employee, index) => (
                <tr key={employee.id} className="hover:bg-red-50/50 transition-colors duration-200 group">
                  <td className="px-6 py-4 text-xs font-bold text-slate-400">
                    {String((currentPage - 1) * rowsPerPage + index + 1).padStart(2, '0')}
                  </td>
                  <td className="px-6 py-4">
                    <p className="font-bold text-slate-700">{employee.firstName} {employee.lastName}</p>
                    <p className="text-xs text-slate-400">{employee.email || '—'}</p>
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-xs font-medium text-slate-500">{employee.department || '—'}</span>
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-xs font-medium text-slate-500">{employee.branch || '—'}</span>
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-xs font-medium text-slate-500">{employee.contactNumber || '—'}</span>
                  </td>
                  <td className="px-6 py-4">
                    <span className="text-xs font-medium text-slate-500">
                      {employee.hireDate ? new Date(employee.hireDate).toLocaleDateString('en-CA') : '—'}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <button
                      onClick={() => handleEdit(employee)}
                      className="p-2.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all active:scale-90"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={7} className="px-6 py-20 text-center text-slate-400 font-bold uppercase text-xs tracking-widest">
                  No matching employees found
                </td>
              </tr>
            )}
          </tbody>
        </table>

        {/* Pagination */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
          <span className="text-xs text-slate-400 font-bold">
            Showing {paginatedEmployees.length} of {filteredEmployees.length} employees · Page {currentPage} of {totalPages || 1}
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
              disabled={currentPage === 1}
              className="px-3 py-1.5 rounded-lg text-xs font-bold text-slate-500 hover:bg-white hover:border-slate-200 border border-transparent transition-colors disabled:opacity-30"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => i + 1).map(page => (
              <button
                key={page}
                onClick={() => setCurrentPage(page)}
                className={`h-8 w-8 rounded-lg text-xs font-bold transition-colors ${
                  currentPage === page
                    ? 'bg-red-600 text-white'
                    : 'text-slate-500 hover:bg-white hover:border-slate-200 border border-transparent'
                }`}
              >
                {page}
              </button>
            ))}
            <button
              onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
              disabled={currentPage === totalPages || totalPages === 0}
              className="px-3 py-1.5 rounded-lg text-xs font-bold text-slate-500 hover:bg-white hover:border-slate-200 border border-transparent transition-colors disabled:opacity-30"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
