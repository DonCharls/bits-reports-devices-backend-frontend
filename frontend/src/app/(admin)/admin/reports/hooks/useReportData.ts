import { useState, useEffect } from 'react';
import { AttendanceRecord, ReportRow } from '../types';

/**
 * Counts the number of scheduled working days within a date range
 * based on the shift's workDays JSON configuration.
 * Caps at today's date — future dates are not counted.
 */
function countWorkingDays(
  rangeStart: string,
  rangeEnd: string,
  workDaysJson: string
): number {
  const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  let scheduledDays: string[];
  try {
    scheduledDays = typeof workDaysJson === 'string' 
      ? JSON.parse(workDaysJson) 
      : workDaysJson;
    
    if (!Array.isArray(scheduledDays)) {
      scheduledDays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
    }
  } catch {
    scheduledDays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
  }

  const start = new Date(rangeStart + 'T00:00:00');
  // Cap end date at today so future dates are never counted
  const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
  const cappedEnd = rangeEnd > todayStr ? todayStr : rangeEnd;
  const end = new Date(cappedEnd + 'T00:00:00');

  let count = 0;
  const cursor = new Date(start);
  while (cursor <= end) {
    const dayName = DAY_NAMES[cursor.getDay()];
    if (scheduledDays.includes(dayName)) {
      count++;
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return count;
}

export const useReportData = (startDate: string, endDate: string) => {
  const [reportData, setReportData] = useState<ReportRow[]>([]);
  const [allRecords, setAllRecords] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchReportData = async () => {
      setLoading(true);
      setError(null);
      try {
        const [empRes, attRes] = await Promise.all([
          fetch('/api/employees', { credentials: 'include' }),
          fetch(
            `/api/attendance?startDate=${startDate}&endDate=${endDate}&limit=10000`,
            { credentials: 'include' }
          ),
        ]);

        if (empRes.status === 401 || attRes.status === 401) {
          window.location.href = '/login';
          return;
        }

        const empData = await empRes.json();
        const attData = attRes.ok ? await attRes.json() : { success: false };

        if (!empData.success) {
          setError('Failed to fetch employee data. Please try again.');
          setLoading(false);
          return;
        }
        if (!attData.success) {
           setError('Failed to fetch attendance data. Please try again.');
           setLoading(false);
           return;
        }

        const emps: any[] = empData.employees || empData.data || [];
        const records: AttendanceRecord[] = attData.success
          ? attData.data || []
          : [];

        setAllRecords(records);

        const activeEmps = emps.filter(
          (e: any) => e.employmentStatus === 'ACTIVE' && e.role === 'USER'
        );
        const rowMap = new Map<number, ReportRow>();

        // Pre-initialize rows and compute totalDays from shift schedule
        activeEmps.forEach((e: any) => {
          const workDaysJson =
            e.Shift?.workDays ?? '["Mon","Tue","Wed","Thu","Fri"]';

          // Derive totalDays from the shift's workDays configuration
          const totalDays = countWorkingDays(startDate, endDate, workDaysJson);

          rowMap.set(e.id, {
            id: e.id,
            name: `${e.firstName} ${e.lastName}`.trim(),
            department: e.Department?.name || e.department || '—',
            branch: e.branch || '—',
            totalDays,
            present: 0,
            late: 0,
            lateMinutes: 0,
            overtime: 0,
            undertime: 0,
            totalHours: 0,
            hasAnomaly: false,
            shift: e.Shift
              ? {
                  id: e.Shift.id,
                  name: e.Shift.name,
                  startTime: e.Shift.startTime,
                  endTime: e.Shift.endTime,
                  graceMinutes: e.Shift.graceMinutes ?? 0,
                  breakMinutes: e.Shift.breakMinutes ?? 60,
                  workDays: e.Shift.workDays ?? '["Mon","Tue","Wed","Thu","Fri"]',
                  halfDays: e.Shift.halfDays ?? '[]',
                }
              : null,
          });
        });

        records.forEach((r) => {
          const row = rowMap.get(r.employeeId);
          if (!row) return;

          const lateMins = r.lateMinutes ?? 0;
          if (lateMins > 0) {
            row.late++;
            row.lateMinutes += lateMins;
          }
          // Increment present for any valid check-in
          row.present++;

          if (r.isAnomaly) {
            row.hasAnomaly = true;
          }

          row.totalHours += r.totalHours ?? 0;
          row.overtime += (r.overtimeMinutes ?? 0) / 60;
          row.undertime += (r.undertimeMinutes ?? 0) / 60;
        });

        setReportData(Array.from(rowMap.values()));
      } catch (err) {
        console.error('Error fetching report data:', err);
        setError('An unexpected error occurred while loading the report.');
      } finally {
        setLoading(false);
      }
    };

    fetchReportData();
  }, [startDate, endDate]);

  return { reportData, allRecords, loading, error };
};
