import { describe, expect, it } from 'vitest';

import { renderTemplate } from '@/lib/templates/engine';
import { CRAWL_PARAMS_LIST_TEMPLATE } from '@/lib/templates/crawl-params-list.template';
import { CRAWL_PARAMS_RSS_TEMPLATE } from '@/lib/templates/crawl-params-rss.template';
import { EXTRACTION_DATA_LIST_TEMPLATE } from '@/lib/templates/extraction-data-list.template';
import { EXTRACTION_DATA_RSS_TEMPLATE } from '@/lib/templates/extraction-data-rss.template';

describe('CRAWL_PARAMS_LIST_TEMPLATE', () => {
    it('renders list crawl params with metadata merge', () => {
        const metadata = {
            template_version: '1.1',
            worker_contract: 'scrapy-worker.instructions.v1',
        };
        const discovery = { before: [], chain: [] };
        const processing = [{ url_type: 'article', before: [], chain: [] }];

        const result = renderTemplate<Record<string, unknown>>(
            CRAWL_PARAMS_LIST_TEMPLATE as unknown as Record<string, unknown>,
            {
                contract_metadata: metadata,
                playwright: false,
                discovery,
                processing,
            },
        );

        expect(result.schema_version).toBe(2);
        expect(result.playwright).toBe(false);
        expect(result.discovery).toEqual(discovery);
        expect(result.processing).toEqual(processing);
        // metadata merged at top level
        expect(result.template_version).toBe('1.1');
        expect(result.worker_contract).toBe('scrapy-worker.instructions.v1');
    });

    it('renders with empty metadata', () => {
        const result = renderTemplate<Record<string, unknown>>(
            CRAWL_PARAMS_LIST_TEMPLATE as unknown as Record<string, unknown>,
            {
                contract_metadata: {},
                playwright: true,
                discovery: { before: [], chain: [] },
                processing: [],
            },
        );

        expect(result.schema_version).toBe(2);
        expect(result.playwright).toBe(true);
        expect(result).not.toHaveProperty('template_version');
    });
});

describe('CRAWL_PARAMS_RSS_TEMPLATE', () => {
    it('renders RSS crawl params', () => {
        const metadata = {
            runtime_contract: 'scrapy-worker.runtime.minimal.v1',
        };

        const result = renderTemplate<Record<string, unknown>>(
            CRAWL_PARAMS_RSS_TEMPLATE as unknown as Record<string, unknown>,
            {
                contract_metadata: metadata,
                feed_url: 'https://example.com/feed.xml',
                allow_html_documents: false,
                use_playwright: false,
                entry_link_selector: '',
            },
        );

        expect(result.schema_version).toBe(1);
        expect(result.strategy).toBe('rss');
        expect(result.feed_url).toBe('https://example.com/feed.xml');
        expect(result.item_identity).toBe('link_then_guid');
        expect(result.route).toEqual({ emit_to: 'source_urls' });
        expect(result.fetch).toEqual({ timeout_ms: 8000 });
        expect(result.allow_html_documents).toBe(false);
        expect(result.use_playwright).toBe(false);
        expect(result).not.toHaveProperty('entry_link_selector');
        expect(result.runtime_contract).toBe('scrapy-worker.runtime.minimal.v1');
    });
});

describe('EXTRACTION_DATA_LIST_TEMPLATE', () => {
    it('renders list extraction data', () => {
        const result = renderTemplate<Record<string, unknown>>(
            EXTRACTION_DATA_LIST_TEMPLATE as unknown as Record<string, unknown>,
            {
                ignored_query_params: ['utm_source', 'gclid'],
            },
        );

        expect(result.config_version).toBe(1);
        expect(result.strategy).toBe('list');
        expect((result.dedupe as Record<string, unknown>).url_norm_version).toBe('v2');
        expect((result.dedupe as Record<string, unknown>).ignored_query_params).toEqual(['utm_source', 'gclid']);
        expect((result.pagination_defaults as Record<string, unknown>).mode).toBe('hybrid');
    });
});

describe('EXTRACTION_DATA_RSS_TEMPLATE', () => {
    it('renders RSS extraction data', () => {
        const warnings = [{ url: 'https://bad.com', status: 404, reason: 'http_error' }];

        const probeResult = {
            canonical_url: 'https://example.com',
            page_kind: 'html',
            selected_candidate: null,
            candidates: [],
            warnings: [],
        };

        const result = renderTemplate<Record<string, unknown>>(
            EXTRACTION_DATA_RSS_TEMPLATE as unknown as Record<string, unknown>,
            {
                feed_url: 'https://example.com/rss',
                detected_feed_candidates: ['https://example.com/rss', 'https://example.com/atom'],
                warnings,
                probe_result: probeResult,
                authoring_summary: 'Detect feed → Use RSS strategy → Discover per entry → Do not store HTML pages',
                selected_preset: 'rss_v1',
            },
        );

        expect(result.config_version).toBe(1);
        expect(result.strategy).toBe('rss');
        expect(result.selected_feed_url).toBe('https://example.com/rss');
        expect(result.detected_feed_candidates).toEqual([
            'https://example.com/rss',
            'https://example.com/atom',
        ]);
        expect(result.warnings).toEqual(warnings);
        expect(result.probe_result).toEqual(probeResult);
        expect(result.authoring_summary).toBe('Detect feed → Use RSS strategy → Discover per entry → Do not store HTML pages');
        expect(result.authoring_version).toBe(1);
        expect(result.selected_preset).toBe('rss_v1');
    });
});
