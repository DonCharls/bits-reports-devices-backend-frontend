export interface GenerateReportRequest {
    startDate: string;
    endDate: string;
    departmentId?: number;
    branchId?: number;
    employeeId?: number;
}

export interface ReportQueryResult {
    summary: {
        totalEmployees: number;
        totalPresent: number;
        totalLate: number;
        totalAbsent: number;
        averageWorkingHours: number;
    };
    records: any[]; // Kept loose currently, to be bound alongside frontend interfaces
}
