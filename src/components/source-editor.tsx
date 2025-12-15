'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { toast } from 'sonner';
import { Search, Globe, ChevronRight, FolderTree, Loader2 } from 'lucide-react';
import { SimulatorFrame } from '@/components/simulator/simulator-frame';
import { SimulatorSidebar } from '@/components/simulator/simulator-sidebar';
import { PageType } from '@/lib/crawler-types';
import { generateCrawlerConfig, exportConfigToJSON } from '@/lib/crawler-export';
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

export function SourceEditor() {
    // Form state
    const [name, setName] = useState('');
    const [typeId, setTypeId] = useState<string>('');
    const [obec, setObec] = useState<Obec | null>(null);
    const [obecSearch, setObecSearch] = useState('');
    const [baseUrl, setBaseUrl] = useState('');

    // Data state
    const [sourceTypes, setSourceTypes] = useState<SourceType[]>([]);
    const [obecResults, setObecResults] = useState<Obec[]>([]);
    const [showObecDropdown, setShowObecDropdown] = useState(false);

    // Loading states
    const [loadingTypes, setLoadingTypes] = useState(true);
    const [searchingObec, setSearchingObec] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [simulatorLoading, setSimulatorLoading] = useState(false);
    
    // Crawler configuration
    const [pageType, setPageType] = useState<PageType | null>(null);
    const [workflowSteps, setWorkflowSteps] = useState<any[]>([]);

    // Refs
    const obecDropdownRef = useRef<HTMLDivElement>(null);
    const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    // Fetch source types on mount
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

    // Click outside to close dropdown
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (obecDropdownRef.current && !obecDropdownRef.current.contains(event.target as Node)) {
                setShowObecDropdown(false);
            }
        }
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Search for obce
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

    // Handle obec input change with debounce
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

    // Select obec from dropdown
    const selectObec = (selectedObec: Obec) => {
        setObec(selectedObec);
        setObecSearch(selectedObec.nazev);
        setShowObecDropdown(false);
        setObecResults([]);
    };

    // Handle form submission
    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!name || !typeId || !baseUrl) {
            toast.error('Vyplňte prosím všechna povinná pole');
            return;
        }

        setSubmitting(true);
        try {
            // Generate crawler config from workflow
            let crawlParams = {};
            if (pageType && workflowSteps.length > 0) {
                const crawlerConfig = generateCrawlerConfig(baseUrl, pageType, workflowSteps);
                crawlParams = {
                    crawlerType: crawlerConfig.crawlerType,
                    pageType: crawlerConfig.pageType,
                    steps: crawlerConfig.steps,
                    configJson: exportConfigToJSON(crawlerConfig),
                };
            }

            const response = await fetch('/api/sources', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name,
                    base_url: baseUrl,
                    enabled: true,
                    crawl_strategy: 'list',
                    crawl_params: crawlParams,
                    crawl_interval: '1 day',
                    typ_id: parseInt(typeId),
                    obec_id: obec?.id ? parseInt(obec.id) : null,
                    okres_id: obec?.okres_id || null,
                    kraj_id: obec?.kraj_id || null,
                }),
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Nepodařilo se uložit zdroj');
            }

            toast.success('Zdroj byl úspěšně uložen');
            // Reset form
            setName('');
            setTypeId('');
            setObec(null);
            setObecSearch('');
            setBaseUrl('');
            setPageType(null);
            setWorkflowSteps([]);
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Neznámá chyba');
        } finally {
            setSubmitting(false);
        }
    };

    // Handle iframe load
    const handleIframeLoad = () => {
        setSimulatorLoading(false);
    };

    // Trigger simulator when baseUrl changes
    useEffect(() => {
        if (baseUrl && baseUrl.startsWith('http')) {
            setSimulatorLoading(true);
        }
    }, [baseUrl]);

    const isValidUrl = baseUrl.startsWith('http://') || baseUrl.startsWith('https://');

    return (
        <div className="flex flex-col h-full w-full">
            {/* Form Section - Full Width */}
            <form onSubmit={handleSubmit} className="relative z-10 p-6 border-b border-white/10 bg-black/10 backdrop-blur-sm space-y-4">
                {/* Row 1: Name + Type */}
                <div className="flex gap-4">
                    <div className="flex-1">
                        <Label htmlFor="name" className="text-sm text-white/70 mb-1.5 block">Název</Label>
                        <Input
                            id="name"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="Název zdroje"
                            className="bg-white/5 border-white/20 text-white placeholder:text-white/40"
                        />
                    </div>
                    <div className="w-64">
                        <Label htmlFor="type" className="text-sm text-white/70 mb-1.5 block">Typ zdroje</Label>
                        <Select value={typeId} onValueChange={setTypeId} disabled={loadingTypes}>
                            <SelectTrigger className="bg-white/5 border-white/20 text-white">
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

                {/* Row 2: Location (Obec / Okres / Kraj) */}
                <div className="flex gap-4">
                    <div className="flex-1 relative" ref={obecDropdownRef}>
                        <Label htmlFor="obec" className="text-sm text-white/70 mb-1.5 block">Obec</Label>
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
                            <Input
                                id="obec"
                                value={obecSearch}
                                onChange={(e) => handleObecInputChange(e.target.value)}
                                placeholder="Vyhledat obec..."
                                className="bg-white/5 border-white/20 text-white placeholder:text-white/40 pl-10"
                            />
                            {searchingObec && (
                                <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40 animate-spin" />
                            )}
                        </div>

                        {/* Dropdown Results */}
                        {showObecDropdown && obecResults.length > 0 && (
                            <div className="absolute z-[1000] w-full mt-1 bg-zinc-900 border border-white/20 rounded-md shadow-xl max-h-60 overflow-auto">
                                {obecResults.map((o) => (
                                    <button
                                        key={o.id}
                                        type="button"
                                        onClick={() => selectObec(o)}
                                        className="w-full px-3 py-2 text-left hover:bg-white/10 transition-colors flex items-center justify-between"
                                    >
                                        <span className="text-white">{o.nazev}</span>
                                        <span className="text-xs text-white/50">{o.okres_nazev}</span>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    <div className="w-48">
                        <Label className="text-sm text-white/70 mb-1.5 block">Okres</Label>
                        <Input
                            value={obec?.okres_nazev || ''}
                            disabled
                            placeholder="—"
                            className="bg-white/5 border-white/10 text-white/50 cursor-not-allowed"
                        />
                    </div>

                    <div className="w-48">
                        <Label className="text-sm text-white/70 mb-1.5 block">Kraj</Label>
                        <Input
                            value={obec?.kraj_nazev || ''}
                            disabled
                            placeholder="—"
                            className="bg-white/5 border-white/10 text-white/50 cursor-not-allowed"
                        />
                    </div>
                </div>

                {/* Row 3: Base URL */}
                <div className="flex gap-4 items-end">
                    <div className="flex-1">
                        <Label htmlFor="baseUrl" className="text-sm text-white/70 mb-1.5 block">Base URL</Label>
                        <div className="relative">
                            <Globe className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
                            <Input
                                id="baseUrl"
                                value={baseUrl}
                                onChange={(e) => setBaseUrl(e.target.value)}
                                placeholder="https://example.com/bulletin"
                                className="bg-white/5 border-white/20 text-white placeholder:text-white/40 pl-10"
                            />
                        </div>
                    </div>
                    <Button
                        type="submit"
                        disabled={submitting}
                        className="bg-gradient-to-r text-white from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700"
                    >
                        {submitting ? (
                            <>
                                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                Ukládám...
                            </>
                        ) : (
                            <>
                                <ChevronRight className="w-4 h-4 mr-2" />
                                Uložit zdroj
                            </>
                        )}
                    </Button>
                </div>
            </form>

            {/* Simulator + Tree Panel Row - Resizable */}
            <div className="flex-1 overflow-hidden">
                <ResizablePanelGroup direction="horizontal">
                    <ResizablePanel defaultSize={75} minSize={30}>
                        <SimulatorFrame
                            url={baseUrl}
                            loading={simulatorLoading}
                            onLoad={handleIframeLoad}
                            className="h-full"
                            onPageTypeDetected={setPageType}
                        />
                    </ResizablePanel>

                    <ResizableHandle />

                    <ResizablePanel defaultSize={25} minSize={15} maxSize={50}>
                        <SimulatorSidebar 
                            onWorkflowChange={setWorkflowSteps}
                            pageType={pageType}
                        />
                    </ResizablePanel>
                </ResizablePanelGroup>
            </div>
        </div>
    );
}

