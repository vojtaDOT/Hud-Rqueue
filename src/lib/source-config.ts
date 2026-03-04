import { z } from 'zod';

import type { RssCrawlParamsV1, UnifiedWorkerCrawlParams } from '@/lib/crawler-types';
import { normalizeUrlForDedupe } from '@/lib/dedupe-url';

export const IGNORED_DEDUPE_QUERY_PARAMS = [
    'utm_source',
    'utm_medium',
    'utm_campaign',
    'utm_term',
    'utm_content',
    'gclid',
    'fbclid',
    'mc_cid',
    'mc_eid',
] as const;

export type SourceStrategy = 'list' | 'rss';
export type RssIdentityMode = 'link_then_guid';

export interface SourceConfigEnvelopeBaseV1 {
    config_version: 1;
    strategy: SourceStrategy;
}

export interface SourceListExtractionDataV1 extends SourceConfigEnvelopeBaseV1 {
    strategy: 'list';
    dedupe: {
        url_norm_version: 'v2';
        rss_identity: RssIdentityMode;
        ignored_query_params: string[];
    };
    pagination_defaults: {
        mode: 'hybrid';
        max_pages: number;
    };
}

export type RssWarningReason = 'http_error' | 'not_feed' | 'network_error' | 'timeout';

export interface RssDetectionWarningLike {
    url: string;
    status: number | null;
    reason: RssWarningReason;
}

export interface SourceRssExtractionDataV1 extends SourceConfigEnvelopeBaseV1 {
    strategy: 'rss';
    selected_feed_url: string;
    detected_feed_candidates: string[];
    warnings: RssDetectionWarningLike[];
}

export type SourceConfigEnvelopeV1 = SourceListExtractionDataV1 | SourceRssExtractionDataV1;

const UrlSchema = z.string().trim().url();

const NullableIntegerSchema = z.preprocess((value) => {
    if (value === null || value === undefined || value === '') return null;
    if (typeof value === 'number') return value;
    if (typeof value === 'string') return Number(value);
    return value;
}, z.number().int().nullable());

const NullableStringSchema = z.preprocess((value) => {
    if (value === null || value === undefined) return null;
    const text = String(value).trim();
    return text.length > 0 ? text : null;
}, z.string().nullable());

const ListCrawlParamsSchema = z.object({
    schema_version: z.literal(2),
    playwright: z.boolean(),
    discovery: z.object({
        before: z.array(z.unknown()),
        chain: z.array(z.unknown()),
    }),
    processing: z.array(z.object({
        url_type: z.string().trim().min(1),
        before: z.array(z.unknown()),
        chain: z.array(z.unknown()),
    }).passthrough()),
}).passthrough();

const ListExtractionDataSchema = z.object({
    config_version: z.literal(1),
    strategy: z.literal('list'),
    dedupe: z.object({
        url_norm_version: z.literal('v2'),
        rss_identity: z.literal('link_then_guid'),
        ignored_query_params: z.array(z.string().min(1)).min(1),
    }),
    pagination_defaults: z.object({
        mode: z.literal('hybrid'),
        max_pages: z.number().int().min(0),
    }),
}).strict();

const RssWarningSchema = z.object({
    url: UrlSchema,
    status: z.number().int().nullable(),
    reason: z.enum(['http_error', 'not_feed', 'network_error', 'timeout']),
}).strict();

const RssCrawlParamsSchema = z.object({
    schema_version: z.literal(1),
    strategy: z.literal('rss'),
    feed_url: UrlSchema,
    item_identity: z.literal('link_then_guid'),
    route: z.object({
        emit_to: z.literal('source_urls'),
    }).strict(),
    fetch: z.object({
        timeout_ms: z.number().int().min(1),
    }).strict(),
}).strict();

const RssExtractionDataSchema = z.object({
    config_version: z.literal(1),
    strategy: z.literal('rss'),
    selected_feed_url: UrlSchema,
    detected_feed_candidates: z.array(UrlSchema),
    warnings: z.array(RssWarningSchema),
}).strict();

const BaseSourcePayloadSchema = z.object({
    name: z.string().trim().min(1),
    base_url: UrlSchema,
    enabled: z.boolean().optional().default(true),
    crawl_strategy: z.enum(['list', 'rss']),
    crawl_params: z.unknown(),
    extraction_data: z.unknown(),
    crawl_interval: z.string().trim().min(1).optional().default('1 day'),
    typ_id: NullableIntegerSchema.optional().default(null),
    obec_id: NullableIntegerSchema.optional().default(null),
    okres_id: NullableStringSchema.optional().default(null),
    kraj_id: NullableStringSchema.optional().default(null),
});

export function buildListSourceConfig(crawlParams: UnifiedWorkerCrawlParams): {
    crawl_params: UnifiedWorkerCrawlParams;
    extraction_data: SourceListExtractionDataV1;
} {
    return {
        crawl_params: crawlParams,
        extraction_data: {
            config_version: 1,
            strategy: 'list',
            dedupe: {
                url_norm_version: 'v2',
                rss_identity: 'link_then_guid',
                ignored_query_params: [...IGNORED_DEDUPE_QUERY_PARAMS],
            },
            pagination_defaults: {
                mode: 'hybrid',
                max_pages: 0,
            },
        },
    };
}

export function buildRssSourceConfig(input: {
    feedUrl: string;
    detectedFeedCandidates?: string[];
    warnings?: RssDetectionWarningLike[];
}): {
    crawl_params: RssCrawlParamsV1;
    extraction_data: SourceRssExtractionDataV1;
} {
    const feedUrl = input.feedUrl.trim();
    const detectedFeedCandidates = (input.detectedFeedCandidates ?? []).map((item) => item.trim()).filter(Boolean);
    const warnings = input.warnings ?? [];

    return {
        crawl_params: {
            schema_version: 1,
            strategy: 'rss',
            feed_url: feedUrl,
            item_identity: 'link_then_guid',
            route: { emit_to: 'source_urls' },
            fetch: { timeout_ms: 8000 },
        },
        extraction_data: {
            config_version: 1,
            strategy: 'rss',
            selected_feed_url: feedUrl,
            detected_feed_candidates: detectedFeedCandidates,
            warnings,
        },
    };
}

export function buildRssItemIdentityKey(input: {
    link?: string | null;
    guid?: string | null;
    title?: string | null;
    pubDate?: string | null;
}): string {
    const normalizedLink = normalizeUrlForDedupe(input.link);
    if (normalizedLink) return `link:${normalizedLink}`;

    const guid = typeof input.guid === 'string' ? input.guid.trim().toLowerCase() : '';
    if (guid) return `guid:${guid}`;

    const title = typeof input.title === 'string' ? input.title.trim().toLowerCase() : '';
    const pubDate = typeof input.pubDate === 'string' ? input.pubDate.trim().toLowerCase() : '';
    if (title || pubDate) {
        return `fallback:${title}::${pubDate}`;
    }

    return 'fallback:empty';
}

export type ValidatedSourcePayload =
    | {
        name: string;
        base_url: string;
        enabled: boolean;
        crawl_strategy: 'list';
        crawl_params: UnifiedWorkerCrawlParams;
        extraction_data: SourceListExtractionDataV1;
        crawl_interval: string;
        typ_id: number | null;
        obec_id: number | null;
        okres_id: string | null;
        kraj_id: string | null;
    }
    | {
        name: string;
        base_url: string;
        enabled: boolean;
        crawl_strategy: 'rss';
        crawl_params: RssCrawlParamsV1;
        extraction_data: SourceRssExtractionDataV1;
        crawl_interval: string;
        typ_id: number | null;
        obec_id: number | null;
        okres_id: string | null;
        kraj_id: string | null;
    };

export type SourcePayloadValidationResult =
    | { success: true; data: ValidatedSourcePayload }
    | { success: false; error: z.ZodError };

export function validateSourcePayload(payload: unknown): SourcePayloadValidationResult {
    const base = BaseSourcePayloadSchema.safeParse(payload);
    if (!base.success) {
        return {
            success: false,
            error: base.error,
        };
    }

    const parsed = base.data;
    if (parsed.crawl_strategy === 'list') {
        const crawlParams = ListCrawlParamsSchema.safeParse(parsed.crawl_params);
        if (!crawlParams.success) {
            return {
                success: false,
                error: crawlParams.error,
            };
        }

        const extractionData = ListExtractionDataSchema.safeParse(parsed.extraction_data);
        if (!extractionData.success) {
            return {
                success: false,
                error: extractionData.error,
            };
        }

        return {
            success: true,
            data: {
                name: parsed.name,
                base_url: parsed.base_url,
                enabled: parsed.enabled,
                crawl_strategy: 'list',
                crawl_params: crawlParams.data as UnifiedWorkerCrawlParams,
                extraction_data: extractionData.data,
                crawl_interval: parsed.crawl_interval,
                typ_id: parsed.typ_id,
                obec_id: parsed.obec_id,
                okres_id: parsed.okres_id,
                kraj_id: parsed.kraj_id,
            },
        };
    }

    const crawlParams = RssCrawlParamsSchema.safeParse(parsed.crawl_params);
    if (!crawlParams.success) {
        return {
            success: false,
            error: crawlParams.error,
        };
    }

    const extractionData = RssExtractionDataSchema.safeParse(parsed.extraction_data);
    if (!extractionData.success) {
        return {
            success: false,
            error: extractionData.error,
        };
    }

    return {
        success: true,
        data: {
            name: parsed.name,
            base_url: crawlParams.data.feed_url,
            enabled: parsed.enabled,
            crawl_strategy: 'rss',
            crawl_params: crawlParams.data,
            extraction_data: extractionData.data,
            crawl_interval: parsed.crawl_interval,
            typ_id: parsed.typ_id,
            obec_id: parsed.obec_id,
            okres_id: parsed.okres_id,
            kraj_id: parsed.kraj_id,
        },
    };
}
