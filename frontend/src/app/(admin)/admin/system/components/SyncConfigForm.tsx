'use client';

import { useState, useEffect } from 'react';
import axios from 'axios';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/components/ui/use-toast';
import { Settings, AlertTriangle } from 'lucide-react';
import {
    Dialog, DialogContent, DialogHeader, DialogTitle,
    DialogDescription, DialogFooter
} from '@/components/ui/dialog';

interface SyncConfig {
    defaultIntervalSec: number;
    highFreqIntervalSec: number;
    lowFreqIntervalSec: number;
    shiftAwareSyncEnabled: boolean;
    shiftBufferMinutes: number;
    autoTimeSyncEnabled: boolean;
    timeSyncIntervalSec: number;
}

function DurationInput({ 
    label, 
    description, 
    totalSeconds, 
    onChange 
}: { 
    label: string; 
    description?: string; 
    totalSeconds: number; 
    onChange: (sec: number) => void;
}) {
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    const update = (h: number, m: number, s: number) => {
        const validH = Math.max(0, h || 0);
        const validM = Math.max(0, m || 0);
        const validS = Math.max(0, s || 0);
        onChange(validH * 3600 + validM * 60 + validS);
    };

    return (
        <div className="space-y-3 w-full max-w-[320px]">
            <Label className="text-sm font-medium">{label}</Label>
            <div className="flex items-center justify-between gap-2 w-full">
                <div className="flex-1 flex flex-col gap-1">
                    <Input 
                        type="number" 
                        min={0} 
                        value={hours || ''} 
                        placeholder="0"
                        className="text-center [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                        onChange={(e) => update(parseInt(e.target.value), minutes, seconds)} 
                    />
                    <span className="text-[10px] text-muted-foreground text-center font-medium uppercase tracking-wider">Hrs</span>
                </div>
                <span className="font-bold pb-4 text-muted-foreground">:</span>
                <div className="flex-1 flex flex-col gap-1">
                    <Input 
                        type="number" 
                        min={0} 
                        max={59} 
                        value={minutes || ''} 
                        placeholder="0"
                        className="text-center [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                        onChange={(e) => update(hours, parseInt(e.target.value), seconds)} 
                    />
                    <span className="text-[10px] text-muted-foreground text-center font-medium uppercase tracking-wider">Min</span>
                </div>
                <span className="font-bold pb-4 text-muted-foreground">:</span>
                <div className="flex-1 flex flex-col gap-1">
                    <Input 
                        type="number" 
                        min={0} 
                        max={59} 
                        value={seconds || ''} 
                        placeholder="0"
                        className="text-center [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                        onChange={(e) => update(hours, minutes, parseInt(e.target.value))} 
                    />
                    <span className="text-[10px] text-muted-foreground text-center font-medium uppercase tracking-wider">Sec</span>
                </div>
            </div>
            {description && <p className="text-xs text-muted-foreground leading-relaxed pt-1">{description}</p>}
        </div>
    );
}

export function SyncConfigForm() {
    const [config, setConfig] = useState<SyncConfig | null>(null);
    const [initialConfig, setInitialConfig] = useState<SyncConfig | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [showIntervalWarning, setShowIntervalWarning] = useState(false);
    const { toast } = useToast();

    useEffect(() => {
        const fetchConfig = async () => {
            try {
                const res = await axios.get('/api/system/sync-config', { withCredentials: true });
                if (res.data.success) {
                    setConfig(res.data.config);
                    setInitialConfig(res.data.config);
                }
            } catch (error) {
                console.error('Failed to fetch sync config', error);
            } finally {
                setLoading(false);
            }
        };

        fetchConfig();
    }, []);

    const saveConfig = async () => {
        if (!config) return;
        setSaving(true);
        setShowIntervalWarning(false);
        try {
            const res = await axios.put('/api/system/sync-config', config, { withCredentials: true });
            if (res.data.success) {
                setInitialConfig(config);
                toast({
                    title: 'Configuration Saved',
                    description: res.data.warning
                        ? `⚠️ ${res.data.warning}`
                        : 'Sync intervals updated successfully.',
                });
            }
        } catch (error: unknown) {
            const errMsg = error instanceof Error ? error.message : 'Failed to update configuration';
            const axiosErr = error as { response?: { data?: { message?: string } } };
            toast({
                title: 'Error saving config',
                description: axiosErr.response?.data?.message || errMsg,
                variant: 'destructive',
            });
        } finally {
            setSaving(false);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!config) return;

        // Intercept: if interval is below 30s, show warning modal
        if (config.defaultIntervalSec < 30) {
            setShowIntervalWarning(true);
            return;
        }

        await saveConfig();
    };

    if (loading) return <div>Loading configuration...</div>;
    if (!config) return <div>Error loading configuration.</div>;

    return (
        <>
            <Card>
                <CardHeader className="pb-4">
                    <CardTitle className="text-xl flex items-center gap-2">
                        <Settings className="h-5 w-5 text-primary" />
                        Advanced Configuration
                    </CardTitle>
                    <CardDescription>
                        Adjust polling intervals and dynamic shift-aware logic
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <form onSubmit={handleSubmit} className="space-y-6">
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            <div className="space-y-3 pt-4">
                                <DurationInput
                                    label="Default Sync Interval"
                                    description="How often the system pulls logs from the device (minimum 5s)."
                                    totalSeconds={config.defaultIntervalSec}
                                    onChange={(sec) => setConfig({ ...config, defaultIntervalSec: sec })}
                                />
                            </div>
                            
                            <div className="space-y-4 rounded-md border p-4 bg-muted/20">
                                <div className="flex items-center justify-between">
                                    <Label htmlFor="shiftAware" className="font-semibold text-primary">Enable Shift-Aware Sync</Label>
                                    <Switch 
                                        id="shiftAware" 
                                        checked={config.shiftAwareSyncEnabled}
                                        onCheckedChange={(c) => setConfig({ ...config, shiftAwareSyncEnabled: c })} 
                                    />
                                </div>
                                <p className="text-xs text-muted-foreground leading-relaxed">
                                    When enabled, the sync interval automatically adjusts based on employee shifts. 
                                    High frequency during active shift windows, low frequency when no one is expected.
                                </p>
                                
                                {config.shiftAwareSyncEnabled && (
                                    <div className="space-y-4 pt-2 border-t mt-4">
                                         <div className="flex flex-col gap-6">
                                            <div className="space-y-2">
                                                <DurationInput
                                                    label="Peak Interval"
                                                    totalSeconds={config.highFreqIntervalSec}
                                                    onChange={(sec) => setConfig({ ...config, highFreqIntervalSec: sec })}
                                                />
                                            </div>
                                            <div className="space-y-2">
                                                <DurationInput
                                                    label="Off-Peak Interval"
                                                    totalSeconds={config.lowFreqIntervalSec}
                                                    onChange={(sec) => setConfig({ ...config, lowFreqIntervalSec: sec })}
                                                />
                                            </div>
                                         </div>
                                         <div className="space-y-2">
                                             <Label htmlFor="buffer" className="text-xs font-medium">Shift Start/End Buffer (mins)</Label>
                                             <Input 
                                                    id="buffer" 
                                                    type="number" 
                                                    min={0}
                                                    max={120}
                                                    value={config.shiftBufferMinutes}
                                                    onChange={(e) => {
                                                        const raw = parseInt(e.target.value) || 0;
                                                        const clamped = Math.min(120, Math.max(0, raw));
                                                        setConfig({ ...config, shiftBufferMinutes: clamped });
                                                    }}
                                                />
                                            <p className="text-[10px] text-muted-foreground">Maximum limit: 120 minutes (2 hours).</p>
                                         </div>
                                    </div>
                                )}
                            </div>

                            {/* Time Synchronization Card */}
                            <div className="space-y-4 rounded-md border p-4 bg-muted/20 md:col-span-2">
                                <div className="flex items-center justify-between">
                                    <Label htmlFor="autoTimeSync" className="font-semibold text-primary">Automated Time Sync</Label>
                                    <Switch 
                                        id="autoTimeSync" 
                                        checked={config.autoTimeSyncEnabled}
                                        onCheckedChange={(c) => setConfig({ ...config, autoTimeSyncEnabled: c })} 
                                    />
                                </div>
                                <p className="text-xs text-muted-foreground leading-relaxed">
                                    Periodically synchronizes the Real-Time Clocks (RTC) on all ZKTeco devices with the server to prevent attendance log timestamp drift.
                                </p>
                                
                                {config.autoTimeSyncEnabled && (
                                    <div className="space-y-4 pt-2 border-t mt-4">
                                        <div className="w-full md:w-1/2">
                                            <DurationInput
                                                label="Clock Alignment Interval"
                                                description="How often to correct device clocks (recommended: 1 to 24 hours)."
                                                totalSeconds={config.timeSyncIntervalSec}
                                                onChange={(sec) => setConfig({ ...config, timeSyncIntervalSec: sec })}
                                            />
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Disable button if saving OR if no changes exist */}
                        <div className="flex justify-end mt-4 pt-4 border-t">
                            <Button 
                                type="submit" 
                                disabled={saving || JSON.stringify(config) === JSON.stringify(initialConfig)}
                            >
                                {saving ? 'Saving...' : 'Save Configuration'}
                            </Button>
                        </div>
                    </form>
                </CardContent>
            </Card>

            {/* Low Interval Warning Dialog */}
            <Dialog open={showIntervalWarning} onOpenChange={setShowIntervalWarning}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 text-amber-600">
                            <AlertTriangle className="h-5 w-5" />
                            Low Sync Interval Warning
                        </DialogTitle>
                        <DialogDescription>
                            You are setting the sync interval to <strong>{config.defaultIntervalSec}s</strong>, which is below the recommended 30 seconds.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-2 text-sm text-muted-foreground py-2">
                        <p className="font-medium text-foreground">This may cause:</p>
                        <ul className="list-disc pl-5 space-y-1">
                            <li><strong>High server load</strong> — frequent database writes and network calls</li>
                            <li><strong>Device instability</strong> — ZKTeco readers may drop connections under rapid polling</li>
                            <li><strong>Duplicate sync conflicts</strong> — overlapping sync cycles may race against each other</li>
                        </ul>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setShowIntervalWarning(false)}>
                            Cancel
                        </Button>
                        <Button variant="destructive" onClick={saveConfig} disabled={saving}>
                            {saving ? 'Saving...' : 'Proceed Anyway'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}
