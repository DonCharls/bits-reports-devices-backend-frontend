'use client';

import { useState, useCallback, useEffect } from 'react';
import axios from 'axios';
import { SyncStatusCard } from './SyncStatusCard';
import { SyncConfigForm } from './SyncConfigForm';
import { DeviceSyncTable } from './DeviceSyncTable';
import {
    useDeviceStream,
    DeviceConnectedPayload,
    DeviceStatusPayload,
    DeviceSyncResultPayload
} from '@/hooks/useDeviceStream';

interface SyncStatus {
    isActive: boolean;
    intervalSec: number;
    lastSyncAt: string | null;
    nextSyncAt: string | null;
    shiftAwareMode: boolean;
    configUpdatedAt: string | null;
    globalSyncEnabled: boolean;
}

interface Device {
    id: number;
    name: string;
    ip: string;
    isActive: boolean;
    syncEnabled: boolean;
    lastSyncedAt: string | null;
    lastPolledAt: string | null;
    lastSyncStatus: string | null;
    lastSyncError: string | null;
}

/**
 * Client component that orchestrates the System dashboard.
 * Opens ONE shared SSE connection via useDeviceStream and passes
 * state + callbacks to child components as props.
 */
export function SystemDashboard() {
    // ── Sync Status state (for SyncStatusCard) ───────────────────────────
    const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);
    const [statusLoading, setStatusLoading] = useState(true);

    const fetchSyncStatus = useCallback(async () => {
        try {
            const res = await axios.get('/api/system/sync-status', { withCredentials: true });
            if (res.data.success) {
                setSyncStatus(res.data.status);
            }
        } catch (error) {
            console.error('Failed to fetch sync status', error);
        } finally {
            setStatusLoading(false);
        }
    }, []);

    // ── Device list state (for DeviceSyncTable) ──────────────────────────
    const [devices, setDevices] = useState<Device[]>([]);
    const [devicesLoading, setDevicesLoading] = useState(true);

    const fetchDevices = useCallback(async () => {
        try {
            const res = await axios.get('/api/devices', { withCredentials: true });
            if (res.data.success) {
                setDevices(res.data.devices);
            }
        } catch (error) {
            console.error('Failed to fetch devices', error);
        } finally {
            setDevicesLoading(false);
        }
    }, []);

    // ── Initial data load ────────────────────────────────────────────────
    useEffect(() => {
        fetchSyncStatus();
        fetchDevices();

        // Safety-net poll: 60s, not 10s, since SSE handles real-time
        const interval = setInterval(fetchSyncStatus, 60_000);
        return () => clearInterval(interval);
    }, [fetchSyncStatus, fetchDevices]);

    // ── SSE callbacks (one connection for the whole page) ────────────────
    const handleConnected = useCallback((payload: DeviceConnectedPayload) => {
        setDevices(payload.devices as Device[]);
        setDevicesLoading(false);
    }, []);

    const handleStatusChange = useCallback((payload: DeviceStatusPayload) => {
        setDevices(prev =>
            prev.map(d => d.id === payload.id ? { ...d, isActive: payload.isActive } : d)
        );
    }, []);

    const handleConfigUpdate = useCallback(() => {
        // Config was saved → re-fetch sync status so the dashboard shows new interval instantly
        fetchSyncStatus();
    }, [fetchSyncStatus]);

    const handleSyncResult = useCallback((payload: DeviceSyncResultPayload) => {
        setDevices(prev =>
            prev.map(d => d.id === payload.id ? {
                ...d,
                lastSyncStatus: payload.lastSyncStatus,
                lastSyncError: payload.lastSyncError,
                lastSyncedAt: payload.lastSyncedAt ?? d.lastSyncedAt,
                lastPolledAt: payload.lastPolledAt ?? d.lastPolledAt,
            } : d)
        );
    }, []);

    // ── Single SSE subscription ──────────────────────────────────────────
    useDeviceStream({
        onConnected: handleConnected,
        onStatusChange: handleStatusChange,
        onConfigUpdate: handleConfigUpdate,
        onSyncResult: handleSyncResult,
    });

    return (
        <div className="container mx-auto p-6 max-w-6xl space-y-6">
            <div>
                <h1 className="text-3xl font-bold tracking-tight">System Configuration</h1>
                <p className="text-muted-foreground mt-2">
                    Monitor background sync activity, adjust polling intervals, and view device connectivity health.
                </p>
            </div>

            <div className="grid gap-6">
                <SyncStatusCard
                    status={syncStatus}
                    loading={statusLoading}
                    onStatusRefresh={fetchSyncStatus}
                />

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
                    <SyncConfigForm />
                    <DeviceSyncTable
                        devices={devices}
                        loading={devicesLoading}
                        onDevicesChange={setDevices}
                    />
                </div>
            </div>
        </div>
    );
}
