import type { UnifiedWorkerPhaseV2, UnifiedWorkerProcessingPhaseV2 } from '../crawler-types';

/**
 * json-e template for UnifiedWorkerCrawlParams (list strategy, schema_version: 2).
 *
 * Uses $merge to combine contract metadata with crawl data.
 * The `discovery` and `processing` values are pre-built by toWorkerPhase()
 * (recursive tree traversal stays in TypeScript).
 */
export const CRAWL_PARAMS_LIST_TEMPLATE = {
    $merge: [
        { $eval: 'contract_metadata' },
        {
            schema_version: 2,
            playwright: { $eval: 'playwright' },
            discovery: { $eval: 'discovery' },
            processing: { $eval: 'processing' },
        },
    ],
} as const;

/**
 * Context shape required by CRAWL_PARAMS_LIST_TEMPLATE.
 */
export interface CrawlParamsListContext {
    contract_metadata: Record<string, unknown>;
    playwright: boolean;
    discovery: UnifiedWorkerPhaseV2;
    processing: UnifiedWorkerProcessingPhaseV2[];
}
