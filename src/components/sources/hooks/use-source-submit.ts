'use client';

import { useCallback, useState } from 'react';
import { toast } from 'sonner';

import { generateUnifiedCrawlParams } from '@/lib/crawler-export';
import { generateCrawlParamsV2 } from '@/lib/crawler-export-v2';
import type { ScrapingWorkflow, ScrapingWorkflowV2 } from '@/lib/crawler-types';
import {
    buildListSourceConfig,
    buildRssSourceConfig,
    type RssDetectionWarningLike,
    type RssProbeResult,
} from '@/lib/source-config';
import { validateWorkflow } from '@/lib/workflow-validation';
import { validateWorkflowV2 } from '@/lib/workflow-validation-v2';
import type { CrawlStrategy, Obec } from '@/components/sources/types';
import type { RssAuthoringValues } from '@/components/sources/rss-authoring-panel';

interface SubmitPayload {
    name: string;
    typeId: string;
    baseUrl: string;
    crawlStrategy: CrawlStrategy;
    crawlInterval: string;
    workflowData: ScrapingWorkflow | null;
    workflowDataV2: ScrapingWorkflowV2 | null;
    playwrightEnabled: boolean;
    obec: Obec | null;
    selectedRssFeed: string;
    rssFeedOptions: string[];
    rssWarnings: RssDetectionWarningLike[];
    rssAuthoring?: RssAuthoringValues;
    probeResult?: RssProbeResult | null;
}

interface UseSourceSubmitOptions {
    editSourceId?: string;
    onSubmitted: () => void;
}

export function useSourceSubmit({ editSourceId, onSubmitted }: UseSourceSubmitOptions) {
    const [submitting, setSubmitting] = useState(false);

    const submitSource = useCallback(async (payload: SubmitPayload) => {
        const {
            name,
            typeId,
            baseUrl,
            crawlStrategy,
            crawlInterval,
            workflowData,
            workflowDataV2,
            playwrightEnabled,
            obec,
            selectedRssFeed,
            rssFeedOptions,
            rssWarnings,
            rssAuthoring,
            probeResult,
        } = payload;

        if (!name || !typeId || !baseUrl) {
            toast.error('Vyplnte prosim vsechna povinna pole.');
            return false;
        }

        if (!/^https?:\/\//.test(baseUrl)) {
            toast.error('Base URL musi zacinat na http:// nebo https://');
            return false;
        }

        let crawlParams: ReturnType<typeof generateUnifiedCrawlParams> | ReturnType<typeof buildRssSourceConfig>['crawl_params'] | null = null;
        let extractionData: ReturnType<typeof buildListSourceConfig>['extraction_data'] | ReturnType<typeof buildRssSourceConfig>['extraction_data'] | null = null;

        try {
            if (crawlStrategy === 'list') {
                if (workflowDataV2) {
                    const { error: validationError, warnings } = validateWorkflowV2(workflowDataV2, {
                        playwrightEnabled,
                    });
                    if (validationError) {
                        toast.error(validationError);
                        return false;
                    }
                    warnings.forEach((warning) => toast.warning(warning));

                    const generated = generateCrawlParamsV2(workflowDataV2);
                    const listConfig = buildListSourceConfig({
                        ...generated,
                        playwright: playwrightEnabled,
                    });
                    crawlParams = listConfig.crawl_params;
                    extractionData = listConfig.extraction_data;
                } else {
                    if (!workflowData) {
                        toast.error('Workflow není připravený.');
                        return false;
                    }

                    const workflowToSave: ScrapingWorkflow = {
                        ...workflowData,
                        playwright_enabled: playwrightEnabled,
                    };

                    const { error: validationError, warnings } = validateWorkflow(workflowToSave);
                    if (validationError) {
                        toast.error(validationError);
                        return false;
                    }
                    warnings.forEach((warning) => toast.warning(warning));

                    const listConfig = buildListSourceConfig(generateUnifiedCrawlParams(workflowToSave));
                    crawlParams = listConfig.crawl_params;
                    extractionData = listConfig.extraction_data;
                }
            } else {
                const feedUrl = selectedRssFeed.trim() || baseUrl.trim();
                if (!/^https?:\/\//.test(feedUrl)) {
                    toast.error('RSS feed URL musi zacinat na http:// nebo https://');
                    return false;
                }

                const rssConfig = buildRssSourceConfig({
                    feedUrl,
                    detectedFeedCandidates: rssFeedOptions,
                    warnings: rssWarnings,
                    singlePage: rssAuthoring?.singlePage,
                    allowHtmlDocuments: rssAuthoring?.allowHtmlDocuments,
                    usePlaywright: rssAuthoring?.usePlaywright,
                    entryLinkSelector: rssAuthoring?.entryLinkSelector,
                    documentUrlSelector: rssAuthoring?.documentUrlSelector,
                    documentUrlExtract: rssAuthoring?.documentUrlExtract,
                    filenameSelector: rssAuthoring?.filenameSelector,
                    filenameExtract: rssAuthoring?.filenameExtract,
                    processingUsePlaywright: rssAuthoring?.processingUsePlaywright,
                    probeResult: probeResult ?? null,
                });
                crawlParams = rssConfig.crawl_params;
                extractionData = rssConfig.extraction_data;
            }
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Konfigurace zdroje neni kompletni.');
            return false;
        }

        if (!crawlParams || !extractionData) {
            toast.error('Konfigurace zdroje neni kompletni.');
            return false;
        }

        setSubmitting(true);
        try {
            const effectiveBaseUrl = crawlStrategy === 'rss'
                ? (selectedRssFeed.trim() || baseUrl.trim())
                : baseUrl;

            const url = editSourceId ? `/api/sources/${editSourceId}` : '/api/sources';
            const method = editSourceId ? 'PUT' : 'POST';
            const response = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name,
                    base_url: effectiveBaseUrl,
                    enabled: true,
                    crawl_strategy: crawlStrategy === 'list' ? 'list' : crawlStrategy,
                    extraction_data: extractionData,
                    crawl_params: crawlParams,
                    crawl_interval: crawlInterval || '1 day',
                    typ_id: parseInt(typeId, 10),
                    obec_id: obec?.id ? parseInt(obec.id, 10) : null,
                    okres_id: obec?.okres_id || null,
                    kraj_id: obec?.kraj_id || null,
                }),
            });

            const data = await response.json();
            if (!response.ok) {
                throw new Error(data.error || 'Nepodarilo se ulozit zdroj');
            }

            toast.success(editSourceId ? 'Zdroj byl uspesne aktualizovan' : 'Zdroj byl uspesne ulozen');
            onSubmitted();
            return true;
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Neznama chyba');
            return false;
        } finally {
            setSubmitting(false);
        }
    }, [editSourceId, onSubmitted]);

    return {
        submitting,
        submitSource,
    };
}
