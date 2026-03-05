import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { UnifiedWorkerCrawlParams } from '@/lib/crawler-types';
import { buildListSourceConfig, buildRssSourceConfig } from '@/lib/source-config';

const findSourceDuplicate = vi.fn();
const from = vi.fn();

vi.mock('@/lib/duplicate-precheck', () => ({
    findSourceDuplicate,
}));

vi.mock('@/lib/supabase', () => ({
    supabase: {
        from,
    },
}));

function createListPayload() {
    const crawlParams: UnifiedWorkerCrawlParams = {
        schema_version: 2,
        playwright: false,
        discovery: { before: [], chain: [] },
        processing: [],
    };
    const list = buildListSourceConfig(crawlParams);

    return {
        name: 'List source',
        base_url: 'https://example.com/list',
        enabled: true,
        crawl_strategy: 'list' as const,
        crawl_params: list.crawl_params,
        extraction_data: list.extraction_data,
        crawl_interval: '1 day',
        typ_id: 1,
        obec_id: null,
        okres_id: null,
        kraj_id: null,
    };
}

function createRssPayload() {
    const rss = buildRssSourceConfig({ feedUrl: 'https://example.com/feed.xml' });
    return {
        name: 'RSS source',
        base_url: 'https://example.com/feed.xml',
        enabled: true,
        crawl_strategy: 'rss' as const,
        crawl_params: rss.crawl_params,
        extraction_data: rss.extraction_data,
        crawl_interval: '1 day',
        typ_id: 2,
        obec_id: null,
        okres_id: null,
        kraj_id: null,
    };
}

describe('POST /api/sources', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('returns 400 for invalid payload', async () => {
        const { POST } = await import('@/app/api/sources/route');
        const response = await POST(new Request('http://localhost/api/sources', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ name: 'Invalid' }),
        }));
        const json = await response.json();

        expect(response.status).toBe(400);
        expect(json.error).toContain('Invalid source payload');
    });

    it('returns 409 when source duplicate exists', async () => {
        findSourceDuplicate.mockResolvedValueOnce({
            table: 'sources',
            key: 'https://example.com/list',
            existing_id: '42',
            input: { base_url: 'https://example.com/list' },
        });

        const { POST } = await import('@/app/api/sources/route');
        const response = await POST(new Request('http://localhost/api/sources', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(createListPayload()),
        }));
        const json = await response.json();

        expect(response.status).toBe(409);
        expect(json.code).toBe('DUPLICATE_CONFLICT');
        expect(json.conflict.existing_id).toBe('42');
    });

    it('creates rss source and seeds source_urls row', async () => {
        findSourceDuplicate.mockResolvedValueOnce(null);

        const insertSources = vi.fn(() => ({
            select: vi.fn(() => ({
                single: vi.fn().mockResolvedValue({
                    data: {
                        id: 100,
                        name: 'RSS source',
                        base_url: 'https://example.com/feed.xml',
                    },
                    error: null,
                }),
            })),
        }));
        const insertSourceUrls = vi.fn().mockResolvedValue({ error: null });

        from.mockImplementation((table: string) => {
            if (table === 'sources') {
                return { insert: insertSources };
            }
            if (table === 'source_urls') {
                return { insert: insertSourceUrls };
            }
            throw new Error(`Unexpected table ${table}`);
        });

        const { POST } = await import('@/app/api/sources/route');
        const response = await POST(new Request('http://localhost/api/sources', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(createRssPayload()),
        }));
        const json = await response.json();

        expect(response.status).toBe(200);
        expect(json.source.id).toBe(100);
        expect(insertSources).toHaveBeenCalledTimes(1);
        expect(insertSourceUrls).toHaveBeenCalledTimes(1);
    });

    it('creates list source with v2 crawl params and list extraction envelope', async () => {
        findSourceDuplicate.mockResolvedValueOnce(null);

        const insertSources = vi.fn(() => ({
            select: vi.fn(() => ({
                single: vi.fn().mockResolvedValue({
                    data: {
                        id: 101,
                        name: 'List source',
                        base_url: 'https://example.com/list',
                    },
                    error: null,
                }),
            })),
        }));
        const insertSourceUrls = vi.fn().mockResolvedValue({ error: null });

        from.mockImplementation((table: string) => {
            if (table === 'sources') {
                return { insert: insertSources };
            }
            if (table === 'source_urls') {
                return { insert: insertSourceUrls };
            }
            throw new Error(`Unexpected table ${table}`);
        });

        const payload = createListPayload();

        const { POST } = await import('@/app/api/sources/route');
        const response = await POST(new Request('http://localhost/api/sources', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(payload),
        }));
        const json = await response.json();

        expect(response.status).toBe(200);
        expect(json.source.id).toBe(101);
        const insertedBody = insertSources.mock.calls[0][0][0];
        expect(insertedBody.crawl_params.schema_version).toBe(2);
        expect(insertedBody.crawl_params.runtime_contract).toBe('scrapy-worker.runtime.minimal.v1');
        expect(insertedBody.extraction_data.strategy).toBe('list');
        expect(insertedBody.extraction_data.config_version).toBe(1);
    });
});
