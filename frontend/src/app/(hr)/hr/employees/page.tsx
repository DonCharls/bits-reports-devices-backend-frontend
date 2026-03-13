"use client"

import React, { useState, useEffect, Suspense, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { Edit2, UserPlus, Search, Download, AlertCircle, Loader2 } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import * as XLSX from 'xlsx';

interface Employee {
  id: number;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  dept: string | null;
  branch: string | null;
  hireDate: string | null;
  status: string;
  employeeNumber: string | null;
}

function EmployeeDirectoryContent() {
  const searchParams = useSearchParams();
  const statusFilter = searchParams.get('status') || "Active";

  const [searchQuery, setSearchQuery] = useState("");
  const [deptFilter, setDeptFilter] = useState("All Departments");
  const [branchFilter, setBranchFilter] = useState("All Branches");
  const [editingEmployee, setEditingEmployee] = useState<any>(null);
  const [initialEmployeeData, setInitialEmployeeData] = useState<string>("");
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [isRegistering, setIsRegistering] = useState(false);
  const [showSuccessToast, setShowSuccessToast] = useState(false);
  const [toastMessage, setToastMessage] = useState("");
  const [showInactiveConfirm, setShowInactiveConfirm] = useState(false);
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [departments, setDepartments] = useState<string[]>([]);
  const [branches, setBranches] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  
  // Registration Form State
  const [regForm, setRegForm] = useState({
    firstName: "", lastName: "", email: "", phone: "", dept: "", branch: "", hireDate: ""
  });

  const getToken = () => localStorage.getItem('token');

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const token = getToken();
      const [empRes, deptRes, branchRes] = await Promise.all([
        fetch('/api/employees', { headers: { Authorization: `Bearer ${token}` } }),
        fetch('/api/departments', { headers: { Authorization: `Bearer ${token}` } }),
        fetch('/api/branches', { headers: { Authorization: `Bearer ${token}` } })
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
            email: e.email,
            phone: e.contactNumber,
            dept: e.department,
            branch: e.branch,
            hireDate: e.hireDate ? e.hireDate.split('T')[0] : null,
            status: e.employmentStatus === 'ACTIVE' ? 'Active' : 'Inactive',
            employeeNumber: e.employeeNumber
          })));
      }
      if (deptData.success) setDepartments(deptData.departments.map((d: any) => d.name));
      if (branchData.success) setBranches(branchData.branches.map((b: any) => b.name));
    } catch (error) {
      console.error("Error fetching data:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const filteredEmployees = employees
    .filter((emp) => {
      const fullName = `${emp.firstName} ${emp.lastName}`.toLowerCase();
      const matchesSearch = fullName.includes(searchQuery.toLowerCase());
      const matchesStatus = emp.status === statusFilter;
      const matchesDept = deptFilter === "All Departments" || emp.dept === deptFilter;
      const matchesBranch = branchFilter === "All Branches" || emp.branch === branchFilter;

      return matchesSearch && matchesStatus && matchesDept && matchesBranch;
    })
    .sort((a, b) => a.firstName.localeCompare(b.firstName));

  useEffect(() => {
    if (showSuccessToast) {
      const timer = setTimeout(() => setShowSuccessToast(false), 3000);
      return () => clearTimeout(timer);
    }
  }, [showSuccessToast]);

  const handleUpdate = async () => {
    if (!editingEmployee) return;
    setActionLoading(true);
    try {
      const token = getToken();
      const res = await fetch(`/api/employees/${editingEmployee.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          firstName: editingEmployee.firstName,
          lastName: editingEmployee.lastName,
          email: editingEmployee.email || undefined,
          contactNumber: editingEmployee.phone || undefined,
          department: editingEmployee.dept || undefined,
          branch: editingEmployee.branch || undefined,
          hireDate: editingEmployee.hireDate || undefined,
          employmentStatus: editingEmployee.status === 'Active' ? 'ACTIVE' : 'INACTIVE'
        })
      });
      const data = await res.json();
      if (data.success) {
        setToastMessage("Employee profile updated successfully!");
        setShowSuccessToast(true);
        setEditingEmployee(null);
        fetchAll();
      } else {
        alert(data.message || "Update failed");
      }
    } catch (e) {
      console.error(e);
      alert("An error occurred during update.");
    } finally {
      setActionLoading(false);
    }
  };

  const handleRegister = async () => {
    if (!regForm.firstName || !regForm.lastName) {
      alert("First and Last name are required.");
      return;
    }
    setActionLoading(true);
    try {
      const token = getToken();
      const res = await fetch('/api/employees/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          firstName: regForm.firstName,
          lastName: regForm.lastName,
          email: regForm.email || undefined,
          contactNumber: regForm.phone || undefined,
          department: regForm.dept || undefined,
          branch: regForm.branch || undefined,
          hireDate: regForm.hireDate || undefined
        })
      });
      const data = await res.json();
      if (data.success) {
        setToastMessage("New employee registered successfully!");
        setShowSuccessToast(true);
        setIsRegistering(false);
        setRegForm({ firstName: "", lastName: "", email: "", phone: "", dept: "", branch: "", hireDate: "" });
        fetchAll();
      } else {
        alert(data.message || "Registration failed");
      }
    } catch (e) {
      console.error(e);
      alert("An error occurred during registration.");
    } finally {
      setActionLoading(false);
    }
  };

  const confirmCancel = () => {
    setEditingEmployee(null);
    setShowCancelModal(false);
  };

  const handleEditClick = (emp: any) => {
    const dataString = JSON.stringify(emp);
    setEditingEmployee(JSON.parse(dataString));
    setInitialEmployeeData(dataString);
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
      'Full Name': `${emp.firstName} ${emp.lastName}`,
      'Department': emp.dept,
      'Branch Location': emp.branch,
      'Employment Status': emp.status
    }));

    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();

    const wscols = [
      { wch: 30 },
      { wch: 35 },
      { wch: 25 },
      { wch: 20 }
    ];
    worksheet['!cols'] = wscols;

    XLSX.utils.book_append_sheet(workbook, worksheet, "Employee List");
    XLSX.writeFile(workbook, `Employee List.xlsx`);
  };


  return (
    <div className="space-y-6 relative" onClick={() => setOpenDropdown(null)}>
      <div className="flex flex-col lg:flex-row justify-between lg:items-center gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-800 tracking-tight leading-none">
            {statusFilter} Employees
          </h1>
          <p className="text-slate-500 text-sm font-medium">
            {statusFilter === 'Active' ? "Register and organize active personnel."
              : "Review and manage records of offboarded personnel."}
          </p>
        </div>

        <div className="flex items-center gap-2 self-start lg:self-center">
          <button
            onClick={exportEmployees}
            className="bg-white text-slate-600 border border-slate-200 px-6 py-2.5 rounded-xl font-bold text-sm shadow-sm hover:bg-slate-50 transition-all active:scale-95 flex items-center justify-center gap-2"
          >
            <Download size={18} />
            Export List
          </button>
          <button
            onClick={() => setIsRegistering(true)}
            className="bg-red-600 text-white px-6 py-2.5 rounded-xl font-bold text-sm shadow-lg shadow-red-600/20 hover:bg-red-700 transition-all active:scale-95 flex items-center justify-center gap-2"
          >
            <UserPlus size={18} />
            Register Employee
          </button>
        </div>
      </div>

      <div className="flex flex-col md:flex-row items-center bg-white p-2 rounded-2xl border border-slate-200 shadow-sm gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input
            type="text"
            placeholder="Search employees..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full md:w-64 pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-red-400/20 outline-none transition-all"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2 ml-auto">
          <Select value={branchFilter} onValueChange={setBranchFilter}>
            <SelectTrigger className="w-48 bg-secondary border-border text-foreground">
              <SelectValue placeholder="All Branches" />
            </SelectTrigger>
            <SelectContent className="bg-secondary border-border">
              <SelectItem value="All Branches">All Branches</SelectItem>
              {branches.map(b => (
                <SelectItem key={b} value={b}>{b}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={deptFilter} onValueChange={setDeptFilter}>
            <SelectTrigger className="w-52 bg-secondary border-border text-foreground">
              <SelectValue placeholder="All Departments" />
            </SelectTrigger>
            <SelectContent className="bg-secondary border-border">
              <SelectItem value="All Departments">All Departments</SelectItem>
              {departments.map(d => (
                <SelectItem key={d} value={d}>{d}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <table className="w-full text-left text-sm border-collapse">
          <thead className="bg-slate-50 text-slate-400 font-bold uppercase text-[10px] tracking-widest border-b border-slate-100">
            <tr>
              <th className="px-8 py-5">Employee</th>
              <th className="px-8 py-5">Department</th>
              <th className="px-8 py-5">Branch</th>
              <th className="px-8 py-5">Email Address</th>
              <th className="px-8 py-5">Contact Number</th>
              <th className="px-8 py-5 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr>
                <td colSpan={6} className="px-8 py-24 text-center text-slate-400 font-bold uppercase text-[10px] tracking-widest">
                  Loading...
                </td>
              </tr>
            ) : filteredEmployees.length > 0 ? (
              filteredEmployees.map((emp, idx) => (
                <tr key={idx} className="hover:bg-red-100 transition-colors duration-200 group cursor-default">
                  <td className="px-8 py-5">
                    <p className="font-bold text-slate-700 underline decoration-red-100 underline-offset-4 decoration-2">
                      {emp.firstName} {emp.lastName}
                    </p>
                    <p className="text-[10px] font-black text-slate-400 tracking-wider mt-0.5">{emp.employeeNumber || '—'}</p>
                  </td>
                  <td className="px-8 py-5 font-medium text-slate-500 text-xs">{emp.dept || '—'}</td>
                  <td className="px-8 py-5 font-medium text-slate-500 text-xs">{emp.branch || '—'}</td>
                  <td className="px-8 py-5 font-medium text-slate-500 text-xs">{emp.email || '—'}</td>
                  <td className="px-8 py-5 font-medium text-slate-500 text-xs">{emp.phone || '—'}</td>
                  <td className="px-8 py-5 text-right">
                    <button
                      onClick={() => handleEditClick(emp)}
                      className="p-2.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all active:scale-90"
                    >
                      <Edit2 size={18} />
                    </button>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={6} className="px-8 py-24 text-center text-slate-400 font-bold uppercase text-[10px] tracking-widest">
                  No matching employees found
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {isRegistering && (
        <div className="fixed inset-0 bg-slate-950/40 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-5 bg-red-600 text-white flex justify-between items-center shrink-0">
              <div>
                <h3 className="font-bold text-lg leading-tight tracking-tight">New Employee Registration</h3>
                <p className="text-[10px] text-red-100 opacity-90 uppercase font-black tracking-widest mt-0.5">Add biometric profile</p>
              </div>
            </div>

             <div className="p-6 space-y-6 overflow-y-auto">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[9px] font-black uppercase text-slate-400">First Name</label>
                  <input type="text" placeholder="First Name" value={regForm.firstName} onChange={(e) => setRegForm({...regForm, firstName: e.target.value})} className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:ring-2 focus:ring-red-500/20 outline-none" />
                </div>
                <div className="space-y-1">
                  <label className="text-[9px] font-black uppercase text-slate-400">Last Name</label>
                  <input type="text" placeholder="Last Name" value={regForm.lastName} onChange={(e) => setRegForm({...regForm, lastName: e.target.value})} className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:ring-2 focus:ring-red-500/20 outline-none" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[9px] font-black uppercase text-slate-400">Email Address</label>
                  <input type="email" placeholder="Email Address" value={regForm.email} onChange={(e) => setRegForm({...regForm, email: e.target.value})} className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:ring-2 focus:ring-red-500/20 outline-none" />
                </div>
                <div className="space-y-1">
                  <label className="text-[9px] font-black uppercase text-slate-400">Phone Number</label>
                  <input type="text" placeholder="Phone Number" value={regForm.phone} onChange={(e) => setRegForm({...regForm, phone: e.target.value})} className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:ring-2 focus:ring-red-500/20 outline-none" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[9px] font-black uppercase text-slate-400">Department</label>
                  <select value={regForm.dept} onChange={(e) => setRegForm({...regForm, dept: e.target.value})} className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:ring-2 focus:ring-red-500/20 outline-none">
                    <option value="" disabled>Department</option>
                    {departments.map(d => (<option key={d} value={d}>{d}</option>))}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-[9px] font-black uppercase text-slate-400">Assigned Branch</label>
                  <select value={regForm.branch} onChange={(e) => setRegForm({...regForm, branch: e.target.value})} className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:ring-2 focus:ring-red-500/20 outline-none">
                    <option value="" disabled>Assign Branch</option>
                    {branches.map(b => (<option key={b} value={b}>{b}</option>))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[9px] font-black uppercase text-slate-400">Date Hired</label>
                  <input type="date" value={regForm.hireDate} onChange={(e) => setRegForm({...regForm, hireDate: e.target.value})} className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:ring-2 focus:ring-red-500/10 focus:border-red-200 transition-all" />
                </div>
              </div>
            </div>

            <div className="p-5 bg-slate-50 flex gap-3 shrink-0">
              <button onClick={() => setIsRegistering(false)} className="flex-1 px-4 py-3.5 text-sm font-bold text-slate-500 hover:text-slate-800 transition-colors">Discard</button>
              <button onClick={handleRegister} disabled={actionLoading} className="flex-1 px-4 py-3.5 bg-red-600 text-white rounded-xl text-sm font-black shadow-lg shadow-red-600/30 hover:bg-red-700 transition-all active:scale-95 flex justify-center items-center gap-2">
                {actionLoading && <Loader2 size={16} className="animate-spin" />}
                Register Employee
              </button>
            </div>
          </div>
        </div>
      )}

      {editingEmployee && (
        <div className="fixed inset-0 bg-slate-950/40 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-5 bg-red-600 text-white flex justify-between items-center shrink-0">
              <div>
                <h3 className="font-bold text-lg leading-tight tracking-tight">Edit Employee Profile</h3>
              </div>
            </div>

            <div className="p-6 space-y-4 overflow-y-auto">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[9px] font-black uppercase text-slate-400 tracking-wider">First Name</label>
                  <input
                    type="text"
                    value={editingEmployee.firstName}
                    onChange={(e) => setEditingEmployee({ ...editingEmployee, firstName: e.target.value })}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 outline-none focus:ring-2 focus:ring-red-500/20"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[9px] font-black uppercase text-slate-400 tracking-wider">Last Name</label>
                  <input
                    type="text"
                    value={editingEmployee.lastName}
                    onChange={(e) => setEditingEmployee({ ...editingEmployee, lastName: e.target.value })}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 outline-none focus:ring-2 focus:ring-red-500/20"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[9px] font-black uppercase text-slate-400 tracking-wider">Email Address</label>
                  <input
                    type="email"
                    value={editingEmployee.email}
                    onChange={(e) => setEditingEmployee({ ...editingEmployee, email: e.target.value })}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 outline-none focus:ring-2 focus:ring-red-500/20"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[9px] font-black uppercase text-slate-400 tracking-wider">Contact Number</label>
                  <input
                    type="text"
                    value={editingEmployee.phone}
                    onChange={(e) => setEditingEmployee({ ...editingEmployee, phone: e.target.value })}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 outline-none focus:ring-2 focus:ring-red-500/20"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[9px] font-black uppercase text-slate-400 tracking-wider">Department</label>
                  <select
                    value={editingEmployee.dept}
                    onChange={(e) => setEditingEmployee({ ...editingEmployee, dept: e.target.value })}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 outline-none focus:ring-2 focus:ring-red-500/20"
                  >
                    {departments.map(d => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-[9px] font-black uppercase text-slate-400 tracking-wider">Assigned Branch</label>
                  <select
                    value={editingEmployee.branch}
                    onChange={(e) => setEditingEmployee({ ...editingEmployee, branch: e.target.value })}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 outline-none focus:ring-2 focus:ring-red-500/20"
                  >
                    {branches.map(b => (
                      <option key={b} value={b}>{b}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[9px] font-black uppercase text-slate-400 tracking-wider">Date Hired</label>
                  <input
                    type="date"
                    value={editingEmployee.hireDate} onChange={(e) => setEditingEmployee({ ...editingEmployee, hireDate: e.target.value })}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 outline-none focus:ring-2 focus:ring-red-500/20"
                  />
                </div>
                <div className="space-y-3 px-6">
                  <label className="text-[9px] font-black uppercase text-slate-400 tracking-wider">Status</label>
                  <div className="flex items-center gap-6 px-1 py-1">
                    <label className="flex items-center gap-2 cursor-pointer group">
                      <div className="relative flex items-center justify-center">
                        <input
                          type="radio"
                          name="status"
                          value="Active"
                          checked={editingEmployee.status === "Active"}
                          onChange={(e) => setEditingEmployee({ ...editingEmployee, status: e.target.value })}
                          className="peer appearance-none w-4 h-4 border-2 border-slate-300 rounded-full checked:border-red-600 transition-all cursor-pointer"
                        />
                        <div className="absolute w-2 h-2 bg-red-600 rounded-full opacity-0 peer-checked:opacity-100 transition-opacity pointer-events-none" />
                      </div>
                      <span className="text-xs font-bold text-slate-600 group-hover:text-slate-900 transition-colors">Active</span>
                    </label>

                    <label className="flex items-center py-2 gap-3 cursor-pointer group">
                      <div className="relative flex items-center justify-center">
                        <input
                          type="radio"
                          name="status"
                          value="Inactive"
                          checked={editingEmployee.status === "Inactive"}
                          onChange={() => setShowInactiveConfirm(true)}
                          className="peer appearance-none w-4 h-4 border-2 border-slate-300 rounded-full checked:border-red-600 transition-all cursor-pointer"
                        />
                        <div className="absolute w-2 h-2 bg-red-600 rounded-full opacity-0 peer-checked:opacity-100 transition-opacity pointer-events-none" />
                      </div>
                      <span className="text-xs font-bold text-slate-600 group-hover:text-slate-900 transition-colors">Inactive</span>
                    </label>
                  </div>
                </div>
              </div>
            </div>

            <div className="p-5 bg-slate-50 flex gap-3 shrink-0">
              <button onClick={handleCancelClick} className="flex-1 px-4 py-3.5 text-sm font-bold text-slate-500 hover:text-slate-800 transition-colors">Cancel</button>
              <button onClick={handleUpdate} disabled={actionLoading} className="flex-1 px-4 py-3.5 bg-red-600 text-white rounded-xl text-sm font-black shadow-lg shadow-red-600/30 hover:bg-red-700 transition-all active:scale-95 flex justify-center items-center gap-2">
                {actionLoading && <Loader2 size={16} className="animate-spin" />}
                Update
              </button>
            </div>
          </div>
        </div>
      )}

      {showInactiveConfirm && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm z-[200] flex items-center justify-center p-4">
          <div className="bg-white rounded-[2rem] shadow-2xl w-full max-w-sm overflow-hidden p-6 text-center space-y-5 animate-in fade-in zoom-in duration-200">

            <div>
              <h3 className="text-xl font-black text-slate-800 tracking-tight">Move to Inactive?</h3>
              <p className="text-slate-500 mt-2 text-sm leading-relaxed">
                Are you sure you want to move <span className="font-bold text-slate-800">{editingEmployee?.firstName} {editingEmployee?.lastName}</span> to the inactive list?
              </p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setShowInactiveConfirm(false)}
                className="flex-1 px-4 py-2.5 border-2 border-slate-100 text-slate-600 rounded-xl font-bold text-sm hover:bg-slate-50 transition-all"
              >
                No, Keep Active
              </button>
              <button
                onClick={async () => {
                  setActionLoading(true);
                  try {
                    const token = getToken();
                    await fetch(`/api/employees/${editingEmployee.id}`, {
                      method: 'PUT',
                      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                      body: JSON.stringify({ employmentStatus: 'INACTIVE' })
                    });
                    setShowInactiveConfirm(false);
                    setEditingEmployee(null);
                    setToastMessage("Employee moved to Inactive");
                    setShowSuccessToast(true);
                    fetchAll();
                  } catch(e) { console.error(e) } finally { setActionLoading(false) }
                }}
                disabled={actionLoading}
                className="flex-[2] px-4 py-2.5 bg-red-600 text-white rounded-xl font-black text-sm shadow-lg hover:bg-red-500 active:scale-95 transition-all flex justify-center items-center gap-2"
              >
                {actionLoading && <Loader2 size={16} className="animate-spin" />}
                Yes, Move
              </button>
            </div>
          </div>
        </div>
      )}

      {showCancelModal && (
        <div className="fixed inset-0 bg-slate-950/40 backdrop-blur-sm z-[150] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="p-6 text-center space-y-4">
              <div>
                <h3 className="text-lg font-black text-slate-800 tracking-tight">Discard changes?</h3>
                <p className="text-sm font-medium text-slate-500 mt-1">Your unsaved modifications will be lost.</p>
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setShowCancelModal(false)}
                  className="flex-1 px-4 py-2.5 border border-slate-200 text-slate-600 rounded-xl text-sm font-bold hover:bg-slate-50 transition-all"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmCancel}
                  className="flex-1 px-4 py-2.5 bg-red-600 text-white rounded-xl text-sm font-bold hover:bg-red-700 transition-all shadow-lg shadow-red-200 active:scale-95"
                >
                  Yes
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showSuccessToast && (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 bg-slate-500 text-white px-6 py-4 rounded-2xl shadow-2xl z-[110] animate-in fade-in slide-in-from-bottom-4 duration-300">
          <span className="text-sm font-bold tracking-tight">{toastMessage}</span>
        </div>
      )}
    </div>
  );
}

export default function EmployeesPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center font-bold text-slate-400">LOADING...</div>}>
      <EmployeeDirectoryContent />
    </Suspense>
  );
}