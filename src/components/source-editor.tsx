'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { ChevronRight, Globe, Loader2, Search } from 'lucide-react';

import { SimulatorFrame } from '@/components/simulator/simulator-frame';
import { SimulatorSidebar, SimulatorSidebarRef } from '@/components/simulator/simulator-sidebar';
import { generateWorkerRuntimeConfig } from '@/lib/crawler-export';
import { PageType, PhaseConfig, ScopeModule, ScrapingWorkflow } from '@/lib/crawler-types';
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

function getPhaseFields(phase: PhaseConfig) {
    return flattenScopes(phase.chain).flatMap((scope) => scope.repeater?.fields ?? []);
}

function validateWorkflow(workflow: ScrapingWorkflow): string | null {
    if (workflow.url_types.length < 1) {
        return 'Musí existovat alespoň jeden URL Type.';
    }

    const sourceUrlFields = getPhaseFields(workflow.discovery).filter(
        (field) => field.is_source_url && field.css_selector.trim().length > 0,
    );
    if (sourceUrlFields.length < 1) {
        return 'Phase 1 musí obsahovat alespoň jedno source_url pole s CSS selektorem.';
    }

    const allPhases = [workflow.discovery, ...workflow.url_types.map((item) => item.processing)];
    for (const phase of allPhases) {
        const scopes = flattenScopes(phase.chain);
        for (const scope of scopes) {
            if (!scope.css_selector.trim()) {
                return 'Každý Scope musí mít CSS selector.';
            }
            if (scope.repeater && !scope.repeater.css_selector.trim()) {
                return 'Každý Repeater musí mít CSS selector.';
            }
            if (scope.pagination && !scope.pagination.css_selector.trim()) {
                return 'Pagination musí mít CSS selector.';
            }
        }

        for (const field of getPhaseFields(phase)) {
            if (!field.name.trim() || !field.css_selector.trim() || !field.extract_type) {
                return 'Každé pole musí mít name, css_selector a extract_type.';
            }
            if (field.extract_type === 'attribute' && !(field.attribute_name ?? '').trim()) {
                return 'Pole s extract_type=attribute musí mít attribute_name.';
            }
        }

        for (const action of phase.before_actions) {
            if (action.type === 'remove_element' && !action.css_selector.trim()) {
                return 'Remove Element vyžaduje CSS selector.';
            }
        }

        for (const action of phase.playwright_actions) {
            if (action.type === 'wait_selector' && !action.css_selector.trim()) {
                return 'Wait for Selector vyžaduje CSS selector.';
            }
            if (action.type === 'click' && !action.css_selector.trim()) {
                return 'Click vyžaduje CSS selector.';
            }
            if (action.type === 'fill' && !action.css_selector.trim()) {
                return 'Fill Input vyžaduje CSS selector.';
            }
            if (action.type === 'select_option' && !action.css_selector.trim()) {
                return 'Select Dropdown vyžaduje CSS selector.';
            }
        }
    }

    return null;
}

export function SourceEditor() {
    const [name, setName] = useState('');
    const [typeId, setTypeId] = useState<string>('');
    const [obec, setObec] = useState<Obec | null>(null);
    const [obecSearch, setObecSearch] = useState('');
    const [baseUrl, setBaseUrl] = useState('');

    const [sourceTypes, setSourceTypes] = useState<SourceType[]>([]);
    const [obecResults, setObecResults] = useState<Obec[]>([]);
    const [showObecDropdown, setShowObecDropdown] = useState(false);

    const [loadingTypes, setLoadingTypes] = useState(true);
    const [searchingObec, setSearchingObec] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [simulatorLoading, setSimulatorLoading] = useState(false);

    const [pageType, setPageType] = useState<PageType | null>(null);
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

    const handleElementSelect = (selector: string) => {
        const applied = sidebarRef.current?.applySelectedSelector(selector) ?? false;
        if (!applied) {
            toast.info('Nejprve vyberte vstup CSS selectoru v panelu workflow.');
        } else {
            toast.success('Selector byl vložen do aktivního pole.');
        }
    };

    const handleElementRemove = (selector: string) => {
        sidebarRef.current?.appendRemoveElementBeforeAction(selector);
        toast.success('Přidán Before step: Remove Element.');
    };

    const handlePlaywrightToggleRequest = (nextEnabled: boolean) => {
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
        if (!workflowData) {
            toast.error('Workflow není připravený.');
            return;
        }

        const workflowToSave: ScrapingWorkflow = {
            ...workflowData,
            playwright_enabled: playwrightEnabled,
        };

        const validationError = validateWorkflow(workflowToSave);
        if (validationError) {
            toast.error(validationError);
            return;
        }

        const effectivePageType: PageType = pageType ?? {
            isReact: false,
            isSPA: playwrightEnabled,
            isSSR: !playwrightEnabled,
            framework: 'unknown',
            requiresPlaywright: playwrightEnabled,
        };

        setSubmitting(true);
        try {
            const crawlParams = generateWorkerRuntimeConfig(workflowToSave, effectivePageType, baseUrl);

            const response = await fetch('/api/sources', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name,
                    base_url: baseUrl,
                    enabled: true,
                    crawl_strategy: 'list',
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
            setPageType(null);
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
                                onChange={(e) => setBaseUrl(e.target.value)}
                                placeholder="https://example.com/bulletin"
                                className="border-white/20 bg-white/5 pl-10 text-white placeholder:text-white/40"
                            />
                        </div>
                    </div>
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
            </form>

            <div className="flex-1 overflow-hidden">
                <ResizablePanelGroup direction="horizontal">
                    <ResizablePanel defaultSize={75} minSize={30}>
                        <SimulatorFrame
                            url={baseUrl}
                            loading={simulatorLoading}
                            onLoad={handleIframeLoad}
                            className="h-full"
                            onPageTypeDetected={setPageType}
                            onElementSelect={handleElementSelect}
                            onElementRemove={handleElementRemove}
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
