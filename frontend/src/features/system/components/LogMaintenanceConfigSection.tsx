'use client';

import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';

interface LogMaintenanceConfigSectionProps {
    logBufferMaintenanceEnabled: boolean;
    logBufferMaintenanceSchedule: 'daily' | 'weekly' | 'monthly';
    logBufferMaintenanceHour: number;
    onChange: (patch: Record<string, unknown>) => void;
}

export function LogMaintenanceConfigSection({
    logBufferMaintenanceEnabled,
    logBufferMaintenanceSchedule,
    logBufferMaintenanceHour,
    onChange,
}: LogMaintenanceConfigSectionProps) {
    return (
        <div className="space-y-4 rounded-md border p-4 bg-muted/20 md:col-span-2">
            <div className="flex items-center justify-between">
                <Label htmlFor="logBufferMaintenance" className="font-semibold text-primary">Log Buffer Maintenance</Label>
                <Switch 
                    id="logBufferMaintenance" 
                    checked={logBufferMaintenanceEnabled}
                    onCheckedChange={(c: boolean) => onChange({ logBufferMaintenanceEnabled: c })} 
                />
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
                Safely clears device memory to prevent it from filling up. Runs exclusively during off-hours to prevent race conditions and data loss during active scans.
            </p>
            
            {logBufferMaintenanceEnabled && (
                <div className="space-y-4 pt-2 border-t mt-4 flex flex-col md:flex-row gap-6">
                    <div className="flex flex-col gap-2 w-full md:w-1/2">
                        <Label htmlFor="maintenanceSchedule" className="text-sm font-medium">Schedule</Label>
                        <select
                            id="maintenanceSchedule"
                            className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                            value={logBufferMaintenanceSchedule}
                            onChange={(e) => onChange({ logBufferMaintenanceSchedule: e.target.value as 'daily' | 'weekly' | 'monthly' })}
                        >
                            <option value="daily">Daily</option>
                            <option value="weekly">Weekly (Sundays)</option>
                            <option value="monthly">Monthly (1st of month)</option>
                        </select>
                        <p className="text-[10px] text-muted-foreground">How often the log buffer wipe runs.</p>
                    </div>

                    <div className="flex flex-col gap-2 w-full md:w-1/2">
                        <Label htmlFor="maintenanceHour" className="text-sm font-medium">Time of Day (Hour PHT)</Label>
                        <Input 
                            id="maintenanceHour" 
                            type="number" 
                            min={0}
                            max={23}
                            value={logBufferMaintenanceHour}
                            onChange={(e) => {
                                const raw = parseInt(e.target.value) || 0;
                                const clamped = Math.min(23, Math.max(0, raw));
                                onChange({ logBufferMaintenanceHour: clamped });
                            }}
                        />
                        <p className="text-[10px] text-muted-foreground">0 = Midnight, 3 = 3:00 AM, 23 = 11:00 PM.</p>
                    </div>
                </div>
            )}
        </div>
    );
}
