'use client';

import { Button } from '@/components/ui/button';
import { AlertTriangle, Save } from 'lucide-react';
import {
    Dialog, DialogContent, DialogHeader, DialogTitle,
    DialogDescription, DialogFooter
} from '@/components/ui/dialog';
import { useSyncConfig } from '../hooks/useSyncConfig';
import { ShiftAwareConfigSection } from './ShiftAwareConfigSection';
import { TimeSyncConfigSection } from './TimeSyncConfigSection';
import { AttendanceRulesSection } from './AttendanceRulesSection';
import { HealthMonitorConfigSection } from './HealthMonitorConfigSection';
import { LogMaintenanceConfigSection } from './LogMaintenanceConfigSection';
import { DurationInput } from './DurationInput';

function Skeleton({ className }: { className?: string }) {
    return <div className={`animate-pulse bg-slate-200 rounded-lg ${className ?? ''}`} />;
}

export function SyncConfigForm() {
    const { config, setConfig, limits, loading, saving, isDirty, showIntervalWarning, setShowIntervalWarning, saveConfig, handleSubmit, handleDiscard } = useSyncConfig();

    if (loading) return (
        <div className="space-y-3">
            <Skeleton className="h-64 rounded-xl" />
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-40 rounded-xl" />)}
            </div>
        </div>
    );

    if (!config) return (
        <div className="bg-white rounded-xl border border-red-100 shadow-sm px-5 py-4">
            <p className="text-sm text-red-600 font-semibold">Error loading configuration.</p>
        </div>
    );

    const handleChange = (patch: Record<string, unknown>) => setConfig({ ...config, ...patch });

    return (
        <>
            <form onSubmit={handleSubmit} className="space-y-3">
                {/* ── Section 2: Shift-Aware Sync (full width) ──────────── */}
                <ShiftAwareConfigSection
                    defaultIntervalSec={config.defaultIntervalSec}
                    shiftAwareSyncEnabled={config.shiftAwareSyncEnabled}
                    highFreqIntervalSec={config.highFreqIntervalSec}
                    lowFreqIntervalSec={config.lowFreqIntervalSec}
                    shiftBufferMinutes={config.shiftBufferMinutes}
                    limits={limits}
                    onChange={handleChange}
                />

                {/* ── Section 3: Background Services (4-column grid) ────── */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                    <AttendanceRulesSection
                        globalMinCheckoutMinutes={config.globalMinCheckoutMinutes}
                        limits={limits}
                        onChange={handleChange}
                    />
                    <TimeSyncConfigSection
                        autoTimeSyncEnabled={config.autoTimeSyncEnabled}
                        timeSyncIntervalSec={config.timeSyncIntervalSec}
                        limits={limits}
                        onChange={handleChange}
                    />
                    <HealthMonitorConfigSection
                        healthCheckEnabled={config.healthCheckEnabled}
                        healthCheckIntervalSec={config.healthCheckIntervalSec}
                        limits={limits}
                        onChange={handleChange}
                    />
                    <LogMaintenanceConfigSection
                        logBufferMaintenanceEnabled={config.logBufferMaintenanceEnabled}
                        logBufferMaintenanceSchedule={config.logBufferMaintenanceSchedule}
                        logBufferMaintenanceHour={config.logBufferMaintenanceHour}
                        limits={limits}
                        onChange={handleChange}
                    />
                </div>

                {/* ── Save Bar ──────────────────────────────────────────── */}
                <div className="flex items-center justify-between bg-white rounded-xl border border-slate-100 shadow-sm px-5 py-3">
                    <div className="text-xs text-slate-400 font-semibold">
                        {isDirty ? (
                            <span className="text-amber-600 flex items-center gap-1.5">
                                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                                Unsaved changes
                            </span>
                        ) : (
                            'All changes saved'
                        )}
                    </div>
                    <div className="flex gap-2">
                        {isDirty && (
                            <Button 
                                type="button" 
                                variant="ghost" 
                                disabled={saving} 
                                onClick={handleDiscard}
                                className="text-xs font-bold h-8 px-4 text-slate-500 hover:text-slate-700"
                            >
                                Discard Changes
                            </Button>
                        )}
                        <Button type="submit" disabled={saving || !isDirty} size="sm" className="text-xs font-bold h-8 px-5">
                            {saving ? (
                                'Saving...'
                            ) : (
                                <><Save className="h-3.5 w-3.5 mr-1.5" /> Save Configuration</>
                            )}
                        </Button>
                    </div>
                </div>
            </form>

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
