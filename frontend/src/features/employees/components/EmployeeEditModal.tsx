'use client'

import React from 'react'
import { X as XIcon, AlertCircle } from 'lucide-react'
import { Employee, SUFFIX_OPTIONS, formatPhoneNumber, formatTime } from '../utils/employee-types'
import type { Department, Branch } from '@/lib/api'
import type { ShiftOption } from '../utils/employee-types'

interface EmployeeEditModalProps {
  employee: Employee
  editForm: Partial<Employee>
  departments: Department[]
  branches: Branch[]
  shifts: ShiftOption[]
  onFormChange: (form: Partial<Employee>) => void
  onSave: () => void
  onClose: () => void
  onEmailBlur: () => void
}

export function EmployeeEditModal({
  employee, editForm, departments, branches, shifts,
  onFormChange, onSave, onClose, onEmailBlur
}: EmployeeEditModalProps) {
  return (
    <div className="fixed inset-0 bg-slate-950/40 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
        <div className="p-5 bg-red-600 text-white flex justify-between items-center shrink-0">
          <div>
            <h3 className="font-bold text-lg leading-tight tracking-tight">Edit Employee Profile</h3>
            <p className="text-[10px] text-red-100 opacity-90 uppercase font-black tracking-widest mt-0.5">Update employee info</p>
          </div>
          <button onClick={onClose} className="text-white/80 hover:text-white transition-colors">
            <XIcon className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4 overflow-y-auto">
          <div className="space-y-1">
            <label className="text-[9px] font-black uppercase text-slate-400 tracking-wider">Employee ID *</label>
            <input type="text" placeholder="e.g. 10001" value={editForm.employeeNumber || ''} onChange={(e) => onFormChange({ ...editForm, employeeNumber: e.target.value })} className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 outline-none focus:ring-2 focus:ring-red-500/20" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-[9px] font-black uppercase text-slate-400 tracking-wider">First Name</label>
              <input type="text" value={editForm.firstName || ''} onChange={(e) => onFormChange({ ...editForm, firstName: e.target.value })} className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 outline-none focus:ring-2 focus:ring-red-500/20" />
            </div>
            <div className="space-y-1">
              <label className="text-[9px] font-black uppercase text-slate-400 tracking-wider">Last Name</label>
              <input type="text" value={editForm.lastName || ''} onChange={(e) => onFormChange({ ...editForm, lastName: e.target.value })} className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 outline-none focus:ring-2 focus:ring-red-500/20" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-[9px] font-black uppercase text-slate-400 tracking-wider">Middle Name</label>
              <input type="text" placeholder="Optional" value={(editForm as any).middleName || ''} onChange={(e) => onFormChange({ ...editForm, middleName: e.target.value } as any)} className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 outline-none focus:ring-2 focus:ring-red-500/20" />
            </div>
            <div className="space-y-1">
              <label className="text-[9px] font-black uppercase text-slate-400 tracking-wider">Suffix</label>
              <select value={(editForm as any).suffix || ''} onChange={(e) => onFormChange({ ...editForm, suffix: e.target.value } as any)} className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 outline-none focus:ring-2 focus:ring-red-500/20">
                <option value="">None</option>
                {SUFFIX_OPTIONS.filter(Boolean).map(s => (<option key={s} value={s}>{s}</option>))}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-[9px] font-black uppercase text-slate-400 tracking-wider">Gender</label>
              <select value={(editForm as any).gender || ''} onChange={(e) => onFormChange({ ...editForm, gender: e.target.value } as any)} className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 outline-none focus:ring-2 focus:ring-red-500/20">
                <option value="">Select Gender</option>
                <option value="Male">Male</option>
                <option value="Female">Female</option>
                <option value="Prefer not to say">Prefer not to say</option>
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-[9px] font-black uppercase text-slate-400 tracking-wider">Date of Birth</label>
              <input type="date" value={(editForm as any).dateOfBirth ? (editForm as any).dateOfBirth.split('T')[0] : ''} onChange={(e) => onFormChange({ ...editForm, dateOfBirth: e.target.value } as any)} className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 outline-none focus:ring-2 focus:ring-red-500/20" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-[9px] font-black uppercase text-slate-400 tracking-wider">Email Address</label>
              <input type="email" value={editForm.email || ''} onChange={(e) => onFormChange({ ...editForm, email: e.target.value })} onBlur={onEmailBlur} className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 outline-none focus:ring-2 focus:ring-red-500/20" />
            </div>
            <div className="space-y-1">
              <label className="text-[9px] font-black uppercase text-slate-400 tracking-wider">Contact Number</label>
              <input type="tel" maxLength={13} value={editForm.contactNumber || ''} onChange={(e) => {
                const val = formatPhoneNumber(e.target.value)
                onFormChange({ ...editForm, contactNumber: val })
              }} className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 outline-none focus:ring-2 focus:ring-red-500/20" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-[9px] font-black uppercase text-slate-400 tracking-wider">Department</label>
              <select value={editForm.department || ''} onChange={(e) => onFormChange({ ...editForm, department: e.target.value })} className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 outline-none focus:ring-2 focus:ring-red-500/20">
                <option value="" disabled>Select Department</option>
                {departments.map(d => (<option key={d.id} value={d.name}>{d.name}</option>))}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-[9px] font-black uppercase text-slate-400 tracking-wider">Branch</label>
              <select value={editForm.branch || ''} onChange={(e) => onFormChange({ ...editForm, branch: e.target.value })} className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 outline-none focus:ring-2 focus:ring-red-500/20">
                <option value="" disabled>Select Branch</option>
                {branches.map(b => (<option key={b.id} value={b.name}>{b.name}</option>))}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-[9px] font-black uppercase text-slate-400 tracking-wider">Date Hired</label>
              <input type="date" value={editForm.hireDate || ''} onChange={(e) => onFormChange({ ...editForm, hireDate: e.target.value })} className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 outline-none focus:ring-2 focus:ring-red-500/20" />
            </div>
            <div className="space-y-3 px-6">
              <label className="text-[9px] font-black uppercase text-slate-400 tracking-wider">Status</label>
              <div className="flex items-center gap-6 px-1 py-1">
                <label className="flex items-center gap-2 cursor-pointer group">
                  <div className="relative flex items-center justify-center">
                    <input type="radio" name="status" value="ACTIVE" checked={editForm.employmentStatus === 'ACTIVE'} onChange={(e) => onFormChange({ ...editForm, employmentStatus: e.target.value as Employee['employmentStatus'] })} className="peer appearance-none w-4 h-4 border-2 border-slate-300 rounded-full checked:border-red-600 transition-all cursor-pointer" />
                    <div className="absolute w-2 h-2 bg-red-600 rounded-full opacity-0 peer-checked:opacity-100 transition-opacity pointer-events-none" />
                  </div>
                  <span className="text-xs font-bold text-slate-600 group-hover:text-slate-900 transition-colors">Active</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer group">
                  <div className="relative flex items-center justify-center">
                    <input type="radio" name="status" value="INACTIVE" checked={editForm.employmentStatus === 'INACTIVE'} onChange={(e) => onFormChange({ ...editForm, employmentStatus: e.target.value as Employee['employmentStatus'] })} className="peer appearance-none w-4 h-4 border-2 border-slate-300 rounded-full checked:border-red-600 transition-all cursor-pointer" />
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
              className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 outline-none focus:ring-2 focus:ring-red-500/20"
            >
              <option value="">No shift assigned</option>
              {shifts.map(s => (
                <option key={s.id} value={s.id}>[{s.shiftCode}] {s.name} ({formatTime(s.startTime)} – {formatTime(s.endTime)})</option>
              ))}
            </select>
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
          <button onClick={onClose} className="flex-1 px-4 py-3.5 text-sm font-bold text-slate-500 hover:text-slate-800 transition-colors">Cancel</button>
          <button onClick={onSave} className="flex-1 px-4 py-3.5 bg-red-600 text-white rounded-xl text-sm font-black shadow-lg shadow-red-600/30 hover:bg-red-700 transition-all active:scale-95">Update</button>
        </div>
      </div>
    </div>
  )
}
