/**
 * json-e template for RssCrawlParamsV1 (rss strategy, schema_version: 1).
 *
 * Uses $merge to combine contract metadata with RSS-specific config.
 * Optional fields (allow_html_documents, use_playwright, entry_link_selector)
 * are only emitted when explicitly provided in context.
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
            allow_html_documents: { $eval: 'allow_html_documents' },
            use_playwright: { $eval: 'use_playwright' },
        },
        {
            $if: 'entry_link_selector != ""',
            then: { entry_link_selector: { $eval: 'entry_link_selector' } },
        },
    ],
} as const;

/**
 * Context shape required by CRAWL_PARAMS_RSS_TEMPLATE.
 */
export interface CrawlParamsRssContext {
    contract_metadata: Record<string, unknown>;
    feed_url: string;
    allow_html_documents: boolean;
    use_playwright: boolean;
    entry_link_selector: string;
}
