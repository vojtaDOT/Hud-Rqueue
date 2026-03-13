'use client';

import { Camera, Clock, Code, Eraser, Globe, List, MousePointerClick, Pencil, Search, Trash2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import type {
    TimelineClickNode,
    TimelineFillNode,
    TimelineJavascriptNode,
    TimelineRemoveElementNode,
    TimelineScreenshotNode,
    TimelineScrollNode,
    TimelineSelectOptionNode,
    TimelineTimeoutNode,
    TimelineWaitNetworkNode,
    TimelineWaitSelectorNode,
} from '@/lib/crawler-types';
import { SelectorInput } from './selector-input';
import { useSelectorPreview, type SelectorTarget } from './use-selector-preview';

type BeforeNode =
    | TimelineRemoveElementNode
    | TimelineWaitSelectorNode
    | TimelineWaitNetworkNode
    | TimelineClickNode
    | TimelineScrollNode
    | TimelineFillNode
    | TimelineSelectOptionNode
    | TimelineTimeoutNode
    | TimelineJavascriptNode
    | TimelineScreenshotNode;

interface BeforeActionNodeCardProps {
    node: BeforeNode;
    depth: number;
    onUpdate: (patch: Partial<BeforeNode>) => void;
    onRemove: () => void;
    onSelectorPreviewChange?: (selector: string | null) => void;
    onSelectorTargetChange?: (target: SelectorTarget | null) => void;
    matchCounts?: Record<string, number>;
}

function getHeader(node: BeforeNode) {
    switch (node.type) {
        case 'remove_element':
            return { label: 'Remove Element', icon: <Eraser className="h-3.5 w-3.5 shrink-0 text-primary" /> };
        case 'wait_selector':
            return { label: 'Wait Selector', icon: <Search className="h-3.5 w-3.5 shrink-0 text-primary" /> };
        case 'wait_network':
            return { label: 'Wait Network', icon: <Globe className="h-3.5 w-3.5 shrink-0 text-primary" /> };
        case 'click':
            return { label: 'Click', icon: <MousePointerClick className="h-3.5 w-3.5 shrink-0 text-primary" /> };
        case 'scroll':
            return { label: 'Scroll', icon: <Clock className="h-3.5 w-3.5 shrink-0 text-primary" /> };
        case 'fill':
            return { label: 'Fill', icon: <Pencil className="h-3.5 w-3.5 shrink-0 text-primary" /> };
        case 'select_option':
            return { label: 'Select Option', icon: <List className="h-3.5 w-3.5 shrink-0 text-primary" /> };
        case 'timeout':
            return { label: 'Wait Timeout', icon: <Clock className="h-3.5 w-3.5 shrink-0 text-primary" /> };
        case 'javascript':
            return { label: 'Evaluate', icon: <Code className="h-3.5 w-3.5 shrink-0 text-primary" /> };
        case 'screenshot':
            return { label: 'Screenshot', icon: <Camera className="h-3.5 w-3.5 shrink-0 text-primary" /> };
    }
}

export function BeforeActionNodeCard({
    node,
    depth,
    onUpdate,
    onRemove,
    onSelectorPreviewChange,
    onSelectorTargetChange,
    matchCounts,
}: BeforeActionNodeCardProps) {
    const { label, icon } = getHeader(node);
    const {
        preview,
        previewDebounced,
        clearPreview,
        setPickTarget,
        clearPickTarget,
        getMatchCount,
    } = useSelectorPreview({
        onSelectorPreviewChange,
        onSelectorTargetChange,
        nodeId: node.id,
        matchCounts,
    });

    const selectorValue = 'selector' in node ? node.selector : null;

    return (
        <div
            className={`rounded-lg border border-border bg-card/50 p-2 ${depth > 0 ? 'ml-4' : ''}`}
            onClick={() => preview(selectorValue)}
        >
            <div className="flex items-center gap-1.5">
                {icon}
                <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {label}
                </span>
                <div className="flex-1" />
                <Button variant="ghost" size="icon" className="h-5 w-5 text-muted-foreground hover:text-red-500" onClick={onRemove}>
                    <Trash2 className="h-3 w-3" />
                </Button>
            </div>
            <div className="mt-1.5 space-y-1.5">
                {(node.type === 'remove_element'
                    || node.type === 'wait_selector'
                    || node.type === 'click'
                    || node.type === 'fill'
                    || node.type === 'select_option') && (
                    <SelectorInput
                        value={node.selector}
                        onChange={(value) => {
                            onUpdate({ selector: value });
                            previewDebounced(value);
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
                )}

                {node.type === 'wait_selector' && (
                    <div className="flex items-center gap-2">
                        <span className="text-[11px] whitespace-nowrap text-muted-foreground">Timeout (ms):</span>
                        <Input
                            type="number"
                            min={1}
                            step={100}
                            value={node.timeoutMs}
                            onChange={(e) => onUpdate({ timeoutMs: Math.max(1, parseInt(e.target.value, 10) || 1) })}
                            className="h-7 w-28 border-border bg-card/50 text-xs"
                        />
                    </div>
                )}

                {node.type === 'wait_network' && (
                    <Select value={node.state} onValueChange={(value) => onUpdate({ state: value })}>
                        <SelectTrigger className="h-7 border-border bg-card/50 text-xs">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="networkidle">networkidle</SelectItem>
                            <SelectItem value="domcontentloaded">domcontentloaded</SelectItem>
                            <SelectItem value="load">load</SelectItem>
                        </SelectContent>
                    </Select>
                )}

                {node.type === 'click' && (
                    <div className="flex items-center gap-2">
                        <span className="text-[11px] whitespace-nowrap text-muted-foreground">Čekat po (ms):</span>
                        <Input
                            type="number"
                            min={0}
                            step={100}
                            value={node.waitAfterMs}
                            onChange={(e) => onUpdate({ waitAfterMs: Math.max(0, parseInt(e.target.value, 10) || 0) })}
                            className="h-7 w-24 border-border bg-card/50 text-xs"
                        />
                    </div>
                )}

                {node.type === 'scroll' && (
                    <div className="grid grid-cols-2 gap-2">
                        <Input
                            type="number"
                            min={1}
                            value={node.count}
                            onChange={(e) => onUpdate({ count: Math.max(1, parseInt(e.target.value, 10) || 1) })}
                            className="h-7 border-border bg-card/50 text-xs"
                            placeholder="Počet scrollů"
                        />
                        <Input
                            type="number"
                            min={0}
                            step={100}
                            value={node.delayMs}
                            onChange={(e) => onUpdate({ delayMs: Math.max(0, parseInt(e.target.value, 10) || 0) })}
                            className="h-7 border-border bg-card/50 text-xs"
                            placeholder="Delay (ms)"
                        />
                    </div>
                )}

                {node.type === 'fill' && (
                    <>
                        <Input
                            value={node.value}
                            onChange={(e) => onUpdate({ value: e.target.value })}
                            placeholder="Hodnota"
                            className="h-7 border-border bg-card/50 text-xs"
                        />
                        <label className="flex items-center gap-2 text-[11px] text-muted-foreground">
                            <Switch
                                checked={node.pressEnter}
                                onCheckedChange={(checked) => onUpdate({ pressEnter: checked })}
                                className="h-4 w-7"
                            />
                            Stisknout Enter
                        </label>
                    </>
                )}

                {node.type === 'select_option' && (
                    <Input
                        value={node.value}
                        onChange={(e) => onUpdate({ value: e.target.value })}
                        placeholder="Hodnota option"
                        className="h-7 border-border bg-card/50 text-xs"
                    />
                )}

                {node.type === 'timeout' && (
                    <Input
                        type="number"
                        min={0}
                        step={100}
                        value={node.ms}
                        onChange={(e) => onUpdate({ ms: Math.max(0, parseInt(e.target.value, 10) || 0) })}
                        className="h-7 w-28 border-border bg-card/50 text-xs"
                    />
                )}

                {node.type === 'javascript' && (
                    <Input
                        value={node.script}
                        onChange={(e) => onUpdate({ script: e.target.value })}
                        placeholder="JavaScript"
                        className="h-7 border-border bg-card/50 font-mono text-xs"
                    />
                )}

                {node.type === 'screenshot' && (
                    <Input
                        value={node.filename}
                        onChange={(e) => onUpdate({ filename: e.target.value })}
                        placeholder="Název souboru"
                        className="h-7 border-border bg-card/50 text-xs"
                    />
                )}
            </div>
        </div>
    );
}
