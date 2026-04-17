'use client';

import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { ShieldCheck } from 'lucide-react';

interface AttendanceRulesSectionProps {
    globalMinCheckoutMinutes: number;
    onChange: (patch: Record<string, unknown>) => void;
}

function formatMinutesHuman(mins: number): string {
    if (mins < 60) return `${mins} min`;
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    if (m === 0) return `${h}h`;
    return `${h}h ${m}m`;
}

export function AttendanceRulesSection({
    globalMinCheckoutMinutes,
    onChange,
}: AttendanceRulesSectionProps) {
    return (
        <div className="bg-white rounded-xl border border-slate-100 shadow-sm overflow-hidden flex flex-col">
            {/* Header */}
            <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-100">
                <div className="flex items-center justify-center w-6 h-6 rounded-md bg-rose-100">
                    <ShieldCheck className="h-3 w-3 text-rose-600" />
                </div>
                <h3 className="text-[10px] font-black text-slate-600 uppercase tracking-widest">Attendance Rules</h3>
            </div>

            {/* Body */}
            <div className="px-4 py-3 flex-1 space-y-3">
                <p className="text-[10px] text-slate-400 font-medium leading-relaxed">
                    Prevents accidental double-taps from being treated as a check-out. An employee must wait at least this long after check-in before a tap counts as check-out.
                </p>

                <div className="space-y-1.5">
                    <Label htmlFor="globalMinCheckoutMinutes" className="text-xs font-semibold text-slate-600">
                        Minimum Checkout Gap
                    </Label>
                    <div className="flex items-center gap-2">
                        <Input
                            id="globalMinCheckoutMinutes"
                            type="number"
                            min={15}
                            value={globalMinCheckoutMinutes}
                            onChange={(e) => {
                                const raw = parseInt(e.target.value) || 0;
                                onChange({ globalMinCheckoutMinutes: raw });
                            }}
                            className="w-20 text-center"
                        />
                        <span className="text-xs text-slate-400 font-semibold">minutes</span>
                    </div>
                    <p className="text-[10px] text-slate-400 font-medium">
                        Currently: <strong className="text-slate-600">{formatMinutesHuman(globalMinCheckoutMinutes)}</strong> • Minimum: 15 min
                    </p>
                </div>
            </div>
        </div>
    );
}
