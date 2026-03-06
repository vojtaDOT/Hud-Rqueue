'use client';

import type { RefObject } from 'react';
import { ChevronRight, Globe, Loader2, Plus } from 'lucide-react';

import { ObecAutocomplete } from '@/components/sources/obec-autocomplete';
import type { Obec, SourceType } from '@/components/sources/types';
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
    crawlInterval: string;
    onCrawlIntervalChange: (value: string) => void;
    submitting: boolean;
    editMode?: boolean;
    sourceLoading?: boolean;
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
    crawlInterval,
    onCrawlIntervalChange,
    submitting,
    editMode,
    sourceLoading,
}: SourceMetadataFormProps) {
    return (
        <div className="space-y-3">
            {/* Row 1: Name + Type */}
            <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_180px]">
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

            {/* Row 3: Base URL + Interval + Actions */}
            <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_140px_auto]">
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
                            className="pl-10"
                            required
                        />
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
                <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-end sm:justify-end md:pt-6">
                    {editMode && (
                        <a href="/sources">
                            <Button type="button" variant="ghost" size="sm" className="w-full whitespace-nowrap sm:w-auto">
                                <Plus className="mr-1.5 h-3.5 w-3.5" />
                                Novy zdroj
                            </Button>
                        </a>
                    )}
                    <Button
                        type="submit"
                        size="sm"
                        className="w-full whitespace-nowrap sm:w-auto"
                        disabled={submitting || sourceLoading}
                    >
                        {submitting ? (
                            <>
                                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                                {editMode ? 'Aktualizuji...' : 'Ukladam...'}
                            </>
                        ) : sourceLoading ? (
                            <>
                                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                                Nacitam...
                            </>
                        ) : (
                            <>
                                <ChevronRight className="mr-1.5 h-3.5 w-3.5" />
                                {editMode ? 'Aktualizovat zdroj' : 'Ulozit zdroj'}
                            </>
                        )}
                    </Button>
                </div>
            </div>
        </div>
    );
}
