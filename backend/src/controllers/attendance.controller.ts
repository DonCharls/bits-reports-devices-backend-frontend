import { Request, Response } from 'express';
import { syncZkData, addUserToDevice } from '../services/zkServices';
import {
    getAttendanceRecords,
    getTodayAttendance,
    getEmployeeAttendanceHistory
} from '../services/attendance.service';
import { prisma } from '../lib/prisma';
import attendanceEmitter from '../lib/attendanceEmitter';


export const syncAttendance = async (req: Request, res: Response) => {
    try {
        console.log('Starting manual sync...');
        const result = await syncZkData();
        res.status(200).json(result);
    } catch (error: any) {
        if (error?.code === 'P2002') {
            res.status(409).json({
                success: false,
                message: 'Attendance record already exists for this employee today.'
            });
            return;
        }
        console.error('Sync failed:', error);
        res.status(500).json({
            success: false,
            message: 'An unexpected error occurred. Please try again.'
        });
    }
};

export const addUser = async (req: Request, res: Response) => {
    try {
        const { userId, name } = req.body;

        if (!userId || !name) {
            res.status(400).json({ success: false, message: 'userId and name are required' });
            return;
        }

        console.log(`Request to add employee: ${userId} - ${name}`);
        const result = await addUserToDevice(parseInt(userId), name);
        res.status(200).json(result);

    } catch (error: any) {
        if (error?.code === 'P2002') {
            res.status(409).json({
                success: false,
                message: 'Attendance record already exists for this employee today.'
            });
            return;
        }
        console.error('Add Employee failed:', error);
        res.status(500).json({
            success: false,
            message: 'An unexpected error occurred. Please try again.'
        });
    }
};

/**
 * Get attendance records with optional filters
 * Query params: startDate, endDate, employeeId, status
 */
export const getAttendance = async (req: Request, res: Response) => {
    try {
        const { startDate, endDate, employeeId, status, page = 1, limit = 10, branchName, departmentId, departmentName } = req.query;

        const filters: any = {};

        // Parse dates using PHT timezone (UTC+8) to match how records are stored.
        // Records are stored with date = midnight PHT (setHours(0,0,0,0) on the server).
        // Using +08:00 offset ensures the filter covers the correct PHT calendar day.
        if (startDate) {
            filters.startDate = new Date(`${String(startDate)}T00:00:00+08:00`);
        }

        if (endDate) {
            filters.endDate = new Date(`${String(endDate)}T23:59:59+08:00`);
        }
        if (employeeId) filters.employeeId = parseInt(String(employeeId));
        if (status) filters.status = String(status);
        if (branchName) filters.branch = String(branchName);
        if (departmentId) filters.departmentId = parseInt(String(departmentId));
        if (departmentName) filters.departmentName = String(departmentName);

        const pageNum = parseInt(String(page));
        const limitNum = parseInt(String(limit));

        const { data, total } = await getAttendanceRecords(filters, pageNum, limitNum);

        res.json({
            success: true,
            data,
            meta: {
                total,
                page: pageNum,
                limit: limitNum,
                totalPages: Math.ceil(total / limitNum)
            }
        });
    } catch (error: any) {
        if (error?.code === 'P2002') {
            res.status(409).json({
                success: false,
                message: 'Attendance record already exists for this employee today.'
            });
            return;
        }
        console.error('Get Attendance Failed:', error);
        res.status(500).json({
            success: false,
            message: 'An unexpected error occurred. Please try again.'
        });
    }
};

/**
 * Get today's attendance
 */
export const getToday = async (req: Request, res: Response) => {
    try {
        const records = await getTodayAttendance();

        res.json({
            success: true,
            count: records.length,
            data: records
        });
    } catch (error: any) {
        if (error?.code === 'P2002') {
            res.status(409).json({
                success: false,
                message: 'Attendance record already exists for this employee today.'
            });
            return;
        }
        console.error('Get Today Failed:', error);
        res.status(500).json({
            success: false,
            message: 'An unexpected error occurred. Please try again.'
        });
    }
};

/**
 * Get attendance history for a specific employee
 */
export const getEmployeeHistory = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { startDate, endDate } = req.query;

        const employeeId = parseInt(Array.isArray(id) ? id[0] : id);

        if (isNaN(employeeId)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid employee ID'
            });
        }

        const records = await getEmployeeAttendanceHistory(
            employeeId,
            startDate ? new Date(String(startDate)) : undefined,
            endDate ? new Date(String(endDate)) : undefined
        );

        res.json({
            success: true,
            count: records.length,
            data: records
        });
    } catch (error: any) {
        if (error?.code === 'P2002') {
            res.status(409).json({
                success: false,
                message: 'Attendance record already exists for this employee today.'
            });
            return;
        }
        console.error('Get Employee History Failed:', error);
        res.status(500).json({
            success: false,
            message: 'An unexpected error occurred. Please try again.'
        });
    }
};

/**
 * Manually update an attendance record (HR correction)
 * Body: { checkInTime?, checkOutTime?, status?, reason? }
 * Creates AuditLog entries for each changed field.
 */
export const updateAttendance = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const recordId = parseInt(String(id));

        if (isNaN(recordId)) {
            res.status(400).json({ success: false, message: 'Invalid attendance record ID' });
            return;
        }

        const { checkInTime, checkOutTime, status, reason } = req.body;
        const adjustedById = req.user?.employeeId;

        if (!adjustedById) {
            res.status(401).json({ success: false, message: 'Not authenticated' });
            return;
        }

        const existing = await prisma.attendance.findUnique({
            where: { id: recordId },
            include: { employee: { include: { Shift: true } } }
        });
        if (!existing) {
            res.status(404).json({ success: false, message: 'Attendance record not found' });
            return;
        }

        const updateData: any = {};
        const auditEntries: { field: string; oldValue: string | null; newValue: string | null }[] = [];

        // Track checkInTime changes
        if (checkInTime) {
            const oldVal = existing.checkInTime ? existing.checkInTime.toISOString() : null;
            const newDate = new Date(checkInTime);
            updateData.checkInTime = newDate;
            updateData.checkin_updated = new Date();
            auditEntries.push({
                field: 'checkInTime',
                oldValue: oldVal,
                newValue: newDate.toISOString(),
            });

            // Auto-recalculate status based on new checkInTime vs shift
            const shift = existing.employee?.Shift;
            if (shift) {
                const [startH, startM] = shift.startTime.split(':').map(Number);
                const grace = shift.graceMinutes || 0;
                // Convert checkIn to PHT for comparison
                const checkInPHT = new Date(newDate.getTime() + 8 * 60 * 60 * 1000);
                const checkInMinutes = checkInPHT.getUTCHours() * 60 + checkInPHT.getUTCMinutes();
                const shiftStartMinutes = startH * 60 + startM + grace;

                if (checkInMinutes <= shiftStartMinutes) {
                    updateData.status = 'present';
                } else {
                    updateData.status = 'late';
                }

                // If status changed, log it
                if (updateData.status !== existing.status) {
                    auditEntries.push({
                        field: 'status',
                        oldValue: existing.status,
                        newValue: updateData.status,
                    });
                }
            }
        }

        // Track checkOutTime changes
        if (checkOutTime !== undefined) {
            const oldVal = existing.checkOutTime ? existing.checkOutTime.toISOString() : null;
            const newVal = checkOutTime ? new Date(checkOutTime) : null;
            updateData.checkOutTime = newVal;
            updateData.checkout_updated = new Date();
            auditEntries.push({
                field: 'checkOutTime',
                oldValue: oldVal,
                newValue: newVal ? newVal.toISOString() : null,
            });
        }

        // Track manual status override
        if (status && !updateData.status) {
            auditEntries.push({
                field: 'status',
                oldValue: existing.status,
                newValue: status.toLowerCase(),
            });
            updateData.status = status.toLowerCase();
        }

        // Apply the update
        const updated = await prisma.attendance.update({
            where: { id: recordId },
            data: updateData
        });

        // Create audit log entries
        if (auditEntries.length > 0) {
            await prisma.attendanceAuditLog.createMany({
                data: auditEntries.map(entry => ({
                    attendanceId: recordId,
                    adjustedById,
                    field: entry.field,
                    oldValue: entry.oldValue,
                    newValue: entry.newValue,
                    reason: reason || null,
                })),
            });
        }

        // Emit SSE event so dashboards update in real-time
        attendanceEmitter.emit('new-record', {
            type: 'update',
            record: updated,
        });

        res.json({
            success: true,
            message: 'Attendance record updated successfully',
            data: updated,
            auditEntries: auditEntries.length,
        });
    } catch (error: any) {
        console.error('Update Attendance Failed:', error);
        res.status(500).json({
            success: false,
            message: 'An unexpected error occurred. Please try again.'
        });
    }
};

/**
 * GET /api/attendance/audit-logs
 * Returns audit log entries with optional filters: date, search, branch
 */
export const getAttendanceAuditLogs = async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 15;
    const search = (req.query.search as string) || '';
    const branch = (req.query.branch as string) || '';
    const date = (req.query.date as string) || '';

    const skip = (page - 1) * limit;

    const where: any = {};

    if (branch) {
      where.attendance = {
        employee: { branch }
      };
    }

    if (date) {
      const start = new Date(date);
      start.setUTCHours(0, 0, 0, 0);
      const end = new Date(date);
      end.setUTCHours(23, 59, 59, 999);
      where.createdAt = { gte: start, lte: end };
    }

    if (search) {
      where.OR = [
        {
          attendance: {
            employee: {
              OR: [
                { firstName: { contains: search, mode: 'insensitive' } },
                { lastName: { contains: search, mode: 'insensitive' } },
              ]
            }
          }
        },
        {
          adjustedBy: {
            OR: [
              { firstName: { contains: search, mode: 'insensitive' } },
              { lastName: { contains: search, mode: 'insensitive' } },
            ]
          }
        }
      ];
    }

    const [total, logs] = await Promise.all([
      prisma.attendanceAuditLog.count({ where }),
      prisma.attendanceAuditLog.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          field: true,
          oldValue: true,
          newValue: true,
          reason: true,
          createdAt: true,
          attendance: {
            select: {
              employee: {
                select: {
                  firstName: true,
                  lastName: true,
                  branch: true,
                  role: true,
                }
              }
            }
          },
          adjustedBy: {
            select: {
              firstName: true,
              lastName: true,
              role: true,
            }
          }
        }
      })
    ]);

    return res.json({
      success: true,
      data: logs,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      }
    });
  } catch (error: any) {
    console.error('Error fetching attendance audit logs:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch audit logs',
    });
  }
};

/**
 * GET /api/attendance/stream
 *
 * Server-Sent Events endpoint. Keeps the HTTP connection open and pushes
 * new attendance records to the client as they are processed by syncZkData().
 *
 * WHY SSE instead of WebSockets: SSE is unidirectional (server → client),
 * which is exactly what attendance monitoring needs. It works over plain HTTP,
 * requires no additional library on either end.
 *
 * Authentication: The authenticate middleware is applied at the router level
 * for all /api/attendance routes, so this endpoint requires a valid JWT
 * cookie just like every other attendance route.
 */
export const streamAttendance = async (req: Request, res: Response): Promise<void> => {
    // ── Set SSE headers ───────────────────────────────────────────────────
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    // Disable Nginx buffering if a reverse proxy is ever added in front
    res.setHeader('X-Accel-Buffering', 'no');

    // Flush headers immediately so the browser knows the stream has started.
    res.flushHeaders();

    // ── Send an initial "connected" event ─────────────────────────────────
    res.write(`event: connected\ndata: ${JSON.stringify({ ts: Date.now() })}\n\n`);

    // ── Heartbeat ─────────────────────────────────────────────────────────
    // SSE comments (lines starting with ':') keep the TCP connection alive
    // through proxies that close idle connections after ~60s.
    const heartbeatInterval = setInterval(() => {
        res.write(': heartbeat\n\n');
    }, 25_000);

    // ── Event listener ────────────────────────────────────────────────────
    // Listen for 'new-record' events from processAttendanceLogs() and push
    // them to this client.
    // The `any` on payload is unavoidable — the emitter carries untyped data
    // across module boundaries and typing it would require a shared interface
    // that adds coupling without safety (runtime JSON.parse is untyped anyway).
    const onNewRecord = (payload: { type: string; record: any }) => {
        res.write(`event: attendance\ndata: ${JSON.stringify(payload)}\n\n`);
    };

    attendanceEmitter.on('new-record', onNewRecord);

    // ── Cleanup on client disconnect ──────────────────────────────────────
    req.on('close', () => {
        clearInterval(heartbeatInterval);
        attendanceEmitter.off('new-record', onNewRecord);
        console.log(`[SSE] Client disconnected from attendance stream`);
    });

    console.log(`[SSE] Client connected to attendance stream`);
};
