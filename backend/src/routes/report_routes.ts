import { Router } from 'express';
import { getAttendanceSummaryReport } from '../controllers/report.controller';
import { authenticate } from '../middleware/auth.middleware';
import { adminOrHR } from '../middleware/role.middleware';

const router = Router();

// Require login + ADMIN or HR role (same as attendance routes)
router.use(authenticate);
router.use(adminOrHR);

/**
 * @swagger
 * /api/reports/summary:
 *   get:
 *     summary: Get pre-computed attendance summary for all active employees
 *     tags: [Reports]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: startDate
 *         required: true
 *         schema:
 *           type: string
 *           format: date
 *         example: "2026-03-01"
 *       - in: query
 *         name: endDate
 *         required: true
 *         schema:
 *           type: string
 *           format: date
 *         example: "2026-03-11"
 *     responses:
 *       200:
 *         description: Summary rows + raw attendance records
 */
router.get('/summary', getAttendanceSummaryReport);

export default router;
