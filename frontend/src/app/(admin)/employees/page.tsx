'use client'

import React from "react"
import { useToast } from '@/hooks/useToast'
import ToastContainer from '@/components/ui/ToastContainer'
import { useState, useEffect, useCallback } from 'react'
import * as XLSX from 'xlsx'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogTrigger } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Search, Plus, Upload, Download, AlertCircle, X as XIcon, Loader2, FileSpreadsheet, RotateCcw, CheckCircle, XCircle } from 'lucide-react'
import { departmentsApi, branchesApi } from '@/lib/api'
import type { Department, Branch } from '@/lib/api'
import { useHorizontalDragScroll } from '@/hooks/useHorizontalDragScroll'
import { validateEmployeeId } from '@/lib/employeeValidation'
import { useTableSort } from '@/hooks/useTableSort'
import RFIDCardEnrollmentModal from '@/features/biometrics/components/RFIDCardEnrollmentModal'
import FingerprintDashboardModal from '@/features/biometrics/components/FingerprintDashboardModal'

// Feature components
import { Employee, ShiftOption, ImportRow, ImportResult, formatFullName, formatTime, formatPhoneNumber } from '@/features/employees/utils/employee-types'
import { EmployeeEditModal } from '@/features/employees/components/EmployeeEditModal'
import { ConfirmDeactivateDialog, ConfirmResetPasswordDialog } from '@/features/employees/components/EmployeeConfirmDialogs'
import { EmployeeTable } from '@/features/employees/components/EmployeeTable'
import { ScanNowModal, EnrollmentLoadingOverlay } from '@/features/employees/components/EmployeeScanModals'

const MAX_IMPORT_ROWS = 200

export default function EmployeesPage() {
  const dragScrollRef = useHorizontalDragScroll()
  const [employees, setEmployees] = useState<Employee[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const { toasts, showToast, dismissToast } = useToast()
  const [selectedDept, setSelectedDept] = useState<string>('all')
  const [selectedBranch, setSelectedBranch] = useState<string>('all')
  const [isAddOpen, setIsAddOpen] = useState(false)
  const [isImportOpen, setIsImportOpen] = useState(false)
  const [importFile, setImportFile] = useState<File | null>(null)
  const [isExporting, setIsExporting] = useState(false)
  const [isDownloadingTemplate, setIsDownloadingTemplate] = useState(false)
  const [isImporting, setIsImporting] = useState(false)

  // Import flow state
  const [importStep, setImportStep] = useState<'select' | 'preview' | 'results'>('select')
  const [importParsedRows, setImportParsedRows] = useState<ImportRow[]>([])
  const [importResults, setImportResults] = useState<ImportResult[]>([])
  const [importFileError, setImportFileError] = useState<string | null>(null)

  const resetImportState = useCallback(() => {
    setImportFile(null)
    setImportStep('select')
    setImportParsedRows([])
    setImportResults([])
    setImportFileError(null)
    setIsImporting(false)
  }, [])

  // Edit employee
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null)
  const [editForm, setEditForm] = useState<Partial<Employee>>({})

  // Confirm dialogs
  const [confirmDeactivate, setConfirmDeactivate] = useState<Employee | null>(null)
  const [isDeactivating, setIsDeactivating] = useState(false)
  const [confirmResetPassword, setConfirmResetPassword] = useState<Employee | null>(null)
  const [isResettingPassword, setIsResettingPassword] = useState(false)

  // Fingerprint enrollment
  const [enrollStatus, setEnrollStatus] = useState<Record<number, 'idle' | 'loading' | 'success' | 'error'>>({})
  const [enrollMsg, setEnrollMsg] = useState<Record<number, string>>({})
  const [scanModal, setScanModal] = useState<{ open: boolean; employeeName: string; countdown: number }>({ open: false, employeeName: '', countdown: 60 })
  const [fingerprintDashboardOpen, setFingerprintDashboardOpen] = useState<{ open: boolean; employeeId: number | null; employeeName: string }>({ open: false, employeeId: null, employeeName: '' })
  const [cardEnrollOpen, setCardEnrollOpen] = useState<{ open: boolean, employeeId: number | null, employeeName: string, currentCard: number | null }>({ open: false, employeeId: null, employeeName: '', currentCard: null })

  // Add employee form
  const [newEmployee, setNewEmployee] = useState({
    employeeNumber: '', firstName: '', lastName: '', middleName: '', suffix: '',
    contactNumber: '', department: '', branch: '', email: '', hireDate: '', shiftId: '', gender: '', dateOfBirth: '',
  })
  const [formErrors, setFormErrors] = useState<Record<string, string>>({})
  const [isRegistering, setIsRegistering] = useState(false)
  const [emailChecking, setEmailChecking] = useState(false)

  const [currentPage, setCurrentPage] = useState(1)
  const rowsPerPage = 10
  const [departments, setDepartments] = useState<Department[]>([])
  const [branches, setBranches] = useState<Branch[]>([])
  const [shifts, setShifts] = useState<ShiftOption[]>([])

  // ── Data Fetching ──
  const fetchEmployees = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/employees')
      if (res.status === 401) { window.location.href = '/login'; return }
      const data = await res.json()
      if (data.success) { setEmployees(data.employees.filter((e: Employee) => e.employmentStatus === 'ACTIVE' && e.role === 'USER')) }
    } catch (error) { console.error('Error fetching employees:', error) }
    finally { setLoading(false) }
  }

  const fetchShifts = async () => { try { const res = await fetch('/api/shifts', { credentials: 'include' }); const data = await res.json(); if (data.success) setShifts(data.shifts.filter((s: ShiftOption) => s)) } catch (error) { console.error('Error fetching shifts:', error) } }
  const fetchBranches = async () => { try { const data = await branchesApi.getAll(); if (data.success) setBranches(data.branches) } catch (error) { console.error('Error fetching branches:', error) } }
  const fetchDepartments = async () => { try { const data = await departmentsApi.getAll(); if (data.success) setDepartments(data.departments) } catch (error) { console.error('Error fetching departments:', error) } }

  useEffect(() => { fetchEmployees(); fetchBranches(); fetchDepartments(); fetchShifts() }, [])
  useEffect(() => { if (!scanModal.open) return; if (scanModal.countdown <= 0) { setScanModal(prev => ({ ...prev, open: false })); return }; const timer = setTimeout(() => { setScanModal(prev => ({ ...prev, countdown: prev.countdown - 1 })) }, 1000); return () => clearTimeout(timer) }, [scanModal.open, scanModal.countdown])

  // ── Filtering + Sorting ──
  const filteredEmployees = employees.filter(emp => {
    const fullName = formatFullName(emp.firstName, emp.middleName, emp.lastName, emp.suffix).toLowerCase()
    const matchesSearch = fullName.includes(searchTerm.toLowerCase()) || (emp.contactNumber || '').toLowerCase().includes(searchTerm.toLowerCase())
    const empDept = emp.Department?.name || emp.department || ''
    const matchesDept = selectedDept === 'all' || empDept === selectedDept
    const matchesBranch = selectedBranch === 'all' || emp.branch === selectedBranch
    return matchesSearch && matchesDept && matchesBranch
  })

  const { sortedData: paginatedSource, sortKey, sortOrder, handleSort } = useTableSort<Employee>({ initialData: filteredEmployees })
  const totalPages = Math.ceil(paginatedSource.length / rowsPerPage)
  const paginatedEmployees = paginatedSource.slice((currentPage - 1) * rowsPerPage, currentPage * rowsPerPage)

  // ── Handlers ──
  const handleEnrollFingerprint = async (employeeId: number, deviceId: number, fingerIndex: number = 5) => {
    setEnrollStatus(prev => ({ ...prev, [employeeId]: 'loading' }))
    setEnrollMsg(prev => ({ ...prev, [employeeId]: 'Connecting to device...' }))
    try {
      const res = await fetch(`/api/employees/${employeeId}/enroll-fingerprint`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ fingerIndex, deviceId }) })
      const data = await res.json()
      setEnrollStatus(prev => { const next = { ...prev }; delete next[employeeId]; return next })
      setEnrollMsg(prev => { const next = { ...prev }; delete next[employeeId]; return next })
      if (data.success) {
        showToast('success', 'Enrollment Started', 'Device ready — follow the on-screen instructions')
        const emp = employees.find(e => e.id === employeeId)
        setScanModal({ open: true, employeeName: emp ? `${emp.firstName} ${emp.lastName}` : 'Employee', countdown: 60 })
        await fetchEmployees()
      } else { showToast('error', 'Enrollment Failed', data.message || 'Could not start enrollment') }
    } catch (error) {
      setEnrollStatus(prev => { const next = { ...prev }; delete next[employeeId]; return next })
      setEnrollMsg(prev => { const next = { ...prev }; delete next[employeeId]; return next })
      showToast('error', 'Enrollment Failed', 'Could not reach the server')
    }
  }

  const handleAddEmployee = async () => {
    const errors: Record<string, string> = {}
    const empIdValidation = validateEmployeeId(newEmployee.employeeNumber)
    if (!empIdValidation.isValid) errors.employeeNumber = empIdValidation.error!
    if (!newEmployee.firstName.trim()) errors.firstName = 'First name is required'
    if (!newEmployee.lastName.trim()) errors.lastName = 'Last name is required'
    if (!newEmployee.contactNumber.trim()) errors.contactNumber = 'Contact number is required'
    else if (newEmployee.contactNumber.replace(/\D/g, '').length !== 11) errors.contactNumber = 'Must be exactly 11 digits'
    if (!newEmployee.email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmployee.email.trim())) errors.email = 'A valid email is required'
    if (formErrors.email && formErrors.email.includes('already in use')) errors.email = formErrors.email
    if (!newEmployee.department) errors.department = 'Department is required'
    if (!newEmployee.branch) errors.branch = 'Branch is required'
    if (Object.keys(errors).length > 0) { setFormErrors(errors); return }
    setFormErrors({}); setIsRegistering(true)
    try {
      const res = await fetch('/api/employees', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
        body: JSON.stringify({ employeeNumber: newEmployee.employeeNumber, firstName: newEmployee.firstName, lastName: newEmployee.lastName, middleName: newEmployee.middleName || undefined, suffix: newEmployee.suffix || undefined, contactNumber: newEmployee.contactNumber || undefined, department: newEmployee.department, branch: newEmployee.branch, email: newEmployee.email || undefined, hireDate: newEmployee.hireDate || undefined, shiftId: newEmployee.shiftId ? parseInt(newEmployee.shiftId) : undefined, gender: newEmployee.gender || undefined, dateOfBirth: newEmployee.dateOfBirth || undefined })
      })
      const data = await res.json()
      if (data.success) {
        await fetchEmployees()
        setNewEmployee({ employeeNumber: '', firstName: '', lastName: '', middleName: '', suffix: '', contactNumber: '', department: '', branch: '', email: '', hireDate: '', shiftId: '', gender: '', dateOfBirth: '' })
        setFormErrors({}); setIsAddOpen(false)
        const name = `${data.employee?.firstName || ''} ${data.employee?.lastName || ''}`.trim()
        if (data.deviceSync?.success === false) { showToast('warning', 'Registered — Device Offline', `${name} was saved but couldn't sync to the device.`) }
        else { showToast('success', 'Employee Registered', `${name} has been saved and login credentials were sent to their email.`) }
      } else { showToast('error', 'Registration Failed', data.message || 'Unknown error') }
    } catch (error) { showToast('error', 'Registration Failed', 'Could not reach the server.') }
    finally { setIsRegistering(false) }
  }

  const handleMoveToInactive = async () => {
    if (!confirmDeactivate) return; setIsDeactivating(true)
    try {
      const res = await fetch(`/api/employees/${confirmDeactivate.id}`, { method: 'DELETE' }); const data = await res.json()
      if (data.success) { await fetchEmployees(); setConfirmDeactivate(null); showToast('success', 'Employee Deactivated', `${confirmDeactivate.firstName} ${confirmDeactivate.lastName} moved to inactive`) }
      else { showToast('error', 'Deactivation Failed', data.message || 'Unknown error') }
    } catch (error) { showToast('error', 'Deactivation Failed', 'Could not reach the server.') }
    finally { setIsDeactivating(false) }
  }

  const handleResetPassword = async () => {
    if (!confirmResetPassword) return; setIsResettingPassword(true)
    try {
      const res = await fetch(`/api/employees/${confirmResetPassword.id}/reset-password`, { method: 'POST' }); const data = await res.json()
      if (data.success) { showToast('success', 'Password Reset', data.message || 'Password has been reset.'); setConfirmResetPassword(null) }
      else { showToast('error', 'Reset Failed', data.message || 'Failed to reset.') }
    } catch (error) { showToast('error', 'Reset Failed', 'Network error.') }
    finally { setIsResettingPassword(false) }
  }

  const handleUpdateEmployee = async () => {
    if (!editingEmployee || !editForm) return
    if (editForm.employeeNumber !== undefined) { const v = validateEmployeeId(editForm.employeeNumber); if (!v.isValid) { showToast('error', 'Validation Error', v.error!); return } }
    try {
      const res = await fetch(`/api/employees/${editingEmployee.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(editForm) }); const data = await res.json()
      if (data.success) { await fetchEmployees(); setEditingEmployee(null); showToast('success', 'Profile Updated', 'Employee profile updated successfully!') }
      else { showToast('error', 'Update Failed', data.message || 'Unknown error') }
    } catch (error) { showToast('error', 'Update Failed', 'Could not reach the server.') }
  }

  const handleExport = async () => {
    setIsExporting(true)
    try {
      const params = new URLSearchParams()
      if (selectedDept !== 'all') params.set('department', selectedDept)
      if (selectedBranch !== 'all') params.set('branch', selectedBranch)
      const res = await fetch(`/api/employees/export${params.toString() ? `?${params}` : ''}`, { credentials: 'include' })
      if (!res.ok) { const err = await res.json().catch(() => null); throw new Error(err?.message || 'Export failed') }
      const blob = await res.blob()
      const disposition = res.headers.get('Content-Disposition') || ''
      const filenameMatch = disposition.match(/filename="?([^"]+)"?/)
      const filename = filenameMatch?.[1] || `employees_export_${new Date().toISOString().split('T')[0]}.xlsx`
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = filename; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(a.href)
      showToast('success', 'Export Complete', `Downloaded ${filename}`)
    } catch (error: any) { showToast('error', 'Export Failed', error.message || 'Could not export employees') }
    finally { setIsExporting(false) }
  }

  const handleDownloadTemplate = async () => {
    setIsDownloadingTemplate(true)
    try {
      const res = await fetch('/api/employees/export-template', { credentials: 'include' })
      if (!res.ok) { const err = await res.json().catch(() => null); throw new Error(err?.message || 'Template download failed') }
      const blob = await res.blob(); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'employee_import_template.xlsx'; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(a.href)
      showToast('success', 'Template Downloaded', 'Import template saved successfully')
    } catch (error: any) { showToast('error', 'Download Failed', error.message || 'Could not download template') }
    finally { setIsDownloadingTemplate(false) }
  }

  // ── Import Logic ──
  const parseAndValidateFile = useCallback(async (file: File) => {
    setImportFileError(null)
    try {
      const ab = await file.arrayBuffer(); const wb = XLSX.read(ab, { type: 'array', cellDates: true }); const sheet = wb.Sheets[wb.SheetNames[0]]
      if (!sheet) { setImportFileError('No worksheet found.'); return }
      const jsonRows: any[] = XLSX.utils.sheet_to_json(sheet, { defval: '', range: 1 })
      if (jsonRows.length === 0) { setImportFileError('No data rows.'); return }
      const isNonDataRow = (row: any): boolean => { const empVal = String(row?.employeeNumber || row?.['Employee Number'] || '').trim().toLowerCase(); return empVal.startsWith('e.g') || empVal.startsWith('color') || empVal.startsWith('unique') || empVal === 'required field' || empVal === 'optional field' }
      const dataRows = jsonRows.filter(row => !isNonDataRow(row))
      if (dataRows.length === 0) { setImportFileError('No data rows (only hints).'); return }
      if (dataRows.length > MAX_IMPORT_ROWS) { setImportFileError(`${dataRows.length} rows — max is ${MAX_IMPORT_ROWS}.`); return }
      const normalize = (raw: any): Record<string, string> => { const out: Record<string, string> = {}; for (const [k, v] of Object.entries(raw)) { out[k.replace(/[\s_]+/g, '').toLowerCase()] = v instanceof Date ? v.toISOString() : String(v ?? '').trim() }; return out }
      const deptNames = departments.map(d => d.name); const branchNames = branches.map(b => b.name)
      const seenEmpNums = new Set<string>(); const seenEmails = new Set<string>()
      const parsed: ImportRow[] = dataRows.map((raw, idx) => {
        const n = normalize(raw); const rowNum = idx + 2
        const empNum = n['employeenumber'] || n['employeeid'] || n['empid'] || ''; const firstName = n['firstname'] || ''; const lastName = n['lastname'] || ''
        const middleName = n['middlename'] || undefined; const suffix = n['suffix'] || undefined; const gender = n['gender'] || undefined
        const dateOfBirth = n['dateofbirth'] || n['dob'] || n['birthday'] || undefined; const email = n['email'] || n['emailaddress'] || ''
        const contactNumber = (n['contactnumber'] || n['phonenumber'] || n['phone'] || n['contact'] || '').replace(/\s/g, '')
        const department = n['department'] || n['dept'] || ''; const branch = n['branch'] || ''; const hireDate = n['hiredate'] || n['datehired'] || undefined
        const shiftCode = n['shiftcode'] || n['shift'] || undefined
        const errors: string[] = []
        if (!empNum) errors.push('Missing employee number'); if (!firstName) errors.push('Missing first name'); if (!lastName) errors.push('Missing last name')
        if (!email) errors.push('Missing email'); if (!contactNumber) errors.push('Missing contact number'); if (!department) errors.push('Missing department'); if (!branch) errors.push('Missing branch')
        if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.push('Invalid email')
        if (contactNumber && contactNumber.replace(/\D/g, '').length !== 11) errors.push('Contact must be 11 digits')
        if (dateOfBirth && isNaN(Date.parse(dateOfBirth))) errors.push('Invalid DOB'); if (hireDate && isNaN(Date.parse(hireDate))) errors.push('Invalid hire date')
        if (department && !deptNames.includes(department)) errors.push(`Invalid department: ${department}`)
        if (branch && !branchNames.includes(branch)) errors.push(`Invalid branch: ${branch}`)
        let resolvedShiftId: number | null = null
        if (shiftCode) { const ms = shifts.find(s => s.shiftCode === shiftCode); if (!ms) errors.push(`Invalid shift: ${shiftCode}`); else resolvedShiftId = ms.id }
        if (empNum) { if (seenEmpNums.has(empNum)) errors.push('Duplicate emp# in file'); else seenEmpNums.add(empNum) }
        if (email) { const le = email.toLowerCase(); if (seenEmails.has(le)) errors.push('Duplicate email in file'); else seenEmails.add(le) }
        return { _rowNumber: rowNum, employeeNumber: empNum, firstName, lastName, middleName, suffix, gender, dateOfBirth, email, contactNumber, department, branch, hireDate, shiftCode, shiftId: resolvedShiftId, status: errors.length === 0 ? 'valid' : 'invalid', reason: errors.length > 0 ? errors.join('; ') : undefined }
      })
      setImportParsedRows(parsed); setImportStep('preview')
    } catch (err: any) { setImportFileError('Failed to parse file.') }
  }, [departments, branches, shifts])

  const handleBulkImport = useCallback(async () => {
    const validRows = importParsedRows.filter(r => r.status === 'valid'); if (validRows.length === 0) return; setIsImporting(true)
    try {
      const payload = validRows.map(r => ({ _rowNumber: r._rowNumber, employeeNumber: r.employeeNumber, firstName: r.firstName, lastName: r.lastName, middleName: r.middleName || undefined, suffix: r.suffix || undefined, gender: r.gender || undefined, dateOfBirth: r.dateOfBirth || undefined, email: r.email, contactNumber: r.contactNumber || undefined, department: r.department, branch: r.branch, hireDate: r.hireDate || undefined, shiftId: r.shiftId || undefined }))
      const res = await fetch('/api/employees/bulk', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ employees: payload }) })
      const data = await res.json()
      if (data.success && data.results) {
        setImportResults(data.results); setImportStep('results')
        const succeeded = data.results.filter((r: ImportResult) => r.status === 'success').length
        const failed = data.results.filter((r: ImportResult) => r.status === 'failed').length
        if (failed === 0) { showToast('success', 'Import Complete', `All ${succeeded} employees imported.`) }
        else { showToast('warning', 'Import Partially Complete', `${succeeded} imported, ${failed} failed.`) }
      } else { showToast('error', 'Import Failed', data.message || 'Server error.') }
    } catch (err) { showToast('error', 'Import Failed', 'Could not reach the server.') }
    finally { setIsImporting(false) }
  }, [importParsedRows])

  // ── RENDER ──
  return (
    <div className="space-y-6">
      {/* Extracted Modals */}
      {editingEmployee && (
        <EmployeeEditModal
          employee={editingEmployee} editForm={editForm} departments={departments} branches={branches} shifts={shifts}
          onFormChange={setEditForm} onSave={handleUpdateEmployee} onClose={() => setEditingEmployee(null)}
          onEmailBlur={async () => {
            const email = (editForm.email || '').trim()
            if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return
            try { const res = await fetch(`/api/employees/check-email?email=${encodeURIComponent(email)}&excludeId=${editingEmployee!.id}`, { credentials: 'include' }); const data = await res.json(); if (data.success && !data.available) { showToast('error', 'Email Taken', '⚠️ This email is already in use.') } } catch (e) { console.error('Email check failed:', e) }
          }}
        />
      )}

      {confirmDeactivate && <ConfirmDeactivateDialog employee={confirmDeactivate} isDeactivating={isDeactivating} onConfirm={handleMoveToInactive} onCancel={() => setConfirmDeactivate(null)} />}
      {confirmResetPassword && <ConfirmResetPasswordDialog employee={confirmResetPassword} isResetting={isResettingPassword} onConfirm={handleResetPassword} onCancel={() => setConfirmResetPassword(null)} />}

      <ScanNowModal open={scanModal.open} employeeName={scanModal.employeeName} countdown={scanModal.countdown} onClose={() => setScanModal(prev => ({ ...prev, open: false }))} />
      <EnrollmentLoadingOverlay enrollStatus={enrollStatus} enrollMsg={enrollMsg} />

      <ToastContainer toasts={toasts} onDismiss={dismissToast} />

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
        <div>
          <h2 className="text-2xl sm:text-3xl font-bold text-foreground">Active Employees</h2>
          <p className="text-muted-foreground text-sm mt-1">Manage your active workforce and employee records</p>
        </div>
        <div className="flex gap-2 w-full sm:w-auto">
          <Button variant="outline" className="flex-1 sm:flex-none border-border text-foreground hover:bg-red-700 hover:text-white gap-2" disabled={isExporting} onClick={handleExport}>
            {isExporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />} Export
          </Button>

          {/* Import Dialog */}
          <Dialog open={isImportOpen} onOpenChange={(open) => { setIsImportOpen(open); if (!open) resetImportState(); }}>
            <DialogTrigger asChild>
              <Button variant="outline" className="flex-1 sm:flex-none border-border text-foreground hover:bg-red-700 hover:text-white gap-2"><Upload className="w-4 h-4" /> Import</Button>
            </DialogTrigger>
            <DialogContent showCloseButton={false} className={`bg-white border-0 p-0 rounded-2xl overflow-hidden shadow-xl transition-all ${importStep === 'select' ? 'sm:max-w-md' : importStep === 'preview' ? 'sm:max-w-5xl' : 'sm:max-w-3xl'}`}>
              <div className="bg-red-600 px-6 py-4 flex items-center justify-between">
                <div>
                  <DialogTitle className="text-white font-bold text-lg">Import Employees</DialogTitle>
                  <DialogDescription className="text-white/80 text-[10px] uppercase tracking-widest font-bold mt-1">
                    {importStep === 'select' ? 'Upload from Excel or CSV' : importStep === 'preview' ? 'Review before importing' : 'Import results'}
                  </DialogDescription>
                </div>
                <button onClick={() => { setIsImportOpen(false); resetImportState(); }} className="text-white/80 hover:text-white transition-colors"><XIcon className="w-5 h-5" /></button>
              </div>

              {importStep === 'select' && (
                <>
                  <div className="px-6 py-5 space-y-4">
                    <p className="text-sm text-slate-500 font-medium">Upload an Excel file (.xlsx, .xls) or CSV (.csv) to bulk import employee records.</p>
                    <div className="border-2 border-dashed border-slate-200 rounded-xl p-6 text-center hover:border-red-300 transition-colors">
                      <Upload className="w-8 h-8 mx-auto text-slate-300 mb-2" />
                      <label htmlFor="excel-upload" className="cursor-pointer">
                        <span className="text-sm text-red-500 font-bold hover:underline">Click to select file</span>
                        <input id="excel-upload" type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(e) => { const file = e.target.files?.[0]; if (file) { setImportFile(file); parseAndValidateFile(file) } }} />
                      </label>
                      <p className="text-xs text-slate-400 mt-1">Supports .xlsx, .xls, .csv · Max {MAX_IMPORT_ROWS} rows</p>
                    </div>
                    {importFile && !importFileError && (<div className="flex items-center gap-2 p-3 bg-slate-50 rounded-xl"><FileSpreadsheet className="w-4 h-4 text-red-500" /><span className="text-sm text-slate-700 font-medium flex-1 truncate">{importFile.name}</span><span className="text-xs text-slate-400">{(importFile.size / 1024).toFixed(1)} KB</span></div>)}
                    {importFileError && (<div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-xl"><AlertCircle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" /><span className="text-sm text-red-700 font-medium">{importFileError}</span></div>)}
                    <div className="flex items-center justify-between bg-slate-50 rounded-xl px-4 py-3">
                      <span className="text-xs text-slate-500 font-medium">Not sure about the format?</span>
                      <button onClick={handleDownloadTemplate} disabled={isDownloadingTemplate} className="flex items-center gap-1.5 text-xs font-bold text-red-600 hover:text-red-700 transition-colors disabled:opacity-50">
                        {isDownloadingTemplate ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />} Download template
                      </button>
                    </div>
                  </div>
                  <div className="flex items-center justify-center gap-6 px-6 py-4 border-t border-slate-100">
                    <button className="text-sm font-bold text-slate-400 hover:text-slate-600 transition-colors" onClick={() => { setIsImportOpen(false); resetImportState(); }}>Discard</button>
                  </div>
                </>
              )}

              {importStep === 'preview' && (() => {
                const validCount = importParsedRows.filter(r => r.status === 'valid').length
                const invalidCount = importParsedRows.filter(r => r.status === 'invalid').length
                return (<>
                  <div className="px-6 py-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="text-sm text-slate-600 font-medium"><span className="text-green-600 font-bold">{validCount}</span> ready{invalidCount > 0 && <>, <span className="text-red-500 font-bold">{invalidCount}</span> with errors</>}.</p>
                      <button onClick={() => resetImportState()} className="flex items-center gap-1 text-xs font-bold text-red-600 hover:text-red-700"><RotateCcw className="w-3 h-3" /> Change file</button>
                    </div>
                    <div className="max-h-[55vh] overflow-auto border border-slate-200 rounded-xl">
                      <table className="w-full text-xs">
                        <thead className="bg-slate-50 sticky top-0 z-10"><tr><th className="px-3 py-2.5 text-left text-[10px] font-black text-slate-400 uppercase tracking-wider">Row</th><th className="px-3 py-2.5 text-left text-[10px] font-black text-slate-400 uppercase tracking-wider">Emp. No.</th><th className="px-3 py-2.5 text-left text-[10px] font-black text-slate-400 uppercase tracking-wider">First Name</th><th className="px-3 py-2.5 text-left text-[10px] font-black text-slate-400 uppercase tracking-wider">Last Name</th><th className="px-3 py-2.5 text-left text-[10px] font-black text-slate-400 uppercase tracking-wider">Department</th><th className="px-3 py-2.5 text-left text-[10px] font-black text-slate-400 uppercase tracking-wider">Branch</th><th className="px-3 py-2.5 text-left text-[10px] font-black text-slate-400 uppercase tracking-wider">Status</th></tr></thead>
                        <tbody className="divide-y divide-slate-100">{importParsedRows.map((row, idx) => (<tr key={idx} className={row.status === 'invalid' ? 'bg-red-50' : 'hover:bg-slate-50'}><td className="px-3 py-2 text-slate-400 font-mono">{row._rowNumber}</td><td className="px-3 py-2 font-bold text-slate-700">{row.employeeNumber || '—'}</td><td className="px-3 py-2 text-slate-600">{row.firstName || '—'}</td><td className="px-3 py-2 text-slate-600">{row.lastName || '—'}</td><td className="px-3 py-2 text-slate-600">{row.department || '—'}</td><td className="px-3 py-2 text-slate-600">{row.branch || '—'}</td><td className="px-3 py-2">{row.status === 'valid' ? <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-100 text-green-700 text-[10px] font-bold"><CheckCircle className="w-3 h-3" /> Ready</span> : <span className="inline-flex items-start gap-1 px-2 py-1 rounded-lg bg-red-100 text-red-700 text-[10px] font-bold" title={row.reason}><XCircle className="w-3 h-3 shrink-0 mt-0.5" /> <span className="break-words">{row.reason}</span></span>}</td></tr>))}</tbody>
                      </table>
                    </div>
                  </div>
                  <div className="flex items-center justify-center gap-6 px-6 py-4 border-t border-slate-100">
                    <button className="text-sm font-bold text-slate-400 hover:text-slate-600" onClick={() => { setIsImportOpen(false); resetImportState(); }}>Cancel</button>
                    <button className="px-8 py-2.5 bg-red-600 hover:bg-red-700 text-white text-sm font-bold rounded-xl disabled:opacity-50 flex items-center gap-2" disabled={validCount === 0 || isImporting} onClick={handleBulkImport}>
                      {isImporting ? <><Loader2 className="w-4 h-4 animate-spin" /> Importing...</> : `Upload & Import ${validCount} Row${validCount !== 1 ? 's' : ''}`}
                    </button>
                  </div>
                </>)
              })()}

              {importStep === 'results' && (() => {
                const succeeded = importResults.filter(r => r.status === 'success').length; const failed = importResults.filter(r => r.status === 'failed').length; const skippedInvalid = importParsedRows.filter(r => r.status === 'invalid').length
                return (<>
                  <div className="px-6 py-5 space-y-4">
                    <div className="grid grid-cols-3 gap-3">
                      <div className="bg-slate-50 rounded-xl p-3 text-center"><p className="text-2xl font-black text-slate-700">{importResults.length}</p><p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Attempted</p></div>
                      <div className="bg-green-50 rounded-xl p-3 text-center"><p className="text-2xl font-black text-green-600">{succeeded}</p><p className="text-[10px] font-bold text-green-500 uppercase tracking-wider">Succeeded</p></div>
                      <div className={`rounded-xl p-3 text-center ${failed > 0 ? 'bg-red-50' : 'bg-slate-50'}`}><p className={`text-2xl font-black ${failed > 0 ? 'text-red-600' : 'text-slate-400'}`}>{failed}</p><p className={`text-[10px] font-bold uppercase tracking-wider ${failed > 0 ? 'text-red-400' : 'text-slate-400'}`}>Failed</p></div>
                    </div>
                    {skippedInvalid > 0 && <p className="text-xs text-slate-400 text-center">{skippedInvalid} invalid row{skippedInvalid !== 1 ? 's were' : ' was'} skipped.</p>}
                    {failed > 0 && (<div className="space-y-2"><p className="text-xs font-bold text-red-600 uppercase tracking-wider">Failed Rows</p><div className="max-h-[30vh] overflow-auto border border-red-200 rounded-xl"><table className="w-full text-xs"><thead className="bg-red-50 sticky top-0"><tr><th className="px-3 py-2 text-left text-[10px] font-black text-red-400 uppercase">Row</th><th className="px-3 py-2 text-left text-[10px] font-black text-red-400 uppercase">Emp. No.</th><th className="px-3 py-2 text-left text-[10px] font-black text-red-400 uppercase">Reason</th></tr></thead><tbody className="divide-y divide-red-100">{importResults.filter(r => r.status === 'failed').map((r, idx) => (<tr key={idx} className="bg-red-50/50"><td className="px-3 py-2 text-slate-500 font-mono">{r.row}</td><td className="px-3 py-2 font-bold text-slate-700">{r.employeeNumber || '—'}</td><td className="px-3 py-2 text-red-600">{r.reason}</td></tr>))}</tbody></table></div></div>)}
                  </div>
                  <div className="flex items-center justify-center px-6 py-4 border-t border-slate-100">
                    <button className="px-10 py-2.5 bg-red-600 hover:bg-red-700 text-white text-sm font-bold rounded-xl" onClick={() => { setIsImportOpen(false); resetImportState(); fetchEmployees() }}>Done</button>
                  </div>
                </>)
              })()}
            </DialogContent>
          </Dialog>

          {/* Add Employee Dialog */}
          <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
            <DialogTrigger asChild><Button className="flex-1 sm:flex-none bg-primary hover:bg-primary/90 gap-2"><Plus className="w-4 h-4" /> Add Employee</Button></DialogTrigger>
            <DialogContent showCloseButton={false} className="bg-white border-0 max-w-lg p-0 rounded-2xl overflow-hidden shadow-xl">
              <div className="bg-red-600 px-6 py-4 flex items-center justify-between">
                <div><DialogTitle className="text-white font-bold text-lg">New Employee Registration</DialogTitle><DialogDescription className="text-white/80 text-[10px] uppercase tracking-widest font-bold mt-1">Add to employee directory</DialogDescription></div>
                <button onClick={() => setIsAddOpen(false)} className="text-white/80 hover:text-white"><XIcon className="w-5 h-5" /></button>
              </div>
              <div className="px-6 py-5 space-y-4">
                <div><label className="text-slate-400 text-[10px] uppercase tracking-widest font-bold">Employee ID *</label><input placeholder="e.g. 10001" className={`mt-1.5 w-full px-3 py-2.5 rounded-xl border ${formErrors.employeeNumber ? 'border-red-400 bg-red-50' : 'border-slate-200 bg-white'} text-sm font-medium text-slate-700 placeholder:text-slate-300 focus:ring-2 focus:ring-red-500/20 outline-none`} value={newEmployee.employeeNumber} onChange={e => { setNewEmployee({ ...newEmployee, employeeNumber: e.target.value }); setFormErrors(p => ({ ...p, employeeNumber: '' })) }} />{formErrors.employeeNumber && <p className="mt-1 text-[11px] text-red-500 font-semibold">{formErrors.employeeNumber}</p>}</div>
                <div className="grid grid-cols-2 gap-4">
                  <div><label className="text-slate-400 text-[10px] uppercase tracking-widest font-bold">First Name *</label><input placeholder="First Name" className={`mt-1.5 w-full px-3 py-2.5 rounded-xl border ${formErrors.firstName ? 'border-red-400 bg-red-50' : 'border-slate-200 bg-white'} text-sm font-medium text-slate-700 placeholder:text-slate-300 focus:ring-2 focus:ring-red-500/20 outline-none`} value={newEmployee.firstName} onChange={e => { setNewEmployee({ ...newEmployee, firstName: e.target.value }); setFormErrors(p => ({ ...p, firstName: '' })) }} />{formErrors.firstName && <p className="mt-1 text-[11px] text-red-500 font-semibold">{formErrors.firstName}</p>}</div>
                  <div><label className="text-slate-400 text-[10px] uppercase tracking-widest font-bold">Last Name *</label><input placeholder="Last Name" className={`mt-1.5 w-full px-3 py-2.5 rounded-xl border ${formErrors.lastName ? 'border-red-400 bg-red-50' : 'border-slate-200 bg-white'} text-sm font-medium text-slate-700 placeholder:text-slate-300 focus:ring-2 focus:ring-red-500/20 outline-none`} value={newEmployee.lastName} onChange={e => { setNewEmployee({ ...newEmployee, lastName: e.target.value }); setFormErrors(p => ({ ...p, lastName: '' })) }} />{formErrors.lastName && <p className="mt-1 text-[11px] text-red-500 font-semibold">{formErrors.lastName}</p>}</div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div><label className="text-slate-400 text-[10px] uppercase tracking-widest font-bold">Middle Name</label><input placeholder="Optional" className="mt-1.5 w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-white text-sm font-medium text-slate-700 placeholder:text-slate-300 focus:ring-2 focus:ring-red-500/20 outline-none" value={newEmployee.middleName} onChange={e => setNewEmployee({ ...newEmployee, middleName: e.target.value })} /></div>
                  <div><label className="text-slate-400 text-[10px] uppercase tracking-widest font-bold">Suffix</label><select className="mt-1.5 w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-white text-sm font-medium text-slate-700 focus:ring-2 focus:ring-red-500/20 outline-none cursor-pointer appearance-none" value={newEmployee.suffix} onChange={e => setNewEmployee({ ...newEmployee, suffix: e.target.value })}><option value="">None</option><option value="Jr.">Jr.</option><option value="Sr.">Sr.</option><option value="II">II</option><option value="III">III</option><option value="IV">IV</option><option value="V">V</option></select></div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div><label className="text-slate-400 text-[10px] uppercase tracking-widest font-bold">Gender</label><select className="mt-1.5 w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-white text-sm font-medium text-slate-700 focus:ring-2 focus:ring-red-500/20 outline-none cursor-pointer appearance-none" value={newEmployee.gender} onChange={e => setNewEmployee({ ...newEmployee, gender: e.target.value })}><option value="">Select Gender</option><option value="Male">Male</option><option value="Female">Female</option><option value="Prefer not to say">Prefer not to say</option></select></div>
                  <div><label className="text-slate-400 text-[10px] uppercase tracking-widest font-bold">Date of Birth</label><input type="date" className="mt-1.5 w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-white text-sm font-medium text-slate-700 focus:ring-2 focus:ring-red-500/20 outline-none" value={newEmployee.dateOfBirth} onChange={e => setNewEmployee({ ...newEmployee, dateOfBirth: e.target.value })} /></div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div><label className="text-slate-400 text-[10px] uppercase tracking-widest font-bold">Email Address *</label><input type="email" placeholder="example@email.com" className={`mt-1.5 w-full px-3 py-2.5 rounded-xl border ${formErrors.email ? 'border-red-400 bg-red-50' : 'border-slate-200 bg-white'} text-sm font-medium text-slate-700 placeholder:text-slate-300 focus:ring-2 focus:ring-red-500/20 outline-none`} value={newEmployee.email} onChange={e => { setNewEmployee({ ...newEmployee, email: e.target.value }); setFormErrors(p => ({ ...p, email: '' })) }} onBlur={async () => { const email = newEmployee.email.trim(); if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return; setEmailChecking(true); try { const res = await fetch(`/api/employees/check-email?email=${encodeURIComponent(email)}`, { credentials: 'include' }); const data = await res.json(); if (data.success && !data.available) { setFormErrors(p => ({ ...p, email: '⚠️ Email already in use.' })) } } catch (e) {} finally { setEmailChecking(false) } }} />{formErrors.email && <p className="mt-1 text-[11px] text-red-500 font-semibold">{formErrors.email}</p>}</div>
                  <div><label className="text-slate-400 text-[10px] uppercase tracking-widest font-bold">Contact Number *</label><input type="tel" placeholder="09XX XXX XXXX" maxLength={13} className={`mt-1.5 w-full px-3 py-2.5 rounded-xl border ${formErrors.contactNumber ? 'border-red-400 bg-red-50' : 'border-slate-200 bg-white'} text-sm font-medium text-slate-700 placeholder:text-slate-300 focus:ring-2 focus:ring-red-500/20 outline-none`} value={newEmployee.contactNumber} onChange={e => { setNewEmployee({ ...newEmployee, contactNumber: formatPhoneNumber(e.target.value) }); setFormErrors(p => ({ ...p, contactNumber: '' })) }} />{formErrors.contactNumber && <p className="mt-1 text-[11px] text-red-500 font-semibold">{formErrors.contactNumber}</p>}</div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div><label className="text-slate-400 text-[10px] uppercase tracking-widest font-bold">Department *</label><select className={`mt-1.5 w-full px-3 py-2.5 rounded-xl border ${formErrors.department ? 'border-red-400 bg-red-50' : 'border-slate-200 bg-white'} text-sm font-medium text-slate-700 focus:ring-2 focus:ring-red-500/20 outline-none cursor-pointer appearance-none`} value={newEmployee.department} onChange={e => { setNewEmployee({ ...newEmployee, department: e.target.value }); setFormErrors(p => ({ ...p, department: '' })) }}><option value="" disabled>e.g. Human Resources</option>{departments.map(dept => (<option key={dept.id} value={dept.name}>{dept.name}</option>))}</select>{formErrors.department && <p className="mt-1 text-[11px] text-red-500 font-semibold">{formErrors.department}</p>}</div>
                  <div><label className="text-slate-400 text-[10px] uppercase tracking-widest font-bold">Branch *</label><select className={`mt-1.5 w-full px-3 py-2.5 rounded-xl border ${formErrors.branch ? 'border-red-400 bg-red-50' : 'border-slate-200 bg-white'} text-sm font-medium text-slate-700 focus:ring-2 focus:ring-red-500/20 outline-none cursor-pointer appearance-none`} value={newEmployee.branch} onChange={e => { setNewEmployee({ ...newEmployee, branch: e.target.value }); setFormErrors(p => ({ ...p, branch: '' })) }}><option value="" disabled>e.g. Cebu City</option>{branches.map(b => (<option key={b.id} value={b.name}>{b.name}</option>))}</select>{formErrors.branch && <p className="mt-1 text-[11px] text-red-500 font-semibold">{formErrors.branch}</p>}</div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div><label className="text-slate-400 text-[10px] uppercase tracking-widest font-bold">Date Hired</label><input type="date" className="mt-1.5 w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-white text-sm font-medium text-slate-700 focus:ring-2 focus:ring-red-500/20 outline-none" value={newEmployee.hireDate} onChange={e => setNewEmployee({ ...newEmployee, hireDate: e.target.value })} /></div>
                  <div><label className="text-slate-400 text-[10px] uppercase tracking-widest font-bold">Work Shift</label><select className="mt-1.5 w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-white text-sm font-medium text-slate-700 focus:ring-2 focus:ring-red-500/20 outline-none cursor-pointer appearance-none" value={newEmployee.shiftId} onChange={e => setNewEmployee({ ...newEmployee, shiftId: e.target.value })}><option value="">No shift assigned</option>{shifts.map(s => (<option key={s.id} value={s.id}>[{s.shiftCode}] {s.name} ({formatTime(s.startTime)} – {formatTime(s.endTime)})</option>))}</select></div>
                </div>
              </div>
              <div className="flex items-center justify-center gap-6 px-6 py-4 border-t border-slate-100">
                <button className="text-sm font-bold text-slate-400 hover:text-slate-600" onClick={() => { setNewEmployee({ employeeNumber: '', firstName: '', lastName: '', middleName: '', suffix: '', contactNumber: '', department: '', branch: '', email: '', hireDate: '', shiftId: '', gender: '', dateOfBirth: '' }); setFormErrors({}); setIsAddOpen(false) }}>Discard</button>
                <button onClick={handleAddEmployee} disabled={isRegistering || emailChecking} className="px-8 py-2.5 bg-red-600 hover:bg-red-700 disabled:bg-red-400 text-white text-sm font-bold rounded-xl flex items-center gap-2">
                  {isRegistering ? (<><Loader2 className="w-4 h-4 animate-spin" /> Registering...</>) : 'Register Employee'}
                </button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Filters */}
      <Card className="bg-card border-border p-4">
        <div className="flex flex-col sm:flex-row gap-3 sm:gap-4">
          <div className="flex-1 min-w-0">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input placeholder="Search by name or contact..." className="pl-10 bg-secondary border-border text-foreground placeholder:text-muted-foreground" value={searchTerm} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearchTerm(e.target.value)} />
            </div>
          </div>
          <div className="flex gap-3 w-full sm:w-auto">
            <Select value={selectedDept} onValueChange={setSelectedDept}><SelectTrigger className="flex-1 sm:w-48 bg-secondary border-border text-foreground"><SelectValue placeholder="Department" /></SelectTrigger><SelectContent className="bg-secondary border-border"><SelectItem value="all">All Departments</SelectItem>{departments.map(d => (<SelectItem key={d.id} value={d.name}>{d.name}</SelectItem>))}</SelectContent></Select>
            <Select value={selectedBranch} onValueChange={setSelectedBranch}><SelectTrigger className="flex-1 sm:w-48 bg-secondary border-border text-foreground"><SelectValue placeholder="Branch" /></SelectTrigger><SelectContent className="bg-secondary border-border"><SelectItem value="all">All Branches</SelectItem>{branches.map(b => (<SelectItem key={b.id} value={b.name}>{b.name}</SelectItem>))}</SelectContent></Select>
          </div>
        </div>
      </Card>

      {/* Extracted Employee Table */}
      <EmployeeTable
        employees={paginatedEmployees} loading={loading} filteredCount={filteredEmployees.length}
        currentPage={currentPage} totalPages={totalPages}
        sortKey={sortKey} sortOrder={sortOrder} onSort={handleSort} onPageChange={setCurrentPage}
        onEdit={(emp) => { setEditingEmployee(emp); setEditForm({ ...emp }) }}
        onResetPassword={setConfirmResetPassword}
        onFingerprintOpen={(id, name) => setFingerprintDashboardOpen({ open: true, employeeId: id, employeeName: name })}
        onCardEnrollOpen={(id, name, card) => setCardEnrollOpen({ open: true, employeeId: id, employeeName: name, currentCard: card })}
        enrollStatus={enrollStatus} dragScrollRef={dragScrollRef}
      />

      <FingerprintDashboardModal isOpen={fingerprintDashboardOpen.open} employeeId={fingerprintDashboardOpen.employeeId} employeeName={fingerprintDashboardOpen.employeeName}
        onClose={() => setFingerprintDashboardOpen({ open: false, employeeId: null, employeeName: '' })}
        onScanNow={(fi, di) => { if (fingerprintDashboardOpen.employeeId) handleEnrollFingerprint(fingerprintDashboardOpen.employeeId, di, fi) }} />

      <RFIDCardEnrollmentModal isOpen={cardEnrollOpen.open} employeeId={cardEnrollOpen.employeeId} employeeName={cardEnrollOpen.employeeName} currentCard={cardEnrollOpen.currentCard}
        onClose={() => setCardEnrollOpen({ open: false, employeeId: null, employeeName: '', currentCard: null })}
        onSuccess={(msg) => { showToast('success', 'Badge Updated', msg); fetchEmployees() }}
        onError={(msg) => showToast('error', 'Badge Operation Failed', msg)} />
    </div>
  )
}