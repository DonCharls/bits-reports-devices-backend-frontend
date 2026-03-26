import { Router } from 'express';
import {
    getMyAttendance,
    getMyShift,
    getMyProfile,
    changePassword,
    streamMyAttendance,
} from '../controllers/me.controller';
import { authenticate } from '../middleware/auth.middleware';

const router = Router();

// All employee self-service routes are protected by the generic authentication middleware
router.use(authenticate);

/**
 * @swagger
 * tags:
 *   name: Me (Employee Self-Service)
 *   description: Endpoints for logged-in users to access their own data
 */

/**
 * @swagger
 * /api/me/attendance/stream:
 *   get:
 *     summary: Server-Sent Events stream for my own real-time attendance updates
 *     tags: [Me]
 *     security:
 *       - bearerAuth: []
 */
router.get('/attendance/stream', streamMyAttendance);

/**
 * @swagger
 * /api/me/attendance:
 *   get:
 *     summary: Get my own attendance
 *     tags: [Me]
 *     security:
 *       - bearerAuth: []
 */
router.get('/attendance', getMyAttendance);

/**
 * @swagger
 * /api/me/shift:
 *   get:
 *     summary: Get my assigned shift
 *     tags: [Me]
 *     security:
 *       - bearerAuth: []
 */
router.get('/shift', getMyShift);

/**
 * @swagger
 * /api/me/profile:
 *   get:
 *     summary: Get my profile information
 *     tags: [Me]
 *     security:
 *       - bearerAuth: []
 */
router.get('/profile', getMyProfile);

/**
 * @swagger
 * /api/me/password:
 *   put:
 *     summary: Change my password
 *     tags: [Me]
 *     security:
 *       - bearerAuth: []
 */
router.put('/password', changePassword);

export default router;
