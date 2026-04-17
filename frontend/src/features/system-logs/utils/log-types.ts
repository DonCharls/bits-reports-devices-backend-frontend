import React from 'react'

export interface LogEntry {
    id: string
    type: 'timekeeping' | 'system'
    category: string
    timestamp: string
    employeeName: string
    employeeId: number
    action: string
    details: string
    source: string
    status?: string
    level?: 'INFO' | 'WARN' | 'ERROR'
    employeeRole?: string
    metadata?: any
    correlationId?: string
}

export interface LogMeta {
    total: number
    page: number
    limit: number
    totalPages: number
    counts: {
        all: number
        auth: number
        attendance: number
        device: number
        employee: number
        config: number
        system: number
        timekeeping: number
    }
}

export type CategoryKey = 'all' | 'attendance' | 'auth' | 'device' | 'employee' | 'config' | 'system'
export type LevelKey = 'all' | 'INFO' | 'WARN' | 'ERROR'

export interface CategoryTabConfig {
    key: CategoryKey
    label: string
    icon: React.ElementType
    color: string
}
