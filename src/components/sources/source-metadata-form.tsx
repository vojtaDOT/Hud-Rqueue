'use client';

import type { ReactNode, RefObject } from 'react';
import { ChevronRight, Globe, Loader2, Rss } from 'lucide-react';

import { ObecAutocomplete } from '@/components/sources/obec-autocomplete';
import type { CrawlStrategy, Obec, SourceType } from '@/components/sources/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';

interface SourceMetadataFormProps {
    name: string;
    onNameChange: (value: string) => void;
    typeId: string;
    onTypeIdChange: (value: string) => void;
    sourceTypes: SourceType[];
    loadingTypes: boolean;
    selectedObec: Obec | null;
    obecSearch: string;
    searchingObec: boolean;
    showObecDropdown: boolean;
    obecResults: Obec[];
    obecDropdownRef: RefObject<HTMLDivElement | null>;
    onObecInputChange: (value: string) => void;
    onSelectObec: (obec: Obec) => void;
    baseUrl: string;
    onBaseUrlChange: (value: string) => void;
    crawlStrategy: CrawlStrategy;
    onCrawlStrategyChange: (value: CrawlStrategy) => void;
    detectingRss: boolean;
    onDetectRssFeeds: () => void;
    submitting: boolean;
    rssPanel?: ReactNode;
}

export function SourceMetadataForm({
    name,
    onNameChange,
    typeId,
    onTypeIdChange,
    sourceTypes,
    loadingTypes,
    selectedObec,
    obecSearch,
    searchingObec,
    showObecDropdown,
    obecResults,
    obecDropdownRef,
    onObecInputChange,
    onSelectObec,
    baseUrl,
    onBaseUrlChange,
    crawlStrategy,
    onCrawlStrategyChange,
    detectingRss,
    onDetectRssFeeds,
    submitting,
    rssPanel,
}: SourceMetadataFormProps) {
    return (
        <div className="space-y-4">
            <div className="flex gap-4">
                <div className="flex-1">
                    <Label htmlFor="name" className="mb-1.5 block text-sm text-white/70">Nazev</Label>
                    <Input
                        id="name"
                        value={name}
                        onChange={(event) => onNameChange(event.target.value)}
                        placeholder="Nazev zdroje"
                        className="border-white/20 bg-white/5 text-white placeholder:text-white/40"
                    />
                </div>
                <div className="w-64">
                    <Label htmlFor="type" className="mb-1.5 block text-sm text-white/70">Typ zdroje</Label>
                    <Select value={typeId} onValueChange={onTypeIdChange} disabled={loadingTypes}>
                        <SelectTrigger className="border-white/20 bg-white/5 text-white">
                            <SelectValue placeholder={loadingTypes ? 'Nacitani...' : 'Vyberte typ'} />
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

            <ObecAutocomplete
                obecDropdownRef={obecDropdownRef}
                obecSearch={obecSearch}
                searchingObec={searchingObec}
                showObecDropdown={showObecDropdown}
                obecResults={obecResults}
                onObecInputChange={onObecInputChange}
                onSelectObec={onSelectObec}
                selectedOkresName={selectedObec?.okres_nazev}
                selectedKrajName={selectedObec?.kraj_nazev}
            />

            <div className="flex items-end gap-4">
                <div className="flex-1">
                    <Label htmlFor="baseUrl" className="mb-1.5 block text-sm text-white/70">Base URL</Label>
                    <div className="relative">
                        <Globe className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
                        <Input
                            id="baseUrl"
                            value={baseUrl}
                            onChange={(event) => onBaseUrlChange(event.target.value)}
                            placeholder="https://example.com/bulletin"
                            className="border-white/20 bg-white/5 pl-10 text-white placeholder:text-white/40"
                        />
                    </div>
                </div>
                <div className="w-40">
                    <Label htmlFor="crawlStrategy" className="mb-1.5 block text-sm text-white/70">Strategie</Label>
                    <Select value={crawlStrategy} onValueChange={(value) => onCrawlStrategyChange(value as CrawlStrategy)}>
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
                    onClick={onDetectRssFeeds}
                    disabled={detectingRss || !/^https?:\/\//.test(baseUrl)}
                    className="border-white/20 bg-white/5 text-white hover:bg-white/10"
                >
                    {detectingRss ? (
                        <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Hledam RSS...
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
                            Ukladam...
                        </>
                    ) : (
                        <>
                            <ChevronRight className="mr-2 h-4 w-4" />
                            Ulozit zdroj
                        </>
                    )}
                </Button>
            </div>

            {rssPanel}
        </div>
    );
}
