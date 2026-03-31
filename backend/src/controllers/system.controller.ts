import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { syncScheduler } from '../services/system/syncScheduler';
import { timeSyncScheduler } from '../services/system/timeSyncScheduler';
import { audit } from '../lib/auditLogger';
import { z } from 'zod';
import deviceEmitter from '../lib/deviceEmitter';

const updateSyncConfigSchema = z.object({
    defaultIntervalSec: z.number().min(10, "Interval must be at least 10s").optional(),
    highFreqIntervalSec: z.number().min(10, "Interval must be at least 10s").optional(),
    lowFreqIntervalSec: z.number().min(60, "Low frequency interval must be at least 60s").optional(),
    shiftAwareSyncEnabled: z.boolean().optional(),
    shiftBufferMinutes: z.number().max(240, "Shift buffer cannot exceed 4 hours (240 min)").optional(),
    autoTimeSyncEnabled: z.boolean().optional(),
    timeSyncIntervalSec: z.number().min(300, "Time sync interval must be at least 5 minutes (300s)").optional(),
});

// ─── GET /api/system/sync-status ──────────────────────────────────────────────
export const getSyncStatus = async (req: Request, res: Response) => {
    try {
        const config = await prisma.syncConfig.findUnique({ where: { id: 1 } });
        if (!config) {
            return res.status(404).json({ success: false, message: 'Sync config not found' });
        }

        const schedulerStatus = syncScheduler.getStatus();

        res.json({
            success: true,
            status: {
                ...schedulerStatus,
                globalSyncEnabled: config.globalSyncEnabled,
            }
        });
    } catch (error: unknown) {
        const errMsg = error instanceof Error ? error.message : 'Unknown error';
        console.error('[System] Error fetching sync status:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch sync status', error: errMsg });
    }
};

// ─── GET /api/system/sync-config ──────────────────────────────────────────────
export const getSyncConfig = async (req: Request, res: Response) => {
    try {
        const config = await prisma.syncConfig.findUnique({ where: { id: 1 } });
        if (!config) {
            return res.status(404).json({ success: false, message: 'Sync config not found' });
        }
        res.json({ success: true, config });
    } catch (error: unknown) {
        const errMsg = error instanceof Error ? error.message : 'Unknown error';
        console.error('[System] Error fetching sync config:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch sync config', error: errMsg });
    }
};

// ─── PUT /api/system/sync-config ──────────────────────────────────────────────
export const updateSyncConfig = async (req: Request, res: Response) => {
    try {
        const parsed = updateSyncConfigSchema.safeParse(req.body);
        if (!parsed.success) {
            return res.status(400).json({ 
                success: false, 
                message: 'Validation failed', 
                errors: parsed.error.issues 
            });
        }

        const data = parsed.data;

        // Read current config for before/after comparison
        const previousConfig = await prisma.syncConfig.findUnique({ where: { id: 1 } });
        if (!previousConfig) {
            return res.status(404).json({ success: false, message: 'Sync config not found' });
        }

        let warningMessage: string | null = null;
        if ((data.defaultIntervalSec !== undefined && data.defaultIntervalSec < 30) ||
            (data.highFreqIntervalSec !== undefined && data.highFreqIntervalSec < 30)) {
            warningMessage = "Intervals under 30s may cause high server load and device connection instability.";
        }

        const config = await prisma.syncConfig.update({
            where: { id: 1 },
            data: { ...data }
        });

        // Build human-readable change summaries
        const changes: string[] = [];
        const trackableFields: Array<{ key: keyof typeof data; label: string; suffix?: string }> = [
            { key: 'defaultIntervalSec', label: 'Sync interval', suffix: 's' },
            { key: 'highFreqIntervalSec', label: 'Peak interval', suffix: 's' },
            { key: 'lowFreqIntervalSec', label: 'Off-peak interval', suffix: 's' },
            { key: 'shiftBufferMinutes', label: 'Shift buffer', suffix: ' min' },
            { key: 'shiftAwareSyncEnabled', label: 'Shift-aware sync' },
            { key: 'autoTimeSyncEnabled', label: 'Automated time sync' },
            { key: 'timeSyncIntervalSec', label: 'Time sync interval', suffix: 's' }
        ];

        for (const field of trackableFields) {
            const newVal = data[field.key];
            if (newVal === undefined) continue;
            const oldVal = previousConfig[field.key];
            if (oldVal !== newVal) {
                if (typeof newVal === 'boolean') {
                    changes.push(`${field.label} ${newVal ? 'enabled' : 'disabled'}`);
                } else {
                    changes.push(`${field.label} updated from ${oldVal}${field.suffix ?? ''} → ${newVal}${field.suffix ?? ''}`);
                }
            }
        }

        // Only log if something actually changed
        if (changes.length > 0) {
            await audit({
                action: 'CONFIG_UPDATE',
                entityType: 'System',
                entityId: 1,
                performedBy: req.user?.employeeId,
                source: 'admin-panel',
                level: warningMessage ? 'WARN' : 'INFO',
                details: changes.join('; '),
                metadata: {
                    updates: changes,
                    ...(warningMessage ? { warning: warningMessage } : {}),
                }
            });
        }

        // Restart the scheduler countdown immediately so the new interval applies right now
        // instead of waiting for the old interval to finish its long sleep.
        syncScheduler.reloadConfigAndReset().catch(err => console.error('[System] Error resetting scheduler timer:', err));
        timeSyncScheduler.reloadConfigAndReset().catch(err => console.error('[System] Error resetting time sync scheduler timer:', err));

        deviceEmitter.emit('config-update');

        res.json({ 
            success: true, 
            message: 'Sync configuration updated successfully', 
            warning: warningMessage,
            config 
        });
    } catch (error: unknown) {
        const errMsg = error instanceof Error ? error.message : 'Unknown error';
        console.error('[System] Error updating sync config:', error);
        res.status(500).json({ success: false, message: 'Failed to update sync config', error: errMsg });
    }
};

// ─── POST /api/system/sync-toggle ─────────────────────────────────────────────
export const toggleGlobalSync = async (req: Request, res: Response) => {
    try {
        const { enabled } = req.body;
        
        if (typeof enabled !== 'boolean') {
            return res.status(400).json({ success: false, message: 'Missing or invalid "enabled" field' });
        }

        const config = await prisma.syncConfig.update({
            where: { id: 1 },
            data: { globalSyncEnabled: enabled }
        });

        const state = enabled ? 'enabled' : 'disabled';
        console.log(`[System] Global sync has been ${state}`);

        await audit({
            action: 'STATUS_CHANGE',
            entityType: 'System',
            entityId: 1,
            performedBy: req.user?.employeeId,
            source: 'admin-panel',
            details: `Global sync was ${state}`
        });

        res.json({ success: true, message: `Global sync has been ${state}`, config });
    } catch (error: unknown) {
        const errMsg = error instanceof Error ? error.message : 'Unknown error';
        console.error('[System] Error toggling global sync:', error);
        res.status(500).json({ success: false, message: 'Failed to toggle global sync', error: errMsg });
    }
};

// ─── POST /api/system/sync-now ────────────────────────────────────────────────
export const triggerManualSync = async (req: Request, res: Response) => {
    try {
        console.log(`[System] Manual sync triggered by user ${req.user?.employeeId || 'unknown'}`);
        
        // This runs the sync and waits for it to finish.
        // It relies on the internal tryAcquireDeviceLock inside syncZkData to avoid conflicts
        // with the background scheduler.
        const result = await syncScheduler.triggerNow();
        const syncResult = result.result;

        const level = syncResult?.status === 'SUCCESS' ? 'INFO' : (syncResult?.status === 'PARTIAL' ? 'WARN' : 'ERROR');

        await audit({
            action: 'MANUAL_SYNC',
            entityType: 'System',
            source: 'admin-panel',
            level,
            performedBy: req.user?.employeeId,
            details: syncResult?.message || (result.success ? 'Manual sync completed successfully' : 'Manual sync failed'),
            metadata: syncResult ? { 
                syncStatus: syncResult.status,
                totalDevices: syncResult.totalDevices,
                successfulDevices: syncResult.successfulDevices,
                newLogsCount: syncResult.newLogs,
            } : undefined
        });

        if (result.success) {
            res.json({ success: true, message: 'Manual sync completed', data: syncResult });
        } else {
            res.status(200).json({ success: false, message: 'Manual sync completed with failures', data: syncResult });
        }
    } catch (error: unknown) {
        const errMsg = error instanceof Error ? error.message : 'Unknown error';
        console.error('[System] Error triggering manual sync:', error);
        res.status(500).json({ success: false, message: 'Failed to trigger manual sync', error: errMsg });
    }
};

// ─── POST /api/system/time-sync-now ──────────────────────────────────────────
export const triggerManualTimeSync = async (req: Request, res: Response) => {
    try {
        console.log(`[System] Manual time sync triggered by user ${req.user?.employeeId || 'unknown'}`);
        
        const result = await timeSyncScheduler.triggerNow();

        await audit({
            action: 'MANUAL_SYNC',
            entityType: 'System',
            source: 'admin-panel',
            level: result.success ? 'INFO' : 'ERROR',
            performedBy: req.user?.employeeId,
            details: result.success ? 'Manual device clock sync completed' : 'Manual device clock sync failed',
            metadata: { target: 'time_sync', message: result.message }
        });

        if (result.success) {
            res.json({ success: true, message: result.message });
        } else {
            res.status(500).json({ success: false, message: result.message });
        }
    } catch (error: unknown) {
        const errMsg = error instanceof Error ? error.message : 'Unknown error';
        console.error('[System] Error triggering manual time sync:', error);
        res.status(500).json({ success: false, message: 'Failed to trigger manual time sync', error: errMsg });
    }
};

// ─── GET /api/system/logs ─────────────────────────────────────────────────────
export const getSystemLogs = async (req: Request, res: Response) => {
    try {
        const logs = await prisma.auditLog.findMany({
            where: { entityType: 'System' },
            orderBy: { timestamp: 'desc' },
            take: 50
        });
        res.json({ success: true, logs });
    } catch (error: unknown) {
        const errMsg = error instanceof Error ? error.message : 'Unknown error';
        console.error('[System] Error fetching system logs:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch logs', error: errMsg });
    }
};

