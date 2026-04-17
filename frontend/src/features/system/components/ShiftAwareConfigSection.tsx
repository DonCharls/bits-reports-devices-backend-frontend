'use client';

import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { DurationInput } from './DurationInput';

interface ShiftAwareConfigSectionProps {
    defaultIntervalSec: number;
    shiftAwareSyncEnabled: boolean;
    highFreqIntervalSec: number;
    lowFreqIntervalSec: number;
    shiftBufferMinutes: number;
    onChange: (patch: Record<string, unknown>) => void;
}

export function ShiftAwareConfigSection({
    defaultIntervalSec,
    shiftAwareSyncEnabled,
    highFreqIntervalSec,
    lowFreqIntervalSec,
    shiftBufferMinutes,
    onChange,
}: ShiftAwareConfigSectionProps) {
    return (
        <>
            <div className="space-y-3 pt-4">
                <DurationInput
                    label="Default Sync Interval"
                    description="How often the system pulls logs from the device (minimum 5s)."
                    totalSeconds={defaultIntervalSec}
                    onChange={(sec) => onChange({ defaultIntervalSec: sec })}
                />
            </div>
            
            <div className="space-y-4 rounded-md border p-4 bg-muted/20">
                <div className="flex items-center justify-between">
                    <Label htmlFor="shiftAware" className="font-semibold text-primary">Enable Shift-Aware Sync</Label>
                    <Switch 
                        id="shiftAware" 
                        checked={shiftAwareSyncEnabled}
                        onCheckedChange={(c: boolean) => onChange({ shiftAwareSyncEnabled: c })} 
                    />
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                    When enabled, the sync interval automatically adjusts based on employee shifts. 
                    High frequency during active shift windows, low frequency when no one is expected.
                </p>
                
                {shiftAwareSyncEnabled && (
                    <div className="space-y-4 pt-2 border-t mt-4">
                         <div className="flex flex-col gap-6">
                            <div className="space-y-2">
                                <DurationInput
                                    label="Peak Interval"
                                    totalSeconds={highFreqIntervalSec}
                                    onChange={(sec) => onChange({ highFreqIntervalSec: sec })}
                                />
                            </div>
                            <div className="space-y-2">
                                <DurationInput
                                    label="Off-Peak Interval"
                                    totalSeconds={lowFreqIntervalSec}
                                    onChange={(sec) => onChange({ lowFreqIntervalSec: sec })}
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
                                    value={shiftBufferMinutes}
                                    onChange={(e) => {
                                        const raw = parseInt(e.target.value) || 0;
                                        const clamped = Math.min(120, Math.max(0, raw));
                                        onChange({ shiftBufferMinutes: clamped });
                                    }}
                                />
                            <p className="text-[10px] text-muted-foreground">Maximum limit: 120 minutes (2 hours).</p>
                         </div>
                    </div>
                )}
            </div>
        </>
    );
}
