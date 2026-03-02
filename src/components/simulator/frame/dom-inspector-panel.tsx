'use client';

import { Search, Sparkles, X } from 'lucide-react';
import type { ReactNode } from 'react';

import type { SelectorSuggestion, InspectorNode } from '@/components/simulator/frame/types';

interface DomInspectorPanelProps {
    open: boolean;
    width: number;
    search: string;
    onSearchChange: (value: string) => void;
    onClose: () => void;
    onResizeStart: (event: { clientX: number }) => void;
    treeContent: ReactNode;
    selectedNode: InspectorNode | null;
    suggestions: SelectorSuggestion[];
    onSuggestionHover: (selector: string | null) => void;
    onSuggestionClick: (selector: string) => void;
    onAutoScaffold: () => void;
    autoScaffoldDisabled: boolean;
}

export function DomInspectorPanel({
    open,
    width,
    search,
    onSearchChange,
    onClose,
    onResizeStart,
    treeContent,
    selectedNode,
    suggestions,
    onSuggestionHover,
    onSuggestionClick,
    onAutoScaffold,
    autoScaffoldDisabled,
}: DomInspectorPanelProps) {
    if (!open) {
        return null;
    }

    const fallbackSuggestions = selectedNode
        ? [{ kind: 'stable', selector: selectedNode.selector, score: 1, matches: 1 }]
        : [];

    return (
        <div
            className="absolute bottom-0 left-0 top-0 z-20 border-r border-border bg-card/95 backdrop-blur-md"
            style={{ width }}
        >
            <div className="border-b border-border p-2">
                <div className="mb-2 flex items-center justify-between">
                    <div className="text-xs font-semibold uppercase tracking-wide text-primary">DOM Inspector</div>
                    <button className="text-muted-foreground hover:text-foreground" onClick={onClose}>
                        <X className="h-3.5 w-3.5" />
                    </button>
                </div>
                <div className="relative">
                    <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/50" />
                    <input
                        value={search}
                        onChange={(event) => onSearchChange(event.target.value)}
                        placeholder="Hledat tag/text/selector..."
                        className="h-8 w-full rounded border border-border bg-muted/30 pl-7 pr-2 text-xs text-foreground placeholder:text-muted-foreground/50"
                    />
                </div>
            </div>

            <div className="flex h-[calc(100%-48px)] flex-col">
                <div className="min-h-0 flex-1 overflow-auto p-2">{treeContent}</div>
                <div className="border-t border-border p-2">
                    <div className="mb-1 text-[10px] uppercase tracking-wide text-muted-foreground">Selector Suggestions</div>
                    {selectedNode ? (
                        <div className="space-y-1">
                            {(suggestions.length > 0 ? suggestions : fallbackSuggestions).map((item) => (
                                <button
                                    key={`${item.kind}-${item.selector}`}
                                    type="button"
                                    className="w-full rounded border border-border bg-card/50 px-2 py-1 text-left hover:bg-muted/50"
                                    onMouseEnter={() => onSuggestionHover(item.selector)}
                                    onMouseLeave={() => onSuggestionHover(null)}
                                    onClick={() => onSuggestionClick(item.selector)}
                                >
                                    <div className="flex items-center justify-between gap-2 text-[11px]">
                                        <span className="font-medium text-primary">{item.kind}</span>
                                        <span className="text-muted-foreground">
                                            {Math.round(item.score * 100)}% / {item.matches}x
                                        </span>
                                    </div>
                                    <div className="truncate font-mono text-[11px] text-foreground/80">{item.selector}</div>
                                </button>
                            ))}
                        </div>
                    ) : (
                        <div className="text-xs text-muted-foreground/60">Vyber element ve stromu.</div>
                    )}
                    <button
                        type="button"
                        className="mt-2 inline-flex items-center gap-1 rounded bg-primary/20 px-2 py-1 text-[11px] text-primary hover:bg-primary/30"
                        onClick={onAutoScaffold}
                        disabled={autoScaffoldDisabled}
                    >
                        <Sparkles className="h-3 w-3" />
                        Auto Scaffold
                    </button>
                </div>
            </div>

            <div
                className="absolute right-0 top-0 h-full w-1 cursor-col-resize bg-border hover:bg-primary/60"
                onMouseDown={onResizeStart}
            />
        </div>
    );
}
