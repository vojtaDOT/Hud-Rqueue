import { describe, expect, it } from 'vitest';
import { analyzeDiscovery, isDownloadFanoutSkipMessage } from '@/lib/pipeline-discovery-diagnostics';

describe('pipeline discovery diagnostics', () => {
    const baseCrawlParams = {
        schema_version: 2,
        discovery: {
            before: [],
            chain: [
                {
                    selector: '.list',
                    label: 'List',
                    repeater: {
                        selector: '.row',
                        label: 'Rows',
                        steps: [{ type: 'source_url', selector: 'a', url_type: 'detail' }],
                    },
                    pagination: null,
                    children: [],
                },
            ],
        },
        processing: [],
    };

    it('treats finished zero-output discovery as success instead of runtime failure', () => {
        const diagnosis = analyzeDiscovery({
            crawlParams: baseCrawlParams,
            statsJson: {
                reason: 'finished',
                errors: 0,
                documents_found: 0,
                source_urls_found: 0,
                rows: 3,
                manual_mode: true,
            },
            runStatus: 'completed',
            jobErrorMessages: ['skipping download fanout because manual mode is enabled'],
        });

        expect(diagnosis.kind).toBe('zero_match_success');
        expect(diagnosis.severity).toBe('success');
        expect(diagnosis.isZeroOutputFinished).toBe(true);
        expect(diagnosis.suppressFanoutAsPrimaryCause).toBe(true);
    });

    it('flags selector drift when repeater rows are zero', () => {
        const diagnosis = analyzeDiscovery({
            crawlParams: baseCrawlParams,
            statsJson: {
                reason: 'finished',
                errors: 0,
                documents_found: 0,
                source_urls_found: 0,
                rows: 0,
            },
            runStatus: 'completed',
        });

        expect(diagnosis.kind).toBe('config_drift');
        expect(diagnosis.severity).toBe('warning');
        expect(diagnosis.summary).toContain('repeater selector vratil 0 rows');
    });

    it('flags config drift when discovery has no emitter steps', () => {
        const diagnosis = analyzeDiscovery({
            crawlParams: {
                schema_version: 2,
                discovery: {
                    before: [{ action: 'click', selector: '.cookie' }],
                    chain: [
                        {
                            selector: '.list',
                            label: 'List',
                            repeater: {
                                selector: '.row',
                                label: 'Rows',
                                steps: [{ type: 'data_extract', selector: '.title', key: 'title', extract: 'text' }],
                            },
                            pagination: null,
                            children: [],
                        },
                    ],
                },
                processing: [],
            },
            statsJson: {
                reason: 'finished',
                errors: 0,
                documents_found: 0,
                source_urls_found: 0,
                rows: 4,
            },
            runStatus: 'completed',
        });

        expect(diagnosis.kind).toBe('config_drift');
        expect(diagnosis.config.emitterStepCount).toBe(0);
        expect(diagnosis.action).toContain('Porovnej live DOM');
    });

    it('keeps failed runs as runtime failures', () => {
        const diagnosis = analyzeDiscovery({
            crawlParams: baseCrawlParams,
            statsJson: {
                reason: 'failed',
                errors: 2,
                documents_found: 0,
                source_urls_found: 0,
            },
            runStatus: 'failed',
        });

        expect(diagnosis.kind).toBe('runtime_failure');
        expect(diagnosis.severity).toBe('error');
    });

    it('detects download fanout skip messages', () => {
        expect(isDownloadFanoutSkipMessage('skipping download fanout because manual mode is enabled')).toBe(true);
        expect(isDownloadFanoutSkipMessage('worker finished without fanout warning')).toBe(false);
    });
});
