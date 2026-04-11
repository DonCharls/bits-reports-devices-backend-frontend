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

// UIDs reserved for specific roles (e.g., 1 for SUPER ADMIN).
const PROTECTED_DEVICE_UIDS = [1];

// Starting zkId for regular employees.
const MIN_EMPLOYEE_ZK_ID = 2;

// Mutex to prevent race conditions during concurrent employee registrations.
let _registrationMutexBusy = false;
const _registrationMutexQueue: Array<() => void> = [];

/**
 * Acquires the registration mutex. Caller must release in a finally block.
 * Uses FIFO queue to prevent starvation.
 */
export async function acquireRegistrationMutex(): Promise<() => void> {
    return new Promise((resolve) => {
        const release = () => {
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
            _registrationMutexQueue.push(() => {
                _registrationMutexBusy = true;
                resolve(release);
            });
        }
    });
}

/**
 * Finds the lowest safe zkId not used in the database or on any active device.
 * Falls back to DB-only check if a device is offline.
 * @returns The next safe integer zkId >= MIN_EMPLOYEE_ZK_ID
 */
export const findNextSafeZkId = async (): Promise<number> => {
    // 1. Collect zkIds from DB.
    const dbEmployees = await prisma.employee.findMany({
        where: { zkId: { not: null } },
        select: { zkId: true },
    });

    const usedIds = new Set<number>([
        ...dbEmployees.map(e => e.zkId!),
        ...PROTECTED_DEVICE_UIDS,
    ]);

    // 2. Collect UIDs used on active devices.
    const activeDevices = await prisma.device.findMany({
        where: { isActive: true },
        orderBy: { id: 'asc' },
    });

    for (const dbDevice of activeDevices) {
        const zk = getDriver(dbDevice.ip, dbDevice.port);
        try {
            await connectWithRetry(zk, 1);
            const deviceUsers = await zk.getUsers();
            // node-zklib does not export its user type, so 'any' is required here
            deviceUsers.forEach((u: any) => {
                if (typeof u.uid === 'number') usedIds.add(u.uid);
            });
            console.log(`[ZK] findNextSafeZkId — scanned ${deviceUsers.length} UIDs from "${dbDevice.name}".`);
        } catch (err: any) {
            console.warn(`[ZK] findNextSafeZkId — could not reach "${dbDevice.name}" (${zkErrMsg(err)}).`);
        } finally {
            try { await zk.disconnect(); } catch { /* ignore disconnect errors */ }
        }
    }

    // 3. Find first available candidate.
    let candidate = MIN_EMPLOYEE_ZK_ID;
    while (usedIds.has(candidate)) {
        candidate++;
    }

    console.log(`[ZK] findNextSafeZkId — assigned zkId=${candidate} (checked ${usedIds.size} used IDs across DB + devices).`);
    return candidate;
};

/**
 * Converts Philippine Time (UTC+8) from the device to UTC.
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

/** Create a ZKDriver for a specific device. */
export const getDriver = (ip?: string, port?: number): ZKDriver => {
    const resolvedIp = ip ?? process.env.ZK_HOST ?? '192.168.1.201';
    const resolvedPort = port ?? parseInt(process.env.ZK_PORT || '4370');
    const timeout = parseInt(process.env.ZK_TIMEOUT || '30000');
    return new ZKDriver(resolvedIp, resolvedPort, timeout);
};

// Per-device lock system to manage concurrent TCP connections.

interface DeviceLockState {
    busy: boolean;
    interactivePending: boolean;
    queue: Array<() => void>;
    timeoutHandle: ReturnType<typeof setTimeout> | null;
}

// Key = device database ID.
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

// Safety timeout to prevent permanent deadlocks.
const LOCK_TIMEOUT_MS = 90_000;

/**
 * Acquires an interactive device lock (enrollment, addUser).
 * Bypasses background queue for priority handling.
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
            state.queue.unshift(() => {
                state.busy = true;
                resolve();
            });
        }
    });
}

/**
 * Acquires a background device lock.
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
 * Releases the device lock and proceeds to the next queued operation.
 */
export function releaseDeviceLock(deviceId: number): void {
    const state = getDeviceLockState(deviceId);
    if (state.timeoutHandle) {
        clearTimeout(state.timeoutHandle);
        state.timeoutHandle = null;
    }
    const next = state.queue.shift();
    if (next) {
        setTimeout(next, 500);
    } else {
        state.busy = false;
        state.interactivePending = false;
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Non-blocking lock attempt — used by the cron job.
// Returns true if the lock was acquired, false if the device is already busy.
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Non-blocking lock attempt for the cron job.
 * Returns false if the device is busy or an interactive operation is pending.
 */
export function tryAcquireDeviceLock(deviceId: number): boolean {
    const state = getDeviceLockState(deviceId);
    if (state.busy || state.interactivePending) {
        return false;
    }
    state.busy = true;
    state.timeoutHandle = setTimeout(() => {
        console.warn(`[ZK] ⚠ Cron lock auto-released after timeout (90s) for device ${deviceId}.`);
        releaseDeviceLock(deviceId);
    }, LOCK_TIMEOUT_MS);
    return true;
}

/**
 * Removes a fingerprint across all active devices.
 * If a device is offline, it is flagged for later reconciliation.
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

    await enqueueGlobalDeleteFinger(employee.id, employee.zkId, fingerIndex, fingerLabel);

    // Immediate processing for active devices.
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

// Releases device lock(s) via API. releases all if deviceId is omitted.
export function forceReleaseLock(deviceId?: number): void {
    if (deviceId !== undefined) {
        console.warn(`[ZK] Force-releasing device lock for device ${deviceId} via API.`);
        const state = getDeviceLockState(deviceId);
        state.queue.length = 0;
        if (state.timeoutHandle) { clearTimeout(state.timeoutHandle); state.timeoutHandle = null; }
        state.busy = false;
        state.interactivePending = false;
    } else {
        console.warn(`[ZK] Force-releasing ALL device locks via API.`);
        _deviceLocks.forEach((state, id) => {
            state.queue.length = 0;
            if (state.timeoutHandle) { clearTimeout(state.timeoutHandle); state.timeoutHandle = null; }
            state.busy = false;
            state.interactivePending = false;
        });
    }
}

// Extract error message from ZKDriver error objects.
export function zkErrMsg(err: any): string {
    if (!err) return 'Unknown error';
    if (typeof err === 'string') return err;
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

// Triggers background queue flush when a device reconnects.

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
        console.error(
            `[ZK] triggerAutoReconcile error for "${deviceName}": ${zkErrMsg(err)}`
        );
    }
}

// Syncs a single device (logs download and DB persistence).
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

    if (!tryAcquireDeviceLock(dbDevice.id)) {
        console.debug(`[ZK] Cron sync skipped for "${dbDevice.name}" — device is busy.`);
        return { deviceId: dbDevice.id, newLogs: 0, skipped: true };
    }

    // 1. Read the latest sync watermark for this device.
    const deviceRecord = await prisma.device.findUnique({
        where: { id: dbDevice.id },
        select: { lastSyncedAt: true },
    });

    // 2. Set watermark fallback (48 hours) to prevent gaps.
    const FALLBACK_WINDOW_MS = 48 * 60 * 60 * 1000;
    const watermark: Date = deviceRecord?.lastSyncedAt ?? new Date(Date.now() - FALLBACK_WINDOW_MS);

    console.log(`[ZK] "${dbDevice.name}" watermark: ${watermark.toISOString()} (${deviceRecord?.lastSyncedAt ? 'from DB' : '48h fallback'})`);

    const zk = getDriver(dbDevice.ip, dbDevice.port);
    try {
        console.log(`[ZK] Syncing device "${dbDevice.name}" at ${dbDevice.ip}:${dbDevice.port}...`);
        // Use 30s cron interval as the retry mechanism.
        await connectWithRetry(zk, 0);

        // Optional: Get serial info (UDP).
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

        // 3. Filter and sort logs by watermark.
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

        // Track insertion progress to advance the watermark.
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

                    if (diffMinutes < 1) {
                        void audit({
                            action: 'DUPLICATE_PUNCH',
                            level: 'WARN',
                            entityType: 'Attendance',
                            entityId: employee.id,
                            performedBy: employee.id,
                            source: 'device-sync',
                            details: `Duplicate punch detected for ${employee.firstName} ${employee.lastName} (${Math.round(diffMs / 1000)}s apart)`,
                            metadata: { employeeId: employee.id, zkId: zkUserId, diffSeconds: Math.round(diffMs / 1000), deviceId: dbDevice.id }
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
                        metadata: { employeeId: employee.id, zkId: zkUserId, diffSeconds: 0, deviceId: dbDevice.id }
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

                // Update watermark tracker.
                if (latestInsertedTimestamp === null || utcTime > latestInsertedTimestamp) {
                    latestInsertedTimestamp = utcTime;
                }
            } catch (logErr) {
                console.error(`[ZK] Error processing log:`, logErr);
            }
        }

        // 4. Persist the new watermark.
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

        // Log buffer clearing is handled by a separate maintenance job.
        // The DB watermark prevents duplicate imports.

        deviceEmitter.emit('device-sync-result', {
            id: dbDevice.id,
            lastSyncStatus: 'SUCCESS',
            lastSyncedAt: latestInsertedTimestamp || watermark,
            lastSyncError: null,
            lastPolledAt: new Date()
        });

        void audit({
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

        // Record sync failure.
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

        void audit({
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
        // Load all devices from DB.
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

        // Run all device syncs in parallel.
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

        // Process new logs into Attendance records.
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

        // Inline execution for online devices.
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

        // Inline execution for online devices.
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
                zkId: { not: null, gt: 1 },
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

                // Fetch all device users once to avoid redundant network requests.
                const deviceUsers = await zk.getUsers();

                for (const employee of employees) {
                    const fullName = `${employee.firstName} ${employee.lastName}`;
                    const zkId = employee.zkId!;
                    const visibleId = zkId.toString();
                    const deviceRole = employee.role === 'ADMIN' ? 14 : 0;
                    const deviceUid = zkId;

                    if (PROTECTED_DEVICE_UIDS.includes(deviceUid)) {
                        console.warn(`[ZK]   ⚠ SKIP ${fullName} — zkId=${zkId} is a protected UID.`);
                        continue;
                    }

                    try {
                        // Pre-write slot occupancy check. Skip if slot is held by a different user.
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
 * Verifies/adds user on device and starts enrollment.
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
        // Use specific device.
        dbDevice = await prisma.device.findUnique({ where: { id: deviceId } });
        if (!dbDevice) {
            return { success: false, message: `Device ${deviceId} not found in database.` };
        }
    } else {
        // Use first active device.
        dbDevice = await prisma.device.findFirst({
            where: { isActive: true },
            orderBy: { id: 'asc' },
        });
        if (!dbDevice) {
            return { success: false, message: 'No active devices configured.' };
        }
    }

    // Refuse enrollment if device is offline.
    if (!dbDevice.isActive) {
        return {
            success: false,
            message: `Device "${dbDevice.name}" is currently offline. Please wait for it to come back online before enrolling.`,
        };
    }

    const fullName = `${employee.firstName} ${employee.lastName}`;
    const visibleId = employee.zkId.toString();
    const deviceUid = employee.zkId;

    // Acquire interactive device lock for priority handling.
    await acquireInteractiveDeviceLock(dbDevice.id);
    const zk = getDriver(dbDevice.ip, dbDevice.port);


    try {
        console.log(`[Enrollment] Connecting to "${dbDevice.name}" (${dbDevice.ip}:${dbDevice.port})...`);
        // Connect with 1 retry for interactive flow.
        await connectWithRetry(zk, 1);

        const deviceUsers = await zk.getUsers();
        // Slot occupancy check.
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

        // Extract template in background.
        extractAndDistributeTemplate(dbDevice.id, employee.id, fingerIndex).catch(err => {
            console.error('[BiometricSync] Background task error:', err);
        });

        // Record enrollment in DB.
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

        // Record fingerprint metadata.
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
 * Reads fingerprint templates from source device and distributes to all active devices.
 * Templates are held in memory only and never stored in the database.
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

    // 1. Find all other active, sync-enabled devices.
    const targetDevices = await prisma.device.findMany({
        where: { isActive: true, syncEnabled: true, id: { not: sourceDeviceId } }
    });

    if (targetDevices.length === 0) {
        console.log('[Propagate] No other active devices — nothing to propagate.');
        return { success: true, pushed: 0, errors: [] };
    }

    const fullName = `${employee.firstName} ${employee.lastName}`;

    // 2. Read templates from source device.
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

    // Guard: ensure templates were read successfully.
    if (templates.length === 0) {
        return { success: false, pushed: 0,
            errors: ['No templates on source device — enrollment may not be complete yet'] };
    }

    // 3. Write templates to each target device sequentially.
    let pushed = 0;
    const errors: string[] = [];

    for (const targetDevice of targetDevices) {
        await acquireInteractiveDeviceLock(targetDevice.id);
        const tgtZk = getDriver(targetDevice.ip, targetDevice.port);

        try {
            await connectWithRetry(tgtZk, 2);

            // Ensure user record exists.
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
                // Write to empty slots only to prevent degradation.
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

            // Record device enrollment in DB.
            await prisma.employeeDeviceEnrollment.upsert({
                where: {
                    employeeId_deviceId: {
                        employeeId, deviceId: targetDevice.id
                    }
                },
                update: { enrolledAt: new Date() },
                create: { employeeId, deviceId: targetDevice.id }
            });

            // Record fingerprint metadata.
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

    // 4. Zero template buffers for security.
    for (const tmpl of templates) {
        tmpl.data.fill(0);
    }
    templates.length = 0;

    return { success: errors.length === 0, pushed, errors };
};

/**
 * Background worker to detect and propagate newly enrolled templates.
 * Polls source device for up to 60 seconds (15 attempts).
 */
async function extractAndDistributeTemplate(deviceId: number, employeeId: number, fingerIndex: number) {
    const employee = await prisma.employee.findUnique({ where: { id: employeeId } });
    const dbDevice = await prisma.device.findUnique({ where: { id: deviceId } });
    
    if (!employee || !employee.zkId || !dbDevice) return;

    const deviceUid = employee.zkId;
    let found = false;

    console.log(`[BiometricSync] Waiting for user to scan finger... started polling device "${dbDevice.name}".`);

    // Poll 15 times (60s) for enrollment completion.
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


    // Distribute via DB-driven propagation.
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

    // 1. Queue update for target device or globally.
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
            // Inline execution.
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
            // Inline execution for active devices.
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

        // 2. Persist to DB.
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

// Removes card data from devices and database.
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
                card: 0
            });
            await prisma.employeeCardEnrollment.deleteMany({
                where: { employeeId, deviceId: targetDeviceId }
            });
            // Inline execution.
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

        // Drop global configuration state.
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
    // Uses sentinel device ID 0 for the lock.
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
                        // Skip users not present in the database.
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

/**
 * Two-way sync between a specific device and the database.
 * Safety rules:
 * 1. Protected/Admin users are never deleted.
 * 2. UID matches zkId.
 * 3. Slots are cleared before writing.
 */

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
 * @param deviceId  Device ID to reconcile.
 * @param dryRun    If true, reports changes without writing.
 * @param pushOnly  If true, only pushes missing users without deleting ghosts.
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

    // Dynamically import Queue methods to avoid circular dependencies
    const { enqueueUpsertUser, enqueueDeleteUser, enqueueFingerprintPull, processDeviceSyncQueue } = await import('./deviceSyncQueue.service');

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

        // ── PRE-RECONCILE: Global Deletions Sweep (Handled by Queue) ───────

        // 3. Get all users currently on device
        const deviceUsers = await zk.getUsers();
        console.log(`[Reconcile] Device has ${deviceUsers.length} users. DB has ${dbEmployees.length} active employees.`);

        // Convert userId to trimmed format for accurate comparison.
        const deviceByVisibleId = new Map(deviceUsers.map((u: any) => [String(u.userId).trim(), u]));
        // Also build a UID-based lookup for secondary matching
        const deviceByUid = new Map(deviceUsers.map((u: any) => [u.uid as number, u]));

        // ── STEP B: Delete device-only ghost users ──────────────────────────
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

            // Skip device admins.
            if ((dUser.role ?? 0) > 0) {
                report.protected.push({ uid, name: dUser.name });
                console.log(`[Reconcile] ⛔ Skipping admin UID=${uid} ("${dUser.name}") — protected.`);
                continue;
            }

            // Check if user is active in DB.
            if (!dbByZkId.has(visibleId)) {
                // Ghost user — not in DB.
                if (dryRun) {
                    // Dry-run: record what would be deleted, touch nothing.
                    report.deleted.push({ uid, userId: visibleId, name: dUser.name });
                    console.log(`[Reconcile] 🔍 Would delete ghost UID=${uid} visibleId="${visibleId}" ("${dUser.name}").`);
                } else {
                    // Live run: delete the ghost from the device.
                    console.log(`[Reconcile] 🗑 Queuing deletion of ghost user UID=${uid} visibleId="${visibleId}" ("${dUser.name}")...`);
                    try {
                        await enqueueDeleteUser(deviceId, uid);
                        report.deleted.push({ uid, userId: visibleId, name: dUser.name });
                        console.log(`[Reconcile] ✓ Queued deletion of ghost UID=${uid}.`);
                    } catch (err: any) {
                        const msg = `Failed to queue delete for UID=${uid}: ${err.message}`;
                        report.errors.push(msg);
                        console.error(`[Reconcile] ✗ ${msg}`);
                    }
                }
            }
        }
        } // end if (!pushOnly)

        // ── STEP C: Push DB-only employees to device ────────────────────────
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
                    console.log(`[Reconcile] ➕ Queuing push for "${fullName}" (zkId=${zkId}) [Card: ${expectedCard}] to device...`);
                    try {
                        await enqueueUpsertUser(deviceId, { zkId, name: fullName, card: expectedCard, role: deviceRole });
                        report.pushed.push({ zkId, name: fullName });
                        // Newly pushed user has no fingerprints yet
                        report.needsEnrollment.push({ zkId, name: fullName });
                        console.log(`[Reconcile] ✓ Queued push of "${fullName}" to UID=${zkId}.`);
                    } catch (err: any) {
                        const msg = `Failed to queue push for "${fullName}": ${err.message}`;
                        report.errors.push(msg);
                        console.error(`[Reconcile] ✗ ${msg}`);
                    }
                }
            } else {
                // User exists on device — check finger count and check card state
                const dUser = deviceByVisibleId.get(visibleId) ?? deviceByUid.get(zkId);
                const actualCard = Number(dUser.cardno || 0);

                if (actualCard !== expectedCard && !dryRun) {
                    console.log(`[Reconcile] 🔄 Queuing card fix for "${fullName}" (UID=${zkId}): Device has ${actualCard}, expected ${expectedCard}...`);
                    try {
                        await enqueueUpsertUser(deviceId, { zkId, name: fullName, card: expectedCard, role: deviceRole });
                        console.log(`[Reconcile] ✓ Queued card update for "${fullName}".`);
                    } catch (err: any) {
                        console.error(`[Reconcile] ✗ Failed to queue card update for "${fullName}": ${err.message}`);
                        report.errors.push(`Failed to queue card update for ${fullName}`);
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
            await prisma.device.update({ where: { id: deviceId }, data: { isActive: true, updatedAt: new Date() } });

            // Fire async fingerprint queueing for users that were newly pushed or found missing fingerprints
            if (report.needsEnrollment.length > 0) {
                console.log(`[Reconcile] 🔄 Queuing fingerprint pulls for ${report.needsEnrollment.length} user(s)...`);
                for (const { zkId } of report.needsEnrollment) {
                    try {
                        const emp = await prisma.employee.findUnique({ where: { zkId }, select: { id: true } });
                        if (!emp) continue;

                        const enrollments = await prisma.employeeFingerprintEnrollment.findMany({
                            where: { employeeId: emp.id },
                            distinct: ['fingerIndex']
                        });

                        for (const { fingerIndex } of enrollments) {
                            await enqueueFingerprintPull(deviceId, { zkId, employeeId: emp.id, fingerIndex });
                        }
                    } catch (err: any) {
                        console.error(`[Reconcile] Failed to queue fingerprint for zkId ${zkId}:`, err.message);
                    }
                }
            }

            // Immediately trigger queue execution in the background
            setImmediate(() => {
                processDeviceSyncQueue(deviceId).catch(err => {
                    console.error('[Reconcile] Background queue runner failed:', err.message);
                });
            });
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
 * Syncs the clock of all active devices to server time.
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
 * Clears attendance log buffers from all active devices.
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
 * Deletes a specific fingerprint from a specific device.
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

    // ── STEP 2: Enumerate finger slots ───────────────────────────────────
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

        // ── STEP 3: Sync missing templates ──────────────────────────────────
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
