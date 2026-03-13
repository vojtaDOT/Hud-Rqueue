import { describe, expect, it } from 'vitest';

import type { UnifiedWorkerCrawlParams } from '@/lib/crawler-types';
import { generateUnifiedCrawlParams } from '@/lib/crawler-export';
import {
    buildListSourceConfig,
    coerceLegacyListCrawlParams,
    normalizeUnifiedListCrawlParams,
    validateUnifiedListCrawlParams,
    workflowFromUnifiedConfig,
} from '@/lib/list-source-contract';

function createBasicListConfig(): UnifiedWorkerCrawlParams {
    return {
        schema_version: 2,
        playwright: false,
        discovery: {
            before: [],
            chain: [
                {
                    selector: '.list',
                    label: 'Cards',
                    repeater: {
                        selector: '.card',
                        label: 'Card repeater',
                        steps: [
                            {
                                type: 'source_url',
                                selector: 'a.detail',
                                url_type: 'detail',
                            },
                        ],
                    },
                    pagination: null,
                    children: [],
                },
            ],
        },
        processing: [
            {
                url_type: 'detail',
                before: [],
                chain: [
                    {
                        selector: 'main',
                        label: 'Detail page',
                        repeater: {
                            selector: '.attachments',
                            label: 'Attachments',
                            steps: [
                                {
                                    type: 'download_file',
                                    url_selector: 'a[href$=".pdf"]',
                                    filename_selector: 'self',
                                },
                            ],
                        },
                        pagination: null,
                        children: [],
                    },
                ],
            },
        ],
    };
}

function createDirectDownloadConfig(): UnifiedWorkerCrawlParams {
    return {
        schema_version: 2,
        playwright: false,
        discovery: {
            before: [],
            chain: [
                {
                    selector: '.documents',
                    label: 'Document list',
                    repeater: {
                        selector: '.document-row',
                        label: 'Documents',
                        steps: [
                            {
                                type: 'document_url',
                                selector: 'a[href$=".pdf"]',
                                filename_selector: '',
                            },
                            {
                                type: 'download_file',
                                url_selector: 'a[href$=".zip"]',
                                filename_selector: '',
                            },
                        ],
                    },
                    pagination: null,
                    children: [],
                },
            ],
        },
        processing: [],
    };
}

function createInlineCardConfig(): UnifiedWorkerCrawlParams {
    return {
        schema_version: 2,
        playwright: false,
        discovery: {
            before: [],
            chain: [
                {
                    selector: '.cards',
                    label: 'Cards',
                    repeater: {
                        selector: '.card',
                        label: 'Card repeater',
                        route_key_selector: 'a.detail',
                        steps: [
                            {
                                type: 'source_url',
                                selector: 'a.detail',
                                url_type: 'inline',
                                emit_parent_url: true,
                            },
                        ],
                    },
                    pagination: null,
                    children: [],
                },
            ],
        },
        processing: [
            {
                url_type: 'inline',
                before: [],
                chain: [
                    {
                        selector: '.cards',
                        label: 'Inline cards',
                        repeater: {
                            selector: '.card',
                            label: 'Card repeater',
                            route_key_selector: 'a.detail',
                            steps: [
                                {
                                    type: 'data_extract',
                                    key: 'title',
                                    selector: 'h2',
                                    extract: 'text',
                                },
                                {
                                    type: 'download_file',
                                    url_selector: 'a.download',
                                    filename_selector: '',
                                },
                            ],
                        },
                        pagination: null,
                        children: [],
                    },
                ],
            },
        ],
    };
}

function createMultiBranchConfig(): UnifiedWorkerCrawlParams {
    return {
        ...createBasicListConfig(),
        discovery: {
            before: [],
            chain: [
                {
                    selector: '.list',
                    label: 'Cards',
                    repeater: {
                        selector: '.card',
                        label: 'Card repeater',
                        steps: [
                            {
                                type: 'source_url',
                                selector: 'a.detail',
                                url_type: 'detail',
                            },
                            {
                                type: 'source_url',
                                selector: 'a.preview',
                                url_type: 'preview',
                            },
                        ],
                    },
                    pagination: null,
                    children: [],
                },
            ],
        },
        processing: [
            {
                url_type: 'detail',
                before: [],
                chain: [
                    {
                        selector: 'main',
                        label: 'Detail page',
                        repeater: {
                            selector: '.attachments',
                            label: 'Attachments',
                            steps: [
                                {
                                    type: 'download_file',
                                    url_selector: 'a[href$=".pdf"]',
                                    filename_selector: 'self',
                                },
                            ],
                        },
                        pagination: null,
                        children: [],
                    },
                ],
            },
            {
                url_type: 'preview',
                before: [],
                chain: [
                    {
                        selector: 'main',
                        label: 'Preview page',
                        repeater: {
                            selector: '.preview-links',
                            label: 'Preview links',
                            steps: [
                                {
                                    type: 'document_url',
                                    selector: 'a[href$=".html"]',
                                    filename_selector: 'self',
                                },
                            ],
                        },
                        pagination: null,
                        children: [],
                    },
                ],
            },
        ],
    };
}

describe('list-source-contract', () => {
    it('builds canonical basic list payload', () => {
        const crawlParams: UnifiedWorkerCrawlParams = {
            schema_version: 2,
            playwright: false,
            discovery: {
                before: [],
                chain: [
                    {
                        selector: '.list',
                        label: 'Cards',
                        repeater: {
                            selector: '.card',
                            label: 'Card repeater',
                            steps: [
                                {
                                    type: 'source_url',
                                    selector: 'a.detail',
                                    url_type: 'detail',
                                },
                            ],
                        },
                        pagination: null,
                        children: [],
                    },
                ],
            },
            processing: [
                {
                    url_type: 'detail',
                    before: [],
                    chain: [
                        {
                            selector: 'main',
                            label: 'Detail page',
                            repeater: {
                                selector: '.attachments',
                                label: 'Attachments',
                                steps: [
                                    {
                                        type: 'download_file',
                                        url_selector: 'a[href$=".pdf"]',
                                        filename_selector: 'self',
                                    },
                                ],
                            },
                            pagination: null,
                            children: [],
                        },
                    ],
                },
            ],
        };

        expect(buildListSourceConfig(createBasicListConfig())).toEqual({
            crawl_strategy: 'list',
            crawl_params: crawlParams,
            extraction_data: {
                config_version: 1,
                strategy: 'list',
                generator_kind: 'ui-step-builder',
                generator_version: 1,
                editor_model: crawlParams,
                ui_state: {},
            },
        });
    });

    it('builds canonical direct-download payload', () => {
        const crawlParams: UnifiedWorkerCrawlParams = {
            schema_version: 2,
            playwright: false,
            discovery: {
                before: [],
                chain: [
                    {
                        selector: '.documents',
                        label: 'Document list',
                        repeater: {
                            selector: '.document-row',
                            label: 'Documents',
                            steps: [
                                {
                                    type: 'document_url',
                                    selector: 'a[href$=".pdf"]',
                                    filename_selector: 'self',
                                },
                                {
                                    type: 'download_file',
                                    url_selector: 'a[href$=".zip"]',
                                    filename_selector: 'self',
                                },
                            ],
                        },
                        pagination: null,
                        children: [],
                    },
                ],
            },
            processing: [],
        };

        expect(buildListSourceConfig(createDirectDownloadConfig())).toEqual({
            crawl_strategy: 'list',
            crawl_params: crawlParams,
            extraction_data: {
                config_version: 1,
                strategy: 'list',
                generator_kind: 'ui-step-builder',
                generator_version: 1,
                editor_model: crawlParams,
                ui_state: {},
            },
        });
    });

    it('builds canonical inline-card payload', () => {
        const crawlParams: UnifiedWorkerCrawlParams = {
            schema_version: 2,
            playwright: false,
            discovery: {
                before: [],
                chain: [
                    {
                        selector: '.cards',
                        label: 'Cards',
                        repeater: {
                            selector: '.card',
                            label: 'Card repeater',
                            route_key_selector: 'a.detail',
                            route_key_extract: 'text',
                            steps: [
                                {
                                    type: 'source_url',
                                    selector: 'self',
                                    url_type: 'inline',
                                    emit_parent_url: true,
                                },
                            ],
                        },
                        pagination: null,
                        children: [],
                    },
                ],
            },
            processing: [
                {
                    url_type: 'inline',
                    before: [],
                    chain: [
                        {
                            selector: '.cards',
                            label: 'Inline cards',
                            repeater: {
                                selector: '.card',
                                label: 'Card repeater',
                                route_key_selector: 'a.detail',
                                route_key_extract: 'text',
                                steps: [
                                    {
                                        type: 'data_extract',
                                        key: 'title',
                                        selector: 'h2',
                                        extract: 'text',
                                    },
                                    {
                                        type: 'download_file',
                                        url_selector: 'a.download',
                                        filename_selector: 'self',
                                    },
                                ],
                            },
                            pagination: null,
                            children: [],
                        },
                    ],
                },
            ],
        };

        expect(buildListSourceConfig(createInlineCardConfig())).toEqual({
            crawl_strategy: 'list',
            crawl_params: crawlParams,
            extraction_data: {
                config_version: 1,
                strategy: 'list',
                generator_kind: 'ui-step-builder',
                generator_version: 1,
                editor_model: crawlParams,
                ui_state: {},
            },
        });
    });

    it('round-trips runtime config through workflow import/export', () => {
        for (const config of [createBasicListConfig(), createDirectDownloadConfig(), createInlineCardConfig()]) {
            const normalized = buildListSourceConfig(config).crawl_params;
            const workflow = workflowFromUnifiedConfig(normalized);

            expect(generateUnifiedCrawlParams(workflow)).toEqual(normalized);
        }
    });

    it('coerces legacy crawl params and preserves multi-branch runtime shape', () => {
        const legacyPayload = {
            ...createMultiBranchConfig(),
            template_version: '1.1',
            worker_contract: 'scrapy-worker.instructions.v1',
            runtime_contract: 'scrapy-worker.runtime.minimal.v1',
            flow: ['source', 'source_urls'],
        };

        const coerced = coerceLegacyListCrawlParams(legacyPayload);

        expect(coerced).toEqual(normalizeUnifiedListCrawlParams(createMultiBranchConfig()));
        expect(generateUnifiedCrawlParams(workflowFromUnifiedConfig(coerced!))).toEqual(coerced);
    });

    it('accepts both hybrid and pattern pagination modes', () => {
        const hybridConfig = createBasicListConfig();
        hybridConfig.discovery.chain[0].pagination = {
            selector: 'a.next',
            max_pages: 3,
            url: {
                mode: 'hybrid',
                pattern: '[?&]page=(?<page>\\d+)',
                template: 'https://example.com/list?page={page}',
                start_page: 1,
                step: 1,
            },
        };

        const patternConfig = createBasicListConfig();
        patternConfig.discovery.chain[0].pagination = {
            selector: '',
            max_pages: 3,
            url: {
                mode: 'pattern',
                pattern: '[?&]page=(?<page>\\d+)',
                template: 'https://example.com/list?page={page}',
                start_page: 1,
                step: 1,
            },
        };

        expect(validateUnifiedListCrawlParams(normalizeUnifiedListCrawlParams(hybridConfig))).toEqual([]);
        expect(validateUnifiedListCrawlParams(normalizeUnifiedListCrawlParams(patternConfig))).toEqual([]);
    });

    it('hard-rejects invalid generator states', () => {
        const noDiscovery = createBasicListConfig();
        noDiscovery.discovery.chain = [];

        const duplicateDataKey = createInlineCardConfig();
        duplicateDataKey.processing[0].chain[0].repeater!.steps = [
            {
                type: 'data_extract',
                key: 'title',
                selector: 'h2',
                extract: 'text',
            },
            {
                type: 'data_extract',
                key: 'title',
                selector: 'a',
                extract: 'href',
            },
        ];

        const missingProcessing = createBasicListConfig();
        missingProcessing.processing = [];

        const orphanUrlType = createBasicListConfig();
        orphanUrlType.processing[0].url_type = 'other';

        const missingRouteKey = createInlineCardConfig();
        delete missingRouteKey.discovery.chain[0].repeater!.route_key_selector;

        const mismatchedRouteKey = createInlineCardConfig();
        mismatchedRouteKey.processing[0].chain[0].repeater!.route_key_selector = '.different';

        const playwrightMismatch = createBasicListConfig();
        playwrightMismatch.discovery.before = [{ action: 'wait_selector', selector: '.ready' }];

        const badPagination = createBasicListConfig();
        badPagination.discovery.chain[0].pagination = {
            selector: 'a.next',
            max_pages: 1,
            url: {
                mode: 'hybrid',
                pattern: '[?&]page=(?<page>\\d+)',
                template: 'https://example.com/list',
                start_page: 1,
                step: 1,
            },
        };

        const missingHybridSelector = createBasicListConfig();
        missingHybridSelector.discovery.chain[0].pagination = {
            selector: '',
            max_pages: 1,
            url: {
                mode: 'hybrid',
                pattern: '[?&]page=(?<page>\\d+)',
                template: 'https://example.com/list?page={page}',
                start_page: 1,
                step: 1,
            },
        };

        const badPaginationRange = createBasicListConfig();
        badPaginationRange.discovery.chain[0].pagination = {
            selector: 'a.next',
            max_pages: -1,
            url: {
                mode: 'hybrid',
                pattern: '[?&]page=(?<page>\\d+)',
                template: 'https://example.com/list?page={page}',
                start_page: 0,
                step: 0,
            },
        };

        expect(validateUnifiedListCrawlParams(normalizeUnifiedListCrawlParams(noDiscovery)).map((issue) => issue.message)).toContain(
            'Discovery chain nesmí být prázdný.',
        );
        expect(validateUnifiedListCrawlParams(normalizeUnifiedListCrawlParams(duplicateDataKey)).map((issue) => issue.message)).toContain(
            'Data extract key "title" je v repeateru duplicitní.',
        );
        expect(validateUnifiedListCrawlParams(normalizeUnifiedListCrawlParams(missingProcessing)).map((issue) => issue.message)).toContain(
            'Processing nesmí být prázdný, pokud discovery emituje source_url.',
        );
        expect(validateUnifiedListCrawlParams(normalizeUnifiedListCrawlParams(orphanUrlType)).map((issue) => issue.message)).toContain(
            'Source URL odkazuje na neexistující processing větev "detail".',
        );
        expect(validateUnifiedListCrawlParams(normalizeUnifiedListCrawlParams(missingRouteKey)).map((issue) => issue.message)).toContain(
            'emit_parent_url vyžaduje route_key_selector na discovery repeateru.',
        );
        expect(validateUnifiedListCrawlParams(normalizeUnifiedListCrawlParams(mismatchedRouteKey)).map((issue) => issue.message)).toContain(
            'Processing route_key_selector ".different" pro "inline" nemá matching discovery repeater.',
        );
        expect(validateUnifiedListCrawlParams(normalizeUnifiedListCrawlParams(playwrightMismatch)).map((issue) => issue.message)).toContain(
            'Akce "wait_selector" vyžaduje playwright=true.',
        );
        expect(validateUnifiedListCrawlParams(normalizeUnifiedListCrawlParams(badPagination)).map((issue) => issue.message)).toContain(
            'Pagination template musí obsahovat {page}.',
        );
        expect(validateUnifiedListCrawlParams(normalizeUnifiedListCrawlParams(missingHybridSelector)).map((issue) => issue.message)).toContain(
            'Hybrid pagination vyžaduje selector.',
        );
        expect(() => buildListSourceConfig(noDiscovery)).toThrow();
        expect(() => buildListSourceConfig(badPaginationRange)).toThrow();
    });
});
