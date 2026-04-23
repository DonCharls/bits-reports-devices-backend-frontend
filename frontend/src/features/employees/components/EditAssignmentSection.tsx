import React from 'react'
import { Employee, formatTime } from '../utils/employee-types'
import type { Department, Branch } from '@/lib/api'
import type { ShiftOption } from '../utils/employee-types'
import { EditFormErrors } from '../hooks/useEmployeeEditForm'

interface EditAssignmentSectionProps {
  editForm: Partial<Employee>
  formErrors: EditFormErrors
  departments: Department[]
  branches: Branch[]
  shifts: ShiftOption[]
  onFormChange: (form: Partial<Employee>) => void
  onClearError: (field: string) => void
}

const inputBase = 'w-full p-2.5 bg-slate-50 border rounded-xl text-xs font-bold text-slate-700 outline-none focus:ring-2 focus:ring-red-500/20 transition-all'
const inputError = 'border-red-500 ring-1 ring-red-500'
const inputNormal = 'border-slate-200'

export function EditAssignmentSection({
  editForm, formErrors, departments, branches, shifts, onFormChange, onClearError,
}: EditAssignmentSectionProps) {
  return (
    <>
      {/* Department / Branch */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <label className="text-[9px] font-black uppercase text-slate-400 tracking-wider">Department *</label>
          <select
            value={editForm.departmentId ?? ''}
            onChange={(e) => {
              onFormChange({ ...editForm, departmentId: e.target.value ? parseInt(e.target.value) : null })
              if (formErrors.departmentId) onClearError('departmentId')
            }}
            className={`${inputBase} ${formErrors.departmentId ? inputError : inputNormal}`}
          >
            <option value="" disabled>Select Department</option>
            {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
          {formErrors.departmentId && <p className="text-[10px] text-red-500 font-bold ml-1">{formErrors.departmentId}</p>}
        </div>
        <div className="space-y-1">
          <label className="text-[9px] font-black uppercase text-slate-400 tracking-wider">Branch *</label>
          <select
            value={editForm.branchId ?? ''}
            onChange={(e) => {
              onFormChange({ ...editForm, branchId: e.target.value ? parseInt(e.target.value) : null })
              if (formErrors.branchId) onClearError('branchId')
            }}
            className={`${inputBase} ${formErrors.branchId ? inputError : inputNormal}`}
          >
            <option value="" disabled>Select Branch</option>
            {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
          {formErrors.branchId && <p className="text-[10px] text-red-500 font-bold ml-1">{formErrors.branchId}</p>}
        </div>
      </div>

      {/* Date Hired / Status */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <label className="text-[9px] font-black uppercase text-slate-400 tracking-wider">Date Hired</label>
          <input
            type="date"
            value={editForm.hireDate || ''}
            onChange={(e) => {
              onFormChange({ ...editForm, hireDate: e.target.value })
              if (formErrors.hireDate) onClearError('hireDate')
            }}
            className={`${inputBase} ${formErrors.hireDate ? inputError : inputNormal}`}
          />
          {formErrors.hireDate && <p className="text-[10px] text-red-500 font-bold ml-1">{formErrors.hireDate}</p>}
        </div>
        <div className="space-y-3 px-6">
          <label className="text-[9px] font-black uppercase text-slate-400 tracking-wider">Status</label>
          <div className="flex items-center gap-6 px-1 py-1">
            <label className="flex items-center gap-2 cursor-pointer group">
              <div className="relative flex items-center justify-center">
                <input
                  type="radio"
                  name="status"
                  value="ACTIVE"
                  checked={editForm.employmentStatus === 'ACTIVE'}
                  onChange={(e) => onFormChange({ ...editForm, employmentStatus: e.target.value as Employee['employmentStatus'] })}
                  className="peer appearance-none w-4 h-4 border-2 border-slate-300 rounded-full checked:border-red-600 transition-all cursor-pointer"
                />
                <div className="absolute w-2 h-2 bg-red-600 rounded-full opacity-0 peer-checked:opacity-100 transition-opacity pointer-events-none" />
              </div>
              <span className="text-xs font-bold text-slate-600 group-hover:text-slate-900 transition-colors">Active</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer group">
              <div className="relative flex items-center justify-center">
                <input
                  type="radio"
                  name="status"
                  value="INACTIVE"
                  checked={editForm.employmentStatus === 'INACTIVE'}
                  onChange={(e) => onFormChange({ ...editForm, employmentStatus: e.target.value as Employee['employmentStatus'] })}
                  className="peer appearance-none w-4 h-4 border-2 border-slate-300 rounded-full checked:border-red-600 transition-all cursor-pointer"
                />
                <div className="absolute w-2 h-2 bg-red-600 rounded-full opacity-0 peer-checked:opacity-100 transition-opacity pointer-events-none" />
              </div>
              <span className="text-xs font-bold text-slate-600 group-hover:text-slate-900 transition-colors">Inactive</span>
            </label>
          </div>
        </div>
      </div>

      {/* Work Shift */}
      <div className="space-y-1">
        <label className="text-[9px] font-black uppercase text-slate-400 tracking-wider">Work Shift</label>
        <select
          value={(editForm as any).shiftId || ''}
          onChange={(e) => onFormChange({ ...editForm, shiftId: e.target.value ? parseInt(e.target.value) : null } as any)}
          className={`${inputBase} ${inputNormal}`}
        >
          <option value="">No shift assigned</option>
          {shifts.map(s => (
            <option key={s.id} value={s.id}>
              [{s.shiftCode}] {s.name} ({formatTime(s.startTime)} – {formatTime(s.endTime)})
            </option>
          ))}
        </select>
      </div>
    </>
  )
}
