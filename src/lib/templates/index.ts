/**
 * json-e template engine and all templates.
 *
 * Usage:
 *   import { renderTemplate, CRAWL_PARAMS_LIST_TEMPLATE } from '@/lib/templates';
 */

export { renderTemplate } from './engine';

// crawl-params
export { CRAWL_PARAMS_LIST_TEMPLATE } from './crawl-params-list.template';
export type { CrawlParamsListContext } from './crawl-params-list.template';
export { CRAWL_PARAMS_RSS_TEMPLATE } from './crawl-params-rss.template';
export type { CrawlParamsRssContext } from './crawl-params-rss.template';

// extraction-data
export { EXTRACTION_DATA_LIST_TEMPLATE } from './extraction-data-list.template';
export type { ExtractionDataListContext } from './extraction-data-list.template';
export { EXTRACTION_DATA_RSS_TEMPLATE } from './extraction-data-rss.template';
export type { ExtractionDataRssContext } from './extraction-data-rss.template';

// job / run payloads
export { JOB_PAYLOAD_TEMPLATE } from './job-payload.template';
export type { JobPayloadContext } from './job-payload.template';
export { RUN_PAYLOAD_TEMPLATE } from './run-payload.template';
export type { RunPayloadContext } from './run-payload.template';
