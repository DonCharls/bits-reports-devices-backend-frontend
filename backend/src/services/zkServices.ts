import { prisma } from '../lib/prisma';
import { ZKDriver } from '../lib/zk-driver';
import { enrollFingerprint, EnrollmentResult } from './fingerprintEnrollment.service';
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

const getDriver = (): ZKDriver => {
    const ip = process.env.ZK_HOST || '192.168.1.201';
    const port = parseInt(process.env.ZK_PORT || '4370');
    return new ZKDriver(ip, port);
};

export const syncZkData = async (): Promise<SyncResult> => {
    const zk = getDriver();

    try {
        console.log(`[ZK] Connecting to device...`);
        await zk.connect();

        const info = await zk.getInfo();
        console.log(`[ZK] Connected! Serial: ${info.serialNumber}`);

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
            } catch (error) {
                console.error(`[ZK] Error processing log:`, error);
            }
        }

        console.log(`[ZK] Sync Complete. Saved ${newCount} new logs.`);

        // Always process logs into Attendance records (handles both new and existing logs)
        console.log(`[ZK] Processing logs into attendance records...`);
        await processAttendanceLogs();

        return { success: true, newLogs: newCount };

    } catch (error: any) {
        console.error('[ZK] Error:', error);
        return {
            success: false,
            error: `Sync Error: ${error.message || error}`,
            message: 'Failed to sync attendance data'
        };
    } finally {
        await zk.disconnect();
    }
};

export const addUserToDevice = async (zkId: number, name: string, role: string = 'USER', badgeNumber: string = ""): Promise<SyncResult> => {
    const zk = getDriver();

    try {
        console.log(`[ZK] Adding User with zkId=${zkId} (${name}), badgeNumber="${badgeNumber}"...`);
        await zk.connect();

        const deviceRole = role === 'ADMIN' ? 14 : 0;
        // The visible ID on the device screen — use badgeNumber if available, otherwise zkId
        const visibleId = badgeNumber || zkId.toString();

        // Fetch all existing users from the device
        const existingUsers = await zk.getUsers();

        // DEBUG: Dump ALL device users so we can trace the issue
        console.log(`[ZK] === DEBUG: All ${existingUsers.length} device users ===`);
        existingUsers.forEach((u: any) => {
            console.log(`[ZK]   UID=${u.uid}, userId="${u.userId}", name="${u.name}", role=${u.role}`);
        });
        console.log(`[ZK] === Looking for match: visibleId="${visibleId}", zkId.toString()="${zkId.toString()}" ===`);

        // Look for an existing device user that matches this employee.
        const existingUser = existingUsers.find(
            (u: any) => u.userId === visibleId || u.userId === zkId.toString()
        );

        if (existingUser) {
            console.log(`[ZK] === MATCH FOUND: UID=${existingUser.uid}, userId="${existingUser.userId}", name="${existingUser.name}" ===`);
        } else {
            console.log(`[ZK] === NO MATCH FOUND ===`);
        }

        let deviceUid: number;

        if (existingUser) {
            // CRITICAL: Never overwrite a protected UID (e.g. UID 1 = SUPER ADMIN)
            if (PROTECTED_DEVICE_UIDS.includes(existingUser.uid)) {
                console.warn(`[ZK] ⚠ PROTECTED UID ${existingUser.uid} matched ("${existingUser.name}", userId="${existingUser.userId}"). Refusing to overwrite — assigning new UID instead.`);
                // Treat as a new user — assign the next available UID
                deviceUid = await zk.getNextUid();
                // Also make sure the next UID itself isn't protected
                while (PROTECTED_DEVICE_UIDS.includes(deviceUid)) {
                    deviceUid++;
                }
                console.log(`[ZK] New user. Assigning safe device UID: ${deviceUid}`);
            } else {
                // Safe to update in place
                deviceUid = existingUser.uid;
                console.log(`[ZK] User already exists on device (UID: ${deviceUid}). Updating...`);
            }
        } else {
            // User doesn't exist — get the NEXT AVAILABLE UID from the device
            deviceUid = await zk.getNextUid();
            // Make sure we never accidentally land on a protected UID
            while (PROTECTED_DEVICE_UIDS.includes(deviceUid)) {
                deviceUid++;
            }
            console.log(`[ZK] New user. Assigning device UID: ${deviceUid}`);
        }

        console.log(`[ZK] === FINAL: Calling setUser(deviceUid=${deviceUid}, name="${name}", role=${deviceRole}, visibleId="${visibleId}") ===`);
        await zk.setUser(deviceUid, name, "", deviceRole, 0, visibleId);
        console.log(`[ZK] ${existingUser && !PROTECTED_DEVICE_UIDS.includes(existingUser.uid) ? 'Updated' : 'Added'} User successfully (UID: ${deviceUid}, Visible ID: ${visibleId}, Role: ${deviceRole}).`);
        return { success: true, message: `User ${name} ${existingUser && !PROTECTED_DEVICE_UIDS.includes(existingUser.uid) ? 'updated on' : 'added to'} device.` };
    } catch (error: any) {
        console.error('[ZK] Add User Error:', error);
        throw new Error(`Failed to add employee: ${error.message || error}`);
    } finally {
        await zk.disconnect();
    }
};

export const deleteUserFromDevice = async (zkId: number): Promise<SyncResult> => {
    const zk = getDriver();
    try {
        console.log(`[ZK] Deleting User with zkId=${zkId} from device...`);
        await zk.connect();

        // Look up the user on the device by their visible userId to find the correct internal UID
        const deviceUsers = await zk.getUsers();
        const targetUser = deviceUsers.find(
            (u: any) => u.userId === zkId.toString()
        );

        if (!targetUser) {
            console.log(`[ZK] User with zkId=${zkId} not found on device. Nothing to delete.`);
            return { success: true, message: `User ${zkId} not found on device (already removed).` };
        }

        console.log(`[ZK] Found user on device: UID=${targetUser.uid}, Name="${targetUser.name}", userId="${targetUser.userId}"`);
        await zk.deleteUser(targetUser.uid);
        console.log(`[ZK] Successfully deleted user (UID: ${targetUser.uid}).`);
        return { success: true, message: `User ${zkId} deleted from device.` };
    } catch (error: any) {
        console.error('[ZK] Delete User Error:', error);
        return { success: false, message: `Failed to delete user: ${error.message}`, error: error.message };
    } finally {
        await zk.disconnect();
    }
};

export const syncEmployeesToDevice = async (): Promise<SyncResult> => {
    const zk = getDriver();

    try {
        console.log(`[ZK] Fetching DB employees...`);
        const employees = await prisma.employee.findMany({
            where: {
                zkId: { not: null },
                employmentStatus: 'ACTIVE',
            },
            select: {
                zkId: true,
                firstName: true,
                lastName: true,
                employeeNumber: true,
                role: true,
            }
        });

        if (employees.length === 0) {
            return { success: true, message: "No employees to sync.", count: 0 };
        }

        console.log(`[ZK] Connecting...`);
        await zk.connect();

        // 1. Fetch current device users — map by visible userId string for safe lookup
        console.log(`[ZK] Fetching existing device users...`);
        const deviceUsers = await zk.getUsers();
        const deviceUserByVisibleId = new Map<string, any>();
        deviceUsers.forEach(u => deviceUserByVisibleId.set(u.userId, u));
        console.log(`[ZK] Found ${deviceUsers.length} existing users on device.`);

        // Track the next available UID for new users — skip protected UIDs
        const existingUids = deviceUsers.map((u: any) => u.uid);
        let nextUid = existingUids.length > 0 ? Math.max(...existingUids) + 1 : 1;
        while (PROTECTED_DEVICE_UIDS.includes(nextUid)) nextUid++;

        let successCount = 0;
        let failedCount = 0;
        const errors: string[] = [];

        for (const employee of employees) {
            const fullName = `${employee.firstName} ${employee.lastName}`;
            try {
                const role = employee.role === 'ADMIN' ? 14 : 0; // 14 = Admin, 0 = User
                const zkId = employee.zkId!;
                const displayName = fullName;

                // Use employeeNumber as the visible User ID if available
                const userIdString = employee.employeeNumber || zkId.toString();

                // Look up by visible userId string — NOT by internal UID
                const existingUser = deviceUserByVisibleId.get(userIdString) || deviceUserByVisibleId.get(zkId.toString());

                // Preserve existing password/cardno if user already on device
                const password = existingUser ? existingUser.password : "";
                const cardno = existingUser ? existingUser.cardno : 0;

                // Use existing UID if found, otherwise assign next available UID
                // CRITICAL: Never overwrite a protected UID
                let deviceUid: number;
                if (existingUser) {
                    if (PROTECTED_DEVICE_UIDS.includes(existingUser.uid)) {
                        console.warn(`[ZK]   ⚠ SKIPPING ${displayName} — matched protected UID ${existingUser.uid} ("${existingUser.name}"). Assigning new UID.`);
                        deviceUid = nextUid++;
                        while (PROTECTED_DEVICE_UIDS.includes(deviceUid)) deviceUid = nextUid++;
                    } else {
                        deviceUid = existingUser.uid;
                    }
                } else {
                    deviceUid = nextUid++;
                    while (PROTECTED_DEVICE_UIDS.includes(deviceUid)) deviceUid = nextUid++;
                }

                await zk.setUser(deviceUid, displayName, password, role, cardno, userIdString);

                if (existingUser) {
                    console.log(`[ZK]   ✓ Updated: ${displayName} (UID: ${deviceUid}, ID: ${userIdString}, Role: ${role}, Card: ${cardno})`);
                } else {
                    console.log(`[ZK]   ✓ Added: ${displayName} (UID: ${deviceUid}, ID: ${userIdString}, Role: ${role})`);
                }

                successCount++;
            } catch (error: any) {
                failedCount++;
                errors.push(`Failed ${fullName}: ${error.message}`);
                console.error(`[ZK]   ✗ Failed ${fullName}: ${error.message}`);
            }
        }

        return {
            success: successCount > 0,
            message: `Synced ${successCount}/${employees.length} employees.`,
            count: successCount,
        };

    } catch (error: any) {
        throw new Error(`Sync failed: ${error.message}`);
    } finally {
        await zk.disconnect();
    }
};

// ... enrollEmployeeFingerprint is mostly business logic invoking other services, 
// checking logic if it needs refactor.
// It uses `addUserToDevice` (refactored above) and `enrollFingerprint` (external service).
// So we can keep it as is or lightly clean it.

export const enrollEmployeeFingerprint = async (
    employeeId: number,
    fingerIndex: number = 0
): Promise<SyncResult> => {
    try {
        console.log(`[Enrollment] Starting for employee ${employeeId}...`);

        const employee = await prisma.employee.findUnique({
            where: { id: employeeId },
            select: {
                id: true,
                zkId: true,
                firstName: true,
                lastName: true,
                employeeNumber: true,
                employmentStatus: true,
            }
        });

        if (!employee) return { success: false, message: 'Employee not found', error: 'not_found' };
        if (!employee.zkId) return { success: false, message: 'No zkId assigned', error: 'no_zkid' };
        if (employee.employmentStatus !== 'ACTIVE') return { success: false, message: 'Inactive employee', error: 'inactive' };

        const fullName = `${employee.firstName} ${employee.lastName}`;

        // User should already exist on device from initial sync
        // No need to call addUserToDevice() again - this was causing duplicates

        // Call Enrollment Service
        const deviceIp = process.env.ZK_HOST || '192.168.1.201';
        const result: EnrollmentResult = await enrollFingerprint(
            deviceIp,
            employee.zkId,              // Use zkId for enrollment
            fullName,
            String(employee.zkId),      // Search by zkId (matches what's on device)
            fingerIndex,
            60
        );

        if (result.success) {
            return { success: true, message: `Fingerprint enrolled for ${fullName}` };
        } else {
            return { success: false, message: result.message, error: result.error };
        }

    } catch (error: any) {
        return { success: false, message: `Enrollment error: ${error.message}`, error: 'enrollment_error' };
    }
};

export const testDeviceConnection = async (): Promise<SyncResult> => {
    const zk = getDriver();
    try {
        await zk.connect();
        const info = await zk.getInfo();
        const time = await zk.getTime();
        return { success: true, message: `Connected! Serial: ${info.serialNumber}, Time: ${JSON.stringify(time)}` };
    } catch (error: any) {
        return { success: false, error: error.message };
    } finally {
        await zk.disconnect();
    }
};

export const syncEmployeesFromDevice = async (): Promise<SyncResult> => {
    const zk = getDriver();
    try {
        await zk.connect();
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
                        data: {
                            firstName,
                            lastName
                        }
                    });
                    console.log(`[ZK] Updated Name for ID ${zkId}: ${user.name}`);
                }
                updateCount++;
            } else {
                // Unknown device user — do NOT auto-create in DB.
                // If this user was deleted from DB intentionally, they should stay deleted.
                console.log(`[ZK] Skipping unknown device user zkId=${zkId} ("${user.name}") — not in database. Delete from device if unwanted.`);
            }
        }

        return { success: true, message: `Scanned ${users.length}. Created ${newCount}, Found ${updateCount}.`, count: newCount };

    } catch (error: any) {
        return { success: false, error: error.message };
    } finally {
        await zk.disconnect();
    }
};