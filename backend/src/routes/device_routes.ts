import { Router } from 'express';
import {
    getAllDevices,
    createDevice,
    updateDevice,
    deleteDevice,
    testDeviceConnection,
    reconcileDevice,
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

export default router;
