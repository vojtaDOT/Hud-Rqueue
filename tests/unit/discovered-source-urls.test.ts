import { describe, expect, it } from 'vitest';

import {
    buildDiscoveredSourceUrls,
    isPendingDiscoveredSourceUrlId,
    PENDING_DISCOVERED_SOURCE_URL_PREFIX,
} from '@/lib/discovered-source-urls';

describe('discovered source URLs', () => {
    it('resolves discovery items by source_url_id when present', () => {
        const discovered = buildDiscoveredSourceUrls({
            sourceId: '31',
            sourceUrlMeta: [
                {
                    id: '101',
                    source_id: '31',
                    url: 'https://example.com/detail/1',
                    label: 'Detail 1',
                },
            ],
            items: [
                {
                    id: 'item-1',
                    source_url_id: '101',
                    item_label: 'Detail 1',
                    document_url: 'https://example.com/detail/1',
                    created_at: '2026-03-20T10:00:00.000Z',
                    updated_at: '2026-03-20T10:00:00.000Z',
                    stage: 'discovery',
                    item_type: 'source_url',
                },
            ],
        });

        expect(discovered).toHaveLength(1);
        expect(discovered[0]?.id).toBe('101');
        expect(discovered[0]?.url).toBe('https://example.com/detail/1');
    });

    it('matches source URL metadata by document_url when ingestion item has no source_url_id', () => {
        const discovered = buildDiscoveredSourceUrls({
            sourceId: '31',
            sourceUrlMeta: [
                {
                    id: '202',
                    source_id: '31',
                    url: 'https://eud.praha5.cz/pub/deska/123',
                    label: 'Praha 5 detail',
                },
            ],
            items: [
                {
                    id: 'item-2',
                    source_url_id: null,
                    item_label: 'Praha 5 detail',
                    document_url: 'https://eud.praha5.cz/pub/deska/123',
                    created_at: '2026-03-20T10:00:00.000Z',
                    updated_at: '2026-03-20T10:00:00.000Z',
                    stage: 'discovery',
                    item_type: 'source_url',
                },
            ],
        });

        expect(discovered).toHaveLength(1);
        expect(discovered[0]?.id).toBe('202');
    });

    it('creates a pending placeholder when metadata is not available yet', () => {
        const discovered = buildDiscoveredSourceUrls({
            sourceId: '31',
            sourceUrlMeta: [],
            items: [
                {
                    id: 'item-3',
                    source_url_id: null,
                    item_label: 'Praha 5 detail',
                    document_url: 'https://eud.praha5.cz/pub/deska/456',
                    created_at: '2026-03-20T10:00:00.000Z',
                    updated_at: '2026-03-20T10:00:00.000Z',
                    stage: 'discovery',
                    item_type: 'source_url',
                },
            ],
        });

        expect(discovered).toHaveLength(1);
        expect(discovered[0]?.id).toBe(`${PENDING_DISCOVERED_SOURCE_URL_PREFIX}item-3`);
        expect(isPendingDiscoveredSourceUrlId(discovered[0]!.id)).toBe(true);
        expect(discovered[0]?.url).toBe('https://eud.praha5.cz/pub/deska/456');
    });
});
