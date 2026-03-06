/**
 * json-e template for SourceRssExtractionDataV1.
 * Includes probe_result, authoring_summary and preset metadata.
 */
export const EXTRACTION_DATA_RSS_TEMPLATE = {
    config_version: 1,
    strategy: 'rss',
    selected_feed_url: { $eval: 'feed_url' },
    detected_feed_candidates: { $eval: 'detected_feed_candidates' },
    warnings: { $eval: 'warnings' },
    probe_result: { $eval: 'probe_result' },
    authoring_summary: { $eval: 'authoring_summary' },
    authoring_version: 1,
    selected_preset: { $eval: 'selected_preset' },
} as const;

/**
 * Context shape required by EXTRACTION_DATA_RSS_TEMPLATE.
 */
export interface ExtractionDataRssContext {
    feed_url: string;
    detected_feed_candidates: string[];
    warnings: Array<{ url: string; status: number | null; reason: string }>;
    probe_result: Record<string, unknown> | null;
    authoring_summary: string;
    selected_preset: string;
}
