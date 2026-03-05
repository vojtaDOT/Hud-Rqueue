'use client';

import type { ReactNode, RefObject } from 'react';
import { AlertCircle, CheckCircle2, ChevronRight, Globe, Info, Loader2, Rss } from 'lucide-react';

import type { RssDetectionStatus } from '@/components/sources/hooks/use-rss-detection';
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
    onBaseUrlBlur?: () => void;
    crawlStrategy: CrawlStrategy;
    onCrawlStrategyChange: (value: CrawlStrategy) => void;
    crawlInterval: string;
    onCrawlIntervalChange: (value: string) => void;
    detectingRss: boolean;
    rssDetectionStatus?: RssDetectionStatus;
    onDetectRssFeeds: () => void;
    submitting: boolean;
    rssPanel?: ReactNode;
    rssPreviewPanel?: ReactNode;
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
    onBaseUrlBlur,
    crawlStrategy,
    onCrawlStrategyChange,
    crawlInterval,
    onCrawlIntervalChange,
    detectingRss,
    rssDetectionStatus,
    onDetectRssFeeds,
    submitting,
    rssPanel,
    rssPreviewPanel,
}: SourceMetadataFormProps) {
    return (
        <div className="space-y-3">
            {/* Row 1: Name + Type */}
            <div className="grid grid-cols-[1fr_180px] gap-3">
                <div>
                    <Label htmlFor="name" className="mb-1 block text-xs text-muted-foreground">Nazev</Label>
                    <Input
                        id="name"
                        value={name}
                        onChange={(event) => onNameChange(event.target.value)}
                        placeholder="Nazev zdroje"
                        required
                    />
                </div>
                <div>
                    <Label htmlFor="type" className="mb-1 block text-xs text-muted-foreground">Typ zdroje</Label>
                    <Select value={typeId} onValueChange={onTypeIdChange} disabled={loadingTypes} required>
                        <SelectTrigger>
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

            {/* Row 2: Obec autocomplete */}
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

            {/* Row 3: Base URL + Interval + Strategy + Actions */}
            <div className="grid grid-cols-[1fr_140px_120px] gap-3">
                <div>
                    <Label htmlFor="baseUrl" className="mb-1 block text-xs text-muted-foreground">Base URL</Label>
                    <div className="relative">
                        <Globe className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                            id="baseUrl"
                            type="url"
                            value={baseUrl}
                            onChange={(event) => onBaseUrlChange(event.target.value)}
                            onBlur={onBaseUrlBlur}
                            placeholder="https://example.com/bulletin"
                            className="pl-10 pr-9"
                            required
                        />
                        {detectingRss && (
                            <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
                        )}
                    </div>
                </div>
                <div>
                    <Label htmlFor="crawlInterval" className="mb-1 block text-xs text-muted-foreground">Interval</Label>
                    <Select value={crawlInterval} onValueChange={onCrawlIntervalChange}>
                        <SelectTrigger id="crawlInterval">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="1 hour">1 hodina</SelectItem>
                            <SelectItem value="6 hours">6 hodin</SelectItem>
                            <SelectItem value="1 day">1 den</SelectItem>
                            <SelectItem value="3 days">3 dny</SelectItem>
                            <SelectItem value="1 week">1 tyden</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
                <div>
                    <Label htmlFor="crawlStrategy" className="mb-1 block text-xs text-muted-foreground">Strategie</Label>
                    <Select value={crawlStrategy} onValueChange={(value) => onCrawlStrategyChange(value as CrawlStrategy)}>
                        <SelectTrigger id="crawlStrategy">
                            <SelectValue placeholder="Strategie" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="list">List</SelectItem>
                            <SelectItem value="rss">RSS</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
            </div>

            {/* Inline RSS detection status */}
            {rssDetectionStatus?.type === 'success' && (
                <div className="flex items-center gap-1.5 text-xs text-green-500">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    <span>Nalezeno {rssDetectionStatus.feedCount} feedu</span>
                </div>
            )}
            {rssDetectionStatus?.type === 'no_feeds' && (
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Info className="h-3.5 w-3.5" />
                    <span>Zadne RSS/Atom feedy nenalezeny</span>
                </div>
            )}
            {rssDetectionStatus?.type === 'error' && (
                <div className="flex items-center gap-1.5 text-xs text-destructive">
                    <AlertCircle className="h-3.5 w-3.5" />
                    <span>{rssDetectionStatus.message}</span>
                </div>
            )}

            {/* Row 4: Action buttons + RSS panel */}
            <div className="flex items-center justify-end gap-2 pt-1">
                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={onDetectRssFeeds}
                    disabled={detectingRss || !/^https?:\/\//.test(baseUrl)}
                >
                    {detectingRss ? (
                        <>
                            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                            Hledam RSS...
                        </>
                    ) : (
                        <>
                            <Rss className="mr-1.5 h-3.5 w-3.5" />
                            Detekovat RSS
                        </>
                    )}
                </Button>
                <Button
                    type="submit"
                    size="sm"
                    disabled={submitting}
                >
                    {submitting ? (
                        <>
                            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                            Ukladam...
                        </>
                    ) : (
                        <>
                            <ChevronRight className="mr-1.5 h-3.5 w-3.5" />
                            Ulozit zdroj
                        </>
                    )}
                </Button>
            </div>

            {rssPanel}
            {rssPreviewPanel}
        </div>
    );
}
