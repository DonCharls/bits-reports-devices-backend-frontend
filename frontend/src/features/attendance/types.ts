export interface AttendanceRecord {
  id: number | string;
  employeeId: number;
  employeeName: string;
  department: string;
  branchName: string;
  date: string;
  checkIn: string;
  checkOut: string;
  status: string;
  notes?: string;
  lateMinutes: number;
  totalHours: number;
  overtimeMinutes: number;
  undertimeMinutes: number;
  shiftCode: string | null;
  isNightShift: boolean;
  isAnomaly?: boolean;
  isEarlyOut?: boolean;
  isShiftActive?: boolean;
  gracePeriodApplied?: boolean;
  displayStatus?: string;
  checkInDevice?: string | null;
  checkOutDevice?: string | null;
  checkoutSource?: string | null;
}

export interface AttendanceStats {
  totalEmployees: number;
  present: number;
  late: number;
  absent: number;
  onLeave: number;
  incomplete: number;
}
