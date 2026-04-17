'use client';

import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { DurationInput } from './DurationInput';
import { Timer } from 'lucide-react';

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
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
                <div className="flex items-center gap-2">
                    <div className="flex items-center justify-center w-6 h-6 rounded-md bg-indigo-100">
                        <Timer className="h-3 w-3 text-indigo-600" />
                    </div>
                    <h3 className="text-[10px] font-black text-slate-600 uppercase tracking-widest">Clock Alignment</h3>
                </div>
                <Switch
                    id="autoTimeSync"
                    checked={autoTimeSyncEnabled}
                    onCheckedChange={(c: boolean) => onChange({ autoTimeSyncEnabled: c })}
                />
            </div>

            {/* Body */}
            <div className="px-4 py-3 flex-1">
                <p className="text-[10px] text-slate-400 font-medium leading-relaxed mb-3">
                    Periodically syncs device clocks to the server. Prevents timestamp drift that causes attendance logs to record the wrong time.
                </p>

                {autoTimeSyncEnabled && (
                    <DurationInput
                        label="Sync Interval"
                        description="How often to correct device clocks (recommended: 1–24 hours)."
                        totalSeconds={timeSyncIntervalSec}
                        onChange={(sec) => onChange({ timeSyncIntervalSec: sec })}
                    />
                )}
            </div>
        </div>
    );
}
