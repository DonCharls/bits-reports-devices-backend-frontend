'use client';

import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { DurationInput } from './DurationInput';

interface TimeSyncConfigSectionProps {
    autoTimeSyncEnabled: boolean;
    timeSyncIntervalSec: number;
    onChange: (patch: Record<string, unknown>) => void;
}

export function TimeSyncConfigSection({
    autoTimeSyncEnabled,
    timeSyncIntervalSec,
    onChange,
}: TimeSyncConfigSectionProps) {
    return (
        <div className="space-y-4 rounded-md border p-4 bg-muted/20 md:col-span-2">
            <div className="flex items-center justify-between">
                <Label htmlFor="autoTimeSync" className="font-semibold text-primary">Automated Time Sync</Label>
                <Switch 
                    id="autoTimeSync" 
                    checked={autoTimeSyncEnabled}
                    onCheckedChange={(c: boolean) => onChange({ autoTimeSyncEnabled: c })} 
                />
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
                Periodically synchronizes the Real-Time Clocks (RTC) on all ZKTeco devices with the server to prevent attendance log timestamp drift.
            </p>
            
            {autoTimeSyncEnabled && (
                <div className="space-y-4 pt-2 border-t mt-4">
                    <div className="w-full md:w-1/2">
                        <DurationInput
                            label="Clock Alignment Interval"
                            description="How often to correct device clocks (recommended: 1 to 24 hours)."
                            totalSeconds={timeSyncIntervalSec}
                            onChange={(sec) => onChange({ timeSyncIntervalSec: sec })}
                        />
                    </div>
                </div>
            )}
        </div>
    );
}
