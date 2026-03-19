import { prisma } from '../lib/prisma';
import { ZKDriver } from '../lib/zk-driver';
import { processAttendanceLogs } from './attendance.service';

interface SyncResult {
    success: boolean;
    message?: string;
    error?: string;
    newLogs?: number;
    count?: number;
}

// UIDs on the device that must NEVER be overwritten by employee sync/add.
// UID 1 is the SUPER ADMIN on the ZKTeco device.
const PROTECTED_DEVICE_UIDS = [1];

// ─────────────────────────────────────────────────────────────────────────────
// The minimum zkId assignable to a regular employee.
// zkId 1 is always reserved for the device SUPER ADMIN.
// ─────────────────────────────────────────────────────────────────────────────
const MIN_EMPLOYEE_ZK_ID = 2;

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
const getDriver = (ip?: string, port?: number): ZKDriver => {
    const resolvedIp = ip ?? process.env.ZK_HOST ?? '192.168.1.201';
    const resolvedPort = port ?? parseInt(process.env.ZK_PORT || '4370');
    const timeout = parseInt(process.env.ZK_TIMEOUT || '10000');
    return new ZKDriver(resolvedIp, resolvedPort, timeout);
};

// ─────────────────────────────────────────────────────────────────────────────
// FIX 2: Device-busy lock
// The ZKTeco device only accepts ONE TCP connection at a time.
// This mutex ensures that concurrent API calls are queued instead of racing.
// ─────────────────────────────────────────────────────────────────────────────
let _deviceBusy = false;
const _deviceQueue: Array<() => void> = [];
let _lockTimeoutHandle: ReturnType<typeof setTimeout> | null = null;

// Safety timeout: if the lock is held for more than 90 seconds,
// auto-release it. This prevents permanent deadlock if a request
// crashes before reaching its finally{} block.
const LOCK_TIMEOUT_MS = 90_000;

// True while an interactive (UI-triggered) operation owns or is waiting for the lock.
// The cron job checks this flag before attempting to acquire — if set, it skips its tick
// entirely rather than queuing, ensuring the interactive operation is never delayed by
// a background sync that snuck in ahead of it.
let _interactiveLockActive = false;

/**
 * Blocking lock for interactive UI operations (enrollment, addUser).
 * Jumps to the FRONT of the queue so it is not delayed by already-queued cron syncs.
 * Sets _interactiveLockActive so subsequent cron ticks skip while this is pending/held.
 */
function acquireInteractiveDeviceLock(): Promise<void> {
    _interactiveLockActive = true;
    return new Promise((resolve) => {
        if (!_deviceBusy) {
            _deviceBusy = true;
            console.log('[ZK] Interactive lock acquired.');
            resolve();
        } else {
            console.log('[ZK] Device busy — interactive request jumping to front of queue...');
            // Unshift = front of queue, so this resolves before any already-queued cron syncs
            _deviceQueue.unshift(() => {
                _deviceBusy = true;
                resolve();
            });
        }
    });
}

/**
 * Blocking lock for background operations (syncEmployeesToDevice, deleteUserFromDevice, etc.).
 * Queues at the BACK — waits its turn behind any interactive operations.
 */
function acquireDeviceLock(): Promise<void> {
    return new Promise((resolve) => {
        if (!_deviceBusy) {
            _deviceBusy = true;
            _lockTimeoutHandle = setTimeout(() => {
                console.warn('[ZK] ⚠ Lock auto-released after timeout (90s). Previous operation may have crashed.');
                releaseDeviceLock();
            }, LOCK_TIMEOUT_MS);
            resolve();
        } else {
            console.log('[ZK] Device busy — queuing request...');
            _deviceQueue.push(() => {
                _deviceBusy = true;
                _lockTimeoutHandle = setTimeout(() => {
                    console.warn('[ZK] ⚠ Lock auto-released after timeout (90s).');
                    releaseDeviceLock();
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
function releaseDeviceLock(): void {
    if (_lockTimeoutHandle) {
        clearTimeout(_lockTimeoutHandle);
        _lockTimeoutHandle = null;
    }
    const next = _deviceQueue.shift();
    if (next) {
        // Small delay so the device can fully close the previous TCP socket
        setTimeout(next, 500);
    } else {
        _deviceBusy = false;
        // Only clear the interactive flag when the queue is fully drained —
        // if another interactive op is queued, it will set the flag again when it resolves.
        _interactiveLockActive = false;
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
function tryAcquireDeviceLock(): boolean {
    // Skip if device is busy OR if an interactive operation is pending/active.
    // _interactiveLockActive ensures a queued enrollment/addUser is never
    // pushed back by a cron tick that sneaks in before it resolves.
    if (_deviceBusy || _interactiveLockActive) {
        return false;
    }
    _deviceBusy = true;
    // Apply the same safety timeout as interactive and background locks so a
    // crashed cron tick never leaves the device permanently locked.
    _lockTimeoutHandle = setTimeout(() => {
        console.warn('[ZK] ⚠ Cron lock auto-released after timeout (90s).');
        releaseDeviceLock();
    }, LOCK_TIMEOUT_MS);
    return true;
}

// Force-release the lock from an external endpoint (e.g. POST /api/devices/unlock)
export function forceReleaseLock(): void {
    console.warn('[ZK] Force-releasing device lock via API.');
    _deviceQueue.length = 0;
    if (_lockTimeoutHandle) { clearTimeout(_lockTimeoutHandle); _lockTimeoutHandle = null; }
    _deviceBusy = false;
}

// ─────────────────────────────────────────────────────────────────────────────
// ZKError unwrapper — node-zklib throws { err: Error, ip, command } objects
// which don't have a .message property, so we extract it manually.
// ─────────────────────────────────────────────────────────────────────────────
function zkErrMsg(err: any): string {
    if (!err) return 'Unknown error';
    if (typeof err === 'string') return err;
    // ZKError shape: { err: Error, ip, command }
    if (err.err instanceof Error) return `${err.command || 'ZK'}: ${err.err.message}`;
    if (err.message) return err.message;
    return JSON.stringify(err);
}

async function connectWithRetry(zk: ZKDriver, maxRetries: number = 2): Promise<void> {
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

export const syncZkData = async (): Promise<SyncResult> => {
    // ── Cron-safe lock: SKIP if device is already busy ──────────────────────
    // The cron fires every 10 seconds. If a previous sync, enrollment, or
    // any other device operation is still running, we skip this tick instead
    // of queuing — the next cron tick will try again. This prevents an
    // ever-growing backlog of pending syncs from piling up.
    // ────────────────────────────────────────────────────────────────────────
    if (!tryAcquireDeviceLock()) {
        console.debug('[ZK] Cron sync skipped — device is busy with another operation.');
        return { success: true, message: 'Skipped — device busy' };
    }

    let totalNewLogs = 0;

    try {
        // Load ALL devices from the DB — this way IP changes via Configure take effect immediately
        const dbDevices = await prisma.device.findMany({ orderBy: { id: 'asc' } });

        if (dbDevices.length === 0) {
            console.warn('[ZK] No devices found in DB — skipping sync.');
            return { success: true, message: 'No devices configured', newLogs: 0 };
        }

        for (const dbDevice of dbDevices) {
            // Skip devices that have been manually disabled by an admin.
            if (dbDevice.syncEnabled === false) {
                console.debug(`[ZK] Skipping "${dbDevice.name}" — sync is disabled.`);
                continue;
            }
            const zk = getDriver(dbDevice.ip, dbDevice.port);
            console.log(`[ZK] Syncing device "${dbDevice.name}" at ${dbDevice.ip}:${dbDevice.port}...`);

            try {
                await connectWithRetry(zk);

                // getInfo() uses UDP — non-fatal if it fails (device still works via TCP)
                try {
                    const info = await zk.getInfo();
                    console.log(`[ZK] Connected! Serial: ${info?.serialNumber ?? 'N/A'}`);
                } catch {
                    console.warn(`[ZK] getInfo() failed (UDP may be blocked) — continuing with TCP only.`);
                }

                // Mark ONLINE using device.id (not the env-var IP) so Configure changes apply immediately
                await prisma.device.update({
                    where: { id: dbDevice.id },
                    data: { isActive: true, updatedAt: new Date() }
                }).catch(() => { /* ignore */ });

                // ENFORCE SOURCE OF TRUTH: Force the device's clock to match the Backend Server Time
                // This prevents physical clock drift on the hardware. 
                // The device expects the time in its local timezone (PHT UTC+8), so we send it raw 'new Date()'.
                try {
                    await zk.setTime(new Date());
                    console.log(`[ZK] Enforced Centralized Server Time on "${dbDevice.name}"`);
                } catch (timeErr) {
                    console.warn(`[ZK] setTime failed on "${dbDevice.name}" - continuing anyway: ${zkErrMsg(timeErr)}`);
                }

                const allLogs = await zk.getLogs();

                // Filter to today's logs only (PHT timezone UTC+8)
                const nowUTC = new Date();
                const todayPHT = new Date(nowUTC.getTime() + 8 * 60 * 60 * 1000);
                todayPHT.setUTCHours(0, 0, 0, 0);
                const todayStartUTC = new Date(todayPHT.getTime() - 8 * 60 * 60 * 1000);

                const logs = allLogs.filter((log: any) => {
                    const logTime = new Date(log.recordTime);
                    return logTime >= todayStartUTC;
                });

                console.log(`[ZK] Fetched ${allLogs.length} total logs, filtered to ${logs.length} logs for today (PHT).`);

                // Sort: Oldest -> Newest
                logs.sort((a, b) => a.recordTime.getTime() - b.recordTime.getTime());

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
                            const diffMs = utcTime.getTime() - lastLog.timestamp.getTime();
                            const diffMinutes = diffMs / (1000 * 60);

                            // Only skip if it's within 1 minute (likely accidental double-scan)
                            if (diffMinutes < 1) continue;
                        }

                        // 3. Check for exact duplicate in DB
                        const exists = await prisma.attendanceLog.findUnique({
                            where: {
                                timestamp_employeeId: {
                                    timestamp: utcTime,
                                    employeeId: employee.id
                                }
                            }
                        });

                        if (!exists) {
                            await prisma.attendanceLog.create({
                                data: {
                                    timestamp: utcTime,  // Store UTC time
                                    employeeId: employee.id,
                                    status: log.status,
                                },
                            });
                            newCount++;
                        }
                    } catch (logErr) {
                        console.error(`[ZK] Error processing log:`, logErr);
                    }
                }

                console.log(`[ZK] Device "${dbDevice.name}" sync complete. ${newCount} new logs.`);
                totalNewLogs += newCount;

            } catch (deviceErr: any) {
                console.error(`[ZK] Error syncing "${dbDevice.name}" (${dbDevice.ip}): ${zkErrMsg(deviceErr)}`);
                // Mark this specific device as OFFLINE
                await prisma.device.update({
                    where: { id: dbDevice.id },
                    data: { isActive: false, updatedAt: new Date() }
                }).catch(() => { /* ignore */ });
            } finally {
                try { await zk.disconnect(); } catch { /* ignore */ }
            }
        }

        // Always process logs into Attendance records (handles both new and existing logs)
        console.log(`[ZK] Processing ${totalNewLogs} new logs into attendance records...`);
        await processAttendanceLogs();

        return { success: true, newLogs: totalNewLogs };

    } catch (error: any) {
        console.error('[ZK] Sync fatal error:', zkErrMsg(error));
        return { success: false, error: `Sync Error: ${zkErrMsg(error)}`, message: 'Failed to sync attendance data' };
    } finally {
        releaseDeviceLock();
    }
};

export const addUserToDevice = async (zkId: number, name: string, role: string = 'USER', badgeNumber: string = ""): Promise<SyncResult> => {
    // addUserToDevice is triggered from the UI after employee creation.
    // Use the interactive priority lock so this jumps ahead of any already-queued
    // cron syncs, eliminating the P4 race window between the setImmediate background
    // call and the 10-second cron tick. Enrollment also uses this same lock, so all
    // dashboard-initiated device writes share one VIP lane over background cron work.
    await acquireInteractiveDeviceLock();


    try {
        console.log(`[ZK] Adding User with zkId=${zkId} (${name})...`);

        const dbDevices = await prisma.device.findMany({
            where: { isActive: true, syncEnabled: true },
            orderBy: { id: 'asc' },
        });

        if (dbDevices.length === 0) {
            console.warn('[ZK] No active devices in DB — cannot add user.');
            return { success: false, message: 'No active devices configured.' };
        }

        let lastError: any;
        let addedToAtLeastOne = false;

        for (const dbDevice of dbDevices) {
            const zk = getDriver(dbDevice.ip, dbDevice.port);
            try {
                console.log(`[ZK] Connecting to "${dbDevice.name}" (${dbDevice.ip}:${dbDevice.port})...`);
                await connectWithRetry(zk, 2);

                const deviceRole = role === 'ADMIN' ? 14 : 0;
                const visibleId = zkId.toString();

                // ── UID = zkId (deterministic, collision-free) ────────────────
                // Using getNextUid() was the root cause of overwriting existing
                // users. Instead, we ALWAYS use the employee's DB zkId as their
                // device UID. This makes the mapping 1-to-1 and predictable:
                //   DB employee.zkId === device internal UID (always)
                const deviceUid = zkId;

                if (PROTECTED_DEVICE_UIDS.includes(deviceUid)) {
                    console.warn(`[ZK] ⚠ zkId=${zkId} collides with a protected device UID. Skipping device "${dbDevice.name}".`);
                    continue;
                }

                // ── Pre-write occupancy check ─────────────────────────────────
                // Two independent guards are required:
                //   Guard 1 (uid-based):    Is the TARGET SLOT already occupied?
                //   Guard 2 (userId-based): Does ANY slot already claim this visibleId?
                // Guard 2 catches ghost users who live at a DIFFERENT uid but carry
                // the same visible userId — the uid-only check is blind to those.
                const deviceUsers = await zk.getUsers();
                // node-zklib does not export its user type, so 'any' is required here
                const occupant       = deviceUsers.find((u: any) => u.uid === deviceUid);
                const visibleConflict = deviceUsers.find((u: any) =>
                    String(u.userId).trim() === visibleId.trim() && u.uid !== deviceUid
                );

                if (occupant) {
                    if (String(occupant.userId).trim() === visibleId.trim()) {
                        // Same employee already in this slot — skip delete, just update name/role
                        console.log(`[ZK] Slot UID=${deviceUid} already belongs to "${name}" — updating in place.`);
                        await zk.setUser(deviceUid, name, "", deviceRole, 0, visibleId);
                    } else {
                        // A DIFFERENT user occupies this slot — refuse to overwrite
                        console.warn(`[ZK] ⚠ UID conflict on "${dbDevice.name}": slot UID=${deviceUid} is occupied by userId="${occupant.userId}" ("${occupant.name}") — refusing to overwrite with "${name}".`);
                        lastError = new Error(`UID conflict: slot ${deviceUid} occupied by another user`);
                        continue; // Try next device; do NOT destroy this user's data
                    }
                } else if (visibleConflict) {
                    // Guard 2: A DIFFERENT uid already holds this visibleId (ghost user).
                    // Writing here would create duplicate visible IDs on the device and
                    // corrupt attendance attribution. Refuse until UID conflict is resolved.
                    console.warn(`[ZK] ⚠ visibleId conflict on "${dbDevice.name}": userId="${visibleId}" is already claimed by UID=${visibleConflict.uid} ("${visibleConflict.name}") — refusing to write "${name}" to UID=${deviceUid}.`);
                    lastError = new Error(`visibleId conflict: userId=${visibleId} already at uid=${visibleConflict.uid}`);
                    continue;
                } else {
                    // Slot is empty AND no other slot claims this visibleId — safe to write.
                    // Force-clear first to remove any stale fingerprint data.
                    console.log(`[ZK] Force-clearing UID=${deviceUid} on "${dbDevice.name}" before write...`);
                    try { await zk.deleteUser(deviceUid); } catch { /* slot already empty — ok */ }
                    await zk.clearUserFingerprints(deviceUid);
                    await zk.setUser(deviceUid, name, "", deviceRole, 0, visibleId);
                }

                await zk.refreshData();
                console.log(`[ZK] ✓ Written "${name}" → UID=${deviceUid}, visibleId="${visibleId}" on "${dbDevice.name}".`);
                addedToAtLeastOne = true;
            } catch (err: any) {
                lastError = err;
                console.error(`[ZK] Failed to add user to "${dbDevice.name}": ${zkErrMsg(err)}`);
            } finally {
                try { await zk.disconnect(); } catch { /* ignore */ }
            }
        }

        if (!addedToAtLeastOne) {
            throw lastError ?? new Error('All devices failed');
        }

        return { success: true, message: `User ${name} synced to device(s).` };
    } catch (error: any) {
        console.error('[ZK] Add User Error:', zkErrMsg(error));
        throw new Error(`Failed to add employee: ${zkErrMsg(error)}`);
    } finally {
        releaseDeviceLock();
    }
};




export const deleteUserFromDevice = async (zkId: number): Promise<SyncResult> => {
    await acquireDeviceLock();
    try {
        console.log(`[ZK] Deleting User with zkId=${zkId} from all devices...`);

        const dbDevices = await prisma.device.findMany({
            where: { isActive: true, syncEnabled: true },
            orderBy: { id: 'asc' },
        });

        if (dbDevices.length === 0) {
            return { success: true, message: 'No active devices — nothing to delete from.' };
        }

        for (const dbDevice of dbDevices) {
            const zk = getDriver(dbDevice.ip, dbDevice.port);
            try {
                await connectWithRetry(zk, 2);

                const deviceUsers = await zk.getUsers();
                const targetUser = deviceUsers.find((u: any) => u.userId === zkId.toString());

                if (!targetUser) {
                    console.log(`[ZK] User zkId=${zkId} not found on "${dbDevice.name}". Skipping.`);
                    continue;
                }

                console.log(`[ZK] Clearing fingerprints + deleting UID=${targetUser.uid} on "${dbDevice.name}"...`);
                await zk.clearUserFingerprints(targetUser.uid);
                await zk.deleteUser(targetUser.uid);
                console.log(`[ZK] Deleted zkId=${zkId} from "${dbDevice.name}".`);
            } catch (err: any) {
                console.error(`[ZK] Failed to delete from "${dbDevice.name}": ${zkErrMsg(err)}`);
            } finally {
                try { await zk.disconnect(); } catch { /* ignore */ }
            }
        }

        return { success: true, message: `User ${zkId} removed from device(s).` };
    } catch (error: any) {
        console.error('[ZK] Delete User Error:', zkErrMsg(error));
        return { success: false, message: `Failed to delete user: ${zkErrMsg(error)}`, error: zkErrMsg(error) };
    } finally {
        releaseDeviceLock();
    }
};

export const syncEmployeesToDevice = async (): Promise<SyncResult> => {
    await acquireDeviceLock();

    try {
        console.log(`[ZK] syncEmployeesToDevice — fetching DB employees...`);
        const employees = await prisma.employee.findMany({
            where: {
                zkId: { not: null, gt: 1 }, // Skip Admin (zkId = 1)
                employmentStatus: 'ACTIVE',
            },
            select: { zkId: true, firstName: true, lastName: true, role: true }
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
                                await zk.setUser(deviceUid, fullName, "", deviceRole, 0, visibleId);
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
                            await zk.setUser(deviceUid, fullName, "", deviceRole, 0, visibleId);
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
            }
        }

        return {
            success: totalSuccess > 0,
            message: `Synced ${totalSuccess} employee(s) across ${dbDevices.length} device(s).`,
            count: totalSuccess,
        };

    } catch (error: any) {
        throw new Error(`Sync failed: ${error.message}`);
    } finally {
        releaseDeviceLock();
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
        select: { id: true, zkId: true, firstName: true, lastName: true },
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

    const fullName = `${employee.firstName} ${employee.lastName}`;
    const visibleId = employee.zkId.toString();
    // UID = zkId — deterministic 1-to-1 mapping (matches addUserToDevice strategy)
    const deviceUid = employee.zkId;

    // 3. Acquire interactive device lock — enrollment is UI-triggered and time-sensitive.
    // acquireInteractiveDeviceLock() places this at the FRONT of the queue so cron syncs
    // can never delay fingerprint capture.
    await acquireInteractiveDeviceLock();
    const zk = getDriver(dbDevice.ip, dbDevice.port);


    try {
        console.log(`[Enrollment] Connecting to "${dbDevice.name}" (${dbDevice.ip}:${dbDevice.port})...`);
        await connectWithRetry(zk, 2);

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
            await zk.setUser(deviceUid, fullName, '', 0, 0, visibleId);
            await zk.refreshData();
            console.log(`[Enrollment] User written to UID=${deviceUid}.`);
        } else if (userByVisibleId.uid !== deviceUid) {
            // User exists at the wrong UID (target slot is confirmed empty from Guard 1 pass).
            console.warn(`[Enrollment] ⚠ User found at wrong UID=${userByVisibleId.uid} — re-writing to correct slot UID=${deviceUid}.`);
            try { await zk.deleteUser(deviceUid); } catch { /* slot may be empty */ }
            await zk.clearUserFingerprints(deviceUid);
            await zk.setUser(deviceUid, fullName, '', 0, 0, visibleId);
            await zk.refreshData();
            console.log(`[Enrollment] User re-written to UID=${deviceUid}.`);
        } else {
            console.log(`[Enrollment] User already at correct slot UID=${deviceUid}. Proceeding to enroll.`);
        }

        // 4. Send enrollment command
        const fingerName = FINGER_MAP[fingerIndex] || `Finger ${fingerIndex}`;
        console.log(`[Enrollment] Sending CMD_STARTENROLL for "${fullName}" (${fingerName}) on "${dbDevice.name}"...`);
        await zk.startEnrollment(visibleId, fingerIndex);

        // 5. Record enrollment in DB
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

        console.log(`[Enrollment] ✓ Enrollment recorded in DB for employee ${employeeId} on device "${dbDevice.name}".`);

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
        releaseDeviceLock();
    }
};


export const testDeviceConnection = async (): Promise<SyncResult> => {
    const zk = getDriver();
    await acquireDeviceLock();
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
        releaseDeviceLock();
    }
};

export const syncEmployeesFromDevice = async (): Promise<SyncResult> => {
    await acquireDeviceLock();
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
            }
        }

        return {
            success: true,
            message: `Scanned ${dbDevices.length} device(s). Matched ${totalUpdateCount}, Skipped ${totalSkippedCount} unknown.`,
            count: totalUpdateCount,
        };

    } catch (error: any) {
        return { success: false, error: error.message };
    } finally {
        releaseDeviceLock();
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
 */
export const reconcileDeviceWithDB = async (deviceId: number, dryRun: boolean = false): Promise<ReconcileReport> => {
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

    // 2. Load all active DB employees
    const dbEmployees = await prisma.employee.findMany({
        where: { zkId: { not: null }, employmentStatus: 'ACTIVE' },
        select: { zkId: true, firstName: true, lastName: true, role: true }
    });
    const dbByZkId = new Map(dbEmployees.map(e => [e.zkId!.toString(), e]));

    await acquireDeviceLock();
    const zk = getDriver(dbDevice.ip, dbDevice.port);

    try {
        console.log(`[Reconcile] Connecting to "${dbDevice.name}" (${dbDevice.ip}:${dbDevice.port})...`);
        await connectWithRetry(zk, 2);

        // 3. Get all users currently on device
        const deviceUsers = await zk.getUsers();
        console.log(`[Reconcile] Device has ${deviceUsers.length} users. DB has ${dbEmployees.length} active employees.`);

        const deviceByVisibleId = new Map(deviceUsers.map((u: any) => [u.userId, u]));

        // ── STEP A: Delete device-only ghost users ──────────────────────────
        for (const dUser of deviceUsers) {
            const uid = dUser.uid;
            const visibleId = dUser.userId;

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

            // Check if this user maps to an active DB employee
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

        // ── STEP B: Push DB-only employees to device ────────────────────────
        for (const emp of dbEmployees) {
            const zkId = emp.zkId!;
            const visibleId = zkId.toString();
            const fullName = `${emp.firstName} ${emp.lastName}`;
            const deviceRole = emp.role === 'ADMIN' ? 14 : 0;

            if (PROTECTED_DEVICE_UIDS.includes(zkId)) continue;

            if (!deviceByVisibleId.has(visibleId)) {
                // Employee in DB but not on device.
                if (dryRun) {
                    // Dry-run: record what would be pushed, touch nothing.
                    report.pushed.push({ zkId, name: fullName });
                    report.needsEnrollment.push({ zkId, name: fullName });
                    console.log(`[Reconcile] 🔍 Would push "${fullName}" (zkId=${zkId}) to device.`);
                } else {
                    // Live run: write the employee to the device.
                    console.log(`[Reconcile] ➕ Pushing "${fullName}" (zkId=${zkId}) to device...`);
                    try {
                        try { await zk.deleteUser(zkId); } catch { /* slot may be empty */ }
                        await zk.clearUserFingerprints(zkId);
                        await zk.setUser(zkId, fullName, "", deviceRole, 0, visibleId);
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
                // User exists on device — check finger count
                const dUser = deviceByVisibleId.get(visibleId);
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
        releaseDeviceLock();
    }
};
