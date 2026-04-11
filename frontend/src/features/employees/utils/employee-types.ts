// Shared types and utilities for employee features

export type Employee = {
  id: number
  zkId: number | null
  cardNumber: number | null
  employeeNumber: string | null
  firstName: string
  lastName: string
  middleName: string | null
  suffix: string | null
  email: string | null
  role: string
  department: string | null
  Department?: { name: string } | null
  departmentId?: number | null
  position: string | null
  branch: string | null
  contactNumber: string | null
  hireDate: string | null
  gender: string | null
  dateOfBirth: string | null
  employmentStatus: 'ACTIVE' | 'INACTIVE' | 'TERMINATED'
  shiftId?: number | null
  Shift?: { id: number; name: string; shiftCode: string; startTime: string; endTime: string } | null
  createdAt: string
  EmployeeDeviceEnrollment?: {
    enrolledAt: string
    device: {
      id: number
      name: string
      location: string | null
      isActive: boolean
    }
  }[]
}

export type ShiftOption = {
  id: number
  shiftCode: string
  name: string
  startTime: string
  endTime: string
}

export type ImportRow = {
  _rowNumber: number
  employeeNumber: string
  firstName: string
  lastName: string
  middleName?: string
  suffix?: string
  gender?: string
  dateOfBirth?: string
  email: string
  contactNumber: string
  department: string
  branch: string
  hireDate?: string
  shiftCode?: string
  shiftId?: number | null
  status: 'valid' | 'invalid'
  reason?: string
}

export type ImportResult = {
  row: number
  employeeNumber: string
  status: 'success' | 'failed'
  reason?: string
}

export const SUFFIX_OPTIONS = ['', 'Jr.', 'Sr.', 'II', 'III', 'IV', 'V'] as const;

export function formatFullName(firstName: string, middleName?: string | null, lastName?: string, suffix?: string | null) {
  const mi = middleName ? ` ${middleName[0]}.` : '';
  const sfx = suffix ? ` ${suffix}` : '';
  return `${firstName}${mi} ${lastName || ''}${sfx}`.trim();
}

export function formatTime(t: string) {
  if (!t) return '';
  const [h] = t.split(':');
  const hour = parseInt(h);
  const suffix = hour >= 12 ? 'PM' : 'AM';
  const display = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  return `${display}:${t.split(':')[1]} ${suffix}`;
}

export function formatPhoneNumber(value: string | null) {
  if (!value) return '';
  const digits = value.replace(/\D/g, '').slice(0, 11);
  if (digits.length <= 4) return digits;
  if (digits.length <= 7) return `${digits.slice(0, 4)} ${digits.slice(4)}`;
  return `${digits.slice(0, 4)} ${digits.slice(4, 7)} ${digits.slice(7)}`;
}
