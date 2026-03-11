'use client';

import { ArrowRight, Trash2 } from 'lucide-react';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import type { PaginationUrlConfig, PaginationUrlMode, TimelinePaginationNode } from '@/lib/crawler-types';
import { SelectorInput } from './selector-input';
import { useSelectorPreview, type SelectorTarget } from './use-selector-preview';

interface PaginationNodeCardProps {
    node: TimelinePaginationNode;
    depth: number;
    onUpdate: (patch: Partial<Pick<TimelinePaginationNode, 'selector' | 'maxPages' | 'url'>>) => void;
    onRemove: () => void;
    onSelectorPreviewChange?: (selector: string | null) => void;
    onSelectorTargetChange?: (target: SelectorTarget | null) => void;
    matchCounts?: Record<string, number>;
}

export function PaginationNodeCard({ node, depth, onUpdate, onRemove, onSelectorPreviewChange, onSelectorTargetChange, matchCounts }: PaginationNodeCardProps) {
    const [showUrlConfig, setShowUrlConfig] = useState(node.url !== null);
    const { preview, previewDebounced, clearPreview, setPickTarget, clearPickTarget, getMatchCount } = useSelectorPreview({
        onSelectorPreviewChange,
        onSelectorTargetChange,
        nodeId: node.id,
        matchCounts,
    });

    const toggleUrlConfig = (enabled: boolean) => {
        setShowUrlConfig(enabled);
        if (!enabled) {
            onUpdate({ url: null });
        } else {
            onUpdate({
                url: { mode: 'hybrid', pattern: '', template: '', start_page: 1, step: 1 },
            });
        }
    };

    const updateUrl = (patch: Partial<PaginationUrlConfig>) => {
        if (!node.url) return;
        onUpdate({ url: { ...node.url, ...patch } });
    };

    return (
        <div
            className={`rounded-lg border border-red-500/40 bg-red-500/5 p-2 ${depth > 0 ? 'ml-4' : ''}`}
            onClick={() => preview(node.selector)}
        >
            <div className="flex items-center gap-1.5">
                <ArrowRight className="h-3.5 w-3.5 shrink-0 text-red-500" />
                <span className="text-[10px] font-semibold uppercase tracking-wider text-red-600 dark:text-red-400">
                    Pagination
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
                    placeholder="CSS selektor (tlačítko další)"
                    matchCount={getMatchCount(node.selector)}
                    onPick={() => setPickTarget()}
                />
                <div className="flex items-center gap-2">
                    <span className="text-[11px] text-muted-foreground whitespace-nowrap">Max stránek:</span>
                    <Input
                        type="number"
                        min={1}
                        value={node.maxPages}
                        onChange={(e) => onUpdate({ maxPages: Math.max(1, parseInt(e.target.value) || 1) })}
                        className="h-7 w-20 border-border bg-card/50 text-xs"
                    />
                </div>
                <div className="flex items-center gap-2 py-0.5">
                    <Switch
                        checked={showUrlConfig}
                        onCheckedChange={toggleUrlConfig}
                        className="h-4 w-7"
                    />
                    <span className="text-[11px] text-muted-foreground">URL konfigurace</span>
                </div>
                {showUrlConfig && node.url && (
                    <div className="space-y-1.5 rounded border border-border/50 bg-card/30 p-1.5">
                        <Select
                            value={node.url.mode}
                            onValueChange={(v) => updateUrl({ mode: v as PaginationUrlMode })}
                        >
                            <SelectTrigger className="h-7 border-border bg-card/50 text-xs">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="hybrid">Hybrid</SelectItem>
                                <SelectItem value="url">URL</SelectItem>
                            </SelectContent>
                        </Select>
                        <Input
                            value={node.url.pattern}
                            onChange={(e) => updateUrl({ pattern: e.target.value })}
                            placeholder="Pattern"
                            className="h-7 border-border bg-card/50 text-xs font-mono"
                        />
                        <Input
                            value={node.url.template}
                            onChange={(e) => updateUrl({ template: e.target.value })}
                            placeholder="Template"
                            className="h-7 border-border bg-card/50 text-xs font-mono"
                        />
                        <div className="flex gap-1.5">
                            <div className="flex-1">
                                <span className="text-[10px] text-muted-foreground">Start</span>
                                <Input
                                    type="number"
                                    value={node.url.start_page}
                                    onChange={(e) => updateUrl({ start_page: parseInt(e.target.value) || 1 })}
                                    className="h-7 border-border bg-card/50 text-xs"
                                />
                            </div>
                            <div className="flex-1">
                                <span className="text-[10px] text-muted-foreground">Krok</span>
                                <Input
                                    type="number"
                                    value={node.url.step}
                                    onChange={(e) => updateUrl({ step: parseInt(e.target.value) || 1 })}
                                    className="h-7 border-border bg-card/50 text-xs"
                                />
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
