import { Router } from 'express';
import {
    getAllDevices,
    createDevice,
    updateDevice,
    deleteDevice,
    testDeviceConnection,
    reconcileDevice,
    toggleDevice,
} from '../controllers/device.controller';
import { authenticate } from '../middleware/auth.middleware';
import { adminOrHR } from '../middleware/role.middleware';

const router = Router();

router.use(authenticate);
router.use(adminOrHR);

router.get('/', getAllDevices);
router.post('/', createDevice);
router.put('/:id', updateDevice);
router.delete('/:id', deleteDevice);
router.post('/:id/test', testDeviceConnection);
router.post('/:id/reconcile', reconcileDevice);
router.patch('/:id/toggle', toggleDevice);

// Emergency: force-release the device lock if it gets stuck
router.post('/unlock', (req, res) => {
    const { forceReleaseLock } = require('../services/zkServices');
    forceReleaseLock();
    res.json({ success: true, message: 'Device lock force-released.' });
});

export default router;

