'use client'

import React from 'react'
import { Edit2, Fingerprint, CreditCard, Key, ChevronLeft, ChevronRight } from 'lucide-react'
import { SortableHeader } from '@/components/ui/SortableHeader'
import { Employee, formatFullName, formatPhoneNumber, formatTime } from '../utils/employee-types'

interface EmployeeTableProps {
  employees: Employee[]
  loading: boolean
  filteredCount: number
  currentPage: number
  totalPages: number
  sortKey: string | null
  sortOrder: 'asc' | 'desc' | null
  onSort: (key: keyof Employee) => void
  onPageChange: (page: number) => void
  onEdit: (employee: Employee) => void
  onResetPassword: (employee: Employee) => void
  onFingerprintOpen: (employeeId: number, name: string) => void
  onCardEnrollOpen: (employeeId: number, name: string, currentCard: number | null) => void
  enrollStatus: Record<number, 'idle' | 'loading' | 'success' | 'error'>
  dragScrollRef: React.RefObject<HTMLDivElement | null>
}

export function EmployeeTable({
  employees, loading, filteredCount, currentPage, totalPages,
  sortKey, sortOrder, onSort, onPageChange,
  onEdit, onResetPassword, onFingerprintOpen, onCardEnrollOpen,
  enrollStatus, dragScrollRef
}: EmployeeTableProps) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <div ref={dragScrollRef} className="overflow-x-auto scrollbar-hide">
        <table className="w-full text-left text-sm min-w-[900px]">
          <thead className="bg-slate-50 text-slate-400 font-bold uppercase text-[10px] tracking-widest border-b border-slate-100">
            <tr>
              <SortableHeader label="ZK ID" sortKey="zkId" currentSortKey={sortKey} currentSortOrder={sortOrder} onSort={onSort} className="px-4 py-4 w-20" />
              <SortableHeader label="Employee" sortKey="firstName" currentSortKey={sortKey} currentSortOrder={sortOrder} onSort={onSort} className="px-6 py-4" />
              <SortableHeader label="Employee ID" sortKey="employeeNumber" currentSortKey={sortKey} currentSortOrder={sortOrder} onSort={onSort} className="px-4 py-4" />
              <th className="px-4 py-4">Badge</th>
              <th className="px-4 py-4">Enrolled On</th>
              <SortableHeader label="Department" sortKey="department" currentSortKey={sortKey} currentSortOrder={sortOrder} onSort={onSort} className="px-6 py-4" />
              <th className="px-6 py-4">Shift</th>
              <SortableHeader label="Branch" sortKey="branch" currentSortKey={sortKey} currentSortOrder={sortOrder} onSort={onSort} className="px-6 py-4" />
              <SortableHeader label="Contact" sortKey="contactNumber" currentSortKey={sortKey} currentSortOrder={sortOrder} onSort={onSort} className="px-6 py-4" />
              <SortableHeader label="Joined" sortKey="hireDate" currentSortKey={sortKey} currentSortOrder={sortOrder} onSort={onSort} className="px-6 py-4" />
              <th className="px-6 py-4">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr><td colSpan={11} className="px-6 py-12 text-center text-slate-400 font-bold text-xs">Loading employees...</td></tr>
            ) : employees.length > 0 ? (
              employees.map((employee) => (
                <tr key={employee.id} className="hover:bg-red-50/50 transition-colors duration-200 group">
                  <td className="px-4 py-3 text-xs text-muted-foreground font-mono">{employee.zkId ?? '—'}</td>
                  <td className="px-6 py-4">
                    <p className="font-bold text-slate-700">{formatFullName(employee.firstName, employee.middleName, employee.lastName, employee.suffix)}</p>
                    <p className="text-xs text-slate-400">{employee.email || '—'}</p>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground font-mono">{employee.employeeNumber ?? '—'}</td>
                  <td className="px-4 py-3">
                    {employee.cardNumber ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-blue-600 border border-blue-100">
                        <CreditCard className="w-3 h-3" />{employee.cardNumber}
                      </span>
                    ) : (<span className="text-[10px] text-muted-foreground italic">—</span>)}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {employee.EmployeeDeviceEnrollment && employee.EmployeeDeviceEnrollment.length > 0 ? (
                        employee.EmployeeDeviceEnrollment.map(enrollment => (
                          <span key={enrollment.device.id} title={`Enrolled on ${new Date(enrollment.enrolledAt).toLocaleDateString()}`}
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide ${enrollment.device.isActive ? 'bg-green-100 text-green-700 border border-green-200' : 'bg-gray-100 text-gray-500 border border-gray-200'}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${enrollment.device.isActive ? 'bg-green-500' : 'bg-gray-400'}`} />
                            {enrollment.device.name}
                          </span>
                        ))
                      ) : (<span className="text-[10px] text-muted-foreground italic">Not enrolled</span>)}
                    </div>
                  </td>
                  <td className="px-6 py-4 max-w-[120px]">
                    <span className="text-xs font-medium text-slate-500 block truncate" title={employee.Department?.name || employee.department || undefined}>
                      {employee.Department?.name || employee.department || '—'}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    {employee.Shift ? (
                      <div>
                        <p className="text-xs font-bold text-slate-700 leading-tight">{employee.Shift.name}</p>
                        <p className="text-[10px] font-medium text-slate-400 mt-0.5">{formatTime(employee.Shift.startTime)} – {formatTime(employee.Shift.endTime)}</p>
                      </div>
                    ) : (<span className="text-[10px] text-slate-300 font-bold">Unassigned</span>)}
                  </td>
                  <td className="px-6 py-4"><span className="text-xs font-medium text-slate-500">{employee.branch || '—'}</span></td>
                  <td className="px-6 py-4"><span className="text-xs font-medium text-slate-500">{employee.contactNumber ? formatPhoneNumber(employee.contactNumber) : '—'}</span></td>
                  <td className="px-6 py-4"><span className="text-xs font-medium text-slate-500">{employee.hireDate ? new Date(employee.hireDate).toLocaleDateString('en-CA') : '—'}</span></td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-1">
                      <button onClick={() => onEdit(employee)} className="p-2.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all active:scale-90" title="Edit employee">
                        <Edit2 className="w-4 h-4" />
                      </button>
                      {(() => {
                        const status = enrollStatus[employee.id] || 'idle'
                        if (status === 'loading') {
                          return (<button disabled className="p-2.5 rounded-xl bg-blue-50 text-blue-400 cursor-wait" title="Enrolling..."><Fingerprint className="w-4 h-4 animate-pulse" /></button>)
                        }
                        return (
                          <button onClick={() => { onFingerprintOpen(employee.id, `${employee.firstName} ${employee.lastName}`) }}
                            className="p-2.5 text-slate-400 hover:text-red-600 hover:bg-red-100 rounded-xl transition-all active:scale-90" title="Manage Fingerprints">
                            <Fingerprint className="w-4 h-4" />
                          </button>
                        )
                      })()}
                      <button onClick={() => { onCardEnrollOpen(employee.id, `${employee.firstName} ${employee.lastName}`, employee.cardNumber || null) }}
                        className={`p-2.5 rounded-xl transition-all active:scale-90 ${employee.cardNumber ? 'text-blue-500 hover:text-blue-700 hover:bg-blue-50' : 'text-slate-400 hover:text-red-600 hover:bg-red-50'}`}
                        title={employee.cardNumber ? `Badge #${employee.cardNumber}` : 'Enroll RFID Badge'}>
                        <CreditCard className="w-4 h-4" />
                      </button>
                      <button onClick={() => onResetPassword(employee)} className="p-2.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all active:scale-90" title="Reset Password">
                        <Key className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            ) : (
              <tr><td colSpan={11} className="px-6 py-20 text-center text-slate-400 font-bold uppercase text-xs tracking-widest">No matching employees found</td></tr>
            )}
          </tbody>
        </table>
      </div>
      {/* Pagination */}
      <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
        <span className="text-xs text-slate-400 font-bold">
          Showing {employees.length} of {filteredCount} employees · Page {currentPage} of {totalPages || 1}
        </span>
        <div className="flex items-center gap-1">
          <button onClick={() => onPageChange(Math.max(currentPage - 1, 1))} disabled={currentPage === 1}
            className="px-3 py-1.5 rounded-lg text-xs font-bold text-slate-500 hover:bg-white hover:border-slate-200 border border-transparent transition-colors disabled:opacity-30">
            <ChevronLeft className="w-4 h-4" />
          </button>
          {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => i + 1).map(page => (
            <button key={page} onClick={() => onPageChange(page)}
              className={`h-8 w-8 rounded-lg text-xs font-bold transition-colors ${currentPage === page ? 'bg-red-600 text-white' : 'text-slate-500 hover:bg-white hover:border-slate-200 border border-transparent'}`}>
              {page}
            </button>
          ))}
          <button onClick={() => onPageChange(Math.min(currentPage + 1, totalPages))} disabled={currentPage === totalPages || totalPages === 0}
            className="px-3 py-1.5 rounded-lg text-xs font-bold text-slate-500 hover:bg-white hover:border-slate-200 border border-transparent transition-colors disabled:opacity-30">
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  )
}
