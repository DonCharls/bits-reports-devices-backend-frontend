import { Router } from 'express';
import {
    getSyncStatus,
    getSyncConfig,
    updateSyncConfig,
    toggleGlobalSync,
    triggerManualSync,
    triggerManualTimeSync,
    triggerManualLogBufferClear,
    getSystemLogs
} from './system.controller';
import { authenticate } from '../../shared/middleware/auth.middleware';
import { adminOrHR } from '../../shared/middleware/role.middleware';

const router = Router();

// Protect all system routes
router.use(authenticate);
router.use(adminOrHR);

// Get current sync status (scheduler + config)
router.get('/sync-status', getSyncStatus);

// Get/Update sync config
router.get('/sync-config', getSyncConfig);
router.put('/sync-config', updateSyncConfig);

// Toggle global sync on/off
router.post('/sync-toggle', toggleGlobalSync);

// Trigger immediate manual syncs
router.post('/sync-now', triggerManualSync);
router.post('/time-sync-now', triggerManualTimeSync);

// Fetch system audit logs
router.get('/logs', getSystemLogs);

// Manually trigger device log buffer clear
router.post('/clear-device-logs', triggerManualLogBufferClear);

export default router;

