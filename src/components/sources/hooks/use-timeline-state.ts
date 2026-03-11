'use client';

import { useCallback, useState } from 'react';

import type { ScrapingWorkflowV2, TimelineNode } from '@/lib/crawler-types';
import {
    insertTimelineNodeAt,
    moveTimelineNode,
    removeTimelineNodeById,
    updateTimelineNodeById,
} from '@/lib/workflow-tree';

type Phase = 'discovery' | 'process';

function createEmptyWorkflow(strategy: 'path' | 'rss' = 'path'): ScrapingWorkflowV2 {
    return {
        version: 2,
        strategy,
        singlePage: false,
        discovery: [],
        process: [],
    };
}

export function useTimelineState(initial?: ScrapingWorkflowV2 | null) {
    const [workflow, setWorkflow] = useState<ScrapingWorkflowV2>(
        initial ?? createEmptyWorkflow(),
    );

    const getPhaseNodes = useCallback((phase: Phase): TimelineNode[] => {
        return phase === 'discovery' ? workflow.discovery : (workflow.process ?? []);
    }, [workflow]);

    const setPhaseNodes = useCallback((phase: Phase, nodes: TimelineNode[]) => {
        setWorkflow((prev) => {
            if (phase === 'discovery') {
                return { ...prev, discovery: nodes };
            }
            return { ...prev, process: nodes };
        });
    }, []);

    const addNode = useCallback((phase: Phase, parentId: string | null, node: TimelineNode, index?: number) => {
        setWorkflow((prev) => {
            const nodes = phase === 'discovery' ? prev.discovery : (prev.process ?? []);
            const insertIndex = index ?? nodes.length;
            const updated = insertTimelineNodeAt(nodes, parentId, insertIndex, node);
            return phase === 'discovery'
                ? { ...prev, discovery: updated }
                : { ...prev, process: updated };
        });
    }, []);

    const removeNode = useCallback((phase: Phase, nodeId: string) => {
        setWorkflow((prev) => {
            const nodes = phase === 'discovery' ? prev.discovery : (prev.process ?? []);
            const [updated] = removeTimelineNodeById(nodes, nodeId);
            return phase === 'discovery'
                ? { ...prev, discovery: updated }
                : { ...prev, process: updated };
        });
    }, []);

    const updateNode = useCallback((phase: Phase, nodeId: string, updater: (node: TimelineNode) => TimelineNode) => {
        setWorkflow((prev) => {
            const nodes = phase === 'discovery' ? prev.discovery : (prev.process ?? []);
            const [updated] = updateTimelineNodeById(nodes, nodeId, updater);
            return phase === 'discovery'
                ? { ...prev, discovery: updated }
                : { ...prev, process: updated };
        });
    }, []);

    const moveNode = useCallback((phase: Phase, nodeId: string, targetParentId: string | null, targetIndex: number) => {
        setWorkflow((prev) => {
            const nodes = phase === 'discovery' ? prev.discovery : (prev.process ?? []);
            const updated = moveTimelineNode(nodes, nodeId, targetParentId, targetIndex);
            return phase === 'discovery'
                ? { ...prev, discovery: updated }
                : { ...prev, process: updated };
        });
    }, []);

    const toggleSinglePage = useCallback(() => {
        setWorkflow((prev) => {
            if (prev.singlePage) {
                // Turning off singlePage → initialize process array
                return { ...prev, singlePage: false, process: prev.process ?? [] };
            }
            // Turning on singlePage → nullify process
            return { ...prev, singlePage: true, process: null };
        });
    }, []);

    const setStrategy = useCallback((strategy: 'path' | 'rss') => {
        setWorkflow((prev) => ({ ...prev, strategy }));
    }, []);

    const resetWorkflow = useCallback((next: ScrapingWorkflowV2) => {
        setWorkflow(next);
    }, []);

    return {
        workflow,
        getPhaseNodes,
        setPhaseNodes,
        addNode,
        removeNode,
        updateNode,
        moveNode,
        toggleSinglePage,
        setStrategy,
        resetWorkflow,
    };
}
