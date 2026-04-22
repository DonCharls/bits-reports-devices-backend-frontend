'use client';

import { useState, useEffect, useCallback } from 'react';
import { useToast } from '@/components/ui/use-toast';

export interface SyncConfig {
    defaultIntervalSec: number;
    highFreqIntervalSec: number;
    lowFreqIntervalSec: number;
    shiftAwareSyncEnabled: boolean;
    shiftBufferMinutes: number;
    autoTimeSyncEnabled: boolean;
    timeSyncIntervalSec: number;
    globalMinCheckoutMinutes: number;
    healthCheckEnabled: boolean;
    healthCheckIntervalSec: number;
    logBufferMaintenanceEnabled: boolean;
    logBufferMaintenanceSchedule: 'daily' | 'weekly' | 'monthly';
    logBufferMaintenanceHour: number;
}

export function useSyncConfig() {
    const [config, setConfig] = useState<SyncConfig | null>(null);
    const [initialConfig, setInitialConfig] = useState<SyncConfig | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [showIntervalWarning, setShowIntervalWarning] = useState(false);
    const { toast } = useToast();

    useEffect(() => {
        const fetchConfig = async () => {
            try {
                const res = await fetch('/api/system/sync-config', { credentials: 'include' });
                const data = await res.json();
                if (data.success) {
                    setConfig(data.config);
                    setInitialConfig(data.config);
                }
            } catch (error) {
                console.error('Failed to fetch sync config', error);
            } finally {
                setLoading(false);
            }
        };

        fetchConfig();
    }, []);

    const saveConfig = useCallback(async () => {
        if (!config) return;
        setSaving(true);
        setShowIntervalWarning(false);
        try {
            const res = await fetch('/api/system/sync-config', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify(config),
            });
            const data = await res.json();
            if (data.success) {
                setInitialConfig(config);
                toast({
                    title: 'Configuration Saved',
                    description: data.warning
                        ? `${data.warning}`
                        : 'Sync intervals updated successfully.',
                });
            } else {
                toast({
                    title: 'Error saving config',
                    description: data.message || 'Failed to update configuration',
                    variant: 'destructive',
                });
            }
        } catch (error: unknown) {
            toast({
                title: 'Error saving config',
                description: error instanceof Error ? error.message : 'Failed to update configuration',
                variant: 'destructive',
            });
        } finally {
            setSaving(false);
        }
    }, [config, toast]);

    const handleSubmit = useCallback(async (e: React.FormEvent) => {
        e.preventDefault();
        if (!config) return;

        // Intercept: if interval is below 30s, show warning modal
        if (config.defaultIntervalSec < 30) {
            setShowIntervalWarning(true);
            return;
        }
        
        if (config.globalMinCheckoutMinutes < 15) {
            toast({
                title: 'Invalid configuration',
                description: 'Global Minimum Checkout must be at least 15 minutes.',
                variant: 'destructive'
            });
            return;
        }

        await saveConfig();
    }, [config, saveConfig, toast]);

    const isDirty = JSON.stringify(config) !== JSON.stringify(initialConfig);

    return {
        config,
        setConfig,
        loading,
        saving,
        isDirty,
        showIntervalWarning,
        setShowIntervalWarning,
        saveConfig,
        handleSubmit,
    };
}
