'use client';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface DurationInputProps {
    label: string;
    description?: string;
    totalSeconds: number;
    onChange: (sec: number) => void;
}

export function DurationInput({ label, description, totalSeconds, onChange }: DurationInputProps) {
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    const update = (h: number, m: number, s: number) => {
        const validH = Math.max(0, h || 0);
        const validM = Math.max(0, m || 0);
        const validS = Math.max(0, s || 0);
        onChange(validH * 3600 + validM * 60 + validS);
    };

    return (
        <div className="space-y-3 w-full max-w-[320px]">
            <Label className="text-sm font-medium">{label}</Label>
            <div className="flex items-center justify-between gap-2 w-full">
                <div className="flex-1 flex flex-col gap-1">
                    <Input 
                        type="number" 
                        min={0} 
                        value={hours || ''} 
                        placeholder="0"
                        className="text-center [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                        onChange={(e) => update(parseInt(e.target.value), minutes, seconds)} 
                    />
                    <span className="text-[10px] text-muted-foreground text-center font-medium uppercase tracking-wider">Hrs</span>
                </div>
                <span className="font-bold pb-4 text-muted-foreground">:</span>
                <div className="flex-1 flex flex-col gap-1">
                    <Input 
                        type="number" 
                        min={0} 
                        max={59} 
                        value={minutes || ''} 
                        placeholder="0"
                        className="text-center [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                        onChange={(e) => update(hours, parseInt(e.target.value), seconds)} 
                    />
                    <span className="text-[10px] text-muted-foreground text-center font-medium uppercase tracking-wider">Min</span>
                </div>
                <span className="font-bold pb-4 text-muted-foreground">:</span>
                <div className="flex-1 flex flex-col gap-1">
                    <Input 
                        type="number" 
                        min={0} 
                        max={59} 
                        value={seconds || ''} 
                        placeholder="0"
                        className="text-center [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                        onChange={(e) => update(hours, minutes, parseInt(e.target.value))} 
                    />
                    <span className="text-[10px] text-muted-foreground text-center font-medium uppercase tracking-wider">Sec</span>
                </div>
            </div>
            {description && <p className="text-xs text-muted-foreground leading-relaxed pt-1">{description}</p>}
        </div>
    );
}
