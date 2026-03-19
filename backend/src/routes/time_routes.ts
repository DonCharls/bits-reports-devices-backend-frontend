import { Router } from 'express';
import { getServerTime } from '../controllers/time.controller';

const router = Router();

// Used by the frontend to sync its local clock with the server's authoritative clock
router.get('/now', getServerTime);

export default router;
