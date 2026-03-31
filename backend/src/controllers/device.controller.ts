import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { ZKDriver } from '../lib/zk-driver';
import { forceReleaseLock } from '../services/zkServices';
import deviceEmitter from '../lib/deviceEmitter';
import { audit } from '../lib/auditLogger';

/** Unwrap node-zklib's ZKError: { err: Error, ip, command } → readable string */
function zkErrMsg(err: any): string {
    if (!err) return 'Unknown error';
    if (typeof err === 'string') return err;
    if (err.err instanceof Error) return `${err.command || 'ZK'}: ${err.err.message}`;
    if (err.message) return err.message;
    return String(err);
}

// ─── GET /api/devices ────────────────────────────────────────────────────────
export const getAllDevices = async (req: Request, res: Response) => {
    try {
        const devices = await prisma.device.findMany({
            orderBy: { createdAt: 'asc' },
        });
        res.json({ success: true, devices });
    } catch (error: any) {
        console.error('[Devices] Error fetching devices:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch devices', error: error.message });
    }
};

// ─── POST /api/devices ───────────────────────────────────────────────────────
export const createDevice = async (req: Request, res: Response) => {
    try {
        const { name, ip, port = 4370, location } = req.body;

        if (!name?.trim()) {
            return res.status(400).json({ success: false, message: 'Device name is required' });
        }
        if (!ip?.trim()) {
            return res.status(400).json({ success: false, message: 'IP address is required' });
        }

        const existing = await prisma.device.findUnique({ where: { ip: ip.trim() } });
        if (existing) {
            return res.status(409).json({ success: false, message: `A device with IP ${ip} already exists` });
        }

        const device = await prisma.device.create({
            data: {
                name: name.trim(),
                ip: ip.trim(),
                port: Number(port),
                location: location?.trim() || null,
                isActive: false, // Unknown until tested
                updatedAt: new Date(),
            }
        });

        console.log(`[Devices] Created device "${device.name}" (${device.ip}:${device.port})`);

        await audit({
            action: 'CREATE',
            entityType: 'Device',
            entityId: device.id,
            performedBy: req.user?.employeeId,
            source: 'admin-panel',
            details: `Added new device "${device.name}" (${device.ip})`
        });

        res.status(201).json({ success: true, message: `Device "${device.name}" added successfully`, device });
    } catch (error: any) {
        console.error('[Devices] Error creating device:', error);
        res.status(500).json({ success: false, message: 'Failed to create device', error: error.message });
    }
};

// ─── PUT /api/devices/:id ────────────────────────────────────────────────────
export const updateDevice = async (req: Request, res: Response) => {
    try {
        const id = parseInt(String(req.params.id));
        const { name, ip, port, location } = req.body;

        const existing = await prisma.device.findUnique({ where: { id } });
        if (!existing) {
            return res.status(404).json({ success: false, message: 'Device not found' });
        }

        // Check if IP is being changed to one that's already in use
        if (ip && ip.trim() !== existing.ip) {
            const conflict = await prisma.device.findUnique({ where: { ip: ip.trim() } });
            if (conflict) {
                return res.status(409).json({ success: false, message: `A device with IP ${ip} already exists` });
            }
        }

        const device = await prisma.device.update({
            where: { id },
            data: {
                name: name?.trim() ?? existing.name,
                ip: ip?.trim() ?? existing.ip,
                port: port ? Number(port) : existing.port,
                location: location !== undefined ? (location?.trim() || null) : existing.location,
                isActive: false, // Reset status since config changed — must re-test
                updatedAt: new Date(),
            }
        });

        const changes: string[] = [];
        if (existing.name !== device.name) changes.push(`Updated name from "${existing.name}" to "${device.name}"`);
        if (existing.ip !== device.ip) changes.push(`Updated IP from "${existing.ip}" to "${device.ip}"`);
        if (existing.port !== device.port) changes.push(`Updated port from "${existing.port}" to "${device.port}"`);
        if (existing.location !== device.location) changes.push(`Updated location from "${existing.location || 'empty'}" to "${device.location || 'empty'}"`);

        console.log(`[Devices] Updated device ID ${id}: "${device.name}" (${device.ip}:${device.port})`);

        await audit({
            action: 'UPDATE',
            entityType: 'Device',
            entityId: device.id,
            performedBy: req.user?.employeeId,
            source: 'admin-panel',
            details: `Updated device "${device.name}" (${device.ip})`,
            metadata: changes.length > 0 ? { updates: changes } : undefined
        });

        res.json({ success: true, message: `Device "${device.name}" updated. Please test the connection.`, device });
    } catch (error: any) {
        console.error('[Devices] Error updating device:', error);
        res.status(500).json({ success: false, message: 'Failed to update device', error: error.message });
    }
};

// ─── DELETE /api/devices/:id ─────────────────────────────────────────────────
export const deleteDevice = async (req: Request, res: Response) => {
    try {
        const id = parseInt(String(req.params.id));

        const existing = await prisma.device.findUnique({ where: { id } });
        if (!existing) {
            return res.status(404).json({ success: false, message: 'Device not found' });
        }

        await prisma.device.delete({ where: { id } });

        await audit({
            action: 'DELETE',
            entityType: 'Device',
            entityId: id,
            performedBy: req.user?.employeeId,
            source: 'admin-panel',
            details: `Removed device "${existing.name}"`
        });

        console.log(`[Devices] Deleted device ID ${id}: "${existing.name}"`);
        res.json({ success: true, message: `Device "${existing.name}" removed successfully` });
    } catch (error: any) {
        console.error('[Devices] Error deleting device:', error);
        res.status(500).json({ success: false, message: 'Failed to delete device', error: error.message });
    }
};

// ─── POST /api/devices/:id/test ──────────────────────────────────────────────
// Tests the TCP connection to the ZKTeco device, retrieves its info,
// and updates isActive in the database based on whether it succeeded.
export const testDeviceConnection = async (req: Request, res: Response) => {
    const id = parseInt(String(req.params.id));

    try {
        const device = await prisma.device.findUnique({ where: { id } });
        if (!device) {
            return res.status(404).json({ success: false, message: 'Device not found' });
        }

        console.log(`[Devices] Testing connection to "${device.name}" at ${device.ip}:${device.port}...`);

        const timeout = Number(process.env.ZK_TIMEOUT) || 10000;
        const zk = new ZKDriver(device.ip, device.port, timeout);

        let connected = false;
        let info: any = null;
        let userCount = 0;

        try {
            await zk.connect();
            connected = true;

            // Gather device info
            try {
                info = await zk.getInfo();
            } catch {
                // Info retrieval is best-effort
            }

            // Count enrolled users
            try {
                const users = await zk.getUsers();
                userCount = users.length;
            } catch {
                // User count is best-effort
            }

        } finally {
            try { await zk.disconnect(); } catch { /* ignore */ }
        }

        // Update isActive based on test result
        const wasActive = device.isActive;
        await prisma.device.update({
            where: { id },
            data: { isActive: connected, updatedAt: new Date() }
        });

        // Emit a status change only when the state actually changed so open tabs
        // do not re-render unnecessarily on repeated test calls with the same result.
        if (wasActive !== connected) {
            deviceEmitter.emit('status-change', {
                id: device.id,
                name: device.name,
                ip: device.ip,
                isActive: connected,
            });
        }

        if (connected) {
            console.log(`[Devices] ✓ "${device.name}" is ONLINE. Users: ${userCount}`);
            return res.json({
                success: true,
                message: `Device is online and responding`,
                info: {
                    serialNumber: info?.serialNumber || 'N/A',
                    userCount,
                    logCount: info?.logCounts ?? 'N/A',
                    logCapacity: info?.logCapacity ?? 'N/A',
                }
            });
        }

        // Should not reach here — connect() throws on failure
        await prisma.device.update({ where: { id }, data: { isActive: false, updatedAt: new Date() } });
        return res.status(502).json({ success: false, message: 'Device unreachable' });

    } catch (error: any) {
        // ZKError has shape { err: Error, ip, command } — extract inner message
        const msg = zkErrMsg(error);
        console.error(`[Devices] Connection test failed for device ${id}: ${msg}`);

        // Mark device as offline
        // The `device` variable from the try block is out of scope here,
        // so re-query to check the previous isActive state for SSE emission.
        const failedDevice = await prisma.device.findUnique({
            where: { id },
            select: { isActive: true, name: true, ip: true },
        }).catch(() => null);

        const wasActiveOnFail = failedDevice?.isActive ?? false;
        await prisma.device.update({
            where: { id },
            data: { isActive: false, updatedAt: new Date() }
        }).catch(() => { /* ignore if device was deleted */ });

        if (wasActiveOnFail) {
            deviceEmitter.emit('status-change', {
                id,
                name: failedDevice?.name ?? 'Unknown',
                ip: failedDevice?.ip ?? '',
                isActive: false,
            });
        }

        // Check if it's a network/timeout error (ZKError wraps it in .err)
        const innerErr = error?.err;
        const isNetworkError =
            error.code === 'ETIMEDOUT' ||
            error.code === 'ECONNREFUSED' ||
            error.code === 'ENOTFOUND' ||
            innerErr?.code === 'ETIMEDOUT' ||
            innerErr?.code === 'ECONNREFUSED' ||
            msg.toLowerCase().includes('timeout') ||
            msg.toLowerCase().includes('econnrefused') ||
            msg.toLowerCase().includes('enotfound') ||
            msg.toLowerCase().includes('connect');

        return res.json({
            success: false,
            message: isNetworkError
                ? `Device is offline or unreachable — ensure it's powered on and connected to the same network`
                : `Device error: ${msg}`
        });
    }
};

// ─── POST /api/devices/:id/reconcile ─────────────────────────────────────────
// Accepts optional query param: ?dryRun=true
// When dryRun=true the service returns a preview report without writing anything
// to the device. The UI can show this to the admin for confirmation before
// calling again without the flag to commit the changes.
export const reconcileDevice = async (req: Request, res: Response) => {
    const id = parseInt(String(req.params.id));
    if (isNaN(id)) {
        return res.status(400).json({ success: false, message: 'Invalid device ID' });
    }

    // Treat any truthy string ("true", "1", "yes") as dry-run
    const dryRun = ['true', '1', 'yes'].includes(String(req.query.dryRun).toLowerCase());

    try {
        console.log(`[Devices] Starting reconcile for device ${id} (dryRun=${dryRun})...`);
        const { reconcileDeviceWithDB } = await import('../services/zkServices');
        const report = await reconcileDeviceWithDB(id, dryRun);
        const mode = dryRun ? 'Preview (dry run)' : 'Reconcile complete';

        if (!dryRun) {
            await audit({
                action: 'SYNC',
                entityType: 'Device',
                entityId: id,
                performedBy: req.user?.employeeId,
                source: 'admin-panel',
                details: `Reconciled device: pushed ${report.pushed.length}, removed ${report.deleted.length}`
            });
        }

        return res.json({
            success: true,
            message: `${mode}: ${report.pushed.length} to push, ${report.deleted.length} to remove, ${report.needsEnrollment.length} need enrollment.`,
            report,
        });
    } catch (error: any) {
        const msg = zkErrMsg(error);
        console.error(`[Devices] Reconcile failed for device ${id}: ${msg}`);
        return res.status(500).json({ success: false, message: msg });
    }
};

// ─── PATCH /api/devices/:id/toggle ───────────────────────────────────────────
// Flips syncEnabled for a device. When disabled, the cron skips the device
// for attendance syncs. Does NOT affect isActive or the device connection.
export const toggleDevice = async (req: Request, res: Response) => {
    const id = parseInt(String(req.params.id));
    if (isNaN(id)) {
        return res.status(400).json({ success: false, message: 'Invalid device ID' });
    }
    try {
        const existing = await prisma.device.findUnique({ where: { id } });
        if (!existing) {
            return res.status(404).json({ success: false, message: 'Device not found' });
        }

        const updated = await prisma.device.update({
            where: { id },
            data: { syncEnabled: !existing.syncEnabled, updatedAt: new Date() },
        });

        const state = updated.syncEnabled ? 'enabled' : 'disabled';
        console.log(`[Devices] Sync ${state} for "${updated.name}" (${updated.ip})`);

        await audit({
            action: 'STATUS_CHANGE',
            entityType: 'Device',
            entityId: updated.id,
            performedBy: req.user?.employeeId,
            source: 'admin-panel',
            details: `Device sync was ${state}`
        });

        return res.json({ success: true, message: `Sync ${state} for "${updated.name}"`, device: updated });
    } catch (error: any) {
        console.error(`[Devices] Toggle failed for device ${id}:`, error);
        return res.status(500).json({ success: false, message: error.message });
    }
};


/**
 * GET /api/devices/stream
 *
 * Server-Sent Events endpoint. Keeps the HTTP connection open and pushes
 * device status changes (online/offline) to the client as they are
 * detected by the 30-second sync cron job or manual test actions.
 *
 * WHY SSE here: The topbar currently polls /api/health/device every 15
 * seconds from every open tab. With 14 interns this is 56 requests/minute
 * of pure overhead. SSE pushes status changes only when they actually
 * occur — typically a few times per day when the device loses power or
 * the network blips. Zero traffic when the device is stable.
 *
 * Authentication: The authenticate middleware applied at the router level
 * covers this route — valid JWT cookie required, same as all device routes.
 */
export const streamDeviceStatus = async (req: Request, res: Response): Promise<void> => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    // Disable Nginx buffering if a reverse proxy is ever added in front
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    // Send initial connected event with current device states so the
    // client has accurate status immediately without a separate HTTP request.
    try {
        const devices = await prisma.device.findMany({
            select: { id: true, name: true, ip: true, isActive: true, syncEnabled: true, lastSyncedAt: true, lastSyncStatus: true, lastSyncError: true },
            orderBy: { id: 'asc' },
        });
        res.write(`event: connected\ndata: ${JSON.stringify({ devices })}\n\n`);
    } catch {
        // If the DB query fails, send an empty connected event so the
        // client at least knows the stream is open and waits for changes.
        res.write(`event: connected\ndata: ${JSON.stringify({ devices: [] })}\n\n`);
    }

    // 25-second heartbeat keeps the connection alive through proxies
    // that close idle TCP connections after ~60 seconds.
    const heartbeatInterval = setInterval(() => {
        res.write(': heartbeat\n\n');
    }, 25_000);

    const onStatusChange = (payload: {
        id: number;
        name: string;
        ip: string;
        isActive: boolean;
    }) => {
        res.write(`event: device-status\ndata: ${JSON.stringify(payload)}\n\n`);
    };

    const onSyncResult = (payload: {
        id: number;
        lastSyncStatus: string;
        lastSyncedAt: Date | string | null;
        lastSyncError: string | null;
    }) => {
        res.write(`event: device-sync-result\ndata: ${JSON.stringify(payload)}\n\n`);
    };

    const onConfigUpdate = () => {
        res.write(`event: config-update\ndata: {}\n\n`);
    };

    deviceEmitter.on('status-change', onStatusChange);
    deviceEmitter.on('device-sync-result', onSyncResult);
    deviceEmitter.on('config-update', onConfigUpdate);

    req.on('close', () => {
        clearInterval(heartbeatInterval);
        deviceEmitter.off('status-change', onStatusChange);
        deviceEmitter.off('device-sync-result', onSyncResult);
        deviceEmitter.off('config-update', onConfigUpdate);
        console.log(`[SSE] Client disconnected from device stream`);
    });

    console.log(`[SSE] Client connected to device stream`);
};



