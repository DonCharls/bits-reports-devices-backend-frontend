import { useState } from 'react'
import { Employee } from '../utils/employee-types'
import { validateEmployeeId } from '@/lib/employeeValidation'

// ─── Types ────────────────────────────────────────────────────────────────────

export type EditFormErrors = Record<string, string>

interface UseEmployeeEditFormOptions {
  /** The controlled form data owned by the parent. */
  editForm: Partial<Employee>
  /** Parent-supplied save callback — only called when validation passes. */
  onSave: () => void
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useEmployeeEditForm({ editForm, onSave }: UseEmployeeEditFormOptions) {
  const [formErrors, setFormErrors] = useState<EditFormErrors>({})

  // ── Validation ──────────────────────────────────────────────────────────────
  //
  // Cross-field dependencies preserved exactly from the original:
  //   • contactNumber: stripped of non-digits, must be exactly 11 digits
  //   • email: format-only regex (field is optional — only validated when filled)
  //   • employeeNumber: delegated to validateEmployeeId()
  //   • department + branch: each individually required (no cross-dependency)
  //   • firstName + lastName: required trim only

  const validateForm = (): boolean => {
    const errors: EditFormErrors = {}

    // Employee ID
    const idValid = validateEmployeeId(editForm.employeeNumber)
    if (!idValid.isValid) errors.employeeNumber = idValid.error || 'Invalid Employee ID'

    // Name
    if (!editForm.firstName?.trim()) errors.firstName = 'First name is required'
    if (!editForm.lastName?.trim()) errors.lastName = 'Last name is required'

    // Contact Number
    if (!editForm.contactNumber?.trim()) {
      errors.contactNumber = 'Contact number is required'
    } else {
      const numeric = editForm.contactNumber.replace(/\D/g, '')
      if (numeric.length !== 11) errors.contactNumber = 'Must be exactly 11 digits'
    }

    // Email — format only (optional field)
    if (editForm.email?.trim()) {
      const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
      if (!emailPattern.test(editForm.email.trim())) errors.email = 'A valid email is required'
    }

    // Department / Branch
    if (!editForm.department) errors.department = 'Department is required'
    if (!editForm.branch) errors.branch = 'Branch is required'

    setFormErrors(errors)
    return Object.keys(errors).length === 0
  }

  // ── Inline error clearing (called by section onChange handlers) ─────────────

  const clearFieldError = (field: string) => {
    setFormErrors(prev => ({ ...prev, [field]: '' }))
  }

  // ── Save gate ───────────────────────────────────────────────────────────────

  const handleSaveWrapper = () => {
    if (validateForm()) onSave()
  }

  return {
    formErrors,
    clearFieldError,
    handleSaveWrapper,
  }
}
