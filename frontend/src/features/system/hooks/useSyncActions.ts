'use client';

import { useState } from 'react';
import axios from 'axios';
import { useToast } from '@/components/ui/use-toast';

// ─── Types (re-exported so sub-components can import from one place) ──────────

export interface FailedDevice {
    id: number;
    name: string;
    error: string;
}

export interface SyncResultData {
    status: 'SUCCESS' | 'PARTIAL' | 'FAILED' | 'NO_DEVICES';
    message: string;
    totalDevices: number;
    successfulDevices: number;
    failedDevices: FailedDevice[];
    newLogs: number;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────
//
// NOTE: This component has NO polling and NO streaming.
// status/loading are passed in as props from the parent.
// This hook owns only the action-triggered state.

interface UseSyncActionsOptions {
    /** Called after actions that change status (toggle, manual sync) so the parent can re-fetch */
    onStatusRefresh: () => void;
}

export function useSyncActions({ onStatusRefresh }: UseSyncActionsOptions) {
    const [syncing, setSyncing] = useState(false);
    const [syncingTime, setSyncingTime] = useState(false);
    const [clearingLogs, setClearingLogs] = useState(false);
    const [toggling, setToggling] = useState(false);
    const [syncResult, setSyncResult] = useState<SyncResultData | null>(null);
    const [showResultModal, setShowResultModal] = useState(false);
    const { toast } = useToast();

    // ── Toggle global sync ────────────────────────────────────────────────────

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

    // ── Manual attendance data sync ───────────────────────────────────────────

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

    // ── Manual time sync ──────────────────────────────────────────────────────

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

    // ── Manual clear device logs ──────────────────────────────────────────────

    const handleManualClearLogs = async () => {
        if (!confirm('Are you sure you want to clear the log buffers on all active devices right now?\nThis is normally done automatically during off-hours to prevent data loss races.')) {
            return;
        }
        setClearingLogs(true);
        try {
            const res = await axios.post('/api/system/clear-device-logs', {}, { withCredentials: true });
            toast({
                title: res.data.success ? 'Logs Cleared' : 'Clear Logs Issue',
                description: res.data.message,
                variant: res.data.success ? 'default' : 'destructive',
            });
        } catch (error: unknown) {
            const axiosErr = error as { response?: { data?: { message?: string } } };
            toast({
                title: 'Clear Logs Failed',
                description: axiosErr.response?.data?.message || 'Server error occurred.',
                variant: 'destructive',
            });
        } finally {
            setClearingLogs(false);
        }
    };

    return {
        // progress flags
        syncing,
        syncingTime,
        clearingLogs,
        toggling,
        // result modal state
        syncResult,
        showResultModal,
        setShowResultModal,
        // action handlers
        handleToggle,
        handleManualSync,
        handleManualTimeSync,
        handleManualClearLogs,
    };
}
