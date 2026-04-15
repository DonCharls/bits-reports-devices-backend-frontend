'use client';

import { Activity, Clock, HeartPulse, Play, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';

interface SyncStatus {
    isActive: boolean;
    intervalSec: number;
    lastSyncAt: string | null;
    nextSyncAt: string | null;
    shiftAwareMode: boolean;
    configUpdatedAt: string | null;
    globalSyncEnabled: boolean;
    currentMode?: 'PEAK' | 'OFF-PEAK' | 'DEFAULT';
    healthCheck?: {
        isActive: boolean;
        intervalSec: number;
        lastCheckAt: string | null;
        nextCheckAt: string | null;
    };
}

interface SyncStatsGridProps {
    status: SyncStatus;
    syncing: boolean;
    syncingTime: boolean;
    clearingLogs: boolean;
    onManualSync: () => void;
    onManualTimeSync: () => void;
    onManualClearLogs: () => void;
}

export function SyncStatsGrid({
    status, syncing, syncingTime, clearingLogs,
    onManualSync, onManualTimeSync, onManualClearLogs,
}: SyncStatsGridProps) {
    return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mt-4">
            {/* Current Interval */}
            <div className="flex flex-col gap-2">
                <div className="text-sm text-muted-foreground flex items-center gap-1">
                    <Activity className="h-4 w-4" /> Current Interval
                </div>
                <div className="text-2xl font-semibold flex items-center gap-2">
                    {status.intervalSec} sec
                    {status.shiftAwareMode && status.currentMode === 'PEAK' && (
                        <Badge variant="destructive" className="text-xs px-2 py-0 h-5">PEAK ⚡</Badge>
                    )}
                    {status.shiftAwareMode && status.currentMode === 'OFF-PEAK' && (
                        <Badge variant="secondary" className="text-xs px-2 py-0 h-5 border">OFF-PEAK 💤</Badge>
                    )}
                </div>
                {status.shiftAwareMode && (
                    <div className="text-xs text-blue-500 font-medium">Shift-Aware Mode Active</div>
                )}
            </div>

            {/* Last Synchronized */}
            <div className="flex flex-col gap-2">
                <div className="text-sm text-muted-foreground flex items-center gap-1">
                    <Clock className="h-4 w-4" /> Last Synchronized
                </div>
                <div className="text-lg font-medium">
                    {status.lastSyncAt ? format(new Date(status.lastSyncAt), 'PPpp') : 'Never'}
                </div>
            </div>

            {/* Health Monitor */}
            <div className="flex flex-col gap-2">
                <div className="text-sm text-muted-foreground flex items-center gap-1">
                    <HeartPulse className="h-4 w-4" /> Health Monitor
                </div>
                {status.healthCheck?.isActive ? (
                    <div className="text-lg font-medium flex items-center gap-2">
                        <div className="h-2.5 w-2.5 rounded-full bg-green-500 animate-pulse" />
                        Active <span className="text-sm text-muted-foreground font-normal">({status.healthCheck.intervalSec}s)</span>
                    </div>
                ) : (
                    <div className="text-lg font-medium flex items-center gap-2 text-muted-foreground">
                        <div className="h-2.5 w-2.5 rounded-full bg-gray-400" />
                        Disabled
                    </div>
                )}
                <div className="text-xs text-muted-foreground">
                    {status.healthCheck?.isActive
                        ? `Last check: ${status.healthCheck.lastCheckAt ? format(new Date(status.healthCheck.lastCheckAt), 'HH:mm:ss') : 'Pending...'}`
                        : 'Offline'}
                </div>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-col gap-2 items-start justify-center">
                <Button
                    onClick={onManualSync}
                    disabled={syncing || syncingTime || !status.globalSyncEnabled}
                    className="w-full"
                >
                    {syncing ? 'Syncing...' : (
                        <><Play className="h-4 w-4 mr-2" /> Sync Data Now</>
                    )}
                </Button>
                <Button
                    onClick={onManualTimeSync}
                    disabled={syncingTime || syncing || clearingLogs || !status.globalSyncEnabled}
                    variant="outline"
                    className="w-full"
                >
                    {syncingTime ? 'Aligning Clocks...' : (
                        <><Clock className="h-4 w-4 mr-2" /> Sync Time Now</>
                    )}
                </Button>
                <Button
                    onClick={onManualClearLogs}
                    disabled={clearingLogs || syncing || syncingTime}
                    variant="outline"
                    className="w-full border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700"
                >
                    {clearingLogs ? 'Clearing Logs...' : (
                        <><Trash2 className="h-4 w-4 mr-2" /> Clear Logs Now</>
                    )}
                </Button>
            </div>
        </div>
    );
}
