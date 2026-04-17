import { apiFetch, Employee, Department, Branch, Role, EmploymentStatus, AttendanceRecord, User, PaginationMeta } from './client';
import { GetAttendanceResponse } from './attendance.api';

// ─── Employee Self-Service ───────────────────────────────────────────────────

export const employeeSelfApi = {
  getAttendance(startDate?: string, endDate?: string) {
    const query = new URLSearchParams()
    if (startDate) query.set('startDate', startDate)
    if (endDate) query.set('endDate', endDate)
    const qs = query.toString()
    return apiFetch<GetAttendanceResponse>(`/api/me/attendance${qs ? `?${qs}` : ''}`)
  },

  getShift() {
    return apiFetch<{ success: boolean; shift: any }>('/api/me/shift')
  },

  getProfile() {
    return apiFetch<{ success: boolean; profile: Employee }>('/api/me/profile')
  },

  changePassword(currentPassword: string, newPassword: string) {
    return apiFetch<{ success: boolean; message: string }>(
      '/api/me/password',
      { method: 'PUT', body: JSON.stringify({ currentPassword, newPassword }) }
    )
  },
}