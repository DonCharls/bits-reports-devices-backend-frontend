import { prisma } from '../lib/prisma';
import { ZKDriver } from '../lib/zk-driver';
import { EnrollmentResult } from './fingerprintEnrollment.service';
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

/**
 * Convert Philippine Time to UTC
 * ZKTeco device returns timestamps in Philippine Time (UTC+8)
 * We need to subtract 8 hours to get UTC for proper storage
 */
const convertPHTtoUTC = (phtDate: Date): Date => {
    const utcTime = new Date(phtDate.getTime() - (8 * 60 * 60 * 1000));
    return utcTime;
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

function acquireDeviceLock(): Promise<void> {
    return new Promise((resolve) => {
        if (!_deviceBusy) {
            _deviceBusy = true;
            resolve();
        } else {
            console.log('[ZK] Device busy — queuing request...');
            _deviceQueue.push(() => {
                _deviceBusy = true;
                resolve();
            });
        }
    });
}

function releaseDeviceLock(): void {
    const next = _deviceQueue.shift();
    if (next) {
        // Small delay before handing off so the device can fully close the previous socket
        setTimeout(next, 500);
    } else {
        _deviceBusy = false;
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Non-blocking lock attempt — used by the cron job.
// Returns true if the lock was acquired, false if the device is already busy.
// Cron jobs should SKIP (not queue) when the device is busy; the next cron
// tick 10 seconds later will try again. This prevents an ever-growing queue
// of pending syncs from stacking up while enrollment or another operation
// is holding the lock.
// ─────────────────────────────────────────────────────────────────────────────
function tryAcquireDeviceLock(): boolean {
    if (!_deviceBusy) {
        _deviceBusy = true;
        return true;
    }
    return false;
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
            const zk = getDriver(dbDevice.ip, dbDevice.port);
            console.log(`[ZK] Syncing device "${dbDevice.name}" at ${dbDevice.ip}:${dbDevice.port}...`);

            try {
                await connectWithRetry(zk);

                const info = await zk.getInfo();
                console.log(`[ZK] Connected! Serial: ${info.serialNumber}`);

                // Mark ONLINE using device.id (not the env-var IP) so Configure changes apply immediately
                await prisma.device.update({
                    where: { id: dbDevice.id },
                    data: { isActive: true, updatedAt: new Date() }
                }).catch(() => { /* ignore */ });

                const logs = await zk.getLogs();

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
    await acquireDeviceLock();

    try {
        console.log(`[ZK] Adding User with zkId=${zkId} (${name})...`);

        const dbDevices = await prisma.device.findMany({
            where: { isActive: true },
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

                // ── Force-clear the slot BEFORE writing ──────────────────────
                // Even if no one should be in this slot, we always purge it
                // first. This prevents stale fingerprints/names from a previous
                // employee who occupied this UID (e.g. after DB reset/re-seed).
                console.log(`[ZK] Force-clearing UID=${deviceUid} on "${dbDevice.name}" before write...`);
                try { await zk.deleteUser(deviceUid); } catch { /* slot may be empty — ok */ }
                await zk.clearUserFingerprints(deviceUid);

                // ── Write the new user ────────────────────────────────────────
                await zk.setUser(deviceUid, name, "", deviceRole, 0, visibleId);
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
            where: { isActive: true },
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
            where: { isActive: true },
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
                        // Force-clear the slot, then write
                        try { await zk.deleteUser(deviceUid); } catch { /* empty slot — ok */ }
                        await zk.clearUserFingerprints(deviceUid);
                        await zk.setUser(deviceUid, fullName, "", deviceRole, 0, visibleId);
                        console.log(`[ZK]   ✓ Written: "${fullName}" → UID=${deviceUid} on "${dbDevice.name}"`);
                        successCount++;
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
    fingerIndex: number = 0
): Promise<SyncResult> => {
    console.log(`[Enrollment] Starting for employee ${employeeId}, finger ${fingerIndex}...`);

    // 1. DB lookup — do this BEFORE acquiring the device lock
    const employee = await prisma.employee.findUnique({
        where: { id: employeeId },
        select: {
            id: true,
            zkId: true,
            firstName: true,
            lastName: true,
            employmentStatus: true,
        }
    });

    if (!employee) return { success: false, message: 'Employee not found', error: 'not_found' };
    if (!employee.zkId) return { success: false, message: 'No zkId assigned', error: 'no_zkid' };
    if (employee.employmentStatus !== 'ACTIVE') return { success: false, message: 'Inactive employee', error: 'inactive' };
    if (fingerIndex < 0 || fingerIndex > 9) return { success: false, message: 'Finger index must be 0–9', error: 'bad_finger' };

    const fullName = `${employee.firstName} ${employee.lastName}`;
    const visibleId = String(employee.zkId); // This is what CMD_STARTENROLL expects
    const fingerName = FINGER_MAP[fingerIndex] || `Finger ${fingerIndex}`;

    // 2. Fetch device IP from DB — never trust env var (may be stale after Configure)
    const dbDevice = await prisma.device.findFirst({
        where: { isActive: true },
        orderBy: { id: 'asc' },
    });

    if (!dbDevice) {
        return { success: false, message: 'No active devices configured in DB', error: 'no_device' };
    }

    // 3. Acquire device lock — only ONE connection to the device at a time
    const zk = getDriver(dbDevice.ip, dbDevice.port);
    await acquireDeviceLock();

    try {
        console.log(`[Enrollment] Connecting to "${dbDevice.name}" (${dbDevice.ip}:${dbDevice.port})...`);
        await connectWithRetry(zk);

        // ── UID = zkId (same deterministic strategy as addUserToDevice) ──────
        const deviceUid = employee.zkId!;

        if (PROTECTED_DEVICE_UIDS.includes(deviceUid)) {
            return { success: false, message: `UID ${deviceUid} is a protected device slot`, error: 'protected_uid' };
        }

        // 4. Ensure user is correctly written on device (UID = zkId, force-clear first)
        const deviceUsers = await zk.getUsers();
        const existingUser = deviceUsers.find((u: any) => u.userId === visibleId);

        if (!existingUser) {
            console.log(`[Enrollment] User not found on device — force-clearing slot UID=${deviceUid} and adding (visibleId="${visibleId}")...`);
            try { await zk.deleteUser(deviceUid); } catch { /* slot empty — ok */ }
            await zk.clearUserFingerprints(deviceUid);
            await zk.setUser(deviceUid, fullName, '', 0, 0, visibleId);
            await zk.refreshData();
            console.log(`[Enrollment] User written to UID=${deviceUid}.`);
        } else if (existingUser.uid !== deviceUid) {
            // User exists but at wrong UID — move them to the correct slot
            console.warn(`[Enrollment] ⚠ User found at wrong UID=${existingUser.uid} — re-writing to correct slot UID=${deviceUid}.`);
            try { await zk.deleteUser(deviceUid); } catch { /* slot may be empty */ }
            await zk.clearUserFingerprints(deviceUid);
            await zk.setUser(deviceUid, fullName, '', 0, 0, visibleId);
            await zk.refreshData();
            console.log(`[Enrollment] User re-written to UID=${deviceUid}.`);
        } else {
            console.log(`[Enrollment] User already at correct slot UID=${deviceUid}. Proceeding to enroll.`);
        }

        // 5. Send CMD_STARTENROLL — visibleId (zkId string) is the correct payload
        console.log(`[Enrollment] Sending CMD_STARTENROLL: visibleId="${visibleId}", finger="${fingerName}"...`);
        await zk.startEnrollment(visibleId, fingerIndex);

        console.log(`[Enrollment] ✓ Enrollment command sent. Employee should now place their ${fingerName} on the device.`);
        return {
            success: true,
            message: `Enrollment started for ${fullName}. Please place their ${fingerName} on the scanner 3 times.`
        };

    } catch (error: any) {
        console.error(`[Enrollment] Error:`, zkErrMsg(error));
        return {
            success: false,
            message: zkErrMsg(error) || 'Enrollment failed',
            error: 'enrollment_error'
        };
    } finally {
        try { await zk.disconnect(); } catch { /* ignore disconnect errors */ }
        releaseDeviceLock();
    }
};


export const testDeviceConnection = async (): Promise<SyncResult> => {
    const zk = getDriver();
    await acquireDeviceLock();
    try {
        await connectWithRetry(zk);
        const info = await zk.getInfo();
        const time = await zk.getTime();
        return { success: true, message: `Connected! Serial: ${info.serialNumber}, Time: ${JSON.stringify(time)}` };
    } catch (error: any) {
        return { success: false, error: error.message };
    } finally {
        try { await zk.disconnect(); } catch { /* ignore disconnect errors */ }
        releaseDeviceLock();
    }
};

export const syncEmployeesFromDevice = async (): Promise<SyncResult> => {
    const zk = getDriver();
    await acquireDeviceLock();
    try {
        await connectWithRetry(zk);
        const users = await zk.getUsers();

        console.log(`[ZK] Found ${users.length} users on device.`);
        let newCount = 0;
        let updateCount = 0;

        for (const user of users) {
            let zkId = parseInt(user.userId);
            if (isNaN(zkId)) continue;

            // SPECIAL CASE: Map Device Admin (2948876) to Database Admin (1)
            if (zkId === 2948876) {
                zkId = 1;
            }

            const existing = await prisma.employee.findUnique({ where: { zkId } });

            if (existing) {
                // Update names if they exist on device
                const nameParts = user.name.split(' ');
                const firstName = nameParts[0] || existing.firstName;
                const lastName = nameParts.slice(1).join(' ') || existing.lastName;

                // Only update if names are different/better (simple check)
                if (user.name && (existing.firstName !== firstName || existing.lastName !== lastName)) {
                    await prisma.employee.update({
                        where: { id: existing.id },
                        data: { firstName, lastName }
                    });
                    console.log(`[ZK] Updated Name for ID ${zkId}: ${user.name}`);
                }
                updateCount++;
            } else {
                // Unknown device user — do NOT auto-create in DB.
                console.log(`[ZK] Skipping unknown device user zkId=${zkId} ("${user.name}") — not in database.`);
            }
        }

        return { success: true, message: `Scanned ${users.length}. Created ${newCount}, Found ${updateCount}.`, count: newCount };

    } catch (error: any) {
        return { success: false, error: error.message };
    } finally {
        try { await zk.disconnect(); } catch { /* ignore disconnect errors */ }
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
    pushed: { zkId: number; name: string }[];         // DB-only → pushed to device
    deleted: { uid: number; userId: string; name: string }[]; // device-only → removed
    protected: { uid: number; name: string }[];        // admin users skipped
    needsEnrollment: { zkId: number; name: string }[]; // users with 0 fingerprints
    errors: string[];
}

export const reconcileDeviceWithDB = async (deviceId: number): Promise<ReconcileReport> => {
    const report: ReconcileReport = {
        deviceId,
        deviceName: '',
        pushed: [],
        deleted: [],
        protected: [],
        needsEnrollment: [],
        errors: [],
    };

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
                // Ghost user — delete from device
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

        // ── STEP B: Push DB-only employees to device ────────────────────────
        for (const emp of dbEmployees) {
            const zkId = emp.zkId!;
            const visibleId = zkId.toString();
            const fullName = `${emp.firstName} ${emp.lastName}`;
            const deviceRole = emp.role === 'ADMIN' ? 14 : 0;

            if (PROTECTED_DEVICE_UIDS.includes(zkId)) continue;

            if (!deviceByVisibleId.has(visibleId)) {
                // Employee in DB but not on device — push them
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

        await zk.refreshData();

        console.log(`[Reconcile] ✅ Complete. Pushed: ${report.pushed.length}, Deleted: ${report.deleted.length}, Needs enrollment: ${report.needsEnrollment.length}, Protected: ${report.protected.length}`);

        // Update device isActive to true since we just connected successfully
        await prisma.device.update({ where: { id: deviceId }, data: { isActive: true, updatedAt: new Date() } });

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
