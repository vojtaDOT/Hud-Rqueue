'use client';

import { ChevronDown, ChevronRight, Repeat, Trash2 } from 'lucide-react';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import type { TimelineRepeaterNode } from '@/lib/crawler-types';
import { SelectorInput } from './selector-input';
import { useSelectorPreview, type SelectorTarget } from './use-selector-preview';

interface RepeaterNodeCardProps {
    node: TimelineRepeaterNode;
    depth: number;
    onUpdate: (patch: Partial<Pick<TimelineRepeaterNode, 'selector' | 'label' | 'createSourceUrls'>>) => void;
    onRemove: () => void;
    onSelectorPreviewChange?: (selector: string | null) => void;
    onSelectorTargetChange?: (target: SelectorTarget | null) => void;
    matchCounts?: Record<string, number>;
    children: React.ReactNode;
}

export function RepeaterNodeCard({ node, depth, onUpdate, onRemove, onSelectorPreviewChange, onSelectorTargetChange, matchCounts, children }: RepeaterNodeCardProps) {
    const [collapsed, setCollapsed] = useState(false);
    const { preview, previewDebounced, clearPreview, setPickTarget, clearPickTarget, getMatchCount } = useSelectorPreview({
        onSelectorPreviewChange,
        onSelectorTargetChange,
        nodeId: node.id,
        matchCounts,
    });

    return (
        <div
            className={`rounded-lg border border-amber-500/40 bg-amber-500/5 p-2 ${depth > 0 ? 'ml-4' : ''}`}
            onClick={(e) => { if (e.target === e.currentTarget) preview(node.selector); }}
        >
            <div className="flex items-center gap-1.5">
                <Button
                    variant="ghost"
                    size="icon"
                    className="h-5 w-5 shrink-0 text-muted-foreground"
                    onClick={() => setCollapsed(!collapsed)}
                >
                    {collapsed ? <ChevronRight className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                </Button>
                <Repeat className="h-3.5 w-3.5 shrink-0 text-amber-500" />
                <span className="text-[10px] font-semibold uppercase tracking-wider text-amber-600 dark:text-amber-400">
                    Repeater
                </span>
                <div className="flex-1" />
                <Button variant="ghost" size="icon" className="h-5 w-5 text-muted-foreground hover:text-red-500" onClick={onRemove}>
                    <Trash2 className="h-3 w-3" />
                </Button>
            </div>
            {!collapsed && (
                <div className="mt-2 space-y-1.5">
                    <Input
                        value={node.label}
                        onChange={(e) => onUpdate({ label: e.target.value })}
                        placeholder="Label (nepovinný)"
                        className="h-7 border-border bg-card/50 text-xs"
                    />
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
                    <div className="flex items-center gap-2 py-1">
                        <Switch
                            checked={node.createSourceUrls}
                            onCheckedChange={(checked) => onUpdate({ createSourceUrls: checked })}
                            className="h-4 w-7"
                        />
                        <span className="text-[11px] text-muted-foreground">
                            Vytvářet source URL
                        </span>
                    </div>
                    <div className="mt-2 space-y-1.5">
                        {children}
                    </div>
                </div>
            )}
        </div>
    );
}
