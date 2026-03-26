'use client'

import { useState, useEffect } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Search, Trash2, RotateCcw, ChevronLeft, ChevronRight, AlertTriangle, UserX } from 'lucide-react'
import { useTableSort } from '@/hooks/useTableSort'
import { SortableHeader } from '@/components/ui/SortableHeader'

type Employee = {
  id: number
  firstName: string
  lastName: string
  email: string | null
  department: string | null
  position: string | null
  branch: string | null
  contactNumber: string | null
  hireDate: string | null
  employmentStatus: 'ACTIVE' | 'INACTIVE' | 'TERMINATED'
  createdAt: string
}

export default function InactiveEmployeesPage() {
  const [employees, setEmployees] = useState<Employee[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const rowsPerPage = 10

  // Confirm restore dialog
  const [confirmRestore, setConfirmRestore] = useState<Employee | null>(null)
  const [isRestoring, setIsRestoring] = useState(false)

  // Confirm permanent delete dialog
  const [confirmDelete, setConfirmDelete] = useState<Employee | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  const fetchInactiveEmployees = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/employees')
      if (res.status === 401) {
        window.location.href = '/login'
        return
      }
      const data = await res.json()
      if (data.success) {
        setEmployees(data.employees.filter((e: Employee) => e.employmentStatus === 'INACTIVE'))
      }
    } catch (error) {
      console.error('Error fetching employees:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchInactiveEmployees()
  }, [])

  const filteredEmployees = employees.filter(emp => {
    const fullName = `${emp.firstName} ${emp.lastName}`.toLowerCase()
    return fullName.includes(searchTerm.toLowerCase()) ||
      (emp.contactNumber || '').toLowerCase().includes(searchTerm.toLowerCase())
  })

  const { sortedData: paginatedSource, sortKey, sortOrder, handleSort } = useTableSort<Employee>({
    initialData: filteredEmployees
  })

  const totalPages = Math.ceil(paginatedSource.length / rowsPerPage)
  const paginatedEmployees = paginatedSource.slice(
    (currentPage - 1) * rowsPerPage,
    currentPage * rowsPerPage
  )

  const handleRestore = async () => {
    if (!confirmRestore) return
    setIsRestoring(true)
    try {
      const res = await fetch(`/api/employees/${confirmRestore.id}/reactivate`, {
        method: 'PATCH',
      })
      const data = await res.json()
      if (data.success) {
        await fetchInactiveEmployees()
        setConfirmRestore(null)
      } else {
        alert('Failed to restore employee: ' + (data.message || 'Unknown error'))
      }
    } catch (error) {
      console.error('Error restoring employee:', error)
      alert('Failed to restore employee')
    } finally {
      setIsRestoring(false)
    }
  }

  const handlePermanentDelete = async () => {
    if (!confirmDelete) return
    setIsDeleting(true)
    try {
      const res = await fetch(`/api/employees/${confirmDelete.id}/permanent`, {
        method: 'DELETE',
      })
      const data = await res.json()
      if (data.success) {
        await fetchInactiveEmployees()
        setConfirmDelete(null)
      } else {
        alert('Failed to delete employee: ' + (data.message || 'Unknown error'))
      }
    } catch (error) {
      console.error('Error deleting employee:', error)
      alert('Failed to delete employee')
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <div className="space-y-6">

      {/* Confirm Restore Dialog */}
      {confirmRestore && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/40 backdrop-blur-sm">
          <div className="bg-card border border-border rounded-2xl shadow-2xl p-6 max-w-sm w-full mx-4">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-green-500/20 flex items-center justify-center shrink-0">
                <RotateCcw className="w-5 h-5 text-green-400" />
              </div>
              <div>
                <h3 className="font-semibold text-foreground">Restore Employee?</h3>
                <p className="text-sm text-muted-foreground">They will be moved back to the active roster.</p>
              </div>
            </div>
            <p className="text-sm text-foreground mb-6">
              <span className="font-medium">{confirmRestore.firstName} {confirmRestore.lastName}</span> will be marked as Active again.
            </p>
            <div className="flex gap-3">
              <Button variant="outline" className="flex-1 border-border text-foreground hover:bg-secondary" onClick={() => setConfirmRestore(null)} disabled={isRestoring}>
                Cancel
              </Button>
              <Button className="flex-1 bg-green-600 hover:bg-green-700 text-white" onClick={handleRestore} disabled={isRestoring}>
                {isRestoring ? 'Restoring...' : 'Restore'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm Permanent Delete Dialog */}
      {confirmDelete && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/40 backdrop-blur-sm">
          <div className="bg-card border border-border rounded-2xl shadow-2xl p-6 max-w-sm w-full mx-4">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-red-500/20 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5 text-red-400" />
              </div>
              <div>
                <h3 className="font-semibold text-foreground">Permanently Delete?</h3>
                <p className="text-sm text-muted-foreground">This action cannot be undone.</p>
              </div>
            </div>
            <p className="text-sm text-foreground mb-6">
              This will permanently delete <span className="font-medium">{confirmDelete.firstName} {confirmDelete.lastName}</span> and all their associated data. This cannot be undone.
            </p>
            <div className="flex gap-3">
              <Button variant="outline" className="flex-1 border-border text-foreground hover:bg-secondary" onClick={() => setConfirmDelete(null)} disabled={isDeleting}>
                Cancel
              </Button>
              <Button className="flex-1 bg-red-600 hover:bg-red-700 text-white" onClick={handlePermanentDelete} disabled={isDeleting}>
                {isDeleting ? 'Deleting...' : 'Delete Permanently'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gray-500/20 flex items-center justify-center">
              <UserX className="w-5 h-5 text-gray-400" />
            </div>
            <div>
              <h2 className="text-2xl sm:text-3xl font-bold text-foreground">Inactive Employees</h2>
              <p className="text-muted-foreground text-sm mt-0.5">Employees moved out of the active roster</p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 text-sm">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>Permanent deletion cannot be undone</span>
        </div>
      </div>

      {/* Search */}
      <Card className="bg-card border-border p-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search inactive employees by name or contact..."
            className="pl-10 bg-secondary border-border text-foreground placeholder:text-muted-foreground"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </Card>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-400 font-bold uppercase text-[10px] tracking-widest border-b border-slate-100 sticky top-0 z-10">
              <tr>
                <th className="px-6 py-4 w-16">#</th>
                <SortableHeader label="Name" sortKey="firstName" currentSortKey={sortKey} currentSortOrder={sortOrder} onSort={handleSort} className="px-6 py-4" />
                <SortableHeader label="Contact" sortKey="contactNumber" currentSortKey={sortKey} currentSortOrder={sortOrder} onSort={handleSort} className="px-6 py-4" />
                <SortableHeader label="Department" sortKey="department" currentSortKey={sortKey} currentSortOrder={sortOrder} onSort={handleSort} className="px-6 py-4" />
                <SortableHeader label="Branch" sortKey="branch" currentSortKey={sortKey} currentSortOrder={sortOrder} onSort={handleSort} className="px-6 py-4" />
                <th className="px-6 py-4">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-muted-foreground">Loading...</td>
                </tr>
              ) : paginatedEmployees.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-20 text-center text-slate-400 font-bold uppercase text-xs tracking-widest">
                    No inactive employees found
                  </td>
                </tr>
              ) : (
                paginatedEmployees.map((employee, index) => {
                  const fullName = `${employee.firstName} ${employee.lastName}`
                  return (
                    <tr
                      key={employee.id}
                      className="hover:bg-red-50/50 transition-colors duration-200 group"
                    >
                      <td className="px-6 py-4 text-xs font-bold text-slate-400">
                        {String((currentPage - 1) * rowsPerPage + index + 1).padStart(2, '0')}
                      </td>
                      <td className="px-6 py-4">
                        <p className="font-bold text-slate-700">{fullName}</p>
                        <Badge className="bg-gray-500/20 text-gray-400 border-gray-500/30 text-xs mt-1">Inactive</Badge>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-xs font-medium text-slate-500">{employee.contactNumber || '—'}</span>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-xs font-medium text-slate-500">{employee.department || '—'}</span>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-xs font-medium text-slate-500">{employee.branch || '—'}</span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex gap-1">
                          <button
                            onClick={() => setConfirmRestore(employee)}
                            title="Restore to Active"
                            className="p-2.5 text-slate-400 hover:text-green-600 hover:bg-green-50 rounded-xl transition-all active:scale-90"
                          >
                            <RotateCcw className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => setConfirmDelete(employee)}
                            title="Delete Permanently"
                            className="p-2.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all active:scale-90"
                          >
                            <UserX className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
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
