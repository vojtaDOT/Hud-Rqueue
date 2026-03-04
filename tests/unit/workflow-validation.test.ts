import { describe, expect, it } from 'vitest';

import type { ScrapingWorkflow } from '@/lib/crawler-types';
import { validateWorkflow } from '@/lib/workflow-validation';

function createPaginationConfig() {
    return {
        css_selector: 'a.next',
        max_pages: 0,
        url: {
            mode: 'hybrid' as const,
            pattern: '[?&]page=(?<page>\\d+)',
            template: 'https://example.com/list?page={page}',
            start_page: 1,
            step: 1,
        },
    };
}

function createWorkflow(): ScrapingWorkflow {
    return {
        playwright_enabled: false,
        discovery: {
            before: [],
            chain: [
                {
                    id: 'scope-1',
                    css_selector: '.list',
                    label: '',
                    pagination: null,
                    children: [],
                    repeater: {
                        id: 'rep-1',
                        css_selector: '.item',
                        label: '',
                        steps: [
                            {
                                id: 's-1',
                                type: 'source_url',
                                selector: 'a',
                                extract_type: 'href',
                                url_type_id: 'url-type-1',
                            },
                        ],
                    },
                },
            ],
        },
        url_types: [
            {
                id: 'url-type-1',
                name: 'Default Documents',
                processing: {
                    before: [],
                    chain: [
                        {
                            id: 'processing-scope-1',
                            css_selector: '.docs',
                            label: '',
                            pagination: null,
                            children: [],
                            repeater: {
                                id: 'processing-repeater-1',
                                css_selector: '.doc-item',
                                label: '',
                                steps: [
                                    {
                                        id: 'd-1',
                                        type: 'data_extract',
                                        key: 'title',
                                        selector: 'h1',
                                        extract_type: 'text',
                                    },
                                ],
                            },
                        },
                    ],
                },
            },
        ],
    };
}

describe('validateWorkflow', () => {
    it('accepts valid workflow', () => {
        const result = validateWorkflow(createWorkflow());
        expect(result.error).toBeNull();
        expect(result.warnings).toEqual([]);
    });

    it('fails when discovery has no source or document selectors', () => {
        const workflow = createWorkflow();
        workflow.discovery.chain[0].repeater!.steps = [];

        const result = validateWorkflow(workflow);
        expect(result.error).toContain('Phase 1');
    });

    it('fails when playwright action exists but playwright is disabled', () => {
        const workflow = createWorkflow();
        workflow.discovery.before = [{ type: 'wait_network', state: 'networkidle' }];

        const result = validateWorkflow(workflow);
        expect(result.error).toContain('Playwright');
    });

    it('fails when pagination regex is invalid', () => {
        const workflow = createWorkflow();
        workflow.discovery.chain[0].pagination = {
            ...createPaginationConfig(),
            url: {
                ...createPaginationConfig().url,
                pattern: '[?&]page=(',
            },
        };

        const result = validateWorkflow(workflow);
        expect(result.error).toContain('regex');
    });

    it('fails when pagination template does not include {page}', () => {
        const workflow = createWorkflow();
        workflow.discovery.chain[0].pagination = {
            ...createPaginationConfig(),
            url: {
                ...createPaginationConfig().url,
                template: 'https://example.com/list',
            },
        };

        const result = validateWorkflow(workflow);
        expect(result.error).toContain('{page}');
    });

    it('fails when pagination max_pages is negative', () => {
        const workflow = createWorkflow();
        workflow.discovery.chain[0].pagination = {
            ...createPaginationConfig(),
            max_pages: -1,
        };

        const result = validateWorkflow(workflow);
        expect(result.error).toContain('max_pages');
    });
});
