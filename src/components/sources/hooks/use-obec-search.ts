'use client';

import { useCallback, useDeferredValue, useEffect, useRef, useState } from 'react';

import type { Obec } from '@/components/sources/types';
import { supabase } from '@/lib/supabase';

export function useObecSearch() {
    const [selectedObec, setSelectedObec] = useState<Obec | null>(null);
    const [obecSearch, setObecSearch] = useState('');
    const [obecResults, setObecResults] = useState<Obec[]>([]);
    const [showObecDropdown, setShowObecDropdown] = useState(false);
    const [searchingObec, setSearchingObec] = useState(false);
    const deferredObecSearch = useDeferredValue(obecSearch.trim());

    const mountedRef = useRef(true);
    const searchRequestRef = useRef(0);
    useEffect(() => {
        return () => { mountedRef.current = false; };
    }, []);

    const obecDropdownRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (selectedObec && selectedObec.nazev === deferredObecSearch) {
            return;
        }

        if (deferredObecSearch.length < 2) {
            return;
        }

        const requestId = ++searchRequestRef.current;
        void (async () => {
            const { data, error } = await supabase
                .from('cz_regions_obec')
                .select(`
                    id,
                    kod,
                    nazev,
                    okres_id,
                    cz_regions_okres!inner (
                        id,
                        name,
                        kraj_id,
                        cz_regions_kraj!inner (
                            id,
                            name
                        )
                    )
                `)
                .ilike('nazev->>cs', `%${deferredObecSearch}%`)
                .limit(12);

            if (!mountedRef.current || requestId !== searchRequestRef.current) {
                return;
            }

            if (error) {
                console.error('Error searching obce:', error);
                setObecResults([]);
                setShowObecDropdown(false);
                setSearchingObec(false);
                return;
            }

            const transformedResults: Obec[] = (data ?? []).map((obec) => {
                const okres = obec.cz_regions_okres as unknown as {
                    id: string;
                    name: { cs: string } | string;
                    kraj_id: string;
                    cz_regions_kraj: {
                        id: string;
                        name: { cs: string } | string;
                    };
                };

                return {
                    id: obec.id,
                    kod: obec.kod,
                    nazev: typeof obec.nazev === 'object' ? (obec.nazev as { cs: string }).cs : obec.nazev,
                    okres_id: obec.okres_id,
                    okres_nazev: typeof okres.name === 'object' ? okres.name.cs : okres.name,
                    kraj_id: okres.kraj_id,
                    kraj_nazev: typeof okres.cz_regions_kraj.name === 'object'
                        ? okres.cz_regions_kraj.name.cs
                        : okres.cz_regions_kraj.name,
                };
            });

            setObecResults(transformedResults);
            setShowObecDropdown(true);
            setSearchingObec(false);
        })();
    }, [deferredObecSearch, selectedObec]);

    const onObecInputChange = useCallback((value: string) => {
        setObecSearch(value);
        setSelectedObec(null);
        if (value.trim().length < 2) {
            setObecResults([]);
            setShowObecDropdown(false);
            setSearchingObec(false);
            return;
        }
        setSearchingObec(true);
    }, []);

    const onSelectObec = useCallback((obec: Obec) => {
        setSelectedObec(obec);
        setObecSearch(obec.nazev);
        setShowObecDropdown(false);
        setObecResults([]);
        setSearchingObec(false);
    }, []);

    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (obecDropdownRef.current && !obecDropdownRef.current.contains(event.target as Node)) {
                setShowObecDropdown(false);
            }
        }

        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, []);

    const resetObec = useCallback(() => {
        setSelectedObec(null);
        setObecSearch('');
        setObecResults([]);
        setShowObecDropdown(false);
        setSearchingObec(false);
    }, []);

    return {
        selectedObec,
        obecSearch,
        obecResults,
        showObecDropdown,
        searchingObec,
        obecDropdownRef,
        onObecInputChange,
        onSelectObec,
        resetObec,
    };
}
