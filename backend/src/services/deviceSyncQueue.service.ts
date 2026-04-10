import { prisma } from '../lib/prisma';
import { 
    getDriver, 
    acquireDeviceLock, 
    releaseDeviceLock, 
    zkErrMsg, 
    connectWithRetry 
} from './zkServices';
import { audit } from '../lib/auditLogger';

// ─────────────────────────────────────────────────────────────────────────────
// Types & Interfaces
// ─────────────────────────────────────────────────────────────────────────────

export type SyncActionType = 'UPSERT_USER' | 'DELETE_USER' | 'DELETE_FINGER';

export interface UpsertUserPayload {
    zkId: number;
    name: string;
    card: number;
    role: number;
}

export interface DeleteUserPayload {
    zkId: number;
}

export interface DeleteFingerPayload {
    zkId: number;
    fingerIndex: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Enqueue Methods
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Pushes or updates a user on the device.
 * Collapses multiple updates for the same user/device into a single pending task.
 */
export async function enqueueUpsertUser(
    deviceId: number,
    payload: UpsertUserPayload
): Promise<void> {
    const entityId = `USER_${payload.zkId}`;
    
    await prisma.deviceSyncTask.upsert({
        where: {
            deviceId_actionType_entityId: {
                deviceId,
                actionType: 'UPSERT_USER',
                entityId
            }
        },
        update: {
            payload: payload as any,
            status: 'PENDING',
            retryCount: 0,
            createdAt: new Date(),
            updatedAt: new Date()
        },
        create: {
            deviceId,
            actionType: 'UPSERT_USER',
            entityId,
            payload: payload as any,
            status: 'PENDING'
        }
    });

    console.log(`[SyncQueue] Enqueued UPSERT_USER for zkId=${payload.zkId} on device ${deviceId}`);
}

/**
 * Enqueue UPSERT_USER for ALL active devices.
 */
export async function enqueueGlobalUpsertUser(payload: UpsertUserPayload): Promise<void> {
    const devices = await prisma.device.findMany({ where: { syncEnabled: true }, select: { id: true } });
    for (const device of devices) {
        await enqueueUpsertUser(device.id, payload);
    }
}

/**
 * Enqueue deletion of a user from a specific device.
 */
export async function enqueueDeleteUser(
    deviceId: number,
    zkId: number
): Promise<void> {
    const entityId = `USER_${zkId}`;
    
    await prisma.deviceSyncTask.upsert({
        where: {
            deviceId_actionType_entityId: {
                deviceId,
                actionType: 'DELETE_USER',
                entityId
            }
        },
        update: {
            status: 'PENDING',
            retryCount: 0,
            createdAt: new Date(),
            updatedAt: new Date()
        },
        create: {
            deviceId,
            actionType: 'DELETE_USER',
            entityId,
            payload: { zkId } as any,
            status: 'PENDING'
        }
    });

    console.log(`[SyncQueue] Enqueued DELETE_USER for zkId=${zkId} on device ${deviceId}`);
}

/**
 * Enqueue DELETE_USER for ALL active+sync-enabled devices.
 * Used when an employee is soft-deleted or permanently removed.
 */
export async function enqueueGlobalDeleteUser(zkId: number): Promise<void> {
    const devices = await prisma.device.findMany({
        where: { syncEnabled: true },
        select: { id: true }
    });
    for (const device of devices) {
        await enqueueDeleteUser(device.id, zkId);
    }
    console.log(`[SyncQueue] Enqueued DELETE_USER (zkId=${zkId}) across ${devices.length} device(s).`);
}

/**
 * Enqueue deletion of a specific fingerprint.
 */
export async function enqueueDeleteFinger(
    deviceId: number,
    payload: DeleteFingerPayload
): Promise<void> {
    const entityId = `FINGER_${payload.zkId}_${payload.fingerIndex}`;
    
    await prisma.deviceSyncTask.upsert({
        where: {
            deviceId_actionType_entityId: {
                deviceId,
                actionType: 'DELETE_FINGER',
                entityId
            }
        },
        update: {
            status: 'PENDING',
            retryCount: 0,
            createdAt: new Date(),
            updatedAt: new Date()
        },
        create: {
            deviceId,
            actionType: 'DELETE_FINGER',
            entityId,
            payload: payload as any,
            status: 'PENDING'
        }
    });

    console.log(`[SyncQueue] Enqueued DELETE_FINGER (index ${payload.fingerIndex}) for zkId=${payload.zkId} on device ${deviceId}`);
}

/**
 * Enqueue deletion of a fingerprint across ALL devices matching an employee.
 * We look at EmployeeFingerprintEnrollment to know which devices held the finger.
 */
export async function enqueueGlobalDeleteFinger(
    employeeId: number,
    zkId: number,
    fingerIndex: number,
    fingerLabel: string
): Promise<void> {
    const enrollments = await prisma.employeeFingerprintEnrollment.findMany({
        where: { employeeId, fingerIndex },
        select: { deviceId: true }
    });

    for (const enr of enrollments) {
        await enqueueDeleteFinger(enr.deviceId, { zkId, fingerIndex });
    }
    
    // Immediately remove enrollment records so DB is state-correct,
    // actual deletion happens via tasks when devices are reachable.
    await prisma.employeeFingerprintEnrollment.deleteMany({
        where: { employeeId, fingerIndex }
    });
    
    // Cleanup parent record if no fingers left
    for (const enr of enrollments) {
        const remaining = await prisma.employeeFingerprintEnrollment.count({
            where: { employeeId, deviceId: enr.deviceId }
        });
        if (remaining === 0) {
            await prisma.employeeDeviceEnrollment.deleteMany({
                where: { employeeId, deviceId: enr.deviceId }
            });
        }
    }
    
    console.log(`[SyncQueue] Translated global delete of ${fingerLabel} (zkId=${zkId}) into ${enrollments.length} queue tasks.`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Queue Runner
// ─────────────────────────────────────────────────────────────────────────────

const MAX_RETRIES = 3;

/**
 * Execute a single queue task idempotently.
 * Throws an Error if it fails and needs retry, otherwise returns void for success.
 */
async function executeTask(task: any, zk: any): Promise<void> {
    const actionType = task.actionType as SyncActionType;
    
    try {
        if (actionType === 'UPSERT_USER') {
            const payload = task.payload as UpsertUserPayload;
            const deviceUid = payload.zkId;
            const visibleId = payload.zkId.toString();
            
            // Porting the robust pre-write occupancy check from addUserToDevice
            const deviceUsers = await zk.getUsers() || [];
            const occupant = deviceUsers.find((u: any) => u.uid === deviceUid);
            const visibleConflict = deviceUsers.find((u: any) =>
                String(u.userId).trim() === visibleId.trim() && u.uid !== deviceUid
            );

            if (occupant) {
                if (String(occupant.userId).trim() === visibleId.trim()) {
                    // Safe to update in place
                    await zk.setUser(deviceUid, payload.name, "", payload.role, payload.card, visibleId);
                } else {
                    throw new Error(`UID conflict: slot ${deviceUid} occupied by another user ("${occupant.name}")`);
                }
            } else if (visibleConflict) {
                throw new Error(`visibleId conflict: userId=${visibleId} already claimed by uid=${visibleConflict.uid}`);
            } else {
                // Empty slot, force clean before writing
                try { await zk.deleteUser(deviceUid); } catch { /* empty */ }
                await zk.clearUserFingerprints(deviceUid);
                await zk.setUser(deviceUid, payload.name, "", payload.role, payload.card, visibleId);
            }
        } 
        else if (actionType === 'DELETE_USER') {
            const payload = task.payload as DeleteUserPayload;
            await zk.deleteUser(payload.zkId);
        }
        else if (actionType === 'DELETE_FINGER') {
            const payload = task.payload as DeleteFingerPayload;
            await zk.deleteFingerTemplate(payload.zkId, payload.fingerIndex);
        }
        else {
            throw new Error(`Unknown actionType: ${actionType}`);
        }
    } catch (error: unknown) {
        const msg = zkErrMsg(error).toLowerCase();
        
        // --- IDEMPOTENCY CHECKS ---
        if (actionType === 'DELETE_USER' || actionType === 'DELETE_FINGER') {
            if (msg.includes('not found') || msg.includes('no data') || msg.includes('does not exist')) {
                // Desired state achieved!
                console.log(`[SyncQueue] Overriding error for ${actionType} on ${task.entityId}: Data absent.`);
                return; // Treat as success
            }
        }
        
        // Re-throw if it wasn't an expected edge case
        throw error;
    }
}

/**
 * Process all pending tasks for a specific device.
 * Maintains O(1) impact since it only runs what explicitly changed.
 */
export async function processDeviceSyncQueue(deviceId: number): Promise<void> {
    const pendingTasks = await prisma.deviceSyncTask.findMany({
        where: { deviceId, status: 'PENDING' },
        orderBy: { createdAt: 'asc' } // Strictly execute chronological DDL
    });

    if (pendingTasks.length === 0) {
        return;
    }

    const device = await prisma.device.findUnique({ where: { id: deviceId } });
    if (!device || !device.isActive) return;

    await acquireDeviceLock(deviceId);
    
    const zk = getDriver(device.ip, device.port);
    let successfullyConnected = false;
    
    try {
        console.log(`[SyncQueue] Processing ${pendingTasks.length} queued task(s) for "${device.name}"...`);
        await connectWithRetry(zk, 1);
        successfullyConnected = true;

        let processedCount = 0;
        let deadLetterCount = 0;

        for (const task of pendingTasks) {
            try {
                await executeTask(task, zk);
                
                // Mark success
                await prisma.deviceSyncTask.update({
                    where: { id: task.id },
                    data: { status: 'SUCCESS' }
                });
                
                processedCount++;
                
            } catch (err: unknown) {
                const newRetryCount = task.retryCount + 1;
                const errorStr = zkErrMsg(err);
                
                if (newRetryCount >= MAX_RETRIES) {
                    // Dead letter
                    await prisma.deviceSyncTask.update({
                        where: { id: task.id },
                        data: { 
                            status: 'DEAD_LETTER', 
                            retryCount: newRetryCount 
                        }
                    });
                    
                    console.error(`[SyncQueue] Task ${task.id} (${task.actionType}) DEAD_LETTERED after ${MAX_RETRIES} attempts. Last error: ${errorStr}`);

                    void audit({
                        action: 'SYNC_QUEUE_FAIL',
                        level: 'ERROR',
                        entityType: 'Device',
                        entityId: deviceId,
                        details: `Task ${task.actionType} for ${task.entityId} failed permanently`,
                        metadata: { deviceId, task, errorStr }
                    });
                    
                    deadLetterCount++;
                } else {
                    // Queue for retry
                    await prisma.deviceSyncTask.update({
                        where: { id: task.id },
                        data: { retryCount: newRetryCount }
                    });
                    console.warn(`[SyncQueue] Task ${task.id} (${task.actionType}) failed (attempt ${newRetryCount}). Retrying next cycle. Error: ${errorStr}`);
                }
            }
        }

        // Refresh device data so its internal memory maps the changes
        if (processedCount > 0) {
            await zk.refreshData();
        }

        console.log(`[SyncQueue] Done for "${device.name}". Processed: ${processedCount}. Dead Letters: ${deadLetterCount}.`);
        
    } catch (err: unknown) {
        if (!successfullyConnected) {
            console.warn(`[SyncQueue] Cannot process queue for "${device?.name}" — device unreachable: ${zkErrMsg(err)}`);
        } else {
            console.error(`[SyncQueue] Critical error processing queue for "${device?.name}": ${zkErrMsg(err)}`);
        }
    } finally {
        if (successfullyConnected) {
            try { await zk.disconnect(); } catch { /* ignore */ }
        }
        releaseDeviceLock(deviceId);
    }
}
