import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Convert a dateStr like "2026-03-05" (PHT) to UTC Date range [start, end] */
function phtDateToUTCRange(dateStr: string): { start: Date; end: Date } {
    // PHT midnight = UTC-8h of that day  →  UTC 16:00 of the PREVIOUS day
    const start = new Date(`${dateStr}T00:00:00+08:00`);
    const end = new Date(`${dateStr}T23:59:59.999+08:00`);
    return { start, end };
}

/** Derive on-time/late status from a UTC check-in timestamp */
function deriveStatus(checkInUTC: Date): 'on-time' | 'late' {
    const phtHour = new Date(checkInUTC.getTime() + 8 * 3600_000).getUTCHours();
    const phtMinute = new Date(checkInUTC.getTime() + 8 * 3600_000).getUTCMinutes();
    return phtHour > 8 || (phtHour === 8 && phtMinute > 0) ? 'late' : 'on-time';
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface LogEntry {
    id: string;
    type: 'timekeeping' | 'system';
    timestamp: string;   // ISO string (UTC)
    employeeName: string;
    employeeId: number;
    action: string;
    details: string;
    source: string;
    status?: string;
}

// ── Controller ────────────────────────────────────────────────────────────────

/**
 * GET /api/logs
 * Query params:
 *   startDate  - YYYY-MM-DD (PHT)
 *   endDate    - YYYY-MM-DD (PHT)
 *   type       - 'all' | 'timekeeping' | 'system'   (will be expanded later, but keep these for now to not break existing frontend)
 *   page       - number (default: 1)
 *   limit      - number (default: 30)
 */
export const getLogs = async (req: Request, res: Response) => {
    try {
        const {
            startDate,
            endDate,
            type = 'all',
            page = '1',
            limit = '30',
        } = req.query as Record<string, string>;

        const pageNum = Math.max(1, parseInt(page));
        const limitNum = Math.min(200, Math.max(1, parseInt(limit)));

        // Build UTC date boundaries from PHT dates
        const startUTC = startDate
            ? phtDateToUTCRange(startDate).start
            : new Date('2000-01-01');
        const endUTC = endDate
            ? phtDateToUTCRange(endDate).end
            : new Date();

        // 1. Build the where clause
        const baseWhere: any = {
            timestamp: { gte: startUTC, lte: endUTC },
        };

        const listWhere: any = { ...baseWhere };
        if (type === 'timekeeping') {
            listWhere.entityType = 'Attendance';
        } else if (type === 'system') {
            listWhere.entityType = 'System';
        } else if (type === 'device') {
            listWhere.entityType = 'Device';
        }

        // 2. Fetch the paginated logs and counts concurrently
        const [total, timekeepingCount, systemCount, deviceCount, rawLogs] = await Promise.all([
            prisma.auditLog.count({ where: listWhere }),
            prisma.auditLog.count({ where: { ...baseWhere, entityType: 'Attendance' } }),
            prisma.auditLog.count({ where: { ...baseWhere, entityType: 'System' } }),
            prisma.auditLog.count({ where: { ...baseWhere, entityType: 'Device' } }),
            prisma.auditLog.findMany({
                where: listWhere,
                include: {
                    performer: {
                        select: {
                            id: true,
                            firstName: true,
                            lastName: true,
                            department: true,
                            role: true,
                        }
                    }
                },
                orderBy: { timestamp: 'desc' },
                skip: (pageNum - 1) * limitNum,
                take: limitNum,
            })
        ]);

        // 3. Map to the expected LogEntry format for the frontend
        // We will update the frontend later to accept the raw AuditLog format,
        // but to keep things working right now we map it to the old LogEntry structure.
        const mappedLogs = rawLogs.map((log: any) => {
            const empName = log.performer ? `${log.performer.firstName} ${log.performer.lastName}`.trim() : 'System';
            const deptName = log.performer?.department || 'System';

            let mappedType = 'system';
            if (log.entityType === 'Attendance') mappedType = 'timekeeping';
            else if (log.entityType === 'Device') mappedType = 'device';

            return {
                id: log.id.toString(),
                type: mappedType,
                timestamp: log.timestamp.toISOString(),
                employeeName: empName,
                employeeId: log.performedBy || 0,
                employeeRole: log.performer?.role || 'SYSTEM',
                action: log.action,
                details: log.details || `${log.action} on ${log.entityType}`,
                source: log.source,
                level: log.level,
                metadata: log.metadata
            };
        });

        return res.json({
            success: true,
            data: mappedLogs,
            meta: {
                total,
                page: pageNum,
                limit: limitNum,
                totalPages: Math.ceil(total / limitNum),
                counts: {
                    timekeeping: timekeepingCount,
                    system: systemCount,
                    device: deviceCount
                }
            },
        });

    } catch (error: any) {
        console.error('[Logs] Error fetching logs:', error);
        return res.status(500).json({ success: false, message: 'Failed to fetch logs', error: error.message });
    }
};
