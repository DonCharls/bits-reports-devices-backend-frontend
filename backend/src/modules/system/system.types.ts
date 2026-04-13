// Sync Settings standard configuration payload
export interface UpdateSyncSettingsRequest {
    globalSyncEnabled?: boolean;
    defaultIntervalSec?: number;
    highFreqIntervalSec?: number;
    lowFreqIntervalSec?: number;
    shiftAwareSyncEnabled?: boolean;
    shiftBufferMinutes?: number;
    autoTimeSyncEnabled?: boolean;
    timeSyncIntervalSec?: number;
    globalMinCheckoutMinutes?: number;
    healthCheckEnabled?: boolean;
    healthCheckIntervalSec?: number;
    logBufferMaintenanceEnabled?: boolean;
    logBufferMaintenanceSchedule?: string;
    logBufferMaintenanceHour?: number;
}
