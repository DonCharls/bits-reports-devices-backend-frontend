import { Router } from 'express';
import { getLogs } from '../controllers/logs.controller';
import { authenticate } from '../middleware/auth.middleware';
import { adminOrHR } from '../middleware/role.middleware';

const router = Router();

router.use(authenticate);
router.use(adminOrHR);

/**
 * @swagger
 * tags:
 *   name: Logs
 *   description: System audit / activity logs
 */

/**
 * @swagger
 * /api/logs:
 *   get:
 *     summary: Get system activity logs
 *     tags: [Logs]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *         description: Items per page
 *       - in: query
 *         name: action
 *         schema:
 *           type: string
 *         description: Filter by action type
 *     responses:
 *       200:
 *         description: Paginated list of logs
 */
router.get('/', getLogs);

export default router;
