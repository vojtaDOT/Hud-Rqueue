'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import type { Obec } from '@/components/sources/types';

export function useObecSearch() {
    const [selectedObec, setSelectedObec] = useState<Obec | null>(null);
    const [obecSearch, setObecSearch] = useState('');
    const [obecResults, setObecResults] = useState<Obec[]>([]);
    const [showObecDropdown, setShowObecDropdown] = useState(false);
    const [searchingObec, setSearchingObec] = useState(false);

    const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const obecDropdownRef = useRef<HTMLDivElement>(null);

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

    const onObecInputChange = useCallback((value: string) => {
        setObecSearch(value);
        setSelectedObec(null);

        if (searchTimeoutRef.current) {
            clearTimeout(searchTimeoutRef.current);
        }

        searchTimeoutRef.current = setTimeout(() => {
            void searchObce(value);
        }, 300);
    }, [searchObce]);

    const onSelectObec = useCallback((obec: Obec) => {
        setSelectedObec(obec);
        setObecSearch(obec.nazev);
        setShowObecDropdown(false);
        setObecResults([]);
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

    const resetObec = useCallback(() => {
        setSelectedObec(null);
        setObecSearch('');
        setObecResults([]);
        setShowObecDropdown(false);
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
