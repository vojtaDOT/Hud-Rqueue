'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { ChevronRight, Globe, Loader2, Rss, Search } from 'lucide-react';

import { SimulatorFrame } from '@/components/simulator/simulator-frame';
import { SimulatorSidebar, SimulatorSidebarRef, SidebarQuickAction } from '@/components/simulator/simulator-sidebar';
import { generateUnifiedCrawlParams, hasPlaywrightBeforeAction } from '@/lib/crawler-export';
import { BeforeAction, ElementSelector, PhaseConfig, RepeaterStep, ScopeModule, ScrapingWorkflow } from '@/lib/crawler-types';
import {
    ResizableHandle,
    ResizablePanel,
    ResizablePanelGroup,
} from '@/components/ui/resizable';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';

interface SourceType {
    id: number;
    name: string;
}

interface Obec {
    id: string;
    kod: string;
    nazev: string;
    okres_id: string;
    okres_nazev: string;
    kraj_id: string;
    kraj_nazev: string;
}

type CrawlStrategy = 'list' | 'rss';

function flattenScopes(scopes: ScopeModule[]): ScopeModule[] {
    const output: ScopeModule[] = [];
    const walk = (items: ScopeModule[]) => {
        for (const scope of items) {
            output.push(scope);
            walk(scope.children);
        }
    };
    walk(scopes);
    return output;
}

function getPhaseSteps(phase: PhaseConfig): RepeaterStep[] {
    return flattenScopes(phase.chain).flatMap((scope) => scope.repeater?.steps ?? []);
}

function hasSelectorAction(action: BeforeAction): action is
    | { type: 'remove_element'; css_selector: string }
    | { type: 'wait_selector'; css_selector: string; timeout_ms: number }
    | { type: 'click'; css_selector: string; wait_after_ms?: number }
    | { type: 'fill'; css_selector: string; value: string; press_enter: boolean }
    | { type: 'select_option'; css_selector: string; value: string } {
    return (
        action.type === 'remove_element'
        || action.type === 'wait_selector'
        || action.type === 'click'
        || action.type === 'fill'
        || action.type === 'select_option'
    );
}

function validateWorkflow(workflow: ScrapingWorkflow): { error: string | null; warnings: string[] } {
    if (workflow.url_types.length < 1) {
        return { error: 'Musí existovat alespoň jeden URL Type.', warnings: [] };
    }

    const validUrlTypeIds = new Set(workflow.url_types.map((item) => item.id));

    const sourceUrlSteps = getPhaseSteps(workflow.discovery).filter(
        (step) => step.type === 'source_url' && step.selector.trim().length > 0,
    );
    const documentUrlSteps = getPhaseSteps(workflow.discovery).filter(
        (step) => step.type === 'document_url' && step.selector.trim().length > 0,
    );
    if (sourceUrlSteps.length < 1 && documentUrlSteps.length < 1) {
        return { error: 'Phase 1 musí obsahovat alespoň jeden source_url nebo document_url krok s CSS selektorem.', warnings: [] };
    }

    const allPhases: Array<{ phaseName: string; phase: PhaseConfig }> = [
        { phaseName: 'Discovery', phase: workflow.discovery },
        ...workflow.url_types.map((item) => ({
            phaseName: `Processing (${item.name})`,
            phase: item.processing,
        })),
    ];
    const warnings: string[] = [];
    const hasDiscoverySourceUrls = sourceUrlSteps.length > 0;
    const hasProcessingSteps = workflow.url_types.some((item) => getPhaseSteps(item.processing).length > 0);

    for (const { phaseName, phase } of allPhases) {
        const scopes = flattenScopes(phase.chain);

        for (const scope of scopes) {
            if (!scope.css_selector.trim()) {
                return { error: 'Každý Scope musí mít CSS selector.', warnings };
            }
            if (scope.repeater && !scope.repeater.css_selector.trim()) {
                return { error: 'Každý Repeater musí mít CSS selector.', warnings };
            }
            if (scope.pagination && !scope.pagination.css_selector.trim()) {
                return { error: 'Pagination musí mít CSS selector.', warnings };
            }
        }

        const phaseSteps = getPhaseSteps(phase);
        const isDiscovery = phaseName === 'Discovery';
        if (phaseSteps.length < 1 && (isDiscovery || hasDiscoverySourceUrls)) {
            return { error: `${phaseName} musí obsahovat alespoň jeden krok uvnitř Repeateru.`, warnings };
        }

        for (const step of phaseSteps) {
            if (step.type === 'source_url') {
                if (!step.selector.trim()) {
                    return { error: 'source_url krok vyžaduje selector.', warnings };
                }
                if (step.extract_type !== 'href') {
                    return { error: 'source_url krok musí mít extract_type=href.', warnings };
                }
                if (step.url_type_id && !validUrlTypeIds.has(step.url_type_id)) {
                    return { error: 'source_url krok odkazuje na neexistující URL Type.', warnings };
                }
            }

            if (step.type === 'document_url' && !step.selector.trim()) {
                return { error: 'document_url krok vyžaduje selector.', warnings };
            }

            if (step.type === 'download_file' && !step.url_selector.trim()) {
                return { error: 'download_file krok vyžaduje url_selector.', warnings };
            }

            if (step.type === 'data_extract') {
                if (!step.key.trim() || !step.selector.trim()) {
                    return { error: 'data_extract krok vyžaduje key a selector.', warnings };
                }
                if (step.extract_type !== 'text' && step.extract_type !== 'href') {
                    return { error: 'data_extract podporuje jen extract_type text nebo href.', warnings };
                }
            }
        }

        if (!workflow.playwright_enabled && hasPlaywrightBeforeAction(phase.before)) {
            return { error: `${phaseName} obsahuje Playwright akce, ale Playwright režim je vypnutý.`, warnings };
        }

        for (const action of phase.before) {
            if (hasSelectorAction(action) && !action.css_selector.trim()) {
                return { error: `${phaseName}: akce ${action.type} vyžaduje CSS selector.`, warnings };
            }

            if (action.type === 'evaluate' && !action.script.trim()) {
                return { error: `${phaseName}: akce evaluate vyžaduje script.`, warnings };
            }
        }
    }

    if (!hasDiscoverySourceUrls && hasProcessingSteps) {
        warnings.push('Phase 2 je vyplněná, ale Discovery neobsahuje source_url. Processing se nepoužije.');
    }

    return { error: null, warnings };
}

export function SourceEditor() {
    const [name, setName] = useState('');
    const [typeId, setTypeId] = useState<string>('');
    const [obec, setObec] = useState<Obec | null>(null);
    const [obecSearch, setObecSearch] = useState('');
    const [baseUrl, setBaseUrl] = useState('');
    const [crawlStrategy, setCrawlStrategy] = useState<CrawlStrategy>('list');
    const [detectingRss, setDetectingRss] = useState(false);
    const [rssFeedOptions, setRssFeedOptions] = useState<string[]>([]);
    const [lastAutoDetectedUrl, setLastAutoDetectedUrl] = useState<string | null>(null);

    const [sourceTypes, setSourceTypes] = useState<SourceType[]>([]);
    const [obecResults, setObecResults] = useState<Obec[]>([]);
    const [showObecDropdown, setShowObecDropdown] = useState(false);

    const [loadingTypes, setLoadingTypes] = useState(true);
    const [searchingObec, setSearchingObec] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [simulatorLoading, setSimulatorLoading] = useState(false);

    const [workflowData, setWorkflowData] = useState<ScrapingWorkflow | null>(null);
    const [playwrightEnabled, setPlaywrightEnabled] = useState(false);
    const [selectorPreview, setSelectorPreview] = useState<string | null>(null);
    const [sidebarKey, setSidebarKey] = useState(0);

    const obecDropdownRef = useRef<HTMLDivElement>(null);
    const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const sidebarRef = useRef<SimulatorSidebarRef>(null);

    useEffect(() => {
        async function fetchSourceTypes() {
            try {
                const response = await fetch('/api/source-types');
                const data = await response.json();
                if (data.source_types) {
                    setSourceTypes(data.source_types);
                }
            } catch (error) {
                console.error('Error fetching source types:', error);
                toast.error('Nepodařilo se načíst typy zdrojů');
            } finally {
                setLoadingTypes(false);
            }
        }
        fetchSourceTypes();
    }, []);

    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (obecDropdownRef.current && !obecDropdownRef.current.contains(event.target as Node)) {
                setShowObecDropdown(false);
            }
        }
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const searchObce = useCallback(async (query: string) => {
        if (query.length < 2) {
            setObecResults([]);
            setShowObecDropdown(false);
            return;
        }

        setSearchingObec(true);
        try {
            const response = await fetch(`/api/regions/obce?q=${encodeURIComponent(query)}`);
            const data = await response.json();
            if (data.obce) {
                setObecResults(data.obce);
                setShowObecDropdown(true);
            }
        } catch (error) {
            console.error('Error searching obce:', error);
        } finally {
            setSearchingObec(false);
        }
    }, []);

    const handleObecInputChange = (value: string) => {
        setObecSearch(value);
        setObec(null);

        if (searchTimeoutRef.current) {
            clearTimeout(searchTimeoutRef.current);
        }

        searchTimeoutRef.current = setTimeout(() => {
            searchObce(value);
        }, 300);
    };

    const selectObec = (selectedObec: Obec) => {
        setObec(selectedObec);
        setObecSearch(selectedObec.nazev);
        setShowObecDropdown(false);
        setObecResults([]);
    };

    const handleElementSelect = (selector: string, elementInfo?: ElementSelector) => {
        const applied = sidebarRef.current?.applySelectedSelector(selector, elementInfo) ?? false;
        if (!applied) {
            toast.info('Vyberte cílový Scope/Repeater nebo fokusujte CSS input v panelu workflow.');
        } else {
            toast.success('Selector byl vložen do aktivního pole.');
        }
    };

    const handleElementRemove = (selector: string) => {
        sidebarRef.current?.appendRemoveElementBeforeAction(selector);
        toast.success('Přidán Before step: Remove Element.');
    };

    const handleQuickAction = (action: SidebarQuickAction, selector: string, elementInfo?: ElementSelector) => {
        sidebarRef.current?.applyQuickAction(action, selector, elementInfo);
        toast.success('Workflow aktualizován z preview inspektoru.');
    };

    const handlePlaywrightToggleRequest = (nextEnabled: boolean) => {
        if (crawlStrategy === 'rss' && nextEnabled) {
            toast.info('Playwright není pro RSS feed potřeba.');
            return false;
        }
        if (!nextEnabled && sidebarRef.current?.hasAnyPlaywrightActions()) {
            const confirmed = window.confirm(
                'Vypnutí Playwright odstraní Playwright kroky ve Phase 1 i Phase 2. Pokračovat?',
            );
            if (!confirmed) return false;
            sidebarRef.current.clearAllPlaywrightActions();
        }
        setPlaywrightEnabled(nextEnabled);
        return true;
    };

    const detectRssFeeds = useCallback(async (options?: { silentWhenNotFound?: boolean }) => {
        if (!/^https?:\/\//.test(baseUrl)) {
            if (!options?.silentWhenNotFound) {
                toast.error('Zadejte platnou URL začínající na http:// nebo https://');
            }
            return;
        }

        setDetectingRss(true);
        try {
            const response = await fetch(`/api/sources/rss-detect?url=${encodeURIComponent(baseUrl)}`);
            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Detekce RSS selhala');
            }

            const feedUrls: string[] = Array.isArray(data.feed_urls)
                ? data.feed_urls.filter((item: unknown): item is string => typeof item === 'string')
                : [];

            if (feedUrls.length < 1) {
                setLastAutoDetectedUrl(baseUrl);
                setRssFeedOptions([]);
                if (!options?.silentWhenNotFound) {
                    toast.info('RSS/Atom feed nebyl nalezen.');
                }
                return;
            }

            setRssFeedOptions(feedUrls);
            setCrawlStrategy('rss');
            setPlaywrightEnabled(false);
            setBaseUrl(feedUrls[0]);
            setLastAutoDetectedUrl(feedUrls[0]);

            toast.success(`Nalezen RSS/Atom feed (${feedUrls.length})`);
        } catch (error) {
            if (!options?.silentWhenNotFound) {
                toast.error(error instanceof Error ? error.message : 'Nepodařilo se detekovat RSS feed');
            }
        } finally {
            setDetectingRss(false);
        }
    }, [baseUrl]);

    const maybeAutoDetectRss = useCallback(() => {
        const normalizedUrl = baseUrl.trim();
        if (!/^https?:\/\//.test(normalizedUrl)) return;
        if (lastAutoDetectedUrl === normalizedUrl) return;
        setLastAutoDetectedUrl(normalizedUrl);
        void detectRssFeeds({ silentWhenNotFound: true });
    }, [baseUrl, detectRssFeeds, lastAutoDetectedUrl]);

    const handleSubmit = async (event: React.FormEvent) => {
        event.preventDefault();

        if (!name || !typeId || !baseUrl) {
            toast.error('Vyplňte prosím všechna povinná pole.');
            return;
        }
        if (!/^https?:\/\//.test(baseUrl)) {
            toast.error('Base URL musí začínat na http:// nebo https://');
            return;
        }
        let workflowToSave: ScrapingWorkflow | null = null;
        let crawlParams: ReturnType<typeof generateUnifiedCrawlParams> | null = null;

        if (crawlStrategy === 'list') {
            if (!workflowData) {
                toast.error('Workflow není připravený.');
                return;
            }

            workflowToSave = {
                ...workflowData,
                playwright_enabled: playwrightEnabled,
            };

            const { error: validationError, warnings } = validateWorkflow(workflowToSave);
            if (validationError) {
                toast.error(validationError);
                return;
            }
            warnings.forEach((warning) => toast.warning(warning));

            crawlParams = generateUnifiedCrawlParams(workflowToSave);
        }

        setSubmitting(true);
        try {
            const response = await fetch('/api/sources', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name,
                    base_url: baseUrl,
                    enabled: true,
                    crawl_strategy: crawlStrategy,
                    extraction_data: workflowToSave,
                    crawl_params: crawlParams,
                    crawl_interval: '1 day',
                    typ_id: parseInt(typeId, 10),
                    obec_id: obec?.id ? parseInt(obec.id, 10) : null,
                    okres_id: obec?.okres_id || null,
                    kraj_id: obec?.kraj_id || null,
                }),
            });

            const data = await response.json();
            if (!response.ok) {
                throw new Error(data.error || 'Nepodařilo se uložit zdroj');
            }

            toast.success('Zdroj byl úspěšně uložen');
            setName('');
            setTypeId('');
            setObec(null);
            setObecSearch('');
            setBaseUrl('');
            setCrawlStrategy('list');
            setRssFeedOptions([]);
            setLastAutoDetectedUrl(null);
            setWorkflowData(null);
            setPlaywrightEnabled(false);
            setSelectorPreview(null);
            setSidebarKey((prev) => prev + 1);
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Neznámá chyba');
        } finally {
            setSubmitting(false);
        }
    };

    const handleIframeLoad = () => {
        setSimulatorLoading(false);
    };

    useEffect(() => {
        if (baseUrl && baseUrl.startsWith('http')) {
            setSimulatorLoading(true);
        }
    }, [baseUrl]);

    useEffect(() => {
        if (crawlStrategy === 'rss' && playwrightEnabled) {
            setPlaywrightEnabled(false);
        }
    }, [crawlStrategy, playwrightEnabled]);

    return (
        <div className="flex h-full w-full flex-col">
            <form onSubmit={handleSubmit} className="relative z-10 space-y-4 border-b border-white/10 bg-black/10 p-6 backdrop-blur-sm">
                <div className="flex gap-4">
                    <div className="flex-1">
                        <Label htmlFor="name" className="mb-1.5 block text-sm text-white/70">Název</Label>
                        <Input
                            id="name"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="Název zdroje"
                            className="border-white/20 bg-white/5 text-white placeholder:text-white/40"
                        />
                    </div>
                    <div className="w-64">
                        <Label htmlFor="type" className="mb-1.5 block text-sm text-white/70">Typ zdroje</Label>
                        <Select value={typeId} onValueChange={setTypeId} disabled={loadingTypes}>
                            <SelectTrigger className="border-white/20 bg-white/5 text-white">
                                <SelectValue placeholder={loadingTypes ? 'Načítání...' : 'Vyberte typ'} />
                            </SelectTrigger>
                            <SelectContent>
                                {sourceTypes.map((type) => (
                                    <SelectItem key={type.id} value={type.id.toString()}>
                                        {type.name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                </div>

                <div className="flex gap-4">
                    <div className="relative flex-1" ref={obecDropdownRef}>
                        <Label htmlFor="obec" className="mb-1.5 block text-sm text-white/70">Obec</Label>
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
                            <Input
                                id="obec"
                                value={obecSearch}
                                onChange={(e) => handleObecInputChange(e.target.value)}
                                placeholder="Vyhledat obec..."
                                className="border-white/20 bg-white/5 pl-10 text-white placeholder:text-white/40"
                            />
                            {searchingObec && (
                                <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-white/40" />
                            )}
                        </div>

                        {showObecDropdown && obecResults.length > 0 && (
                            <div className="absolute z-[1000] mt-1 max-h-60 w-full overflow-auto rounded-md border border-white/20 bg-zinc-900 shadow-xl">
                                {obecResults.map((item) => (
                                    <button
                                        key={item.id}
                                        type="button"
                                        onClick={() => selectObec(item)}
                                        className="flex w-full items-center justify-between px-3 py-2 text-left transition-colors hover:bg-white/10"
                                    >
                                        <span className="text-white">{item.nazev}</span>
                                        <span className="text-xs text-white/50">{item.okres_nazev}</span>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    <div className="w-48">
                        <Label className="mb-1.5 block text-sm text-white/70">Okres</Label>
                        <Input
                            value={obec?.okres_nazev || ''}
                            disabled
                            placeholder="—"
                            className="cursor-not-allowed border-white/10 bg-white/5 text-white/50"
                        />
                    </div>

                    <div className="w-48">
                        <Label className="mb-1.5 block text-sm text-white/70">Kraj</Label>
                        <Input
                            value={obec?.kraj_nazev || ''}
                            disabled
                            placeholder="—"
                            className="cursor-not-allowed border-white/10 bg-white/5 text-white/50"
                        />
                    </div>
                </div>

                <div className="flex items-end gap-4">
                    <div className="flex-1">
                        <Label htmlFor="baseUrl" className="mb-1.5 block text-sm text-white/70">Base URL</Label>
                        <div className="relative">
                            <Globe className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
                            <Input
                                id="baseUrl"
                                value={baseUrl}
                                onChange={(e) => {
                                    setBaseUrl(e.target.value);
                                    setRssFeedOptions([]);
                                }}
                                onBlur={maybeAutoDetectRss}
                                placeholder="https://example.com/bulletin"
                                className="border-white/20 bg-white/5 pl-10 text-white placeholder:text-white/40"
                            />
                        </div>
                    </div>
                    <div className="w-40">
                        <Label htmlFor="crawlStrategy" className="mb-1.5 block text-sm text-white/70">Strategie</Label>
                        <Select value={crawlStrategy} onValueChange={(value) => setCrawlStrategy(value as CrawlStrategy)}>
                            <SelectTrigger id="crawlStrategy" className="border-white/20 bg-white/5 text-white">
                                <SelectValue placeholder="Strategie" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="list">List</SelectItem>
                                <SelectItem value="rss">RSS</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    <Button
                        type="button"
                        variant="outline"
                        onClick={() => void detectRssFeeds()}
                        disabled={detectingRss || !/^https?:\/\//.test(baseUrl)}
                        className="border-white/20 bg-white/5 text-white hover:bg-white/10"
                    >
                        {detectingRss ? (
                            <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                Hledám RSS...
                            </>
                        ) : (
                            <>
                                <Rss className="mr-2 h-4 w-4" />
                                Detekovat RSS
                            </>
                        )}
                    </Button>
                    <Button
                        type="submit"
                        disabled={submitting}
                        className="bg-gradient-to-r from-purple-600 to-blue-600 text-white hover:from-purple-700 hover:to-blue-700"
                    >
                        {submitting ? (
                            <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                Ukládám...
                            </>
                        ) : (
                            <>
                                <ChevronRight className="mr-2 h-4 w-4" />
                                Uložit zdroj
                            </>
                        )}
                    </Button>
                </div>

                {rssFeedOptions.length > 0 && (
                    <div className="rounded-md border border-white/15 bg-white/5 p-3">
                        <Label className="mb-1.5 block text-sm text-white/70">Nalezené RSS/Atom feedy</Label>
                        <Select value={baseUrl} onValueChange={setBaseUrl}>
                            <SelectTrigger className="border-white/20 bg-black/20 text-white">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {rssFeedOptions.map((feedUrl) => (
                                    <SelectItem key={feedUrl} value={feedUrl}>
                                        {feedUrl}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                )}
            </form>

            <div className="flex-1 overflow-hidden">
                <ResizablePanelGroup direction="horizontal">
                    <ResizablePanel defaultSize={75} minSize={30}>
                        <SimulatorFrame
                            url={baseUrl}
                            loading={simulatorLoading}
                            onLoad={handleIframeLoad}
                            className="h-full"
                            onElementSelect={handleElementSelect}
                            onElementRemove={handleElementRemove}
                            onQuickAction={handleQuickAction}
                            playwrightEnabled={playwrightEnabled}
                            onPlaywrightToggleRequest={handlePlaywrightToggleRequest}
                            highlightSelector={selectorPreview}
                        />
                    </ResizablePanel>

                    <ResizableHandle />

                    <ResizablePanel defaultSize={25} minSize={15} maxSize={50}>
                        <SimulatorSidebar
                            key={sidebarKey}
                            ref={sidebarRef}
                            onWorkflowChange={setWorkflowData}
                            playwrightEnabled={playwrightEnabled}
                            onSelectorPreviewChange={setSelectorPreview}
                        />
                    </ResizablePanel>
                </ResizablePanelGroup>
            </div>
        </div>
    );
}
