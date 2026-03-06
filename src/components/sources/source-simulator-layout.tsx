'use client';

import { useEffect, useState, type ReactNode, type RefObject } from 'react';
import { PanelBottomOpen, PanelRightOpen } from 'lucide-react';

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
import { Button } from '@/components/ui/button';

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
    panelPlacement: 'right' | 'bottom';
    onPanelPlacementChange: (placement: 'right' | 'bottom') => void;
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
    panelPlacement,
    onPanelPlacementChange,
}: SourceSimulatorLayoutProps) {
    const [desktopLayout, setDesktopLayout] = useState(false);

    const renderSidebarContent = (placement: 'right' | 'bottom') => placement === 'bottom'
        ? (sidebarOverride ?? (
            <SimulatorSidebar
                ref={sidebarRef}
                className="h-auto min-h-[32rem] border-l-0"
                onWorkflowChange={onWorkflowChange}
                playwrightEnabled={playwrightEnabled}
                onSelectorPreviewChange={onSelectorPreviewChange}
            />
        ))
        : (sidebarOverride ?? (
            <SimulatorSidebar
                ref={sidebarRef}
                onWorkflowChange={onWorkflowChange}
                playwrightEnabled={playwrightEnabled}
                onSelectorPreviewChange={onSelectorPreviewChange}
            />
        ));

    const layoutToggle = (
        <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="hidden md:inline-flex text-muted-foreground hover:text-foreground"
            onClick={() => onPanelPlacementChange(panelPlacement === 'right' ? 'bottom' : 'right')}
            aria-label={panelPlacement === 'right'
                ? 'Presunout panel pod preview'
                : 'Presunout panel vpravo'}
            title={panelPlacement === 'right'
                ? 'Presunout panel pod preview'
                : 'Presunout panel vpravo'}
        >
            {panelPlacement === 'right' ? (
                <PanelBottomOpen className="h-4 w-4" />
            ) : (
                <PanelRightOpen className="h-4 w-4" />
            )}
        </Button>
    );

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
                            {renderSidebarContent('right')}
                        </div>
                    </div>
                </section>
            </div>
        );
    }

    if (panelPlacement === 'bottom') {
        return (
            <div className="h-full overflow-y-auto">
                <div className="flex min-h-full flex-col">
                    <div className="min-h-[32rem] shrink-0">
                        <SimulatorFrame
                            url={baseUrl}
                            loading={simulatorLoading}
                            onLoad={onIframeLoad}
                            className="h-[min(68vh,48rem)] min-h-[32rem]"
                            onElementSelect={onElementSelect}
                            onElementRemove={onElementRemove}
                            onQuickAction={onQuickAction}
                            playwrightEnabled={playwrightEnabled}
                            onPlaywrightToggleRequest={onPlaywrightToggleRequest}
                            highlightSelector={selectorPreview}
                        />
                    </div>

                    <div className="shrink-0 border-t border-border bg-card/50 backdrop-blur-sm">
                        {sidebarHeader}
                        <div className="min-h-[32rem]">
                            {renderSidebarContent('bottom')}
                        </div>
                    </div>
                </div>
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
                    {sidebarHeader ?? layoutToggle}
                    <div className="flex-1 overflow-hidden">
                        {renderSidebarContent('right')}
                    </div>
                </div>
            </ResizablePanel>
        </ResizablePanelGroup>
    );
}
