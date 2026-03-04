import { describe, expect, it } from 'vitest';

import type { UnifiedWorkerCrawlParams } from '@/lib/crawler-types';
import {
    buildListSourceConfig,
    buildRssItemIdentityKey,
    buildRssSourceConfig,
    validateSourcePayload,
} from '@/lib/source-config';

function createListCrawlParams(): UnifiedWorkerCrawlParams {
    return {
        schema_version: 2,
        playwright: false,
        discovery: {
            before: [],
            chain: [],
        },
        processing: [],
    };
}

describe('source-config', () => {
    it('builds list source config envelope', () => {
        const list = buildListSourceConfig(createListCrawlParams());
        expect(list.crawl_params.schema_version).toBe(2);
        expect(list.extraction_data.config_version).toBe(1);
        expect(list.extraction_data.strategy).toBe('list');
        expect(list.extraction_data.pagination_defaults.mode).toBe('hybrid');
        expect(list.extraction_data.dedupe.rss_identity).toBe('link_then_guid');
    });

    it('builds rss source config envelope', () => {
        const rss = buildRssSourceConfig({
            feedUrl: 'https://example.com/feed.xml',
            detectedFeedCandidates: ['https://example.com/feed.xml'],
        });
        expect(rss.crawl_params.schema_version).toBe(1);
        expect(rss.crawl_params.strategy).toBe('rss');
        expect(rss.crawl_params.route.emit_to).toBe('source_urls');
        expect(rss.extraction_data.strategy).toBe('rss');
        expect(rss.extraction_data.selected_feed_url).toBe('https://example.com/feed.xml');
    });

    it('creates deterministic RSS identity key (link -> guid -> fallback)', () => {
        expect(buildRssItemIdentityKey({
            link: 'https://example.com/doc.pdf?utm_source=x&id=123',
            guid: 'GUID-1',
        })).toBe('link:https://example.com/doc.pdf?id=123');

        expect(buildRssItemIdentityKey({
            link: null,
            guid: 'GUID-1',
        })).toBe('guid:guid-1');

        expect(buildRssItemIdentityKey({
            link: null,
            guid: '',
            title: 'Doc',
            pubDate: '2026-03-03',
        })).toBe('fallback:doc::2026-03-03');
    });

    it('validates list payload shape', () => {
        const listConfig = buildListSourceConfig(createListCrawlParams());
        const result = validateSourcePayload({
            name: 'List Source',
            base_url: 'https://example.com/list',
            enabled: true,
            crawl_strategy: 'list',
            crawl_params: listConfig.crawl_params,
            extraction_data: listConfig.extraction_data,
            crawl_interval: '1 day',
            typ_id: 1,
            obec_id: null,
            okres_id: null,
            kraj_id: null,
        });

        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.data.crawl_strategy).toBe('list');
        }
    });
});
