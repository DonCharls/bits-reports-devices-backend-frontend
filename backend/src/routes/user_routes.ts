import { Router } from 'express';
import {
    getAllUsers,
    createUser,
    updateUser,
    deleteUser,
    toggleUserStatus,
    updateProfile,
    changePassword,
} from '../controllers/user.controller';
import { authenticate } from '../middleware/auth.middleware';
import { adminOnly, adminOrHR } from '../middleware/role.middleware';

const router = Router();

/**
 * @swagger
 * tags:
 *   name: Users
 *   description: User account management (Admin-level accounts, not employees)
 */

// All routes require authentication
router.use(authenticate);

// ── Self-service routes (any ADMIN or HR) ──────────────────
// These must be defined BEFORE the /:id routes to avoid conflict

/**
 * @swagger
 * /api/users/profile:
 *   put:
 *     summary: Update own profile (name, email, etc.)
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               firstName:
 *                 type: string
 *               lastName:
 *                 type: string
 *               email:
 *                 type: string
 *                 format: email
 *     responses:
 *       200:
 *         description: Profile updated successfully
 *       401:
 *         description: Not authenticated
 */
router.put('/profile', adminOrHR, updateProfile);

/**
 * @swagger
 * /api/users/change-password:
 *   put:
 *     summary: Change own password
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - currentPassword
 *               - newPassword
 *             properties:
 *               currentPassword:
 *                 type: string
 *               newPassword:
 *                 type: string
 *                 minLength: 8
 *     responses:
 *       200:
 *         description: Password changed successfully
 *       400:
 *         description: Validation error (password too short, mismatch, etc.)
 *       401:
 *         description: Current password is incorrect
 */
router.put('/change-password', adminOrHR, changePassword);

// ── User management routes (ADMIN only) ────────────────────

/**
 * @swagger
 * /api/users:
 *   get:
 *     summary: Get all user accounts
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of user accounts
 *       403:
 *         description: Admin role required
 */
router.get('/', adminOnly, getAllUsers);

/**
 * @swagger
 * /api/users:
 *   post:
 *     summary: Create a new user account
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - firstName
 *               - lastName
 *               - email
 *               - password
 *               - role
 *             properties:
 *               firstName:
 *                 type: string
 *               lastName:
 *                 type: string
 *               email:
 *                 type: string
 *                 format: email
 *               password:
 *                 type: string
 *                 minLength: 6
 *               role:
 *                 type: string
 *                 enum: [ADMIN, HR]
 *     responses:
 *       201:
 *         description: User created
 *       400:
 *         description: Validation error or user already exists
 *       403:
 *         description: Admin role required
 */
router.post('/', adminOnly, createUser);

/**
 * @swagger
 * /api/users/{id}:
 *   put:
 *     summary: Update a user account
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               firstName:
 *                 type: string
 *               lastName:
 *                 type: string
 *               email:
 *                 type: string
 *               role:
 *                 type: string
 *                 enum: [ADMIN, HR]
 *     responses:
 *       200:
 *         description: User updated
 *       404:
 *         description: User not found
 */
router.put('/:id', adminOnly, updateUser);

/**
 * @swagger
 * /api/users/{id}:
 *   delete:
 *     summary: Delete a user account
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: User deleted
 *       404:
 *         description: User not found
 */
router.delete('/:id', adminOnly, deleteUser);

/**
 * @swagger
 * /api/users/{id}/toggle-status:
 *   patch:
 *     summary: Toggle user active/inactive status
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Status toggled (also invalidates refresh tokens if deactivated)
 *       404:
 *         description: User not found
 */
router.patch('/:id/toggle-status', adminOnly, toggleUserStatus);

export default router;
