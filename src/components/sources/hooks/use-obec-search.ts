'use client';

import { useCallback, useDeferredValue, useEffect, useRef, useState } from 'react';

import type { Obec } from '@/components/sources/types';

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
            setSearchingObec(false);
            setShowObecDropdown(false);
            return;
        }

        if (deferredObecSearch.length < 2) {
            setObecResults([]);
            setShowObecDropdown(false);
            setSearchingObec(false);
            return;
        }

        const requestId = ++searchRequestRef.current;
        const controller = new AbortController();

        void (async () => {
            try {
                const response = await fetch(`/api/regions/obce?q=${encodeURIComponent(deferredObecSearch)}`, {
                    signal: controller.signal,
                });

                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}`);
                }

                const payload = await response.json() as { obce?: Obec[] };

                if (!mountedRef.current || requestId !== searchRequestRef.current) {
                    return;
                }

                const results = Array.isArray(payload.obce) ? payload.obce : [];
                setObecResults(results);
                setShowObecDropdown(true);
            } catch (error) {
                if (error instanceof Error && error.name === 'AbortError') {
                    return;
                }

                console.error('Error searching obce:', error);

                if (!mountedRef.current || requestId !== searchRequestRef.current) {
                    return;
                }

                setObecResults([]);
                setShowObecDropdown(false);
            } finally {
                if (mountedRef.current && requestId === searchRequestRef.current) {
                    setSearchingObec(false);
                }
            }
        })();

        return () => {
            controller.abort();
        };
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
