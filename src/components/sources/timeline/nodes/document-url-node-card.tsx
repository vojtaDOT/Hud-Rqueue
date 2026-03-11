'use client';

import { FileDown, Trash2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { TimelineDocumentUrlNode } from '@/lib/crawler-types';
import { useSelectorPreview } from './use-selector-preview';

interface DocumentUrlNodeCardProps {
    node: TimelineDocumentUrlNode;
    depth: number;
    onUpdate: (patch: Partial<Pick<TimelineDocumentUrlNode, 'selector' | 'filenameSelector'>>) => void;
    onRemove: () => void;
    onSelectorPreviewChange?: (selector: string | null) => void;
}

export function DocumentUrlNodeCard({ node, depth, onUpdate, onRemove, onSelectorPreviewChange }: DocumentUrlNodeCardProps) {
    const { preview, previewDebounced, clearPreview } = useSelectorPreview(onSelectorPreviewChange);

    return (
        <div
            className={`rounded-lg border border-border bg-card/50 p-2 ${depth > 0 ? 'ml-4' : ''}`}
            onClick={() => preview(node.selector)}
        >
            <div className="flex items-center gap-1.5">
                <FileDown className="h-3.5 w-3.5 shrink-0 text-primary" />
                <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Document URL
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
                    placeholder="CSS selektor (odkaz na dokument)"
                    className="h-7 border-border bg-card/50 text-xs font-mono"
                />
                <Input
                    value={node.filenameSelector ?? ''}
                    onChange={(e) => {
                        onUpdate({ filenameSelector: e.target.value });
                        previewDebounced(e.target.value);
                    }}
                    onFocus={() => preview(node.filenameSelector ?? '')}
                    onBlur={clearPreview}
                    placeholder="Selektor pro název souboru (nepovinný)"
                    className="h-7 border-border bg-card/50 text-xs font-mono"
                />
            </div>
        </div>
    );
}
