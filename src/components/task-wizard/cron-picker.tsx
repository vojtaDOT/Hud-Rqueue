'use client';

import * as React from 'react';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

interface CronPickerProps {
    value: string;
    onChange: (cron: string) => void;
}

const PRESETS = [
    { label: 'Every hour', cron: '0 * * * *' },
    { label: 'Every 6h', cron: '0 */6 * * *' },
    { label: 'Every 12h', cron: '0 */12 * * *' },
    { label: 'Daily', cron: '0 0 * * *' },
    { label: 'Weekly', cron: '0 0 * * 0' },
    { label: 'Monthly', cron: '0 0 1 * *' },
];

const MINUTES = [
    { label: '0', value: '0' },
    { label: '15', value: '15' },
    { label: '30', value: '30' },
    { label: '45', value: '45' },
];

const HOURS = Array.from({ length: 24 }, (_, i) => ({
    label: String(i).padStart(2, '0'),
    value: String(i),
}));

const DAYS_OF_WEEK = [
    { label: 'Sun', value: '0' },
    { label: 'Mon', value: '1' },
    { label: 'Tue', value: '2' },
    { label: 'Wed', value: '3' },
    { label: 'Thu', value: '4' },
    { label: 'Fri', value: '5' },
    { label: 'Sat', value: '6' },
];

function parseCron(cron: string) {
    const parts = cron.trim().split(/\s+/);
    if (parts.length !== 5) return { minute: '*', hour: '*', dayOfMonth: '*', month: '*', dayOfWeek: '*' };
    return {
        minute: parts[0],
        hour: parts[1],
        dayOfMonth: parts[2],
        month: parts[3],
        dayOfWeek: parts[4],
    };
}

function buildCron(fields: { minute: string; hour: string; dayOfMonth: string; month: string; dayOfWeek: string }) {
    return `${fields.minute} ${fields.hour} ${fields.dayOfMonth} ${fields.month} ${fields.dayOfWeek}`;
}

function describeCron(cron: string): string {
    if (!cron || cron.trim() === '') return 'Not set';
    const preset = PRESETS.find((p) => p.cron === cron);
    if (preset) return preset.label;
    const { minute, hour, dayOfMonth, dayOfWeek } = parseCron(cron);
    const parts: string[] = [];
    if (minute === '*' && hour === '*') parts.push('Every minute');
    else if (hour.startsWith('*/')) parts.push(`Every ${hour.slice(2)} hours`);
    else if (minute !== '*' && hour === '*') parts.push(`At minute ${minute} of every hour`);
    else if (minute !== '*' && hour !== '*') parts.push(`At ${hour.padStart(2, '0')}:${minute.padStart(2, '0')}`);
    else parts.push(`Minute ${minute}, hour ${hour}`);
    if (dayOfMonth !== '*') parts.push(`on day ${dayOfMonth}`);
    if (dayOfWeek !== '*') {
        const day = DAYS_OF_WEEK.find((d) => d.value === dayOfWeek);
        parts.push(day ? `on ${day.label}` : `on weekday ${dayOfWeek}`);
    }
    return parts.join(' ');
}

const selectClass = 'flex h-8 rounded-md border border-input bg-background px-2 py-1 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring';

export function CronPicker({ value, onChange }: CronPickerProps) {
    const [mode, setMode] = React.useState<'preset' | 'custom'>(
        value && !PRESETS.some((p) => p.cron === value) && value !== '' ? 'custom' : 'preset'
    );
    const fields = parseCron(value || '* * * * *');

    const updateField = (field: keyof ReturnType<typeof parseCron>, val: string) => {
        const next = { ...fields, [field]: val };
        onChange(buildCron(next));
    };

    return (
        <div className="space-y-3">
            {/* Mode toggle */}
            <div className="flex rounded-md border p-0.5 gap-0.5 w-fit">
                {(['preset', 'custom'] as const).map((m) => (
                    <button
                        key={m}
                        type="button"
                        onClick={() => setMode(m)}
                        className={cn(
                            'px-2.5 py-1 rounded text-xs font-medium transition-all capitalize',
                            mode === m
                                ? 'bg-primary text-primary-foreground shadow-sm'
                                : 'text-muted-foreground hover:text-foreground'
                        )}
                    >
                        {m}
                    </button>
                ))}
            </div>

            {mode === 'preset' ? (
                <div className="flex flex-wrap gap-1.5">
                    {PRESETS.map((p) => (
                        <button
                            key={p.cron}
                            type="button"
                            onClick={() => onChange(p.cron)}
                            className={cn(
                                'px-3 py-1.5 rounded-lg border text-xs font-medium transition-all',
                                value === p.cron
                                    ? 'border-primary bg-primary/10 text-primary'
                                    : 'border-border hover:bg-muted/50 text-muted-foreground hover:text-foreground'
                            )}
                        >
                            {p.label}
                        </button>
                    ))}
                    <button
                        type="button"
                        onClick={() => onChange('')}
                        className={cn(
                            'px-3 py-1.5 rounded-lg border text-xs font-medium transition-all',
                            !value || value === ''
                                ? 'border-primary bg-primary/10 text-primary'
                                : 'border-border hover:bg-muted/50 text-muted-foreground hover:text-foreground'
                        )}
                    >
                        None
                    </button>
                </div>
            ) : (
                <div className="space-y-3">
                    <div className="grid grid-cols-5 gap-2">
                        <div className="space-y-1">
                            <Label className="text-[10px] text-muted-foreground uppercase tracking-wider">Min</Label>
                            <select value={fields.minute} onChange={(e) => updateField('minute', e.target.value)} className={selectClass}>
                                <option value="*">*</option>
                                {MINUTES.map((m) => (
                                    <option key={m.value} value={m.value}>{m.label}</option>
                                ))}
                                {Array.from({ length: 60 }, (_, i) => i).filter((i) => ![0, 15, 30, 45].includes(i)).map((i) => (
                                    <option key={i} value={String(i)}>{i}</option>
                                ))}
                            </select>
                        </div>
                        <div className="space-y-1">
                            <Label className="text-[10px] text-muted-foreground uppercase tracking-wider">Hour</Label>
                            <select value={fields.hour} onChange={(e) => updateField('hour', e.target.value)} className={selectClass}>
                                <option value="*">*</option>
                                <option value="*/2">*/2</option>
                                <option value="*/4">*/4</option>
                                <option value="*/6">*/6</option>
                                <option value="*/12">*/12</option>
                                {HOURS.map((h) => (
                                    <option key={h.value} value={h.value}>{h.label}</option>
                                ))}
                            </select>
                        </div>
                        <div className="space-y-1">
                            <Label className="text-[10px] text-muted-foreground uppercase tracking-wider">Day</Label>
                            <select value={fields.dayOfMonth} onChange={(e) => updateField('dayOfMonth', e.target.value)} className={selectClass}>
                                <option value="*">*</option>
                                {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
                                    <option key={d} value={String(d)}>{d}</option>
                                ))}
                            </select>
                        </div>
                        <div className="space-y-1">
                            <Label className="text-[10px] text-muted-foreground uppercase tracking-wider">Month</Label>
                            <select value={fields.month} onChange={(e) => updateField('month', e.target.value)} className={selectClass}>
                                <option value="*">*</option>
                                {['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'].map((m, i) => (
                                    <option key={i + 1} value={String(i + 1)}>{m}</option>
                                ))}
                            </select>
                        </div>
                        <div className="space-y-1">
                            <Label className="text-[10px] text-muted-foreground uppercase tracking-wider">Wday</Label>
                            <select value={fields.dayOfWeek} onChange={(e) => updateField('dayOfWeek', e.target.value)} className={selectClass}>
                                <option value="*">*</option>
                                {DAYS_OF_WEEK.map((d) => (
                                    <option key={d.value} value={d.value}>{d.label}</option>
                                ))}
                            </select>
                        </div>
                    </div>
                </div>
            )}

            {/* Preview */}
            <div className="flex items-center gap-2 text-xs">
                <span className="text-muted-foreground">Schedule:</span>
                <span className="font-medium">{describeCron(value)}</span>
                {value && (
                    <code className="ml-auto text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded font-mono">
                        {value}
                    </code>
                )}
            </div>
        </div>
    );
}
