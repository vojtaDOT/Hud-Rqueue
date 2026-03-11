'use client';

import { Clock, Trash2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { TimelineTimeoutNode } from '@/lib/crawler-types';

interface TimeoutNodeCardProps {
    node: TimelineTimeoutNode;
    depth: number;
    onUpdate: (patch: Partial<Pick<TimelineTimeoutNode, 'ms'>>) => void;
    onRemove: () => void;
}

export function TimeoutNodeCard({ node, depth, onUpdate, onRemove }: TimeoutNodeCardProps) {
    return (
        <div className={`rounded-lg border border-border bg-card/50 p-2 ${depth > 0 ? 'ml-4' : ''}`}>
            <div className="flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5 shrink-0 text-primary" />
                <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Timeout
                </span>
                <div className="flex-1" />
                <Button variant="ghost" size="icon" className="h-5 w-5 text-muted-foreground hover:text-red-500" onClick={onRemove}>
                    <Trash2 className="h-3 w-3" />
                </Button>
            </div>
            <div className="mt-1.5 flex items-center gap-2">
                <span className="text-[11px] text-muted-foreground whitespace-nowrap">Čekat (ms):</span>
                <Input
                    type="number"
                    min={0}
                    step={100}
                    value={node.ms}
                    onChange={(e) => onUpdate({ ms: Math.max(0, parseInt(e.target.value) || 0) })}
                    className="h-7 w-28 border-border bg-card/50 text-xs"
                />
            </div>
        </div>
    );
}
