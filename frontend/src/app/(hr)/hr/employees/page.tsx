"use client"

import React, { useState, useEffect, Suspense, useMemo, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { Edit2, UserPlus, Search, Download, ChevronLeft, ChevronRight, Loader2, X, Fingerprint, CheckCircle2, WifiOff, Timer, AlertCircle, Key } from 'lucide-react';
import { useHorizontalDragScroll } from '@/hooks/useHorizontalDragScroll';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import * as XLSX from 'xlsx';
import { validateEmployeeId } from '@/lib/employeeValidation';
import { useTableSort } from '@/hooks/useTableSort';
import { SortableHeader } from '@/components/ui/SortableHeader';

type Toast = {
  id: number;
  type: 'success' | 'warning' | 'error';
  title: string;
  message: string;
};

interface Employee {
  id?: number;
  firstName: string;
  lastName: string;
  middleName?: string | null;
  suffix?: string | null;
  dept: string;
  branch: string;
  email: string;
  phone: string;
  hireDate: string;
  status: string;
  gender?: string | null;
  dateOfBirth?: string | null;
  employeeNumber?: string;
  zkId?: number | null;
  Shift?: { id: number; name: string; startTime: string; endTime: string } | null;
  EmployeeDeviceEnrollment?: {
    enrolledAt: string;
    device: {
      id: number;
      name: string;
      location: string | null;
      isActive: boolean;
    };
  }[];
}

const SUFFIX_OPTIONS = ['', 'Jr.', 'Sr.', 'II', 'III', 'IV', 'V'] as const;

function formatFullName(firstName: string, middleName?: string | null, lastName?: string, suffix?: string | null) {
  const mi = middleName ? ` ${middleName[0]}.` : '';
  const sfx = suffix ? ` ${suffix}` : '';
  return `${firstName}${mi} ${lastName || ''}${sfx}`.trim();
}

type ShiftOption = {
  id: number
  shiftCode: string
  name: string
  startTime: string
  endTime: string
}

function formatTime(t: string) {
  if (!t) return '';
  const [h] = t.split(':');
  const hour = parseInt(h);
  const suffix = hour >= 12 ? 'PM' : 'AM';
  const display = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  return `${display}:${t.split(':')[1]} ${suffix}`;
}

function formatPhoneNumber(value: string | null) {
  if (!value) return '';
  const digits = value.replace(/\D/g, '').slice(0, 11);
  if (digits.length <= 4) return digits;
  if (digits.length <= 7) return `${digits.slice(0, 4)} ${digits.slice(4)}`;
  return `${digits.slice(0, 4)} ${digits.slice(4, 7)} ${digits.slice(7)}`;
}

function EmployeeDirectoryContent() {
  const searchParams = useSearchParams();
  const statusFilter = searchParams.get('status') || "Active";

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [departments, setDepartments] = useState<string[]>([]);
  const [branches, setBranches] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  const [searchQuery, setSearchQuery] = useState("");
  const [deptFilter, setDeptFilter] = useState("All Departments");
  const [branchFilter, setBranchFilter] = useState("All Branches");
  const [editingEmployee, setEditingEmployee] = useState<any>(null);
  const [initialEmployeeData, setInitialEmployeeData] = useState<string>("");
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [isRegistering, setIsRegistering] = useState(false);
  const [showInactiveConfirm, setShowInactiveConfirm] = useState(false);

  // Confirm reset-password dialog
  const [confirmResetPassword, setConfirmResetPassword] = useState<Employee | null>(null);
  const [isResettingPassword, setIsResettingPassword] = useState(false);

  // Toast system
  const [toasts, setToasts] = useState<Toast[]>([]);
  const showToast = (type: Toast['type'], title: string, message: string) => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, type, title, message }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 5000);
  };

  // Fingerprint enrollment state
  const [enrollStatus, setEnrollStatus] = useState<Record<number, 'idle' | 'loading' | 'success' | 'error'>>({});
  const [enrollMsg, setEnrollMsg] = useState<Record<number, string>>({});

  const [scanModal, setScanModal] = useState<{ open: boolean; employeeName: string; countdown: number }>({
    open: false, employeeName: '', countdown: 60,
  });

  const [enrollConfirmModal, setEnrollConfirmModal] = useState<{
    open: boolean; employeeId: number | null; employeeName: string;
  }>({ open: false, employeeId: null, employeeName: '' });

  const [devicePickerModal, setDevicePickerModal] = useState<{
    open: boolean; employeeId: number | null; employeeName: string;
  }>({ open: false, employeeId: null, employeeName: '' });

  const [devices, setDevices] = useState<{ id: number; name: string; location: string | null; isActive: boolean }[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<number | null>(null);
  const [loadingDevices, setLoadingDevices] = useState(false);
  const dragScrollRef = useHorizontalDragScroll();
  const [shifts, setShifts] = useState<ShiftOption[]>([]);

  const fetchShifts = async () => {
    try {
      const res = await fetch('/api/shifts');
      const data = await res.json();
      if (data.success) setShifts(data.shifts.filter((s: ShiftOption) => s));
    } catch (error) {
      console.error('Error fetching shifts:', error);
    }
  };

  // Scan modal countdown
  useEffect(() => {
    if (!scanModal.open) return;
    if (scanModal.countdown <= 0) {
      setScanModal(prev => ({ ...prev, open: false }));
      return;
    }
    const timer = setTimeout(() => setScanModal(prev => ({ ...prev, countdown: prev.countdown - 1 })), 1000);
    return () => clearTimeout(timer);
  }, [scanModal.open, scanModal.countdown]);

  const fetchDevices = async () => {
    setLoadingDevices(true);
    try {
      const res = await fetch('/api/devices');
      const data = await res.json();
      if (data.success) setDevices(data.devices || data.data || []);
    } catch (error) {
      console.error('Failed to fetch devices:', error);
    } finally {
      setLoadingDevices(false);
    }
  };

  const handleEnrollFingerprint = async (employeeId: number, deviceId: number, fingerIndex: number = 5) => {
    setEnrollStatus(prev => ({ ...prev, [employeeId]: 'loading' }));
    setEnrollMsg(prev => ({ ...prev, [employeeId]: 'Connecting to device...' }));

    try {
      const res = await fetch(`/api/employees/${employeeId}/enroll-fingerprint`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fingerIndex, deviceId }),
      });
      const data = await res.json();

      if (data.success) {
        setEnrollStatus(prev => ({ ...prev, [employeeId]: 'success' }));
        setEnrollMsg(prev => ({ ...prev, [employeeId]: 'Device ready — scan finger now' }));
        const emp = employees.find(e => e.id === employeeId);
        const empName = emp ? `${emp.firstName} ${emp.lastName}` : 'Employee';
        setScanModal({ open: true, employeeName: empName, countdown: 60 });
        await fetchData();
      } else {
        setEnrollStatus(prev => ({ ...prev, [employeeId]: 'error' }));
        setEnrollMsg(prev => ({ ...prev, [employeeId]: data.message || 'Enrollment failed' }));
        showToast('error', 'Enrollment Failed', data.message || 'Could not start enrollment');
      }
    } catch (error) {
      console.error('Enrollment error:', error);
      setEnrollStatus(prev => ({ ...prev, [employeeId]: 'error' }));
      setEnrollMsg(prev => ({ ...prev, [employeeId]: 'Network error' }));
      showToast('error', 'Enrollment Failed', 'Could not reach the server');
    }
  };

  const [regForm, setRegForm] = useState({
    employeeNumber: "", firstName: "", lastName: "", middleName: "", suffix: "", email: "", phone: "", dept: "", branch: "", hireDate: "", shiftId: "", gender: "", dateOfBirth: ""
  });
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [emailChecking, setEmailChecking] = useState(false);

  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [empRes, deptRes, branchRes] = await Promise.all([
        fetch('/api/employees'),
        fetch('/api/departments'),
        fetch('/api/branches')
      ]);

      const [empData, deptData, branchData] = await Promise.all([
        empRes.json(), deptRes.json(), branchRes.json()
      ]);

      if (empData.success) {
        setEmployees(empData.employees
          .filter((e: any) => e.role === 'USER')
          .map((e: any) => ({
          id: e.id,
          firstName: e.firstName,
          lastName: e.lastName,
          middleName: e.middleName || null,
          suffix: e.suffix || null,
          email: e.email || "",
          phone: e.contactNumber || "",
          dept: e.department || "",
          branch: e.branch || "",
          hireDate: e.hireDate ? e.hireDate.split('T')[0] : "",
          status: e.employmentStatus === 'ACTIVE' ? 'Active' : 'Inactive',
          gender: e.gender || null,
          dateOfBirth: e.dateOfBirth ? e.dateOfBirth.split('T')[0] : null,
          employeeNumber: e.employeeNumber,
          zkId: e.zkId ?? null,
          Shift: e.Shift ?? null,
          EmployeeDeviceEnrollment: e.EmployeeDeviceEnrollment ?? [],
        })));
      }
      if (deptData.success) setDepartments(deptData.departments.map((d: any) => d.name));
      if (branchData.success) setBranches(branchData.branches.map((b: any) => b.name));
    } catch (error) {
      console.error("Error loading directory data:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    fetchShifts();
  }, [fetchData]);

  const filteredEmployees = useMemo(() => {
    return employees
      .filter((emp) => {
        const fullName = formatFullName(emp.firstName, emp.middleName, emp.lastName, emp.suffix).toLowerCase();
        const matchesSearch = fullName.includes(searchQuery.toLowerCase());
        const matchesStatus = emp.status === statusFilter;
        const matchesDept = deptFilter === "All Departments" || emp.dept === deptFilter;
        const matchesBranch = branchFilter === "All Branches" || emp.branch === branchFilter;
        return matchesSearch && matchesStatus && matchesDept && matchesBranch;
      })
  }, [employees, searchQuery, statusFilter, deptFilter, branchFilter]);

  const { sortedData: sortedEmployees, sortKey, sortOrder, handleSort } = useTableSort<Employee>({
    initialData: filteredEmployees
  });

  const sortKeyStr = sortKey as string | null;

  const totalPages = Math.ceil(sortedEmployees.length / itemsPerPage);
  const paginatedEmployees = sortedEmployees.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, statusFilter, deptFilter, branchFilter]);

  const handleUpdate = async () => {
    if (editingEmployee.employeeNumber !== undefined) {
      const empIdValidation = validateEmployeeId(editingEmployee.employeeNumber);
      if (!empIdValidation.isValid) {
        showToast('error', 'Validation Error', empIdValidation.error!);
        return;
      }
    }
    setActionLoading(true);
    try {
      const res = await fetch(`/api/employees/${editingEmployee.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employeeNumber: editingEmployee.employeeNumber,
          firstName: editingEmployee.firstName,
          lastName: editingEmployee.lastName,
          middleName: editingEmployee.middleName || undefined,
          suffix: editingEmployee.suffix || undefined,
          email: editingEmployee.email,
          contactNumber: editingEmployee.phone,
          department: editingEmployee.dept,
          branch: editingEmployee.branch,
          hireDate: editingEmployee.hireDate,
          employmentStatus: editingEmployee.status === 'Active' ? 'ACTIVE' : 'INACTIVE',
          shiftId: editingEmployee.shiftId ? parseInt(editingEmployee.shiftId) : null,
          gender: editingEmployee.gender || undefined,
          dateOfBirth: editingEmployee.dateOfBirth || undefined,
        })
      });
      if ((await res.json()).success) {
        showToast('success', 'Profile Updated', 'Employee profile updated successfully!');
        setEditingEmployee(null);
        fetchData();
      }
    } catch (e) { console.error(e); } finally { setActionLoading(false); }
  };

  const handleResetPassword = async () => {
    if (!confirmResetPassword) return;
    setIsResettingPassword(true);
    try {
      const res = await fetch(`/api/employees/${confirmResetPassword.id}/reset-password`, {
        method: 'POST',
      });
      const data = await res.json();
      if (data.success) {
        showToast('success', 'Password Reset', data.message || 'Password has been reset successfully.');
        setConfirmResetPassword(null);
      } else {
        showToast('error', 'Reset Failed', data.message || 'Failed to reset password.');
      }
    } catch (error) {
      console.error('Error resetting password:', error);
      showToast('error', 'Reset Failed', 'Network error. Please try again.');
    } finally {
      setIsResettingPassword(false);
    }
  };

  const handleRegister = async () => {
    const errors: Record<string, string> = {};

    const empIdValidation = validateEmployeeId(regForm.employeeNumber);
    if (!empIdValidation.isValid) errors.employeeNumber = empIdValidation.error!;
    
    if (!regForm.firstName.trim()) errors.firstName = 'First name is required';
    if (!regForm.lastName.trim()) errors.lastName = 'Last name is required';
    if (!regForm.phone.trim()) errors.phone = 'Contact number is required';
    else if (regForm.phone.replace(/\D/g, '').length !== 11) errors.phone = 'Must be exactly 11 digits';
    if (regForm.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(regForm.email.trim())) errors.email = 'Enter a valid email address';
    if (formErrors.email && formErrors.email.includes('already in use')) errors.email = formErrors.email;
    if (!regForm.dept) errors.dept = 'Department is required';
    if (!regForm.branch) errors.branch = 'Branch is required';
    if (Object.keys(errors).length > 0) { setFormErrors(errors); return; }
    setFormErrors({});
    setActionLoading(true);
    try {
      const res = await fetch('/api/employees', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          employeeNumber: regForm.employeeNumber,
          firstName: regForm.firstName,
          lastName: regForm.lastName,
          middleName: regForm.middleName || undefined,
          suffix: regForm.suffix || undefined,
          email: regForm.email || undefined,
          contactNumber: regForm.phone || undefined,
          department: regForm.dept,
          branch: regForm.branch,
          hireDate: regForm.hireDate || undefined,
          shiftId: regForm.shiftId ? parseInt(regForm.shiftId) : undefined,
          gender: regForm.gender || undefined,
          dateOfBirth: regForm.dateOfBirth || undefined,
        })
      });
      const data = await res.json();
      if (data.success) {
        const name = `${data.employee?.firstName || ''} ${data.employee?.lastName || ''}`.trim();
        if (data.deviceSync?.success === false) {
          showToast('warning', 'Registered — Device Offline',
            `${name} was saved but couldn't sync to the device. Use the 🔵 fingerprint button when the device is back online.`);
        } else {
          showToast('success', 'Employee Registered',
            `${name} has been saved. Device sync is running in the background — click the 🔵 fingerprint button on their row when ready to scan.`);
        }
        setIsRegistering(false);
        setRegForm({ employeeNumber: "", firstName: "", lastName: "", middleName: "", suffix: "", email: "", phone: "", dept: "", branch: "", hireDate: "", shiftId: "", gender: "", dateOfBirth: "" });
        setFormErrors({});
        fetchData();
      } else {
        showToast('error', 'Registration Failed', data.message || 'Unknown error');
      }
    } catch (error) {
      showToast('error', 'Registration Failed', 'Could not reach the server. Please try again.');
    } finally {
      setActionLoading(false);
    }
  };

  const confirmCancel = () => {
    setEditingEmployee(null);
    setShowCancelModal(false);
  };

  const handleEditClick = (emp: any) => {
    const clone = JSON.parse(JSON.stringify(emp));
    clone.shiftId = emp.Shift?.id ? String(emp.Shift.id) : '';
    setEditingEmployee(clone);
    setInitialEmployeeData(JSON.stringify(clone));
  };

  const handleCancelClick = () => {
    if (JSON.stringify(editingEmployee) === initialEmployeeData) {
      setEditingEmployee(null);
    } else {
      setShowCancelModal(true);
    }
  };

  const exportEmployees = () => {
    const exportData = filteredEmployees.map(emp => ({
      'Full Name': formatFullName(emp.firstName, emp.middleName, emp.lastName, emp.suffix),
      'Department': emp.dept,
      'Branch Location': emp.branch,
      'Employment Status': emp.status
    }));
    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Employee List");
    XLSX.writeFile(workbook, `Employee List.xlsx`);
  };

  return (
    <div className="space-y-6 relative">
      <div className="flex flex-col lg:flex-row justify-between lg:items-center gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-800 tracking-tight leading-none">
            {statusFilter} Employees
          </h1>
          <p className="text-slate-500 text-sm font-medium">
            {statusFilter === 'Active' ? "Register and organize active personnel." : "Review and manage records of offboarded personnel."}
          </p>
        </div>

        <div className="flex items-center gap-2 self-start lg:self-center">
          <button onClick={exportEmployees} className="bg-white text-slate-600 border border-slate-200 px-3 py-2.5 rounded-lg font-bold text-sm shadow-sm hover:bg-slate-50 transition-all active:scale-95 flex items-center justify-center gap-2" title="Export List">
            <Download size={18} />
          </button>
          <button onClick={() => setIsRegistering(true)} className="bg-red-600 text-white px-3 py-2.5 rounded-lg font-bold text-sm shadow-sm hover:bg-red-700 transition-all active:scale-95 flex items-center justify-center gap-2" title="Register New Employee">
            <UserPlus size={18} />
          </button>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
        <div className="flex flex-col sm:flex-row gap-3 sm:gap-4">
          <div className="flex-1 min-w-0">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
              <input
                type="text"
                placeholder="Search by name or contact..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm placeholder:text-slate-400 focus:ring-2 focus:ring-red-400/20 outline-none transition-all"
              />
            </div>
          </div>
          <div className="flex gap-3 w-full sm:w-auto">
            <Select value={deptFilter} onValueChange={setDeptFilter}>
              <SelectTrigger className="flex-1 sm:w-48 bg-secondary border-border text-foreground">
                <SelectValue placeholder="Department" />
              </SelectTrigger>
              <SelectContent className="bg-secondary border-border">
                <SelectItem value="All Departments">All Departments</SelectItem>
                {departments.map(dept => (
                  <SelectItem key={dept} value={dept}>{dept}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={branchFilter} onValueChange={setBranchFilter}>
              <SelectTrigger className="flex-1 sm:w-48 bg-secondary border-border text-foreground">
                <SelectValue placeholder="Branch" />
              </SelectTrigger>
              <SelectContent className="bg-secondary border-border">
                <SelectItem value="All Branches">All Branches</SelectItem>
                {branches.map(branch => (
                  <SelectItem key={branch} value={branch}>{branch}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div ref={dragScrollRef} className="overflow-x-auto scrollbar-hide">
          <table className="w-full text-left text-sm min-w-[900px]">
            <thead className="bg-slate-50 text-slate-400 font-bold uppercase text-[10px] tracking-widest border-b border-slate-100">
              <tr>
                <SortableHeader label="ZK ID" sortKey="zkId" currentSortKey={sortKeyStr} currentSortOrder={sortOrder} onSort={handleSort} className="px-4 py-4 w-20" />
                <SortableHeader label="Employee" sortKey="firstName" currentSortKey={sortKeyStr} currentSortOrder={sortOrder} onSort={handleSort} className="px-6 py-4" />
                <SortableHeader label="Employee ID" sortKey="employeeNumber" currentSortKey={sortKeyStr} currentSortOrder={sortOrder} onSort={handleSort} className="px-4 py-4" />
                <th className="px-4 py-4">Enrolled On</th>
                <SortableHeader label="Department" sortKey="dept" currentSortKey={sortKeyStr} currentSortOrder={sortOrder} onSort={handleSort} className="px-6 py-4" />
                <th className="px-6 py-4">Shift</th>
                <SortableHeader label="Branch" sortKey="branch" currentSortKey={sortKeyStr} currentSortOrder={sortOrder} onSort={handleSort} className="px-6 py-4" />
                <SortableHeader label="Contact" sortKey="phone" currentSortKey={sortKeyStr} currentSortOrder={sortOrder} onSort={handleSort} className="px-6 py-4" />
                <th className="px-6 py-4">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={9} className="px-6 py-12 text-center text-slate-400 font-bold text-xs">
                    Loading employees...
                  </td>
                </tr>
              ) : paginatedEmployees.length > 0 ? (
                paginatedEmployees.map((emp) => (
                  <tr key={emp.id} className="hover:bg-red-50/50 transition-colors duration-200 group">
                    {/* ZK ID */}
                    <td className="px-4 py-3 text-xs text-muted-foreground font-mono">
                      {emp.zkId ?? '—'}
                    </td>
                    {/* Employee Name */}
                    <td className="px-6 py-4">
                      <p className="font-bold text-slate-700">{formatFullName(emp.firstName, emp.middleName, emp.lastName, emp.suffix)}</p>
                      <p className="text-xs text-slate-400">{emp.email || '—'}</p>
                    </td>
                    {/* Employee ID */}
                    <td className="px-4 py-3 text-xs text-muted-foreground font-mono">
                      {emp.employeeNumber ?? '—'}
                    </td>
                    {/* Enrolled On (Device badges) */}
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {emp.EmployeeDeviceEnrollment && emp.EmployeeDeviceEnrollment.length > 0 ? (
                          emp.EmployeeDeviceEnrollment.map(enrollment => (
                            <span
                              key={enrollment.device.id}
                              title={`Enrolled on ${new Date(enrollment.enrolledAt).toLocaleDateString()}`}
                              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide ${enrollment.device.isActive
                                ? 'bg-green-100 text-green-700 border border-green-200'
                                : 'bg-gray-100 text-gray-500 border border-gray-200'
                                }`}
                            >
                              <span className={`w-1.5 h-1.5 rounded-full ${enrollment.device.isActive ? 'bg-green-500' : 'bg-gray-400'}`} />
                              {enrollment.device.name}
                            </span>
                          ))
                        ) : (
                          <span className="text-[10px] text-muted-foreground italic">Not enrolled</span>
                        )}
                      </div>
                    </td>
                    {/* Department */}
                    <td className="px-6 py-4 max-w-[120px]">
                      <span className="text-xs font-medium text-slate-500 block truncate" title={emp.dept || undefined}>
                        {emp.dept || '—'}
                      </span>
                    </td>
                    {/* Shift */}
                    <td className="px-6 py-4">
                      {emp.Shift ? (
                        <div>
                          <p className="text-xs font-bold text-slate-700 leading-tight">{emp.Shift.name}</p>
                          <p className="text-[10px] font-medium text-slate-400 mt-0.5">{formatTime(emp.Shift.startTime)} – {formatTime(emp.Shift.endTime)}</p>
                        </div>
                      ) : (
                        <span className="text-[10px] text-slate-300 font-bold">Unassigned</span>
                      )}
                    </td>
                    {/* Branch */}
                    <td className="px-6 py-4">
                      <span className="text-xs font-medium text-slate-500">{emp.branch || '—'}</span>
                    </td>
                    {/* Contact */}
                    <td className="px-6 py-4">
                      <span className="text-xs font-medium text-slate-500">{emp.phone || '—'}</span>
                    </td>
                    {/* Actions */}
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handleEditClick(emp)}
                          className="p-2.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all active:scale-90"
                          title="Edit employee"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>

                        {/* Fingerprint Enrollment */}
                        {(() => {
                          const status = enrollStatus[emp.id!] || 'idle';
                          const msg = enrollMsg[emp.id!] || '';
                          if (status === 'loading') {
                            return (
                              <button disabled className="p-2.5 rounded-xl bg-blue-50 text-blue-400 cursor-wait" title="Enrolling...">
                                <Fingerprint className="w-4 h-4 animate-pulse" />
                              </button>
                            );
                          }
                          if (status === 'success') {
                            return (
                              <div className="flex items-center gap-1">
                                <span className="p-2.5 rounded-xl bg-green-50 text-green-500">
                                  <CheckCircle2 className="w-4 h-4" />
                                </span>
                                <span className="text-[10px] text-green-600 font-semibold max-w-[90px] leading-tight">{msg}</span>
                              </div>
                            );
                          }
                          if (status === 'error') {
                            return (
                              <div className="flex items-center gap-1">
                                <span className="p-2.5 rounded-xl bg-amber-50 text-amber-500">
                                  <WifiOff className="w-4 h-4" />
                                </span>
                                <span className="text-[10px] text-amber-600 font-semibold max-w-[90px] leading-tight">{msg}</span>
                              </div>
                            );
                          }
                          return (
                            <button
                              onClick={() => {
                                const name = `${emp.firstName} ${emp.lastName}`;
                                setEnrollConfirmModal({ open: true, employeeId: emp.id!, employeeName: name });
                              }}
                              className="p-2.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all active:scale-90"
                              title="Enroll Fingerprint"
                            >
                              <Fingerprint className="w-4 h-4" />
                            </button>
                          );
                        })()}

                        {/* Reset Password */}
                        <button
                          onClick={() => setConfirmResetPassword(emp)}
                          className="p-2.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all active:scale-90"
                          title="Reset Password"
                        >
                          <Key className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr><td colSpan={9} className="px-6 py-24 text-center text-slate-400 font-bold uppercase text-[10px] tracking-widest">No matching employees found</td></tr>
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
              <ChevronLeft size={16} />
            </button>
            {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => i + 1).map(page => (
              <button
                key={page}
                onClick={() => setCurrentPage(page)}
                className={`h-8 w-8 rounded-lg text-xs font-bold transition-colors ${currentPage === page
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
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* Register Modal */}
      {isRegistering && (
        <div className="fixed inset-0 bg-slate-950/40 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-5 bg-red-600 text-white flex justify-between items-center shrink-0">
              <div>
                <h3 className="font-bold text-lg leading-tight tracking-tight">New Employee Registration</h3>
                <p className="text-[10px] text-red-100 opacity-90 uppercase font-black tracking-widest mt-0.5">Add to employee directory</p>
              </div>
              <button onClick={() => { setIsRegistering(false); setRegForm({ employeeNumber: "", firstName: "", lastName: "", middleName: "", suffix: "", email: "", phone: "", dept: "", branch: "", hireDate: "", shiftId: "", gender: "", dateOfBirth: "" }); setFormErrors({}) }} className="text-white/80 hover:text-white transition-colors">
                <X size={20} />
              </button>
            </div>
            <div className="px-6 py-5 space-y-4 overflow-y-auto">
              <div className="grid grid-cols-1 gap-4">
                <div>
                  <label className="text-slate-400 text-[10px] uppercase tracking-widest font-bold">Employee ID *</label>
                  <input
                    placeholder="e.g. 10001"
                    className={`mt-1.5 w-full px-3 py-2.5 rounded-xl border ${formErrors.employeeNumber ? 'border-red-400 bg-red-50' : 'border-slate-200 bg-white'} text-sm font-medium text-slate-700 placeholder:text-slate-300 focus:ring-2 focus:ring-red-500/20 outline-none transition-all`}
                    value={regForm.employeeNumber}
                    onChange={(e) => { setRegForm({ ...regForm, employeeNumber: e.target.value }); setFormErrors(p => ({ ...p, employeeNumber: '' })) }}
                  />
                  {formErrors.employeeNumber && <p className="mt-1 text-[11px] text-red-500 font-semibold">{formErrors.employeeNumber}</p>}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-slate-400 text-[10px] uppercase tracking-widest font-bold">First Name *</label>
                  <input
                    placeholder="First Name"
                    className={`mt-1.5 w-full px-3 py-2.5 rounded-xl border ${formErrors.firstName ? 'border-red-400 bg-red-50' : 'border-slate-200 bg-white'} text-sm font-medium text-slate-700 placeholder:text-slate-300 focus:ring-2 focus:ring-red-500/20 outline-none transition-all`}
                    value={regForm.firstName}
                    onChange={(e) => { setRegForm({ ...regForm, firstName: e.target.value }); setFormErrors(p => ({ ...p, firstName: '' })) }}
                  />
                  {formErrors.firstName && <p className="mt-1 text-[11px] text-red-500 font-semibold">{formErrors.firstName}</p>}
                </div>
                <div>
                  <label className="text-slate-400 text-[10px] uppercase tracking-widest font-bold">Last Name *</label>
                  <input
                    placeholder="Last Name"
                    className={`mt-1.5 w-full px-3 py-2.5 rounded-xl border ${formErrors.lastName ? 'border-red-400 bg-red-50' : 'border-slate-200 bg-white'} text-sm font-medium text-slate-700 placeholder:text-slate-300 focus:ring-2 focus:ring-red-500/20 outline-none transition-all`}
                    value={regForm.lastName}
                    onChange={(e) => { setRegForm({ ...regForm, lastName: e.target.value }); setFormErrors(p => ({ ...p, lastName: '' })) }}
                  />
                  {formErrors.lastName && <p className="mt-1 text-[11px] text-red-500 font-semibold">{formErrors.lastName}</p>}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-slate-400 text-[10px] uppercase tracking-widest font-bold">Middle Name</label>
                  <input
                    placeholder="Middle Name (optional)"
                    className="mt-1.5 w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-white text-sm font-medium text-slate-700 placeholder:text-slate-300 focus:ring-2 focus:ring-red-500/20 outline-none transition-all"
                    value={regForm.middleName}
                    onChange={(e) => setRegForm({ ...regForm, middleName: e.target.value })}
                  />
                </div>
                <div>
                  <label className="text-slate-400 text-[10px] uppercase tracking-widest font-bold">Suffix</label>
                  <select
                    className="mt-1.5 w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-white text-sm font-medium text-slate-700 focus:ring-2 focus:ring-red-500/20 outline-none cursor-pointer transition-all appearance-none"
                    value={regForm.suffix}
                    onChange={(e) => setRegForm({ ...regForm, suffix: e.target.value })}
                  >
                    <option value="">None</option>
                    {SUFFIX_OPTIONS.filter(Boolean).map(s => (<option key={s} value={s}>{s}</option>))}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-slate-400 text-[10px] uppercase tracking-widest font-bold">Gender</label>
                  <select
                    className="mt-1.5 w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-white text-sm font-medium text-slate-700 focus:ring-2 focus:ring-red-500/20 outline-none cursor-pointer transition-all appearance-none"
                    value={regForm.gender}
                    onChange={(e) => setRegForm({ ...regForm, gender: e.target.value })}
                  >
                    <option value="">Select Gender</option>
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                    <option value="Prefer not to say">Prefer not to say</option>
                  </select>
                </div>
                <div>
                  <label className="text-slate-400 text-[10px] uppercase tracking-widest font-bold">Date of Birth</label>
                  <input
                    type="date"
                    className="mt-1.5 w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-white text-sm font-medium text-slate-700 focus:ring-2 focus:ring-red-500/20 outline-none transition-all"
                    value={regForm.dateOfBirth}
                    onChange={(e) => setRegForm({ ...regForm, dateOfBirth: e.target.value })}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-slate-400 text-[10px] uppercase tracking-widest font-bold">Email Address</label>
                  <input
                    type="email"
                    placeholder="example@email.com"
                    className={`mt-1.5 w-full px-3 py-2.5 rounded-xl border ${formErrors.email ? 'border-red-400 bg-red-50' : 'border-slate-200 bg-white'} text-sm font-medium text-slate-700 placeholder:text-slate-300 focus:ring-2 focus:ring-red-500/20 outline-none transition-all`}
                    value={regForm.email}
                    onChange={(e) => { setRegForm({ ...regForm, email: e.target.value }); setFormErrors(p => ({ ...p, email: '' })) }}
                    onBlur={async () => {
                      const email = regForm.email.trim()
                      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return
                      setEmailChecking(true)
                      try {
                        const res = await fetch(`/api/employees/check-email?email=${encodeURIComponent(email)}`, { credentials: 'include' })
                        const data = await res.json()
                        if (data.success && !data.available) {
                          setFormErrors(p => ({ ...p, email: '⚠️ This email address is already in use. Please use a different email address.' }))
                        }
                      } catch (e) { console.error('Email check failed:', e) }
                      finally { setEmailChecking(false) }
                    }}
                  />
                  {formErrors.email && <p className="mt-1 text-[11px] text-red-500 font-semibold">{formErrors.email}</p>}
                </div>
                <div>
                  <label className="text-slate-400 text-[10px] uppercase tracking-widest font-bold">Contact Number *</label>
                  <input
                    type="tel"
                    placeholder="09XX XXX XXXX"
                    maxLength={13}
                    className={`mt-1.5 w-full px-3 py-2.5 rounded-xl border ${formErrors.phone ? 'border-red-400 bg-red-50' : 'border-slate-200 bg-white'} text-sm font-medium text-slate-700 placeholder:text-slate-300 focus:ring-2 focus:ring-red-500/20 outline-none transition-all`}
                    value={regForm.phone}
                    onChange={(e) => { setRegForm({ ...regForm, phone: formatPhoneNumber(e.target.value) }); setFormErrors(p => ({ ...p, phone: '' })) }}
                  />
                  {formErrors.phone && <p className="mt-1 text-[11px] text-red-500 font-semibold">{formErrors.phone}</p>}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-slate-400 text-[10px] uppercase tracking-widest font-bold">Department *</label>
                  <select
                    className={`mt-1.5 w-full px-3 py-2.5 rounded-xl border ${formErrors.dept ? 'border-red-400 bg-red-50' : 'border-slate-200 bg-white'} text-sm font-medium text-slate-700 focus:ring-2 focus:ring-red-500/20 outline-none cursor-pointer transition-all appearance-none`}
                    value={regForm.dept}
                    onChange={(e) => { setRegForm({ ...regForm, dept: e.target.value }); setFormErrors(p => ({ ...p, dept: '' })) }}
                  >
                    <option value="" disabled>e.g. Human Resources</option>
                    {departments.map(d => (<option key={d} value={d}>{d}</option>))}
                  </select>
                  {formErrors.dept && <p className="mt-1 text-[11px] text-red-500 font-semibold">{formErrors.dept}</p>}
                </div>
                <div>
                  <label className="text-slate-400 text-[10px] uppercase tracking-widest font-bold">Branch *</label>
                  <select
                    className={`mt-1.5 w-full px-3 py-2.5 rounded-xl border ${formErrors.branch ? 'border-red-400 bg-red-50' : 'border-slate-200 bg-white'} text-sm font-medium text-slate-700 focus:ring-2 focus:ring-red-500/20 outline-none cursor-pointer transition-all appearance-none`}
                    value={regForm.branch}
                    onChange={(e) => { setRegForm({ ...regForm, branch: e.target.value }); setFormErrors(p => ({ ...p, branch: '' })) }}
                  >
                    <option value="" disabled>e.g. Cebu City</option>
                    {branches.map(b => (<option key={b} value={b}>{b}</option>))}
                  </select>
                  {formErrors.branch && <p className="mt-1 text-[11px] text-red-500 font-semibold">{formErrors.branch}</p>}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-slate-400 text-[10px] uppercase tracking-widest font-bold">Date Hired</label>
                  <input
                    type="date"
                    className="mt-1.5 w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-white text-sm font-medium text-slate-700 focus:ring-2 focus:ring-red-500/20 outline-none transition-all"
                    value={regForm.hireDate}
                    onChange={(e) => setRegForm({ ...regForm, hireDate: e.target.value })}
                  />
                </div>
                <div>
                  <label className="text-slate-400 text-[10px] uppercase tracking-widest font-bold">Work Shift</label>
                  <select
                    className="mt-1.5 w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-white text-sm font-medium text-slate-700 focus:ring-2 focus:ring-red-500/20 outline-none cursor-pointer transition-all appearance-none"
                    value={regForm.shiftId}
                    onChange={(e) => setRegForm({ ...regForm, shiftId: e.target.value })}
                  >
                    <option value="">No shift assigned</option>
                    {shifts.map(s => (
                      <option key={s.id} value={s.id}>[{s.shiftCode}] {s.name} ({formatTime(s.startTime)} – {formatTime(s.endTime)})</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
            <div className="flex items-center justify-center gap-6 px-6 py-4 border-t border-slate-100 shrink-0">
              <button
                className="text-sm font-bold text-slate-400 hover:text-slate-600 transition-colors"
                onClick={() => { setIsRegistering(false); setRegForm({ employeeNumber: "", firstName: "", lastName: "", middleName: "", suffix: "", email: "", phone: "", dept: "", branch: "", hireDate: "", shiftId: "", gender: "", dateOfBirth: "" }); setFormErrors({}) }}
              >
                Discard
              </button>
              <button
                onClick={handleRegister}
                disabled={actionLoading || emailChecking}
                className="px-8 py-2.5 bg-red-600 hover:bg-red-700 disabled:bg-red-400 text-white text-sm font-bold rounded-xl transition-colors flex items-center gap-2"
              >
                {actionLoading ? (<><Loader2 className="w-4 h-4 animate-spin" />Registering...</>) : 'Register Employee'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {editingEmployee && (
        <div className="fixed inset-0 bg-slate-950/40 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-5 bg-red-600 text-white flex justify-between items-center shrink-0">
              <div>
                <h3 className="font-bold text-lg leading-tight tracking-tight">Edit Employee Profile</h3>
                <p className="text-[10px] text-red-100 opacity-90 uppercase font-black tracking-widest mt-0.5">Update employee info</p>
              </div>
              <button onClick={handleCancelClick} className="text-white/80 hover:text-white transition-colors"><X size={20} /></button>
            </div>
            <div className="p-6 space-y-4 overflow-y-auto">
              <div>
                <input type="text" placeholder="e.g. 10001" value={editingEmployee.employeeNumber || ''} onChange={(e) => setEditingEmployee({ ...editingEmployee, employeeNumber: e.target.value })} className="w-full p-2.5 bg-slate-50 border rounded-xl text-xs font-bold outline-none mb-3" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <input type="text" value={editingEmployee.firstName} onChange={(e) => setEditingEmployee({ ...editingEmployee, firstName: e.target.value })} className="w-full p-2.5 bg-slate-50 border rounded-xl text-xs font-bold outline-none" />
                <input type="text" value={editingEmployee.lastName} onChange={(e) => setEditingEmployee({ ...editingEmployee, lastName: e.target.value })} className="w-full p-2.5 bg-slate-50 border rounded-xl text-xs font-bold outline-none" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[9px] font-black uppercase text-slate-400 tracking-wider">Middle Name</label>
                  <input type="text" placeholder="Optional" value={editingEmployee.middleName || ''} onChange={(e) => setEditingEmployee({ ...editingEmployee, middleName: e.target.value })} className="w-full p-2.5 bg-slate-50 border rounded-xl text-xs font-bold outline-none" />
                </div>
                <div className="space-y-1">
                  <label className="text-[9px] font-black uppercase text-slate-400 tracking-wider">Suffix</label>
                  <select value={editingEmployee.suffix || ''} onChange={(e) => setEditingEmployee({ ...editingEmployee, suffix: e.target.value })} className="w-full p-2.5 bg-slate-50 border rounded-xl text-xs font-bold outline-none">
                    <option value="">None</option>
                    {SUFFIX_OPTIONS.filter(Boolean).map(s => (<option key={s} value={s}>{s}</option>))}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[9px] font-black uppercase text-slate-400 tracking-wider">Gender</label>
                  <select value={editingEmployee.gender || ''} onChange={(e) => setEditingEmployee({ ...editingEmployee, gender: e.target.value })} className="w-full p-2.5 bg-slate-50 border rounded-xl text-xs font-bold outline-none">
                    <option value="">Select Gender</option>
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                    <option value="Prefer not to say">Prefer not to say</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-[9px] font-black uppercase text-slate-400 tracking-wider">Date of Birth</label>
                  <input type="date" value={editingEmployee.dateOfBirth ? editingEmployee.dateOfBirth.split('T')[0] : ''} onChange={(e) => setEditingEmployee({ ...editingEmployee, dateOfBirth: e.target.value })} className="w-full p-2.5 bg-slate-50 border rounded-xl text-xs font-bold outline-none" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <input type="email" value={editingEmployee.email}
                  onChange={(e) => setEditingEmployee({ ...editingEmployee, email: e.target.value })}
                  onBlur={async () => {
                    const email = (editingEmployee.email || '').trim()
                    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return
                    try {
                      const res = await fetch(`/api/employees/check-email?email=${encodeURIComponent(email)}&excludeId=${editingEmployee.id}`, { credentials: 'include' })
                      const data = await res.json()
                      if (data.success && !data.available) {
                        showToast('error', 'Email Taken', '⚠️ This email address is already in use by another employee.')
                      }
                    } catch (e) { console.error('Email check failed:', e) }
                  }}
                  className="w-full p-2.5 bg-slate-50 border rounded-xl text-xs font-bold outline-none" />
                <input type="text" value={editingEmployee.phone} onChange={(e) => setEditingEmployee({ ...editingEmployee, phone: e.target.value })} className="w-full p-2.5 bg-slate-50 border rounded-xl text-xs font-bold outline-none" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <select value={editingEmployee.dept} onChange={(e) => setEditingEmployee({ ...editingEmployee, dept: e.target.value })} className="w-full p-2.5 bg-slate-50 border rounded-xl text-xs font-bold outline-none">
                  {departments.map(d => (<option key={d} value={d}>{d}</option>))}
                </select>
                <select value={editingEmployee.branch} onChange={(e) => setEditingEmployee({ ...editingEmployee, branch: e.target.value })} className="w-full p-2.5 bg-slate-50 border rounded-xl text-xs font-bold outline-none">
                  {branches.map(b => (<option key={b} value={b}>{b}</option>))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-slate-400 text-[10px] uppercase tracking-widest font-bold">Date Hired</label>
                  <input
                    type="date"
                    className="mt-1.5 w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-white text-sm font-medium text-slate-700 focus:ring-2 focus:ring-red-500/20 outline-none transition-all"
                    value={editingEmployee.hireDate || ''}
                    onChange={(e) => setEditingEmployee({ ...editingEmployee, hireDate: e.target.value })}
                  />
                </div>
                <div>
                  <label className="text-slate-400 text-[10px] uppercase tracking-widest font-bold">Status</label>
                  <div className="flex items-center gap-6 mt-3">
                    <label className="flex items-center gap-2 cursor-pointer group">
                      <div className="relative flex items-center justify-center">
                        <input type="radio" name="status" value="Active" checked={editingEmployee.status === "Active"} onChange={(e) => setEditingEmployee({ ...editingEmployee, status: e.target.value })} className="peer appearance-none w-4 h-4 border-2 border-slate-300 rounded-full checked:border-red-600 transition-all cursor-pointer" />
                        <div className="absolute w-2 h-2 bg-red-600 rounded-full opacity-0 peer-checked:opacity-100 transition-opacity pointer-events-none" />
                      </div>
                      <span className="text-xs font-bold text-slate-600 group-hover:text-slate-900 transition-colors">Active</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer group">
                      <div className="relative flex items-center justify-center">
                        <input type="radio" name="status" value="Inactive" checked={editingEmployee.status === "Inactive"} onChange={() => setShowInactiveConfirm(true)} className="peer appearance-none w-4 h-4 border-2 border-slate-300 rounded-full checked:border-red-600 transition-all cursor-pointer" />
                        <div className="absolute w-2 h-2 bg-red-600 rounded-full opacity-0 peer-checked:opacity-100 transition-opacity pointer-events-none" />
                      </div>
                      <span className="text-xs font-bold text-slate-600 group-hover:text-slate-900 transition-colors">Inactive</span>
                    </label>
                  </div>
                </div>
              </div>
              <div>
                <label className="text-slate-400 text-[10px] uppercase tracking-widest font-bold">Work Shift</label>
                <select
                  className="mt-1.5 w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-white text-sm font-medium text-slate-700 focus:ring-2 focus:ring-red-500/20 outline-none cursor-pointer transition-all appearance-none"
                  value={(editingEmployee as any).shiftId || ''}
                  onChange={(e) => setEditingEmployee({ ...editingEmployee, shiftId: e.target.value })}
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
            <div className="p-5 bg-slate-50 flex gap-3">
              <button onClick={handleCancelClick} className="flex-1 px-4 py-3.5 text-sm font-bold text-slate-500">Cancel</button>
              <button onClick={handleUpdate} disabled={actionLoading} className="flex-1 px-4 py-3.5 bg-red-600 text-white rounded-xl text-sm font-black flex justify-center items-center gap-2">
                {actionLoading && <Loader2 size={16} className="animate-spin" />}
                Update
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Inactive Confirm Modal */}
      {showInactiveConfirm && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm z-[200] flex items-center justify-center p-4">
          <div className="bg-white rounded-[2rem] shadow-2xl w-full max-w-sm p-6 text-center space-y-5">
            <h3 className="text-xl font-black text-slate-800">Move to Inactive?</h3>
            <p className="text-slate-500 text-sm">Are you sure you want to move <span className="font-bold text-slate-800">{editingEmployee?.firstName} {editingEmployee?.lastName}</span> to the inactive list?</p>
            <div className="flex gap-3">
              <button onClick={() => setShowInactiveConfirm(false)} className="flex-1 px-4 py-2.5 border-2 rounded-xl font-bold text-sm">No</button>
              <button onClick={() => { setEditingEmployee({ ...editingEmployee, status: "Inactive" }); setShowInactiveConfirm(false); }} className="flex-1 px-4 py-2.5 bg-red-600 text-white rounded-xl font-black text-sm">Yes, Move</button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm Reset Password Dialog */}
      {confirmResetPassword && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center bg-slate-950/40 backdrop-blur-sm">
          <div className="bg-white rounded-[2rem] shadow-2xl p-6 max-w-sm w-full mx-4 text-center space-y-5">
            <div className="mx-auto w-12 h-12 rounded-full bg-red-50 flex items-center justify-center">
              <Key className="w-6 h-6 text-red-500" />
            </div>
            <div>
              <h3 className="text-xl font-black text-slate-800">Reset Password?</h3>
              <p className="text-sm text-slate-500 mt-2">
                Are you sure you want to reset the password for <span className="font-bold text-slate-800">{confirmResetPassword.firstName} {confirmResetPassword.lastName}</span>? 
                A new temporary password will be sent to their email.
              </p>
            </div>
            <div className="flex gap-3">
              <button
                className="flex-1 px-4 py-2.5 border-2 rounded-xl font-bold text-sm hover:bg-slate-50 transition-colors"
                onClick={() => setConfirmResetPassword(null)}
                disabled={isResettingPassword}
              >
                Cancel
              </button>
              <button
                className="flex-1 px-4 py-2.5 bg-red-600 text-white rounded-xl font-black text-sm hover:bg-red-700 transition-colors"
                onClick={handleResetPassword}
                disabled={isResettingPassword}
              >
                {isResettingPassword ? 'Resetting...' : 'Reset Password'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Discard Changes Modal */}
      {showCancelModal && (
        <div className="fixed inset-0 bg-slate-950/40 backdrop-blur-sm z-[150] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm p-6 text-center space-y-4">
            <h3 className="text-lg font-black text-slate-800">Discard changes?</h3>
            <div className="flex gap-3">
              <button onClick={() => setShowCancelModal(false)} className="flex-1 px-4 py-2.5 border rounded-xl text-sm font-bold">Cancel</button>
              <button onClick={confirmCancel} className="flex-1 px-4 py-2.5 bg-red-600 text-white rounded-xl text-sm font-bold">Yes</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Enrollment Confirm Modal (Step 1) ── */}
      {enrollConfirmModal.open && (
        <div className="fixed inset-0 bg-slate-950/50 backdrop-blur-sm z-[200] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden">
            <div className="bg-red-600 px-6 py-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center">
                  <Fingerprint className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h3 className="font-bold text-white text-base">Enroll Fingerprint</h3>
                  <p className="text-[10px] text-red-100 uppercase tracking-widest font-bold">Biometric registration</p>
                </div>
              </div>
              <button onClick={() => setEnrollConfirmModal({ open: false, employeeId: null, employeeName: '' })} className="text-white/70 hover:text-white transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <p className="text-sm text-slate-600">
                Do you want to enroll the fingerprint for{' '}
                <span className="font-semibold text-slate-800">{enrollConfirmModal.employeeName}</span>?
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setEnrollConfirmModal({ open: false, employeeId: null, employeeName: '' })}
                  className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 text-sm font-medium text-slate-500 hover:bg-slate-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    setEnrollConfirmModal({ open: false, employeeId: null, employeeName: '' });
                    setSelectedDeviceId(null);
                    setDevicePickerModal({
                      open: true,
                      employeeId: enrollConfirmModal.employeeId,
                      employeeName: enrollConfirmModal.employeeName,
                    });
                    fetchDevices();
                  }}
                  className="flex-1 px-4 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-sm font-bold shadow-lg shadow-red-600/25 transition-colors"
                >
                  Yes, Proceed
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Device Picker Modal (Step 2) ── */}
      {devicePickerModal.open && (
        <div className="fixed inset-0 bg-slate-950/50 backdrop-blur-sm z-[200] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden">
            <div className="bg-red-600 px-6 py-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center">
                  <Fingerprint className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h3 className="font-bold text-white text-base">Select Device</h3>
                  <p className="text-[10px] text-red-100 uppercase tracking-widest font-bold">
                    Enrolling <span className="text-white">{devicePickerModal.employeeName}</span>
                  </p>
                </div>
              </div>
              <button
                onClick={() => { setDevicePickerModal({ open: false, employeeId: null, employeeName: '' }); setSelectedDeviceId(null); }}
                className="text-white/70 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="px-6 py-5 space-y-4">
              {loadingDevices ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin text-red-500" />
                </div>
              ) : devices.length === 0 ? (
                <div className="text-center py-6 text-sm text-slate-400">
                  No devices configured. Please add a device first.
                </div>
              ) : (
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {devices.map(device => (
                    <button
                      key={device.id}
                      onClick={() => setSelectedDeviceId(device.id)}
                      className={`w-full flex items-center gap-3 p-3 rounded-xl border transition-colors text-left ${selectedDeviceId === device.id
                        ? 'border-red-500 bg-red-50'
                        : 'border-slate-200 hover:bg-slate-50'
                        }`}
                    >
                      <div className={`w-2 h-2 rounded-full shrink-0 ${device.isActive ? 'bg-green-500' : 'bg-slate-300'}`} />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-slate-700 truncate">{device.name}</p>
                        {device.location && (
                          <p className="text-xs text-slate-400 truncate">{device.location}</p>
                        )}
                      </div>
                      {selectedDeviceId === device.id && (
                        <div className="w-4 h-4 rounded-full bg-red-500 flex items-center justify-center shrink-0">
                          <div className="w-2 h-2 rounded-full bg-white" />
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              )}
              <div className="flex gap-2">
                <button
                  onClick={() => { setDevicePickerModal({ open: false, employeeId: null, employeeName: '' }); setSelectedDeviceId(null); }}
                  className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 text-sm font-medium text-slate-500 hover:bg-slate-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  disabled={!selectedDeviceId}
                  onClick={() => {
                    if (!selectedDeviceId || !devicePickerModal.employeeId) return;
                    setDevicePickerModal({ open: false, employeeId: null, employeeName: '' });
                    handleEnrollFingerprint(devicePickerModal.employeeId, selectedDeviceId);
                    setSelectedDeviceId(null);
                  }}
                  className="flex-1 px-4 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-bold shadow-lg shadow-red-600/25 transition-colors"
                >
                  Enroll on This Device
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Scan Now Modal (Step 3) ── */}
      {scanModal.open && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm z-[200] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden">
            <div className="bg-red-600 px-6 py-5 relative overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-br from-red-500 to-red-700 opacity-60" />
              <div className="relative flex items-center justify-between">
                <div>
                  <p className="text-red-100 text-[10px] uppercase font-black tracking-widest">Biometric Device</p>
                  <h3 className="text-white font-black text-xl leading-tight mt-0.5">Scan Fingerprint Now</h3>
                </div>
                <button onClick={() => setScanModal(prev => ({ ...prev, open: false }))} className="text-white/70 hover:text-white transition-colors p-1 rounded-lg hover:bg-white/10">
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
            <div className="px-6 py-6 space-y-5">
              <div className="flex flex-col items-center gap-3 py-2">
                <div className="relative">
                  <div className="w-20 h-20 rounded-full bg-red-50 border-2 border-red-100 flex items-center justify-center">
                    <Fingerprint className="w-10 h-10 text-red-500 animate-pulse" />
                  </div>
                  <div className="absolute inset-0 rounded-full border-2 border-red-400 animate-ping opacity-30" />
                </div>
                <div className="text-center">
                  <p className="text-sm font-black text-slate-700">{scanModal.employeeName}</p>
                  <p className="text-xs text-slate-400 font-medium mt-0.5">is ready to enroll</p>
                </div>
              </div>
              <div className="space-y-2.5">
                {([
                  { step: '01', text: 'Go to the ZKTeco biometric device' },
                  { step: '02', text: 'Look for this employee on the screen' },
                  { step: '03', text: 'Press your finger firmly on the scanner' },
                  { step: '04', text: 'Hold for 3 seconds until it beeps' },
                ] as const).map(({ step, text }) => (
                  <div key={step} className="flex items-center gap-3">
                    <span className="shrink-0 w-7 h-7 rounded-lg bg-red-600 text-white text-[10px] font-black flex items-center justify-center">{step}</span>
                    <p className="text-xs font-semibold text-slate-600">{text}</p>
                  </div>
                ))}
              </div>
              <div className="bg-slate-50 border border-slate-100 rounded-2xl px-4 py-3 flex items-center gap-3">
                <Timer className="w-4 h-4 text-slate-400 shrink-0" />
                <p className="text-xs text-slate-500 font-medium flex-1">Auto-closes in</p>
                <span className={`text-sm font-black tabular-nums ${scanModal.countdown <= 10 ? 'text-red-500' : 'text-slate-700'}`}>{scanModal.countdown}s</span>
              </div>
            </div>
            <div className="px-6 pb-6">
              <button
                onClick={() => setScanModal(prev => ({ ...prev, open: false }))}
                className="w-full py-3 bg-slate-900 hover:bg-slate-800 text-white rounded-2xl text-sm font-black transition-all active:scale-95 shadow-lg shadow-slate-900/20"
              >
                Done — Fingerprint Scanned ✓
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Enrollment Loading Full-Screen Modal ── */}
      {(() => {
        const enrollingIdStr = Object.keys(enrollStatus).find(id => enrollStatus[Number(id)] === 'loading');
        if (!enrollingIdStr) return null;
        const msg = enrollMsg[Number(enrollingIdStr)] || 'Connecting to biometric device...';
        return (
          <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white rounded-3xl shadow-2xl p-8 flex flex-col items-center max-w-sm mx-4 text-center">
              <div className="relative mb-6">
                <div className="absolute inset-0 bg-blue-100 rounded-full animate-ping opacity-60"></div>
                <div className="bg-blue-50 text-blue-600 p-5 rounded-full relative shadow-sm">
                  <Loader2 className="w-10 h-10 animate-spin" />
                </div>
              </div>
              <h3 className="text-lg font-bold text-slate-800 mb-2">Please Wait</h3>
              <p className="text-sm font-medium text-slate-500">{msg}</p>
            </div>
          </div>
        );
      })()}

      {/* ── Toast Notifications ── */}
      <div className="fixed top-5 right-5 z-[9999] flex flex-col gap-2 w-80 pointer-events-none">
        {toasts.map(t => (
          <div
            key={t.id}
            className={`flex items-start gap-3 px-4 py-3 rounded-xl shadow-lg border pointer-events-auto animate-in slide-in-from-right-8 duration-300
              ${t.type === 'success' ? 'bg-white border-green-200' : t.type === 'warning' ? 'bg-white border-amber-200' : 'bg-white border-red-200'}`}
          >
            <span className={`mt-0.5 text-lg shrink-0 ${t.type === 'success' ? 'text-green-500' : t.type === 'warning' ? 'text-amber-500' : 'text-red-500'}`}>
              {t.type === 'success' ? '✅' : t.type === 'warning' ? '⚠️' : '❌'}
            </span>
            <div className="flex-1 min-w-0">
              <p className={`text-xs font-bold ${t.type === 'success' ? 'text-green-700' : t.type === 'warning' ? 'text-amber-700' : 'text-red-700'}`}>{t.title}</p>
              <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{t.message}</p>
            </div>
            <button
              onClick={() => setToasts(prev => prev.filter(x => x.id !== t.id))}
              className="text-slate-300 hover:text-slate-500 transition-colors shrink-0 mt-0.5"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function EmployeesPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center font-bold text-slate-400 uppercase tracking-widest">Loading...</div>}>
      <EmployeeDirectoryContent />
    </Suspense>
  );
}