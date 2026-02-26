'use client';

import { RefObject } from 'react';

import { SimulatorFrame } from '@/components/simulator/simulator-frame';
import {
    SimulatorSidebar,
    SimulatorSidebarRef,
    SidebarQuickAction,
} from '@/components/simulator/simulator-sidebar';
import { ElementSelector, ScrapingWorkflow } from '@/lib/crawler-types';
import {
    ResizableHandle,
    ResizablePanel,
    ResizablePanelGroup,
} from '@/components/ui/resizable';

interface SourceSimulatorLayoutProps {
    sidebarKey: number;
    sidebarRef: RefObject<SimulatorSidebarRef | null>;
    baseUrl: string;
    simulatorLoading: boolean;
    selectorPreview: string | null;
    playwrightEnabled: boolean;
    onIframeLoad: () => void;
    onElementSelect: (selector: string, elementInfo?: ElementSelector) => void;
    onElementRemove: (selector: string) => void;
    onQuickAction: (action: SidebarQuickAction, selector: string, elementInfo?: ElementSelector) => void;
    onPlaywrightToggleRequest: (nextEnabled: boolean) => boolean;
    onWorkflowChange: (workflowData: ScrapingWorkflow) => void;
    onSelectorPreviewChange: (selector: string | null) => void;
}

export function SourceSimulatorLayout({
    sidebarKey,
    sidebarRef,
    baseUrl,
    simulatorLoading,
    selectorPreview,
    playwrightEnabled,
    onIframeLoad,
    onElementSelect,
    onElementRemove,
    onQuickAction,
    onPlaywrightToggleRequest,
    onWorkflowChange,
    onSelectorPreviewChange,
}: SourceSimulatorLayoutProps) {
    return (
        <ResizablePanelGroup direction="horizontal">
            <ResizablePanel defaultSize={75} minSize={30}>
                <SimulatorFrame
                    url={baseUrl}
                    loading={simulatorLoading}
                    onLoad={onIframeLoad}
                    className="h-full"
                    onElementSelect={onElementSelect}
                    onElementRemove={onElementRemove}
                    onQuickAction={onQuickAction}
                    playwrightEnabled={playwrightEnabled}
                    onPlaywrightToggleRequest={onPlaywrightToggleRequest}
                    highlightSelector={selectorPreview}
                />
            </ResizablePanel>

            <ResizableHandle />

            <ResizablePanel defaultSize={25} minSize={15} maxSize={50}>
                <SimulatorSidebar
                    key={sidebarKey}
                    ref={sidebarRef}
                    onWorkflowChange={onWorkflowChange}
                    playwrightEnabled={playwrightEnabled}
                    onSelectorPreviewChange={onSelectorPreviewChange}
                />
            </ResizablePanel>
        </ResizablePanelGroup>
    );
}
