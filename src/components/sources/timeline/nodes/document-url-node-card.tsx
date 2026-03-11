'use client';

import { FileDown, Trash2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import type { TimelineDocumentUrlNode } from '@/lib/crawler-types';
import { SelectorInput } from './selector-input';
import { useSelectorPreview, type SelectorTarget } from './use-selector-preview';

interface DocumentUrlNodeCardProps {
    node: TimelineDocumentUrlNode;
    depth: number;
    onUpdate: (patch: Partial<Pick<TimelineDocumentUrlNode, 'selector' | 'filenameSelector'>>) => void;
    onRemove: () => void;
    onSelectorPreviewChange?: (selector: string | null) => void;
    onSelectorTargetChange?: (target: SelectorTarget | null) => void;
    matchCounts?: Record<string, number>;
}

export function DocumentUrlNodeCard({ node, depth, onUpdate, onRemove, onSelectorPreviewChange, onSelectorTargetChange, matchCounts }: DocumentUrlNodeCardProps) {
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
                    placeholder="CSS selektor (odkaz na dokument)"
                    matchCount={getMatchCount(node.selector)}
                    onPick={() => setPickTarget()}
                />
                <SelectorInput
                    value={node.filenameSelector ?? ''}
                    onChange={(v) => {
                        onUpdate({ filenameSelector: v });
                        previewDebounced(v);
                    }}
                    onFocus={() => {
                        preview(node.filenameSelector ?? '');
                        setPickTarget('filenameSelector');
                    }}
                    onBlur={() => {
                        clearPreview();
                        clearPickTarget();
                    }}
                    placeholder="Selektor pro název souboru (nepovinný)"
                    matchCount={getMatchCount(node.filenameSelector ?? '')}
                    onPick={() => setPickTarget('filenameSelector')}
                />
            </div>
        </div>
    );
}
