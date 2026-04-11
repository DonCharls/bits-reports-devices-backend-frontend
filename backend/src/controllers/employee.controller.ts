import { Request, Response } from 'express';
import ExcelJS from 'exceljs';
import { prisma } from '../lib/prisma';
import { syncEmployeesToDevice, enrollEmployeeFingerprint, enrollEmployeeCard, deleteEmployeeCard, addUserToDevice, deleteUserFromDevice, findNextSafeZkId, acquireRegistrationMutex, deleteFingerprintGlobally, syncEmployeeFingerprints } from '../services/zkServices';
import { audit } from '../lib/auditLogger';
import bcrypt from 'bcryptjs';
import { generateRandomPassword } from '../utils/password.utils';
import { sendWelcomeEmail, sendPasswordResetEmail } from '../services/email.service';
import { validateEmployeeId } from '../utils/employeeValidation';

// GET /api/employees - Get all employees
export const getAllEmployees = async (req: Request, res: Response) => {
    try {
        const employees = await prisma.employee.findMany({
            select: {
                id: true,
                zkId: true,
                cardNumber: true,
                employeeNumber: true,
                firstName: true,
                lastName: true,
                middleName: true,
                suffix: true,
                gender: true,
                dateOfBirth: true,
                email: true,
                role: true,
                department: true,
                departmentId: true,
                Department: { select: { name: true } },
                position: true,
                branch: true,
                contactNumber: true,
                hireDate: true,
                employmentStatus: true,
                shiftId: true,
                Shift: { select: { id: true, name: true, shiftCode: true, startTime: true, endTime: true, workDays: true, halfDays: true, graceMinutes: true, breakMinutes: true } },
                createdAt: true, EmployeeDeviceEnrollment: {
                    select: {
                        enrolledAt: true,
                        device: {
                            select: {
                                id: true,
                                name: true,
                                location: true,
                                isActive: true,
                            },
                        },
                    },
                },
            },
            orderBy: [
                { role: 'asc' },
                { zkId: 'asc' },
            ],
        });



        res.json({
            success: true,
            employees: employees,
        });
    } catch (error) {
        console.error('Error fetching employees:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch employees',
        });
    }
};

// POST /api/employees/sync-to-device - Sync all employees to device
export const syncEmployeesToDeviceController = async (req: Request, res: Response) => {
    try {
        console.log('[API] Request to sync all employees to device...');
        const result = await syncEmployeesToDevice();

        if (result.success) {
            res.json({
                success: true,
                message: result.message,
                count: result.count
            });
        } else {
            res.status(500).json({
                success: false,
                message: result.message || 'Sync failed',
                error: result.error
            });
        }
    } catch (error: any) {
        console.error('Error syncing employees:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to sync employees',
            error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
        });
    }
};

// DELETE /api/employees/:id - Soft delete employee
export const deleteEmployee = async (req: Request, res: Response) => {
    try {
        const id = req.params.id as string;
        const employeeId = parseInt(id);

        if (isNaN(employeeId)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid employee ID',
            });
        }

        // Check if employee exists
        const employee = await prisma.employee.findUnique({
            where: { id: employeeId },
            select: { id: true, firstName: true, lastName: true, employmentStatus: true, zkId: true },
        });

        if (!employee) {
            return res.status(404).json({
                success: false,
                message: 'Employee not found',
            });
        }

        // Delete from ZK Device if zkId exists
        if (employee.zkId) {
            try {
                await deleteUserFromDevice(employee.zkId);
            } catch (err) {
                console.error(`[API] Failed to delete user ${employee.zkId} from device:`, err);
                // Continue with soft delete even if device delete fails
            }
        }

        // Soft delete: Mark as INACTIVE instead of actually deleting
        const updatedEmployee = await prisma.employee.update({
            where: { id: employeeId },
            data: {
                employmentStatus: 'INACTIVE',
            },
            select: {
                id: true,
                firstName: true,
                lastName: true,
                employmentStatus: true,
            },
        });

        await audit({
            action: 'STATUS_CHANGE',
            entityType: 'Employee',
            entityId: employeeId,
            performedBy: req.user?.employeeId,
            details: `Employee ${employee.firstName} ${employee.lastName} deactivated`,
            metadata: { category: 'employee', previousStatus: employee.employmentStatus, newStatus: 'INACTIVE' }
        });

        res.json({
            success: true,
            message: `Employee "${employee.firstName} ${employee.lastName}" marked as inactive`,
            employee: updatedEmployee,
        });
    } catch (error) {
        console.error('Error deleting employee:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to delete employee',
        });
    }
};

// PATCH /api/employees/:id/reactivate - Reactivate inactive employee
export const reactivateEmployee = async (req: Request, res: Response) => {
    try {
        const id = req.params.id as string;
        const employeeId = parseInt(id);

        if (isNaN(employeeId)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid employee ID',
            });
        }

        // Check if employee exists
        const existingEmployee = await prisma.employee.findUnique({
            where: { id: employeeId },
            select: { id: true, firstName: true, lastName: true, employmentStatus: true },
        });

        if (!existingEmployee) {
            return res.status(404).json({
                success: false,
                message: 'Employee not found',
            });
        }

        if (existingEmployee.employmentStatus === 'ACTIVE') {
            return res.status(400).json({
                success: false,
                message: 'Employee is already active',
            });
        }

        const updatedEmployee = await prisma.employee.update({
            where: { id: employeeId },
            data: {
                employmentStatus: 'ACTIVE',
            },
            select: {
                id: true,
                firstName: true,
                lastName: true,
                employmentStatus: true,
            },
        });

        await audit({
            action: 'STATUS_CHANGE',
            entityType: 'Employee',
            entityId: employeeId,
            performedBy: req.user?.employeeId,
            details: `Employee ${updatedEmployee.firstName} ${updatedEmployee.lastName} reactivated`,
            metadata: { category: 'employee', previousStatus: existingEmployee.employmentStatus, newStatus: 'ACTIVE' }
        });

        res.json({
            success: true,
            message: `Employee "${updatedEmployee.firstName} ${updatedEmployee.lastName}" reactivated`,
            employee: updatedEmployee,
        });
    } catch (error: any) {
        console.error('Error reactivating employee:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to reactivate employee',
            error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error',
        });
    }
};

// POST /api/employees - Create new employee
export const createEmployee = async (req: Request, res: Response) => {
    try {
        const {
            employeeNumber,
            firstName,
            lastName,
            middleName,
            suffix,
            gender,
            dateOfBirth,
            email,
            role,
            department,
            position,
            branch,
            contactNumber,
            hireDate,
            employmentStatus,
            shiftId
        } = req.body;

        // Validate Employee ID
        const empIdValidation = validateEmployeeId(employeeNumber);
        if (!empIdValidation.isValid) {
            return res.status(400).json({
                success: false,
                message: empIdValidation.error
            });
        }

        // Validate required fields
        if (!firstName || !lastName) {
            return res.status(400).json({
                success: false,
                message: 'First name and Last name are required'
            });
        }

        // Validate email format and require it
        if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            return res.status(400).json({
                success: false,
                message: 'A valid email is required to receive login credentials'
            });
        }

        // Validate role
        if (role && !['USER', 'ADMIN', 'HR'].includes(role)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid role. Must be USER, ADMIN, or HR'
            });
        }

        // Validate employment status
        if (employmentStatus && !['ACTIVE', 'INACTIVE', 'TERMINATED'].includes(employmentStatus)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid employment status. Must be ACTIVE, INACTIVE, or TERMINATED'
            });
        }

        // Check for existing employee with same email, employee number
        const existingEmployee = await prisma.employee.findFirst({
            where: {
                OR: [
                    { email: email || undefined },
                    { employeeNumber: employeeNumber || undefined },
                ]
            }
        });

        if (existingEmployee) {
            const duplicateField = existingEmployee.email === email ? 'email address' : 'employee number';
            await audit({
                action: 'CREATE',
                level: 'WARN',
                entityType: 'Employee',
                performedBy: req.user?.employeeId,
                details: `Failed to create employee: duplicate ${duplicateField}`,
                metadata: { category: 'employee', email, employeeNumber }
            });

            return res.status(400).json({
                success: false,
                message: `This ${duplicateField} is already in use by another employee`
            });
        }

        // ── Acquire registration mutex before zkId assignment ─────────────────────
        // findNextSafeZkId() + prisma.employee.create() must run as an atomic unit.
        // Without this mutex, two simultaneous POST /api/employees requests both call
        // findNextSafeZkId() before either has written to the DB, both receive the
        // same integer, and one of the prisma.employee.create() calls fails with a
        // P2002 unique constraint violation on Employee.zkId.
        const release = await acquireRegistrationMutex();
        let newEmployee;
        const generatedPassword = generateRandomPassword(10);
        const hashedPassword = await bcrypt.hash(generatedPassword, 10);

        try {
            const nextZkId = await findNextSafeZkId();

            newEmployee = await prisma.employee.create({
                data: {
                    employeeNumber: employeeNumber.trim(),
                    firstName,
                    lastName,
                    middleName: middleName || null,
                    suffix: suffix || null,
                    gender: gender || null,
                    dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : null,
                    email,
                    password: hashedPassword,
                    role: role || 'USER',
                    department,
                    position,
                    branch,
                    contactNumber,
                    hireDate: hireDate ? new Date(hireDate) : undefined,
                    employmentStatus: employmentStatus || 'ACTIVE',
                    zkId: nextZkId,
                    shiftId: shiftId ? parseInt(shiftId, 10) : null,
                    needsPasswordChange: true,
                    updatedAt: new Date()
                },
                select: {
                    id: true,
                    zkId: true,
                    employeeNumber: true,
                    firstName: true,
                    lastName: true,
                    middleName: true,
                    suffix: true,
                    gender: true,
                    dateOfBirth: true,
                    email: true,
                    role: true,
                    department: true,
                    position: true,
                    branch: true,
                    contactNumber: true,
                    hireDate: true,
                    employmentStatus: true,
                    createdAt: true,
                }
            });
        } finally {
            // Always release — even on error — to prevent deadlocking future registrations
            release();
        }

        // Guard: if the mutex block threw, the outer try/catch handles it
        if (!newEmployee) {
            return res.status(500).json({
                success: false,
                message: 'Failed to create employee — unexpected state after registration.',
            });
        }

        console.log(`[API] Created employee: ${newEmployee.firstName} ${newEmployee.lastName} (zkId: ${newEmployee.zkId})`);

        await audit({
            action: 'CREATE',
            entityType: 'Employee',
            entityId: newEmployee.id,
            performedBy: req.user?.employeeId,
            details: `Created employee ${newEmployee.firstName} ${newEmployee.lastName}`,
            metadata: { category: 'employee', email, role: newEmployee.role, department, employeeNumber }
        });

        // ── Respond immediately — device sync happens in the background ──────
        // We do NOT await the device call here. The ZKTeco device may take up to
        // 25 s to time out (3 retries × ~8 s each). Holding the HTTP response
        // open that long causes the success toast to never appear on the frontend.
        // Instead, we respond with 201 right away and let the sync run in the
        // background. If it fails, the admin can use the Fingerprint button later.
        res.status(201).json({
            success: true,
            message: 'Employee created and credentials sent via email.',
            employee: newEmployee,
            deviceSync: { success: null, message: 'Device sync running in background' },
        });

        // Fire-and-forget: sync to biometric device and send email
        setImmediate(async () => {
            // Send welcome email
            if (email) {
                try {
                    await sendWelcomeEmail(email, `${firstName} ${lastName}`, generatedPassword);
                } catch (emailErr) {
                    console.error(`[API] (background) Failed to send welcome email to ${email}:`, emailErr);
                }
            }

            // Sync device
            if (newEmployee.zkId) {
                try {
                    console.log(`[API] (background) Syncing ${newEmployee.firstName} ${newEmployee.lastName} to device...`);
                    const displayName = `${newEmployee.firstName} ${newEmployee.lastName}`;
                    await addUserToDevice(newEmployee.zkId!, displayName, newEmployee.role);
                    console.log(`[API] (background) Device sync OK: ${displayName} (zkId: ${newEmployee.zkId})`);
                } catch (syncErr: any) {
                    console.error(`[API] (background) Device sync failed for zkId ${newEmployee.zkId}:`, syncErr?.message || syncErr);
                }
            }
        });

    } catch (error: any) {
        console.error('Error creating employee:', error);

        await audit({
            action: 'CREATE',
            level: 'ERROR',
            entityType: 'Employee',
            performedBy: req.user?.employeeId,
            details: `Failed to create employee due to server error: ${error.message}`,
            metadata: { category: 'employee', error: error.message }
        });

        res.status(500).json({
            success: false,
            message: 'Failed to create employee',
            error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error',
        });
    }
};

// POST /api/employees/:id/enroll-fingerprint - Enroll fingerprint for employee
export const enrollEmployeeFingerprintController = async (req: Request, res: Response) => {
    try {
        const id = req.params.id as string;
        const employeeId = parseInt(id);

        if (isNaN(employeeId)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid employee ID',
            });
        }

        const body = req.body || {};
        const { fingerIndex, deviceId } = body;

        const finger = fingerIndex !== undefined ? parseInt(fingerIndex) : 5;

        if (finger < 0 || finger > 9) {
            return res.status(400).json({
                success: false,
                message: 'Finger index must be between 0 and 9',
            });
        }

        const device = deviceId ? parseInt(deviceId) : undefined;

        // Check 3-finger max limit
        const existingFingers = await prisma.employeeFingerprintEnrollment.findMany({
            where: { employeeId },
            distinct: ['fingerIndex'],
            select: { fingerIndex: true },
        });

        const isNewFinger = !existingFingers.some(f => f.fingerIndex === finger);
        if (isNewFinger && existingFingers.length >= 3) {
            return res.status(400).json({
                success: false,
                message: 'Employee has reached the maximum limit of 3 fingerprints. Please delete an existing fingerprint first.',
            });
        }

        console.log(`[API] Starting fingerprint enrollment for employee ${employeeId} (finger: ${finger}, device: ${device ?? 'auto'})...`);

        const result = await enrollEmployeeFingerprint(employeeId, finger, device);

        if (result.success) {
            const emp = await prisma.employee.findUnique({
                where: { id: employeeId },
                select: { firstName: true, lastName: true, zkId: true }
            });

            await audit({
                action: 'UPDATE',
                entityType: 'Employee',
                entityId: employeeId,
                performedBy: req.user?.employeeId,
                details: `Triggered fingerprint enrollment on device for ${emp?.firstName} ${emp?.lastName} (Finger ${finger})`,
                metadata: { category: 'employee', deviceId: device, fingerIndex: finger, zkId: emp?.zkId }
            });

            return res.status(200).json({
                success: true,
                message: result.message,
            });
        } else {
            const emp = await prisma.employee.findUnique({ where: { id: employeeId }, select: { firstName: true, lastName: true } });

            await audit({
                action: 'UPDATE',
                level: 'ERROR',
                entityType: 'Employee',
                entityId: employeeId,
                performedBy: req.user?.employeeId,
                details: `Failed to enroll fingerprint for ${emp?.firstName} ${emp?.lastName} (Finger ${finger}): ${result.message}`,
                metadata: { category: 'employee', deviceId: device, fingerIndex: finger, error: result.error || result.message }
            });

            return res.status(500).json({
                success: false,
                message: result.message || 'Enrollment failed',
                error: result.error,
            });
        }

    } catch (error: any) {
        console.error('[API] Enrollment error:', error);

        const empId = req.params.id ? parseInt(req.params.id as string) : undefined;
        await audit({
            action: 'UPDATE',
            level: 'ERROR',
            entityType: 'Employee',
            entityId: isNaN(empId as number) ? undefined : empId,
            performedBy: req.user?.employeeId,
            details: `Exception while starting fingerprint enrollment: ${error.message}`,
            metadata: { category: 'employee', error: error.message, body: req.body }
        });

        return res.status(500).json({
            success: false,
            message: 'Failed to start enrollment',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined,
        });
    }
};

// POST /api/employees/:id/enroll-card - Enroll RFID badge card for employee
export const enrollEmployeeCardController = async (req: Request, res: Response) => {
    try {
        const id = req.params.id as string;
        const employeeId = parseInt(id);

        if (isNaN(employeeId)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid employee ID',
            });
        }

        const body = req.body || {};
        const cardNumber = parseInt(body.cardNumber);

        if (isNaN(cardNumber) || cardNumber < 1 || cardNumber > 4294967295) {
            return res.status(400).json({
                success: false,
                message: 'Card number must be a valid uint32 (1–4294967295)',
            });
        }

        const deviceIdParam = body.deviceId;
        const deviceId = deviceIdParam ? parseInt(deviceIdParam as string) : undefined;

        console.log(`[API] Starting RFID card enrollment for employee ${employeeId}, card ${cardNumber}${deviceId ? ` on device ${deviceId}` : ''}...`);

        const result = await enrollEmployeeCard(employeeId, cardNumber, deviceId);

        if (result.success) {
            const emp = await prisma.employee.findUnique({
                where: { id: employeeId },
                select: { firstName: true, lastName: true, zkId: true }
            });

            await audit({
                action: 'UPDATE',
                entityType: 'Employee',
                entityId: employeeId,
                performedBy: req.user?.employeeId,
                details: `Enrolled RFID badge #${cardNumber} for ${emp?.firstName} ${emp?.lastName}`,
                metadata: { cardNumber, zkId: emp?.zkId }
            });

            return res.status(200).json({
                success: true,
                message: result.message,
                results: result.results,
            });
        } else {
            const statusCode = result.error === 'duplicate_card' ? 409 : 500;

            await audit({
                action: 'UPDATE',
                level: 'ERROR',
                entityType: 'Employee',
                entityId: employeeId,
                performedBy: req.user?.employeeId,
                details: `Failed to enroll RFID badge #${cardNumber}: ${result.message}`,
                metadata: { cardNumber, error: result.error || result.message }
            });

            return res.status(statusCode).json({
                success: false,
                message: result.message || 'Card enrollment failed',
                error: result.error,
                results: result.results,
            });
        }

    } catch (error: any) {
        console.error('[API] Card enrollment error:', error);

        const empId = req.params.id ? parseInt(req.params.id as string) : undefined;
        await audit({
            action: 'UPDATE',
            level: 'ERROR',
            entityType: 'Employee',
            entityId: isNaN(empId as number) ? undefined : empId,
            performedBy: req.user?.employeeId,
            details: `Exception while enrolling RFID badge: ${error.message}`,
            metadata: { error: error.message, body: req.body }
        });

        return res.status(500).json({
            success: false,
            message: 'Failed to enroll RFID badge',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined,
        });
    }
};

export const deleteEmployeeCardController = async (req: Request, res: Response) => {
    try {
        const id = req.params.id as string;
        const employeeId = parseInt(id);

        if (isNaN(employeeId)) {
            return res.status(400).json({ success: false, message: 'Invalid employee ID' });
        }

        const deviceIdParam = req.params.deviceId;
        const deviceId = deviceIdParam ? parseInt(deviceIdParam as string) : undefined;

        console.log(`[API] Deleting RFID card for employee ${employeeId}${deviceId ? ` on device ${deviceId}` : ''}...`);

        const result = await deleteEmployeeCard(employeeId, deviceId);

        if (result.success) {
            const emp = await prisma.employee.findUnique({
                where: { id: employeeId },
                select: { firstName: true, lastName: true, zkId: true }
            });

            await audit({
                action: 'DELETE',
                entityType: 'Employee',
                entityId: employeeId,
                performedBy: req.user?.employeeId,
                details: `Removed RFID badge for ${emp?.firstName} ${emp?.lastName}`,
                metadata: { zkId: emp?.zkId }
            });

            return res.status(200).json({
                success: true,
                message: result.message,
            });
        } else {
            return res.status(500).json({
                success: false,
                message: result.message || 'Card deletion failed',
                error: result.error,
            });
        }

    } catch (error: any) {
        console.error('[API] Card deletion error:', error);
        return res.status(500).json({
            success: false,
            message: 'Server error during card deletion',
            error: error.message
        });
    }
};

// PUT /api/employees/:id - Update an employee's details
export const updateEmployee = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const employeeId = parseInt(id as string, 10);

        if (isNaN(employeeId)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid employee ID format',
            });
        }

        const {
            employeeNumber,
            firstName,
            lastName,
            middleName,
            suffix,
            gender,
            dateOfBirth,
            email,
            contactNumber,
            position,
            department,
            departmentId,
            branch,
            hireDate,
            shiftId,
            employmentStatus
        } = req.body;

        // Check if employee exists
        const existingEmployee = await prisma.employee.findUnique({
            where: { id: employeeId },
        });

        if (!existingEmployee) {
            return res.status(404).json({
                success: false,
                message: 'Employee not found',
            });
        }

        if (employeeNumber !== undefined) {
            const empIdValidation = validateEmployeeId(employeeNumber);
            if (!empIdValidation.isValid) {
                return res.status(400).json({
                    success: false,
                    message: empIdValidation.error
                });
            }

            if (employeeNumber && employeeNumber !== existingEmployee.employeeNumber) {
                const dup = await prisma.employee.findUnique({ where: { employeeNumber: employeeNumber.trim() } });
                if (dup) {
                    return res.status(400).json({
                        success: false,
                        message: 'Employee ID is already in use by another employee'
                    });
                }
            }
        }

        // Validate email uniqueness (exclude the current employee)
        if (email !== undefined && email !== '' && email !== existingEmployee.email) {
            const emailDup = await prisma.employee.findFirst({
                where: { email, id: { not: employeeId } }
            });
            if (emailDup) {
                return res.status(400).json({
                    success: false,
                    message: 'This email address is already in use by another employee'
                });
            }
        }

        // Prepare data for update
        const updateData: any = {};
        if (employeeNumber !== undefined) updateData.employeeNumber = employeeNumber.trim();
        if (firstName !== undefined) updateData.firstName = firstName;
        if (lastName !== undefined) updateData.lastName = lastName;
        if (middleName !== undefined) updateData.middleName = middleName || null;
        if (suffix !== undefined) updateData.suffix = suffix || null;
        if (gender !== undefined) updateData.gender = gender || null;
        if (dateOfBirth !== undefined) updateData.dateOfBirth = dateOfBirth ? new Date(dateOfBirth) : null;
        if (email !== undefined) updateData.email = email === '' ? null : email;
        if (contactNumber !== undefined) updateData.contactNumber = contactNumber;
        if (position !== undefined) updateData.position = position;
        if (department !== undefined) updateData.department = department || null;
        if (departmentId !== undefined) {
            updateData.departmentId = departmentId ? parseInt(departmentId, 10) : null;
        }
        if (branch !== undefined) updateData.branch = branch || null;
        if (hireDate !== undefined) updateData.hireDate = hireDate ? new Date(hireDate) : null;
        if (shiftId !== undefined) updateData.shiftId = shiftId ? parseInt(shiftId, 10) : null;
        if (employmentStatus !== undefined && ['ACTIVE', 'INACTIVE', 'TERMINATED'].includes(employmentStatus)) {
            updateData.employmentStatus = employmentStatus;
        }

        updateData.updatedAt = new Date();

        // Update the employee
        const updatedEmployee = await prisma.employee.update({
            where: { id: employeeId },
            data: updateData,
            select: {
                id: true,
                zkId: true,
                employeeNumber: true,
                firstName: true,
                lastName: true,
                middleName: true,
                suffix: true,
                gender: true,
                dateOfBirth: true,
                email: true,
                role: true,
                department: true,
                Department: { select: { name: true } },
                departmentId: true,
                position: true,
                branch: true,
                contactNumber: true,
                hireDate: true,
                employmentStatus: true,
                shiftId: true,
                Shift: { select: { id: true, name: true, shiftCode: true, startTime: true, endTime: true, workDays: true, halfDays: true, graceMinutes: true, breakMinutes: true } },
                createdAt: true,
                updatedAt: true
            },
        });

        const changes: string[] = [];
        for (const [key, newValue] of Object.entries(updateData)) {
            if (key === 'updatedAt' || key === 'password') continue;
            const oldValue = (existingEmployee as any)[key];
            if (oldValue !== newValue) {
                const oldValStr = oldValue instanceof Date ? oldValue.toISOString().split('T')[0] : (oldValue || 'empty');
                const newValStr = newValue instanceof Date ? newValue.toISOString().split('T')[0] : (newValue || 'empty');
                if (oldValStr !== newValStr) {
                    changes.push(`Updated ${key.replace(/([A-Z])/g, ' $1').toLowerCase().trim()} from "${oldValStr}" to "${newValStr}"`);
                }
            }
        }

        await audit({
            action: 'UPDATE',
            entityType: 'Employee',
            entityId: employeeId,
            performedBy: req.user?.employeeId,
            details: `Updated employee ${updatedEmployee.firstName} ${updatedEmployee.lastName}`,
            metadata: changes.length > 0 ? { category: 'employee', updates: changes } : { category: 'employee' }
        });

        res.json({
            success: true,
            message: 'Employee updated successfully',
            employee: updatedEmployee,
        });

    } catch (error: any) {
        console.error('Error updating employee:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update employee',
            error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
        });
    }
};

// DELETE /api/employees/:id/permanent - Permanently delete an inactive employee
export const permanentDeleteEmployee = async (req: Request, res: Response) => {
    try {
        const id = req.params.id as string;
        const employeeId = parseInt(id);

        if (isNaN(employeeId)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid employee ID',
            });
        }

        // Check if employee exists
        const employee = await prisma.employee.findUnique({
            where: { id: employeeId },
            select: { id: true, firstName: true, lastName: true, employmentStatus: true, zkId: true, role: true, email: true },
        });

        if (!employee) {
            return res.status(404).json({
                success: false,
                message: 'Employee not found',
            });
        }

        // Prevent deleting the main admin account
        if (employee.email === 'admin@avegabros.com') {
            return res.status(403).json({
                success: false,
                message: 'Permanent deletion of the main admin account is protected.',
            });
        }

        // Only allow permanent deletion of inactive users
        if (employee.employmentStatus === 'ACTIVE') {
            return res.status(400).json({
                success: false,
                message: 'Cannot permanently delete an active user. Please deactivate them first.',
            });
        }

        // ── DB delete first — device removal is fire-and-forget ────────────
        // We must NOT await deleteUserFromDevice before the transaction.
        // If the device is offline it retries for up to 25 s, causing the
        // permanent delete to appear to fail. The DB is the source of truth.
        // Delete from DB unconditionally; remove from device in the background.
        await prisma.$transaction(async (tx) => {
            await tx.attendanceLog.deleteMany({ where: { employeeId } });
            await tx.attendance.deleteMany({ where: { employeeId } });
            await tx.employee.delete({ where: { id: employeeId } });
        });

        await audit({
            action: 'DELETE',
            entityType: 'Employee',
            entityId: employeeId,
            performedBy: req.user?.employeeId,
            details: `Permanently deleted employee ${employee.firstName} ${employee.lastName}`,
            metadata: { category: 'employee', email: employee.email, role: employee.role }
        });

        res.json({
            success: true,
            message: `User "${employee.firstName} ${employee.lastName}" permanently deleted`,
        });

        // Fire-and-forget: remove from biometric device after DB is clean
        if (employee.zkId) {
            setImmediate(async () => {
                try {
                    await deleteUserFromDevice(employee.zkId!);
                    console.log(`[API] (background) Removed zkId ${employee.zkId} from device.`);
                } catch (devErr: any) {
                    console.error(`[API] (background) Could not remove zkId ${employee.zkId} from device (user already removed from DB):`, devErr?.message || devErr);
                }
            });
        }
    } catch (error) {
        console.error('Error permanently deleting employee:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to permanently delete employee',
        });
    }
};

// POST /api/employees/:id/reset-password - HR/Admin initiated password reset
export const resetEmployeePassword = async (req: Request, res: Response) => {
    try {
        const id = req.params.id as string;
        const employeeId = parseInt(id);

        if (isNaN(employeeId)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid employee ID',
            });
        }

        // Check if employee exists and has an email
        const employee = await prisma.employee.findUnique({
            where: { id: employeeId },
            select: { id: true, firstName: true, lastName: true, email: true },
        });

        if (!employee) {
            return res.status(404).json({
                success: false,
                message: 'Employee not found',
            });
        }

        if (!employee.email) {
            return res.status(400).json({
                success: false,
                message: 'Employee does not have an email address configured',
            });
        }

        const generatedPassword = generateRandomPassword(10);
        const hashedPassword = await bcrypt.hash(generatedPassword, 10);

        // Update DB
        await prisma.employee.update({
            where: { id: employeeId },
            data: {
                password: hashedPassword,
                needsPasswordChange: true,
                updatedAt: new Date()
            }
        });

        // Send email
        const emailSent = await sendPasswordResetEmail(
            employee.email,
            `${employee.firstName} ${employee.lastName}`,
            generatedPassword
        );

        if (!emailSent) {
            return res.status(200).json({
                success: true,
                message: "Password reset in database, but failed to send email. The temporary password is: " + generatedPassword,
            });
        }

        res.json({
            success: true,
            message: `Password reset successfully. Email sent to ${employee.email}.`,
        });

    } catch (error: any) {
        console.error('Error resetting password:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to reset password',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined,
        });
    }
};

// GET /api/employees/check-email?email=...&excludeId=...
export const checkEmailAvailability = async (req: Request, res: Response) => {
    try {
        const { email, excludeId } = req.query;

        if (!email || typeof email !== 'string') {
            return res.status(400).json({ success: false, message: 'Email is required' });
        }

        const where: any = { email: email.trim().toLowerCase() };
        if (excludeId) {
            where.id = { not: parseInt(excludeId as string, 10) };
        }

        const existing = await prisma.employee.findFirst({ where });

        res.json({
            success: true,
            available: !existing,
        });
    } catch (error: any) {
        console.error('Error checking email:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to check email availability',
        });
    }
};

// GET /api/employees/:id/fingerprint-status - Get fingerprint enrollment dashboard data
export const getEmployeeFingerprintStatus = async (req: Request, res: Response) => {
    try {
        const employeeId = parseInt(req.params.id as string);

        if (isNaN(employeeId)) {
            return res.status(400).json({ success: false, message: 'Invalid employee ID' });
        }

        const employee = await prisma.employee.findUnique({
            where: { id: employeeId },
            select: { id: true, zkId: true, firstName: true, lastName: true },
        });

        if (!employee) {
            return res.status(404).json({ success: false, message: 'Employee not found' });
        }

        // Fetch all fingerprint enrollment records for this employee
        const enrollments = await prisma.employeeFingerprintEnrollment.findMany({
            where: { employeeId },
            include: {
                device: {
                    select: { id: true, name: true, isActive: true, syncEnabled: true },
                },
            },
        });

        // Fetch all active devices
        const activeDevices = await prisma.device.findMany({
            where: { isActive: true },
            select: { id: true, name: true, isActive: true, syncEnabled: true },
            orderBy: { id: 'asc' },
        });

        // Group enrollments by fingerIndex → collect device info per finger
        const fingerMap = new Map<number, {
            fingerIndex: number;
            fingerLabel: string;
            devices: {
                deviceId: number;
                deviceName: string;
                enrolled: boolean;
                enrolledAt?: string;
                isActive: boolean;
                syncEnabled: boolean;
                pendingDeletion: boolean;
            }[];
        }>();

        for (const enrollment of enrollments) {
            if (!fingerMap.has(enrollment.fingerIndex)) {
                fingerMap.set(enrollment.fingerIndex, {
                    fingerIndex: enrollment.fingerIndex,
                    fingerLabel: `Finger ${enrollment.fingerIndex + 1}`,
                    devices: [],
                });
            }

            fingerMap.get(enrollment.fingerIndex)!.devices.push({
                deviceId: enrollment.device.id,
                deviceName: enrollment.device.name,
                enrolled: true,
                enrolledAt: enrollment.enrolledAt.toISOString(),
                isActive: enrollment.device.isActive,
                syncEnabled: enrollment.device.syncEnabled,
                pendingDeletion: enrollment.pendingDeletion,
            });
        }

        // Build slots array (Finger 1/2/3) — map existing enrollments to slots
        const MAX_SLOTS = 3;
        const enrolledFingerIndices = Array.from(fingerMap.keys()).sort((a, b) => a - b);
        const slots: Array<{
            slot: number;
            label: string;
            fingerIndex: number | null;
            enrolled: boolean;
            devices: {
                deviceId: number;
                deviceName: string;
                enrolled: boolean;
                enrolledAt?: string;
                isActive: boolean;
                syncEnabled: boolean;
                pendingDeletion: boolean;
            }[];
        }> = [];

        for (let i = 0; i < MAX_SLOTS; i++) {
            const fingerIndex = enrolledFingerIndices[i] ?? null;
            const fingerData = fingerIndex !== null ? fingerMap.get(fingerIndex) : null;

            const devices = activeDevices.map(device => {
                const enrolledDevice = fingerData?.devices.find(d => d.deviceId === device.id);
                return {
                    deviceId: device.id,
                    deviceName: device.name,
                    enrolled: enrolledDevice?.enrolled ?? false,
                    enrolledAt: enrolledDevice?.enrolledAt,
                    isActive: device.isActive,
                    syncEnabled: device.syncEnabled,
                    pendingDeletion: enrolledDevice?.pendingDeletion ?? false,
                };
            });

            slots.push({
                slot: i + 1,
                label: `Finger ${i + 1}`,
                fingerIndex,
                enrolled: fingerData !== null,
                devices,
            });
        }

        const totalEnrolled = fingerMap.size;

        return res.status(200).json({
            success: true,
            employee: {
                id: employee.id,
                name: `${employee.firstName} ${employee.lastName}`,
                zkId: employee.zkId,
            },
            slots,
            summary: {
                totalEnrolled,
                maxSlots: MAX_SLOTS,
                canEnrollMore: totalEnrolled < MAX_SLOTS,
            },
            allDevices: activeDevices,
        });

    } catch (error: any) {
        console.error('[API] Fingerprint status error:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to fetch fingerprint status',
        });
    }
};

// DELETE /api/employees/:id/fingerprint/:fingerIndex - Delete specific fingerprint globally
export const deleteEmployeeFingerprint = async (req: Request, res: Response) => {
    try {
        const employeeId = parseInt(req.params.id as string);
        const fingerIndex = parseInt(req.params.fingerIndex as string);

        if (isNaN(employeeId) || isNaN(fingerIndex)) {
            return res.status(400).json({ success: false, message: 'Invalid parameters' });
        }

        if (fingerIndex < 0 || fingerIndex > 9) {
            return res.status(400).json({ success: false, message: 'Finger index must be between 0 and 9' });
        }

        const result = await deleteFingerprintGlobally(employeeId, fingerIndex);

        if (result.success) {
            const fingerLabel = `Finger ${fingerIndex + 1}`;

            await audit({
                action: 'DELETE',
                entityType: 'Employee',
                entityId: employeeId,
                performedBy: req.user?.employeeId,
                details: `Deleted ${fingerLabel} globally`,
                metadata: { category: 'employee', fingerIndex, fingerLabel },
            });

            return res.status(200).json(result);
        } else {
            return res.status(500).json(result);
        }

    } catch (error: any) {
        console.error('[API] Delete fingerprint error:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to delete fingerprint',
        });
    }
};

// POST /api/employees/:id/sync-fingerprints - Sync fingerprints across devices
export const syncEmployeeFingerprintsController = async (req: Request, res: Response) => {
    try {
        const employeeId = parseInt(req.params.id as string);

        if (isNaN(employeeId)) {
            return res.status(400).json({ success: false, message: 'Invalid employee ID' });
        }

        const result = await syncEmployeeFingerprints(employeeId);

        if (result.success) {
            const emp = await prisma.employee.findUnique({
                where: { id: employeeId },
                select: { firstName: true, lastName: true },
            });

            await audit({
                action: 'UPDATE',
                entityType: 'Employee',
                entityId: employeeId,
                performedBy: req.user?.employeeId,
                details: `Synced fingerprints for ${emp?.firstName} ${emp?.lastName}: ${result.results.filter(r => r.status === 'synced').length} device(s)`,
                metadata: { category: 'employee', results: result.results },
            });

            return res.status(200).json(result);
        } else {
            return res.status(400).json(result);
        }

    } catch (error: any) {
        console.error('[API] Sync fingerprints error:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to sync fingerprints',
            results: [],
        });
    }
};

// GET /api/employees/:id/card-status - Get card enrollment dashboard data
export const getEmployeeCardStatus = async (req: Request, res: Response) => {
    try {
        const employeeId = parseInt(req.params.id as string);

        if (isNaN(employeeId)) {
            return res.status(400).json({ success: false, message: 'Invalid employee ID' });
        }

        const employee = await prisma.employee.findUnique({
            where: { id: employeeId },
            select: { id: true, zkId: true, firstName: true, lastName: true, cardNumber: true },
        });

        if (!employee) {
            return res.status(404).json({ success: false, message: 'Employee not found' });
        }

        // Fetch all card enrollment records for this employee
        const enrollments = await prisma.employeeCardEnrollment.findMany({
            where: { employeeId },
            include: {
                device: {
                    select: { id: true, name: true, isActive: true, syncEnabled: true },
                },
            },
        });

        // Fetch all active devices
        const activeDevices = await prisma.device.findMany({
            where: { isActive: true },
            select: { id: true, name: true, isActive: true, syncEnabled: true },
            orderBy: { id: 'asc' },
        });

        // Build devices result
        const devicesResult = activeDevices.map(device => {
            const enroll = enrollments.find(e => e.deviceId === device.id);
            return {
                deviceId: device.id,
                deviceName: device.name,
                enrolled: !!enroll && !enroll.pendingDeletion,
                enrolledAt: enroll ? enroll.enrolledAt.toISOString() : undefined,
                isActive: device.isActive,
                syncEnabled: device.syncEnabled,
                pendingDeletion: enroll ? enroll.pendingDeletion : false,
            };
        });

        res.json({
            success: true,
            employee: {
                id: employee.id,
                name: `${employee.firstName} ${employee.lastName}`,
                cardNumber: employee.cardNumber,
            },
            devices: devicesResult,
        });

    } catch (error: any) {
        console.error('Error fetching employee card status:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch employee card status',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined,
        });
    }
};

// GET /api/employees/export - Export employees to .xlsx
export const exportEmployees = async (req: Request, res: Response) => {
    try {
        const { department, branch } = req.query;

        const where: any = {
            employmentStatus: 'ACTIVE',
            role: 'USER',
        };
        if (department && department !== 'all') where.department = department as string;
        if (branch && branch !== 'all') where.branch = branch as string;

        const employees = await prisma.employee.findMany({
            where,
            select: {
                employeeNumber: true,
                firstName: true,
                middleName: true,
                lastName: true,
                suffix: true,
                gender: true,
                dateOfBirth: true,
                email: true,
                contactNumber: true,
                department: true,
                branch: true,
                hireDate: true,
                Shift: { select: { shiftCode: true } },
                employmentStatus: true,
            },
            orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
        });

        const workbook = new ExcelJS.Workbook();
        const sheet = workbook.addWorksheet('Employees');

        const columns = [
            { header: 'Employee Number', key: 'employeeNumber', width: 18 },
            { header: 'First Name', key: 'firstName', width: 16 },
            { header: 'Middle Name', key: 'middleName', width: 16 },
            { header: 'Last Name', key: 'lastName', width: 16 },
            { header: 'Suffix', key: 'suffix', width: 10 },
            { header: 'Gender', key: 'gender', width: 12 },
            { header: 'Date of Birth', key: 'dateOfBirth', width: 16 },
            { header: 'Email', key: 'email', width: 28 },
            { header: 'Contact Number', key: 'contactNumber', width: 18 },
            { header: 'Department', key: 'department', width: 18 },
            { header: 'Branch', key: 'branch', width: 16 },
            { header: 'Hire Date', key: 'hireDate', width: 16 },
            { header: 'Shift Code', key: 'shiftCode', width: 14 },
            { header: 'Status', key: 'employmentStatus', width: 14 },
        ];
        sheet.columns = columns;

        // Style header row
        const headerRow = sheet.getRow(1);
        headerRow.eachCell((cell) => {
            cell.font = { bold: true, color: { argb: 'FF000000' } };
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9D9D9' } };
            cell.border = {
                bottom: { style: 'thin', color: { argb: 'FF999999' } },
            };
        });
        headerRow.commit();

        // Add data rows
        for (const emp of employees) {
            sheet.addRow({
                employeeNumber: emp.employeeNumber || '',
                firstName: emp.firstName || '',
                middleName: emp.middleName || '',
                lastName: emp.lastName || '',
                suffix: emp.suffix || '',
                gender: emp.gender || '',
                dateOfBirth: emp.dateOfBirth ? new Date(emp.dateOfBirth).toISOString().split('T')[0] : '',
                email: emp.email || '',
                contactNumber: emp.contactNumber || '',
                department: emp.department || '',
                branch: emp.branch || '',
                hireDate: emp.hireDate ? new Date(emp.hireDate).toISOString().split('T')[0] : '',
                shiftCode: emp.Shift?.shiftCode || '',
                employmentStatus: emp.employmentStatus || '',
            });
        }

        const today = new Date().toISOString().split('T')[0];
        const filename = `employees_export_${today}.xlsx`;

        const buffer = await workbook.xlsx.writeBuffer();

        await audit({
            action: 'EXPORT',
            entityType: 'Employee',
            performedBy: req.user?.employeeId,
            details: `Exported ${employees.length} employee(s) to Excel`,
            metadata: {
                category: 'employee',
                count: employees.length,
                filters: { department: department || 'all', branch: branch || 'all' },
                filename,
            },
        });

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.send(Buffer.from(buffer as ArrayBuffer));
    } catch (error: any) {
        console.error('Error exporting employees:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to export employees',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined,
        });
    }
};

// GET /api/employees/export-template - Download blank import template
export const exportTemplate = async (req: Request, res: Response) => {
    try {
        const workbook = new ExcelJS.Workbook();

        // ── Fetch reference data first (needed for dropdown ranges) ───────────
        const [departments, branches, shifts] = await Promise.all([
            prisma.department.findMany({ select: { name: true }, orderBy: { name: 'asc' } }),
            prisma.branch.findMany({ select: { name: true }, orderBy: { name: 'asc' } }),
            prisma.shift.findMany({ select: { shiftCode: true, name: true }, orderBy: { shiftCode: 'asc' } }),
        ]);

        // ── Sheet 1: Employee Import ──────────────────────────────────────────
        const sheet1 = workbook.addWorksheet('Employee Import');

        const templateColumns = [
            { header: 'Employee Number', key: 'employeeNumber', width: 20, required: true, hint: 'Unique ID (e.g. 10001)' },
            { header: 'First Name', key: 'firstName', width: 18, required: true, hint: 'Legal first name' },
            { header: 'Middle Name', key: 'middleName', width: 18, required: false, hint: 'Optional middle name' },
            { header: 'Last Name', key: 'lastName', width: 18, required: true, hint: 'Legal last name' },
            { header: 'Suffix', key: 'suffix', width: 12, required: false, hint: 'Jr., Sr., II, III, etc.' },
            { header: 'Gender', key: 'gender', width: 14, required: false, hint: 'Male / Female / Prefer not to say' },
            { header: 'Date of Birth', key: 'dateOfBirth', width: 18, required: false, hint: 'YYYY-MM-DD format' },
            { header: 'Email', key: 'email', width: 28, required: true, hint: 'Valid email (login credentials sent here)' },
            { header: 'Contact Number', key: 'contactNumber', width: 20, required: true, hint: '11 digits (e.g. 09171234567)' },
            { header: 'Department', key: 'department', width: 20, required: true, hint: 'Select from dropdown (see Reference Lists)' },
            { header: 'Branch', key: 'branch', width: 18, required: true, hint: 'Select from dropdown (see Reference Lists)' },
            { header: 'Hire Date', key: 'hireDate', width: 16, required: false, hint: 'YYYY-MM-DD format' },
            { header: 'Shift Code', key: 'shiftCode', width: 16, required: false, hint: 'Select from dropdown (see Reference Lists)' },
            { header: 'Status', key: 'employmentStatus', width: 14, required: false, hint: 'ACTIVE (default) / INACTIVE' },
        ];

        // Column key → 1-based column index map
        const colIndex: Record<string, number> = {};
        templateColumns.forEach((col, idx) => { colIndex[col.key] = idx + 1; });

        sheet1.columns = templateColumns.map(c => ({ header: c.header, key: c.key, width: c.width }));

        // ── Row 1: Color legend ───────────────────────────────────────────────
        const legendRow = sheet1.getRow(1);
        // Clear auto-set headers from .columns assignment (they go to row 1)
        for (let c = 1; c <= templateColumns.length; c++) {
            legendRow.getCell(c).value = null;
        }
        const legendA = legendRow.getCell(1);
        legendA.value = 'Color guide:';
        legendA.font = { bold: true, size: 10 };

        const legendB = legendRow.getCell(2);
        legendB.value = 'Required field';
        legendB.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        legendB.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDC2626' } };

        const legendC = legendRow.getCell(3);
        legendC.value = 'Optional field';
        legendC.font = { bold: true, color: { argb: 'FF000000' } };
        legendC.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF59E0B' } };
        legendRow.commit();

        // ── Row 2: Header row ─────────────────────────────────────────────────
        const headerRow = sheet1.getRow(2);
        templateColumns.forEach((col, idx) => {
            const cell = headerRow.getCell(idx + 1);
            cell.value = col.header;
            if (col.required) {
                cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDC2626' } };
            } else {
                cell.font = { bold: true, color: { argb: 'FF000000' } };
                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF59E0B' } };
            }
            cell.border = { bottom: { style: 'thin', color: { argb: 'FF999999' } } };
        });
        headerRow.commit();

        // ── Row 3: Hint row ───────────────────────────────────────────────────
        const hintRow = sheet1.getRow(3);
        templateColumns.forEach((col, idx) => {
            const cell = hintRow.getCell(idx + 1);
            cell.value = col.hint;
            cell.font = { italic: true, size: 9, color: { argb: 'FF666666' } };
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8F8F8' } };
        });
        hintRow.commit();

        // ── Rows 4–203: 200 blank alternating rows ───────────────────────────
        const DATA_START_ROW = 4;
        const DATA_ROW_COUNT = 200;
        for (let i = 0; i < DATA_ROW_COUNT; i++) {
            const row = sheet1.getRow(DATA_START_ROW + i);
            if (i % 2 === 1) {
                for (let c = 1; c <= templateColumns.length; c++) {
                    const cell = row.getCell(c);
                    if (!cell.value) cell.value = null;
                    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
                }
            }
            row.commit();
        }

        // ── Dropdown validations (rows 4–203) ────────────────────────────────
        const DATA_END_ROW = DATA_START_ROW + DATA_ROW_COUNT - 1; // 203
        const validationBase = {
            showDropDown: false, // false = show the arrow in Excel (counterintuitive)
            showErrorMessage: true,
            errorTitle: 'Invalid value',
            error: 'Please select a value from the dropdown list',
        };

        // Helper: convert 1-based column index to Excel letter
        const colLetter = (n: number): string => {
            let result = '';
            while (n > 0) {
                n--;
                result = String.fromCharCode(65 + (n % 26)) + result;
                n = Math.floor(n / 26);
            }
            return result;
        };

        // Department dropdown — references 'Reference Lists' sheet column A
        // Sheet 2 row 1 = header, row 2 = first header label, data starts row 3
        if (departments.length > 0) {
            const deptLastRow = 2 + departments.length; // header row is 2 now (after our changes to sheet 2)
            const deptCol = colLetter(colIndex['department']);
            for (let r = DATA_START_ROW; r <= DATA_END_ROW; r++) {
                sheet1.getCell(`${deptCol}${r}`).dataValidation = {
                    type: 'list',
                    formulae: [`='Reference Lists'!$A$3:$A$${deptLastRow}`],
                    ...validationBase,
                };
            }
        }

        // Branch dropdown — references 'Reference Lists' sheet column B
        if (branches.length > 0) {
            const branchLastRow = 2 + branches.length;
            const branchCol = colLetter(colIndex['branch']);
            for (let r = DATA_START_ROW; r <= DATA_END_ROW; r++) {
                sheet1.getCell(`${branchCol}${r}`).dataValidation = {
                    type: 'list',
                    formulae: [`='Reference Lists'!$B$3:$B$${branchLastRow}`],
                    ...validationBase,
                };
            }
        }

        // Shift Code dropdown — references 'Reference Lists' sheet column C
        if (shifts.length > 0) {
            const shiftLastRow = 2 + shifts.length;
            const shiftCol = colLetter(colIndex['shiftCode']);
            for (let r = DATA_START_ROW; r <= DATA_END_ROW; r++) {
                sheet1.getCell(`${shiftCol}${r}`).dataValidation = {
                    type: 'list',
                    formulae: [`='Reference Lists'!$C$3:$C$${shiftLastRow}`],
                    ...validationBase,
                };
            }
        }

        // Gender dropdown — inline list
        const genderCol = colLetter(colIndex['gender']);
        for (let r = DATA_START_ROW; r <= DATA_END_ROW; r++) {
            sheet1.getCell(`${genderCol}${r}`).dataValidation = {
                type: 'list',
                formulae: ['"Male,Female,Prefer not to say"'],
                ...validationBase,
            };
        }

        // Suffix dropdown — inline list
        const suffixCol = colLetter(colIndex['suffix']);
        for (let r = DATA_START_ROW; r <= DATA_END_ROW; r++) {
            sheet1.getCell(`${suffixCol}${r}`).dataValidation = {
                type: 'list',
                formulae: ['"Jr.,Sr.,II,III,IV,V"'],
                ...validationBase,
            };
        }

        // ── Sheet 2: Reference Lists ──────────────────────────────────────────
        const sheet2 = workbook.addWorksheet('Reference Lists');

        sheet2.columns = [
            { key: 'department', width: 30 },
            { key: 'branch', width: 30 },
            { key: 'shiftCode', width: 24 },
            { key: 'shiftName', width: 28 },
        ];

        // Row 1: Section title
        const refTitleRow = sheet2.getRow(1);
        refTitleRow.getCell(1).value = 'REFERENCE DATA — DO NOT MODIFY THIS SHEET';
        refTitleRow.getCell(1).font = { bold: true, size: 11, color: { argb: 'FFDC2626' } };
        refTitleRow.commit();

        // Row 2: Column headers with descriptive names
        const refHeaderRow = sheet2.getRow(2);
        const refHeaders = ['Departments (copy exactly)', 'Branches (copy exactly)', 'Shift Codes (copy exactly)', 'Shift Name (for reference)'];
        refHeaders.forEach((h, idx) => {
            const cell = refHeaderRow.getCell(idx + 1);
            cell.value = h;
            cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF475569' } };
            cell.border = { bottom: { style: 'thin', color: { argb: 'FF999999' } } };
        });
        refHeaderRow.commit();

        // Row 3+: Fill data
        const maxRefRows = Math.max(departments.length, branches.length, shifts.length);
        for (let i = 0; i < maxRefRows; i++) {
            const row = sheet2.getRow(i + 3);
            row.getCell(1).value = departments[i]?.name || '';
            row.getCell(2).value = branches[i]?.name || '';
            row.getCell(3).value = shifts[i]?.shiftCode || '';
            row.getCell(4).value = shifts[i]?.name || '';
            row.commit();
        }

        // ── Sheet 3: Instructions ─────────────────────────────────────────────
        const sheet3 = workbook.addWorksheet('Instructions');
        sheet3.getColumn(1).width = 80;

        const instructions = [
            'EMPLOYEE IMPORT INSTRUCTIONS',
            '',
            '⚠️  ALWAYS DOWNLOAD A FRESH TEMPLATE BEFORE EACH IMPORT',
            'This template is generated live from the database. The dropdown lists for',
            'Department, Branch, and Shift Code reflect what is currently in the system.',
            '',
            'If new departments, branches, or shifts have been added since you last',
            'downloaded this template, your old copy will NOT include them in the dropdowns.',
            '',
            'Rule: Never reuse an old template. Always click "Download Template"',
            'in the system before starting a new import.',
            '',
            'COLUMN COLOR GUIDE',
            'Red header   = Required field. The import will fail for this row if left empty.',
            'Orange header = Optional field. Can be left blank.',
            '',
            '1. REQUIRED FIELDS (red headers on Sheet 1):',
            '   • Employee Number — Must be unique across all employees',
            '   • First Name — Legal first name of the employee',
            '   • Last Name — Legal last name of the employee',
            '   • Email — Valid email address (login credentials will be sent here)',
            '   • Contact Number — 11-digit Philippine mobile number (e.g. 09171234567)',
            '   • Department — Select from the dropdown (values from Reference Lists)',
            '   • Branch — Select from the dropdown (values from Reference Lists)',
            '',
            '2. OPTIONAL FIELDS (orange headers on Sheet 1):',
            '   • Middle Name, Suffix, Gender, Date of Birth, Hire Date, Shift Code, Status',
            '',
            '3. DATE FORMAT:',
            '   • Use YYYY-MM-DD format (e.g. 2025-01-15)',
            '   • Both Date of Birth and Hire Date follow this format',
            '',
            '4. PHONE NUMBER FORMAT:',
            '   • Must be exactly 11 digits',
            '   • Example: 09171234567',
            '   • Do not include spaces, dashes, or country code',
            '',
            '5. GENDER OPTIONS:',
            '   • Male',
            '   • Female',
            '   • Prefer not to say',
            '',
            '6. SUFFIX OPTIONS:',
            '   • Jr., Sr., II, III, IV, V (or leave blank)',
            '',
            '7. DROPDOWNS:',
            '   • Department, Branch, Shift Code, Gender, and Suffix columns have dropdown lists',
            '   • Click a cell in those columns to see the arrow and select a value',
            '   • Typing an invalid value will show an error — use the dropdown instead',
            '',
            '8. WHAT HAPPENS AFTER IMPORT:',
            '   • Each employee will be created with ACTIVE status and USER role',
            '   • A random password will be generated and emailed to each employee',
            '   • Employees will be prompted to change their password on first login',
            '   • The employee will be synced to biometric devices automatically',
            '',
            '9. TIPS:',
            '   • The hint row (row 3) will be automatically skipped during import',
            '   • Duplicate employee numbers or emails will be rejected',
            '   • Row 1 is a color legend — leave it as-is, the system ignores it',
        ];

        // Title row — bold red
        const titleCell = sheet3.getCell('A1');
        titleCell.value = instructions[0];
        titleCell.font = { bold: true, size: 14, color: { argb: 'FFDC2626' } };

        // Freshness warning section (rows 3–11) — highlight with background
        for (let i = 1; i < instructions.length; i++) {
            const cell = sheet3.getCell(`A${i + 1}`);
            cell.value = instructions[i];

            if (instructions[i].startsWith('⚠️') || instructions[i] === 'COLUMN COLOR GUIDE') {
                cell.font = { bold: true, size: 12, color: { argb: 'FFDC2626' } };
            } else if (instructions[i].match(/^\d+\./)) {
                cell.font = { bold: true, size: 11 };
            } else if (instructions[i].startsWith('Rule:')) {
                cell.font = { bold: true, size: 10, color: { argb: 'FFDC2626' } };
            } else if (instructions[i].startsWith('Red header')) {
                cell.font = { bold: true, size: 10, color: { argb: 'FFDC2626' } };
            } else if (instructions[i].startsWith('Orange header')) {
                cell.font = { bold: true, size: 10, color: { argb: 'FFB45309' } };
            } else {
                cell.font = { size: 10 };
            }
        }

        const filename = 'employee_import_template.xlsx';
        const buffer = await workbook.xlsx.writeBuffer();

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.send(Buffer.from(buffer as ArrayBuffer));
    } catch (error: any) {
        console.error('Error generating import template:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to generate import template',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined,
        });
    }
};

// POST /api/employees/bulk - Bulk create employees from import
export const bulkCreateEmployees = async (req: Request, res: Response) => {
    try {
        const { employees } = req.body;

        if (!Array.isArray(employees) || employees.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Request body must contain a non-empty "employees" array',
            });
        }

        if (employees.length > 200) {
            return res.status(400).json({
                success: false,
                message: 'Maximum 200 employees per bulk import',
            });
        }

        const results: { row: number; employeeNumber: string; status: 'success' | 'failed'; reason?: string }[] = [];

        for (let i = 0; i < employees.length; i++) {
            const emp = employees[i];
            const rowNum = emp._rowNumber ?? (i + 1);
            const empNum = (emp.employeeNumber || '').toString().trim();

            try {
                // ── Basic validation ─────────────────────────────────────────
                const empIdValidation = validateEmployeeId(empNum);
                if (!empIdValidation.isValid) {
                    results.push({ row: rowNum, employeeNumber: empNum, status: 'failed', reason: empIdValidation.error || 'Invalid employee number' });
                    continue;
                }

                if (!emp.firstName || !emp.lastName) {
                    results.push({ row: rowNum, employeeNumber: empNum, status: 'failed', reason: 'First name and last name are required' });
                    continue;
                }

                if (!emp.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emp.email)) {
                    results.push({ row: rowNum, employeeNumber: empNum, status: 'failed', reason: 'A valid email is required' });
                    continue;
                }

                // ── Check DB for duplicates ──────────────────────────────────
                const existingByNumber = await prisma.employee.findUnique({
                    where: { employeeNumber: empNum },
                    select: { id: true },
                });
                if (existingByNumber) {
                    results.push({ row: rowNum, employeeNumber: empNum, status: 'failed', reason: 'Employee number already in use' });
                    continue;
                }

                const existingByEmail = await prisma.employee.findFirst({
                    where: { email: emp.email.trim().toLowerCase() },
                    select: { id: true },
                });
                if (existingByEmail) {
                    results.push({ row: rowNum, employeeNumber: empNum, status: 'failed', reason: 'Email already in use' });
                    continue;
                }

                // ── Acquire mutex, assign zkId, create employee ──────────────
                const generatedPassword = generateRandomPassword(10);
                const hashedPassword = await bcrypt.hash(generatedPassword, 10);

                const release = await acquireRegistrationMutex();
                let newEmployee;

                try {
                    const nextZkId = await findNextSafeZkId();

                    newEmployee = await prisma.employee.create({
                        data: {
                            employeeNumber: empNum,
                            firstName: emp.firstName,
                            lastName: emp.lastName,
                            middleName: emp.middleName || null,
                            suffix: emp.suffix || null,
                            gender: emp.gender || null,
                            dateOfBirth: emp.dateOfBirth ? new Date(emp.dateOfBirth) : null,
                            email: emp.email,
                            password: hashedPassword,
                            role: 'USER',
                            department: emp.department || null,
                            position: null,
                            branch: emp.branch || null,
                            contactNumber: emp.contactNumber || null,
                            hireDate: emp.hireDate ? new Date(emp.hireDate) : undefined,
                            employmentStatus: 'ACTIVE',
                            zkId: nextZkId,
                            shiftId: emp.shiftId ? parseInt(emp.shiftId, 10) : null,
                            needsPasswordChange: true,
                            updatedAt: new Date(),
                        },
                        select: {
                            id: true,
                            zkId: true,
                            employeeNumber: true,
                            firstName: true,
                            lastName: true,
                            email: true,
                            role: true,
                        },
                    });
                } finally {
                    release();
                }

                if (!newEmployee) {
                    results.push({ row: rowNum, employeeNumber: empNum, status: 'failed', reason: 'Unexpected state after registration' });
                    continue;
                }

                results.push({ row: rowNum, employeeNumber: empNum, status: 'success' });

                console.log(`[BULK] Created employee: ${newEmployee.firstName} ${newEmployee.lastName} (zkId: ${newEmployee.zkId})`);

                await audit({
                    action: 'CREATE',
                    entityType: 'Employee',
                    entityId: newEmployee.id,
                    performedBy: req.user?.employeeId,
                    details: `Bulk import: created employee ${newEmployee.firstName} ${newEmployee.lastName}`,
                    metadata: { category: 'employee', email: emp.email, employeeNumber: empNum, source: 'bulk_import' },
                });

                // Fire-and-forget: email + device sync (same pattern as single create)
                const capturedEmployee = newEmployee;
                const capturedPassword = generatedPassword;
                setImmediate(async () => {
                    if (capturedEmployee.email) {
                        try {
                            await sendWelcomeEmail(capturedEmployee.email, `${capturedEmployee.firstName} ${capturedEmployee.lastName}`, capturedPassword);
                        } catch (emailErr) {
                            console.error(`[BULK] (background) Failed to send welcome email to ${capturedEmployee.email}:`, emailErr);
                        }
                    }
                    if (capturedEmployee.zkId) {
                        try {
                            const displayName = `${capturedEmployee.firstName} ${capturedEmployee.lastName}`;
                            await addUserToDevice(capturedEmployee.zkId!, displayName, capturedEmployee.role);
                        } catch (syncErr: any) {
                            console.error(`[BULK] (background) Device sync failed for zkId ${capturedEmployee.zkId}:`, syncErr?.message || syncErr);
                        }
                    }
                });

            } catch (rowError: any) {
                console.error(`[BULK] Error processing row ${rowNum}:`, rowError?.message || rowError);
                results.push({ row: rowNum, employeeNumber: empNum, status: 'failed', reason: rowError?.message || 'Unexpected server error' });
            }
        }

        const succeeded = results.filter(r => r.status === 'success').length;
        const failed = results.filter(r => r.status === 'failed').length;

        await audit({
            action: 'CREATE',
            entityType: 'Employee',
            performedBy: req.user?.employeeId,
            details: `Bulk import completed: ${succeeded} succeeded, ${failed} failed out of ${employees.length} rows`,
            metadata: { category: 'employee', source: 'bulk_import', succeeded, failed, total: employees.length },
        });

        res.status(200).json({
            success: true,
            results,
        });

    } catch (error: any) {
        console.error('[BULK] Bulk import error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to process bulk import',
            error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error',
        });
    }
};
