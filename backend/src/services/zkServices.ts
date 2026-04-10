import { prisma } from '../lib/prisma';
import { ZKDriver } from '../lib/zk-driver';
import { processAttendanceLogs } from './attendance.service';
import deviceEmitter from '../lib/deviceEmitter';
import { audit } from '../lib/auditLogger';


interface SyncResult {
    success: boolean;
    message?: string;
    error?: string;
    newLogs?: number;
    count?: number;
    results?: { deviceName: string; status: 'synced' | 'failed'; error?: string }[];
}

export interface SyncZkDataResult {
    success: boolean;
    status: 'SUCCESS' | 'PARTIAL' | 'FAILED' | 'NO_DEVICES';
    message: string;
    totalDevices: number;
    successfulDevices: number;
    failedDevices: Array<{ id: number; name: string; error: string }>;
    newLogs: number;
}

// Protected device UIDs that cannot be overwritten (e.g., 1 is reserved for SUPER ADMIN).
const PROTECTED_DEVICE_UIDS = [1];

// Starting zkId for regular employees.
const MIN_EMPLOYEE_ZK_ID = 2;

// Mutex to prevent race conditions during concurrent employee registrations.
// Ensures atomic assignment of unique zkIds by forcing read-then-write sequences to queue.
let _registrationMutexBusy = false;
const _registrationMutexQueue: Array<() => void> = [];

/**
 * Acquires the registration mutex.
 * Returns a release function that MUST be called in a finally block.
 * Queues the caller if the mutex is already held — callers are served
 * in FIFO order so no request starves.
 */
export async function acquireRegistrationMutex(): Promise<() => void> {
    return new Promise((resolve) => {
        const release = () => {
            // Hand off to the next queued caller, if any.
            const next = _registrationMutexQueue.shift();
            if (next) {
                setTimeout(next, 50);
            } else {
                _registrationMutexBusy = false;
            }
        };

        if (!_registrationMutexBusy) {
            _registrationMutexBusy = true;
            resolve(release);
        } else {
            // FIFO: push to end of queue so registrations are processed
            // in the order they arrived
            _registrationMutexQueue.push(() => {
                _registrationMutexBusy = true;
                resolve(release);
            });
        }
    });
}

/**
 * Finds the lowest safe zkId to assign to a new employee.
 *
 * Queries BOTH the database (to avoid duplicate `Employee.zkId` values) AND
 * every active biometric device (to avoid colliding with ghost users whose
 * device UIDs are not present in the DB). Walks integers starting from
 * `MIN_EMPLOYEE_ZK_ID` (2) and returns the first value not in either set.
 *
 * If a device is offline, its UIDs cannot be verified. A warning is logged and
 * the function falls back to the DB-only check for that device — the caller's
 * downstream write guards (`addUserToDevice` visibleId conflict check) provide
 * a second layer of protection in that scenario.
 *
 * This function does NOT acquire the device lock because it is called before
 * the employee record exists, making it a read-only pre-flight check. Each
 * device connection is opened and closed within its own try/finally block.
 *
 * @returns The next safe integer zkId >= MIN_EMPLOYEE_ZK_ID
 */
export const findNextSafeZkId = async (): Promise<number> => {
    // 1. Collect all zkId values already used in the DB.
    const dbEmployees = await prisma.employee.findMany({
        where: { zkId: { not: null } },
        select: { zkId: true },
    });

    const usedIds = new Set<number>([
        ...dbEmployees.map(e => e.zkId!),
        ...PROTECTED_DEVICE_UIDS,
    ]);

    // 2. Collect all UIDs currently occupied on every active device.
    //    Each device is connected and disconnected independently so one offline
    //    device does not block the rest.
    const activeDevices = await prisma.device.findMany({
        where: { isActive: true },
        orderBy: { id: 'asc' },
    });

    for (const dbDevice of activeDevices) {
        const zk = getDriver(dbDevice.ip, dbDevice.port);
        try {
            await connectWithRetry(zk, 1); // 1 retry — this is a non-critical pre-flight
            const deviceUsers = await zk.getUsers();
            // node-zklib does not export its user type, so 'any' is required here
            deviceUsers.forEach((u: any) => {
                if (typeof u.uid === 'number') usedIds.add(u.uid);
            });
            console.log(`[ZK] findNextSafeZkId — scanned ${deviceUsers.length} UIDs from "${dbDevice.name}".`);
        } catch (err: any) {
            // Device is offline — log a warning but continue. The DB check still
            // prevents duplicates; the addUserToDevice write guards provide the
            // second layer of protection if the device comes back online.
            console.warn(`[ZK] findNextSafeZkId — could not reach "${dbDevice.name}" (${zkErrMsg(err)}). Device UIDs not verified for this device.`);
        } finally {
            try { await zk.disconnect(); } catch { /* ignore disconnect errors */ }
        }
    }

    // 3. Find the first integer >= MIN_EMPLOYEE_ZK_ID that is not in the used set.
    let candidate = MIN_EMPLOYEE_ZK_ID;
    while (usedIds.has(candidate)) {
        candidate++;
    }

    console.log(`[ZK] findNextSafeZkId — assigned zkId=${candidate} (checked ${usedIds.size} used IDs across DB + devices).`);
    return candidate;
};

/**
 * Convert Philippine Time to UTC reliably
 * ZKTeco device returns timestamps in Philippine Time (UTC+8)
 * node-zklib creates a completely local Date object. This guarantees we use
 * the raw PHT hour components to compute true UTC without subtracting 8 hours twice.
 */
const convertPHTtoUTC = (deviceDate: Date): Date => {
    // Extract what the device screen actually printed (which was mapped blindly to local OS components)
    const year = deviceDate.getFullYear();
    const month = deviceDate.getMonth();
    const date = deviceDate.getDate();
    const hours = deviceDate.getHours();
    const minutes = deviceDate.getMinutes();
    const seconds = deviceDate.getSeconds();

    // Map those raw screen components to a UTC string format, then subtract exactly 8 hours.
    const rawUTC = new Date(Date.UTC(year, month, date, hours, minutes, seconds));
    return new Date(rawUTC.getTime() - (8 * 60 * 60 * 1000));
};

// ─────────────────────────────────────────────────────────────────────────────
// FIX 1: Increased timeout (10 s instead of 5 s)
// ─────────────────────────────────────────────────────────────────────────────
/** Create a ZKDriver for a specific device IP+port. Falls back to env vars if not provided. */
export const getDriver = (ip?: string, port?: number): ZKDriver => {
    const resolvedIp = ip ?? process.env.ZK_HOST ?? '192.168.1.201';
    const resolvedPort = port ?? parseInt(process.env.ZK_PORT || '4370');
    const timeout = parseInt(process.env.ZK_TIMEOUT || '30000');
    return new ZKDriver(resolvedIp, resolvedPort, timeout);
};

// ─────────────────────────────────────────────────────────────────────────────
// Per-device lock system
// Each ZKTeco device only accepts ONE TCP connection at a time.
// This Map-based mutex ensures that concurrent API calls to the SAME device
// are queued, while operations targeting DIFFERENT devices run in parallel.
// ─────────────────────────────────────────────────────────────────────────────

interface DeviceLockState {
    busy: boolean;
    interactivePending: boolean;
    queue: Array<() => void>;
    timeoutHandle: ReturnType<typeof setTimeout> | null;
}

// Key = device database ID (number). Created on first use.
const _deviceLocks = new Map<number, DeviceLockState>();

function getDeviceLockState(deviceId: number): DeviceLockState {
    if (!_deviceLocks.has(deviceId)) {
        _deviceLocks.set(deviceId, {
            busy: false,
            interactivePending: false,
            queue: [],
            timeoutHandle: null,
        });
    }
    return _deviceLocks.get(deviceId)!;
}

// Safety timeout: if the lock is held for more than 90 seconds,
// auto-release it. This prevents permanent deadlock if a request
// crashes before reaching its finally{} block.
const LOCK_TIMEOUT_MS = 90_000;

/**
 * Blocking lock for interactive UI operations (enrollment, addUser).
 * Jumps to the FRONT of the queue so it is not delayed by already-queued cron syncs.
 * Sets interactivePending so subsequent cron ticks skip while this is pending/held.
 */
function acquireInteractiveDeviceLock(deviceId: number): Promise<void> {
    const state = getDeviceLockState(deviceId);
    state.interactivePending = true;
    return new Promise((resolve) => {
        if (!state.busy) {
            state.busy = true;
            console.log(`[ZK] Interactive lock acquired for device ${deviceId}.`);
            resolve();
        } else {
            console.log(`[ZK] Device ${deviceId} busy — interactive request jumping to front of queue...`);
            // Unshift = front of queue, so this resolves before any already-queued cron syncs
            state.queue.unshift(() => {
                state.busy = true;
                resolve();
            });
        }
    });
}

/**
 * Blocking lock for background operations (syncEmployeesToDevice, deleteUserFromDevice, etc.).
 * Queues at the BACK — waits its turn behind any interactive operations.
 */
export function acquireDeviceLock(deviceId: number): Promise<void> {
    const state = getDeviceLockState(deviceId);
    return new Promise((resolve) => {
        if (!state.busy) {
            state.busy = true;
            state.timeoutHandle = setTimeout(() => {
                console.warn(`[ZK] ⚠ Lock auto-released after timeout (90s) for device ${deviceId}.`);
                releaseDeviceLock(deviceId);
            }, LOCK_TIMEOUT_MS);
            resolve();
        } else {
            console.log(`[ZK] Device ${deviceId} busy — queuing background request...`);
            state.queue.push(() => {
                state.busy = true;
                state.timeoutHandle = setTimeout(() => {
                    console.warn(`[ZK] ⚠ Lock auto-released after timeout (90s) for device ${deviceId}.`);
                    releaseDeviceLock(deviceId);
                }, LOCK_TIMEOUT_MS);
                resolve();
            });
        }
    });
}

/**
 * Release the device lock and hand off to the next queued operation.
 * Always call this in a finally block.
 */
export function releaseDeviceLock(deviceId: number): void {
    const state = getDeviceLockState(deviceId);
    if (state.timeoutHandle) {
        clearTimeout(state.timeoutHandle);
        state.timeoutHandle = null;
    }
    const next = state.queue.shift();
    if (next) {
        // Small delay so the device can fully close the previous TCP socket
        setTimeout(next, 500);
    } else {
        state.busy = false;
        // Only clear the interactive flag when the queue is fully drained —
        // if another interactive op is queued, it will set the flag again when it resolves.
        state.interactivePending = false;
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Non-blocking lock attempt — used by the cron job.
// Returns true if the lock was acquired, false if the device is already busy.
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Non-blocking lock attempt for the cron job.
 * Returns false (skip this tick) if:
 *   - The device is already busy with any operation, OR
 *   - An interactive operation is pending in the queue
 * This ensures cron ticks never block or delay UI-triggered operations.
 */
function tryAcquireDeviceLock(deviceId: number): boolean {
    const state = getDeviceLockState(deviceId);
    // Skip if device is busy OR if an interactive operation is pending/active.
    // interactivePending ensures a queued enrollment/addUser is never
    // pushed back by a cron tick that sneaks in before it resolves.
    if (state.busy || state.interactivePending) {
        return false;
    }
    state.busy = true;
    // Apply the same safety timeout as interactive and background locks so a
    // crashed cron tick never leaves the device permanently locked.
    state.timeoutHandle = setTimeout(() => {
        console.warn(`[ZK] ⚠ Cron lock auto-released after timeout (90s) for device ${deviceId}.`);
        releaseDeviceLock(deviceId);
    }, LOCK_TIMEOUT_MS);
    return true;
}

/**
 * Global Deletion: Removes a specific fingerprint across ALL active devices.
 * If a device is offline, flags the DB row as pendingDeletion=true so the 
 * auto-reconciler sweeps it when the device reconnects.
 */
export const deleteFingerprintGlobally = async (
    employeeId: number,
    fingerIndex: number
): Promise<{ success: boolean; message: string }> => {
    const employee = await prisma.employee.findUnique({
        where: { id: employeeId },
        select: { id: true, zkId: true, firstName: true, lastName: true },
    });

    if (!employee?.zkId) {
        return { success: false, message: 'Employee not found or has no zkId' };
    }

    const enrollments = await prisma.employeeFingerprintEnrollment.findMany({
        where: { employeeId, fingerIndex },
        include: { device: true },
    });

    if (enrollments.length === 0) {
        return { success: true, message: 'Fingerprint is not enrolled on any device.' };
    }

    const fullName = `${employee.firstName} ${employee.lastName}`;
    const fingerLabel = FINGER_MAP[fingerIndex] || `Finger ${fingerIndex + 1}`;
    console.log(`[GlobalDelete] Wiping ${fingerLabel} for ${fullName} across ${enrollments.length} device(s)...`);

    const { enqueueGlobalDeleteFinger, processDeviceSyncQueue } = require('./deviceSyncQueue.service');

    // Queue the deletion for all relevant devices and strip from DB
    await enqueueGlobalDeleteFinger(employee.id, employee.zkId, fingerIndex, fingerLabel);

    // Try to process immediately on active devices for fast UI feedback
    setImmediate(async () => {
        for (const enr of enrollments) {
            if (enr.device.isActive) {
                try {
                    await processDeviceSyncQueue(enr.device.id);
                } catch (err) {
                    console.error(`[GlobalDelete] Immediate queue processing failed for device ${enr.device.name}`);
                }
            }
        }
    });

    return { 
        success: true, 
        message: `${fingerLabel} deletion queued for all devices.` 
    };
};

// Force-release the lock from an external endpoint (e.g. POST /api/devices/unlock)
// If deviceId is provided, releases only that device. Otherwise releases ALL devices (emergency).
export function forceReleaseLock(deviceId?: number): void {
    if (deviceId !== undefined) {
        console.warn(`[ZK] Force-releasing device lock for device ${deviceId} via API.`);
        const state = getDeviceLockState(deviceId);
        state.queue.length = 0;
        if (state.timeoutHandle) { clearTimeout(state.timeoutHandle); state.timeoutHandle = null; }
        state.busy = false;
        state.interactivePending = false;
    } else {
        // No specific device — release all (emergency fallback)
        console.warn(`[ZK] Force-releasing ALL device locks via API.`);
        _deviceLocks.forEach((state, id) => {
            state.queue.length = 0;
            if (state.timeoutHandle) { clearTimeout(state.timeoutHandle); state.timeoutHandle = null; }
            state.busy = false;
            state.interactivePending = false;
        });
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// ZKError unwrapper — node-zklib throws { err: Error, ip, command } objects
// which don't have a .message property, so we extract it manually.
// ─────────────────────────────────────────────────────────────────────────────
export function zkErrMsg(err: any): string {
    if (!err) return 'Unknown error';
    if (typeof err === 'string') return err;
    // ZKError shape: { err: Error, ip, command }
    if (err.err instanceof Error) return `${err.command || 'ZK'}: ${err.err.message}`;
    if (err.message) return err.message;
    return JSON.stringify(err);
}

export async function connectWithRetry(zk: ZKDriver, maxRetries: number = 2): Promise<void> {
    let lastError: any;
    for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
        try {
            await zk.connect();
            if (attempt > 1) console.log(`[ZK] Connected on attempt ${attempt}.`);
            return;
        } catch (err: any) {
            lastError = err;
            console.warn(`[ZK] Connection attempt ${attempt} failed: ${zkErrMsg(err)}`);
            if (attempt <= maxRetries) {
                console.log(`[ZK] Retrying in 2.5 s...`);
                await new Promise(r => setTimeout(r, 2500));
            }
        }
    }
    throw lastError;
}

// ─────────────────────────────────────────────────────────────────────────────
// Private helper: fire a background queue flush when a device reconnects.
// No cooldown needed — processDeviceSyncQueue only touches PENDING rows
// and is a no-op if none exist (O(1) check).
// ─────────────────────────────────────────────────────────────────────────────

export async function triggerAutoReconcile(deviceId: number, deviceName: string): Promise<void> {
    try {
        const deviceRecord = await prisma.device.findUnique({
            where: { id: deviceId },
            select: { isActive: true },
        });

        if (!deviceRecord?.isActive) {
            return;
        }

        console.log(`[ZK] Device "${deviceName}" reconnected — scheduling queue processing...`);

        const { processDeviceSyncQueue } = require('./deviceSyncQueue.service');

        setImmediate(async () => {
            try {
                await processDeviceSyncQueue(deviceId);
            } catch (reconcileErr: unknown) {
                console.error(
                    `[ZK] Queue processing failed for "${deviceName}": ${zkErrMsg(reconcileErr)}`
                );
            }
        });

    } catch (err: unknown) {
        // Errors in triggerAutoReconcile itself must not propagate up
        console.error(
            `[ZK] triggerAutoReconcile error for "${deviceName}": ${zkErrMsg(err)}`
        );
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Private helper: sync a single device (connect → getLogs → insert → disconnect).
// Manages its own per-device lock. NOT exported — only called by syncZkData().
// ─────────────────────────────────────────────────────────────────────────────
async function syncSingleDevice(dbDevice: {
    id: number;
    name: string;
    ip: string;
    port: number;
    isActive: boolean;
    syncEnabled: boolean;
}): Promise<{ deviceId: number; newLogs: number; skipped: boolean; error?: string }> {
    if (dbDevice.syncEnabled === false) {
        console.debug(`[ZK] Skipping "${dbDevice.name}" — sync is disabled.`);
        return { deviceId: dbDevice.id, newLogs: 0, skipped: true };
    }

    // Non-blocking lock: skip this device if it is already being used
    if (!tryAcquireDeviceLock(dbDevice.id)) {
        console.debug(`[ZK] Cron sync skipped for "${dbDevice.name}" — device is busy.`);
        return { deviceId: dbDevice.id, newLogs: 0, skipped: true };
    }

    // ── Read the sync watermark for this device ───────────────────────────
    // We re-query the device record here (not trusting the stale snapshot passed
    // in from syncZkData's findMany) to ensure we have the absolute latest
    // lastSyncedAt value, even if a previous tick updated it mid-cycle.
    const deviceRecord = await prisma.device.findUnique({
        where: { id: dbDevice.id },
        select: { lastSyncedAt: true },
    });

    // Determine the watermark: use lastSyncedAt if it exists, otherwise fall back
    // to 48 hours ago. The 48-hour window is deliberately wide to:
    //   1. Catch logs that span the midnight boundary (preventing the "today only" gap)
    //   2. Recover logs from any server downtime up to 48 hours
    // The @@unique([timestamp, employeeId]) constraint on AttendanceLog guarantees
    // that any log already in the DB will be silently skipped on insert — so fetching
    // a wide window is safe and never creates duplicates.
    const FALLBACK_WINDOW_MS = 48 * 60 * 60 * 1000; // 48 hours
    const watermark: Date = deviceRecord?.lastSyncedAt ?? new Date(Date.now() - FALLBACK_WINDOW_MS);

    console.log(`[ZK] "${dbDevice.name}" watermark: ${watermark.toISOString()} (${deviceRecord?.lastSyncedAt ? 'from DB' : '48h fallback'})`);

    const zk = getDriver(dbDevice.ip, dbDevice.port);
    try {
        console.log(`[ZK] Syncing device "${dbDevice.name}" at ${dbDevice.ip}:${dbDevice.port}...`);
        // Single attempt — the 30s cron IS the retry loop. No need to waste
        // 5+ seconds retrying within a tick when the next tick is 30s away.
        await connectWithRetry(zk, 0);

        // getInfo() uses UDP — non-fatal if it fails (device still works via TCP)
        try {
            const info = await zk.getInfo();
            if (!info?.serialNumber || info.serialNumber === 'N/A') {
                console.warn(`[ZK] "${dbDevice.name}" Serial N/A — UDP may be blocked. Device may be slow.`);
            } else {
                console.log(`[ZK] Connected! Serial: ${info.serialNumber}`);
            }
        } catch {
            console.warn(`[ZK] getInfo() failed (UDP may be blocked) — continuing with TCP only.`);
        }

        const allLogs = await zk.getLogs();

        // ── Filter logs using the watermark ──────────────────────────────────
        // Convert each device log's recordTime to UTC using convertPHTtoUTC before
        // comparing against the watermark (which is already stored in UTC).
        // This ensures the comparison is timezone-safe regardless of how node-zklib
        // represents the device's local time internally.
        const logs = allLogs
            .filter((log: any) => {
                const logUTC = convertPHTtoUTC(log.recordTime);
                return logUTC > watermark;
            })
            .sort((a: any, b: any) =>
                convertPHTtoUTC(a.recordTime).getTime() -
                convertPHTtoUTC(b.recordTime).getTime()
            );

        console.log(`[ZK] Fetched ${allLogs.length} total logs, filtered to ${logs.length} logs newer than watermark.`);

        // Track the timestamp of the most recently inserted log so we can
        // advance the watermark after the loop. We only advance on successful
        // inserts — a failed insert does not move the watermark forward.
        let latestInsertedTimestamp: Date | null = null;
        let newCount = 0;
        for (const log of logs) {
            try {
                const zkUserId = parseInt(log.deviceUserId);

                if (isNaN(zkUserId)) continue;

                // 1. Find Employee by zkId — SKIP if not in DB (prevents ghost re-creation)
                const employee = await prisma.employee.findUnique({
                    where: { zkId: zkUserId }
                });

                if (!employee) {
                    // This zkId was removed from the DB intentionally. Do not re-create.
                    console.log(`[ZK] Skipping unknown zkId ${zkUserId} — not in database`);
                    continue;
                }

                // 2. Fetch Last Log to prevent duplicates
                const lastLog = await prisma.attendanceLog.findFirst({
                    where: { employeeId: employee.id },
                    orderBy: { timestamp: 'desc' }
                });

                // Convert PHT to UTC for storage and comparison
                const utcTime = convertPHTtoUTC(log.recordTime);

                // Logic: Prevent duplicates within 1 minute (accidental double-scans)
                if (lastLog) {
                    const diffMs = Math.abs(utcTime.getTime() - lastLog.timestamp.getTime());
                    const diffMinutes = diffMs / (1000 * 60);

                    // Only skip if it's within 1 minute (likely accidental double-scan)
                    if (diffMinutes < 1) {
                        // Log duplicate punch detection
                        void audit({
                            action: 'DUPLICATE_PUNCH',
                            level: 'WARN',
                            entityType: 'Attendance',
                            entityId: employee.id,
                            performedBy: employee.id,
                            source: 'device-sync',
                            details: `Duplicate punch detected for ${employee.firstName} ${employee.lastName} (${Math.round(diffMs / 1000)}s apart)`,
                            metadata: { category: 'attendance', employeeId: employee.id, zkId: zkUserId, diffSeconds: Math.round(diffMs / 1000), deviceId: dbDevice.id }
                        });
                        continue;
                    }
                }

                // 3. Check for exact duplicate in DB (same timestamp + same employee)
                const exists = await prisma.attendanceLog.findUnique({
                    where: {
                        timestamp_employeeId: {
                            timestamp: utcTime,
                            employeeId: employee.id
                        }
                    }
                });

                if (exists) {
                    // Exact-timestamp duplicate — log it and skip
                    void audit({
                        action: 'DUPLICATE_PUNCH',
                        level: 'WARN',
                        entityType: 'Attendance',
                        entityId: employee.id,
                        performedBy: employee.id,
                        source: 'device-sync',
                        details: `Duplicate punch detected for ${employee.firstName} ${employee.lastName} (exact timestamp match)`,
                        metadata: { category: 'attendance', employeeId: employee.id, zkId: zkUserId, diffSeconds: 0, deviceId: dbDevice.id }
                    });
                    continue;
                }

                await prisma.attendanceLog.create({
                    data: {
                        timestamp: utcTime,  // Store UTC time
                        employeeId: employee.id,
                        status: log.status,
                        deviceId: dbDevice.id,
                    },
                });
                newCount++;

                // ── Advance the in-memory watermark tracker ───────────
                // We track the maximum UTC timestamp across all successfully
                // inserted logs so that after the loop we can persist the new
                // high-water mark. Using a null-check + comparison ensures we
                // always end up with the latest timestamp even if logs arrive
                // out of order.
                if (latestInsertedTimestamp === null || utcTime > latestInsertedTimestamp) {
                    latestInsertedTimestamp = utcTime;
                }
            } catch (logErr) {
                console.error(`[ZK] Error processing log:`, logErr);
            }
        }

        // ── Persist the watermark if any new logs were inserted ──────────────
        // Only update lastSyncedAt when at least one log was successfully written.
        // This ensures that a sync cycle that finds no new logs does not
        // accidentally reset the watermark to null or move it backwards.
        if (latestInsertedTimestamp !== null) {
            // Advance by 1ms so the next sync's strict '>' filter excludes this
            // exact timestamp and never re-processes the same log.
            const nextWatermark = new Date(latestInsertedTimestamp.getTime() + 1);
            await prisma.device.update({
                where: { id: dbDevice.id },
                data: { lastSyncedAt: nextWatermark, lastSyncStatus: 'SUCCESS', lastSyncError: null, lastPolledAt: new Date() },
            });
            console.log(`[ZK] "${dbDevice.name}" watermark advanced to ${nextWatermark.toISOString()}`);
        } else {
            await prisma.device.update({
                where: { id: dbDevice.id },
                data: { lastSyncStatus: 'SUCCESS', lastSyncError: null, lastPolledAt: new Date() }
            }).catch(() => { /* ignore */ });
        }

        // Log buffer clearing has been moved to a scheduled off-hours maintenance
        // job (logBufferMaintenanceScheduler) to eliminate the data-loss race
        // condition that existed when clearing was done inline during every sync.
        // The DB watermark (lastSyncedAt) prevents duplicate imports regardless
        // of how many logs remain on the device.

        deviceEmitter.emit('device-sync-result', {
            id: dbDevice.id,
            lastSyncStatus: 'SUCCESS',
            lastSyncedAt: latestInsertedTimestamp || watermark,
            lastSyncError: null,
            lastPolledAt: new Date()
        });

        await audit({
            action: 'DEVICE_SYNC',
            entityType: 'Device',
            entityId: dbDevice.id,
            source: 'cron',
            level: 'INFO',
            details: `Synced ${newCount} new logs from ${dbDevice.name}`,
            metadata: { deviceId: dbDevice.id, deviceName: dbDevice.name, newLogs: newCount }
        });

        console.log(`[ZK] Device "${dbDevice.name}" sync complete. ${newCount} new logs.`);
        return { deviceId: dbDevice.id, newLogs: newCount, skipped: false };

    } catch (deviceErr: any) {
        console.error(`[ZK] Error syncing "${dbDevice.name}" (${dbDevice.ip}): ${zkErrMsg(deviceErr)}`);

        // Record only the sync failure — do NOT mutate isActive (Control Plane rules)
        await prisma.device.update({
            where: { id: dbDevice.id },
            data: { 
                lastSyncStatus: 'FAILED',
                lastSyncError: zkErrMsg(deviceErr),
                lastPolledAt: new Date()
            }
        }).catch(() => { /* ignore */ });

        deviceEmitter.emit('device-sync-result', {
            id: dbDevice.id,
            lastSyncStatus: 'FAILED',
            lastSyncedAt: watermark,
            lastSyncError: zkErrMsg(deviceErr),
            lastPolledAt: new Date()
        });

        await audit({
            action: 'DEVICE_SYNC',
            entityType: 'Device',
            entityId: dbDevice.id,
            source: 'cron',
            level: 'ERROR',
            details: `Sync failed for ${dbDevice.name}: ${zkErrMsg(deviceErr)}`,
            metadata: { deviceId: dbDevice.id, deviceName: dbDevice.name, error: zkErrMsg(deviceErr) }
        });

        return { deviceId: dbDevice.id, newLogs: 0, skipped: false, error: zkErrMsg(deviceErr) };
    } finally {
        try { await zk.disconnect(); } catch { /* ignore */ }
        releaseDeviceLock(dbDevice.id);
    }
}

export const syncZkData = async (): Promise<SyncZkDataResult> => {
    try {
        // Load ALL devices from the DB — this way IP changes via Configure take effect immediately
        const dbDevices = await prisma.device.findMany({ orderBy: { id: 'asc' } });

        if (dbDevices.length === 0) {
            console.warn('[ZK] No devices found in DB — skipping sync.');
            return { 
                success: true, 
                status: 'NO_DEVICES', 
                message: 'No devices configured', 
                totalDevices: 0, 
                successfulDevices: 0, 
                failedDevices: [], 
                newLogs: 0 
            };
        }

        // Run all device syncs in PARALLEL — each device manages its own lock
        const results = await Promise.allSettled(
            dbDevices.map(dbDevice => syncSingleDevice(dbDevice))
        );

        let totalNewLogs = 0;
        let successfulDevices = 0;
        const failedDevices: Array<{ id: number; name: string; error: string }> = [];

        results.forEach((result, index) => {
            const dbDevice = dbDevices[index];
            if (result.status === 'fulfilled') {
                const deviceResult = result.value;
                totalNewLogs += deviceResult.newLogs;
                if (deviceResult.error) {
                    failedDevices.push({ id: dbDevice.id, name: dbDevice.name, error: deviceResult.error });
                } else {
                    successfulDevices++;
                }
            } else {
                failedDevices.push({ id: dbDevice.id, name: dbDevice.name, error: String(result.reason) });
                console.error('[ZK] Unexpected rejection in syncSingleDevice:', result.reason);
            }
        });

        // Process all new logs into Attendance records once, after all devices are done
        if (totalNewLogs > 0) {
            console.log(`[ZK] Processing ${totalNewLogs} total new logs across all devices...`);
            await processAttendanceLogs();
        }

        const activeDevicesCount = dbDevices.filter(d => d.syncEnabled).length;
        
        let status: 'SUCCESS' | 'PARTIAL' | 'FAILED' = 'SUCCESS';
        if (failedDevices.length > 0) {
            status = successfulDevices > 0 ? 'PARTIAL' : 'FAILED';
        }

        return { 
            success: status !== 'FAILED',
            status, 
            message: `Synced ${successfulDevices}/${activeDevicesCount} active devices.`,
            totalDevices: activeDevicesCount,
            successfulDevices,
            failedDevices,
            newLogs: totalNewLogs
        };

    } catch (error: any) {
        console.error('[ZK] syncZkData fatal error:', zkErrMsg(error));
        return { 
            success: false, 
            status: 'FAILED',
            error: `Sync Error: ${zkErrMsg(error)}`, 
            message: 'Failed to sync attendance data',
            totalDevices: 0,
            successfulDevices: 0,
            failedDevices: [],
            newLogs: 0
        } as any;
    }
    // NOTE: No top-level releaseDeviceLock() here — each device releases its own lock
};

export const addUserToDevice = async (zkId: number, name: string, role: string = 'USER', cardNumber: number = 0): Promise<SyncResult> => {
    try {
        console.log(`[ZK] Enqueuing UPSERT_USER for zkId=${zkId} (${name})...`);

        const { enqueueGlobalUpsertUser, processDeviceSyncQueue } = require('./deviceSyncQueue.service');
        const deviceRole = role === 'ADMIN' ? 14 : 0;
        
        await enqueueGlobalUpsertUser({
            zkId,
            name,
            role: deviceRole,
            card: cardNumber
        });

        // Attempt inline execution for currently-online devices
        const onlineDevices = await prisma.device.findMany({
            where: { isActive: true, syncEnabled: true },
            select: { id: true, name: true },
        });

        for (const device of onlineDevices) {
            setImmediate(async () => {
                try {
                    await processDeviceSyncQueue(device.id);
                } catch (err: unknown) {
                    console.error(`[ZK] Inline queue flush failed for "${device.name}": ${zkErrMsg(err)}`);
                }
            });
        }

        return { success: true, message: `User ${name} queued for synchronization.` };
    } catch (error: unknown) {
        console.error('[ZK] Add User Error:', zkErrMsg(error));
        throw new Error(`Failed to queue adding employee: ${zkErrMsg(error)}`);
    }
};




export const deleteUserFromDevice = async (zkId: number): Promise<SyncResult> => {
    try {
        console.log(`[ZK] Enqueuing DELETE_USER for zkId=${zkId} across all devices...`);

        const { enqueueGlobalDeleteUser, processDeviceSyncQueue } = require('./deviceSyncQueue.service');
        await enqueueGlobalDeleteUser(zkId);

        // Attempt inline execution for any currently-online devices
        const onlineDevices = await prisma.device.findMany({
            where: { isActive: true, syncEnabled: true },
            select: { id: true, name: true },
        });

        for (const device of onlineDevices) {
            setImmediate(async () => {
                try {
                    await processDeviceSyncQueue(device.id);
                } catch (err: unknown) {
                    console.error(`[ZK] Inline queue flush failed for "${device.name}": ${zkErrMsg(err)}`);
                }
            });
        }

        return { success: true, message: `DELETE_USER queued for zkId=${zkId}. Online devices will sync immediately.` };
    } catch (error: unknown) {
        console.error('[ZK] Delete User Error:', zkErrMsg(error));
        return { success: false, message: `Failed to queue user deletion: ${zkErrMsg(error)}`, error: zkErrMsg(error) };
    }
};

export const syncEmployeesToDevice = async (): Promise<SyncResult> => {
    try {
        console.log(`[ZK] syncEmployeesToDevice — fetching DB employees...`);
        const employees = await prisma.employee.findMany({
            where: {
                zkId: { not: null, gt: 1 }, // Skip Admin (zkId = 1)
                employmentStatus: 'ACTIVE',
            },
            select: { zkId: true, firstName: true, lastName: true, role: true, cardNumber: true }
        });

        if (employees.length === 0) {
            return { success: true, message: "No employees to sync.", count: 0 };
        }

        const dbDevices = await prisma.device.findMany({
            where: { isActive: true, syncEnabled: true },
            orderBy: { id: 'asc' },
        });

        if (dbDevices.length === 0) {
            return { success: false, message: 'No active devices configured.' };
        }

        let totalSuccess = 0;

        for (const dbDevice of dbDevices) {
            await acquireDeviceLock(dbDevice.id);
            const zk = getDriver(dbDevice.ip, dbDevice.port);
            let successCount = 0;
            try {
                console.log(`[ZK] Connecting to "${dbDevice.name}"...`);
                await connectWithRetry(zk);

                // ── Fetch device users ONCE before the employee loop ──────────
                // WHY: Calling getUsers() inside the loop would hammer the device
                // with one TCP round-trip per employee. The user list does not
                // change mid-loop so fetching it once is both correct and efficient.
                const deviceUsers = await zk.getUsers();

                for (const employee of employees) {
                    const fullName = `${employee.firstName} ${employee.lastName}`;
                    const zkId = employee.zkId!;
                    const visibleId = zkId.toString();
                    const deviceRole = employee.role === 'ADMIN' ? 14 : 0;
                    const deviceUid = zkId; // UID ≡ zkId — deterministic, no collisions

                    if (PROTECTED_DEVICE_UIDS.includes(deviceUid)) {
                        console.warn(`[ZK]   ⚠ SKIP ${fullName} — zkId=${zkId} is a protected UID.`);
                        continue;
                    }

                    try {
                        // ── Pre-write occupancy check ─────────────────────────
                        // WHY: Before touching any slot, verify who currently
                        // occupies it. If a different user is there, skip this
                        // employee and continue — do NOT abort the entire sync.
                        // node-zklib does not export its user type, so 'any' is required here
                        const occupant = deviceUsers.find((u: any) => u.uid === deviceUid);

                        if (occupant) {
                            if (String(occupant.userId).trim() === visibleId.trim()) {
                                // Same employee — update name/role in place, skip delete
                                await zk.setUser(deviceUid, fullName, "", deviceRole, employee.cardNumber ?? 0, visibleId);
                                console.log(`[ZK]   ✓ Updated: "${fullName}" → UID=${deviceUid} (slot already owned, skipped delete)`);
                                successCount++;
                            } else {
                                // Different user in this slot — skip, never overwrite
                                console.warn(`[ZK]   ⚠ UID conflict: slot UID=${deviceUid} occupied by userId="${occupant.userId}" ("${occupant.name}") — skipping "${fullName}".`);
                                // continue to next employee — do NOT return, do NOT abort the sync
                            }
                        } else {
                            // Slot is empty — safe to clear and write
                            try { await zk.deleteUser(deviceUid); } catch { /* empty slot — ok */ }
                            await zk.clearUserFingerprints(deviceUid);
                            await zk.setUser(deviceUid, fullName, "", deviceRole, employee.cardNumber ?? 0, visibleId);
                            console.log(`[ZK]   ✓ Written: "${fullName}" → UID=${deviceUid} on "${dbDevice.name}"`);
                            successCount++;
                        }
                    } catch (err: any) {
                        console.error(`[ZK]   ✗ Failed "${fullName}": ${zkErrMsg(err)}`);
                    }
                }

                await zk.refreshData();
                totalSuccess += successCount;
            } catch (err: any) {
                console.error(`[ZK] Could not sync to "${dbDevice.name}": ${zkErrMsg(err)}`);
            } finally {
                try { await zk.disconnect(); } catch { /* ignore */ }
                releaseDeviceLock(dbDevice.id);
            }
        }

        return {
            success: totalSuccess > 0,
            message: `Synced ${totalSuccess} employee(s) across ${dbDevices.length} device(s).`,
            count: totalSuccess,
        };

    } catch (error: any) {
        throw new Error(`Sync failed: ${error.message}`);
    }
};

// Finger index → human readable name (matches ZKTeco standard)
const FINGER_MAP: { [key: number]: string } = {
    0: 'Left Little Finger', 1: 'Left Ring Finger',
    2: 'Left Middle Finger', 3: 'Left Index Finger',
    4: 'Left Thumb', 5: 'Right Thumb',
    6: 'Right Index Finger', 7: 'Right Middle Finger',
    8: 'Right Ring Finger', 9: 'Right Little Finger',
};

/**
 * Enroll fingerprint for an employee.
 *
 * Uses a SINGLE lock-protected connection to:
 *   1. Verify/add the user on the device (inline, no second connect)
 *   2. Send CMD_STARTENROLL with the correct visible userId string
 *
 * This fixes three previous bugs:
 *   a) Two separate connections racing each other
 *   b) Wrong user ID (internal UID) sent in CMD_STARTENROLL packet
 *   c) Enrollment service connecting outside the device-busy lock
 */
export const enrollEmployeeFingerprint = async (
    employeeId: number,
    fingerIndex: number = 5,
    deviceId?: number
): Promise<SyncResult> => {
    console.log(`[Enrollment] Starting for employee ${employeeId}, finger ${fingerIndex}, device ${deviceId ?? 'auto'}...`);

    // 1. Load employee from DB
    const employee = await prisma.employee.findUnique({
        where: { id: employeeId },
        select: { id: true, zkId: true, firstName: true, lastName: true, cardNumber: true },
    });

    if (!employee) {
        return { success: false, message: `Employee ${employeeId} not found in database.` };
    }

    if (!employee.zkId) {
        return { success: false, message: `Employee ${employeeId} has no zkId assigned.` };
    }

    // 2. Resolve which device to use
    let dbDevice;

    if (deviceId) {
        // Use the specific device HR selected from the UI
        dbDevice = await prisma.device.findUnique({ where: { id: deviceId } });
        if (!dbDevice) {
            return { success: false, message: `Device ${deviceId} not found in database.` };
        }
    } else {
        // Fallback: use the first active device (legacy behaviour)
        dbDevice = await prisma.device.findFirst({
            where: { isActive: true },
            orderBy: { id: 'asc' },
        });
        if (!dbDevice) {
            return { success: false, message: 'No active devices configured.' };
        }
    }

    // Guard: refuse enrollment immediately if the device is known to be offline.
    // This avoids a 5-10 second wait for connectWithRetry to fail and gives
    // the user instant feedback.
    if (!dbDevice.isActive) {
        return {
            success: false,
            message: `Device "${dbDevice.name}" is currently offline. Please wait for it to come back online before enrolling.`,
        };
    }

    const fullName = `${employee.firstName} ${employee.lastName}`;
    const visibleId = employee.zkId.toString();
    // UID = zkId — deterministic 1-to-1 mapping (matches addUserToDevice strategy)
    const deviceUid = employee.zkId;

    // 3. Acquire interactive device lock — enrollment is UI-triggered and time-sensitive.
    // acquireInteractiveDeviceLock() places this at the FRONT of the queue so cron syncs
    // can never delay fingerprint capture.
    await acquireInteractiveDeviceLock(dbDevice.id);
    const zk = getDriver(dbDevice.ip, dbDevice.port);


    try {
        console.log(`[Enrollment] Connecting to "${dbDevice.name}" (${dbDevice.ip}:${dbDevice.port})...`);
        // 1 retry for enrollment — user is actively waiting, so one quick
        // retry is acceptable but 3 attempts is too slow for an interactive flow.
        await connectWithRetry(zk, 1);

        // 3. Ensure user exists on this specific device
        const deviceUsers = await zk.getUsers();
        // ── Pre-write occupancy check (uid-based) ───────────────────────────
        // WHY: The previous code searched ONLY by visible userId string, which
        // meant that if the target UID slot was held by a DIFFERENT user whose
        // userId didn't match visibleId, existingUser would be null and the code
        // would silently force-delete and overwrite that user's fingerprints.
        // We now check the SLOT first (by uid), then fall back to userId lookup.
        // node-zklib does not export its user type, so 'any' is required here.
        const slotOccupant = deviceUsers.find((u: any) => u.uid === deviceUid);
        const userByVisibleId = deviceUsers.find((u: any) => String(u.userId).trim() === visibleId.trim());

        if (slotOccupant && String(slotOccupant.userId).trim() !== visibleId.trim()) {
            // Guard 1: A DIFFERENT person occupies the target slot — refuse immediately.
            console.warn(`[Enrollment] ⚠ UID conflict: slot UID=${deviceUid} is occupied by userId="${slotOccupant.userId}" ("${slotOccupant.name}") — refusing enrollment for "${fullName}" (visibleId="${visibleId}").`);
            return {
                success: false,
                message: `Cannot enroll: slot UID=${deviceUid} is already occupied by a different user ("${slotOccupant.name}"). Resolve the UID conflict first.`,
                error: 'uid_conflict'
            };
        }

        if (slotOccupant && String(slotOccupant.userId).trim() === visibleId.trim()) {
            // Guard 2 (short-circuit): The correct user is already in the correct slot.
            // Do NOT fall through to userByVisibleId — that Array.find() could return a
            // ghost user with the same userId at a different uid, triggering a false rewrite.
            console.log(`[Enrollment] User already at correct slot UID=${deviceUid}. Proceeding to enroll.`);
        } else if (!userByVisibleId) {
            // Slot is empty and no other record claims this visibleId — safe to write fresh.
            console.log(`[Enrollment] User not found on device — force-clearing slot UID=${deviceUid} and adding (visibleId="${visibleId}")...`);
            try { await zk.deleteUser(deviceUid); } catch { /* slot empty — ok */ }
            await zk.clearUserFingerprints(deviceUid);
            await zk.setUser(deviceUid, fullName, '', 0, employee.cardNumber ?? 0, visibleId);
            await zk.refreshData();
            console.log(`[Enrollment] User written to UID=${deviceUid}.`);
        } else if (userByVisibleId.uid !== deviceUid) {
            // User exists at the wrong UID (target slot is confirmed empty from Guard 1 pass).
            console.warn(`[Enrollment] ⚠ User found at wrong UID=${userByVisibleId.uid} — re-writing to correct slot UID=${deviceUid}.`);
            try { await zk.deleteUser(deviceUid); } catch { /* slot may be empty */ }
            await zk.clearUserFingerprints(deviceUid);
            await zk.setUser(deviceUid, fullName, '', 0, employee.cardNumber ?? 0, visibleId);
            await zk.refreshData();
            console.log(`[Enrollment] User re-written to UID=${deviceUid}.`);
        } else {
            console.log(`[Enrollment] User already at correct slot UID=${deviceUid}. Proceeding to enroll.`);
        }

        // 4. Send enrollment command
        const fingerName = FINGER_MAP[fingerIndex] || `Finger ${fingerIndex}`;
        console.log(`[Enrollment] Sending CMD_STARTENROLL for "${fullName}" (${fingerName}) on "${dbDevice.name}"...`);
        await zk.startEnrollment(visibleId, fingerIndex);

        // Fire & Forget background polling for template extraction and distribution
        extractAndDistributeTemplate(dbDevice.id, employee.id, fingerIndex).catch(err => {
            console.error('[BiometricSync] Background task error:', err);
        });

        // 5. Record enrollment in DB (device-level)
        await prisma.employeeDeviceEnrollment.upsert({
            where: {
                employeeId_deviceId: {
                    employeeId: employee.id,
                    deviceId: dbDevice.id,
                },
            },
            update: {
                enrolledAt: new Date(),
            },
            create: {
                employeeId: employee.id,
                deviceId: dbDevice.id,
            },
        });

        // Record fingerprint-level metadata (finger × device)
        const fingerLabel = FINGER_MAP[fingerIndex] || `Finger ${fingerIndex}`;
        await prisma.employeeFingerprintEnrollment.upsert({
            where: {
                employeeId_deviceId_fingerIndex: {
                    employeeId: employee.id,
                    deviceId: dbDevice.id,
                    fingerIndex,
                },
            },
            update: { enrolledAt: new Date() },
            create: {
                employeeId: employee.id,
                deviceId: dbDevice.id,
                fingerIndex,
                fingerLabel,
            },
        });

        console.log(`[Enrollment] ✓ Enrollment recorded in DB for employee ${employeeId} (${fingerLabel}) on device "${dbDevice.name}".`);

        return {
            success: true,
            message: `Enrollment started for ${fullName} on device "${dbDevice.name}". Please scan finger now.`,
        };

    } catch (error: any) {
        console.error(`[Enrollment] Error:`, error);
        return {
            success: false,
            message: 'Enrollment failed',
            error: error.message,
        };
    } finally {
        try { await zk.disconnect(); } catch { /* ignore */ }
        releaseDeviceLock(dbDevice.id);
    }
};

/**
 * Read fingerprint templates from the enrollment device and write them
 * to every other active, sync-enabled device in the network.
 *
 * SECURITY CONTRACT:
 * - Templates exist in heap memory only for the duration of this function.
 * - They are never written to any database column, log line, or HTTP body.
 * - All template buffers are explicitly zeroed before the function returns.
 * - This honours the no-database-storage rule in BITS_Fingerprint_Propagation_Plan.md §2.
 *
 * @param employeeId     DB id of the newly enrolled employee
 * @param sourceDeviceId DB id of the device on which enrollment was performed
 * @param fingerIndex    If provided, propagate only this finger slot.
 *                       If omitted, propagate all occupied slots.
 */
export const propagateFingerprintToAllDevices = async (
    employeeId: number,
    sourceDeviceId: number,
    fingerIndex?: number
): Promise<{ success: boolean; pushed: number; errors: string[] }> => {

    // 1. Validate inputs
    const employee = await prisma.employee.findUnique({
        where: { id: employeeId },
        select: { zkId: true, firstName: true, lastName: true }
    });

    if (!employee?.zkId) {
        return { success: false, pushed: 0,
            errors: ['Employee not found or has no zkId'] };
    }

    const sourceDevice = await prisma.device.findUnique({
        where: { id: sourceDeviceId }
    });

    if (!sourceDevice) {
        return { success: false, pushed: 0,
            errors: ['Source device not found'] };
    }

    // 2. Find all other active, sync-enabled devices
    const targetDevices = await prisma.device.findMany({
        where: { isActive: true, syncEnabled: true, id: { not: sourceDeviceId } }
    });

    if (targetDevices.length === 0) {
        console.log('[Propagate] No other active devices — nothing to propagate.');
        return { success: true, pushed: 0, errors: [] };
    }

    const fullName = `${employee.firstName} ${employee.lastName}`;

    // 3. Read templates from source device
    await acquireInteractiveDeviceLock(sourceDeviceId);
    let templates: { finger: number; data: Buffer }[] = [];
    const srcZk = getDriver(sourceDevice.ip, sourceDevice.port);

    try {
        await connectWithRetry(srcZk, 2);
        templates = await srcZk.readAllFingerprintTemplates(employee.zkId);

        if (fingerIndex !== undefined) {
            templates = templates.filter(t => t.finger === fingerIndex);
        }

        console.log(
            `[Propagate] Read ${templates.length} template(s) from`,
            `"${sourceDevice.name}" for ${fullName} (zkId: ${employee.zkId}).`,
            templates.map(t => `slot${t.finger}=${t.data.length}B`).join(', ')
        );
    } catch (err: any) {
        return { success: false, pushed: 0,
            errors: [`Failed to read from source: ${zkErrMsg(err)}`] };
    } finally {
        try { await srcZk.disconnect(); } catch { /* ignore */ }
        releaseDeviceLock(sourceDeviceId);
    }

    // 4. Guard: no templates means enrollment is not yet complete
    if (templates.length === 0) {
        return { success: false, pushed: 0,
            errors: ['No templates on source device — enrollment may not be complete yet'] };
    }

    // 5. Write to each target device sequentially
    let pushed = 0;
    const errors: string[] = [];

    for (const targetDevice of targetDevices) {
        await acquireInteractiveDeviceLock(targetDevice.id);
        const tgtZk = getDriver(targetDevice.ip, targetDevice.port);

        try {
            await connectWithRetry(tgtZk, 2);

            // Ensure user record exists before writing template
            const deviceUsers = await tgtZk.getUsers();
            const exists = deviceUsers.find(
                (u: any) => String(u.userId).trim() === String(employee.zkId)
            );

            if (!exists) {
                await tgtZk.setUser(employee.zkId, fullName, '', 0, 0,
                    String(employee.zkId));
                await tgtZk.refreshData();
                console.log(
                    `[Propagate] User record written to "${targetDevice.name}"`,
                    'before template push.'
                );
            }

            for (const { finger, data } of templates) {
                // Guard: check if this specific slot already has a template on the target.
                // ZKTeco binary reads are lossy — overwriting an existing template with
                // a re-serialized copy degrades it. Only write to genuinely empty slots.
                const existing = await tgtZk.getFingerTemplate(employee.zkId, finger);
                if (existing && existing.length > 0) {
                    console.log(
                        `[Propagate] Slot ${finger} already has ${existing.length}B on`,
                        `"${targetDevice.name}" — skipping to prevent degradation.`
                    );
                    existing.fill(0); // zero the read buffer
                    continue;
                }

                console.log(
                    `[Propagate] Writing slot ${finger} (${data.length} bytes)`,
                    `to "${targetDevice.name}" for UID=${employee.zkId}...`
                );
                await tgtZk.setFingerTemplate(
                    employee.zkId, finger, data
                );
            }

            await tgtZk.refreshData();

            // Verification: read back finger count to confirm template was committed
            try {
                const verifyCount = await tgtZk.getFingerCount(employee.zkId);
                console.log(
                    `[Propagate] ✓ ${templates.length} template(s) written`,
                    `to "${targetDevice.name}".`,
                    `Verify: device reports ${verifyCount} fingerprint(s) for UID=${employee.zkId}.`
                );
            } catch {
                console.log(
                    `[Propagate] ✓ ${templates.length} template(s) written`,
                    `to "${targetDevice.name}" (verification read-back skipped).`
                );
            }

            // Record device-level enrollment in DB
            await prisma.employeeDeviceEnrollment.upsert({
                where: {
                    employeeId_deviceId: {
                        employeeId, deviceId: targetDevice.id
                    }
                },
                update: { enrolledAt: new Date() },
                create: { employeeId, deviceId: targetDevice.id }
            });

            // Record fingerprint-level metadata for each propagated template
            for (const { finger } of templates) {
                const fingerLabel = FINGER_MAP[finger] || `Finger ${finger}`;
                await prisma.employeeFingerprintEnrollment.upsert({
                    where: {
                        employeeId_deviceId_fingerIndex: {
                            employeeId,
                            deviceId: targetDevice.id,
                            fingerIndex: finger,
                        },
                    },
                    update: { enrolledAt: new Date() },
                    create: {
                        employeeId,
                        deviceId: targetDevice.id,
                        fingerIndex: finger,
                        fingerLabel,
                    },
                });
            }

            pushed++;

        } catch (err: any) {
            const msg = `"${targetDevice.name}": ${zkErrMsg(err)}`;
            errors.push(msg);
            console.error(`[Propagate] ✗ Failed to write to ${msg}`);
        } finally {
            try { await tgtZk.disconnect(); } catch { /* ignore */ }
            releaseDeviceLock(targetDevice.id);
        }
    }

    // 6. Zero template buffers — biometric data must not linger in memory
    for (const tmpl of templates) {
        tmpl.data.fill(0);
    }
    templates.length = 0;

    return { success: errors.length === 0, pushed, errors };
};

/**
 * Background worker to detect a newly enrolled fingerprint template on the
 * source device and propagate it to all other active devices.
 *
 * Polls the source device every 4 seconds for up to 60 seconds waiting for
 * the user to complete the 3-scan enrollment sequence. Once detected, calls
 * propagateFingerprintToAllDevices() for in-memory cross-device distribution.
 *
 * SECURITY: No template data is stored in the database. The previous DB
 * storage code is commented out below — kept as a reference per the team's
 * decision to retain the BiometricTemplate table as an untouched fallback.
 */
async function extractAndDistributeTemplate(deviceId: number, employeeId: number, fingerIndex: number) {
    const employee = await prisma.employee.findUnique({ where: { id: employeeId } });
    const dbDevice = await prisma.device.findUnique({ where: { id: deviceId } });
    
    if (!employee || !employee.zkId || !dbDevice) return;

    const deviceUid = employee.zkId;
    let found = false;

    console.log(`[BiometricSync] Waiting for user to scan finger... started polling device "${dbDevice.name}".`);

    // Poll up to 15 times (60 seconds) waiting for the user to finish the 3 scans
    for (let attempts = 0; attempts < 15; attempts++) {
        await new Promise(r => setTimeout(r, 4000)); // wait 4 seconds
        
        await acquireDeviceLock(dbDevice.id);
        const zk = getDriver(dbDevice.ip, dbDevice.port);
        try {
            await connectWithRetry(zk, 0);
            const template = await zk.getFingerTemplate(deviceUid, fingerIndex);
            if (template && template.length > 8) {
                found = true;
                console.log(
                    `[BiometricSync] ✓ Detected template for ${employee.firstName}`,
                    `on "${dbDevice.name}" — slot ${fingerIndex}, ${template.length} bytes.`,
                    `(attempt ${attempts + 1}/15)`
                );
            }
        } catch (e) {
            // ignore — device may still be processing enrollment
        } finally {
            try { await zk.disconnect(); } catch {}
            releaseDeviceLock(dbDevice.id);
        }

        if (found) break;
    }

    if (!found) {
        console.warn(`[BiometricSync] ⚠ Failed to detect template for ${employee.firstName} from ${dbDevice.name} after 60s. User may have aborted enrollment.`);
        return;
    }


    // ─── DB-driven propagation ─────────────────────────────────────────────
    // Use the same DB-driven per-slot sync as manual sync. By this point the
    // enrollment record for this finger already exists in the DB, so
    // syncEmployeeFingerprints will identify exactly which devices are missing
    // this fingerIndex and push only that specific slot — never touching
    // existing templates on devices that already have them.
    console.log(`[BiometricSync] Starting in-memory propagation for ${employee.firstName}...`);

    const result = await syncEmployeeFingerprints(employeeId);

    if (result.success) {
        const synced = result.results.filter(r => r.status === 'synced').length;
        console.log(
            `[BiometricSync] ✓ Propagation complete:`,
            `${synced} device(s) updated.`
        );
    } else {
        const errors = result.results.filter(r => r.error).map(r => `${r.deviceName}: ${r.error}`);
        console.warn(
            `[BiometricSync] ⚠ Propagation partial or failed:`,
            errors.length > 0 ? errors.join('; ') : result.message
        );
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// DEBUG & FORCED SYNC
// ─────────────────────────────────────────────────────────────────────────────
// RFID BADGE CARD ENROLLMENT
// Writes a card number into the user record on ALL active devices, then
// persists it to the Employee DB row.
// ─────────────────────────────────────────────────────────────────────────────
export const enrollEmployeeCard = async (
    employeeId: number,
    cardNumber: number,
    targetDeviceId?: number,
): Promise<SyncResult> => {
    console.log(`[CardEnroll] Starting for employee ${employeeId}, card ${cardNumber}...`);

    // 1. Load employee from DB
    const employee = await prisma.employee.findUnique({
        where: { id: employeeId },
        select: { id: true, zkId: true, firstName: true, lastName: true, role: true, cardNumber: true },
    });

    if (!employee) {
        return { success: false, message: `Employee ${employeeId} not found in database.` };
    }

    if (!employee.zkId) {
        return { success: false, message: `Employee ${employeeId} has no zkId assigned. Sync to device first.` };
    }

    // 2. Validate card number uniqueness
    const existingHolder = await prisma.employee.findUnique({
        where: { cardNumber },
        select: { id: true, firstName: true, lastName: true },
    });

    if (existingHolder && existingHolder.id !== employeeId) {
        return {
            success: false,
            message: `Card #${cardNumber} is already assigned to ${existingHolder.firstName} ${existingHolder.lastName}.`,
            error: 'duplicate_card',
        };
    }

    // 3. Queue the update for target device (or globally)
    const fullName = `${employee.firstName} ${employee.lastName}`;
    const deviceRole = employee.role === 'ADMIN' ? 14 : 0;
    const { enqueueGlobalUpsertUser, enqueueUpsertUser, processDeviceSyncQueue } = require('./deviceSyncQueue.service');

    try {
        if (targetDeviceId) {
            await enqueueUpsertUser(targetDeviceId, {
                zkId: employee.zkId,
                name: fullName,
                role: deviceRole,
                card: cardNumber
            });
            // Try inline execution
            setImmediate(async () => {
                const dev = await prisma.device.findUnique({ where: { id: targetDeviceId } });
                if (dev?.isActive && dev?.syncEnabled) {
                    try { await processDeviceSyncQueue(targetDeviceId); } catch { /* retry */ }
                }
            });
        } else {
            await enqueueGlobalUpsertUser({
                zkId: employee.zkId,
                name: fullName,
                role: deviceRole,
                card: cardNumber
            });
            // Try inline execution for all active
            setImmediate(async () => {
                const onlineDevices = await prisma.device.findMany({
                    where: { isActive: true, syncEnabled: true },
                    select: { id: true },
                });
                for (const d of onlineDevices) {
                    try { await processDeviceSyncQueue(d.id); } catch { /* retry */ }
                }
            });
        }

        // 4. Persist to DB
        await prisma.employee.update({
            where: { id: employeeId },
            data: { cardNumber, updatedAt: new Date() },
        });

        return {
            success: true,
            message: `Card #${cardNumber} enrolled for ${fullName} and queued for sync.`,
            results: [],
        };
    } catch (err: unknown) {
        console.error('[CardEnroll] Queue Error:', err);
        return { success: false, message: `Failed to queue card enrollment: ${zkErrMsg(err)}` };
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// RFID BADGE CARD DELETION
// Clears card data from the user record on ALL active devices, then removes
// it from the Employee DB row.
// ─────────────────────────────────────────────────────────────────────────────
export const deleteEmployeeCard = async (
    employeeId: number,
    targetDeviceId?: number,
): Promise<SyncResult> => {
    console.log(`[CardDelete] Starting for employee ${employeeId}...`);

    const employee = await prisma.employee.findUnique({
        where: { id: employeeId },
        select: { id: true, zkId: true, firstName: true, lastName: true, role: true, cardNumber: true },
    });

    if (!employee) return { success: false, message: `Employee ${employeeId} not found in database.` };
    if (!employee.zkId) return { success: false, message: `Employee ${employeeId} has no zkId assigned.` };
    if (!employee.cardNumber) return { success: true, message: `Employee already has no card assigned.` };

    const fullName = `${employee.firstName} ${employee.lastName}`;
    const deviceRole = employee.role === 'ADMIN' ? 14 : 0;
    const { enqueueGlobalUpsertUser, enqueueUpsertUser, processDeviceSyncQueue } = require('./deviceSyncQueue.service');

    try {
        if (targetDeviceId) {
            await enqueueUpsertUser(targetDeviceId, {
                zkId: employee.zkId,
                name: fullName,
                role: deviceRole,
                card: 0 // Clear the card value
            });
            await prisma.employeeCardEnrollment.deleteMany({
                where: { employeeId, deviceId: targetDeviceId }
            });
            // Try inline execution
            setImmediate(async () => {
                const dev = await prisma.device.findUnique({ where: { id: targetDeviceId } });
                if (dev?.isActive && dev?.syncEnabled) {
                    try { await processDeviceSyncQueue(targetDeviceId); } catch { /* retry */ }
                }
            });
        } else {
            await enqueueGlobalUpsertUser({
                zkId: employee.zkId,
                name: fullName,
                role: deviceRole,
                card: 0
            });
            // Try inline execution for all active
            setImmediate(async () => {
                const onlineDevices = await prisma.device.findMany({
                    where: { isActive: true, syncEnabled: true },
                    select: { id: true },
                });
                for (const d of onlineDevices) {
                    try { await processDeviceSyncQueue(d.id); } catch { /* retry */ }
                }
            });
        }

        // Drop global configuration state
        if (!targetDeviceId) {
            await prisma.employee.update({
                where: { id: employeeId },
                data: { cardNumber: null, updatedAt: new Date() },
            });
            await prisma.employeeCardEnrollment.deleteMany({
                where: { employeeId }
            });
        }

        return {
            success: true,
            message: `Card removal queued successfully.`
        };
    } catch (err: unknown) {
        console.error('[CardDelete] Queue Error:', err);
        return { success: false, message: `Failed to queue card deletion: ${zkErrMsg(err)}` };
    }
};



export const testDeviceConnection = async (): Promise<SyncResult> => {
    const zk = getDriver();
    // Sentinel device ID 0 — testDeviceConnection uses env-var defaults, not a DB device,
    // so it gets its own lock slot that never conflicts with real DB device IDs (which start at 1).
    await acquireDeviceLock(0);
    try {
        await connectWithRetry(zk);

        let serial = 'N/A';
        try {
            const info = await zk.getInfo();
            serial = info?.serialNumber ?? 'N/A';
        } catch {
            console.warn('[ZK] getInfo() failed (UDP may be blocked) — serial unavailable.');
        }

        let timePart = '';
        try {
            const time = await zk.getTime();
            timePart = `, Time: ${JSON.stringify(time)}`;
        } catch {
            // getTime() failure is non-fatal
        }

        return { success: true, message: `Connected! Serial: ${serial}${timePart}` };
    } catch (error: any) {
        return { success: false, error: error.message };
    } finally {
        try { await zk.disconnect(); } catch { /* ignore disconnect errors */ }
        releaseDeviceLock(0);
    }
};

export const syncEmployeesFromDevice = async (): Promise<SyncResult> => {
    try {
        const dbDevices = await prisma.device.findMany({
            where: { isActive: true, syncEnabled: true },
            orderBy: { id: 'asc' },
        });

        if (dbDevices.length === 0) {
            return { success: true, message: 'No active, sync-enabled devices configured.' };
        }

        let totalUpdateCount = 0;
        let totalSkippedCount = 0;

        for (const dbDevice of dbDevices) {
            await acquireDeviceLock(dbDevice.id);
            const zk = getDriver(dbDevice.ip, dbDevice.port);
            try {
                console.log(`[ZK] syncEmployeesFromDevice — connecting to "${dbDevice.name}" (${dbDevice.ip}:${dbDevice.port})...`);
                await connectWithRetry(zk);
                const users = await zk.getUsers();

                console.log(`[ZK] Found ${users.length} users on "${dbDevice.name}".`);
                let updateCount = 0;
                let skippedCount = 0;

                for (const user of users) {
                    let zkId = parseInt(user.userId);
                    if (isNaN(zkId)) continue;

                    // SPECIAL CASE: Map Device Admin (2948876) to Database Admin (1)
                    if (zkId === 2948876) {
                        zkId = 1;
                    }

                    const existing = await prisma.employee.findUnique({ where: { zkId } });

                    if (existing) {
                        const nameParts = user.name.split(' ');
                        const firstName = nameParts[0] || existing.firstName;
                        const lastName = nameParts.slice(1).join(' ') || existing.lastName;

                        if (user.name && (existing.firstName !== firstName || existing.lastName !== lastName)) {
                            await prisma.employee.update({
                                where: { id: existing.id },
                                data: { firstName, lastName }
                            });
                            console.log(`[ZK] Updated Name for zkId=${zkId}: ${user.name}`);
                        }
                        updateCount++;
                    } else {
                        // Unknown device user — do NOT auto-create in DB.
                        // Ghost users are handled by reconcileDeviceWithDB, not this function.
                        console.log(`[ZK] Skipping unknown zkId ${zkId} — not in database`);
                        skippedCount++;
                    }
                }

                totalUpdateCount += updateCount;
                totalSkippedCount += skippedCount;
                console.log(`[ZK] "${dbDevice.name}" done. Matched: ${updateCount}, Skipped: ${skippedCount}.`);

            } catch (err: any) {
                console.error(`[ZK] Failed to read users from "${dbDevice.name}": ${zkErrMsg(err)}`);
            } finally {
                try { await zk.disconnect(); } catch { /* ignore */ }
                releaseDeviceLock(dbDevice.id);
            }
        }

        return {
            success: true,
            message: `Scanned ${dbDevices.length} device(s). Matched ${totalUpdateCount}, Skipped ${totalSkippedCount} unknown.`,
            count: totalUpdateCount,
        };

    } catch (error: any) {
        return { success: false, error: error.message };
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// RECONCILE: Two-way sync between a specific device and the database.
//
// Safety rules:
//   1. NEVER delete device users with role > 0 (device admins).
//   2. NEVER delete device users in PROTECTED_DEVICE_UIDS list.
//   3. Use UID = zkId for all writes (deterministic, no collisions).
//   4. Force-clear slot before each write (prevents stale fingerprint data).
// ─────────────────────────────────────────────────────────────────────────────

export interface ReconcileReport {
    deviceId: number;
    deviceName: string;
    dryRun: boolean;                                    // true = preview only, no writes made
    pushed: { zkId: number; name: string }[];           // DB-only → pushed to device (or would be)
    deleted: { uid: number; userId: string; name: string }[]; // device-only → removed (or would be)
    protected: { uid: number; name: string }[];          // admin users skipped
    needsEnrollment: { zkId: number; name: string }[];  // users with 0 fingerprints
    errors: string[];
}

/**
 * Two-way sync between a specific device and the database.
 *
 * Safety rules enforced on every run:
 *   1. NEVER delete device users with role > 0 (device admins).
 *   2. NEVER delete device users in PROTECTED_DEVICE_UIDS list.
 *   3. Use UID = zkId for all writes (deterministic, no collisions).
 *   4. Force-clear slot before each write (prevents stale fingerprint data).
 *
 * @param deviceId  DB id of the device to reconcile.
 * @param dryRun    When true, the report shows what WOULD change but no writes
 *                  are made to the device. Use this for a safe preview before
 *                  committing to a potentially destructive operation in production.
 *                  Defaults to false.
 * @param pushOnly  When true, ONLY push DB-only employees to the device —
 *                  never delete ghost users. This is used by auto-reconcile
 *                  on device reconnect to safely push missing employees without
 *                  risking deletion of pre-existing data on shared or newly
 *                  added devices. Defaults to false.
 */
export const reconcileDeviceWithDB = async (deviceId: number, dryRun: boolean = false, pushOnly: boolean = false): Promise<ReconcileReport> => {
    const report: ReconcileReport = {
        deviceId,
        deviceName: '',
        dryRun,
        pushed: [],
        deleted: [],
        protected: [],
        needsEnrollment: [],
        errors: [],
    };

    if (dryRun) {
        console.log(`[Reconcile] 🔍 DRY RUN — no writes will be made to the device.`);
    }

    // 1. Load device config from DB
    const dbDevice = await prisma.device.findUnique({ where: { id: deviceId } });
    if (!dbDevice) throw new Error(`Device ${deviceId} not found in DB`);
    report.deviceName = dbDevice.name;

    // 2. Load all active DB employees, including their card enrollment for this device
    const dbEmployees = await prisma.employee.findMany({
        where: { zkId: { not: null }, employmentStatus: 'ACTIVE' },
        select: { 
            id: true, zkId: true, firstName: true, lastName: true, role: true, cardNumber: true,
            EmployeeCardEnrollment: { where: { deviceId } }
        }
    });
    const dbByZkId = new Map(dbEmployees.map(e => [e.zkId!.toString(), e]));

    await acquireDeviceLock(deviceId);
    const zk = getDriver(dbDevice.ip, dbDevice.port);

    try {
        console.log(`[Reconcile] Connecting to "${dbDevice.name}" (${dbDevice.ip}:${dbDevice.port})...`);
        await connectWithRetry(zk, 2);

        // ── PRE-RECONCILE: Sweep Pending Global Deletions ───────────────────
        // (Moved to DeviceSyncTask queue. Manual reconcile no longer handles this natively)

        // 3. Get all users currently on device
        const deviceUsers = await zk.getUsers();
        console.log(`[Reconcile] Device has ${deviceUsers.length} users. DB has ${dbEmployees.length} active employees.`);

        // CRITICAL: Trim userId strings — ZKTeco devices often store userId with
        // trailing whitespace (e.g., "2 " instead of "2"). Without trimming,
        // every Map.has() lookup fails and ALL users get re-pushed destructively.
        const deviceByVisibleId = new Map(deviceUsers.map((u: any) => [String(u.userId).trim(), u]));
        // Also build a UID-based lookup for secondary matching
        const deviceByUid = new Map(deviceUsers.map((u: any) => [u.uid as number, u]));

        // ── STEP A: Delete device-only ghost users ──────────────────────────
        // Skipped entirely in pushOnly mode (auto-reconcile) to prevent
        // accidental deletion of pre-existing users on shared or newly added
        // devices. Ghost deletion is only performed during manual reconcile.
        if (pushOnly) {
            console.log(`[Reconcile] ⏩ Push-only mode — skipping ghost user deletion.`);
        } else {
        for (const dUser of deviceUsers) {
            const uid = dUser.uid;
            const visibleId = String(dUser.userId).trim();

            // Skip protected UIDs
            if (PROTECTED_DEVICE_UIDS.includes(uid)) {
                report.protected.push({ uid, name: dUser.name });
                continue;
            }

            // Skip device admins (role > 0) — never auto-delete admin accounts
            if ((dUser.role ?? 0) > 0) {
                report.protected.push({ uid, name: dUser.name });
                console.log(`[Reconcile] ⛔ Skipping admin UID=${uid} ("${dUser.name}") — protected.`);
                continue;
            }

            // Check if this user maps to an active DB employee (trimmed comparison)
            if (!dbByZkId.has(visibleId)) {
                // Ghost user — not in DB.
                if (dryRun) {
                    // Dry-run: record what would be deleted, touch nothing.
                    report.deleted.push({ uid, userId: visibleId, name: dUser.name });
                    console.log(`[Reconcile] 🔍 Would delete ghost UID=${uid} visibleId="${visibleId}" ("${dUser.name}").`);
                } else {
                    // Live run: delete the ghost from the device.
                    console.log(`[Reconcile] 🗑 Deleting ghost user UID=${uid} visibleId="${visibleId}" ("${dUser.name}")...`);
                    try {
                        await zk.clearUserFingerprints(uid);
                        await zk.deleteUser(uid);
                        report.deleted.push({ uid, userId: visibleId, name: dUser.name });
                        console.log(`[Reconcile] ✓ Deleted ghost UID=${uid}.`);
                    } catch (err: any) {
                        const msg = `Failed to delete UID=${uid}: ${zkErrMsg(err)}`;
                        report.errors.push(msg);
                        console.error(`[Reconcile] ✗ ${msg}`);
                    }
                }
            }
        }
        } // end if (!pushOnly)

        // ── STEP B: Push DB-only employees to device ────────────────────────
        for (const emp of dbEmployees) {
            const zkId = emp.zkId!;
            const visibleId = zkId.toString();
            const fullName = `${emp.firstName} ${emp.lastName}`;
            const deviceRole = emp.role === 'ADMIN' ? 14 : 0;

            if (PROTECTED_DEVICE_UIDS.includes(zkId)) continue;

            // Check by trimmed visibleId first, then by UID as fallback.
            // This prevents false "not on device" when the string has trailing spaces
            // or the user was written with a different visibleId format.
            const existsOnDevice = deviceByVisibleId.has(visibleId) || deviceByUid.has(zkId);

            const expectedCard = emp.EmployeeCardEnrollment.length > 0
                ? (emp.cardNumber || 0) : 0;

            if (!existsOnDevice) {
                // Employee in DB but genuinely not on device.
                if (dryRun) {
                    // Dry-run: record what would be pushed, touch nothing.
                    report.pushed.push({ zkId, name: fullName });
                    report.needsEnrollment.push({ zkId, name: fullName });
                    console.log(`[Reconcile] 🔍 Would push "${fullName}" (zkId=${zkId}) [Card: ${expectedCard}] to device.`);
                } else {
                    console.log(`[Reconcile] ➕ Pushing "${fullName}" (zkId=${zkId}) [Card: ${expectedCard}] to device...`);
                    try {
                        await zk.setUser(zkId, fullName, "", deviceRole, expectedCard, visibleId);
                        report.pushed.push({ zkId, name: fullName });
                        // Newly pushed user has no fingerprints yet
                        report.needsEnrollment.push({ zkId, name: fullName });
                        console.log(`[Reconcile] ✓ Pushed "${fullName}" to UID=${zkId}.`);
                    } catch (err: any) {
                        const msg = `Failed to push "${fullName}": ${zkErrMsg(err)}`;
                        report.errors.push(msg);
                        console.error(`[Reconcile] ✗ ${msg}`);
                    }
                }
            } else {
                // User exists on device — check finger count and check card state
                const dUser = deviceByVisibleId.get(visibleId) ?? deviceByUid.get(zkId);
                const actualCard = Number(dUser.cardno || 0);

                if (actualCard !== expectedCard && !dryRun) {
                    console.log(`[Reconcile] 🔄 Fixing card for "${fullName}" (UID=${zkId}): Device has ${actualCard}, expected ${expectedCard}...`);
                    try {
                        await zk.setUser(zkId, fullName, "", deviceRole, expectedCard, visibleId);
                        console.log(`[Reconcile] ✓ Updated card for "${fullName}".`);
                    } catch (err: any) {
                        console.error(`[Reconcile] ✗ Failed to update card for "${fullName}": ${zkErrMsg(err)}`);
                        report.errors.push(`Failed to update card for ${fullName}`);
                    }
                } else if (actualCard !== expectedCard && dryRun) {
                     console.log(`[Reconcile] 🔍 Would update card for "${fullName}" (UID=${zkId}): Device has ${actualCard}, expected ${expectedCard}...`);
                }

                try {
                    const fingerCount = await zk.getFingerCount(dUser.uid);
                    if (fingerCount === 0) {
                        report.needsEnrollment.push({ zkId, name: fullName });
                        console.log(`[Reconcile] ⚠ "${fullName}" (UID=${dUser.uid}) has 0 fingerprints — needs enrollment.`);
                    }
                } catch {
                    // getFingerCount is best-effort; non-critical
                }
            }
        }

        // Skip refresh and isActive update in dry-run — the device state was not changed
        if (!dryRun) {
            await zk.refreshData();
            await prisma.device.update({ where: { id: deviceId }, data: { isActive: true, updatedAt: new Date() } });

            // Fire async fingerprint sync for users that were newly pushed or found missing fingerprints
            if (report.needsEnrollment.length > 0) {
                console.log(`[Reconcile] 🔄 Spawning background fingerprint sync for ${report.needsEnrollment.length} user(s)...`);
                setImmediate(async () => {
                    for (const { zkId } of report.needsEnrollment) {
                        try {
                            const emp = await prisma.employee.findUnique({ where: { zkId }, select: { id: true } });
                            // Await sequentially to avoid overwhelming the device locks
                            if (emp) await syncEmployeeFingerprints(emp.id);
                        } catch (err: any) {
                            console.error(`[Reconcile] Background sync failed for zkId ${zkId}:`, err.message);
                        }
                    }
                });
            }
        }

        const mode = dryRun ? 'DRY RUN preview' : 'Live run';
        console.log(`[Reconcile] ✅ ${mode} complete. Pushed: ${report.pushed.length}, Deleted: ${report.deleted.length}, Needs enrollment: ${report.needsEnrollment.length}, Protected: ${report.protected.length}`);

        return report;

    } catch (error: any) {
        const msg = zkErrMsg(error);
        console.error(`[Reconcile] Fatal error: ${msg}`);
        // Mark device offline
        await prisma.device.update({ where: { id: deviceId }, data: { isActive: false, updatedAt: new Date() } }).catch(() => { });
        throw new Error(`Reconcile failed: ${msg}`);
    } finally {
        try { await zk.disconnect(); } catch { /* ignore */ }
        releaseDeviceLock(deviceId);
    }
};

/**
 * Sync the clock of ALL active devices to the server's PHT time.
 * Called by the cron job every hour — no attendance data is touched.
 */
export const syncAllDeviceClocks = async (): Promise<void> => {
    const activeDevices = await prisma.device.findMany({
        where: { isActive: true, syncEnabled: true }
    });

    if (activeDevices.length === 0) {
        console.log('[ClockSync] No active devices found.');
        return;
    }

    console.log(`[ClockSync] Syncing time on ${activeDevices.length} device(s)...`);

    for (const device of activeDevices) {
        // Use non-blocking lock — skip this device if already busy with attendance sync or enrollment
        if (!tryAcquireDeviceLock(device.id)) {
            console.warn(`[ClockSync] Skipping "${device.name}" — device busy.`);
            continue;
        }
        try {
            const zk = getDriver(device.ip, device.port || 4370);
            await zk.connect();
            try {
                const nowUTC = new Date();
                await zk.setTime(nowUTC);
                console.log(`[ClockSync] ✓ "${device.name}" (${device.ip}) — time set to PHT`);
            } finally {
                await zk.disconnect();
            }
        } catch (err: any) {
            console.warn(`[ClockSync] ✗ "${device.name}" (${device.ip}) — failed: ${err.message}`);
        } finally {
            releaseDeviceLock(device.id);
        }
    }

    console.log('[ClockSync] Done.');
};

/**
 * Clears the attendance log buffer from every active, sync-enabled device.
 * Executes sequentially (never in parallel) to avoid overloading devices.
 *
 * Called exclusively by the LogBufferMaintenanceScheduler — never inline
 * during the 30s attendance sync cycle.
 *
 * Returns a report of which devices were cleared and which failed.
 */
export const clearAllDeviceLogBuffers = async (): Promise<{
    clearedDevices: number;
    failedDevices: Array<{ id: number; name: string; error: string }>;
}> => {
    const activeDevices = await prisma.device.findMany({
        where: { isActive: true, syncEnabled: true },
        select: { id: true, name: true, ip: true, port: true },
        orderBy: { id: 'asc' },
    });

    if (activeDevices.length === 0) {
        console.log('[LogBufferMaintenance] No active devices found — nothing to clear.');
        return { clearedDevices: 0, failedDevices: [] };
    }

    console.log(`[LogBufferMaintenance] Clearing log buffers on ${activeDevices.length} device(s)...`);

    let clearedDevices = 0;
    const failedDevices: Array<{ id: number; name: string; error: string }> = [];

    for (const device of activeDevices) {
        // Non-blocking lock check — skip device if busy with sync or enrollment
        if (!tryAcquireDeviceLock(device.id)) {
            console.warn(`[LogBufferMaintenance] "${device.name}" is busy — skipping this run.`);
            failedDevices.push({ id: device.id, name: device.name, error: 'Device busy — try again later' });
            continue;
        }

        const zk = getDriver(device.ip, device.port);
        try {
            await connectWithRetry(zk, 2);
            await zk.clearAttendanceLogs();
            console.log(`[LogBufferMaintenance] ✓ "${device.name}" log buffer cleared.`);
            clearedDevices++;
        } catch (err: unknown) {
            const errMsg = err instanceof Error ? err.message : zkErrMsg(err);
            console.error(`[LogBufferMaintenance] ✗ "${device.name}" failed: ${errMsg}`);
            failedDevices.push({ id: device.id, name: device.name, error: errMsg });
        } finally {
            try { await zk.disconnect(); } catch { /* ignore */ }
            releaseDeviceLock(device.id);
        }
    }

    return { clearedDevices, failedDevices };
};

/**
 * Delete a specific fingerprint from a specific device.
 *
 * 1. Connects to the target device
 * 2. Clears the finger template slot (preserving other slots)
 * 3. Removes the EmployeeFingerprintEnrollment metadata row
 * 4. Verifies deletion succeeded on the device
 *
 * Does NOT affect other devices or other fingers.
 */
export const deleteFingerprintFromDevice = async (
    employeeId: number,
    fingerIndex: number,
    deviceId: number
): Promise<{ success: boolean; message: string }> => {
    const employee = await prisma.employee.findUnique({
        where: { id: employeeId },
        select: { id: true, zkId: true, firstName: true, lastName: true },
    });

    if (!employee?.zkId) {
        return { success: false, message: 'Employee not found or has no zkId' };
    }

    const device = await prisma.device.findUnique({ where: { id: deviceId } });
    if (!device) {
        return { success: false, message: 'Device not found' };
    }

    if (!device.isActive) {
        return { success: false, message: `Device "${device.name}" is offline` };
    }

    const fullName = `${employee.firstName} ${employee.lastName}`;
    const fingerLabel = `Finger ${fingerIndex + 1}`;

    await acquireInteractiveDeviceLock(deviceId);
    const zk = getDriver(device.ip, device.port);

    try {
        await connectWithRetry(zk, 1);

        console.log(`[DeleteFinger] Deleting ${fingerLabel} for ${fullName} from "${device.name}"...`);

        // Step 1: Delete only the specific finger index
        await zk.deleteFingerTemplate(employee.zkId, fingerIndex);
        await zk.refreshData();

        // Step 2: Verify the target slot is actually empty
        const verifyTemplate = await zk.getFingerTemplate(employee.zkId, fingerIndex);
        if (verifyTemplate !== null) {
            console.warn(`[DeleteFinger] ⚠ Verification failed — template still present in slot ${fingerIndex} on "${device.name}". Retrying clear...`);
            // Retry clear just this specific slot
            try {
                await zk.deleteFingerTemplate(employee.zkId, fingerIndex);
                await zk.refreshData();
            } catch { /* best effort retry */ }
            verifyTemplate.fill(0);
        }

        console.log(`[DeleteFinger] ✓ Deleted ${fingerLabel} for ${fullName} from "${device.name}".`);

        // Step 7: Remove fingerprint enrollment metadata from DB
        await prisma.employeeFingerprintEnrollment.deleteMany({
            where: { employeeId, deviceId, fingerIndex },
        });

        // Step 8: If no fingerprints remain on this device, remove the device-level enrollment
        const remaining = await prisma.employeeFingerprintEnrollment.count({
            where: { employeeId, deviceId },
        });

        if (remaining === 0) {
            await prisma.employeeDeviceEnrollment.deleteMany({
                where: { employeeId, deviceId },
            });
            console.log(`[DeleteFinger] No fingerprints remain on "${device.name}" — device enrollment record removed.`);
        }

        return { success: true, message: `${fingerLabel} deleted from "${device.name}"` };

    } catch (error: any) {
        console.error(`[DeleteFinger] Error:`, error);
        return { success: false, message: `Failed to delete fingerprint: ${zkErrMsg(error)}` };
    } finally {
        try { await zk.disconnect(); } catch { /* ignore */ }
        releaseDeviceLock(deviceId);
    }
};

/**
 * DB-driven per-slot fingerprint sync.
 *
 * Instead of reading ALL templates and comparing unreliable device slot numbers,
 * this function uses the database (EmployeeFingerprintEnrollment) as the source
 * of truth. For each target device it:
 *   1. Identifies which fingerIndices are MISSING from that device's DB records.
 *   2. Reads ONLY the missing fingerIndex from a source device that has it.
 *   3. Pushes ONLY that individual slot — never touching existing templates.
 *
 * This prevents the lossy read-write cycle from corrupting existing templates
 * and avoids ZKTeco's non-deterministic slot numbering entirely.
 */
export const syncEmployeeFingerprints = async (
    employeeId: number
): Promise<{
    success: boolean;
    message: string;
    results: Array<{ deviceId: number; deviceName: string; status: 'synced' | 'skipped' | 'failed' | 'offline'; error?: string }>;
}> => {
    const employee = await prisma.employee.findUnique({
        where: { id: employeeId },
        select: { id: true, zkId: true, firstName: true, lastName: true },
    });

    if (!employee?.zkId) {
        return { success: false, message: 'Employee not found or has no zkId', results: [] };
    }

    const fullName = `${employee.firstName} ${employee.lastName}`;

    // ── STEP 1: DB-driven gap analysis ─────────────────────────────────────
    const allDevices = await prisma.device.findMany({
        where: { isActive: true, syncEnabled: true },
        orderBy: { id: 'asc' },
    });

    if (allDevices.length === 0) {
        return { success: false, message: 'No active devices configured', results: [] };
    }

    const enrollments = await prisma.employeeFingerprintEnrollment.findMany({
        where: { employeeId },
        include: { device: { select: { id: true, name: true, isActive: true, syncEnabled: true, ip: true, port: true } } },
    });

    if (enrollments.length === 0) {
        return {
            success: false,
            message: `${fullName} has no fingerprint enrollments on any device. Enroll first.`,
            results: allDevices.map(d => ({ deviceId: d.id, deviceName: d.name, status: 'skipped' as const })),
        };
    }

    // Build map: fingerIndex → list of deviceIds that have it (sources)
    const fingerToSources = new Map<number, number[]>();
    for (const enrollment of enrollments) {
        if (!enrollment.device.isActive || !enrollment.device.syncEnabled) continue;
        if (!fingerToSources.has(enrollment.fingerIndex)) {
            fingerToSources.set(enrollment.fingerIndex, []);
        }
        fingerToSources.get(enrollment.fingerIndex)!.push(enrollment.deviceId);
    }

    const allFingerIndices = Array.from(fingerToSources.keys()).sort((a, b) => a - b);
    console.log(
        `[SyncFingers] ${fullName}: ${allFingerIndices.length} distinct finger(s) ` +
        `[${allFingerIndices.join(', ')}] enrolled in DB.`
    );

    // ── STEP 2: Per-device, per-slot sync ──────────────────────────────────
    const results: Array<{ deviceId: number; deviceName: string; status: 'synced' | 'skipped' | 'failed' | 'offline'; error?: string }> = [];

    for (const targetDevice of allDevices) {
        // Which fingerIndices does this device already have in the DB?
        const enrolledOnTarget = new Set(
            enrollments
                .filter(e => e.deviceId === targetDevice.id)
                .map(e => e.fingerIndex)
        );

        // Which fingerIndices are MISSING on this device?
        const missingFingers = allFingerIndices.filter(fi => !enrolledOnTarget.has(fi));

        if (missingFingers.length === 0) {
            results.push({ deviceId: targetDevice.id, deviceName: targetDevice.name, status: 'skipped' });
            console.log(`[SyncFingers] "${targetDevice.name}": all ${allFingerIndices.length} finger(s) already enrolled — skipping.`);
            continue;
        }

        console.log(
            `[SyncFingers] "${targetDevice.name}": missing finger(s) [${missingFingers.join(', ')}] — syncing.`
        );

        // ── STEP 3: Read each missing finger from a source, push to target ──
        let pushed = 0;
        const slotErrors: string[] = [];

        await acquireInteractiveDeviceLock(targetDevice.id);
        const tgtZk = getDriver(targetDevice.ip, targetDevice.port);

        try {
            await connectWithRetry(tgtZk, 1);

            // Ensure user record exists on target
            const deviceUsers = await tgtZk.getUsers();
            const userExists = deviceUsers.find(
                (u: any) => String(u.userId).trim() === String(employee.zkId)
            );
            if (!userExists) {
                await tgtZk.setUser(employee.zkId, fullName, '', 0, 0, String(employee.zkId));
                await tgtZk.refreshData();
                console.log(`[SyncFingers] Created user record on "${targetDevice.name}".`);
            }

            for (const fingerIndex of missingFingers) {
                // Find source devices for this fingerIndex (excluding the target itself)
                const candidateIds = (fingerToSources.get(fingerIndex) || [])
                    .filter(id => id !== targetDevice.id);

                if (candidateIds.length === 0) {
                    slotErrors.push(`Finger ${fingerIndex}: no source device`);
                    continue;
                }

                // Try each candidate until we get the template
                let templateData: Buffer | null = null;
                for (const srcDeviceId of candidateIds) {
                    const srcDevice = allDevices.find(d => d.id === srcDeviceId);
                    if (!srcDevice) continue;

                    await acquireInteractiveDeviceLock(srcDeviceId);
                    const srcZk = getDriver(srcDevice.ip, srcDevice.port);

                    try {
                        await connectWithRetry(srcZk, 1);
                        const raw = await srcZk.getFingerTemplate(employee.zkId, fingerIndex);
                        if (raw && raw.length > 0) {
                            templateData = Buffer.alloc(raw.length);
                            raw.copy(templateData);
                            raw.fill(0);
                            console.log(
                                `[SyncFingers] Read finger ${fingerIndex} (${templateData.length}B) from "${srcDevice.name}".`
                            );
                            break;
                        }
                    } catch (err: any) {
                        console.warn(
                            `[SyncFingers] Failed to read finger ${fingerIndex} from "${srcDevice.name}": ${zkErrMsg(err)}`
                        );
                    } finally {
                        try { await srcZk.disconnect(); } catch { /* ignore */ }
                        releaseDeviceLock(srcDeviceId);
                    }
                }

                if (!templateData) {
                    slotErrors.push(`Finger ${fingerIndex}: could not extract from any source`);
                    continue;
                }

                // Push this specific finger to the target
                try {
                    await tgtZk.setFingerTemplate(employee.zkId, fingerIndex, templateData);
                    pushed++;
                    console.log(
                        `[SyncFingers] ✓ Wrote finger ${fingerIndex} (${templateData.length}B) to "${targetDevice.name}".`
                    );

                    // Record in DB
                    const fingerLabel = FINGER_MAP[fingerIndex] || `Finger ${fingerIndex}`;
                    await prisma.employeeFingerprintEnrollment.upsert({
                        where: {
                            employeeId_deviceId_fingerIndex: {
                                employeeId, deviceId: targetDevice.id, fingerIndex,
                            },
                        },
                        update: { enrolledAt: new Date() },
                        create: { employeeId, deviceId: targetDevice.id, fingerIndex, fingerLabel },
                    });
                } catch (err: any) {
                    slotErrors.push(`Finger ${fingerIndex}: write failed — ${zkErrMsg(err)}`);
                } finally {
                    templateData.fill(0);
                }
            }

            if (pushed > 0) {
                await tgtZk.refreshData();
                await prisma.employeeDeviceEnrollment.upsert({
                    where: { employeeId_deviceId: { employeeId, deviceId: targetDevice.id } },
                    update: { enrolledAt: new Date() },
                    create: { employeeId, deviceId: targetDevice.id },
                });
            }

            const status = pushed > 0 ? 'synced' as const : 'skipped' as const;
            const errorMsg = slotErrors.length > 0 ? slotErrors.join('; ') : undefined;
            results.push({ deviceId: targetDevice.id, deviceName: targetDevice.name, status, error: errorMsg });
            console.log(
                `[SyncFingers] "${targetDevice.name}": wrote ${pushed}/${missingFingers.length} finger(s).` +
                (slotErrors.length > 0 ? ` Errors: ${slotErrors.join('; ')}` : '')
            );

        } catch (err: any) {
            const errMsg = zkErrMsg(err);
            results.push({ deviceId: targetDevice.id, deviceName: targetDevice.name, status: 'failed', error: errMsg });
            console.error(`[SyncFingers] ✗ Failed on "${targetDevice.name}": ${errMsg}`);
        } finally {
            try { await tgtZk.disconnect(); } catch { /* ignore */ }
            releaseDeviceLock(targetDevice.id);
        }
    }

    const synced = results.filter(r => r.status === 'synced').length;
    const failed = results.filter(r => r.status === 'failed').length;

    return {
        success: failed === 0,
        message: failed === 0
            ? `Fingerprints synced to ${synced} device(s) for ${fullName}.`
            : `Partial sync: ${synced} succeeded, ${failed} failed for ${fullName}.`,
        results,
    };
};
