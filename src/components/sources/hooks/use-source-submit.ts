'use client';

import { useCallback, useState } from 'react';
import { toast } from 'sonner';

import { generateUnifiedCrawlParams } from '@/lib/crawler-export';
import { ScrapingWorkflow } from '@/lib/crawler-types';
import { validateWorkflow } from '@/lib/workflow-validation';
import type { CrawlStrategy, Obec } from '@/components/sources/types';

interface SubmitPayload {
    name: string;
    typeId: string;
    baseUrl: string;
    crawlStrategy: CrawlStrategy;
    workflowData: ScrapingWorkflow | null;
    playwrightEnabled: boolean;
    obec: Obec | null;
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
            workflowData,
            playwrightEnabled,
            obec,
        } = payload;

        if (!name || !typeId || !baseUrl) {
            toast.error('Vyplnte prosim vsechna povinna pole.');
            return false;
        }

        if (!/^https?:\/\//.test(baseUrl)) {
            toast.error('Base URL musi zacinat na http:// nebo https://');
            return false;
        }

        let workflowToSave: ScrapingWorkflow | null = null;
        let crawlParams: ReturnType<typeof generateUnifiedCrawlParams> | null = null;

        if (crawlStrategy === 'list') {
            if (!workflowData) {
                toast.error('Workflow neni pripraveny.');
                return false;
            }

            workflowToSave = {
                ...workflowData,
                playwright_enabled: playwrightEnabled,
            };

            const { error: validationError, warnings } = validateWorkflow(workflowToSave);
            if (validationError) {
                toast.error(validationError);
                return false;
            }
            warnings.forEach((warning) => toast.warning(warning));

            crawlParams = generateUnifiedCrawlParams(workflowToSave);
        }

        setSubmitting(true);
        try {
            const response = await fetch('/api/sources', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name,
                    base_url: baseUrl,
                    enabled: true,
                    crawl_strategy: crawlStrategy,
                    extraction_data: workflowToSave,
                    crawl_params: crawlParams,
                    crawl_interval: '1 day',
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
