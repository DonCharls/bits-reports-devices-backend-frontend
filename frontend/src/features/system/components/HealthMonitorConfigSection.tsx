'use client';

import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { DurationInput } from './DurationInput';

interface HealthMonitorConfigSectionProps {
    healthCheckEnabled: boolean;
    healthCheckIntervalSec: number;
    onChange: (patch: Record<string, unknown>) => void;
}

export function HealthMonitorConfigSection({
    healthCheckEnabled,
    healthCheckIntervalSec,
    onChange,
}: HealthMonitorConfigSectionProps) {
    return (
        <div className="space-y-4 rounded-md border p-4 bg-muted/20 md:col-span-2">
            <div className="flex items-center justify-between">
                <Label htmlFor="healthCheck" className="font-semibold text-primary">Device Health Monitoring</Label>
                <Switch 
                    id="healthCheck" 
                    checked={healthCheckEnabled}
                    onCheckedChange={(c: boolean) => onChange({ healthCheckEnabled: c })} 
                />
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
                Continuously monitors device connectivity with lightweight TCP pings, independent of the data sync schedule. 
                Ensures accurate online/offline status even when data sync is disabled or set to a long interval.
            </p>
            
            {healthCheckEnabled && (
                <div className="space-y-4 pt-2 border-t mt-4">
                    <div className="w-full md:w-1/2">
                        <DurationInput
                            label="Health Check Interval"
                            description="How often to verify device connectivity (minimum 15s, recommended: 30–60s)."
                            totalSeconds={healthCheckIntervalSec}
                            onChange={(sec) => onChange({ healthCheckIntervalSec: sec })}
                        />
                    </div>
                </div>
            )}
        </div>
    );
}
