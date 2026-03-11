'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';

import type { ScrapingWorkflow, ScrapingWorkflowV2 } from '@/lib/crawler-types';
import { isTimelineV2 } from '@/lib/crawler-types';
import { isV1Workflow, migrateV1toV2 } from '@/lib/workflow-migration';

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
    data_extract?: unknown;
    xml_rss?: string | null;
    [key: string]: unknown;
}

interface UseSourceLoadResult {
    source: SourceData | null;
    /** Legacy v1 workflow — null when v2 or missing */
    workflow: ScrapingWorkflow | null;
    /** V2 workflow — null when v1 not migrated or missing */
    workflowV2: ScrapingWorkflowV2 | null;
    /** Whether the loaded workflow was auto-migrated from v1 */
    wasMigrated: boolean;
    loading: boolean;
    error: string | null;
}

export function useSourceLoad(sourceId: string | null): UseSourceLoadResult {
    const [source, setSource] = useState<SourceData | null>(null);
    const [workflow, setWorkflow] = useState<ScrapingWorkflow | null>(null);
    const [workflowV2, setWorkflowV2] = useState<ScrapingWorkflowV2 | null>(null);
    const [wasMigrated, setWasMigrated] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!sourceId) {
            setSource(null);
            setWorkflow(null);
            setWorkflowV2(null);
            setWasMigrated(false);
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

                const wd = data.workflow_data;

                // V2 native workflow
                if (isTimelineV2(wd)) {
                    setWorkflow(null);
                    setWorkflowV2(wd);
                    setWasMigrated(false);
                    setLoading(false);
                    return;
                }

                // V1 workflow — auto-migrate to V2
                if (isV1Workflow(wd)) {
                    setWorkflow(wd);
                    const { workflow: migrated, droppedSteps } = migrateV1toV2(wd);
                    setWorkflowV2(migrated);
                    setWasMigrated(true);

                    if (droppedSteps.length > 0) {
                        for (const warning of droppedSteps) {
                            toast.warning(warning);
                        }
                    }

                    setLoading(false);
                    return;
                }

                // No recognized workflow
                setWorkflow(null);
                setWorkflowV2(null);
                setWasMigrated(false);
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

    return { source, workflow, workflowV2, wasMigrated, loading, error };
}
