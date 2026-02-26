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
    { action: 'scope', label: 'Pouzit jako Scope', className: 'bg-white/10 text-white/80 hover:bg-white/20' },
    { action: 'repeater', label: 'Pouzit jako Repeater', className: 'bg-white/10 text-white/80 hover:bg-white/20' },
    { action: 'source_url', label: 'Pouzit jako Source URL', className: 'bg-cyan-500/20 text-cyan-100 hover:bg-cyan-500/30' },
    { action: 'document_url', label: 'Pouzit jako Document URL', className: 'bg-sky-500/20 text-sky-100 hover:bg-sky-500/30' },
    { action: 'download_url', label: 'Pouzit jako Download URL', className: 'bg-emerald-500/20 text-emerald-100 hover:bg-emerald-500/30' },
    { action: 'filename_selector', label: 'Pouzit jako Filename', className: 'bg-emerald-500/20 text-emerald-100 hover:bg-emerald-500/30' },
    { action: 'pagination', label: 'Pouzit jako Pagination', className: 'bg-red-500/20 text-red-100 hover:bg-red-500/30' },
    { action: 'auto_scaffold', label: 'Auto Scaffold', className: 'bg-purple-500/20 text-purple-100 hover:bg-purple-500/30' },
];

export function SelectedElementCard({
    selectedElement,
    onRemoveElement,
    onClearSelection,
    onQuickAction,
}: SelectedElementCardProps) {
    return (
        <div className="absolute left-1/2 top-16 z-20 max-w-md -translate-x-1/2 rounded-lg border border-purple-500/50 bg-black/90 p-4 shadow-xl backdrop-blur-md">
            <div className="mb-2 flex items-start justify-between gap-4">
                <div className="flex-1">
                    <div className="mb-1 text-xs text-purple-300">Vybrany element</div>
                    <div className="mb-2 break-all text-sm font-mono text-white/90">
                        {selectedElement.selector}
                    </div>
                    {selectedElement.isList && (
                        <div className="inline-block rounded bg-purple-500/20 px-2 py-1 text-xs text-purple-200">
                            Seznam ({selectedElement.listItemCount} polozek)
                        </div>
                    )}
                </div>
                <button
                    onClick={onRemoveElement}
                    className="mr-2 text-white/50 transition-colors hover:text-red-400"
                    title="Odstranit element z DOM"
                >
                    <Eraser className="h-4 w-4" />
                </button>
                <button
                    onClick={onClearSelection}
                    className="text-white/50 transition-colors hover:text-white"
                >
                    <X className="h-4 w-4" />
                </button>
            </div>

            <div className="mt-2 border-t border-white/10 pt-2 text-xs text-white/60">
                <div>
                    Tag: <span className="text-white/80">{selectedElement.tagName}</span>
                </div>
                {selectedElement.textContent && (
                    <div className="mt-1 truncate">
                        Text: <span className="text-white/80">{selectedElement.textContent}</span>
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
