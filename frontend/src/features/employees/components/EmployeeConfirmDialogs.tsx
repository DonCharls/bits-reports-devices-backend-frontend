'use client'

import React from 'react'
import { AlertTriangle, Key } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { Employee } from '../utils/employee-types'

interface ConfirmDeactivateDialogProps {
  employee: Employee
  isDeactivating: boolean
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmDeactivateDialog({ employee, isDeactivating, onConfirm, onCancel }: ConfirmDeactivateDialogProps) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/40 backdrop-blur-sm">
      <div className="bg-card border border-border rounded-2xl shadow-2xl p-6 max-w-sm w-full mx-4">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-amber-500/20 flex items-center justify-center shrink-0">
            <AlertTriangle className="w-5 h-5 text-amber-400" />
          </div>
          <div>
            <h3 className="font-semibold text-foreground">Move to Inactive?</h3>
            <p className="text-sm text-muted-foreground">This action can be undone from the Inactive list.</p>
          </div>
        </div>
        <p className="text-sm text-foreground mb-6">
          <span className="font-medium">{employee.firstName} {employee.lastName}</span> will be moved to the Inactive employee list and removed from the active roster.
        </p>
        <div className="flex gap-3">
          <Button variant="outline" className="flex-1 border-border text-foreground hover:bg-secondary" onClick={onCancel} disabled={isDeactivating}>Cancel</Button>
          <Button className="flex-1 bg-amber-500 hover:bg-amber-600 text-white" onClick={onConfirm} disabled={isDeactivating}>
            {isDeactivating ? 'Moving...' : 'Move to Inactive'}
          </Button>
        </div>
      </div>
    </div>
  )
}

interface ConfirmResetPasswordDialogProps {
  employee: Employee
  isResetting: boolean
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmResetPasswordDialog({ employee, isResetting, onConfirm, onCancel }: ConfirmResetPasswordDialogProps) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/40 backdrop-blur-sm">
      <div className="bg-card border border-border rounded-2xl shadow-2xl p-6 max-w-sm w-full mx-4">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-red-50 flex items-center justify-center shrink-0">
            <Key className="w-5 h-5 text-red-500" />
          </div>
          <div>
            <h3 className="font-semibold text-foreground">Reset Password?</h3>
            <p className="text-sm text-muted-foreground">This will generate a new password.</p>
          </div>
        </div>
        <p className="text-sm text-foreground mb-6">
          Are you sure you want to reset the password for <span className="font-medium">{employee.firstName} {employee.lastName}</span>?
          A new temporary password will be sent to their email.
        </p>
        <div className="flex gap-3">
          <Button variant="outline" className="flex-1 border-border text-foreground hover:bg-secondary" onClick={onCancel} disabled={isResetting}>Cancel</Button>
          <Button className="flex-1 bg-red-600 hover:bg-red-700 text-white" onClick={onConfirm} disabled={isResetting}>
            {isResetting ? 'Resetting...' : 'Reset Password'}
          </Button>
        </div>
      </div>
    </div>
  )
}
