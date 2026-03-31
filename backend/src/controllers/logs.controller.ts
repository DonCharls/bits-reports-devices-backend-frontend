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

// ── Valid categories ──────────────────────────────────────────────────────────

const VALID_CATEGORIES = ['auth', 'attendance', 'device', 'employee', 'config', 'system'] as const;
type LogCategory = typeof VALID_CATEGORIES[number];

/**
 * Fallback: for older logs that don't have metadata.category,
 * infer the category from entityType and action.
 */
function inferCategory(entityType: string, action: string): LogCategory {
    const et = entityType?.toLowerCase() ?? '';
    const act = action?.toLowerCase() ?? '';

    if (['login', 'logout', 'failed_login'].includes(act)) return 'auth';
    if (et === 'account' || et === 'user account') return 'auth';
    if (et === 'attendance') return 'attendance';
    if (et === 'device') return 'device';
    if (et === 'employee') return 'employee';
    if (['shift', 'department', 'branch'].includes(et)) return 'config';
    if (et === 'system') return 'system';

    // Default fallback
    if (['check_in', 'check_out', 'auto_checkout', 'duplicate_punch', 'adjustment_submit', 'adjustment_approve', 'adjustment_reject'].includes(act)) return 'attendance';
    if (['device_connect', 'device_disconnect'].includes(act)) return 'device';
    return 'system';
}

// ── Controller ────────────────────────────────────────────────────────────────

/**
 * GET /api/logs
 * Query params:
 *   startDate  - YYYY-MM-DD (PHT)
 *   endDate    - YYYY-MM-DD (PHT)
 *   type       - 'all' | 'timekeeping' | 'system'  (legacy, kept for backward compat)
 *   category   - 'all' | 'auth' | 'attendance' | 'device' | 'employee' | 'config' | 'system'
 *   level      - 'all' | 'INFO' | 'WARN' | 'ERROR'
 *   page       - number (default: 1)
 *   limit      - number (default: 30)
 */
export const getLogs = async (req: Request, res: Response) => {
    try {
        const {
            startDate,
            endDate,
            type = 'all',
            category = 'all',
            level = 'all',
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

        // Level filter
        if (level && level !== 'all') {
            baseWhere.level = level;
        }

        // Category filter — uses Prisma's JSON path filtering on metadata.category
        // For categories, we filter by metadata.category using JSON path query.
        // We also need to handle legacy logs that don't have metadata.category
        // by falling back to entityType-based mapping.
        const categoryEntityTypeMap: Record<string, any> = {
            auth: { entityType: { in: ['Account', 'User Account'] } },
            attendance: { entityType: 'Attendance' },
            device: { entityType: 'Device' },
            employee: { entityType: 'Employee' },
            config: { entityType: { in: ['Shift', 'Department', 'Branch'] } },
            system: { entityType: 'System' },
        };

        const listWhere: any = { ...baseWhere };

        // New category-based filtering takes precedence over legacy type param
        if (category && category !== 'all' && VALID_CATEGORIES.includes(category as LogCategory)) {
            // Use metadata JSON path if supported, otherwise fall back to entityType mapping
            const mapping = categoryEntityTypeMap[category];
            if (mapping) {
                Object.assign(listWhere, mapping);
            }
        } else if (type === 'timekeeping') {
            // Legacy backward compat
            listWhere.entityType = 'Attendance';
        } else if (type === 'system') {
            listWhere.entityType = { not: 'Attendance' };
        }

        // 2. Fetch the paginated logs and category counts concurrently
        const countWhereForCategory = (cat: string) => {
            const w: any = { ...baseWhere };
            const mapping = categoryEntityTypeMap[cat];
            if (mapping) Object.assign(w, mapping);
            return w;
        };

        const [total, rawLogs, ...categoryCounts] = await Promise.all([
            prisma.auditLog.count({ where: listWhere }),
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
            }),
            // Category counts (without level filter, to show totals in tabs)
            prisma.auditLog.count({ where: { timestamp: { gte: startUTC, lte: endUTC }, ...categoryEntityTypeMap.auth } }),
            prisma.auditLog.count({ where: { timestamp: { gte: startUTC, lte: endUTC }, ...categoryEntityTypeMap.attendance } }),
            prisma.auditLog.count({ where: { timestamp: { gte: startUTC, lte: endUTC }, ...categoryEntityTypeMap.device } }),
            prisma.auditLog.count({ where: { timestamp: { gte: startUTC, lte: endUTC }, ...categoryEntityTypeMap.employee } }),
            prisma.auditLog.count({ where: { timestamp: { gte: startUTC, lte: endUTC }, ...categoryEntityTypeMap.config } }),
            prisma.auditLog.count({ where: { timestamp: { gte: startUTC, lte: endUTC }, ...categoryEntityTypeMap.system } }),
        ]);

        const allCount = categoryCounts.reduce((a, b) => a + b, 0);

        // 3. Map to the expected format for the frontend
        const mappedLogs = rawLogs.map((log: any) => {
            const empName = log.performer ? `${log.performer.firstName} ${log.performer.lastName}`.trim() : 'System';
            const meta = (typeof log.metadata === 'object' && log.metadata !== null) ? log.metadata : {};
            const logCategory = (meta as any).category || inferCategory(log.entityType, log.action);

            return {
                id: log.id.toString(),
                type: log.entityType === 'Attendance' ? 'timekeeping' : 'system', // legacy compat
                category: logCategory,
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
                    all: allCount,
                    auth: categoryCounts[0],
                    attendance: categoryCounts[1],
                    device: categoryCounts[2],
                    employee: categoryCounts[3],
                    config: categoryCounts[4],
                    system: categoryCounts[5],
                    // Legacy compat
                    timekeeping: categoryCounts[1],
                }
            },
        });

    } catch (error: any) {
        console.error('[Logs] Error fetching logs:', error);
        return res.status(500).json({ success: false, message: 'Failed to fetch logs', error: error.message });
    }
};
