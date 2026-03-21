-- AlterTable: Add lastSyncedAt to Device
-- This nullable column stores the UTC timestamp of the most recently processed
-- attendance log for each device. It acts as a sync watermark so subsequent
-- sync cycles only fetch and process logs newer than this point in time.
-- NULL = device has never completed a watermark-based sync (safe default: use 48h fallback).
ALTER TABLE "Device" ADD COLUMN "lastSyncedAt" TIMESTAMP(3);
