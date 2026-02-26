import { describe, expect, it } from 'vitest';

import type { ScrapingWorkflow } from '@/lib/crawler-types';
import { validateWorkflow } from '@/lib/workflow-validation';

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
});
