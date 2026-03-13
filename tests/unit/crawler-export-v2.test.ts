import { describe, expect, it } from 'vitest';

import type { ScrapingWorkflowV2 } from '@/lib/crawler-types';
import { generateCrawlParamsV2 } from '@/lib/crawler-export-v2';
import {
    buildListSourceConfig,
    timelineWorkflowFromUnifiedConfig,
} from '@/lib/list-source-contract';

function createBasicWorkflow(): ScrapingWorkflowV2 {
    return {
        version: 2,
        strategy: 'path',
        singlePage: false,
        discovery: [
            {
                id: 'scope-discovery',
                type: 'scope',
                selector: '.list',
                label: 'root',
                children: [
                    {
                        id: 'repeater-discovery',
                        type: 'repeater',
                        selector: '.card',
                        label: 'cards',
                        routeKeySelector: '',
                        routeKeyExtract: 'text',
                        children: [
                            {
                                id: 'extract-title',
                                type: 'data_extract',
                                groupLabel: 'title',
                                fields: [
                                    {
                                        key: 'title',
                                        selector: 'h2',
                                        extractType: 'text',
                                    },
                                ],
                            },
                            {
                                id: 'source-detail',
                                type: 'source_url',
                                selector: 'a.detail',
                                urlType: 'detail',
                                emitParentUrl: false,
                            },
                        ],
                    },
                ],
            },
        ],
        process: [
            {
                id: 'scope-process',
                type: 'scope',
                selector: '.attachments',
                label: 'attachments_root',
                children: [
                    {
                        id: 'repeater-process',
                        type: 'repeater',
                        selector: 'a[href$=".pdf"]',
                        label: 'files',
                        routeKeySelector: '',
                        routeKeyExtract: 'text',
                        children: [
                            {
                                id: 'download',
                                type: 'download_file',
                                urlSelector: 'self',
                                filenameSelector: '',
                            },
                        ],
                    },
                ],
            },
        ],
    };
}

describe('crawler-export-v2', () => {
    it('exports basic list -> detail -> download contract', () => {
        expect(generateCrawlParamsV2(createBasicWorkflow())).toEqual({
            schema_version: 2,
            playwright: false,
            discovery: {
                before: [],
                chain: [
                    {
                        selector: '.list',
                        label: 'root',
                        repeater: {
                            selector: '.card',
                            label: 'cards',
                            steps: [
                                {
                                    type: 'data_extract',
                                    key: 'title',
                                    selector: 'h2',
                                    extract: 'text',
                                },
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
                            selector: '.attachments',
                            label: 'attachments_root',
                            repeater: {
                                selector: 'a[href$=".pdf"]',
                                label: 'files',
                                steps: [
                                    {
                                        type: 'download_file',
                                        url_selector: 'self',
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
        });
    });

    it('exports direct discovery documents with empty processing', () => {
        const workflow: ScrapingWorkflowV2 = {
            ...createBasicWorkflow(),
            singlePage: true,
            discovery: [
                {
                    id: 'scope-discovery',
                    type: 'scope',
                    selector: '.list',
                    label: 'root',
                    children: [
                        {
                            id: 'repeater-discovery',
                            type: 'repeater',
                            selector: '.row',
                            label: 'rows',
                            routeKeySelector: '',
                            routeKeyExtract: 'text',
                            children: [
                                {
                                    id: 'document',
                                    type: 'document_url',
                                    selector: 'a.file',
                                    filenameSelector: '',
                                },
                            ],
                        },
                    ],
                },
            ],
            process: null,
        };

        expect(generateCrawlParamsV2(workflow).processing).toEqual([]);
    });

    it('exports inline-card routing with route keys and emit_parent_url', () => {
        const workflow: ScrapingWorkflowV2 = {
            version: 2,
            strategy: 'path',
            singlePage: false,
            discovery: [
                {
                    id: 'wait',
                    type: 'wait_selector',
                    selector: '.official-board',
                    timeoutMs: 30000,
                },
                {
                    id: 'scope-discovery',
                    type: 'scope',
                    selector: '.public-contracts',
                    label: 'cards_root',
                    children: [
                        {
                            id: 'repeater-discovery',
                            type: 'repeater',
                            selector: '.official-board',
                            label: 'cards',
                            routeKeySelector: '.record-id',
                            routeKeyExtract: 'text',
                            children: [
                                {
                                    id: 'source-inline',
                                    type: 'source_url',
                                    selector: '',
                                    urlType: 'attachments',
                                    emitParentUrl: true,
                                },
                            ],
                        },
                    ],
                },
            ],
            process: [
                {
                    id: 'scope-process',
                    type: 'scope',
                    selector: '.public-contracts',
                    label: 'cards_root',
                    children: [
                        {
                            id: 'repeater-process',
                            type: 'repeater',
                            selector: '.official-board',
                            label: 'cards',
                            routeKeySelector: '.record-id',
                            routeKeyExtract: 'text',
                            children: [],
                        },
                        {
                            id: 'attachments-scope',
                            type: 'scope',
                            selector: '.attachments',
                            label: 'attachments_scope',
                            children: [
                                {
                                    id: 'attachments-repeater',
                                    type: 'repeater',
                                    selector: '.attachment',
                                    label: 'attachment',
                                    routeKeySelector: '',
                                    routeKeyExtract: 'text',
                                    children: [
                                        {
                                            id: 'download',
                                            type: 'download_file',
                                            urlSelector: 'a',
                                            filenameSelector: 'a',
                                        },
                                    ],
                                },
                            ],
                        },
                    ],
                },
            ],
        };

        expect(generateCrawlParamsV2(workflow)).toEqual({
            schema_version: 2,
            playwright: false,
            discovery: {
                before: [
                    {
                        action: 'wait_selector',
                        selector: '.official-board',
                        timeout: 30000,
                    },
                ],
                chain: [
                    {
                        selector: '.public-contracts',
                        label: 'cards_root',
                        repeater: {
                            selector: '.official-board',
                            label: 'cards',
                            route_key_selector: '.record-id',
                            route_key_extract: 'text',
                            steps: [
                                {
                                    type: 'source_url',
                                    selector: 'self',
                                    url_type: 'attachments',
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
                    url_type: 'attachments',
                    before: [],
                    chain: [
                        {
                            selector: '.public-contracts',
                            label: 'cards_root',
                            repeater: {
                                selector: '.official-board',
                                label: 'cards',
                                route_key_selector: '.record-id',
                                route_key_extract: 'text',
                                steps: [],
                            },
                            pagination: null,
                            children: [
                                {
                                    selector: '.attachments',
                                    label: 'attachments_scope',
                                    repeater: {
                                        selector: '.attachment',
                                        label: 'attachment',
                                        steps: [
                                            {
                                                type: 'download_file',
                                                url_selector: 'a',
                                                filename_selector: 'a',
                                            },
                                        ],
                                    },
                                    pagination: null,
                                    children: [],
                                },
                            ],
                        },
                    ],
                },
            ],
        });
    });

    it('clones shared process branch for multiple discovery url_types', () => {
        const workflow: ScrapingWorkflowV2 = {
            ...createBasicWorkflow(),
            discovery: [
                {
                    id: 'scope-discovery',
                    type: 'scope',
                    selector: '.list',
                    label: 'root',
                    children: [
                        {
                            id: 'repeater-discovery',
                            type: 'repeater',
                            selector: '.card',
                            label: 'cards',
                            routeKeySelector: '',
                            routeKeyExtract: 'text',
                            children: [
                                {
                                    id: 'source-detail',
                                    type: 'source_url',
                                    selector: 'a.detail',
                                    urlType: 'detail',
                                    emitParentUrl: false,
                                },
                                {
                                    id: 'source-preview',
                                    type: 'source_url',
                                    selector: 'a.preview',
                                    urlType: 'preview',
                                    emitParentUrl: false,
                                },
                            ],
                        },
                    ],
                },
            ],
        };

        expect(generateCrawlParamsV2(workflow).processing.map((entry) => entry.url_type)).toEqual([
            'detail',
            'preview',
        ]);
    });

    it('round-trips canonical payload through timeline adapter', () => {
        const canonical = buildListSourceConfig(generateCrawlParamsV2(createBasicWorkflow())).crawl_params;
        const timeline = timelineWorkflowFromUnifiedConfig(canonical);

        expect(generateCrawlParamsV2(timeline)).toEqual(canonical);
    });
});
