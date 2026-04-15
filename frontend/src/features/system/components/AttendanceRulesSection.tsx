'use client';

import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';

interface AttendanceRulesSectionProps {
    globalMinCheckoutMinutes: number;
    onChange: (patch: Record<string, unknown>) => void;
}

export function AttendanceRulesSection({
    globalMinCheckoutMinutes,
    onChange,
}: AttendanceRulesSectionProps) {
    return (
        <div className="space-y-4 rounded-md border p-4 bg-muted/20 md:col-span-2">
            <div className="flex items-center justify-between">
                <Label className="font-semibold text-primary">Attendance Logic Settings</Label>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
                Configure global rules for how check-ins and check-outs are processed.
            </p>
            
            <div className="space-y-4 pt-2 border-t mt-4">
                <div className="w-full md:w-1/2 space-y-2">
                    <Label htmlFor="globalMinCheckoutMinutes" className="text-sm font-medium">Global Minimum Checkout (mins)</Label>
                    <Input 
                        id="globalMinCheckoutMinutes" 
                        type="number" 
                        min={15}
                        value={globalMinCheckoutMinutes}
                        onChange={(e) => {
                            const raw = parseInt(e.target.value) || 0;
                            onChange({ globalMinCheckoutMinutes: raw });
                        }}
                    />
                    <p className="text-[10px] text-muted-foreground">Minimum time required before an employee can check out. Enforced at 15 minutes minimum.</p>
                </div>
            </div>
        </div>
    );
}
