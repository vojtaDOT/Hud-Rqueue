'use client';

import { Crosshair } from 'lucide-react';

import { Input } from '@/components/ui/input';

interface SelectorInputProps {
    value: string;
    onChange: (value: string) => void;
    onFocus?: () => void;
    onBlur?: () => void;
    placeholder?: string;
    matchCount?: number;
    onPick?: () => void;
    disabled?: boolean;
}

/** Selector input with inline match-count badge and pick-from-preview button. */
export function SelectorInput({ value, onChange, onFocus, onBlur, placeholder, matchCount, onPick, disabled = false }: SelectorInputProps) {
    return (
        <div className="relative">
            <Input
                value={value}
                onChange={(e) => onChange(e.target.value)}
                onFocus={onFocus}
                onBlur={onBlur}
                disabled={disabled}
                placeholder={placeholder ?? 'CSS selektor'}
                className="h-7 border-border bg-card/50 text-xs font-mono pr-14"
            />
            <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-0.5">
                {matchCount !== undefined && (
                    <span className="text-[10px] tabular-nums text-muted-foreground min-w-[1.25rem] text-center">
                        {matchCount}
                    </span>
                )}
                {onPick && (
                    <button
                        type="button"
                        className="inline-flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:text-primary"
                        onClick={(e) => {
                            e.stopPropagation();
                            if (disabled) return;
                            onPick();
                        }}
                        title="Vybrat element z preview"
                    >
                        <Crosshair className="h-3 w-3" />
                    </button>
                )}
            </div>
        </div>
    );
}
