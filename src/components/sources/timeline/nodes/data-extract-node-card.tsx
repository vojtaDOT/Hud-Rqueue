'use client';

import { Database, Plus, Trash2, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import type { DataExtractField, ExtractType, TimelineDataExtractNode } from '@/lib/crawler-types';
import { SelectorInput } from './selector-input';
import { useSelectorPreview, type SelectorTarget } from './use-selector-preview';

interface DataExtractNodeCardProps {
    node: TimelineDataExtractNode;
    depth: number;
    onUpdate: (patch: Partial<Pick<TimelineDataExtractNode, 'groupLabel' | 'fields'>>) => void;
    onRemove: () => void;
    onSelectorPreviewChange?: (selector: string | null) => void;
    onSelectorTargetChange?: (target: SelectorTarget | null) => void;
    matchCounts?: Record<string, number>;
}

export function DataExtractNodeCard({ node, depth, onUpdate, onRemove, onSelectorPreviewChange, onSelectorTargetChange, matchCounts }: DataExtractNodeCardProps) {
    const { preview, previewDebounced, clearPreview, setPickTarget, clearPickTarget, getMatchCount } = useSelectorPreview({
        onSelectorPreviewChange,
        onSelectorTargetChange,
        nodeId: node.id,
        matchCounts,
    });
    const updateField = (index: number, patch: Partial<DataExtractField>) => {
        const updated = node.fields.map((f, i) => (i === index ? { ...f, ...patch } : f));
        onUpdate({ fields: updated });
    };

    const addField = () => {
        onUpdate({
            fields: [...node.fields, { key: '', selector: '', extractType: 'text' as ExtractType }],
        });
    };

    const removeField = (index: number) => {
        onUpdate({ fields: node.fields.filter((_, i) => i !== index) });
    };

    return (
        <div className={`rounded-lg border border-green-500/40 bg-green-500/5 p-2 ${depth > 0 ? 'ml-4' : ''}`}>
            <div className="flex items-center gap-1.5">
                <Database className="h-3.5 w-3.5 shrink-0 text-green-500" />
                <span className="text-[10px] font-semibold uppercase tracking-wider text-green-600 dark:text-green-400">
                    Data Extract
                </span>
                <div className="flex-1" />
                <Button variant="ghost" size="icon" className="h-5 w-5 text-muted-foreground hover:text-red-500" onClick={onRemove}>
                    <Trash2 className="h-3 w-3" />
                </Button>
            </div>
            <div className="mt-1.5 space-y-1.5">
                <Input
                    value={node.groupLabel}
                    onChange={(e) => onUpdate({ groupLabel: e.target.value })}
                    placeholder="Název skupiny"
                    className="h-7 border-border bg-card/50 text-xs"
                />
                {node.fields.map((field, i) => (
                    <div key={i} className="flex items-start gap-1">
                        <div className="flex-1 space-y-1">
                            <Input
                                value={field.key}
                                onChange={(e) => updateField(i, { key: e.target.value })}
                                placeholder="Klíč"
                                className="h-7 border-border bg-card/50 text-xs"
                            />
                            <SelectorInput
                                value={field.selector}
                                onChange={(v) => {
                                    updateField(i, { selector: v });
                                    previewDebounced(v);
                                }}
                                onFocus={() => {
                                    preview(field.selector);
                                    setPickTarget(`fields.${i}.selector`);
                                }}
                                onBlur={() => {
                                    clearPreview();
                                    clearPickTarget();
                                }}
                                matchCount={getMatchCount(field.selector)}
                                onPick={() => setPickTarget(`fields.${i}.selector`)}
                            />
                        </div>
                        <Select
                            value={field.extractType}
                            onValueChange={(v) => updateField(i, { extractType: v as ExtractType })}
                        >
                            <SelectTrigger className="h-7 w-20 shrink-0 border-border bg-card/50 text-xs">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="text">Text</SelectItem>
                                <SelectItem value="href">Href</SelectItem>
                            </SelectContent>
                        </Select>
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 shrink-0 text-muted-foreground hover:text-red-500"
                            onClick={() => removeField(i)}
                        >
                            <X className="h-3 w-3" />
                        </Button>
                    </div>
                ))}
                <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 text-xs text-muted-foreground"
                    onClick={addField}
                >
                    <Plus className="mr-1 h-3 w-3" />
                    Přidat pole
                </Button>
            </div>
        </div>
    );
}
