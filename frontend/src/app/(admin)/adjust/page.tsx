import { AdjustmentAuditLogsDashboard } from '@/features/adjustment-logs/components/AdjustmentAuditLogsDashboard'

export const metadata = {
  title: 'Adjustment Audit Logs - Admin Panel',
  description: 'Track manual biometric modifications and timekeeping overrides.',
}

export default function AdjustmentAuditLogsPage() {
  return <AdjustmentAuditLogsDashboard />
}
