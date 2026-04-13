'use client';

import AttendanceDashboard from '@/features/attendance/components/AttendanceDashboard';

export default function AdminAttendancePage() {
  return (
    <div className="w-full">
      <AttendanceDashboard role="admin" />
    </div>
  );
}