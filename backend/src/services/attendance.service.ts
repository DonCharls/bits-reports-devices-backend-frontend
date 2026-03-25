import { prisma } from '../lib/prisma';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';
import attendanceEmitter from '../lib/attendanceEmitter';
import { audit } from '../lib/auditLogger';

/**
 * Attendance Service - Strategy C (Grace Period Toggle)
 * 
 * This service processes raw AttendanceLog records into clean Attendance check-in/check-out pairs.
 * 
 * Logic:
 * - First scan of the day → Create new Attendance record with checkInTime
 * - Second scan of the day → Update same record with checkOutTime
 * - Midnight cleanup → Mark incomplete records from previous days
 */

/**
 * Convert a UTC timestamp to its Philippine calendar date, stored as UTC.
 * e.g. 7 AM PHT Feb 28 (= 11 PM UTC Feb 27) → PHT midnight Feb 28 (= 4 PM UTC Feb 27)
 * This ensures scans between 12 AM–8 AM PHT are grouped under the correct PHT date.
 */
const toPHTDate = (utcDate: Date): Date => {
    // Shift to PHT (+8 hours)
    const pht = new Date(utcDate.getTime() + 8 * 60 * 60 * 1000);
    // Zero out time to get PHT midnight (still represented as UTC internally)
    pht.setUTCHours(0, 0, 0, 0);
    // Shift back to UTC: PHT midnight = UTC - 8 hours
    return new Date(pht.getTime() - 8 * 60 * 60 * 1000);
};

/** Get "today" in Philippine Time, returned as UTC equivalent of PHT midnight */
const getTodayPHT = (): Date => toPHTDate(new Date());

interface ProcessResult {
    success: boolean;
    processed: number;
    created: number;
    updated: number;
}

interface AttendanceFilters {
    startDate?: Date;
    endDate?: Date;
    employeeId?: number;
    status?: string;
    branch?: string;           // filter by employee.branch (string)
    departmentId?: number;    // filter by employee.departmentId (FK)
    departmentName?: string;  // filter by employee.department (string, fallback)
}

/**
 * Process unprocessed attendance logs into Attendance records
 * This implements the toggle logic: check-in → check-out
 */
export const processAttendanceLogs = async (): Promise<ProcessResult> => {
    try {
        // Only process logs from the last 2 days — records older than that are
        // already settled (check-in + check-out completed) and re-processing them
        // on every 30-second cron tick wastes DB I/O and can cause duplicates.
        const cutoff = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);

        // Get recent logs ordered by timestamp
        const logs = await prisma.attendanceLog.findMany({
            where: { timestamp: { gte: cutoff } },
            orderBy: { timestamp: 'asc' },
            include: { employee: { include: { Shift: true } } }
        });

        let created = 0;
        let updated = 0;

        for (const log of logs) {
            // Normalize to Philippine calendar date for consistent grouping
            const dateOnly = toPHTDate(log.timestamp);

            // Check if attendance record exists for this employee on this date
            const existingAttendance = await prisma.attendance.findUnique({
                where: {
                    employeeId_date: {
                        employeeId: log.employeeId,
                        date: dateOnly
                    }
                }
            });

            if (!existingAttendance) {
                // No record exists → This is a CHECK-IN
                // Determine if late using SHIFT-AWARE logic (not hardcoded 8 AM)
                const checkInPHT = new Date(log.timestamp.getTime() + 8 * 60 * 60 * 1000);
                const empShift = log.employee?.Shift;
                const shiftStartMins = empShift
                    ? Number(empShift.startTime.split(':')[0]) * 60 + Number(empShift.startTime.split(':')[1])
                    : 8 * 60; // fallback to 8:00 AM if no shift
                const graceMins = empShift?.graceMinutes ?? 0;
                const checkInMins = checkInPHT.getUTCHours() * 60 + checkInPHT.getUTCMinutes();
                const isLate = checkInMins > (shiftStartMins + graceMins);

                try {
                    const createdRecord = await prisma.attendance.create({
                        data: {
                            employeeId: log.employeeId,
                            date: dateOnly,
                            checkInTime: log.timestamp,
                            status: isLate ? 'late' : 'present'
                        },
                        include: {
                            employee: {
                                select: {
                                    id: true,
                                    firstName: true,
                                    lastName: true,
                                    department: true,
                                    Department: { select: { name: true } },
                                    branch: true,
                                    Shift: true,
                                }
                            }
                        }
                    });
                    created++;

                    await audit({
                        action: 'CHECK_IN',
                        entityType: 'Attendance',
                        entityId: createdRecord.id,
                        performedBy: createdRecord.employeeId,
                        source: 'device-sync',
                        details: `Employee checked in (${isLate ? 'Late' : 'On-time'})`
                    });

                    const shift = createdRecord.employee?.Shift ?? null;
                    const metrics = calculateAttendanceMetrics(createdRecord, shift);

                    // Notify SSE subscribers that a new check-in has been processed.
                    // Fire-and-forget — if no subscribers exist the event is dropped.
                    attendanceEmitter.emit('new-record', {
                        type: 'check-in',
                        record: {
                            ...createdRecord,
                            checkInTimePH: formatToPhilippineTime(createdRecord.checkInTime),
                            checkOutTimePH: null,
                            ...metrics,
                        },
                    });
                } catch (err: any) {
                    if (err instanceof PrismaClientKnownRequestError && err.code === 'P2002') {
                        // Duplicate record — silently skip, this is expected behavior
                        console.debug(`[Attendance] Duplicate record skipped for employeeId=${log.employeeId} on ${dateOnly}`);
                        continue;
                    }
                    throw err; // Re-throw unexpected errors so the outer catch handles them
                }
            } else {
                // Record exists. Check if this is a valid check-out or just a duplicate/early scan
                const checkInTime = new Date(existingAttendance.checkInTime);
                const logTime = new Date(log.timestamp);
                const diffMs = logTime.getTime() - checkInTime.getTime();
                const diffHours = diffMs / (1000 * 60 * 60); //for every 1000 milliseconds, it will be 1 second

                // RULE: User must be checked in for at least 2 hours before checking out
                if (diffHours < 2) {
                    // Too soon to check out - ignore this log
                    // This prevents accidental double-scans from closing the attendance
                    continue;
                }

                // If existing check-out exists, only update if this new log is LATER (user left later)
                if (existingAttendance.checkOutTime) {
                    if (log.timestamp > existingAttendance.checkOutTime) {
                        const updatedRecord = await prisma.attendance.update({
                            where: { id: existingAttendance.id },
                            data: {
                                checkOutTime: log.timestamp,
                                updatedAt: new Date()
                            },
                            include: {
                                employee: {
                                    select: {
                                        id: true,
                                        firstName: true,
                                        lastName: true,
                                        department: true,
                                        Department: { select: { name: true } },
                                        branch: true,
                                        Shift: true,
                                    }
                                }
                            }
                        });
                        updated++;

                        await audit({
                            action: 'CHECK_OUT',
                            entityType: 'Attendance',
                            entityId: updatedRecord.id,
                            performedBy: updatedRecord.employeeId,
                            source: 'device-sync',
                            details: `Employee checked out (updated)`
                        });

                        const shift = updatedRecord.employee?.Shift ?? null;
                        const metrics = calculateAttendanceMetrics(updatedRecord, shift);

                        attendanceEmitter.emit('new-record', {
                            type: 'check-out',
                            record: {
                                ...updatedRecord,
                                checkInTimePH: formatToPhilippineTime(updatedRecord.checkInTime),
                                checkOutTimePH: updatedRecord.checkOutTime ? formatToPhilippineTime(updatedRecord.checkOutTime) : null,
                                ...metrics,
                            },
                        });
                    }
                } else {
                    // No check-out yet, and > 2 hours have passed -> Valid Check-Out
                    const updatedRecord2 = await prisma.attendance.update({
                        where: { id: existingAttendance.id },
                        data: {
                            checkOutTime: log.timestamp,
                            updatedAt: new Date()
                        },
                        include: {
                            employee: {
                                select: {
                                    id: true,
                                    firstName: true,
                                    lastName: true,
                                    department: true,
                                    Department: { select: { name: true } },
                                    branch: true,
                                    Shift: true,
                                }
                            }
                        }
                    });
                    updated++;

                    await audit({
                        action: 'CHECK_OUT',
                        entityType: 'Attendance',
                        entityId: updatedRecord2.id,
                        performedBy: updatedRecord2.employeeId,
                        source: 'device-sync',
                        details: `Employee checked out`
                    });

                    const shift2 = updatedRecord2.employee?.Shift ?? null;
                    const metrics2 = calculateAttendanceMetrics(updatedRecord2, shift2);

                    attendanceEmitter.emit('new-record', {
                        type: 'check-out',
                        record: {
                            ...updatedRecord2,
                            checkInTimePH: formatToPhilippineTime(updatedRecord2.checkInTime),
                            checkOutTimePH: updatedRecord2.checkOutTime ? formatToPhilippineTime(updatedRecord2.checkOutTime) : null,
                            ...metrics2,
                        },
                    });
                }
            }
        }

        console.log(`[Attendance] Processed ${logs.length} logs: ${created} created, ${updated} updated`);

        return {
            success: true,
            processed: logs.length,
            created,
            updated
        };
    } catch (error: any) {
        console.error('[Attendance] Error processing logs:', error);
        return {
            success: false,
            processed: 0,
            created: 0,
            updated: 0
        };
    }
};

/**
 * Auto-close incomplete attendance records from previous days
 * Runs at midnight to mark forgotten check-outs
 */
export const autoCloseIncompleteAttendance = async (): Promise<number> => {
    try {
        const today = getTodayPHT();

        // Find all records before today with no check-out time
        const result = await prisma.attendance.updateMany({
            where: {
                date: { lt: today },
                checkOutTime: null
            },
            data: {
                status: 'incomplete',
                updatedAt: new Date()
            }
        });

        console.log(`[Attendance] Auto-closed ${result.count} incomplete records`);
        return result.count;
    } catch (error: any) {
        console.error('[Attendance] Error auto-closing records:', error);
        return 0;
    }
};

/**
 * Auto-checkout employees who haven't manually checked out
 * Runs at 11:59 PM and sets checkout time to 5:00 PM for flexibility
 * This allows employees to work overtime while preventing unrealistic work hours for forgotten checkouts
 */
export const autoCheckoutEmployees = async (): Promise<number> => {
    try {
        // Get today's date in PHT
        const today = getTodayPHT();

        // Create checkout time at 5:00 PM Philippine Time
        // PHT midnight + 17 hours = 5 PM PHT
        const autoCheckoutTime = new Date(today.getTime() + 17 * 60 * 60 * 1000);

        // Find all records for TODAY that still don't have a checkout time
        const result = await prisma.attendance.updateMany({
            where: {
                date: today,
                checkOutTime: null
            },
            data: {
                checkOutTime: autoCheckoutTime,
                notes: 'Auto checkout - No manual checkout detected by 11:59 PM',
                updatedAt: new Date()
            }
        });

        if (result.count > 0) {
            await audit({
                action: 'AUTO_CHECKOUT',
                entityType: 'System',
                source: 'cron',
                details: `Auto-checkout applied to ${result.count} records at 5:00 PM`
            });
        }

        console.log(`[Attendance] Auto-checkout completed: ${result.count} employees checked out at 5:00 PM`);
        return result.count;
    } catch (error: any) {
        console.error('[Attendance] Error during auto-checkout:', error);
        return 0;
    }
};

/**
 * Startup Repair: Fix any missing checkouts from previous days
 * This ensures that if the server was off at 11:59 PM, the records are fixed on next startup
 */
export const repairMissingCheckouts = async (): Promise<number> => {
    try {
        const today = getTodayPHT();

        // Find all records from dates BEFORE today that have no checkout time
        const records = await prisma.attendance.findMany({
            where: {
                date: { lt: today },
                checkOutTime: null
            }
        });

        if (records.length === 0) return 0;

        let repairedCount = 0;
        for (const record of records) {
            // Set checkout time to 5:00 PM PHT for that specific date
            // record.date is PHT midnight in UTC, so +17 hours = 5 PM PHT
            const repairTime = new Date(record.date.getTime() + 17 * 60 * 60 * 1000);

            await prisma.attendance.update({
                where: { id: record.id },
                data: {
                    checkOutTime: repairTime,
                    status: 'present', // Assume present if they checked in but forgot to check out
                    notes: record.notes
                        ? `${record.notes} | Auto-checkout set to 5:00 PM (Forgotten checkout)`
                        : 'Auto-checkout set to 5:00 PM (Forgotten checkout)',
                    updatedAt: new Date()
                }
            });
            repairedCount++;
        }

        if (repairedCount > 0) {
            await audit({
                action: 'AUTO_CHECKOUT',
                entityType: 'System',
                source: 'startup-repair',
                details: `Startup repair: Auto-checkout applied to ${repairedCount} historic records`
            });
        }

        console.log(`[Attendance] Startup Repair: Fixed ${repairedCount} missing checkouts from previous days`);
        return repairedCount;
    } catch (error: any) {
        console.error('[Attendance] Error during startup repair:', error);
        return 0;
    }
};

/**
 * Get attendance records with filters
 */
export const getAttendanceRecords = async (filters: AttendanceFilters = {}, page: number = 1, limit: number = 10000) => {
    const where: any = {};

    if (filters.startDate || filters.endDate) {
        where.date = {};
        if (filters.startDate) where.date.gte = filters.startDate;
        if (filters.endDate) where.date.lte = filters.endDate;
    }

    if (filters.employeeId) {
        where.employeeId = filters.employeeId;
    }

    if (filters.status) {
        where.status = filters.status;
    }

    // Branch / department filters — applied via nested employee relation
    // Use OR for department: filter by FK (if set) OR string field (legacy)
    const empConditions: any = {}
    if (filters.branch) empConditions.branch = filters.branch

    if (filters.departmentId || filters.departmentName) {
        const deptOr: any[] = []
        if (filters.departmentId) deptOr.push({ departmentId: filters.departmentId })
        if (filters.departmentName) deptOr.push({ department: { equals: filters.departmentName, mode: 'insensitive' } })
        if (Object.keys(empConditions).length > 0 || deptOr.length > 0) {
            where.employee = deptOr.length === 1
                ? { ...empConditions, ...deptOr[0] }
                : { ...empConditions, OR: deptOr }
        }
    } else if (Object.keys(empConditions).length > 0) {
        where.employee = empConditions
    }

    // Calculate pagination
    const skip = (page - 1) * limit;

    const [total, records] = await Promise.all([
        prisma.attendance.count({ where }),
        prisma.attendance.findMany({
            where,
            include: {
                employee: {
                    include: {
                        Department: {
                            select: { name: true }
                        },
                        Shift: true
                    }
                }
            },
            orderBy: [{ date: 'desc' }, { checkInTime: 'desc' }],
            skip,
            take: limit
        })
    ]);

    // Enrich each record with shift-based calculations
    const data = records.map((record: any) => {
        const shift = record.employee?.Shift ?? null;
        const metrics = calculateAttendanceMetrics(record, shift);
        return {
            ...record,
            checkInTimePH: formatToPhilippineTime(record.checkInTime),
            checkOutTimePH: record.checkOutTime ? formatToPhilippineTime(record.checkOutTime) : null,
            ...metrics,
        };
    });

    return { data, total };
};

/**
 * Calculate attendance metrics based on an employee's assigned Shift
 * All times are stored as UTC where PHT midnight = UTC midnight offset by -8h
 * i.e. a stored timestamp of 2026-02-10T00:00:00Z represents 2026-02-10T08:00:00+08:00 PHT midnight workaround
 */
function calculateAttendanceMetrics(record: any, shift: any) {
    const shiftCode = shift?.shiftCode ?? null;

    if (!shift || !record.checkInTime) {
        // No shift assigned – fall back to a generic 8-hour day
        const checkIn = new Date(record.checkInTime);
        const checkOut = record.checkOutTime ? new Date(record.checkOutTime) : null;
        const totalMs = checkOut ? checkOut.getTime() - checkIn.getTime() : 0;
        const totalHours = parseFloat((totalMs / (1000 * 60 * 60)).toFixed(2));
        const expectedHours = 8;
        const overtime = Math.max(0, totalHours - expectedHours);
        const undertime = totalHours > 0 ? Math.max(0, expectedHours - totalHours) : 0;

        // Late: after 08:00 AM PHT
        const checkInPHT = new Date(checkIn.getTime() + 8 * 60 * 60 * 1000);
        const lateMinutes = Math.max(0, checkInPHT.getUTCHours() * 60 + checkInPHT.getUTCMinutes() - 8 * 60);

        // Anomaly: Tap in is more than 4 hours away from default 08:00 AM
        const ANOMALY_THRESHOLD_MINS = 4 * 60;
        const diffMins = Math.abs(checkInPHT.getUTCHours() * 60 + checkInPHT.getUTCMinutes() - 8 * 60);
        const isAnomaly = diffMins > ANOMALY_THRESHOLD_MINS;

        const isShiftActive = !!record.checkInTime && !record.checkOutTime;
        const status = isShiftActive ? "IN_PROGRESS" : record.status;

        return { 
            shiftCode: null, 
            lateMinutes, 
            overtimeMinutes: parseFloat((overtime * 60).toFixed(1)), 
            undertimeMinutes: parseFloat((undertime * 60).toFixed(1)), 
            totalHours, 
            isAnomaly, 
            isEarlyOut: false,
            isShiftActive,
            status,
            gracePeriodApplied: false,
            latePenaltyMinutes: lateMinutes,
            workedHours: totalHours
        };
    }

    // --- Shift-aware calculation ---
    // record.date is "PHT midnight stored as UTC" e.g. 2026-02-10T16:00:00.000Z = Feb 11 00:00 PHT
    // We add 8h to get back to the actual PHT calendar date's midnight UTC representation usable for Date math
    const dateMs = new Date(record.date).getTime() + 8 * 60 * 60 * 1000; // PHT midnight in ms

    // Parse shift start/end ("HH:MM" 24-hour)
    const [startH, startM] = shift.startTime.split(':').map(Number);
    const [endH, endM] = shift.endTime.split(':').map(Number);

    // Build expected check-in / check-out as UTC timestamps on that PHT date
    // Formula: PHT midnight (ms) + hours*3600000 - 8*3600000 (to convert PHT back to UTC)
    const expectedStart = new Date(dateMs + (startH * 60 + startM) * 60 * 1000 - 8 * 60 * 60 * 1000);
    let expectedEnd = new Date(dateMs + (endH * 60 + endM) * 60 * 1000 - 8 * 60 * 60 * 1000);

    // Night shift: end time is next day
    if (shift.isNightShift && endH < startH) {
        expectedEnd = new Date(expectedEnd.getTime() + 24 * 60 * 60 * 1000);
    }

    // Check if it's a half-day (adjust expected end time to halfway between start and end)
    let halfDays: string[] = [];
    try { halfDays = JSON.parse(shift.halfDays || '[]'); } catch { }
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const phtDate = new Date(new Date(record.date).getTime() + 8 * 60 * 60 * 1000);
    const dayName = dayNames[phtDate.getUTCDay()];
    const isHalfDay = halfDays.includes(dayName);

    // Parse explicit breaks
    let explicitBreaks: { start: Date, end: Date }[] = [];
    try {
        const parsedBreaks = JSON.parse(shift.breaks || '[]');
        explicitBreaks = parsedBreaks.map((b: any) => {
            const [bhStart, bmStart] = b.start.split(':').map(Number);
            const [bhEnd, bmEnd] = b.end.split(':').map(Number);
            
            let bStart = new Date(dateMs + (bhStart * 60 + bmStart) * 60 * 1000 - 8 * 60 * 60 * 1000);
            let bEnd = new Date(dateMs + (bhEnd * 60 + bmEnd) * 60 * 1000 - 8 * 60 * 60 * 1000);
            
            if (shift.isNightShift && bhStart < startH) bStart = new Date(bStart.getTime() + 24 * 60 * 60 * 1000);
            if (shift.isNightShift && bhEnd < startH) bEnd = new Date(bEnd.getTime() + 24 * 60 * 60 * 1000);

            return { start: bStart, end: bEnd };
        });
    } catch (e) { }

    let calculatedBreakMins = 0;
    if (explicitBreaks.length > 0) {
        explicitBreaks.forEach(b => {
             calculatedBreakMins += (b.end.getTime() - b.start.getTime()) / 60000;
        });
    }

    if (isHalfDay) {
        // Expected end = midpoint between start and full end
        const halfMs = (expectedEnd.getTime() - expectedStart.getTime()) / 2;
        expectedEnd = new Date(expectedStart.getTime() + halfMs);
    }

    // Full expected shift duration (minutes), without break
    const fullShiftMins = (expectedEnd.getTime() - expectedStart.getTime()) / (1000 * 60);

    const checkIn = new Date(record.checkInTime);
    const checkOut = record.checkOutTime ? new Date(record.checkOutTime) : null;

    // Only deduct break if employee worked at least HALF of the full shift.
    // This prevents a lunch deduction for short / partial-day attendances.
    const rawBreakMins = isHalfDay ? 0 : (explicitBreaks.length > 0 ? calculatedBreakMins : (shift.breakMinutes ?? 60));
    const halfShiftMins = fullShiftMins / 2;

    // Late: actual check-in minus (expected start + grace)
    const graceMins = shift.graceMinutes ?? 0;
    const lateMs = checkIn.getTime() - (expectedStart.getTime() + graceMins * 60 * 1000);
    const lateMinutes = Math.max(0, Math.round(lateMs / (1000 * 60)));

    // Expected net worked minutes (after break deduction)
    const fullExpectedMins = fullShiftMins - rawBreakMins;

    // Anomaly: Tap in is more than 4 hours away from expected shift start
    const ANOMALY_THRESHOLD_MINS = 4 * 60;
    const diffFromExpectedMins = Math.abs(Math.round((checkIn.getTime() - expectedStart.getTime()) / (1000 * 60)));
    const isAnomaly = diffFromExpectedMins > ANOMALY_THRESHOLD_MINS;

    // Total Hours = (checkOut - effectiveCheckIn) - break (if threshold met), floored at 0
    let totalHours = 0;
    let undertimeMinutes = 0;
    let overtimeMinutes = 0;
    let isEarlyOut = false;

    if (checkOut) {
        // GUARD: If employee checked out BEFORE their shift even started,
        // they did not work any shift hours.
        if (checkOut.getTime() <= expectedStart.getTime()) {
            return {
                shiftCode, lateMinutes: 0, undertimeMinutes: parseFloat(fullExpectedMins.toFixed(1)),
                overtimeMinutes: 0, totalHours: 0, isAnomaly, isEarlyOut: true,
                isShiftActive: false, status: record.status, gracePeriodApplied: false,
                latePenaltyMinutes: 0, workedHours: 0
            };
        }

        // CAP: Working hours only start from shift start, not from an early check-in
        const effectiveCheckIn = new Date(Math.max(checkIn.getTime(), expectedStart.getTime()));
        const rawWorkedMins = (checkOut.getTime() - effectiveCheckIn.getTime()) / 60000;
        
        // Exactly calculate intersecting break overlap during the attended hours
        let overlappingBreakMins = 0;
        if (explicitBreaks.length > 0 && !isHalfDay) {
            explicitBreaks.forEach(b => {
                const overlapStart = Math.max(effectiveCheckIn.getTime(), b.start.getTime());
                const overlapEnd = Math.min(checkOut.getTime(), b.end.getTime());
                if (overlapEnd > overlapStart) {
                    overlappingBreakMins += (overlapEnd - overlapStart) / 60000;
                }
            });
        } else if (!isHalfDay && rawWorkedMins >= halfShiftMins) {
            overlappingBreakMins = rawBreakMins;
        }

        const workedMins = Math.max(0, rawWorkedMins - overlappingBreakMins);
        totalHours = parseFloat((workedMins / 60).toFixed(2));

        // Undertime: missed time strictly after checkout until expectedEnd
        let missingMins = 0;
        if (checkOut.getTime() < expectedEnd.getTime()) {
            const missingBlockStart = Math.max(checkOut.getTime(), expectedStart.getTime());
            const rawMissingMins = (expectedEnd.getTime() - missingBlockStart) / 60000;
            
            let missingBreakMins = 0;
            if (explicitBreaks.length > 0 && !isHalfDay) {
                explicitBreaks.forEach(b => {
                    const overlapStart = Math.max(missingBlockStart, b.start.getTime());
                    const overlapEnd = Math.min(expectedEnd.getTime(), b.end.getTime());
                    if (overlapEnd > overlapStart) {
                        missingBreakMins += (overlapEnd - overlapStart) / 60000;
                    }
                });
            } else if (!isHalfDay && rawWorkedMins < halfShiftMins) {
                // If they checked out super early under legacy definitions, their missed time conceptually contains the full break they failed to encounter
                missingBreakMins = rawBreakMins;
            }
            missingMins = Math.max(0, rawMissingMins - missingBreakMins);
        }
        undertimeMinutes = Math.round(missingMins);

        // Overtime: employee stayed beyond expected end
        const actualEndMs = checkOut.getTime();
        const expectedEndMs = expectedEnd.getTime();
        const otMs = Math.max(0, actualEndMs - expectedEndMs);
        overtimeMinutes = parseFloat((otMs / (1000 * 60)).toFixed(1));
    }

    const isShiftActive = !!checkIn && !checkOut;
    const status = isShiftActive ? "IN_PROGRESS" : record.status;
    const gracePeriodApplied = checkIn.getTime() > expectedStart.getTime() && lateMinutes === 0;

    return { 
        shiftCode, 
        lateMinutes, 
        undertimeMinutes, 
        overtimeMinutes, 
        totalHours, 
        isAnomaly, 
        isEarlyOut,
        isShiftActive,
        status,
        gracePeriodApplied,
        latePenaltyMinutes: lateMinutes,
        workedHours: totalHours
    };
};

/**
 * Helper: Convert UTC date to Philippine Time string
 */
function formatToPhilippineTime(utcDate: Date): string {
    // Just use toLocaleString with timeZone option. 
    // The input utcDate is already a valid Date object (UTC).
    return utcDate.toLocaleString('en-US', {
        timeZone: 'Asia/Manila',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true
    });
};

/**
 * Get today's attendance
 */
export const getTodayAttendance = async () => {
    const todayStart = getTodayPHT();
    // End of today = start of tomorrow minus 1ms
    const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000 - 1);

    const result = await getAttendanceRecords({
        startDate: todayStart,
        endDate: todayEnd
    });
    return result.data;
};

/**
 * Get attendance history for a specific employee
 */
export const getEmployeeAttendanceHistory = async (
    employeeId: number,
    startDate?: Date,
    endDate?: Date
) => {
    const result = await getAttendanceRecords({
        employeeId,
        startDate,
        endDate
    });
    return result.data;
};

/**
 * Get today's raw attendance logs (individual scan events)
 * Returns each scan as a separate entry for a real-time activity feed
 */
export const getTodayLogs = async () => {
    const todayStart = getTodayPHT();
    // End of today in PHT: PHT midnight + 24 hours
    const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);

    const logs = await prisma.attendanceLog.findMany({
        where: {
            timestamp: {
                gte: todayStart,
                lt: todayEnd
            }
        },
        include: {
            employee: {
                include: {
                    Department: { select: { name: true } }
                }
            }
        },
        orderBy: { timestamp: 'desc' }
    });

    return logs.map((log: any) => ({
        id: log.id,
        employeeId: log.employeeId,
        timestamp: log.timestamp,
        timestampPH: formatToPhilippineTime(log.timestamp),
        employee: log.employee
    }));
};
