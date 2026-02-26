'use client';

import { useRef, useState, type FormEvent } from 'react';
import { toast } from 'sonner';

import { RssDetectionPanel } from '@/components/sources/rss-detection-panel';
import { SourceMetadataForm } from '@/components/sources/source-metadata-form';
import { SourceSimulatorLayout } from '@/components/sources/source-simulator-layout';
import { useObecSearch } from '@/components/sources/hooks/use-obec-search';
import { useRssDetection } from '@/components/sources/hooks/use-rss-detection';
import { useSourceSubmit } from '@/components/sources/hooks/use-source-submit';
import { useSourceTypes } from '@/components/sources/hooks/use-source-types';
import type { CrawlStrategy } from '@/components/sources/types';
import {
    SimulatorSidebarRef,
    SidebarQuickAction,
} from '@/components/simulator/simulator-sidebar';
import { ElementSelector, ScrapingWorkflow } from '@/lib/crawler-types';

export function SourceEditorContainer() {
    const [name, setName] = useState('');
    const [typeId, setTypeId] = useState('');
    const [baseUrl, setBaseUrl] = useState('');
    const [crawlStrategy, setCrawlStrategy] = useState<CrawlStrategy>('list');

    const [simulatorLoading, setSimulatorLoading] = useState(false);
    const [workflowData, setWorkflowData] = useState<ScrapingWorkflow | null>(null);
    const [playwrightEnabled, setPlaywrightEnabled] = useState(false);
    const [selectorPreview, setSelectorPreview] = useState<string | null>(null);
    const [sidebarKey, setSidebarKey] = useState(0);

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
        rssFeedOptions,
        selectedRssFeed,
        setSelectedRssFeed,
        detectRssFeeds,
        applySelectedRssFeed,
        clearRssFeeds,
    } = useRssDetection({
        baseUrl,
        setBaseUrl,
        setCrawlStrategy,
        setPlaywrightEnabled,
    });

    const { submitting, submitSource } = useSourceSubmit({
        onSubmitted: () => {
            setName('');
            setTypeId('');
            setBaseUrl('');
            setSimulatorLoading(false);
            setCrawlStrategy('list');
            clearRssFeeds();
            resetObec();
            setWorkflowData(null);
            setPlaywrightEnabled(false);
            setSelectorPreview(null);
            setSidebarKey((prev) => prev + 1);
        },
    });

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
            const confirmed = window.confirm(
                'Vypnuti Playwright odstrani Playwright kroky ve Phase 1 i Phase 2. Pokracovat?',
            );
            if (!confirmed) return false;
            sidebarRef.current.clearAllPlaywrightActions();
        }
        setPlaywrightEnabled(nextEnabled);
        return true;
    };

    const handleIframeLoad = () => {
        setSimulatorLoading(false);
    };

    const handleFormSubmit = async (event: FormEvent) => {
        event.preventDefault();
        await submitSource({
            name,
            typeId,
            baseUrl,
            crawlStrategy,
            workflowData,
            playwrightEnabled,
            obec: selectedObec,
        });
    };

    const handleBaseUrlChange = (value: string) => {
        setBaseUrl(value);
        setSimulatorLoading(value.startsWith('http'));
        clearRssFeeds();
    };

    const handleCrawlStrategyChange = (value: CrawlStrategy) => {
        setCrawlStrategy(value);
        if (value === 'rss') {
            setPlaywrightEnabled(false);
        }
    };

    return (
        <div className="flex h-full w-full flex-col">
            <form onSubmit={handleFormSubmit} className="relative z-10 space-y-4 border-b border-white/10 bg-black/10 p-6 backdrop-blur-sm">
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
                    crawlStrategy={crawlStrategy}
                    onCrawlStrategyChange={handleCrawlStrategyChange}
                    detectingRss={detectingRss}
                    onDetectRssFeeds={() => void detectRssFeeds()}
                    submitting={submitting}
                    rssPanel={(
                        <RssDetectionPanel
                            rssFeedOptions={rssFeedOptions}
                            selectedRssFeed={selectedRssFeed}
                            onSelectedRssFeedChange={setSelectedRssFeed}
                            onApplySelectedRssFeed={() => {
                                applySelectedRssFeed();
                                setSimulatorLoading(true);
                            }}
                        />
                    )}
                />
            </form>

            <div className="flex-1 overflow-hidden">
                <SourceSimulatorLayout
                    sidebarKey={sidebarKey}
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
                />
            </div>
        </div>
    );
}
