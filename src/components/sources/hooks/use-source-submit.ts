'use client';

import { useCallback, useState } from 'react';
import { toast } from 'sonner';

import { generateUnifiedCrawlParams } from '@/lib/crawler-export';
import { ScrapingWorkflow } from '@/lib/crawler-types';
import {
    buildListSourceConfig,
    buildRssSourceConfig,
    type RssDetectionWarningLike,
} from '@/lib/source-config';
import { validateWorkflow } from '@/lib/workflow-validation';
import type { CrawlStrategy, Obec } from '@/components/sources/types';

interface SubmitPayload {
    name: string;
    typeId: string;
    baseUrl: string;
    crawlStrategy: CrawlStrategy;
    crawlInterval: string;
    workflowData: ScrapingWorkflow | null;
    playwrightEnabled: boolean;
    obec: Obec | null;
    selectedRssFeed: string;
    rssFeedOptions: string[];
    rssWarnings: RssDetectionWarningLike[];
}

interface UseSourceSubmitOptions {
    onSubmitted: () => void;
}

export function useSourceSubmit({ onSubmitted }: UseSourceSubmitOptions) {
    const [submitting, setSubmitting] = useState(false);

    const submitSource = useCallback(async (payload: SubmitPayload) => {
        const {
            name,
            typeId,
            baseUrl,
            crawlStrategy,
            crawlInterval,
            workflowData,
            playwrightEnabled,
            obec,
            selectedRssFeed,
            rssFeedOptions,
            rssWarnings,
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

        if (crawlStrategy === 'list') {
            if (!workflowData) {
                toast.error('Workflow neni pripraveny.');
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
            });
            crawlParams = rssConfig.crawl_params;
            extractionData = rssConfig.extraction_data;
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

            const response = await fetch('/api/sources', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name,
                    base_url: effectiveBaseUrl,
                    enabled: true,
                    crawl_strategy: crawlStrategy,
                    extraction_data: extractionData,
                    crawl_params: crawlParams,
                    crawl_interval: crawlInterval || '1 day',
                    typ_id: parseInt(typeId, 10),
                    obec_id: obec?.id ? parseInt(obec.id, 10) : null,
                    okres_id: obec?.okres_id || null,
                    kraj_id: obec?.kraj_id || null,
                    workflow_data: crawlStrategy === 'list' ? workflowData : null,
                }),
            });

            const data = await response.json();
            if (!response.ok) {
                throw new Error(data.error || 'Nepodarilo se ulozit zdroj');
            }

            toast.success('Zdroj byl uspesne ulozen');
            onSubmitted();
            return true;
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Neznama chyba');
            return false;
        } finally {
            setSubmitting(false);
        }
    }, [onSubmitted]);

    return {
        submitting,
        submitSource,
    };
}
