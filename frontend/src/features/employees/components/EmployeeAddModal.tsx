import React, { useState } from 'react';
import { Dialog, DialogContent, DialogTrigger, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Loader2, Plus, X as XIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { validateEmployeeId } from '@/lib/employeeValidation';
import { formatPhoneNumber } from '../utils/employee-types';

interface EmployeeAddModalProps {
  departments: { id: number; name: string }[];
  branches: { id: number; name: string }[];
  shifts: any[];
  onSave: (employee: any) => Promise<boolean>;
  isOpen: boolean;
  setIsOpen: (val: boolean) => void;
}

const SUFFIX_OPTIONS = ['', 'Jr.', 'Sr.', 'II', 'III', 'IV', 'V'] as const;

export function EmployeeAddModal({ departments, branches, shifts, onSave, isOpen, setIsOpen }: EmployeeAddModalProps) {
  const [newEmployee, setNewEmployee] = useState({
    employeeNumber: '', firstName: '', lastName: '', middleName: '', suffix: '',
    contactNumber: '', department: '', branch: '', email: '', hireDate: '', shiftId: '', gender: '', dateOfBirth: ''
  });
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [isRegistering, setIsRegistering] = useState(false);
  const [emailChecking, setEmailChecking] = useState(false);

  const resetForm = () => {
    setNewEmployee({
      employeeNumber: '', firstName: '', lastName: '', middleName: '', suffix: '',
      contactNumber: '', department: '', branch: '', email: '', hireDate: '', shiftId: '', gender: '', dateOfBirth: ''
    });
    setFormErrors({});
  };

  const handleSave = async () => {
    const errors: Record<string, string> = {};
    const empIdValidation = validateEmployeeId(newEmployee.employeeNumber);
    if (!empIdValidation.isValid) errors.employeeNumber = empIdValidation.error!;
    if (!newEmployee.firstName.trim()) errors.firstName = 'First name is required';
    if (!newEmployee.lastName.trim()) errors.lastName = 'Last name is required';
    if (!newEmployee.contactNumber.trim()) errors.contactNumber = 'Contact number is required';
    else if (newEmployee.contactNumber.replace(/\D/g, '').length !== 11) errors.contactNumber = 'Must be exactly 11 digits';
    if (newEmployee.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmployee.email.trim())) errors.email = 'A valid email is required';
    if (formErrors.email && formErrors.email.includes('already in use')) errors.email = formErrors.email;
    if (!newEmployee.department) errors.department = 'Department is required';
    if (!newEmployee.branch) errors.branch = 'Branch is required';
    
    if (Object.keys(errors).length > 0) { setFormErrors(errors); return; }
    
    setIsRegistering(true);
    const success = await onSave({ ...newEmployee, shiftId: newEmployee.shiftId ? parseInt(newEmployee.shiftId) : undefined });
    if (success) {
      setIsOpen(false);
      resetForm();
    }
    setIsRegistering(false);
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { setIsOpen(open); if (!open) resetForm(); }}>
      <DialogTrigger asChild>
        <Button className="flex-1 sm:flex-none bg-primary hover:bg-primary/90 gap-2"><Plus className="w-4 h-4" /> Add Employee</Button>
      </DialogTrigger>
      <DialogContent showCloseButton={false} className="bg-white border-0 max-w-lg p-0 rounded-2xl overflow-hidden shadow-xl">
        <div className="bg-red-600 px-6 py-4 flex items-center justify-between shrink-0">
          <div>
            <DialogTitle className="text-white font-bold text-lg">New Employee Registration</DialogTitle>
            <DialogDescription className="text-white/80 text-[10px] uppercase tracking-widest font-bold mt-1">Add to directory</DialogDescription>
          </div>
          <button onClick={() => setIsOpen(false)} className="text-white/80 hover:text-white transition-colors">
            <XIcon className="w-5 h-5" />
          </button>
        </div>
        <div className="px-6 py-5 space-y-4 max-h-[70vh] overflow-y-auto">
          <div><label className="text-slate-400 text-[10px] uppercase font-bold">Employee ID *</label><input placeholder="e.g. 10001" className={`mt-1 w-full px-3 py-2 rounded-lg border ${formErrors.employeeNumber ? 'border-red-400' : 'border-slate-200'} text-sm outline-none`} value={newEmployee.employeeNumber} onChange={e => { setNewEmployee(p => ({ ...p, employeeNumber: e.target.value })); setFormErrors(p => ({ ...p, employeeNumber: '' })) }} />{formErrors.employeeNumber && <p className="text-[11px] text-red-500">{formErrors.employeeNumber}</p>}</div>
          <div className="grid grid-cols-2 gap-4">
            <div><label className="text-slate-400 text-[10px] uppercase font-bold">First Name *</label><input placeholder="First Name" className={`mt-1 w-full px-3 py-2 rounded-lg border ${formErrors.firstName ? 'border-red-400' : 'border-slate-200'} text-sm outline-none`} value={newEmployee.firstName} onChange={e => { setNewEmployee(p => ({ ...p, firstName: e.target.value })); setFormErrors(p => ({ ...p, firstName: '' })) }} />{formErrors.firstName && <p className="text-[11px] text-red-500">{formErrors.firstName}</p>}</div>
            <div><label className="text-slate-400 text-[10px] uppercase font-bold">Last Name *</label><input placeholder="Last Name" className={`mt-1 w-full px-3 py-2 rounded-lg border ${formErrors.lastName ? 'border-red-400' : 'border-slate-200'} text-sm outline-none`} value={newEmployee.lastName} onChange={e => { setNewEmployee(p => ({ ...p, lastName: e.target.value })); setFormErrors(p => ({ ...p, lastName: '' })) }} />{formErrors.lastName && <p className="text-[11px] text-red-500">{formErrors.lastName}</p>}</div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div><label className="text-slate-400 text-[10px] uppercase font-bold">Middle Name</label><input placeholder="Middle Name (optional)" className="mt-1 w-full px-3 py-2 rounded-lg border border-slate-200 text-sm outline-none" value={newEmployee.middleName} onChange={e => setNewEmployee(p => ({ ...p, middleName: e.target.value }))} /></div>
            <div><label className="text-slate-400 text-[10px] uppercase font-bold">Suffix</label><select className="mt-1 w-full px-3 py-2 rounded-lg border border-slate-200 text-sm outline-none" value={newEmployee.suffix} onChange={e => setNewEmployee(p => ({ ...p, suffix: e.target.value }))}><option value="">None</option>{SUFFIX_OPTIONS.filter(Boolean).map(s => <option key={s} value={s}>{s}</option>)}</select></div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-slate-400 text-[10px] uppercase font-bold">Gender</label>
              <select className="mt-1 w-full px-3 py-2 rounded-lg border border-slate-200 text-sm outline-none" value={newEmployee.gender} onChange={e => setNewEmployee(p => ({ ...p, gender: e.target.value }))}>
                <option value="">Select Gender</option>
                <option value="Male">Male</option>
                <option value="Female">Female</option>
                <option value="Prefer not to say">Prefer not to say</option>
              </select>
            </div>
            <div><label className="text-slate-400 text-[10px] uppercase font-bold">Date of Birth</label><input type="date" className="mt-1 w-full px-3 py-2 rounded-lg border border-slate-200 text-sm outline-none" value={newEmployee.dateOfBirth} onChange={e => setNewEmployee(p => ({ ...p, dateOfBirth: e.target.value }))} /></div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div><label className="text-slate-400 text-[10px] uppercase font-bold">Email Address *</label><input type="email" placeholder="Email" className={`mt-1 w-full px-3 py-2 rounded-lg border ${formErrors.email ? 'border-red-400' : 'border-slate-200'} text-sm outline-none`} value={newEmployee.email} onChange={e => { setNewEmployee(p => ({ ...p, email: e.target.value })); setFormErrors(p => ({ ...p, email: '' })) }} onBlur={async () => { const email = newEmployee.email.trim(); if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return; setEmailChecking(true); try { const res = await fetch(`/api/employees/check-email?email=${encodeURIComponent(email)}`); const data = await res.json(); if (data.success && !data.available) setFormErrors(p => ({ ...p, email: '⚠️ Email already in use.' })) } finally { setEmailChecking(false) } }} />{formErrors.email && <p className="text-[11px] text-red-500">{formErrors.email}</p>}</div>
            <div><label className="text-slate-400 text-[10px] uppercase font-bold">Contact Number *</label><input type="tel" placeholder="Contact" maxLength={13} className={`mt-1 w-full px-3 py-2 rounded-lg border ${formErrors.contactNumber ? 'border-red-400' : 'border-slate-200'} text-sm outline-none`} value={newEmployee.contactNumber} onChange={e => { setNewEmployee(p => ({ ...p, contactNumber: formatPhoneNumber(e.target.value) })); setFormErrors(p => ({ ...p, contactNumber: '' })) }} />{formErrors.contactNumber && <p className="text-[11px] text-red-500">{formErrors.contactNumber}</p>}</div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div><label className="text-slate-400 text-[10px] uppercase font-bold">Department *</label><select className={`mt-1 w-full px-3 py-2 rounded-lg border ${formErrors.department ? 'border-red-400' : 'border-slate-200'} text-sm outline-none`} value={newEmployee.department} onChange={e => { setNewEmployee(p => ({ ...p, department: e.target.value })); setFormErrors(p => ({ ...p, department: '' })) }}><option value="">Select Dept</option>{departments.map(d => <option key={d.id} value={d.name}>{d.name}</option>)}</select>{formErrors.department && <p className="text-[11px] text-red-500">{formErrors.department}</p>}</div>
            <div><label className="text-slate-400 text-[10px] uppercase font-bold">Branch *</label><select className={`mt-1 w-full px-3 py-2 rounded-lg border ${formErrors.branch ? 'border-red-400' : 'border-slate-200'} text-sm outline-none`} value={newEmployee.branch} onChange={e => { setNewEmployee(p => ({ ...p, branch: e.target.value })); setFormErrors(p => ({ ...p, branch: '' })) }}><option value="">Select Branch</option>{branches.map(b => <option key={b.id} value={b.name}>{b.name}</option>)}</select>{formErrors.branch && <p className="text-[11px] text-red-500">{formErrors.branch}</p>}</div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div><label className="text-slate-400 text-[10px] uppercase font-bold">Date Hired</label><input type="date" className="mt-1 w-full px-3 py-2 rounded-lg border border-slate-200 text-sm outline-none" value={newEmployee.hireDate} onChange={e => setNewEmployee(p => ({ ...p, hireDate: e.target.value }))} /></div>
            <div><label className="text-slate-400 text-[10px] uppercase font-bold">Work Shift</label><select className="mt-1 w-full px-3 py-2 rounded-lg border border-slate-200 text-sm outline-none" value={newEmployee.shiftId} onChange={e => setNewEmployee(p => ({ ...p, shiftId: e.target.value }))}><option value="">No shift assigned</option>{shifts.map(s => <option key={s.id} value={s.id}>[{s.shiftCode}] {s.name}</option>)}</select></div>
          </div>
        </div>
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-100">
          <Button variant="ghost" onClick={() => setIsOpen(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={isRegistering || emailChecking} className="bg-red-600 hover:bg-red-700">
            {isRegistering ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Saving</> : 'Register'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
