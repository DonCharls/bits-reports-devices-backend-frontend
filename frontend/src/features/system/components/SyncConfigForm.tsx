'use client';

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Settings, AlertTriangle } from 'lucide-react';
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

export function SyncConfigForm() {
    const { config, setConfig, loading, saving, isDirty, showIntervalWarning, setShowIntervalWarning, saveConfig, handleSubmit } = useSyncConfig();

    if (loading) return <div>Loading configuration...</div>;
    if (!config) return <div>Error loading configuration.</div>;

    const handleChange = (patch: Record<string, unknown>) => setConfig({ ...config, ...patch });

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
                            <ShiftAwareConfigSection
                                defaultIntervalSec={config.defaultIntervalSec}
                                shiftAwareSyncEnabled={config.shiftAwareSyncEnabled}
                                highFreqIntervalSec={config.highFreqIntervalSec}
                                lowFreqIntervalSec={config.lowFreqIntervalSec}
                                shiftBufferMinutes={config.shiftBufferMinutes}
                                onChange={handleChange}
                            />
                            <TimeSyncConfigSection
                                autoTimeSyncEnabled={config.autoTimeSyncEnabled}
                                timeSyncIntervalSec={config.timeSyncIntervalSec}
                                onChange={handleChange}
                            />
                            <AttendanceRulesSection
                                globalMinCheckoutMinutes={config.globalMinCheckoutMinutes}
                                onChange={handleChange}
                            />
                            <HealthMonitorConfigSection
                                healthCheckEnabled={config.healthCheckEnabled}
                                healthCheckIntervalSec={config.healthCheckIntervalSec}
                                onChange={handleChange}
                            />
                            <LogMaintenanceConfigSection
                                logBufferMaintenanceEnabled={config.logBufferMaintenanceEnabled}
                                logBufferMaintenanceSchedule={config.logBufferMaintenanceSchedule}
                                logBufferMaintenanceHour={config.logBufferMaintenanceHour}
                                onChange={handleChange}
                            />
                        </div>

                        <div className="flex justify-end mt-4 pt-4 border-t">
                            <Button type="submit" disabled={saving || !isDirty}>
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
