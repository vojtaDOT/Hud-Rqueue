'use client';

import { Eraser, X } from 'lucide-react';

import type { SidebarQuickAction } from '@/components/simulator/simulator-sidebar';
import type { SimulatorElementInfo } from '@/components/simulator/frame/types';

interface SelectedElementCardProps {
    selectedElement: SimulatorElementInfo;
    onRemoveElement: () => void;
    onClearSelection: () => void;
    onQuickAction: (action: SidebarQuickAction) => void;
}

const QUICK_ACTIONS: Array<{ action: SidebarQuickAction; label: string; className: string }> = [
    { action: 'scope', label: 'Pouzit jako Scope', className: 'bg-muted/50 text-foreground/80 hover:bg-muted' },
    { action: 'repeater', label: 'Pouzit jako Repeater', className: 'bg-muted/50 text-foreground/80 hover:bg-muted' },
    { action: 'source_url', label: 'Pouzit jako Source URL', className: 'bg-primary/20 text-primary hover:bg-primary/30' },
    { action: 'document_url', label: 'Pouzit jako Document URL', className: 'bg-sky-500/20 text-sky-100 hover:bg-sky-500/30' },
    { action: 'download_url', label: 'Pouzit jako Download URL', className: 'bg-emerald-500/20 text-emerald-100 hover:bg-emerald-500/30' },
    { action: 'filename_selector', label: 'Pouzit jako Filename', className: 'bg-emerald-500/20 text-emerald-100 hover:bg-emerald-500/30' },
    { action: 'pagination', label: 'Pouzit jako Pagination', className: 'bg-red-500/20 text-red-100 hover:bg-red-500/30' },
    { action: 'auto_scaffold', label: 'Auto Scaffold', className: 'bg-primary/20 text-primary hover:bg-primary/30' },
];

export function SelectedElementCard({
    selectedElement,
    onRemoveElement,
    onClearSelection,
    onQuickAction,
}: SelectedElementCardProps) {
    return (
        <div className="absolute left-1/2 top-16 z-20 max-w-md -translate-x-1/2 rounded-lg border border-primary/50 bg-card/95 p-4 shadow-xl backdrop-blur-md">
            <div className="mb-2 flex items-start justify-between gap-4">
                <div className="flex-1">
                    <div className="mb-1 text-xs text-primary">Vybrany element</div>
                    <div className="mb-2 break-all text-sm font-mono text-foreground/90">
                        {selectedElement.selector}
                    </div>
                    {selectedElement.isList && (
                        <div className="inline-block rounded bg-primary/20 px-2 py-1 text-xs text-primary">
                            Seznam ({selectedElement.listItemCount} polozek)
                        </div>
                    )}
                </div>
                <button
                    onClick={onRemoveElement}
                    className="mr-2 text-muted-foreground transition-colors hover:text-red-400"
                    title="Odstranit element z DOM"
                >
                    <Eraser className="h-4 w-4" />
                </button>
                <button
                    onClick={onClearSelection}
                    className="text-muted-foreground transition-colors hover:text-foreground"
                >
                    <X className="h-4 w-4" />
                </button>
            </div>

            <div className="mt-2 border-t border-border pt-2 text-xs text-muted-foreground">
                <div>
                    Tag: <span className="text-foreground/80">{selectedElement.tagName}</span>
                </div>
                {selectedElement.textContent && (
                    <div className="mt-1 truncate">
                        Text: <span className="text-foreground/80">{selectedElement.textContent}</span>
                    </div>
                )}
            </div>

            <div className="mt-3 grid grid-cols-2 gap-1">
                {QUICK_ACTIONS.map((item) => (
                    <button
                        key={item.action}
                        className={`rounded px-2 py-1 text-[11px] ${item.className}`}
                        onClick={() => onQuickAction(item.action)}
                    >
                        {item.label}
                    </button>
                ))}
            </div>
        </div>
    );
}
