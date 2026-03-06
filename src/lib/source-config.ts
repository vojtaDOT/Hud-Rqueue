import { z } from 'zod';

import type { RssCrawlParamsV1, UnifiedWorkerCrawlParams } from '@/lib/crawler-types';
import { normalizeUrlForDedupe } from '@/lib/dedupe-url';
import {
    renderTemplate,
    CRAWL_PARAMS_RSS_TEMPLATE,
    EXTRACTION_DATA_LIST_TEMPLATE,
    EXTRACTION_DATA_RSS_TEMPLATE,
} from '@/lib/templates';
import { WORKER_CONTRACT_METADATA_V11 } from '@/lib/worker-contract-metadata';

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

export type RssDiscoveryMethod = 'link_alternate' | 'anchor_href' | 'common_path' | 'direct_feed';
export type RssFeedType = 'rss2' | 'atom' | 'rdf' | 'unknown';

export interface RssProbeCandidate {
    feed_url: string;
    feed_type: RssFeedType;
    confidence: number;
    discovery_method: RssDiscoveryMethod;
    content_type: string;
    title: string | null;
    same_origin: boolean;
}

export interface RssProbeResult {
    canonical_url: string;
    page_kind: 'html' | 'feed' | 'error';
    selected_candidate: RssProbeCandidate | null;
    candidates: RssProbeCandidate[];
    warnings: RssDetectionWarningLike[];
}

export interface RssAuthoringDraft {
    strategy: 'rss';
    feed_url: string;
    allow_html_documents: boolean;
    use_playwright: boolean;
    entry_link_selector: string;
    confidence: number;
    probe_warnings: RssDetectionWarningLike[];
}

export interface SourceRssExtractionDataV1 extends SourceConfigEnvelopeBaseV1 {
    strategy: 'rss';
    selected_feed_url: string;
    detected_feed_candidates: string[];
    warnings: RssDetectionWarningLike[];
    probe_result?: RssProbeResult;
    authoring_summary?: string;
    authoring_version?: number;
    selected_preset?: string;
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

const RuntimeRulesSchema = z.object({
    accepted_queue_tasks: z.tuple([z.literal('discover'), z.literal('download')]),
    effective_crawl_params_precedence: z.literal('sources.crawl_params -> sources.extraction_data -> {}'),
    download_snapshot_override: z.literal('When source_urls.crawl_params_snapshot is present, download uses it as crawl_params for that source_url.'),
    spider_selection: z.literal('If effective crawl_params is unified config (contains discovery and schema_version=2), use GenericSpider; otherwise use sources.crawl_strategy (list|api|rss).'),
}).strict();

const ContractMetadataShape = {
    template_version: z.literal('1.1').optional(),
    worker_contract: z.literal('scrapy-worker.instructions.v1').optional(),
    orchestration_contract: z.literal('scrapy-worker.controller-layer.v1').optional(),
    runtime_contract: z.literal('scrapy-worker.runtime.minimal.v1').optional(),
    flow: z.tuple([z.literal('source'), z.literal('source_urls')]).optional(),
    runtime_rules: RuntimeRulesSchema.optional(),
} satisfies z.ZodRawShape;

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
    ...ContractMetadataShape,
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
    allow_html_documents: z.boolean().optional().default(false),
    use_playwright: z.boolean().optional().default(false),
    entry_link_selector: z.string().trim().optional(),
    ...ContractMetadataShape,
}).passthrough();

const RssProbeCandidateSchema = z.object({
    feed_url: UrlSchema,
    feed_type: z.enum(['rss2', 'atom', 'rdf', 'unknown']),
    confidence: z.number().min(0).max(1),
    discovery_method: z.enum(['link_alternate', 'anchor_href', 'common_path', 'direct_feed']),
    content_type: z.string(),
    title: z.string().nullable(),
    same_origin: z.boolean(),
}).strict();

const RssProbeResultSchema = z.object({
    canonical_url: z.string(),
    page_kind: z.enum(['html', 'feed', 'error']),
    selected_candidate: RssProbeCandidateSchema.nullable(),
    candidates: z.array(RssProbeCandidateSchema),
    warnings: z.array(RssWarningSchema),
}).strict();

const RssExtractionDataSchema = z.object({
    config_version: z.literal(1),
    strategy: z.literal('rss'),
    selected_feed_url: UrlSchema,
    detected_feed_candidates: z.array(UrlSchema),
    warnings: z.array(RssWarningSchema),
    probe_result: RssProbeResultSchema.nullish(),
    authoring_summary: z.string().optional(),
    authoring_version: z.number().int().optional(),
    selected_preset: z.string().optional(),
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
        crawl_params: {
            ...WORKER_CONTRACT_METADATA_V11,
            ...crawlParams,
        },
        extraction_data: renderTemplate<SourceListExtractionDataV1>(
            EXTRACTION_DATA_LIST_TEMPLATE as unknown as Record<string, unknown>,
            { ignored_query_params: [...IGNORED_DEDUPE_QUERY_PARAMS] },
        ),
    };
}

export function buildRssSourceConfig(input: {
    feedUrl: string;
    detectedFeedCandidates?: string[];
    warnings?: RssDetectionWarningLike[];
    allowHtmlDocuments?: boolean;
    usePlaywright?: boolean;
    entryLinkSelector?: string;
    probeResult?: RssProbeResult | null;
}): {
    crawl_params: RssCrawlParamsV1;
    extraction_data: SourceRssExtractionDataV1;
} {
    const feedUrl = input.feedUrl.trim();
    const detectedFeedCandidates = (input.detectedFeedCandidates ?? []).map((item) => item.trim()).filter(Boolean);
    const warnings = input.warnings ?? [];
    const allowHtmlDocuments = input.allowHtmlDocuments ?? false;
    const usePlaywright = input.usePlaywright ?? false;
    const entryLinkSelector = (input.entryLinkSelector ?? '').trim();

    const summary = buildRssAuthoringSummary({
        feedUrl,
        allowHtmlDocuments,
        usePlaywright,
        entryLinkSelector,
    });

    return {
        crawl_params: renderTemplate<RssCrawlParamsV1>(
            CRAWL_PARAMS_RSS_TEMPLATE as unknown as Record<string, unknown>,
            {
                contract_metadata: { ...WORKER_CONTRACT_METADATA_V11 },
                feed_url: feedUrl,
                allow_html_documents: allowHtmlDocuments,
                use_playwright: usePlaywright,
                entry_link_selector: entryLinkSelector,
            },
        ),
        extraction_data: renderTemplate<SourceRssExtractionDataV1>(
            EXTRACTION_DATA_RSS_TEMPLATE as unknown as Record<string, unknown>,
            {
                feed_url: feedUrl,
                detected_feed_candidates: detectedFeedCandidates,
                warnings,
                probe_result: input.probeResult ?? null,
                authoring_summary: summary,
                selected_preset: 'rss_v1',
            },
        ),
    };
}

export function buildRssAuthoringSummary(input: {
    feedUrl: string;
    allowHtmlDocuments: boolean;
    usePlaywright: boolean;
    entryLinkSelector: string;
}): string {
    const parts: string[] = [
        'Detect feed',
        'Use RSS strategy',
        'Discover per entry',
    ];

    if (input.entryLinkSelector) {
        parts.push(`Follow detail page via "${input.entryLinkSelector}"`);
    }

    if (input.allowHtmlDocuments) {
        parts.push('Store HTML pages');
    } else {
        parts.push('Do not store HTML pages');
    }

    if (input.usePlaywright) {
        parts.push('Use Playwright for rendering');
    }

    return parts.join(' → ');
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
