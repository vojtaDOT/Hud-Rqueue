'use client';

import { forwardRef, useEffect, useImperativeHandle } from 'react';

import { Switch } from '@/components/ui/switch';
import type { ScrapingWorkflowV2 } from '@/lib/crawler-types';
import { useTimelineState } from '@/components/sources/hooks/use-timeline-state';

import { TimelineEditor } from './timeline-editor';

export interface SimulatorSidebarV2Ref {
    getWorkflow: () => ScrapingWorkflowV2;
    reset: (workflow?: ScrapingWorkflowV2) => void;
}

interface SimulatorSidebarV2Props {
    initialWorkflow?: ScrapingWorkflowV2 | null;
    onWorkflowChange?: (workflow: ScrapingWorkflowV2) => void;
    onSelectorPreviewChange?: (selector: string | null) => void;
    className?: string;
}

export const SimulatorSidebarV2 = forwardRef<SimulatorSidebarV2Ref, SimulatorSidebarV2Props>(({
    initialWorkflow,
    onWorkflowChange,
    onSelectorPreviewChange,
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

    // Notify parent whenever workflow state changes
    useEffect(() => {
        onWorkflowChange?.(workflow);
    }, [workflow, onWorkflowChange]);

    useImperativeHandle(ref, () => ({
        getWorkflow: () => workflow,
        reset: (next?: ScrapingWorkflowV2) => {
            if (next) resetWorkflow(next);
        },
    }), [workflow, resetWorkflow]);

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
                    />
                </div>
            )}
        </div>
    );
});

SimulatorSidebarV2.displayName = 'SimulatorSidebarV2';
