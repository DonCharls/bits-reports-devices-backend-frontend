-- DropLegacyBranchDepartmentStrings
-- The Employee table previously had `department` and `branch` string columns
-- that duplicated the FK-based Department/Branch relations. These stale
-- columns were never updated when a branch/department was renamed, causing
-- inconsistent data. The FK relations (`departmentId`/`branchId`) are the
-- source of truth, so these legacy string columns are no longer needed.

ALTER TABLE "Employee" DROP COLUMN IF EXISTS "department";
ALTER TABLE "Employee" DROP COLUMN IF EXISTS "branch";
