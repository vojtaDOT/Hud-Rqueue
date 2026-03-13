'use client';

import { useCallback } from 'react';

import type { TimelineNode, TimelineNodeType } from '@/lib/crawler-types';
import type { SelectorTarget } from './nodes/use-selector-preview';
import {
    createTimelineClickNode,
    createTimelineDataExtractNode,
    createTimelineDownloadFileNode,
    createTimelineDocumentUrlNode,
    createTimelineJavascriptNode,
    createTimelineFillNode,
    createTimelineRemoveElementNode,
    createTimelinePaginationNode,
    createTimelineRepeaterNode,
    createTimelineScreenshotNode,
    createTimelineScrollNode,
    createTimelineSelectOptionNode,
    createTimelineScopeNode,
    createTimelineSourceUrlNode,
    createTimelineTimeoutNode,
    createTimelineWaitNetworkNode,
    createTimelineWaitSelectorNode,
} from '@/lib/workflow-tree';

import { BeforeActionNodeCard } from './nodes/before-action-node-card';
import { StepChooserV2 } from './step-chooser-v2';
import { ClickNodeCard } from './nodes/click-node-card';
import { DataExtractNodeCard } from './nodes/data-extract-node-card';
import { DownloadFileNodeCard } from './nodes/download-file-node-card';
import { DocumentUrlNodeCard } from './nodes/document-url-node-card';
import { JavascriptNodeCard } from './nodes/javascript-node-card';
import { PaginationNodeCard } from './nodes/pagination-node-card';
import { RepeaterNodeCard } from './nodes/repeater-node-card';
import { ScopeNodeCard } from './nodes/scope-node-card';
import { SourceUrlNodeCard } from './nodes/source-url-node-card';
import { TimeoutNodeCard } from './nodes/timeout-node-card';

interface TimelineEditorProps {
    phase?: 'discovery' | 'process';
    nodes: TimelineNode[];
    onAddNode: (parentId: string | null, node: TimelineNode, index?: number) => void;
    onRemoveNode: (nodeId: string) => void;
    onUpdateNode: (nodeId: string, updater: (node: TimelineNode) => TimelineNode) => void;
    onSelectorPreviewChange?: (selector: string | null) => void;
    onSelectorTargetChange?: (target: SelectorTarget | null) => void;
    matchCounts?: Record<string, number>;
}

function createNodeForType(type: TimelineNodeType): TimelineNode {
    switch (type) {
        case 'scope': return createTimelineScopeNode();
        case 'repeater': return createTimelineRepeaterNode();
        case 'source_url': return createTimelineSourceUrlNode();
        case 'document_url': return createTimelineDocumentUrlNode();
        case 'download_file': return createTimelineDownloadFileNode();
        case 'data_extract': return createTimelineDataExtractNode();
        case 'pagination': return createTimelinePaginationNode();
        case 'remove_element': return createTimelineRemoveElementNode();
        case 'wait_selector': return createTimelineWaitSelectorNode();
        case 'wait_network': return createTimelineWaitNetworkNode();
        case 'click': return createTimelineClickNode();
        case 'scroll': return createTimelineScrollNode();
        case 'fill': return createTimelineFillNode();
        case 'select_option': return createTimelineSelectOptionNode();
        case 'timeout': return createTimelineTimeoutNode();
        case 'javascript': return createTimelineJavascriptNode();
        case 'screenshot': return createTimelineScreenshotNode();
    }
}

export function TimelineEditor({ nodes, onAddNode, onRemoveNode, onUpdateNode, onSelectorPreviewChange, onSelectorTargetChange, matchCounts }: TimelineEditorProps) {
    const handleAddAtRoot = useCallback((type: TimelineNodeType) => {
        onAddNode(null, createNodeForType(type));
    }, [onAddNode]);

    const handleAddToContainer = useCallback((parentId: string, type: TimelineNodeType) => {
        onAddNode(parentId, createNodeForType(type));
    }, [onAddNode]);

    const renderNode = (node: TimelineNode, depth: number): React.ReactNode => {
        const makeUpdater = <T extends TimelineNode>(patch: Partial<T>) => {
            onUpdateNode(node.id, (prev) => ({ ...prev, ...patch }));
        };

        switch (node.type) {
            case 'scope':
                return (
                    <ScopeNodeCard
                        key={node.id}
                        node={node}
                        depth={depth}
                        onUpdate={(p) => makeUpdater(p)}
                        onRemove={() => onRemoveNode(node.id)}
                        onSelectorPreviewChange={onSelectorPreviewChange}
                        onSelectorTargetChange={onSelectorTargetChange}
                        matchCounts={matchCounts}
                    >
                        {node.children.map((child) => renderNode(child, depth + 1))}
                        <StepChooserV2 mode="scope" onSelect={(type) => handleAddToContainer(node.id, type)} />
                    </ScopeNodeCard>
                );

            case 'repeater':
                return (
                    <RepeaterNodeCard
                        key={node.id}
                        node={node}
                        depth={depth}
                        onUpdate={(p) => makeUpdater(p)}
                        onRemove={() => onRemoveNode(node.id)}
                        onSelectorPreviewChange={onSelectorPreviewChange}
                        onSelectorTargetChange={onSelectorTargetChange}
                        matchCounts={matchCounts}
                    >
                        {node.children.map((child) => renderNode(child, depth + 1))}
                        <StepChooserV2 mode="repeater" onSelect={(type) => handleAddToContainer(node.id, type)} />
                    </RepeaterNodeCard>
                );

            case 'source_url':
                return (
                    <SourceUrlNodeCard
                        key={node.id}
                        node={node}
                        depth={depth}
                        onUpdate={(p) => makeUpdater(p)}
                        onRemove={() => onRemoveNode(node.id)}
                        onSelectorPreviewChange={onSelectorPreviewChange}
                        onSelectorTargetChange={onSelectorTargetChange}
                        matchCounts={matchCounts}
                    />
                );

            case 'document_url':
                return (
                    <DocumentUrlNodeCard
                        key={node.id}
                        node={node}
                        depth={depth}
                        onUpdate={(p) => makeUpdater(p)}
                        onRemove={() => onRemoveNode(node.id)}
                        onSelectorPreviewChange={onSelectorPreviewChange}
                        onSelectorTargetChange={onSelectorTargetChange}
                        matchCounts={matchCounts}
                    />
                );

            case 'download_file':
                return (
                    <DownloadFileNodeCard
                        key={node.id}
                        node={node}
                        depth={depth}
                        onUpdate={(p) => makeUpdater(p)}
                        onRemove={() => onRemoveNode(node.id)}
                        onSelectorPreviewChange={onSelectorPreviewChange}
                        onSelectorTargetChange={onSelectorTargetChange}
                        matchCounts={matchCounts}
                    />
                );

            case 'data_extract':
                return (
                    <DataExtractNodeCard
                        key={node.id}
                        node={node}
                        depth={depth}
                        onUpdate={(p) => makeUpdater(p)}
                        onRemove={() => onRemoveNode(node.id)}
                        onSelectorPreviewChange={onSelectorPreviewChange}
                        onSelectorTargetChange={onSelectorTargetChange}
                        matchCounts={matchCounts}
                    />
                );

            case 'pagination':
                return (
                    <PaginationNodeCard
                        key={node.id}
                        node={node}
                        depth={depth}
                        onUpdate={(p) => makeUpdater(p)}
                        onRemove={() => onRemoveNode(node.id)}
                        onSelectorPreviewChange={onSelectorPreviewChange}
                        onSelectorTargetChange={onSelectorTargetChange}
                        matchCounts={matchCounts}
                    />
                );

            case 'click':
                return (
                    <ClickNodeCard
                        key={node.id}
                        node={node}
                        depth={depth}
                        onUpdate={(p) => makeUpdater(p)}
                        onRemove={() => onRemoveNode(node.id)}
                        onSelectorPreviewChange={onSelectorPreviewChange}
                        onSelectorTargetChange={onSelectorTargetChange}
                        matchCounts={matchCounts}
                    />
                );

            case 'remove_element':
            case 'wait_selector':
            case 'wait_network':
            case 'scroll':
            case 'fill':
            case 'select_option':
            case 'screenshot':
                return (
                    <BeforeActionNodeCard
                        key={node.id}
                        node={node}
                        depth={depth}
                        onUpdate={(p) => makeUpdater(p)}
                        onRemove={() => onRemoveNode(node.id)}
                        onSelectorPreviewChange={onSelectorPreviewChange}
                        onSelectorTargetChange={onSelectorTargetChange}
                        matchCounts={matchCounts}
                    />
                );

            case 'timeout':
                return (
                    <TimeoutNodeCard
                        key={node.id}
                        node={node}
                        depth={depth}
                        onUpdate={(p) => makeUpdater(p)}
                        onRemove={() => onRemoveNode(node.id)}
                    />
                );

            case 'javascript':
                return (
                    <JavascriptNodeCard
                        key={node.id}
                        node={node}
                        depth={depth}
                        onUpdate={(p) => makeUpdater(p)}
                        onRemove={() => onRemoveNode(node.id)}
                    />
                );

            default:
                return null;
        }
    };

    return (
        <div className="space-y-1.5">
            {nodes.map((node) => renderNode(node, 0))}
            <StepChooserV2 mode="root" onSelect={handleAddAtRoot} />
        </div>
    );
}
