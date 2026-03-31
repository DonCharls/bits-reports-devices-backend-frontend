import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { audit } from '../lib/auditLogger';

// GET /api/departments
export const getAllDepartments = async (req: Request, res: Response) => {
    try {
        const departments = await prisma.department.findMany({
            orderBy: {
                name: 'asc'
            }
        });
        res.json({
            success: true,
            departments
        });
    } catch (error) {
        console.error('Error fetching departments:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch departments'
        });
    }
};

// POST /api/departments
export const createDepartment = async (req: Request, res: Response) => {
    try {
        const { name } = req.body;
        if (!name || !name.trim()) {
            return res.status(400).json({ success: false, message: 'Department name is required' });
        }
        const trimmedName = name.trim().toUpperCase();
        const existing = await prisma.department.findFirst({ where: { name: trimmedName } });
        if (existing) {
            return res.status(400).json({ success: false, message: 'Department already exists' });
        }
        const department = await prisma.department.create({ data: { name: trimmedName, updatedAt: new Date() } });

        await audit({
            action: 'CREATE',
            entityType: 'Department',
            entityId: department.id,
            performedBy: req.user?.employeeId,
            source: 'admin-panel',
            details: `Created new department "${department.name}"`,
            metadata: { category: 'config' }
        });

        res.status(201).json({ success: true, department });
    } catch (error) {
        console.error('Error creating department:', error);
        res.status(500).json({ success: false, message: 'Failed to create department' });
    }
};

// PUT /api/departments/:id
export const renameDepartment = async (req: Request, res: Response) => {
    try {
        const id = parseInt(String(req.params.id));
        if (isNaN(id)) {
            return res.status(400).json({ success: false, message: 'Invalid department ID' });
        }
        const { name } = req.body;
        if (!name || !name.trim()) {
            return res.status(400).json({ success: false, message: 'Department name is required' });
        }
        const trimmedName = name.trim().toUpperCase();
        const existing = await prisma.department.findFirst({ where: { name: trimmedName } });
        if (existing && existing.id !== id) {
            return res.status(409).json({ success: false, message: 'Department name already exists' });
        }
        const target = await prisma.department.findUnique({ where: { id } });
        if (!target) {
            return res.status(404).json({ success: false, message: 'Department not found' });
        }

        const department = await prisma.department.update({
            where: { id },
            data: { name: trimmedName, updatedAt: new Date() }
        });

        const changes: string[] = [];
        if (target.name !== trimmedName) {
            changes.push(`Updated name from "${target.name}" to "${trimmedName}"`);
        }

        await audit({
            action: 'UPDATE',
            entityType: 'Department',
            entityId: department.id,
            performedBy: req.user?.employeeId,
            source: 'admin-panel',
            details: `Renamed department to "${department.name}"`,
            metadata: changes.length > 0 ? { category: 'config', updates: changes } : { category: 'config' }
        });

        res.json({ success: true, department });
    } catch (error) {
        console.error('Error renaming department:', error);
        res.status(500).json({ success: false, message: 'Failed to rename department' });
    }
};

// DELETE /api/departments/:id
export const deleteDepartment = async (req: Request, res: Response) => {
    try {
        const id = parseInt(String(req.params.id));
        if (isNaN(id)) {
            return res.status(400).json({ success: false, message: 'Invalid department ID' });
        }
        const existing = await prisma.department.findUnique({ where: { id } });
        if (!existing) {
            return res.status(404).json({ success: false, message: 'Department not found' });
        }

        // Check for active employees in this department (check both string name and FK)
        const activeEmployeeCount = await prisma.employee.count({
            where: {
                OR: [
                    { departmentId: id },
                    { department: existing.name }
                ],
                employmentStatus: 'ACTIVE'
            }
        });
        if (activeEmployeeCount > 0) {
            return res.status(400).json({
                success: false,
                message: `⚠️ Cannot delete this Department. There are currently ${activeEmployeeCount} employee(s) assigned to it. Please reassign or remove all employees before deleting.`
            });
        }

        await prisma.department.delete({ where: { id } });

        await audit({
            action: 'DELETE',
            entityType: 'Department',
            entityId: id,
            performedBy: req.user?.employeeId,
            source: 'admin-panel',
            details: `Deleted department "${existing.name}"`,
            metadata: { category: 'config' }
        });

        res.json({ success: true, message: `Department "${existing.name}" deleted` });
    } catch (error) {
        console.error('Error deleting department:', error);
        res.status(500).json({ success: false, message: 'Failed to delete department' });
    }
};
