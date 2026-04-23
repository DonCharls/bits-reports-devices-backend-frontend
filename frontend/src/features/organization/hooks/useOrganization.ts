'use client'

import { useState, useEffect } from 'react'
import { useToast } from '@/hooks/useToast'
import type { Department, Branch } from '../types'

export function useOrganization() {
  const [departments, setDepartments] = useState<Department[]>([])
  const [branches, setBranches] = useState<Branch[]>([])
  const [deptCounts, setDeptCounts] = useState<Record<string, number>>({})
  const [branchCounts, setBranchCounts] = useState<Record<string, number>>({})
  const [allEmployees, setAllEmployees] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [apiError, setApiError] = useState<string | null>(null)
  const { toasts, showToast, dismissToast } = useToast()

  const [searchTerm, setSearchTerm] = useState('')
  const [branchFilter, setBranchFilter] = useState('all')
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')

  const [currentPage, setCurrentPage] = useState(1)
  const rowsPerPage = 10

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

  // Edit branch dialog
  const [editingBranch, setEditingBranch] = useState<Branch | null>(null)
  const [editBranchName, setEditBranchName] = useState('')
  const [editBranchLoading, setEditBranchLoading] = useState(false)
  const [editBranchError, setEditBranchError] = useState<string | null>(null)

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
            e.employmentStatus === 'ACTIVE'
          )
          setAllEmployees(activeEmps)

          const dCounts: Record<string, number> = {}
          const bCounts: Record<string, number> = {}
          activeEmps.forEach((e: any) => {
            if (e.Department?.name) dCounts[e.Department.name] = (dCounts[e.Department.name] || 0) + 1
            if (e.Branch?.name) bCounts[e.Branch.name] = (bCounts[e.Branch.name] || 0) + 1
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
      return allEmployees.some(e => e.Department?.name === d.name && e.Branch?.name === branchFilter)
    }
    return true
  })

  // Reset page when filters change
  useEffect(() => { setCurrentPage(1) }, [searchTerm, branchFilter])

  const totalEmployees = allEmployees.length

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
      showToast('success', addType === 'department' ? 'Department Created' : 'Branch Created', `${trimmed} has been added successfully`)
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
      // Keep allEmployees in sync so filteredDepts / branch-filter stay accurate
      setAllEmployees(prev =>
        prev.map(e =>
          e.departmentId === editingDept.id
            ? { ...e, Department: { name: data.department.name } }
            : e
        )
      )
      setEditingDept(null)
      showToast('success', 'Department Renamed', `Department renamed to ${data.department.name}`)
    } catch {
      setEditError('Network error. Please try again.')
    } finally {
      setEditLoading(false)
    }
  }

  // ── Rename branch ──
  const handleEditBranchSave = async () => {
    if (!editingBranch || !editBranchName.trim()) return
    setEditBranchLoading(true)
    setEditBranchError(null)
    try {
      const res = await fetch(`/api/branches/${editingBranch.id}`, {
        method: 'PUT',
        headers: authHeaders(),
        credentials: 'include',
        body: JSON.stringify({ name: editBranchName.trim() }),
      })
      const data = await res.json()
      if (!data.success) {
        setEditBranchError(data.message || 'Failed to rename')
        return
      }
      setBranches(prev =>
        prev.map(b => b.id === editingBranch.id ? data.branch : b)
          .sort((a, b) => a.name.localeCompare(b.name))
      )
      // Update counts key if name changed
      if (branchCounts[editingBranch.name]) {
        setBranchCounts(prev => {
          const next = { ...prev }
          next[data.branch.name] = next[editingBranch.name] || 0
          delete next[editingBranch.name]
          return next
        })
      }
      // Keep allEmployees in sync so branch-filter stays accurate after rename
      setAllEmployees(prev =>
        prev.map(e =>
          e.branchId === editingBranch.id
            ? { ...e, Branch: { name: data.branch.name } }
            : e
        )
      )
      setEditingBranch(null)
      showToast('success', 'Branch Renamed', `Branch renamed to ${data.branch.name}`)
    } catch {
      setEditBranchError('Network error. Please try again.')
    } finally {
      setEditBranchLoading(false)
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
      showToast('success', 'Department Removed', `${confirmDeleteDept.name} has been removed`)
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
      showToast('success', 'Branch Removed', `${confirmDeleteBranch.name} has been removed`)
    } catch {
      setDeleteError('Network error. Please try again.')
    } finally {
      setDeleteLoading(false)
    }
  }

  return {
    // Data
    departments, branches, deptCounts, branchCounts, allEmployees,
    loading, apiError, totalEmployees, filteredDepts,
    // Pagination
    currentPage, setCurrentPage, rowsPerPage,
    // Search & Filter
    searchTerm, setSearchTerm, branchFilter, setBranchFilter,
    viewMode, setViewMode,
    // Add
    isAddOpen, setIsAddOpen, addType, setAddType,
    newName, setNewName, addLoading, addError, setAddError, handleAdd,
    // Edit Department
    editingDept, setEditingDept, editName, setEditName,
    editLoading, editError, setEditError, handleEditSave,
    // Edit Branch
    editingBranch, setEditingBranch, editBranchName, setEditBranchName,
    editBranchLoading, editBranchError, setEditBranchError, handleEditBranchSave,
    // Delete
    confirmDeleteDept, setConfirmDeleteDept,
    confirmDeleteBranch, setConfirmDeleteBranch,
    deleteLoading, deleteError, setDeleteError,
    handleDeleteDept, handleDeleteBranch,
    // Toast
    toasts, showToast, dismissToast,
  }
}
