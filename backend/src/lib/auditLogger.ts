import { prisma } from './prisma';
import { AuditAction, AuditEntity, AuditCategory, AuditSource } from '../types/auditTypes';

export type LogLevel = 'INFO' | 'WARN' | 'ERROR';

export interface AuditLogPayload {
    action: string | AuditAction;
    entityType: string | AuditEntity;
    category?: string | AuditCategory;
    entityId?: number;
    performedBy?: number;
    source?: string | AuditSource;
    level?: LogLevel;
    details?: string;
    metadata?: Record<string, any>;
    correlationId?: string;
}

const ENTITY_TO_CATEGORY: Record<string, AuditCategory> = {
    'Account': 'auth',
    'User Account': 'auth',
    'Attendance': 'attendance',
    'Device': 'device',
    'Employee': 'employee',
    'Shift': 'config',
    'Department': 'config',
    'Branch': 'config',
    'System': 'system',
};

/**
 * Centralized Audit Logger Utility
 * Records system events, user actions, and errors to the database.
 * This function is fire-and-forget to prevent blocking main execution paths.
 */
export const audit = async (payload: AuditLogPayload): Promise<void> => {
    try {
        // 1. Derive category if not explicitly provided
        const category = payload.category
            || payload.metadata?.category
            || ENTITY_TO_CATEGORY[payload.entityType as string]
            || 'system';

        // 2. Clean metadata — remove redundant 'category' key
        let cleanMeta = payload.metadata
            ? JSON.parse(JSON.stringify(payload.metadata))
            : null;
        if (cleanMeta) {
            delete cleanMeta.category;
            // If deleting category leaves it completely empty, let's keep it null instead of {}
            if (Object.keys(cleanMeta).length === 0) {
                cleanMeta = null;
            }
        }

        await prisma.auditLog.create({
            data: {
                level: payload.level || 'INFO',
                action: payload.action,
                entityType: payload.entityType,
                entityId: payload.entityId,
                performedBy: payload.performedBy,
                source: payload.source || 'system',
                details: payload.details,
                metadata: cleanMeta,
                category,
                correlationId: payload.correlationId,
            }
        });
    } catch (error) {
        // We log to console rather than throwing to avoid breaking the application
        // if the audit log system encounters a transient DB issue
        console.error('[AuditLogger] Failed to write audit log:', error, payload);
    }
};
