'use client';

import { Download, Trash2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import type { TimelineDownloadFileNode } from '@/lib/crawler-types';
import { SelectorInput } from './selector-input';
import { useSelectorPreview, type SelectorTarget } from './use-selector-preview';

interface DownloadFileNodeCardProps {
    node: TimelineDownloadFileNode;
    depth: number;
    onUpdate: (patch: Partial<Pick<TimelineDownloadFileNode, 'urlSelector' | 'filenameSelector'>>) => void;
    onRemove: () => void;
    onSelectorPreviewChange?: (selector: string | null) => void;
    onSelectorTargetChange?: (target: SelectorTarget | null) => void;
    matchCounts?: Record<string, number>;
}

export function DownloadFileNodeCard({
    node,
    depth,
    onUpdate,
    onRemove,
    onSelectorPreviewChange,
    onSelectorTargetChange,
    matchCounts,
}: DownloadFileNodeCardProps) {
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

    return (
        <div
            className={`rounded-lg border border-border bg-card/50 p-2 ${depth > 0 ? 'ml-4' : ''}`}
            onClick={() => preview(node.urlSelector)}
        >
            <div className="flex items-center gap-1.5">
                <Download className="h-3.5 w-3.5 shrink-0 text-primary" />
                <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Download File
                </span>
                <div className="flex-1" />
                <Button variant="ghost" size="icon" className="h-5 w-5 text-muted-foreground hover:text-red-500" onClick={onRemove}>
                    <Trash2 className="h-3 w-3" />
                </Button>
            </div>
            <div className="mt-1.5 space-y-1.5">
                <SelectorInput
                    value={node.urlSelector}
                    onChange={(value) => {
                        onUpdate({ urlSelector: value });
                        previewDebounced(value);
                    }}
                    onFocus={() => {
                        preview(node.urlSelector);
                        setPickTarget('urlSelector');
                    }}
                    onBlur={() => {
                        clearPreview();
                        clearPickTarget();
                    }}
                    placeholder="Selektor URL souboru"
                    matchCount={getMatchCount(node.urlSelector)}
                    onPick={() => setPickTarget('urlSelector')}
                />
                <SelectorInput
                    value={node.filenameSelector ?? ''}
                    onChange={(value) => {
                        onUpdate({ filenameSelector: value });
                        previewDebounced(value);
                    }}
                    onFocus={() => {
                        preview(node.filenameSelector ?? '');
                        setPickTarget('filenameSelector');
                    }}
                    onBlur={() => {
                        clearPreview();
                        clearPickTarget();
                    }}
                    placeholder="Selektor názvu souboru (nepovinný)"
                    matchCount={getMatchCount(node.filenameSelector ?? '')}
                    onPick={() => setPickTarget('filenameSelector')}
                />
            </div>
        </div>
    );
}
