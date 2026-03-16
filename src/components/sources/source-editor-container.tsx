'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type MutableRefObject } from 'react';
import { useSearchParams } from 'next/navigation';
import { PanelBottomOpen, PanelRightOpen } from 'lucide-react';
import { toast } from 'sonner';

import { type RssAuthoringValues } from '@/components/sources/rss-authoring-panel';
import { type FeedPreview } from '@/components/sources/rss-preview-panel';
import { RssToolboxPanel } from '@/components/sources/rss-toolbox-panel';
import { XmlWorkspace } from '@/components/sources/rss/xml-workspace';
import { SourceMetadataForm } from '@/components/sources/source-metadata-form';
import { SourceSimulatorLayout } from '@/components/sources/source-simulator-layout';
import { SimulatorSidebarV2, type SimulatorSidebarV2Ref } from '@/components/sources/timeline/simulator-sidebar-v2';
import type { SelectorTarget } from '@/components/sources/timeline/nodes/use-selector-preview';
import { ToolboxTabs, type ToolboxTab } from '@/components/sources/toolbox-tabs';
import { useObecSearch } from '@/components/sources/hooks/use-obec-search';
import { useRssDetection } from '@/components/sources/hooks/use-rss-detection';
import { useRssSampling } from '@/components/sources/hooks/use-rss-sampling';
import { useSourceLoad } from '@/components/sources/hooks/use-source-load';
import { useSourceSubmit } from '@/components/sources/hooks/use-source-submit';
import { useSourceTypes } from '@/components/sources/hooks/use-source-types';
import type { CrawlStrategy } from '@/components/sources/types';
import {
    SimulatorSidebarRef,
    SidebarQuickAction,
} from '@/components/simulator/simulator-sidebar';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { ElementSelector, ScrapingWorkflow, type ScrapingWorkflowV2 } from '@/lib/crawler-types';
import { buildRssAuthoringSummary, buildRssSourceConfig } from '@/lib/source-config';

const DEFAULT_RSS_AUTHORING: RssAuthoringValues = {
    singlePage: true,
    allowHtmlDocuments: false,
    usePlaywright: false,
    entryLinkSelector: '',
    documentUrlSelector: '',
    documentUrlExtract: 'href',
    filenameSelector: '',
    filenameExtract: 'text',
    processingUsePlaywright: false,
};

/** Map CrawlStrategy → ToolboxTab */
function strategyToTab(strategy: CrawlStrategy): ToolboxTab {
    return strategy === 'rss' ? 'rss' : 'path';
}

/** Map ToolboxTab → CrawlStrategy */
function tabToStrategy(tab: ToolboxTab): CrawlStrategy {
    return tab === 'rss' ? 'rss' : 'list';
}

export function SourceEditorContainer() {
    const searchParams = useSearchParams();
    const editSourceId = searchParams.get('edit');
    const isEditMode = Boolean(editSourceId);
    const { source: loadedSource, workflow: loadedWorkflow, workflowV2: loadedWorkflowV2, loading: sourceLoading } = useSourceLoad(editSourceId);

    const [name, setName] = useState('');
    const [typeId, setTypeId] = useState('');
    const [baseUrl, setBaseUrl] = useState('');
    const [crawlStrategy, setCrawlStrategy] = useState<CrawlStrategy>('list');
    const [crawlInterval, setCrawlInterval] = useState('1 day');

    const [simulatorLoading, setSimulatorLoading] = useState(false);
    const [workflowData, setWorkflowData] = useState<ScrapingWorkflow | null>(null);
    const [playwrightEnabled, setPlaywrightEnabled] = useState(false);
    const [selectorPreview, setSelectorPreview] = useState<string | null>(null);
    const [showPlaywrightConfirm, setShowPlaywrightConfirm] = useState(false);
    const [panelPlacement, setPanelPlacement] = useState<'right' | 'bottom'>('right');

    const [rssPreview, setRssPreview] = useState<FeedPreview | null>(null);
    const [rssPreviewLoading, setRssPreviewLoading] = useState(false);
    const [rssPreviewError, setRssPreviewError] = useState<string | null>(null);

    // RSS authoring state
    const [rssAuthoring, setRssAuthoring] = useState<RssAuthoringValues>(DEFAULT_RSS_AUTHORING);

    // Toolbox tab state mirrors the effective strategy chosen by toolbox or RSS autodetect
    const [activeToolboxTab, setActiveToolboxTab] = useState<ToolboxTab>('path');

    const sidebarRef = useRef<SimulatorSidebarRef>(null);
    const sidebarV2Ref = useRef<SimulatorSidebarV2Ref>(null);
    const [workflowDataV2, setWorkflowDataV2] = useState<ScrapingWorkflowV2 | null>(null);
    const selectorTargetRef = useRef<SelectorTarget | null>(null) as MutableRefObject<SelectorTarget | null>;
    const [matchCounts, setMatchCounts] = useState<Record<string, number>>({});

    const { sourceTypes, loadingTypes } = useSourceTypes();

    const {
        selectedObec,
        obecSearch,
        obecResults,
        showObecDropdown,
        searchingObec,
        obecDropdownRef,
        onObecInputChange,
        onSelectObec,
        resetObec,
    } = useObecSearch();

    const {
        detectingRss,
        detectionStatus,
        rssFeedOptions,
        selectedRssFeed,
        rssWarnings,
        probeResult,
        setSelectedRssFeed,
        detectRssFeeds,
        autoDetectOnUrl,
        applySelectedRssFeed,
        clearRssFeeds,
    } = useRssDetection({
        baseUrl,
        setCrawlStrategy,
        setPlaywrightEnabled,
    });

    const { sampling, sampleResult, sampleError, runSampling, clearSampling } = useRssSampling();

    const { submitting, submitSource } = useSourceSubmit({
        editSourceId: editSourceId ?? undefined,
        onSubmitted: () => {
            if (!isEditMode) {
                setName('');
                setTypeId('');
                setBaseUrl('');
                setSimulatorLoading(false);
                setCrawlStrategy('list');
                setCrawlInterval('1 day');
                clearRssFeeds();
                resetObec();
                setWorkflowData(null);
                setPlaywrightEnabled(false);
                setSelectorPreview(null);
                setRssPreview(null);
                setRssPreviewLoading(false);
                setRssPreviewError(null);
                setRssAuthoring(DEFAULT_RSS_AUTHORING);
                setActiveToolboxTab('path');
                setWorkflowDataV2(null);
                sidebarRef.current?.reset();
                sidebarV2Ref.current?.reset();
            }
        },
    });

    // Keep toolbox tab aligned when strategy changes programmatically.
    useEffect(() => {
        setActiveToolboxTab(strategyToTab(crawlStrategy));
    }, [crawlStrategy]);

    // Compute RSS summary and JSON preview on the fly
    const rssSummary = useMemo(() => {
        if (crawlStrategy !== 'rss') return '';
        const feedUrl = selectedRssFeed || baseUrl;
        if (!feedUrl) return '';
        return buildRssAuthoringSummary({
            feedUrl,
            singlePage: rssAuthoring.singlePage,
            allowHtmlDocuments: rssAuthoring.allowHtmlDocuments,
            usePlaywright: rssAuthoring.usePlaywright,
            entryLinkSelector: rssAuthoring.entryLinkSelector,
            documentUrlSelector: rssAuthoring.documentUrlSelector,
        });
    }, [crawlStrategy, selectedRssFeed, baseUrl, rssAuthoring]);

    const rssConfigPreview = useMemo(() => {
        if (crawlStrategy !== 'rss') return null;
        const feedUrl = (selectedRssFeed || baseUrl).trim();
        if (!feedUrl || !/^https?:\/\//.test(feedUrl)) return null;
        try {
            return buildRssSourceConfig({
                feedUrl,
                detectedFeedCandidates: rssFeedOptions,
                warnings: rssWarnings,
                singlePage: rssAuthoring.singlePage,
                allowHtmlDocuments: rssAuthoring.allowHtmlDocuments,
                usePlaywright: rssAuthoring.usePlaywright,
                entryLinkSelector: rssAuthoring.entryLinkSelector,
                documentUrlSelector: rssAuthoring.documentUrlSelector,
                documentUrlExtract: rssAuthoring.documentUrlExtract,
                filenameSelector: rssAuthoring.filenameSelector,
                filenameExtract: rssAuthoring.filenameExtract,
                processingUsePlaywright: rssAuthoring.processingUsePlaywright,
                probeResult,
            });
        } catch {
            return null;
        }
    }, [crawlStrategy, selectedRssFeed, baseUrl, rssFeedOptions, rssWarnings, rssAuthoring, probeResult]);

    // Validate CSS selector shape
    const selectorValidationError = useMemo(() => {
        const sel = rssAuthoring.entryLinkSelector.trim();
        if (!sel) return null;
        if (/^[0-9]/.test(sel)) return 'CSS selektor nesmi zacinat cislem';
        if (/[{}]/.test(sel)) return 'CSS selektor nesmi obsahovat slozene zavorky';
        return null;
    }, [rssAuthoring.entryLinkSelector]);

    // Fetch RSS feed preview when strategy is RSS and URL is valid
    useEffect(() => {
        const effectiveUrl = selectedRssFeed || baseUrl;

        if (crawlStrategy !== 'rss' || !effectiveUrl || !/^https?:\/\//.test(effectiveUrl)) {
            setRssPreview(null);
            setRssPreviewLoading(false);
            setRssPreviewError(null);
            return;
        }

        const controller = new AbortController();
        setRssPreviewLoading(true);
        setRssPreviewError(null);

        fetch(`/api/sources/rss-preview?url=${encodeURIComponent(effectiveUrl)}`, {
            signal: controller.signal,
        })
            .then(async (res) => {
                if (!res.ok) {
                    const body = await res.text();
                    throw new Error(body || `HTTP ${res.status}`);
                }
                return res.json() as Promise<FeedPreview>;
            })
            .then((data) => {
                setRssPreview(data);
                setRssPreviewLoading(false);
            })
            .catch((err: unknown) => {
                if (err instanceof Error && err.name === 'AbortError') return;
                setRssPreviewError(err instanceof Error ? err.message : 'Nelze nacist nahled feedu');
                setRssPreviewLoading(false);
            });

        return () => {
            controller.abort();
        };
    }, [crawlStrategy, baseUrl, selectedRssFeed]);

    // Populate form fields when editing an existing source
    useEffect(() => {
        if (!loadedSource) return;
        setName(loadedSource.name ?? '');
        setTypeId(String(loadedSource.typ_id ?? ''));
        setBaseUrl(loadedSource.base_url ?? '');
        setCrawlStrategy((loadedSource.crawl_strategy as CrawlStrategy) ?? 'list');
        setCrawlInterval(loadedSource.crawl_interval ?? '1 day');
        if (loadedSource.base_url) {
            setSimulatorLoading(true);
        }
        if (loadedWorkflow) {
            setWorkflowData(loadedWorkflow);
            setPlaywrightEnabled(loadedWorkflow.playwright_enabled ?? false);
        }
        if (loadedWorkflowV2) {
            setWorkflowDataV2(loadedWorkflowV2);
            sidebarV2Ref.current?.reset(loadedWorkflowV2);
        }
        // Restore RSS authoring values from saved crawl_params when in RSS mode
        if (loadedSource.crawl_strategy === 'rss' && loadedSource.crawl_params) {
            const cp = loadedSource.crawl_params as Record<string, unknown>;
            const processing = (cp.processing ?? {}) as Record<string, unknown>;
            setRssAuthoring({
                singlePage: cp.single_page !== false,
                allowHtmlDocuments: cp.allow_html_documents === true,
                usePlaywright: cp.use_playwright === true,
                entryLinkSelector: typeof cp.entry_link_selector === 'string' ? cp.entry_link_selector : '',
                documentUrlSelector: typeof processing.document_url_selector === 'string' ? processing.document_url_selector : '',
                documentUrlExtract: processing.document_url_extract === 'text' ? 'text' : 'href',
                filenameSelector: typeof processing.filename_selector === 'string' ? processing.filename_selector : '',
                filenameExtract: processing.filename_extract === 'text' ? 'text' : 'href',
                processingUsePlaywright: processing.use_playwright === true,
            });
        }
    }, [loadedSource, loadedWorkflow, loadedWorkflowV2]);

    const handleMatchCount = useCallback((selector: string, count: number) => {
        setMatchCounts((prev) => {
            if (prev[selector] === count) return prev;
            return { ...prev, [selector]: count };
        });
    }, []);

    const handleSelectorTargetChange = useCallback((target: SelectorTarget | null) => {
        if (target !== null) {
            selectorTargetRef.current = target;
        }
    }, []);

    const handleElementSelect = (selector: string, elementInfo?: ElementSelector) => {
        const target = selectorTargetRef.current;
        if (activeToolboxTab === 'path' && target && sidebarV2Ref.current) {
            const patternSelector = elementInfo?.patternSelector || selector;
            sidebarV2Ref.current.fillSelectorTarget(target, patternSelector);
            selectorTargetRef.current = null;
            toast.success('Selector byl vlozen do aktivniho pole.');
            return;
        }

        if (sidebarRef.current?.applySelectedSelector(selector, elementInfo)) {
            toast.success('Selector byl vlozen do aktivniho pole.');
            return;
        }

        toast.info('Fokusujte CSS input v panelu workflow a pak kliknete na element.');
    };

    const handleElementRemove = (selector: string) => {
        if (activeToolboxTab === 'path') {
            toast.info('Ve V2 timeline použij picker na konkrétním node místo rychlého Remove Element.');
            return;
        }
        sidebarRef.current?.appendRemoveElementBeforeAction(selector);
        toast.success('Pridan Before step: Remove Element.');
    };

    const handleQuickAction = (action: SidebarQuickAction, selector: string, elementInfo?: ElementSelector) => {
        if (activeToolboxTab === 'path') {
            toast.info('Rychlé akce preview nejsou pro timeline editor zapojené. Použij node picker v panelu.');
            return;
        }
        sidebarRef.current?.applyQuickAction(action, selector, elementInfo);
        toast.success('Workflow aktualizovan z preview inspektoru.');
    };

    const handlePlaywrightToggleRequest = (nextEnabled: boolean) => {
        const hasTimelinePlaywrightNodes = (nodes: ScrapingWorkflowV2['discovery'] | null | undefined): boolean => {
            if (!nodes) return false;
            return nodes.some((node) => {
                if (
                    node.type === 'wait_selector'
                    || node.type === 'wait_network'
                    || node.type === 'click'
                    || node.type === 'scroll'
                    || node.type === 'fill'
                    || node.type === 'select_option'
                    || node.type === 'javascript'
                    || node.type === 'screenshot'
                ) {
                    return true;
                }
                if (node.type === 'scope' || node.type === 'repeater') {
                    return hasTimelinePlaywrightNodes(node.children);
                }
                return false;
            });
        };

        if (crawlStrategy === 'rss' && nextEnabled) {
            toast.info('Playwright neni pro RSS feed potreba.');
            return false;
        }
        const hasPlaywrightActions = activeToolboxTab === 'path'
            ? hasTimelinePlaywrightNodes(workflowDataV2?.discovery) || hasTimelinePlaywrightNodes(workflowDataV2?.process)
            : Boolean(sidebarRef.current?.hasAnyPlaywrightActions());

        if (!nextEnabled && hasPlaywrightActions) {
            setShowPlaywrightConfirm(true);
            return false;
        }
        setPlaywrightEnabled(nextEnabled);
        return true;
    };

    const handlePlaywrightDisableConfirm = () => {
        if (activeToolboxTab === 'path') {
            const stripPlaywrightNodes = (nodes: ScrapingWorkflowV2['discovery']): ScrapingWorkflowV2['discovery'] => nodes.flatMap((node) => {
                if (
                    node.type === 'wait_selector'
                    || node.type === 'wait_network'
                    || node.type === 'click'
                    || node.type === 'scroll'
                    || node.type === 'fill'
                    || node.type === 'select_option'
                    || node.type === 'javascript'
                    || node.type === 'screenshot'
                ) {
                    return [];
                }
                if (node.type === 'scope' || node.type === 'repeater') {
                    return [{ ...node, children: stripPlaywrightNodes(node.children) }];
                }
                return [node];
            });

            setWorkflowDataV2((current) => {
                if (!current) return current;
                const nextWorkflow: ScrapingWorkflowV2 = {
                    ...current,
                    discovery: stripPlaywrightNodes(current.discovery),
                    process: current.process ? stripPlaywrightNodes(current.process) : null,
                };
                sidebarV2Ref.current?.reset(nextWorkflow);
                return nextWorkflow;
            });
        } else {
            sidebarRef.current?.clearAllPlaywrightActions();
        }
        setPlaywrightEnabled(false);
        setShowPlaywrightConfirm(false);
    };

    const handleIframeLoad = () => {
        setSimulatorLoading(false);
    };

    const handleFormSubmit = async (event: FormEvent) => {
        event.preventDefault();

        if (crawlStrategy === 'rss' && selectorValidationError) {
            toast.error(selectorValidationError);
            return;
        }

        await submitSource({
            name,
            typeId,
            baseUrl,
            crawlStrategy,
            crawlInterval,
            workflowData,
            workflowDataV2,
            playwrightEnabled,
            obec: selectedObec,
            selectedRssFeed,
            rssFeedOptions,
            rssWarnings,
            rssAuthoring,
            probeResult,
        });
    };

    const handleBaseUrlChange = (value: string) => {
        setBaseUrl(value);
        setSimulatorLoading(value.startsWith('http'));
        clearRssFeeds();
    };

    const handleBaseUrlBlur = () => {
        void autoDetectOnUrl(baseUrl);
    };

    const handleCrawlStrategyChange = (value: CrawlStrategy) => {
        setCrawlStrategy(value);
        if (value === 'rss') {
            setPlaywrightEnabled(false);
        }
        if (value !== 'rss') {
            setRssAuthoring(DEFAULT_RSS_AUTHORING);
        }
    };

    const handleToolboxTabChange = (tab: ToolboxTab) => {
        setActiveToolboxTab(tab);
        const newStrategy = tabToStrategy(tab);
        if (newStrategy !== crawlStrategy) {
            handleCrawlStrategyChange(newStrategy);
        }
    };

    const handleSelectProbeCandidate = (feedUrl: string) => {
        setSelectedRssFeed(feedUrl);
    };

    const handleRunSampling = useCallback(() => {
        const feedUrl = selectedRssFeed || baseUrl;
        void runSampling(feedUrl);
    }, [selectedRssFeed, baseUrl, runSampling]);

    const handleApplySuggestedSelector = useCallback((selector: string) => {
        setRssAuthoring((prev) => ({
            ...prev,
            singlePage: false,
            documentUrlSelector: selector,
            documentUrlExtract: 'href',
        }));
        toast.success('Selektor aplikovan');
    }, []);

    // Sidebar header: tab switcher (always visible above sidebar content)
    const sidebarHeader = (
        <ToolboxTabs
            activeTab={activeToolboxTab}
            onTabChange={handleToolboxTabChange}
            rightSlot={(
                <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    className="hidden md:inline-flex text-muted-foreground hover:text-foreground"
                    onClick={() => setPanelPlacement((current) => current === 'right' ? 'bottom' : 'right')}
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
            )}
        />
    );

    // RSS feed URL for XML workspace
    const effectiveRssFeedUrl = selectedRssFeed || baseUrl;

    // Sidebar override: RSS tab uses RSS toolbox, Path tab uses the prepared V2 timeline editor
    const sidebarOverride = activeToolboxTab === 'rss' ? (
        <RssToolboxPanel
            baseUrl={baseUrl}
            detectingRss={detectingRss}
            detectionStatus={detectionStatus}
            onDetectRssFeeds={() => void detectRssFeeds()}
            rssFeedOptions={rssFeedOptions}
            selectedRssFeed={selectedRssFeed}
            onSelectedRssFeedChange={setSelectedRssFeed}
            onApplySelectedRssFeed={applySelectedRssFeed}
            probeResult={probeResult}
            onSelectCandidate={handleSelectProbeCandidate}
            rssPreview={rssPreview}
            rssPreviewLoading={rssPreviewLoading}
            rssPreviewError={rssPreviewError}
            rssAuthoring={rssAuthoring}
            onRssAuthoringChange={setRssAuthoring}
            selectorError={selectorValidationError}
            sampling={sampling}
            sampleResult={sampleResult}
            sampleError={sampleError}
            onRunSampling={handleRunSampling}
            onApplySuggestedSelector={handleApplySuggestedSelector}
            rssSummary={rssSummary}
            crawlParamsPreview={
                rssConfigPreview
                    ? (rssConfigPreview.crawl_params as unknown as Record<string, unknown>)
                    : null
            }
            extractionDataPreview={
                rssConfigPreview
                    ? (rssConfigPreview.extraction_data as unknown as Record<string, unknown>)
                    : null
            }
        />
    ) : (
        <SimulatorSidebarV2
            ref={sidebarV2Ref}
            initialWorkflow={workflowDataV2}
            onWorkflowChange={setWorkflowDataV2}
            onSelectorPreviewChange={setSelectorPreview}
            onSelectorTargetChange={handleSelectorTargetChange}
            matchCounts={matchCounts}
        />
    );

    // Frame override: RSS mode shows XML workspace instead of iframe
    const frameOverride = activeToolboxTab === 'rss' ? (
        <XmlWorkspace feedUrl={effectiveRssFeedUrl} className="h-full" />
    ) : undefined;

    return (
        <div className="flex h-full min-h-0 w-full flex-1 flex-col">
            <form onSubmit={handleFormSubmit} className="relative z-10 border-b border-border bg-card/50 px-4 py-4 sm:px-6">
                <SourceMetadataForm
                    name={name}
                    onNameChange={setName}
                    typeId={typeId}
                    onTypeIdChange={setTypeId}
                    sourceTypes={sourceTypes}
                    loadingTypes={loadingTypes}
                    selectedObec={selectedObec}
                    obecSearch={obecSearch}
                    searchingObec={searchingObec}
                    showObecDropdown={showObecDropdown}
                    obecResults={obecResults}
                    obecDropdownRef={obecDropdownRef}
                    onObecInputChange={onObecInputChange}
                    onSelectObec={onSelectObec}
                    baseUrl={baseUrl}
                    onBaseUrlChange={handleBaseUrlChange}
                    onBaseUrlBlur={handleBaseUrlBlur}
                    crawlInterval={crawlInterval}
                    onCrawlIntervalChange={setCrawlInterval}
                    submitting={submitting}
                    editMode={isEditMode}
                    sourceLoading={sourceLoading}
                />
            </form>

            <div className="flex-1 overflow-hidden min-h-0">
                <SourceSimulatorLayout
                    sidebarRef={sidebarRef}
                    baseUrl={baseUrl}
                    simulatorLoading={simulatorLoading}
                    selectorPreview={selectorPreview}
                    playwrightEnabled={playwrightEnabled}
                    onIframeLoad={handleIframeLoad}
                    onElementSelect={handleElementSelect}
                    onElementRemove={handleElementRemove}
                    onQuickAction={handleQuickAction}
                    onPlaywrightToggleRequest={handlePlaywrightToggleRequest}
                    onWorkflowChange={setWorkflowData}
                    onSelectorPreviewChange={setSelectorPreview}
                    onMatchCount={handleMatchCount}
                    sidebarHeader={sidebarHeader}
                    sidebarOverride={sidebarOverride}
                    frameOverride={frameOverride}
                    panelPlacement={panelPlacement}
                    onPanelPlacementChange={setPanelPlacement}
                    hideSelectedElement={activeToolboxTab === 'path'}
                />
            </div>

            <AlertDialog open={showPlaywrightConfirm} onOpenChange={setShowPlaywrightConfirm}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Vypnout Playwright?</AlertDialogTitle>
                        <AlertDialogDescription>
                            Vypnuti Playwright odstrani vsechny Playwright kroky ve Phase 1 i Phase 2. Tuto akci nelze vratit.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Zrusit</AlertDialogCancel>
                        <AlertDialogAction onClick={handlePlaywrightDisableConfirm}>
                            Vypnout
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
