import React from 'react';
import { ReportRow, AttendanceRecord } from '@/types/reports';
import { useEmployeeModalData } from '../hooks/useEmployeeModalData';
import { HRTimelineView } from './HRTimelineView';
import { AdminDetailView } from './AdminDetailView';

interface EmployeeModalProps {
  variant?: 'admin' | 'hr';
  exportSource?: 'admin-panel' | 'hr-panel';
  employee: ReportRow;
  records: AttendanceRecord[];
  startDate: string;
  endDate: string;
  onClose: () => void;
  onExport: (employee: ReportRow, records: AttendanceRecord[], expSrc: 'admin-panel' | 'hr-panel') => void;
}

export const EmployeeModal: React.FC<EmployeeModalProps> = ({
  variant = 'admin',
  exportSource = 'admin-panel',
  employee,
  records,
  startDate,
  endDate,
  onClose,
  onExport,
}) => {
  const {
    attendanceRate,
    hrTableRows,
    sortedData,
    sortKeyStr,
    sortOrder,
    handleSort,
    logSearchDate,
    setLogSearchDate,
    logDateRef,
  } = useEmployeeModalData(employee, records, startDate, endDate);

  if (variant === 'hr') {
    return (
      <HRTimelineView
        employee={employee}
        records={records}
        exportSource={exportSource}
        hrTableRows={hrTableRows}
        logSearchDate={logSearchDate}
        logDateRef={logDateRef}
        onLogSearchDateChange={setLogSearchDate}
        onClose={onClose}
        onExport={onExport}
      />
    );
  }

  return (
    <AdminDetailView
      employee={employee}
      records={records}
      startDate={startDate}
      endDate={endDate}
      exportSource={exportSource}
      attendanceRate={attendanceRate}
      sortedData={sortedData}
      sortKeyStr={sortKeyStr}
      sortOrder={sortOrder}
      handleSort={handleSort}
      onClose={onClose}
      onExport={onExport}
    />
  );
};
