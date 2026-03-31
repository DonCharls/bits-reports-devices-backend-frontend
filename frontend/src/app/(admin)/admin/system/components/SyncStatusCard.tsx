'use client';

import { useState } from 'react';
import axios from 'axios';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Server, Activity, Clock, Play, AlertTriangle, XCircle } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { format } from 'date-fns';
import {
    Dialog, DialogContent, DialogHeader, DialogTitle,
    DialogDescription, DialogFooter
} from '@/components/ui/dialog';

interface SyncStatus {
    isActive: boolean;
    intervalSec: number;
    lastSyncAt: string | null;
    nextSyncAt: string | null;
    shiftAwareMode: boolean;
    configUpdatedAt: string | null;
    globalSyncEnabled: boolean;
    currentMode?: 'PEAK' | 'OFF-PEAK' | 'DEFAULT';
}

interface FailedDevice {
    id: number;
    name: string;
    error: string;
}

interface SyncResultData {
    status: 'SUCCESS' | 'PARTIAL' | 'FAILED' | 'NO_DEVICES';
    message: string;
    totalDevices: number;
    successfulDevices: number;
    failedDevices: FailedDevice[];
    newLogs: number;
}

interface SyncStatusCardProps {
    status: SyncStatus | null;
    loading: boolean;
    /** Called after actions that change status (toggle, manual sync) so the parent can re-fetch */
    onStatusRefresh: () => void;
}

export function SyncStatusCard({ status, loading, onStatusRefresh }: SyncStatusCardProps) {
    const [syncing, setSyncing] = useState(false);
    const [syncingTime, setSyncingTime] = useState(false);
    const [toggling, setToggling] = useState(false);
    const [syncResult, setSyncResult] = useState<SyncResultData | null>(null);
    const [showResultModal, setShowResultModal] = useState(false);
    const { toast } = useToast();

    const handleToggle = async (checked: boolean) => {
        setToggling(true);
        try {
            const res = await axios.post('/api/system/sync-toggle', { enabled: checked }, { withCredentials: true });
            if (res.data.success) {
                onStatusRefresh();
                toast({
                    title: `Global Sync ${checked ? 'Enabled' : 'Disabled'}`,
                    description: res.data.message,
                });
            }
        } catch (error: unknown) {
            const axiosErr = error as { response?: { data?: { message?: string } } };
            toast({
                title: 'Error toggling sync',
                description: axiosErr.response?.data?.message || 'Unknown error occurred',
                variant: 'destructive',
            });
        } finally {
            setToggling(false);
        }
    };

    const handleManualSync = async () => {
        setSyncing(true);
        try {
            const res = await axios.post('/api/system/sync-now', {}, { withCredentials: true });
            onStatusRefresh();
            
            const data: SyncResultData | undefined = res.data.data;

            if (res.data.success && data?.status === 'SUCCESS') {
                // Lightweight toast for full success
                toast({
                    title: 'Sync Complete ✅',
                    description: `${data.newLogs} new attendance logs synced across ${data.totalDevices} device(s).`,
                });
            } else if (data?.status === 'NO_DEVICES') {
                toast({
                    title: 'No Devices',
                    description: 'There are no active devices configured to sync.',
                });
            } else if (data?.status === 'PARTIAL' || data?.status === 'FAILED') {
                // Open rich modal for failures
                setSyncResult(data);
                setShowResultModal(true);
            } else {
                toast({
                    title: res.data.success ? 'Sync Complete' : 'Sync Issue',
                    description: res.data.message,
                    variant: res.data.success ? 'default' : 'destructive',
                });
            }
        } catch (error: unknown) {
            const axiosErr = error as { response?: { data?: { message?: string } } };
            toast({
                title: 'Manual Sync Failed',
                description: axiosErr.response?.data?.message || 'Server error occurred.',
                variant: 'destructive',
            });
        } finally {
            setSyncing(false);
        }
    };

    const handleManualTimeSync = async () => {
        setSyncingTime(true);
        try {
            const res = await axios.post('/api/system/time-sync-now', {}, { withCredentials: true });
            
            toast({
                title: res.data.success ? 'Time Sync Sent' : 'Time Sync Issue',
                description: res.data.message,
                variant: res.data.success ? 'default' : 'destructive',
            });
        } catch (error: unknown) {
            const axiosErr = error as { response?: { data?: { message?: string } } };
            toast({
                title: 'Time Sync Failed',
                description: axiosErr.response?.data?.message || 'Server error occurred.',
                variant: 'destructive',
            });
        } finally {
            setSyncingTime(false);
        }
    };

    if (loading) return <div>Loading status...</div>;
    if (!status) return <div>Error loading status.</div>;

    const isPartial = syncResult?.status === 'PARTIAL';

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
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-4">
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

                        <div className="flex flex-col gap-2">
                            <div className="text-sm text-muted-foreground flex items-center gap-1">
                                <Clock className="h-4 w-4" /> Last Synchronized
                            </div>
                            <div className="text-lg font-medium">
                                {status.lastSyncAt ? format(new Date(status.lastSyncAt), 'PPpp') : 'Never'}
                            </div>
                        </div>

                         <div className="flex flex-col gap-2 items-start justify-center">
                            <Button 
                                onClick={handleManualSync} 
                                disabled={syncing || syncingTime || !status.globalSyncEnabled}
                                className="w-full"
                            >
                                {syncing ? 'Syncing...' : (
                                    <>
                                        <Play className="h-4 w-4 mr-2" /> Sync Data Now
                                    </>
                                )}
                            </Button>
                            <Button 
                                onClick={handleManualTimeSync} 
                                disabled={syncingTime || syncing || !status.globalSyncEnabled}
                                variant="outline"
                                className="w-full"
                            >
                                {syncingTime ? 'Aligning Clocks...' : (
                                    <>
                                        <Clock className="h-4 w-4 mr-2" /> Sync Time Now
                                    </>
                                )}
                            </Button>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Sync Result Modal (PARTIAL / FAILED) */}
            <Dialog open={showResultModal} onOpenChange={setShowResultModal}>
                <DialogContent className="sm:max-w-lg">
                    <DialogHeader>
                        <DialogTitle className={`flex items-center gap-2 ${isPartial ? 'text-amber-600' : 'text-red-600'}`}>
                            {isPartial
                                ? <><AlertTriangle className="h-5 w-5" /> Sync Partially Completed</>
                                : <><XCircle className="h-5 w-5" /> Sync Failed</>
                            }
                        </DialogTitle>
                        <DialogDescription>
                            {syncResult?.message}
                        </DialogDescription>
                    </DialogHeader>

                    {syncResult && syncResult.failedDevices.length > 0 && (
                        <div className="space-y-3 py-2">
                            <p className="text-sm font-medium">Failed Devices:</p>
                            <div className="space-y-2 max-h-[200px] overflow-auto">
                                {syncResult.failedDevices.map((device) => (
                                    <div key={device.id} className="flex items-start gap-3 rounded-lg border border-red-100 bg-red-50 p-3">
                                        <XCircle className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
                                        <div className="min-w-0">
                                            <p className="text-sm font-semibold text-red-800">{device.name}</p>
                                            <p className="text-xs text-red-600 break-words">{device.error}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                            {syncResult.status === 'PARTIAL' && (
                                <p className="text-xs text-muted-foreground">
                                    {syncResult.successfulDevices} of {syncResult.totalDevices} device(s) synced successfully ({syncResult.newLogs} new logs).
                                </p>
                            )}
                        </div>
                    )}

                    <DialogFooter>
                        <Button variant="outline" onClick={() => setShowResultModal(false)}>
                            Close
                        </Button>
                        <Button onClick={() => { setShowResultModal(false); handleManualSync(); }}>
                            <Play className="h-4 w-4 mr-2" /> Retry Sync
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}
