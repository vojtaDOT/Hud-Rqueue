'use client';

import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useSearchParams } from 'next/navigation';
import { toast } from 'sonner';

import { type RssAuthoringValues } from '@/components/sources/rss-authoring-panel';
import { type FeedPreview } from '@/components/sources/rss-preview-panel';
import { RssToolboxPanel } from '@/components/sources/rss-toolbox-panel';
import { SourceMetadataForm } from '@/components/sources/source-metadata-form';
import { SourceSimulatorLayout } from '@/components/sources/source-simulator-layout';
import { ToolboxTabs, type ToolboxTab } from '@/components/sources/toolbox-tabs';
import { useObecSearch } from '@/components/sources/hooks/use-obec-search';
import { useRssDetection } from '@/components/sources/hooks/use-rss-detection';
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
import { ElementSelector, ScrapingWorkflow } from '@/lib/crawler-types';
import { buildRssAuthoringSummary, buildRssSourceConfig } from '@/lib/source-config';

const DEFAULT_RSS_AUTHORING: RssAuthoringValues = {
    allowHtmlDocuments: false,
    usePlaywright: false,
    entryLinkSelector: '',
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
    const { source: loadedSource, workflow: loadedWorkflow, loading: sourceLoading } = useSourceLoad(editSourceId);

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

    const [rssPreview, setRssPreview] = useState<FeedPreview | null>(null);
    const [rssPreviewLoading, setRssPreviewLoading] = useState(false);
    const [rssPreviewError, setRssPreviewError] = useState<string | null>(null);

    // RSS authoring state
    const [rssAuthoring, setRssAuthoring] = useState<RssAuthoringValues>(DEFAULT_RSS_AUTHORING);

    // Toolbox tab state mirrors the effective strategy chosen by toolbox or RSS autodetect
    const [activeToolboxTab, setActiveToolboxTab] = useState<ToolboxTab>('path');

    const sidebarRef = useRef<SimulatorSidebarRef>(null);

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
                sidebarRef.current?.reset();
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
            allowHtmlDocuments: rssAuthoring.allowHtmlDocuments,
            usePlaywright: rssAuthoring.usePlaywright,
            entryLinkSelector: rssAuthoring.entryLinkSelector,
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
                allowHtmlDocuments: rssAuthoring.allowHtmlDocuments,
                usePlaywright: rssAuthoring.usePlaywright,
                entryLinkSelector: rssAuthoring.entryLinkSelector,
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
        // Restore RSS authoring values from saved crawl_params when in RSS mode
        if (loadedSource.crawl_strategy === 'rss' && loadedSource.crawl_params) {
            const cp = loadedSource.crawl_params as Record<string, unknown>;
            setRssAuthoring({
                allowHtmlDocuments: cp.allow_html_documents === true,
                usePlaywright: cp.use_playwright === true,
                entryLinkSelector: typeof cp.entry_link_selector === 'string' ? cp.entry_link_selector : '',
            });
        }
    }, [loadedSource, loadedWorkflow]);

    const handleElementSelect = (selector: string, elementInfo?: ElementSelector) => {
        const applied = sidebarRef.current?.applySelectedSelector(selector, elementInfo) ?? false;
        if (!applied) {
            toast.info('Vyberte cilovy Scope/Repeater nebo fokusujte CSS input v panelu workflow.');
        } else {
            toast.success('Selector byl vlozen do aktivniho pole.');
        }
    };

    const handleElementRemove = (selector: string) => {
        sidebarRef.current?.appendRemoveElementBeforeAction(selector);
        toast.success('Pridan Before step: Remove Element.');
    };

    const handleQuickAction = (action: SidebarQuickAction, selector: string, elementInfo?: ElementSelector) => {
        sidebarRef.current?.applyQuickAction(action, selector, elementInfo);
        toast.success('Workflow aktualizovan z preview inspektoru.');
    };

    const handlePlaywrightToggleRequest = (nextEnabled: boolean) => {
        if (crawlStrategy === 'rss' && nextEnabled) {
            toast.info('Playwright neni pro RSS feed potreba.');
            return false;
        }
        if (!nextEnabled && sidebarRef.current?.hasAnyPlaywrightActions()) {
            setShowPlaywrightConfirm(true);
            return false;
        }
        setPlaywrightEnabled(nextEnabled);
        return true;
    };

    const handlePlaywrightDisableConfirm = () => {
        sidebarRef.current?.clearAllPlaywrightActions();
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

    // Sidebar header: tab switcher (always visible above sidebar content)
    const sidebarHeader = (
        <ToolboxTabs
            activeTab={activeToolboxTab}
            onTabChange={handleToolboxTabChange}
        />
    );

    // Sidebar override: only when RSS tab active — replaces SimulatorSidebar
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
    ) : undefined;

    return (
        <div className="flex h-full w-full flex-col">
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
                    sidebarHeader={sidebarHeader}
                    sidebarOverride={sidebarOverride}
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
