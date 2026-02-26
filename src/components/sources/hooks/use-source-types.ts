'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';

import type { SourceType } from '@/components/sources/types';

export function useSourceTypes() {
    const [sourceTypes, setSourceTypes] = useState<SourceType[]>([]);
    const [loadingTypes, setLoadingTypes] = useState(true);

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
                toast.error('Nepodarilo se nacist typy zdroju');
            } finally {
                setLoadingTypes(false);
            }
        }

        void fetchSourceTypes();
    }, []);

    return { sourceTypes, loadingTypes };
}
