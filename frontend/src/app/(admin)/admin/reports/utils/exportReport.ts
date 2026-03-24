import * as XLSX from 'xlsx';
import { ReportRow, AttendanceRecord } from '../types';
import {
  formatDateShort,
  formatShiftTime,
  formatLateHrs,
  formatHrsMins,
  getRecordStatusFromBackend,
} from './formatters';

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

const DAYS = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

const fmtFullDate = (d: Date) =>
  `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;

export const handleExport = (
  filteredData: ReportRow[],
  startDate: string,
  endDate: string
) => {
  const allRows: (string | number)[][] = [];
  const s = new Date(startDate + 'T00:00:00');
  const e = new Date(endDate + 'T00:00:00');

  allRows.push(['Period', `${fmtFullDate(s)} to ${fmtFullDate(e)}`]);
  allRows.push(['Total Employees', filteredData.length]);
  allRows.push([]);

  // Removed Leave and Absents, combined Late
  allRows.push([
    'Employee',
    'Shift',
    'Late (Duration)',
    'Overtime',
    'Undertime',
    'Total (Hrs)',
  ]);

  filteredData.forEach((e) => {
    const shiftLabel = e.shift
      ? `${e.shift.name} (${formatShiftTime(
          e.shift.startTime
        )}–${formatShiftTime(e.shift.endTime)})`
      : 'No Shift';
    allRows.push([
      e.name,
      shiftLabel,
      formatLateHrs(e.lateMinutes),
      e.overtime > 0 ? formatHrsMins(e.overtime) : '—', // Removed + sign
      e.undertime > 0 ? formatHrsMins(e.undertime) : '—', // Removed - sign
      e.totalHours.toFixed(2),
    ]);
  });

  const worksheet = XLSX.utils.aoa_to_sheet(allRows);
  worksheet['!cols'] = [
    { wch: 25 },
    { wch: 25 },
    { wch: 15 },
    { wch: 12 },
    { wch: 12 },
    { wch: 12 },
  ];
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Report');
  XLSX.writeFile(
    workbook,
    `Attendance_Report_${formatDateShort(startDate)}_${formatDateShort(
      endDate
    )}.xlsx`
  );
};

export const handleExportIndividual = (
  emp: ReportRow,
  startDate: string,
  endDate: string,
  records: AttendanceRecord[]
) => {
  const allRows: (string | number)[][] = [];
  allRows.push(['Employee', emp.name, '', 'Branch', emp.branch]);
  allRows.push(['Department', emp.department]);
  allRows.push([
    'Shift',
    emp.shift
      ? `${emp.shift.name} · ${formatShiftTime(
          emp.shift.startTime
        )}–${formatShiftTime(emp.shift.endTime)}`
      : 'No shift assigned',
  ]);
  allRows.push([]);

  allRows.push([
    'RATE',
    'PRESENT',
    'LATE DAYS',
    'LATE TOTAL',
    'TOTAL HOURS',
  ]); // Removed ABSENT
  const rate =
    emp.totalDays > 0 ? Math.round((emp.present / emp.totalDays) * 100) : 0;
  allRows.push([
    `${rate}%`,
    emp.present,
    emp.late,
    formatLateHrs(emp.lateMinutes),
    emp.totalHours.toFixed(2),
  ]);
  allRows.push([]);

  const s = new Date(startDate + 'T00:00:00');
  const e = new Date(endDate + 'T00:00:00');
  allRows.push(['Period', `${fmtFullDate(s)} — ${fmtFullDate(e)}`]);
  allRows.push([]);

  allRows.push([
    'Date',
    'Day',
    'Check In',
    'Check Out',
    'Hours',
    'Late',
    'OT',
    'UT',
    'Status',
  ]);
  records.forEach((r) => {
    const checkIn = new Date(r.checkInTime);
    const checkOut = r.checkOutTime ? new Date(r.checkOutTime) : null;
    const hoursWorked = r.totalHours ? r.totalHours.toFixed(2) : '—'; // Use backend totalHours strictly
    const statusLabel = getRecordStatusFromBackend(r);
    const lateMins = r.lateMinutes ?? 0;
    allRows.push([
      fmtFullDate(new Date(r.checkInTime)),
      DAYS[new Date(r.checkInTime).getDay()],
      checkIn.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
      }),
      checkOut
        ? checkOut.toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit',
          })
        : '—',
      hoursWorked,
      lateMins > 0 ? formatLateHrs(lateMins) : '—',
      r.overtimeMinutes && r.overtimeMinutes > 0 ? formatHrsMins(r.overtimeMinutes / 60) : '—',
      r.undertimeMinutes && r.undertimeMinutes > 0 ? formatHrsMins(r.undertimeMinutes / 60) : '—',
      statusLabel === 'anomaly'
        ? 'ANOMALY – Out of Shift'
        : statusLabel === 'late'
        ? 'Late'
        : 'On Time',
    ]);
  });

  allRows.push([]);
  allRows.push([
    `${records.length} record${records.length !== 1 ? 's' : ''} · ${
      emp.totalDays
    } working days`,
  ]);

  const worksheet = XLSX.utils.aoa_to_sheet(allRows);
  worksheet['!cols'] = [
    { wch: 18 },
    { wch: 15 },
    { wch: 12 },
    { wch: 12 },
    { wch: 12 },
    { wch: 12 },
    { wch: 10 },
    { wch: 10 },
    { wch: 22 },
  ];
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Attendance');
  XLSX.writeFile(
    workbook,
    `Report_${emp.name.replace(/\s+/g, '_')}_${startDate}_to_${endDate}.xlsx`
  );
};
