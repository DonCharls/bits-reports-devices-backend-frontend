'use client'

import { EmployeeLayout } from '@/components/employee/employee-layout'

export default function EmployeeGroupLayout({ children }: { children: React.ReactNode }) {
    return <EmployeeLayout>{children}</EmployeeLayout>
}
