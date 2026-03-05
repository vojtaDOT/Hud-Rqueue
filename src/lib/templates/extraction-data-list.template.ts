/**
 * json-e template for SourceListExtractionDataV1.
 */
export const EXTRACTION_DATA_LIST_TEMPLATE = {
    config_version: 1,
    strategy: 'list',
    dedupe: {
        url_norm_version: 'v2',
        rss_identity: 'link_then_guid',
        ignored_query_params: { $eval: 'ignored_query_params' },
    },
    pagination_defaults: {
        mode: 'hybrid',
        max_pages: 0,
    },
} as const;

/**
 * Context shape required by EXTRACTION_DATA_LIST_TEMPLATE.
 */
export interface ExtractionDataListContext {
    ignored_query_params: string[];
}
