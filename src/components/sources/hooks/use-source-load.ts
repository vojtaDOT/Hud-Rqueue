'use client';

import { useEffect, useState } from 'react';

import type { ScrapingWorkflow, ScrapingWorkflowV2 } from '@/lib/crawler-types';
import { isTimelineV2 } from '@/lib/crawler-types';
import {
    coerceLegacyListCrawlParams,
    ListEditorEnvelopeSchema,
    workflowFromUnifiedConfig,
} from '@/lib/list-source-contract';
import { generateCrawlParamsV2 } from '@/lib/crawler-export-v2';
import { isV1Workflow } from '@/lib/workflow-migration';

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
            queueMicrotask(() => {
                setSource(null);
                setWorkflow(null);
                setWorkflowV2(null);
                setWasMigrated(false);
                setLoading(false);
                setError(null);
            });
            return;
        }

        const controller = new AbortController();
        queueMicrotask(() => {
            if (controller.signal.aborted) return;
            setSource(null);
            setWorkflow(null);
            setWorkflowV2(null);
            setWasMigrated(false);
            setLoading(true);
            setError(null);
        });

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

                if (data.crawl_strategy === 'list') {
                    const extractionEnvelope = ListEditorEnvelopeSchema.safeParse(data.extraction_data);
                    if (extractionEnvelope.success) {
                        setWorkflow(workflowFromUnifiedConfig(extractionEnvelope.data.editor_model));
                        setWorkflowV2(null);
                        setWasMigrated(false);
                        setLoading(false);
                        return;
                    }

                    const legacyCrawlParams = coerceLegacyListCrawlParams(data.crawl_params);
                    if (legacyCrawlParams) {
                        setWorkflow(workflowFromUnifiedConfig(legacyCrawlParams));
                        setWorkflowV2(null);
                        setWasMigrated(false);
                        setLoading(false);
                        return;
                    }
                }

                const wd = data.workflow_data;
                if (isV1Workflow(wd)) {
                    setWorkflow(wd);
                    setWorkflowV2(null);
                    setWasMigrated(false);
                    setLoading(false);
                    return;
                }

                if (isTimelineV2(wd)) {
                    const legacyTimelineCrawlParams = coerceLegacyListCrawlParams(generateCrawlParamsV2(wd));
                    if (legacyTimelineCrawlParams) {
                        setWorkflow(workflowFromUnifiedConfig(legacyTimelineCrawlParams));
                        setWorkflowV2(wd);
                        setWasMigrated(true);
                        setLoading(false);
                        return;
                    }
                }

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
