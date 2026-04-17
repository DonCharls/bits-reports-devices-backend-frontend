-- AlterTable: Add checkoutSource field to Attendance
ALTER TABLE "Attendance" ADD COLUMN "checkoutSource" TEXT;

-- Backfill existing data:
-- 1. Records with checkout_updated set → manual checkout
UPDATE "Attendance" SET "checkoutSource" = 'manual' WHERE "checkout_updated" IS NOT NULL AND "checkOutTime" IS NOT NULL;

-- 2. Records with Auto checkout note → auto_closed
UPDATE "Attendance" SET "checkoutSource" = 'auto_closed' WHERE "notes" LIKE '%Auto checkout%' AND "checkoutSource" IS NULL;

-- 3. Remaining records with checkOutTime but no checkoutSource → device checkout
UPDATE "Attendance" SET "checkoutSource" = 'device' WHERE "checkOutTime" IS NOT NULL AND "checkoutSource" IS NULL;

-- 4. Records with no checkOutTime remain NULL (active or incomplete)
