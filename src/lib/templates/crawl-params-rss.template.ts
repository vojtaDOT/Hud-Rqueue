/**
 * json-e template for RssCrawlParamsV1 (rss strategy, schema_version: 1).
 *
 * Uses $merge to combine contract metadata with RSS-specific config.
 */
export const CRAWL_PARAMS_RSS_TEMPLATE = {
    $merge: [
        { $eval: 'contract_metadata' },
        {
            schema_version: 1,
            strategy: 'rss',
            feed_url: { $eval: 'feed_url' },
            item_identity: 'link_then_guid',
            route: { emit_to: 'source_urls' },
            fetch: { timeout_ms: 8000 },
        },
    ],
} as const;

/**
 * Context shape required by CRAWL_PARAMS_RSS_TEMPLATE.
 */
export interface CrawlParamsRssContext {
    contract_metadata: Record<string, unknown>;
    feed_url: string;
}
