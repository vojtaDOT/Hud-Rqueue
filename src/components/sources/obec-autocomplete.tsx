'use client';

import { Loader2, Search } from 'lucide-react';
import type { RefObject } from 'react';

import type { Obec } from '@/components/sources/types';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface ObecAutocompleteProps {
    obecDropdownRef: RefObject<HTMLDivElement | null>;
    obecSearch: string;
    searchingObec: boolean;
    showObecDropdown: boolean;
    obecResults: Obec[];
    onObecInputChange: (value: string) => void;
    onSelectObec: (obec: Obec) => void;
    selectedOkresName?: string;
    selectedKrajName?: string;
}

export function ObecAutocomplete({
    obecDropdownRef,
    obecSearch,
    searchingObec,
    showObecDropdown,
    obecResults,
    onObecInputChange,
    onSelectObec,
    selectedOkresName,
    selectedKrajName,
}: ObecAutocompleteProps) {
    return (
        <div className="grid grid-cols-[1fr_140px_140px] gap-3">
            <div className="relative" ref={obecDropdownRef}>
                <Label htmlFor="obec" className="mb-1 block text-xs text-muted-foreground">Obec</Label>
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                        id="obec"
                        value={obecSearch}
                        onChange={(event) => onObecInputChange(event.target.value)}
                        placeholder="Vyhledat obec..."
                        className="pl-10"
                    />
                    {searchingObec && (
                        <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
                    )}
                </div>

                {showObecDropdown && obecResults.length > 0 && (
                    <div className="absolute z-[1000] mt-1 max-h-60 w-full overflow-auto rounded-md border border-border bg-popover shadow-xl">
                        {obecResults.map((item) => (
                            <button
                                key={item.id}
                                type="button"
                                onClick={() => onSelectObec(item)}
                                className="flex w-full items-center justify-between px-3 py-2 text-left text-popover-foreground transition-colors hover:bg-muted"
                            >
                                <span>{item.nazev}</span>
                                <span className="text-xs text-muted-foreground">{item.okres_nazev}</span>
                            </button>
                        ))}
                    </div>
                )}
            </div>

            <div>
                <Label className="mb-1 block text-xs text-muted-foreground">Okres</Label>
                <Input
                    value={selectedOkresName || ''}
                    disabled
                    placeholder="-"
                />
            </div>

            <div>
                <Label className="mb-1 block text-xs text-muted-foreground">Kraj</Label>
                <Input
                    value={selectedKrajName || ''}
                    disabled
                    placeholder="-"
                />
            </div>
        </div>
    );
}
