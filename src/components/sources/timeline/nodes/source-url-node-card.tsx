'use client';

import { Link, Trash2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import type { TimelineSourceUrlNode } from '@/lib/crawler-types';
import { useSelectorPreview } from './use-selector-preview';

interface SourceUrlNodeCardProps {
    node: TimelineSourceUrlNode;
    depth: number;
    onUpdate: (patch: Partial<Pick<TimelineSourceUrlNode, 'selector' | 'urlType'>>) => void;
    onRemove: () => void;
    onSelectorPreviewChange?: (selector: string | null) => void;
}

export function SourceUrlNodeCard({ node, depth, onUpdate, onRemove, onSelectorPreviewChange }: SourceUrlNodeCardProps) {
    const { preview, previewDebounced, clearPreview } = useSelectorPreview(onSelectorPreviewChange);

    return (
        <div
            className={`rounded-lg border border-border bg-card/50 p-2 ${depth > 0 ? 'ml-4' : ''}`}
            onClick={() => preview(node.selector)}
        >
            <div className="flex items-center gap-1.5">
                <Link className="h-3.5 w-3.5 shrink-0 text-primary" />
                <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Source URL
                </span>
                <div className="flex-1" />
                <Button variant="ghost" size="icon" className="h-5 w-5 text-muted-foreground hover:text-red-500" onClick={onRemove}>
                    <Trash2 className="h-3 w-3" />
                </Button>
            </div>
            <div className="mt-1.5 space-y-1.5">
                <Input
                    value={node.selector}
                    onChange={(e) => {
                        onUpdate({ selector: e.target.value });
                        previewDebounced(e.target.value);
                    }}
                    onFocus={() => preview(node.selector)}
                    onBlur={clearPreview}
                    placeholder="CSS selektor"
                    className="h-7 border-border bg-card/50 text-xs font-mono"
                />
                <Select value={node.urlType} onValueChange={(v) => onUpdate({ urlType: v })}>
                    <SelectTrigger className="h-7 border-border bg-card/50 text-xs">
                        <SelectValue placeholder="Typ URL" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="default">Výchozí</SelectItem>
                        <SelectItem value="detail">Detail</SelectItem>
                        <SelectItem value="document">Dokument</SelectItem>
                    </SelectContent>
                </Select>
            </div>
        </div>
    );
}
