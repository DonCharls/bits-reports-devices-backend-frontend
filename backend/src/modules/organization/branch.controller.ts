import { Request, Response } from 'express';
import { prisma } from '../../shared/lib/prisma';
import { audit } from '../../shared/lib/auditLogger';

// GET /api/branches - Get all branches
export const getBranches = async (req: Request, res: Response) => {
    try {
        const branches = await prisma.branch.findMany({
            orderBy: {
                name: 'asc'
            }
        });

        res.json({
            success: true,
            branches
        });
    } catch (error) {
        console.error('Error fetching branches:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch branches'
        });
    }
};

// POST /api/branches - Create a new branch
export const createBranch = async (req: Request, res: Response) => {
    try {
        const { name } = req.body;
        if (!name || !name.trim()) {
            return res.status(400).json({ success: false, message: 'Branch name is required' });
        }

        const existing = await prisma.branch.findUnique({ where: { name: name.trim() } });
        if (existing) {
            return res.status(409).json({ success: false, message: 'Branch already exists' });
        }

        const branch = await prisma.branch.create({
            data: { name: name.trim(), updatedAt: new Date() }
        });

        void audit({
            action: 'CREATE',
            entityType: 'Branch',
            entityId: branch.id,
            performedBy: req.user?.employeeId,
            source: 'admin-panel',
            details: `Created new branch "${branch.name}"`,
            correlationId: req.correlationId
        });

        res.status(201).json({ success: true, branch });
    } catch (error) {
        console.error('Error creating branch:', error);
        res.status(500).json({ success: false, message: 'Failed to create branch' });
    }
};

// PUT /api/branches/:id - Rename a branch
export const renameBranch = async (req: Request, res: Response) => {
    try {
        const id = parseInt(String(req.params.id));
        if (isNaN(id)) {
            return res.status(400).json({ success: false, message: 'Invalid branch ID' });
        }
        const { name } = req.body;
        if (!name || !name.trim()) {
            return res.status(400).json({ success: false, message: 'Branch name is required' });
        }
        const trimmedName = name.trim();
        const existing = await prisma.branch.findUnique({ where: { name: trimmedName } });
        if (existing && existing.id !== id) {
            return res.status(409).json({ success: false, message: 'Branch name already exists' });
        }
        const target = await prisma.branch.findUnique({ where: { id } });
        if (!target) {
            return res.status(404).json({ success: false, message: 'Branch not found' });
        }

        const branch = await prisma.branch.update({
            where: { id },
            data: { name: trimmedName, updatedAt: new Date() }
        });

        const changes: string[] = [];
        if (target.name !== trimmedName) {
            changes.push(`Updated name from "${target.name}" to "${trimmedName}"`);
        }

        void audit({
            action: 'UPDATE',
            entityType: 'Branch',
            entityId: branch.id,
            performedBy: req.user?.employeeId,
            source: 'admin-panel',
            details: `Renamed branch to "${branch.name}"`,
            metadata: changes.length > 0 ? { updates: changes } : undefined,
            correlationId: req.correlationId
        });

        res.json({ success: true, branch });
    } catch (error) {
        console.error('Error renaming branch:', error);
        res.status(500).json({ success: false, message: 'Failed to rename branch' });
    }
};

// DELETE /api/branches/:id - Delete a branch
export const deleteBranch = async (req: Request, res: Response) => {
    try {
        const id = parseInt(String(req.params.id));
        if (isNaN(id)) {
            return res.status(400).json({ success: false, message: 'Invalid branch ID' });
        }

        const existing = await prisma.branch.findUnique({ where: { id } });
        if (!existing) {
            return res.status(404).json({ success: false, message: 'Branch not found' });
        }

        // Check for active employees in this branch (FK-based check only)
        const activeEmployeeCount = await prisma.employee.count({
            where: {
                branchId: id,
                employmentStatus: 'ACTIVE'
            }
        });
        if (activeEmployeeCount > 0) {
            return res.status(400).json({
                success: false,
                message: `⚠️ Cannot delete this Branch. There are currently ${activeEmployeeCount} employee(s) assigned to it. Please reassign or remove all employees before deleting.`
            });
        }

        await prisma.branch.delete({ where: { id } });

        void audit({
            action: 'DELETE',
            entityType: 'Branch',
            entityId: id,
            performedBy: req.user?.employeeId,
            source: 'admin-panel',
            level: 'WARN',
            details: `Deleted branch "${existing.name}"`,
            correlationId: req.correlationId
        });

        res.json({ success: true, message: `Branch "${existing.name}" deleted` });
    } catch (error) {
        console.error('Error deleting branch:', error);
        res.status(500).json({ success: false, message: 'Failed to delete branch' });
    }
};
