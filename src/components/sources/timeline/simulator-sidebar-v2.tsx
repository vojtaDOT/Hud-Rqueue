'use client';

import { forwardRef, useEffect, useImperativeHandle } from 'react';

import { Switch } from '@/components/ui/switch';
import type { ScrapingWorkflowV2 } from '@/lib/crawler-types';
import { useTimelineState } from '@/components/sources/hooks/use-timeline-state';

import { TimelineEditor } from './timeline-editor';
import type { SelectorTarget } from './nodes/use-selector-preview';

export interface SimulatorSidebarV2Ref {
    getWorkflow: () => ScrapingWorkflowV2;
    reset: (workflow?: ScrapingWorkflowV2) => void;
    fillSelectorTarget: (target: SelectorTarget, selector: string) => boolean;
}

interface SimulatorSidebarV2Props {
    initialWorkflow?: ScrapingWorkflowV2 | null;
    onWorkflowChange?: (workflow: ScrapingWorkflowV2) => void;
    onSelectorPreviewChange?: (selector: string | null) => void;
    onSelectorTargetChange?: (target: SelectorTarget | null) => void;
    matchCounts?: Record<string, number>;
    className?: string;
}

export const SimulatorSidebarV2 = forwardRef<SimulatorSidebarV2Ref, SimulatorSidebarV2Props>(({
    initialWorkflow,
    onWorkflowChange,
    onSelectorPreviewChange,
    onSelectorTargetChange,
    matchCounts,
    className,
}, ref) => {
    const {
        workflow,
        getPhaseNodes,
        addNode,
        removeNode,
        updateNode,
        toggleSinglePage,
        resetWorkflow,
    } = useTimelineState(initialWorkflow);

    useEffect(() => {
        if (initialWorkflow) {
            resetWorkflow(initialWorkflow);
        }
    }, [initialWorkflow, resetWorkflow]);

    // Notify parent whenever workflow state changes
    useEffect(() => {
        onWorkflowChange?.(workflow);
    }, [workflow, onWorkflowChange]);

    useImperativeHandle(ref, () => ({
        getWorkflow: () => workflow,
        reset: (next?: ScrapingWorkflowV2) => {
            resetWorkflow(next);
        },
        fillSelectorTarget: (target: SelectorTarget, selector: string) => {
            // Try both phases to find the target node and update its selector field
            for (const phase of ['discovery', 'process'] as const) {
                updateNode(phase, target.nodeId, (node) => {
                    if (target.field) {
                        // Sub-field, e.g. "fields.0.selector" for data_extract or "filenameSelector" for document_url
                        if (target.field === 'routeKeySelector' && node.type === 'repeater') {
                            return { ...node, routeKeySelector: selector };
                        }
                        if (target.field === 'filenameSelector' && node.type === 'document_url') {
                            return { ...node, filenameSelector: selector };
                        }
                        if (target.field === 'urlSelector' && node.type === 'download_file') {
                            return { ...node, urlSelector: selector };
                        }
                        if (target.field === 'filenameSelector' && node.type === 'download_file') {
                            return { ...node, filenameSelector: selector };
                        }
                        // data_extract: "fields.N.selector"
                        const fieldMatch = target.field.match(/^fields\.(\d+)\.selector$/);
                        if (fieldMatch && node.type === 'data_extract') {
                            const idx = parseInt(fieldMatch[1], 10);
                            const fields = node.fields.map((f, i) =>
                                i === idx ? { ...f, selector } : f
                            );
                            return { ...node, fields };
                        }
                        return node;
                    }
                    // Default: update the main `selector` field
                    if ('selector' in node) {
                        return { ...node, selector };
                    }
                    return node;
                });
            }
            return true;
        },
    }), [workflow, resetWorkflow, updateNode]);

    // Push changes to parent whenever workflow object updates
    // We use a simple effect-like approach by calling notify in render sync
    // But since we can't use useEffect in render, we rely on the parent reading the ref
    // Instead, we pass workflow directly through the callback on each interaction

    return (
        <div className={`flex h-full flex-col overflow-y-auto ${className ?? ''}`}>
            {/* SinglePage toggle */}
            <div className="flex items-center gap-2 border-b border-border px-3 py-2">
                <Switch
                    checked={workflow.singlePage}
                    onCheckedChange={toggleSinglePage}
                    className="h-4 w-7"
                />
                <span className="text-xs text-muted-foreground">
                    Jedna stránka (bez Process fáze)
                </span>
            </div>

            {/* Discovery phase */}
            <div className="px-3 py-2">
                <div className="mb-1.5 flex items-center gap-2">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-primary">
                        Discovery
                    </span>
                    <div className="h-px flex-1 bg-border" />
                </div>
                <TimelineEditor
                    phase="discovery"
                    nodes={getPhaseNodes('discovery')}
                    onAddNode={(parentId, node, index) => addNode('discovery', parentId, node, index)}
                    onRemoveNode={(nodeId) => removeNode('discovery', nodeId)}
                    onUpdateNode={(nodeId, updater) => updateNode('discovery', nodeId, updater)}
                    onSelectorPreviewChange={onSelectorPreviewChange}
                    onSelectorTargetChange={onSelectorTargetChange}
                    matchCounts={matchCounts}
                />
            </div>

            {/* Process phase (hidden when singlePage) */}
            {!workflow.singlePage && (
                <div className="border-t border-border px-3 py-2">
                    <div className="mb-1.5 flex items-center gap-2">
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-primary">
                            Process
                        </span>
                        <div className="h-px flex-1 bg-border" />
                    </div>
                    <TimelineEditor
                        phase="process"
                        nodes={getPhaseNodes('process')}
                        onAddNode={(parentId, node, index) => addNode('process', parentId, node, index)}
                        onRemoveNode={(nodeId) => removeNode('process', nodeId)}
                        onUpdateNode={(nodeId, updater) => updateNode('process', nodeId, updater)}
                        onSelectorPreviewChange={onSelectorPreviewChange}
                        onSelectorTargetChange={onSelectorTargetChange}
                        matchCounts={matchCounts}
                    />
                </div>
            )}
        </div>
    );
});

SimulatorSidebarV2.displayName = 'SimulatorSidebarV2';
