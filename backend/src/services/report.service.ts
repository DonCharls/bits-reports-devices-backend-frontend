import { prisma } from '../lib/prisma';

/**
 * Report Service
 * Generates attendance summary statistics for all active employees
 * over a given date range. Offloads calculations that were previously
 * done on the frontend.
 */

export type ReportSummaryRow = {
  id: number;
  name: string;
  department: string;
  branch: string;
  totalDays: number;
  present: number;
  leave: number;
  late: number;
  lateMinutes: number;
  absent: number;
  overtime: number;
  undertime: number;
  totalHours: number;
  shift: {
    id: number;
    name: string;
    startTime: string;
    endTime: string;
    graceMinutes: number;
  } | null;
};

/**
 * Count working weekdays (Mon–Fri) between two dates inclusive.
 */
const countWorkingDays = (start: Date, end: Date): number => {
  let count = 0;
  const cur = new Date(start);
  while (cur <= end) {
    const day = cur.getDay();
    if (day !== 0 && day !== 6) count++;
    cur.setDate(cur.getDate() + 1);
  }
  return count;
};

/**
 * Build the complete attendance summary report for all active employees.
 *
 * @param startDate  First day of the report period (PHP timezone midnight, UTC)
 * @param endDate    Last day of the report period  (PHP timezone end-of-day, UTC)
 * @returns          { summary, rawRecords }
 */
export const getAttendanceSummary = async (startDate: Date, endDate: Date) => {
  // 1. Fetch all active non-admin employees with their shift and department
  const employees = await prisma.employee.findMany({
    where: {
      employmentStatus: 'ACTIVE',
      role: 'USER',
    },
    include: {
      Department: { select: { name: true } },
      Shift: true,
    },
    orderBy: { zkId: 'asc' },
  });

  // 2. Fetch all attendance records in the date range (include shift via employee)
  const records = await prisma.attendance.findMany({
    where: {
      date: { gte: startDate, lte: endDate },
    },
    include: {
      employee: {
        include: {
          Department: { select: { name: true } },
          Shift: true,
        },
      },
    },
    orderBy: [{ date: 'desc' }, { checkInTime: 'desc' }],
  });

  // 3. Count total working days in range
  // startDate is T00:00:00+08:00 so add 8 h to get "day start" in PHT for weekday maths
  const phtStart = new Date(startDate.getTime() + 8 * 60 * 60 * 1000);
  const phtEnd = new Date(endDate.getTime()); // endDate already covers end of day
  // Normalise to same-day boundary for the counter
  const rangeStart = new Date(phtStart);
  rangeStart.setUTCHours(0, 0, 0, 0);
  const rangeEnd = new Date(phtEnd);
  rangeEnd.setUTCHours(0, 0, 0, 0);
  const totalWorkingDays = countWorkingDays(rangeStart, rangeEnd);

  // 4. Group records by employee
  const recordsByEmployee = new Map<number, typeof records>();
  records.forEach((rec) => {
    const existing = recordsByEmployee.get(rec.employeeId) ?? [];
    existing.push(rec);
    recordsByEmployee.set(rec.employeeId, existing);
  });

  // 5. Build summary rows
  const STANDARD_HOURS = 8;

  const summary: ReportSummaryRow[] = employees.map((emp) => {
    const empRecords = recordsByEmployee.get(emp.id) ?? [];
    const shift = (emp as any).Shift ?? null;

    let present = 0;
    let late = 0;
    let lateMinutes = 0;
    let totalHours = 0;
    let overtimeHours = 0;
    let undertimeHours = 0;

    empRecords.forEach((rec) => {
      present++;

      const checkIn = new Date(rec.checkInTime);

      // --- Late calculation (uses shift if available, else 08:00 default) ---
      let graceMins = 0;
      let shiftStartMs: number;

      if (shift) {
        const [h, m] = shift.startTime.split(':').map(Number);
        graceMins = shift.graceMinutes ?? 0;
        // shift start as UTC for that PHT date
        const dateMs = new Date(rec.date).getTime() + 8 * 60 * 60 * 1000;
        shiftStartMs = dateMs + (h * 60 + m) * 60 * 1000 - 8 * 60 * 60 * 1000;
      } else {
        // Default: 08:00 PHT
        const checkInPHT = new Date(checkIn.getTime() + 8 * 60 * 60 * 1000);
        shiftStartMs = new Date(checkInPHT).setUTCHours(8, 0, 0, 0) - 8 * 60 * 60 * 1000;
      }

      const thresholdMs = shiftStartMs + graceMins * 60 * 1000;
      const lateMs = checkIn.getTime() - thresholdMs;
      if (lateMs > 0) {
        late++;
        lateMinutes += Math.round(lateMs / 60000);
      }

      // --- Hours calculation ---
      if (rec.checkOutTime) {
        const checkOut = new Date(rec.checkOutTime);
        const hoursWorked = (checkOut.getTime() - checkIn.getTime()) / (1000 * 60 * 60);
        totalHours += hoursWorked;

        if (hoursWorked > STANDARD_HOURS) {
          overtimeHours += hoursWorked - STANDARD_HOURS;
        } else if (hoursWorked < STANDARD_HOURS) {
          undertimeHours += STANDARD_HOURS - hoursWorked;
        }
      }
    });

    const absent = Math.max(0, totalWorkingDays - present);

    return {
      id: emp.id,
      name: `${emp.firstName} ${emp.lastName}`,
      department: (emp as any).Department?.name || (emp as any).department || '-',
      branch: emp.branch || '-',
      totalDays: totalWorkingDays,
      present,
      leave: 0, // leave tracking not yet implemented
      late,
      lateMinutes,
      absent,
      overtime: parseFloat(overtimeHours.toFixed(1)),
      undertime: parseFloat(undertimeHours.toFixed(1)),
      totalHours: parseFloat(totalHours.toFixed(2)),
      shift: shift
        ? {
            id: shift.id,
            name: shift.name,
            startTime: shift.startTime,
            endTime: shift.endTime,
            graceMinutes: shift.graceMinutes ?? 0,
          }
        : null,
    };
  });

  return { summary, rawRecords: records };
};
