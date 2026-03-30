import cron from 'node-cron';
import { syncZkData, syncAllDeviceClocks } from '../services/zkServices';
import { autoCloseIncompleteAttendance } from '../services/attendance.service';

/**
 * Initialize all cron jobs for automated attendance tracking
 */
export const startCronJobs = () => {
    console.log('[CronJobs] Initializing automated jobs...');

    // Job 1: Sync attendance logs from ZKTeco device every 30 seconds.
    // Uses a non-blocking lock — if the device is busy (e.g. enrollment is
    // running), this tick is skipped and the next one tries again.
    cron.schedule('*/30 * * * * *', async () => {
        try {
            const result = await syncZkData();
            if (result.success && result.message !== 'Skipped — device busy') {
                console.log(`[CronJob] Sync completed: ${result.newLogs || 0} new logs`);
            } else if (!result.success) {
                console.error('[CronJob] Sync failed:', result.error);
            }
        } catch (error) {
            console.error('[CronJob] Sync error:', error);
        }
    });

    // Job 2: Auto-close incomplete attendance records at midnight
    cron.schedule('0 0 * * *', async () => {
        console.log('[CronJob] Running midnight cleanup...');
        try {
            const closedCount = await autoCloseIncompleteAttendance();
            console.log(`[CronJob] Cleanup completed: ${closedCount} records marked incomplete`);
        } catch (error) {
            console.error('[CronJob] Cleanup error:', error);
        }
    });


    // Job 3: REMOVED — Auto-checkout has been permanently disabled.
    // Missing checkouts are now flagged by Job 2 for manual review.

    // Job 4: Sync all ZK device clocks to server PHT time every hour
    // SAFE — only calls setTime(), never touches attendance or employee data.
    cron.schedule('0 * * * *', async () => {
        console.log('[CronJob] Running hourly device clock sync...');
        try {
            await syncAllDeviceClocks();
        } catch (error) {
            console.error('[CronJob] Clock sync error:', error);
        }
    });

    console.log('[CronJobs] ✓ Periodic sync scheduled (every 30 seconds, skips when device is busy)');
    console.log('[CronJobs] ✓ Midnight cleanup scheduled (00:00 daily)');
    console.log('[CronJobs] ✓ Hourly device clock sync scheduled (top of every hour)');
};
