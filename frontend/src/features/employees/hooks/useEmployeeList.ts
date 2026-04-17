import { useState } from 'react';
import { useToast } from '@/hooks/useToast';
import { useEmployees } from './useEmployees';
import { formatFullName, Employee } from '../utils/employee-types';

interface UseEmployeeListOptions {
  statusFilter?: 'Active' | 'Inactive';
}

// ─── Pagination ───────────────────────────────────────────────────────────────

const ROWS_PER_PAGE = 10;

export function useEmployeeList({ statusFilter = 'Active' }: UseEmployeeListOptions = {}) {
  const { employees, rawEmployees, departments, branches, shifts, loading, refresh, filters, tableSort, actions } =
    useEmployees({ statusFilter });
  const { toasts, showToast, dismissToast } = useToast();

  // ── Pagination ──────────────────────────────────────────────────────────────
  const [currentPage, setCurrentPage] = useState(1);
  const totalPages = Math.ceil(tableSort.sortedData.length / ROWS_PER_PAGE);
  const paginatedEmployees = tableSort.sortedData.slice(
    (currentPage - 1) * ROWS_PER_PAGE,
    currentPage * ROWS_PER_PAGE,
  );

  // ── Edit modal ──────────────────────────────────────────────────────────────
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [editForm, setEditForm] = useState<Partial<Employee>>({});
  const [isUpdating, setIsUpdating] = useState(false);

  // ── Confirm dialogs ─────────────────────────────────────────────────────────
  const [confirmDeactivate, setConfirmDeactivate] = useState<Employee | null>(null);
  const [confirmResetPassword, setConfirmResetPassword] = useState<Employee | null>(null);
  const [isResettingPassword, setIsResettingPassword] = useState(false);

  // ── Add modal ───────────────────────────────────────────────────────────────
  const [isAddOpen, setIsAddOpen] = useState(false);

  // ── Inactive-only modal state ───────────────────────────────────────────────
  const [confirmRestore, setConfirmRestore] = useState<Employee | null>(null);
  const [isRestoring, setIsRestoring] = useState(false);
  const [confirmPermanentDelete, setConfirmPermanentDelete] = useState<Employee | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // ── Scan / enroll state ─────────────────────────────────────────────────────
  const [scanModal, setScanModal] = useState({ open: false, employeeName: '', countdown: 60 });
  const [enrollStatus, setEnrollStatus] = useState<Record<number, 'idle' | 'loading' | 'success' | 'error'>>({});
  const [enrollMsg, setEnrollMsg] = useState<Record<number, string>>({});

  // ── Biometric modals ────────────────────────────────────────────────────────
  const [fingerprintDashboardOpen, setFingerprintDashboardOpen] = useState<{
    open: boolean; employeeId: number | null; employeeName: string;
  }>({ open: false, employeeId: null, employeeName: '' });

  const [cardEnrollOpen, setCardEnrollOpen] = useState<{
    open: boolean; employeeId: number | null; employeeName: string; currentCard: number | null;
  }>({ open: false, employeeId: null, employeeName: '', currentCard: null });

  // ── Export state ────────────────────────────────────────────────────────────
  const [isExporting, setIsExporting] = useState(false);

  // ─── Action handlers ────────────────────────────────────────────────────────

  const handleUpdateEmployee = async () => {
    if (!editingEmployee || !editForm) return;
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
    } catch {
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
      const res = await fetch(`/api/employees/${employeeId}/enroll-fingerprint`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fingerIndex, deviceId }),
      });
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

  /** Email uniqueness check — called on blur from EmployeeEditModal */
  const handleEmailBlur = async () => {
    const email = editForm.email?.trim();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return;
    try {
      const res = await fetch(`/api/employees/check-email?email=${encodeURIComponent(email)}&excludeId=${editingEmployee?.id}`);
      const data = await res.json();
      if (data.success && !data.available) {
        showToast('warning', 'Email In Use', 'This email is already assigned to another employee.');
      }
    } catch { /* ignore network error on blur */ }
  };

  return {
    // data (from useEmployees)
    employees,
    rawEmployees,
    departments,
    branches,
    shifts,
    loading,
    refresh,
    filters,
    tableSort,
    actions,
    // toast
    toasts,
    dismissToast,
    showToast,
    // pagination
    currentPage,
    setCurrentPage,
    totalPages,
    paginatedEmployees,
    rowsPerPage: ROWS_PER_PAGE,
    // edit modal
    editingEmployee,
    setEditingEmployee,
    editForm,
    setEditForm,
    isUpdating,
    // confirm dialogs
    confirmDeactivate,
    setConfirmDeactivate,
    confirmResetPassword,
    setConfirmResetPassword,
    isResettingPassword,
    // add modal
    isAddOpen,
    setIsAddOpen,
    // inactive-only
    confirmRestore,
    setConfirmRestore,
    isRestoring,
    confirmPermanentDelete,
    setConfirmPermanentDelete,
    isDeleting,
    // scan/enroll
    scanModal,
    setScanModal,
    enrollStatus,
    enrollMsg,
    // biometric modals
    fingerprintDashboardOpen,
    setFingerprintDashboardOpen,
    cardEnrollOpen,
    setCardEnrollOpen,
    // export
    isExporting,
    // handlers
    handleUpdateEmployee,
    handleDeactivate,
    handleRestore,
    handlePermanentDelete,
    handleResetPassword,
    handleEnrollFingerprint,
    handleExport,
    handleEmailBlur,
  };
}
