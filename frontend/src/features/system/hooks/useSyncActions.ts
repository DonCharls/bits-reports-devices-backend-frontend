'use client';

import { useState } from 'react';
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

// ─── Shared fetch helper ──────────────────────────────────────────────────────
async function apiPost<T = Record<string, unknown>>(url: string, body: unknown): Promise<T> {
    const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) {
        const msg = (data as { message?: string }).message || `Request failed (${res.status})`;
        throw new Error(msg);
    }
    return data as T;
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
            const res = await apiPost<{ success: boolean; message: string }>(
                '/api/system/sync-toggle',
                { enabled: checked }
            );
            if (res.success) {
                onStatusRefresh();
                toast({
                    title: `Global Sync ${checked ? 'Enabled' : 'Disabled'}`,
                    description: res.message,
                });
            }
        } catch (error: unknown) {
            toast({
                title: 'Error toggling sync',
                description: error instanceof Error ? error.message : 'Unknown error occurred',
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
            const res = await apiPost<{ success: boolean; message: string; data?: SyncResultData }>(
                '/api/system/sync-now',
                {}
            );
            onStatusRefresh();

            const data: SyncResultData | undefined = res.data;

            if (res.success && data?.status === 'SUCCESS') {
                // Lightweight toast for full success
                toast({
                    title: 'Sync Complete',
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
                    title: res.success ? 'Sync Complete' : 'Sync Issue',
                    description: res.message,
                    variant: res.success ? 'default' : 'destructive',
                });
            }
        } catch (error: unknown) {
            toast({
                title: 'Manual Sync Failed',
                description: error instanceof Error ? error.message : 'Server error occurred.',
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
            const res = await apiPost<{ success: boolean; message: string }>(
                '/api/system/time-sync-now',
                {}
            );
            toast({
                title: res.success ? 'Time Sync Sent' : 'Time Sync Issue',
                description: res.message,
                variant: res.success ? 'default' : 'destructive',
            });
        } catch (error: unknown) {
            toast({
                title: 'Time Sync Failed',
                description: error instanceof Error ? error.message : 'Server error occurred.',
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
            const res = await apiPost<{ success: boolean; message: string }>(
                '/api/system/clear-device-logs',
                {}
            );
            toast({
                title: res.success ? 'Logs Cleared' : 'Clear Logs Issue',
                description: res.message,
                variant: res.success ? 'default' : 'destructive',
            });
        } catch (error: unknown) {
            toast({
                title: 'Clear Logs Failed',
                description: error instanceof Error ? error.message : 'Server error occurred.',
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
