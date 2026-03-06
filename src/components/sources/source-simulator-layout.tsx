'use client';

import { useEffect, useState, type ReactNode, type RefObject } from 'react';

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
    /** Rendered at the top of the sidebar panel (e.g. tab switcher) */
    sidebarHeader?: ReactNode;
    /** When provided, replaces the SimulatorSidebar below the header */
    sidebarOverride?: ReactNode;
}

export function SourceSimulatorLayout({
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
    sidebarHeader,
    sidebarOverride,
}: SourceSimulatorLayoutProps) {
    const [desktopLayout, setDesktopLayout] = useState(false);

    useEffect(() => {
        const media = window.matchMedia('(min-width: 768px)');
        const syncLayout = (event: MediaQueryList | MediaQueryListEvent) => {
            setDesktopLayout(event.matches);
        };

        syncLayout(media);
        media.addEventListener('change', syncLayout);
        return () => media.removeEventListener('change', syncLayout);
    }, []);

    if (!desktopLayout) {
        return (
            <div className="flex h-full flex-col gap-4 overflow-y-auto px-4 py-4 sm:px-6">
                <section className="space-y-3">
                    <div className="flex items-center justify-between gap-2">
                        <div>
                            <h2 className="text-sm font-semibold text-foreground">Preview</h2>
                            <p className="text-xs text-muted-foreground">Nahled zdroje a vyber elementu.</p>
                        </div>
                    </div>
                    <div className="overflow-hidden rounded-xl border border-border bg-card">
                        <SimulatorFrame
                            url={baseUrl}
                            loading={simulatorLoading}
                            onLoad={onIframeLoad}
                            className="h-[min(60vh,32rem)]"
                            onElementSelect={onElementSelect}
                            onElementRemove={onElementRemove}
                            onQuickAction={onQuickAction}
                            playwrightEnabled={playwrightEnabled}
                            onPlaywrightToggleRequest={onPlaywrightToggleRequest}
                            highlightSelector={selectorPreview}
                        />
                    </div>
                </section>

                <section className="space-y-3">
                    {sidebarHeader}
                    <div className="overflow-hidden rounded-xl border border-border bg-card">
                        <div className="max-h-[70vh] overflow-y-auto">
                            {sidebarOverride ?? (
                                <SimulatorSidebar
                                    ref={sidebarRef}
                                    onWorkflowChange={onWorkflowChange}
                                    playwrightEnabled={playwrightEnabled}
                                    onSelectorPreviewChange={onSelectorPreviewChange}
                                />
                            )}
                        </div>
                    </div>
                </section>
            </div>
        );
    }

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
                <div className="flex h-full flex-col">
                    {sidebarHeader}
                    <div className="flex-1 overflow-hidden">
                        {sidebarOverride ?? (
                            <SimulatorSidebar
                                ref={sidebarRef}
                                onWorkflowChange={onWorkflowChange}
                                playwrightEnabled={playwrightEnabled}
                                onSelectorPreviewChange={onSelectorPreviewChange}
                            />
                        )}
                    </div>
                </div>
            </ResizablePanel>
        </ResizablePanelGroup>
    );
}
