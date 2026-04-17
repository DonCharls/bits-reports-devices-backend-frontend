'use client';

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Server } from 'lucide-react';
import { useSyncActions } from '../hooks/useSyncActions';
import { SyncStatsGrid } from './SyncStatsGrid';
import { SyncResultModal } from './SyncResultModal';

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

interface SyncStatusCardProps {
    status: SyncStatus | null;
    loading: boolean;
    /** Called after actions that change status (toggle, manual sync) so the parent can re-fetch */
    onStatusRefresh: () => void;
}

export function SyncStatusCard({ status, loading, onStatusRefresh }: SyncStatusCardProps) {
    const {
        syncing, syncingTime, clearingLogs, toggling,
        syncResult, showResultModal, setShowResultModal,
        handleToggle, handleManualSync, handleManualTimeSync, handleManualClearLogs,
    } = useSyncActions({ onStatusRefresh });

    if (loading) return <div>Loading status...</div>;
    if (!status) return <div>Error loading status.</div>;

    return (
        <>
            <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <div className="space-y-1">
                        <CardTitle className="text-xl flex items-center gap-2">
                            <Server className="h-5 w-5 text-primary" />
                            System Synchronization
                        </CardTitle>
                        <CardDescription>
                            Manage global device synchronization and schedule
                        </CardDescription>
                    </div>
                    <div className="flex items-center gap-2">
                        <Badge variant={status.globalSyncEnabled ? 'default' : 'destructive'} className="text-sm">
                            {status.globalSyncEnabled ? 'ACTIVE' : 'DISABLED'}
                        </Badge>
                        <Switch
                            checked={status.globalSyncEnabled}
                            onCheckedChange={handleToggle}
                            disabled={toggling}
                            aria-label="Toggle Global Sync"
                        />
                    </div>
                </CardHeader>
                <CardContent>
                    <SyncStatsGrid
                        status={status}
                        syncing={syncing}
                        syncingTime={syncingTime}
                        clearingLogs={clearingLogs}
                        onManualSync={handleManualSync}
                        onManualTimeSync={handleManualTimeSync}
                        onManualClearLogs={handleManualClearLogs}
                    />
                </CardContent>
            </Card>

            <SyncResultModal
                open={showResultModal}
                onOpenChange={setShowResultModal}
                syncResult={syncResult}
                onRetry={handleManualSync}
            />
        </>
    );
}
