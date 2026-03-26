"use client"

import React, { useState, useEffect, useRef, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Edit2, UserPlus, Search, Download, Trash2, AlertTriangle, RefreshCcw, Calendar as CalendarIcon, ChevronDown, ChevronUp } from 'lucide-react';
import * as XLSX from 'xlsx';
import { useTableSort } from '@/hooks/useTableSort';
import { SortableHeader } from '@/components/ui/SortableHeader';

function InactiveRecordsContent() {
    const searchParams = useSearchParams();
    const router = useRouter();

    const getTodayDate = () => {
        const today = new Date();
        return today.toISOString().split('T')[0];
    };

    const [selectedDate, setSelectedDate] = useState(getTodayDate());
    const [searchQuery, setSearchQuery] = useState("");
    const [deptFilter, setDeptFilter] = useState("All Departments");
    const [branchFilter, setBranchFilter] = useState("All Branches");
    const [deletingEmployee, setDeletingEmployee] = useState<any>(null);
    const [restoringEmployee, setRestoringEmployee] = useState<any>(null);
    const [showSuccessToast, setShowSuccessToast] = useState(false);
    const [toastMessage, setToastMessage] = useState("");
    const [openDropdown, setOpenDropdown] = useState<string | null>(null);
    const dateInputRef = useRef<HTMLInputElement>(null);

    const [employees, setEmployees] = useState([
        { firstName: "John", lastName: "Doe", dept: "I.T.", branch: "Tayud Branch", email: "john@biptip.com", phone: "0934-567-8901", date: getTodayDate() },
    ]);

    useEffect(() => {
        if (showSuccessToast) {
            const timer = setTimeout(() => setShowSuccessToast(false), 3000);
            return () => clearTimeout(timer);
        }
    }, [showSuccessToast]);

    const departments = ["All Departments", "Purchasing", "Finance", "I.T.", "Accounting", "Human Resources", "Engineering & Maintenance", "Office of the SVP - Corporate Services", "Marketing and Operations"];
    const branches = ["All Branches", "Main Office Branch", "Tayud Branch", "Makati Branch"];

    const filteredEmployees = employees
        .filter((emp) => {
            const fullName = `${emp.firstName} ${emp.lastName}`.toLowerCase();
            const matchesSearch = fullName.includes(searchQuery.toLowerCase());
            const matchesDept = deptFilter === "All Departments" || emp.dept === deptFilter;
            const matchesBranch = branchFilter === "All Branches" || emp.branch === branchFilter;
            const matchesDate = emp.date === selectedDate;

            return matchesSearch && matchesDept && matchesBranch && matchesDate;
        });

    const { sortedData: sortedEmployees, sortKey, sortOrder, handleSort } = useTableSort<any>({
        initialData: filteredEmployees
    });

    const sortKeyStr = sortKey as string | null;

    const handlePermanentDelete = () => {
        setEmployees(employees.filter(emp => emp.email !== deletingEmployee.email));
        setDeletingEmployee(null);
        setToastMessage("Record deleted permanently.");
        setShowSuccessToast(true);
    };

    const handleRestore = () => {
        setEmployees(employees.filter(emp => emp.email !== restoringEmployee.email));
        setRestoringEmployee(null);
        setToastMessage("Employee restored to active status.");
        setShowSuccessToast(true);
    };

    const exportEmployees = () => {
        const exportData = sortedEmployees.map(emp => ({
            'Full Name': `${emp.firstName} ${emp.lastName}`,
            'Department': emp.dept,
            'Branch': emp.branch,
            'Email': emp.email
        }));
        const worksheet = XLSX.utils.json_to_sheet(exportData);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Inactive List");
        XLSX.writeFile(workbook, `Inactive_List.xlsx`);
    };

    const CustomSelect = ({ value, options, onChange, id }: any) => {
        const isOpen = openDropdown === id;
        return (
            <div className="relative min-w-[180px]">
                <button
                    onClick={(e) => { e.stopPropagation(); setOpenDropdown(isOpen ? null : id); }}
                    className={`w-full flex items-center justify-between px-5 py-3 bg-[#df0808] text-white rounded-lg text-xs font-bold transition-all ${isOpen ? 'rounded-b-none' : 'shadow-md'}`}
                >
                    <span>{value}</span>
                    {isOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </button>
                {isOpen && (
                    <div className="absolute top-full left-0 right-0 z-50 flex flex-col pt-1">
                        {["All Branches", "All Departments"].includes(options[0]) ? null : (
                            <button
                                className="w-full text-left px-5 py-3 bg-[#c21414] text-white hover:bg-red-500 transition-colors text-xs font-bold first:mt-0 mt-[1px] rounded-sm shadow-sm"
                                onClick={() => {
                                    onChange(id === "branch" ? "All Branches" : "All Departments");
                                    setOpenDropdown(null);
                                }}
                            >
                                {id === "branch" ? "All Branches" : "All Departments"}
                            </button>
                        )}
                        {options.map((opt: string) => (
                            <button
                                key={opt}
                                className="w-full text-left px-5 py-3 bg-[#c21414] text-white hover:bg-red-500 transition-colors text-xs font-bold first:mt-0 mt-[1px] rounded-sm last:rounded-b-lg shadow-sm"
                                onClick={() => {
                                    onChange(opt);
                                    setOpenDropdown(null);
                                }}
                            >
                                {opt}
                            </button>
                        ))}
                    </div>
                )}
            </div>
        );
    };

    return (
        <div className="space-y-6 relative" onClick={() => setOpenDropdown(null)}>
            <div className="flex flex-col lg:flex-row justify-between lg:items-center gap-4">
                <div>
                    <h1 className="text-2xl font-black text-slate-800 tracking-tight leading-none">Inactive Records</h1>
                    <p className="text-slate-500 text-sm font-medium">Permanently remove or restore offboarded personnel data.</p>
                </div>
            </div>

            <div className="flex flex-col md:flex-row items-center bg-white p-2 rounded-2xl border border-slate-200 shadow-sm gap-4" onClick={(e) => e.stopPropagation()}>
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
                    <CustomSelect id="branch" value={branchFilter} options={branches} onChange={setBranchFilter} />
                    <CustomSelect id="dept" value={deptFilter} options={departments} onChange={setDeptFilter} />
                </div>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <table className="w-full text-left text-sm border-collapse">
                    <thead className="bg-slate-50 text-slate-400 font-bold uppercase text-[10px] tracking-widest border-b border-slate-100">
                        <tr>
                            <SortableHeader label="Employee" sortKey="firstName" currentSortKey={sortKeyStr} currentSortOrder={sortOrder} onSort={handleSort} className="px-8 py-5" />
                            <SortableHeader label="Department" sortKey="dept" currentSortKey={sortKeyStr} currentSortOrder={sortOrder} onSort={handleSort} className="px-8 py-5" />
                            <SortableHeader label="Branch" sortKey="branch" currentSortKey={sortKeyStr} currentSortOrder={sortOrder} onSort={handleSort} className="px-8 py-5" />
                            <SortableHeader label="Email Address" sortKey="email" currentSortKey={sortKeyStr} currentSortOrder={sortOrder} onSort={handleSort} className="px-8 py-5" />
                            <SortableHeader label="Contact Number" sortKey="phone" currentSortKey={sortKeyStr} currentSortOrder={sortOrder} onSort={handleSort} className="px-8 py-5" />
                            <th className="px-8 py-5 text-right pr-12">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {sortedEmployees.length > 0 ? (
                            sortedEmployees.map((emp, idx) => (
                                <tr key={idx} className="hover:bg-red-50 transition-colors duration-200 group cursor-default">
                                    <td className="px-8 py-5 font-bold text-slate-700">
                                        <span className="underline decoration-red-100 underline-offset-4 decoration-2">{emp.firstName} {emp.lastName}</span>
                                    </td>
                                    <td className="px-8 py-5 font-medium text-slate-500 text-xs">{emp.dept}</td>
                                    <td className="px-8 py-5 font-medium text-slate-500 text-xs">{emp.branch}</td>
                                    <td className="px-8 py-5 font-medium text-slate-500 text-xs">{emp.email}</td>
                                    <td className="px-8 py-5 font-medium text-slate-500 text-xs">{emp.phone}</td>
                                    <td className="px-8 py-5 text-right pr-12">
                                        <div className="flex justify-end gap-2">
                                            <button onClick={() => setRestoringEmployee(emp)} className="p-2 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-xl transition-all active:scale-90" title="Restore"><RefreshCcw size={18} /></button>
                                            <button onClick={() => setDeletingEmployee(emp)} className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all active:scale-90" title="Delete Permanent"><Trash2 size={18} /></button>
                                        </div>
                                    </td>
                                </tr>
                            ))
                        ) : (
                            <tr><td colSpan={6} className="px-8 py-24 text-center text-slate-400 font-bold uppercase text-[10px] tracking-widest">No inactive records found</td></tr>
                        )}
                    </tbody>
                </table>
            </div>

            {deletingEmployee && (
                <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm z-[200] flex items-center justify-center p-4">
                    <div className="bg-white rounded-[2rem] shadow-2xl w-full max-w-sm overflow-hidden p-6 text-center space-y-5 animate-in fade-in zoom-in duration-200">
                        <div>
                            <h3 className="text-xl font-black text-slate-800 tracking-tight">Delete Record?</h3>
                            <p className="text-slate-500 mt-2 text-sm leading-relaxed">
                                Permanently remove <span className="font-bold text-slate-800">{deletingEmployee.firstName} {deletingEmployee.lastName}</span>? <br />This action is irreversible.
                            </p>
                        </div>
                        <div className="flex gap-3">
                            <button onClick={() => setDeletingEmployee(null)} className="flex-1 px-4 py-2.5 border-2 border-slate-100 text-slate-600 rounded-xl font-bold text-sm hover:bg-slate-50 transition-all">Cancel</button>
                            <button onClick={handlePermanentDelete} className="flex-1 px-4 py-2.5 bg-red-600 text-white rounded-xl font-black text-sm shadow-lg hover:bg-red-700 active:scale-95 transition-all">Delete</button>
                        </div>
                    </div>
                </div>
            )}

            {restoringEmployee && (
                <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm z-[200] flex items-center justify-center p-4">
                    <div className="bg-white rounded-[2rem] shadow-2xl w-full max-w-sm overflow-hidden p-6 text-center space-y-5 animate-in fade-in zoom-in duration-200">
                        <div>
                            <h3 className="text-xl font-black text-slate-800 tracking-tight">Restore Personnel?</h3>
                            <p className="text-slate-500 mt-2 text-sm leading-relaxed">Restore <span className="font-bold text-slate-800">{restoringEmployee.firstName} {restoringEmployee.lastName}</span> to active employee list?</p>
                        </div>
                        <div className="flex gap-3">
                            <button onClick={() => setRestoringEmployee(null)} className="flex-1 px-4 py-2.5 border-2 border-slate-100 text-slate-600 rounded-xl font-bold text-sm hover:bg-slate-50 transition-all">Cancel</button>
                            <button onClick={handleRestore} className="flex-1 px-4 py-2.5 bg-emerald-600 text-white rounded-xl font-black text-sm shadow-lg active:scale-95 transition-all">Restore</button>
                        </div>
                    </div>
                </div>
            )}

            {showSuccessToast && (
                <div className="fixed bottom-8 left-1/2 -translate-x-1/2 bg-slate-800 text-white px-6 py-4 rounded-2xl shadow-2xl z-[210] animate-in fade-in slide-in-from-bottom-4 duration-300">
                    <span className="text-sm font-bold tracking-tight">{toastMessage}</span>
                </div>
            )}
        </div>
    );
}

export default function InactivePage() {
    return (
        <Suspense fallback={<div className="p-8 text-center font-bold text-slate-400">LOADING...</div>}>
            <InactiveRecordsContent />
        </Suspense>
    );
}