/**
 * json-e template for SourceRssExtractionDataV1.
 */
export const EXTRACTION_DATA_RSS_TEMPLATE = {
    config_version: 1,
    strategy: 'rss',
    selected_feed_url: { $eval: 'feed_url' },
    detected_feed_candidates: { $eval: 'detected_feed_candidates' },
    warnings: { $eval: 'warnings' },
} as const;

/**
 * Context shape required by EXTRACTION_DATA_RSS_TEMPLATE.
 */
export interface ExtractionDataRssContext {
    feed_url: string;
    detected_feed_candidates: string[];
    warnings: Array<{ url: string; status: number | null; reason: string }>;
}
