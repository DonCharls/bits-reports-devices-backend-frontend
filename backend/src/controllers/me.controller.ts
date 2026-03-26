import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import bcrypt from 'bcryptjs';
import attendanceEmitter from '../lib/attendanceEmitter';

// Get logged-in employee's own attendance records
export const getMyAttendance = async (req: Request, res: Response): Promise<void> => {
    try {
        if (!req.user?.employeeId) {
            res.status(401).json({ success: false, message: 'Not authenticated' });
            return;
        }

        const employeeId = req.user.employeeId;
        const { startDate, endDate } = req.query;

        let dateFilter: any = {};

        if (startDate && endDate) {
            // Use PHT (UTC+8) boundaries: subtract 8 hours from PHT midnight to get the correct UTC time
            dateFilter = {
                gte: new Date(`${startDate}T00:00:00.000+08:00`),
                lte: new Date(`${endDate}T23:59:59.999+08:00`),
            };
        }

        const records = await prisma.attendance.findMany({
            where: {
                employeeId,
                ...(Object.keys(dateFilter).length > 0 && { date: dateFilter }),
            },
            orderBy: { date: 'desc' },
        });

        res.status(200).json({ success: true, count: records.length, data: records });
    } catch (error: any) {
        console.error('getMyAttendance error:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch attendance records', error: error.message });
    }
};

// Get logged-in employee's assigned shift
export const getMyShift = async (req: Request, res: Response): Promise<void> => {
    try {
        if (!req.user?.employeeId) {
            res.status(401).json({ success: false, message: 'Not authenticated' });
            return;
        }

        const employee = await prisma.employee.findUnique({
            where: { id: req.user.employeeId },
            include: { Shift: true },
        });

        if (!employee) {
            res.status(404).json({ success: false, message: 'Employee not found' });
            return;
        }

        res.status(200).json({ success: true, shift: employee.Shift });
    } catch (error: any) {
        console.error('getMyShift error:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch shift details', error: error.message });
    }
};

// Get logged-in employee's profile
export const getMyProfile = async (req: Request, res: Response): Promise<void> => {
    try {
        if (!req.user?.employeeId) {
            res.status(401).json({ success: false, message: 'Not authenticated' });
            return;
        }

        const employee = await prisma.employee.findUnique({
            where: { id: req.user.employeeId },
            select: {
                id: true,
                zkId: true,
                firstName: true,
                lastName: true,
                email: true,
                role: true,
                department: true,
                position: true,
                branch: true,
                contactNumber: true,
                employeeNumber: true,
                hireDate: true,
                employmentStatus: true,
                needsPasswordChange: true,
                createdAt: true,
            },
        });

        if (!employee) {
            res.status(404).json({ success: false, message: 'Employee not found' });
            return;
        }

        res.status(200).json({ success: true, profile: employee });
    } catch (error: any) {
        console.error('getMyProfile error:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch profile', error: error.message });
    }
};

// Change logged-in employee's password
export const changePassword = async (req: Request, res: Response): Promise<void> => {
    try {
        if (!req.user?.employeeId) {
            res.status(401).json({ success: false, message: 'Not authenticated' });
            return;
        }

        const { currentPassword, newPassword } = req.body;

        if (!currentPassword || !newPassword) {
            res.status(400).json({ success: false, message: 'Current and new passwords are required' });
            return;
        }

        const employee = await prisma.employee.findUnique({
            where: { id: req.user.employeeId },
        });

        if (!employee || !employee.password) {
            res.status(400).json({ success: false, message: 'Account does not have a password set' });
            return;
        }

        const isMatch = await bcrypt.compare(currentPassword, employee.password);
        if (!isMatch) {
            res.status(400).json({ success: false, message: 'Incorrect current password' });
            return;
        }

        if (newPassword.length < 6) {
            res.status(400).json({ success: false, message: 'New password must be at least 6 characters long' });
            return;
        }

        const hashedNewPassword = await bcrypt.hash(newPassword, 10);

        await prisma.employee.update({
            where: { id: employee.id },
            data: { password: hashedNewPassword, needsPasswordChange: false },
        });

        res.status(200).json({ success: true, message: 'Password changed successfully' });
    } catch (error: any) {
        console.error('changePassword error:', error);
        res.status(500).json({ success: false, message: 'Failed to change password', error: error.message });
    }
};

/**
 * GET /api/me/attendance/stream
 * Server-Sent Events endpoint for the logged-in employee's own real-time attendance updates.
 */
export const streamMyAttendance = async (req: Request, res: Response): Promise<void> => {
    if (!req.user?.employeeId) {
        res.status(401).end();
        return;
    }

    const currentEmployeeId = req.user.employeeId;

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    res.flushHeaders();

    res.write(`event: connected\ndata: ${JSON.stringify({ ts: Date.now() })}\n\n`);

    const heartbeatInterval = setInterval(() => {
        res.write(': heartbeat\n\n');
    }, 25_000);

    const onNewRecord = (payload: { type: string; record: any }) => {
        // Only forward events belonging to the logged-in employee
        if (payload.record?.employeeId === currentEmployeeId) {
            res.write(`event: attendance\ndata: ${JSON.stringify(payload)}\n\n`);
        }
    };

    attendanceEmitter.on('new-record', onNewRecord);

    req.on('close', () => {
        clearInterval(heartbeatInterval);
        attendanceEmitter.off('new-record', onNewRecord);
    });
};
