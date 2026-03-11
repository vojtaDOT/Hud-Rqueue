'use client';

import { MousePointerClick, Trash2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { TimelineClickNode } from '@/lib/crawler-types';
import { SelectorInput } from './selector-input';
import { useSelectorPreview, type SelectorTarget } from './use-selector-preview';

interface ClickNodeCardProps {
    node: TimelineClickNode;
    depth: number;
    onUpdate: (patch: Partial<Pick<TimelineClickNode, 'selector' | 'waitAfterMs'>>) => void;
    onRemove: () => void;
    onSelectorPreviewChange?: (selector: string | null) => void;
    onSelectorTargetChange?: (target: SelectorTarget | null) => void;
    matchCounts?: Record<string, number>;
}

export function ClickNodeCard({ node, depth, onUpdate, onRemove, onSelectorPreviewChange, onSelectorTargetChange, matchCounts }: ClickNodeCardProps) {
    const { preview, previewDebounced, clearPreview, setPickTarget, clearPickTarget, getMatchCount } = useSelectorPreview({
        onSelectorPreviewChange,
        onSelectorTargetChange,
        nodeId: node.id,
        matchCounts,
    });

    return (
        <div
            className={`rounded-lg border border-border bg-card/50 p-2 ${depth > 0 ? 'ml-4' : ''}`}
            onClick={() => preview(node.selector)}
        >
            <div className="flex items-center gap-1.5">
                <MousePointerClick className="h-3.5 w-3.5 shrink-0 text-primary" />
                <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Click
                </span>
                <div className="flex-1" />
                <Button variant="ghost" size="icon" className="h-5 w-5 text-muted-foreground hover:text-red-500" onClick={onRemove}>
                    <Trash2 className="h-3 w-3" />
                </Button>
            </div>
            <div className="mt-1.5 space-y-1.5">
                <SelectorInput
                    value={node.selector}
                    onChange={(v) => {
                        onUpdate({ selector: v });
                        previewDebounced(v);
                    }}
                    onFocus={() => {
                        preview(node.selector);
                        setPickTarget();
                    }}
                    onBlur={() => {
                        clearPreview();
                        clearPickTarget();
                    }}
                    matchCount={getMatchCount(node.selector)}
                    onPick={() => setPickTarget()}
                />
                <div className="flex items-center gap-2">
                    <span className="text-[11px] text-muted-foreground whitespace-nowrap">Čekat po (ms):</span>
                    <Input
                        type="number"
                        min={0}
                        step={100}
                        value={node.waitAfterMs}
                        onChange={(e) => onUpdate({ waitAfterMs: Math.max(0, parseInt(e.target.value) || 0) })}
                        className="h-7 w-24 border-border bg-card/50 text-xs"
                    />
                </div>
            </div>
        </div>
    );
}
