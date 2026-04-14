import React, { useState } from 'react';
import { useToast } from '@/hooks/useToast';
import ToastContainer from '@/components/ui/ToastContainer';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Search, Download, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useHorizontalDragScroll } from '@/hooks/useHorizontalDragScroll';
import { useEmployees } from '../hooks/useEmployees';
import { EmployeeTable } from './EmployeeTable';
import { EmployeeEditModal } from './EmployeeEditModal';
import { ConfirmDeactivateDialog, ConfirmResetPasswordDialog, ConfirmRestoreDialog, ConfirmPermanentDeleteDialog } from './EmployeeConfirmDialogs';
import { ScanNowModal, EnrollmentLoadingOverlay } from './EmployeeScanModals';
import RFIDCardEnrollmentModal from '@/features/biometrics/components/RFIDCardEnrollmentModal';
import FingerprintDashboardModal from '@/features/biometrics/components/FingerprintDashboardModal';
import { EmployeeAddModal } from './EmployeeAddModal';
import { EmployeeImportModal } from './EmployeeImportModal';
import * as XLSX from 'xlsx';
import { formatFullName, Employee } from '../utils/employee-types';

interface EmployeeListPageProps {
  role: 'admin' | 'hr';
  statusFilter?: 'Active' | 'Inactive';
}

export function EmployeeListPage({ role, statusFilter = 'Active' }: EmployeeListPageProps) {
  const { employees, rawEmployees, departments, branches, shifts, loading, refresh, filters, tableSort, actions } = useEmployees({ statusFilter });
  const { toasts, showToast, dismissToast } = useToast();
  const dragScrollRef = useHorizontalDragScroll();

  const [currentPage, setCurrentPage] = useState(1);
  const rowsPerPage = 10;
  const totalPages = Math.ceil(tableSort.sortedData.length / rowsPerPage);
  const paginatedEmployees = tableSort.sortedData.slice((currentPage - 1) * rowsPerPage, currentPage * rowsPerPage);

  // States for sub-modals
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [editForm, setEditForm] = useState<Partial<Employee>>({});
  const [confirmDeactivate, setConfirmDeactivate] = useState<Employee | null>(null);
  const [confirmResetPassword, setConfirmResetPassword] = useState<Employee | null>(null);
  const [isResettingPassword, setIsResettingPassword] = useState(false);
  const [isAddOpen, setIsAddOpen] = useState(false);

  // Inactive-only actions
  const [confirmRestore, setConfirmRestore] = useState<Employee | null>(null);
  const [isRestoring, setIsRestoring] = useState(false);
  const [confirmPermanentDelete, setConfirmPermanentDelete] = useState<Employee | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  
  const [scanModal, setScanModal] = useState({ open: false, employeeName: '', countdown: 60 });
  const [enrollStatus, setEnrollStatus] = useState<Record<number, 'idle' | 'loading' | 'success' | 'error'>>({});
  const [enrollMsg, setEnrollMsg] = useState<Record<number, string>>({});
  
  const [fingerprintDashboardOpen, setFingerprintDashboardOpen] = useState<{ open: boolean; employeeId: number | null; employeeName: string }>({ open: false, employeeId: null, employeeName: '' });
  const [cardEnrollOpen, setCardEnrollOpen] = useState<{ open: boolean; employeeId: number | null; employeeName: string; currentCard: number | null }>({ open: false, employeeId: null, employeeName: '', currentCard: null });
  const [isExporting, setIsExporting] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);

  const handleUpdateEmployee = async () => {
    if (!editingEmployee || !editForm) return;
    
    // Basic validation check before calling action
    if (!editForm.firstName?.trim() || !editForm.lastName?.trim() || !editForm.employeeNumber?.trim()) {
      showToast('error', 'Validation Failed', 'Please fill in all required fields.');
      return;
    }

    setIsUpdating(true);
    try {
      const success = await actions.updateEmployee(editingEmployee.id as number, editForm);
      if (success) {
        setEditingEmployee(null);
        showToast('success', 'Profile Updated', `${editForm.firstName} ${editForm.lastName} has been updated.`);
      }
    } catch (error) {
      showToast('error', 'Update Failed', 'An unexpected error occurred.');
    } finally {
      setIsUpdating(false);
    }
  };

  const handleDeactivate = async () => {
    if (!confirmDeactivate) return;
    const success = await actions.deactivateEmployee(confirmDeactivate.id as number);
    if (success) setConfirmDeactivate(null);
  };

  const handleRestore = async () => {
    if (!confirmRestore) return;
    setIsRestoring(true);
    try {
      const res = await fetch(`/api/employees/${confirmRestore.id}/reactivate`, { method: 'PATCH' });
      const data = await res.json();
      if (data.success) {
        await refresh();
        showToast('success', 'Employee Restored', `${confirmRestore.firstName} ${confirmRestore.lastName} restored to active status`);
        setConfirmRestore(null);
      } else {
        showToast('error', 'Restore Failed', data.message || 'Unknown error');
      }
    } catch {
      showToast('error', 'Restore Failed', 'Could not reach the server. Please try again.');
    } finally {
      setIsRestoring(false);
    }
  };

  const handlePermanentDelete = async () => {
    if (!confirmPermanentDelete) return;
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/employees/${confirmPermanentDelete.id}/permanent`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        await refresh();
        showToast('success', 'Employee Deleted', `${confirmPermanentDelete.firstName} ${confirmPermanentDelete.lastName} permanently deleted`);
        setConfirmPermanentDelete(null);
      } else {
        showToast('error', 'Delete Failed', data.message || 'Unknown error');
      }
    } catch {
      showToast('error', 'Delete Failed', 'Could not reach the server. Please try again.');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleResetPassword = async () => {
    if (!confirmResetPassword) return;
    setIsResettingPassword(true);
    try {
      const res = await fetch(`/api/employees/${confirmResetPassword.id}/reset-password`, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        showToast('success', 'Password Reset', data.message || 'Password has been reset.');
        setConfirmResetPassword(null);
      } else {
        showToast('error', 'Reset Failed', data.message || 'Failed to reset.');
      }
    } catch {
      showToast('error', 'Reset Failed', 'Network error.');
    } finally {
      setIsResettingPassword(false);
    }
  };

  const handleEnrollFingerprint = async (employeeId: number, deviceId: number, fingerIndex: number = 5) => {
    setEnrollStatus(p => ({ ...p, [employeeId]: 'loading' }));
    setEnrollMsg(p => ({ ...p, [employeeId]: 'Connecting to device...' }));
    try {
      const res = await fetch(`/api/employees/${employeeId}/enroll-fingerprint`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fingerIndex, deviceId }) });
      const data = await res.json();
      setEnrollStatus(p => { const next = { ...p }; delete next[employeeId]; return next; });
      setEnrollMsg(p => { const next = { ...p }; delete next[employeeId]; return next; });
      if (data.success) {
        showToast('success', 'Enrollment Started', 'Device ready — follow the on-screen instructions');
        const emp = rawEmployees.find(e => e.id === employeeId);
        setScanModal({ open: true, employeeName: emp ? `${emp.firstName} ${emp.lastName}` : 'Employee', countdown: 60 });
        refresh();
      } else {
        showToast('error', 'Enrollment Failed', data.message || 'Could not start enrollment');
      }
    } catch {
      setEnrollStatus(p => { const next = { ...p }; delete next[employeeId]; return next; });
      setEnrollMsg(p => { const next = { ...p }; delete next[employeeId]; return next; });
      showToast('error', 'Enrollment Failed', 'Could not reach the server');
    }
  };

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const params = new URLSearchParams();
      if (filters.selectedDept !== 'all') params.set('department', filters.selectedDept);
      if (filters.selectedBranch !== 'all') params.set('branch', filters.selectedBranch);
      const res = await fetch(`/api/employees/export${params.toString() ? `?${params}` : ''}`);
      if (!res.ok) throw new Error('Export failed');
      const disposition = res.headers.get('Content-Disposition');
      const filenameMatch = disposition && disposition.match(/filename="?([^"]+)"?/);
      const filename = filenameMatch?.[1] || `employees_export_${new Date().toISOString().split('T')[0]}.xlsx`;
      
      const blob = await res.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      URL.revokeObjectURL(a.href);
      document.body.removeChild(a);
      showToast('success', 'Export Complete', `Downloaded employees`);
    } catch {
      showToast('error', 'Export Failed', 'Could not export employees');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="space-y-6">
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />

      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
        <div>
          <h2 className="text-2xl sm:text-3xl font-bold text-foreground">{statusFilter} Employees</h2>
          <p className="text-muted-foreground text-sm mt-1">{statusFilter === 'Active' ? 'Manage your active workforce' : 'Review offboarded personnel'}</p>
        </div>
        <div className="flex gap-2 items-center">
          {statusFilter === 'Inactive' && (
            <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 text-sm">
              <span className="text-amber-500">⚠</span>
              <span>Permanent deletion cannot be undone</span>
            </div>
          )}
          <Button variant="outline" className="border-border text-foreground hover:bg-red-700 hover:text-white gap-2 transition-all active:scale-95" disabled={isExporting} onClick={handleExport}>
            {isExporting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />} Export
          </Button>
          {role === 'admin' && statusFilter === 'Active' && (
            <EmployeeImportModal departments={departments} branches={branches} shifts={shifts} onImportComplete={refresh} />
          )}
          {(role === 'admin' || role === 'hr') && statusFilter === 'Active' && (
            <EmployeeAddModal departments={departments} branches={branches} shifts={shifts} onSave={actions.registerEmployee} isOpen={isAddOpen} setIsOpen={setIsAddOpen} />
          )}
        </div>
      </div>

      <Card className="bg-card border-border p-4">
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Search..." className="pl-10 text-foreground" value={filters.searchTerm} onChange={e => filters.setSearchTerm(e.target.value)} />
          </div>
          <Select value={filters.selectedDept} onValueChange={filters.setSelectedDept}>
            <SelectTrigger className="w-full sm:w-48"><SelectValue placeholder="Department" /></SelectTrigger>
            <SelectContent><SelectItem value="all">All Departments</SelectItem>{departments.map(d => (<SelectItem key={d.id} value={d.name}>{d.name}</SelectItem>))}</SelectContent>
          </Select>
          <Select value={filters.selectedBranch} onValueChange={filters.setSelectedBranch}>
            <SelectTrigger className="w-full sm:w-48"><SelectValue placeholder="Branch" /></SelectTrigger>
            <SelectContent><SelectItem value="all">All Branches</SelectItem>{branches.map(b => (<SelectItem key={b.id} value={b.name}>{b.name}</SelectItem>))}</SelectContent>
          </Select>
        </div>
      </Card>

      <EmployeeTable
        employees={paginatedEmployees} loading={loading} filteredCount={employees.length}
        currentPage={currentPage} totalPages={totalPages}
        sortKey={tableSort.sortKey as string} sortOrder={tableSort.sortOrder} onSort={tableSort.handleSort} onPageChange={setCurrentPage}
        pageSize={rowsPerPage}
        onEdit={(emp) => { setEditingEmployee(emp); setEditForm({ ...emp }); }}
        onResetPassword={setConfirmResetPassword}
        onFingerprintOpen={(id, name) => setFingerprintDashboardOpen({ open: true, employeeId: id, employeeName: name })}
        onCardEnrollOpen={(id, name, card) => setCardEnrollOpen({ open: true, employeeId: id, employeeName: name, currentCard: card ?? null })}
        enrollStatus={enrollStatus} dragScrollRef={dragScrollRef}
        {...(statusFilter === 'Inactive' ? { onRestore: setConfirmRestore, onPermanentDelete: setConfirmPermanentDelete } : {})}
      />

      {editingEmployee && <EmployeeEditModal 
        employee={editingEmployee} 
        editForm={editForm} 
        departments={departments} 
        branches={branches} 
        shifts={shifts} 
        isSaving={isUpdating}
        onFormChange={setEditForm} 
        onSave={handleUpdateEmployee} 
        onClose={() => setEditingEmployee(null)} 
        onEmailBlur={async () => {
          const email = editForm.email?.trim();
          if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return;
          try {
            const res = await fetch(`/api/employees/check-email?email=${encodeURIComponent(email)}&excludeId=${editingEmployee.id}`);
            const data = await res.json();
            if (data.success && !data.available) {
              showToast('warning', 'Email In Use', 'This email is already assigned to another employee.');
            }
          } catch { /* ignore network error on blur */ }
        }} 
      />}
      {confirmDeactivate && <ConfirmDeactivateDialog employee={confirmDeactivate} isDeactivating={false} onConfirm={handleDeactivate} onCancel={() => setConfirmDeactivate(null)} />}
      {confirmResetPassword && <ConfirmResetPasswordDialog employee={confirmResetPassword} isResetting={isResettingPassword} onConfirm={handleResetPassword} onCancel={() => setConfirmResetPassword(null)} />}
      <ScanNowModal open={scanModal.open} employeeName={scanModal.employeeName} countdown={scanModal.countdown} onClose={() => setScanModal(p => ({ ...p, open: false }))} />
      <EnrollmentLoadingOverlay enrollStatus={enrollStatus} enrollMsg={enrollMsg} />
      <FingerprintDashboardModal isOpen={fingerprintDashboardOpen.open} employeeId={fingerprintDashboardOpen.employeeId} employeeName={fingerprintDashboardOpen.employeeName} onClose={() => setFingerprintDashboardOpen({ open: false, employeeId: null, employeeName: '' })} onScanNow={(fi, di) => fingerprintDashboardOpen.employeeId && handleEnrollFingerprint(fingerprintDashboardOpen.employeeId, di, fi)} />
      <RFIDCardEnrollmentModal isOpen={cardEnrollOpen.open} employeeId={cardEnrollOpen.employeeId} employeeName={cardEnrollOpen.employeeName} currentCard={cardEnrollOpen.currentCard} onClose={() => setCardEnrollOpen({ open: false, employeeId: null, employeeName: '', currentCard: null })} onSuccess={(m) => { showToast('success', 'Badge Updated', m); refresh(); }} onError={(m) => showToast('error', 'Badge Operation Failed', m)} />
      {confirmRestore && <ConfirmRestoreDialog employee={confirmRestore} isRestoring={isRestoring} onConfirm={handleRestore} onCancel={() => setConfirmRestore(null)} />}
      {confirmPermanentDelete && <ConfirmPermanentDeleteDialog employee={confirmPermanentDelete} isDeleting={isDeleting} onConfirm={handlePermanentDelete} onCancel={() => setConfirmPermanentDelete(null)} />}
    </div>
  );
}
