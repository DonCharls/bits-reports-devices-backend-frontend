'use client';

import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { DurationInput } from './DurationInput';
import { ShiftTimelineViz } from './ShiftTimelineViz';
import { Zap, Info } from 'lucide-react';

interface ShiftAwareConfigSectionProps {
    defaultIntervalSec: number;
    shiftAwareSyncEnabled: boolean;
    highFreqIntervalSec: number;
    lowFreqIntervalSec: number;
    shiftBufferMinutes: number;
    limits: Record<string, number> | null;
    onChange: (patch: Record<string, unknown>) => void;
}

export function ShiftAwareConfigSection({
    defaultIntervalSec,
    shiftAwareSyncEnabled,
    highFreqIntervalSec,
    lowFreqIntervalSec,
    shiftBufferMinutes,
    limits,
    onChange,
}: ShiftAwareConfigSectionProps) {
    const bufferMin = limits?.SHIFT_BUFFER_MIN ?? 0;
    const bufferMax = limits?.SHIFT_BUFFER_MAX ?? 120;
    const isBufferError = shiftBufferMinutes < bufferMin || shiftBufferMinutes > bufferMax;

    return (
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden">
            {/* ── Header ──────────────────────────────────────────── */}
            <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100">
                <div className="flex items-center gap-2.5">
                    <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-amber-100">
                        <Zap className="h-3.5 w-3.5 text-amber-600" />
                    </div>
                    <div>
                        <h3 className="text-xs font-black text-slate-700 uppercase tracking-widest">
                            Shift-Aware Sync
                        </h3>
                        <p className="text-[10px] text-slate-400 font-semibold">
                            Automatically adjusts polling speed based on shift schedules
                        </p>
                    </div>
                </div>
                <Switch
                    id="shiftAware"
                    checked={shiftAwareSyncEnabled}
                    onCheckedChange={(c: boolean) => onChange({ shiftAwareSyncEnabled: c })}
                />
            </div>

            {/* ── Body ────────────────────────────────────────────── */}
            <div className="px-5 py-4 space-y-5">
                {/* Default Interval (always visible) */}
                <div className="flex flex-col lg:flex-row lg:items-start gap-4">
                    <div className="flex-1">
                        <DurationInput
                            label="Default Sync Interval"
                            description={
                                shiftAwareSyncEnabled
                                    ? "Fallback interval used when shift-aware mode cannot determine peak/off-peak status."
                                    : "How often the system pulls attendance logs from all connected devices (minimum 10s)."
                            }
                            totalSeconds={defaultIntervalSec}
                            minTotalSeconds={limits?.DEFAULT_INTERVAL_MIN_SEC}
                            maxTotalSeconds={limits?.DEFAULT_INTERVAL_MAX_SEC}
                            onChange={(sec) => onChange({ defaultIntervalSec: sec })}
                        />
                    </div>

                    {!shiftAwareSyncEnabled && (
                        <div className="flex items-start gap-2 bg-blue-50 rounded-lg px-3 py-2.5 border border-blue-100 lg:max-w-xs lg:mt-5">
                            <Info className="h-3.5 w-3.5 text-blue-500 mt-0.5 shrink-0" />
                            <p className="text-[10px] text-blue-600 font-medium leading-relaxed">
                                Enable <strong>Shift-Aware Sync</strong> to automatically poll faster during clock-in/clock-out rush hours and slower during quiet periods. This reduces server load while keeping attendance responsive.
                            </p>
                        </div>
                    )}
                </div>

                {/* Shift-Aware Details (conditional) */}
                {shiftAwareSyncEnabled && (
                    <div className="space-y-5 border-t border-slate-100 pt-5">
                        {/* How it works explanation */}
                        <div className="bg-slate-50 rounded-lg px-4 py-3 border border-slate-100">
                            <p className="text-[11px] text-slate-600 font-semibold leading-relaxed">
                                <strong className="text-slate-800">How it works:</strong> The system reads your active shift schedules and creates two &quot;rush hour&quot; windows per shift — one around <strong>clock-in time</strong> and one around <strong>clock-out time</strong>. During these windows, the system polls devices at the <em>Peak Interval</em> for faster attendance capture. Outside these windows, it slows down to the <em>Off-Peak Interval</em> to conserve resources.
                            </p>
                        </div>

                        {/* Timeline Visualization */}
                        <ShiftTimelineViz
                            bufferMinutes={shiftBufferMinutes}
                            enabled={shiftAwareSyncEnabled}
                        />

                        {/* Peak / Off-Peak Intervals */}
                        {shiftAwareSyncEnabled && highFreqIntervalSec > lowFreqIntervalSec && (
                            <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-red-600">
                                <p className="text-xs font-bold flex items-center gap-2">
                                    <Zap className="h-4 w-4" />
                                    Peak Interval ({highFreqIntervalSec}s) must be less than or equal to Off-Peak Interval ({lowFreqIntervalSec}s).
                                </p>
                                <p className="text-[10px] text-red-500 font-medium mt-1">
                                    Peak polling needs to be faster during rush hours, meaning its interval in seconds must be smaller.
                                </p>
                            </div>
                        )}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div className="space-y-1">
                                <DurationInput
                                    label="⚡ Peak Interval"
                                    description="Faster polling during shift start/end rush hours. Captures taps within seconds."
                                    totalSeconds={highFreqIntervalSec}
                                    minTotalSeconds={limits?.HIGH_FREQ_INTERVAL_MIN_SEC}
                                    maxTotalSeconds={limits?.HIGH_FREQ_INTERVAL_MAX_SEC}
                                    onChange={(sec) => onChange({ highFreqIntervalSec: sec })}
                                />
                            </div>
                            <div className="space-y-1">
                                <DurationInput
                                    label="💤 Off-Peak Interval"
                                    description="Slower polling when no shift activity is expected. Saves server resources."
                                    totalSeconds={lowFreqIntervalSec}
                                    minTotalSeconds={limits?.LOW_FREQ_INTERVAL_MIN_SEC}
                                    maxTotalSeconds={limits?.LOW_FREQ_INTERVAL_MAX_SEC}
                                    onChange={(sec) => onChange({ lowFreqIntervalSec: sec })}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="buffer" className={`text-sm font-medium ${isBufferError ? 'text-red-600' : ''}`}>
                                    🕐 Buffer Window
                                </Label>
                                <Input
                                    id="buffer"
                                    type="number"
                                    min={bufferMin}
                                    max={bufferMax}
                                    value={shiftBufferMinutes}
                                    onChange={(e) => {
                                        const raw = parseInt(e.target.value);
                                        onChange({ shiftBufferMinutes: isNaN(raw) ? 0 : raw });
                                    }}
                                    className={`font-mono ${isBufferError ? 'border-red-300 focus-visible:ring-red-200' : ''}`}
                                />
                                {isBufferError ? (
                                    <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-red-600 mt-2">
                                        <p className="text-xs font-bold">
                                            Invalid Buffer
                                        </p>
                                        <p className="text-[10px] text-red-500 font-medium mt-0.5">
                                            Must be between {bufferMin} and {bufferMax} minutes.
                                        </p>
                                    </div>
                                ) : (
                                    <p className="text-[10px] text-slate-400 font-medium leading-relaxed">
                                        Minutes before and after each shift boundary to activate peak mode ({bufferMin} to {bufferMax} min). A 30-minute buffer on an 8:00 AM shift means peak starts at 7:30 AM.
                                    </p>
                                )}
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
