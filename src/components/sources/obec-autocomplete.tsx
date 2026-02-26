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
        <div className="flex gap-4">
            <div className="relative flex-1" ref={obecDropdownRef}>
                <Label htmlFor="obec" className="mb-1.5 block text-sm text-white/70">Obec</Label>
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
                    <Input
                        id="obec"
                        value={obecSearch}
                        onChange={(event) => onObecInputChange(event.target.value)}
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
                                onClick={() => onSelectObec(item)}
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
                    value={selectedOkresName || ''}
                    disabled
                    placeholder="-"
                    className="cursor-not-allowed border-white/10 bg-white/5 text-white/50"
                />
            </div>

            <div className="w-48">
                <Label className="mb-1.5 block text-sm text-white/70">Kraj</Label>
                <Input
                    value={selectedKrajName || ''}
                    disabled
                    placeholder="-"
                    className="cursor-not-allowed border-white/10 bg-white/5 text-white/50"
                />
            </div>
        </div>
    );
}
