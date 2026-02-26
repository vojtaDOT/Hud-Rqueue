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
            className="absolute bottom-0 left-0 top-0 z-20 border-r border-white/10 bg-black/85 backdrop-blur-md"
            style={{ width }}
        >
            <div className="border-b border-white/10 p-2">
                <div className="mb-2 flex items-center justify-between">
                    <div className="text-xs font-semibold uppercase tracking-wide text-cyan-200">DOM Inspector</div>
                    <button className="text-white/50 hover:text-white" onClick={onClose}>
                        <X className="h-3.5 w-3.5" />
                    </button>
                </div>
                <div className="relative">
                    <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/40" />
                    <input
                        value={search}
                        onChange={(event) => onSearchChange(event.target.value)}
                        placeholder="Hledat tag/text/selector..."
                        className="h-8 w-full rounded border border-white/10 bg-black/40 pl-7 pr-2 text-xs text-white placeholder:text-white/40"
                    />
                </div>
            </div>

            <div className="flex h-[calc(100%-48px)] flex-col">
                <div className="min-h-0 flex-1 overflow-auto p-2">{treeContent}</div>
                <div className="border-t border-white/10 p-2">
                    <div className="mb-1 text-[10px] uppercase tracking-wide text-white/50">Selector Suggestions</div>
                    {selectedNode ? (
                        <div className="space-y-1">
                            {(suggestions.length > 0 ? suggestions : fallbackSuggestions).map((item) => (
                                <button
                                    key={`${item.kind}-${item.selector}`}
                                    type="button"
                                    className="w-full rounded border border-white/10 bg-black/30 px-2 py-1 text-left hover:bg-white/10"
                                    onMouseEnter={() => onSuggestionHover(item.selector)}
                                    onMouseLeave={() => onSuggestionHover(null)}
                                    onClick={() => onSuggestionClick(item.selector)}
                                >
                                    <div className="flex items-center justify-between gap-2 text-[11px]">
                                        <span className="font-medium text-cyan-200">{item.kind}</span>
                                        <span className="text-white/50">
                                            {Math.round(item.score * 100)}% / {item.matches}x
                                        </span>
                                    </div>
                                    <div className="truncate font-mono text-[11px] text-white/80">{item.selector}</div>
                                </button>
                            ))}
                        </div>
                    ) : (
                        <div className="text-xs text-white/40">Vyber element ve stromu.</div>
                    )}
                    <button
                        type="button"
                        className="mt-2 inline-flex items-center gap-1 rounded bg-purple-500/20 px-2 py-1 text-[11px] text-purple-100 hover:bg-purple-500/30"
                        onClick={onAutoScaffold}
                        disabled={autoScaffoldDisabled}
                    >
                        <Sparkles className="h-3 w-3" />
                        Auto Scaffold
                    </button>
                </div>
            </div>

            <div
                className="absolute right-0 top-0 h-full w-1 cursor-col-resize bg-white/10 hover:bg-cyan-500/60"
                onMouseDown={onResizeStart}
            />
        </div>
    );
}
