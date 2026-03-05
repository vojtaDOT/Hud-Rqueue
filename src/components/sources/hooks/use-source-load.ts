'use client';

import { useEffect, useState } from 'react';
import type { ScrapingWorkflow } from '@/lib/crawler-types';

interface SourceData {
    id: number;
    name: string;
    base_url: string;
    enabled: boolean;
    crawl_strategy: string;
    crawl_params: unknown;
    extraction_data: unknown;
    crawl_interval: string;
    typ_id: number;
    obec_id: number | null;
    okres_id: number | null;
    kraj_id: number | null;
    workflow_data: unknown;
    [key: string]: unknown;
}

interface UseSourceLoadResult {
    source: SourceData | null;
    workflow: ScrapingWorkflow | null;
    loading: boolean;
    error: string | null;
}

export function useSourceLoad(sourceId: string | null): UseSourceLoadResult {
    const [source, setSource] = useState<SourceData | null>(null);
    const [workflow, setWorkflow] = useState<ScrapingWorkflow | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!sourceId) {
            setSource(null);
            setWorkflow(null);
            setLoading(false);
            setError(null);
            return;
        }

        const controller = new AbortController();
        setLoading(true);
        setError(null);

        fetch(`/api/sources/${sourceId}`, { signal: controller.signal })
            .then(async (res) => {
                if (!res.ok) {
                    const body = await res.json().catch(() => ({}));
                    throw new Error(body.error || `HTTP ${res.status}`);
                }
                return res.json() as Promise<{ source: SourceData }>;
            })
            .then(({ source: data }) => {
                setSource(data);

                // Parse workflow_data if it's a valid ScrapingWorkflow shape
                if (
                    data.workflow_data &&
                    typeof data.workflow_data === 'object' &&
                    'discovery' in (data.workflow_data as object) &&
                    'url_types' in (data.workflow_data as object)
                ) {
                    setWorkflow(data.workflow_data as ScrapingWorkflow);
                } else {
                    setWorkflow(null);
                }

                setLoading(false);
            })
            .catch((err: unknown) => {
                if (err instanceof Error && err.name === 'AbortError') return;
                setError(err instanceof Error ? err.message : 'Nepodařilo se načíst zdroj');
                setLoading(false);
            });

        return () => {
            controller.abort();
        };
    }, [sourceId]);

    return { source, workflow, loading, error };
}
