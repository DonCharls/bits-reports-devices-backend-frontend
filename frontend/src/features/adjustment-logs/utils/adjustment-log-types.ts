export interface AuditLog {
  id: number;
  field: string;
  oldValue: string | null;
  newValue: string | null;
  reason: string | null;
  createdAt: string;
  attendance: {
    employee: {
      firstName: string;
      lastName: string;
      branch: string | null;
      role: string;
    };
  };
  adjustedBy: {
    firstName: string;
    lastName: string;
    role: string;
  };
}

export interface GroupedAuditLog {
    key: string;
    logs: AuditLog[];
    createdAt: string;
    adjusterName: string;
    employeeName: string;
    branch: string;
    reason: string;
    first: AuditLog;
}

export const fieldLabels: Record<string, string> = {
  checkInTime: 'Time-In',
  checkOutTime: 'Time-Out',
  status: 'Status',
};
