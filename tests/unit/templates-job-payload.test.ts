import { describe, expect, it } from 'vitest';

import { renderTemplate } from '@/lib/templates/engine';
import { JOB_PAYLOAD_TEMPLATE } from '@/lib/templates/job-payload.template';
import { RUN_PAYLOAD_TEMPLATE } from '@/lib/templates/run-payload.template';

describe('JOB_PAYLOAD_TEMPLATE', () => {
    it('renders discover job payload', () => {
        const result = renderTemplate<Record<string, unknown>>(
            JOB_PAYLOAD_TEMPLATE as unknown as Record<string, unknown>,
            {
                id: '42',
                task: 'discover',
                source_id: 'src-1',
                source_url_id: 'su-1',
                document_id: '',
                run_id: 'run-1',
                created_at: '2025-01-01T00:00:00Z',
                max_attempts: '3',
                cron_time: '',
                manual: '0',
                ocr_mode: '',
                ocr_lang: '',
                ocr_dpi: '',
                ocr_psm: '',
                ocr_oem: '',
                ocr_min_text_chars: '',
                ocr_addon: '',
            },
        );

        expect(result.id).toBe('42');
        expect(result.task).toBe('discover');
        expect(result.status).toBe('pending');
        expect(result.attempts).toBe('0');
        expect(result.worker).toBe('');
        expect(result.source_id).toBe('src-1');
        expect(result.run_id).toBe('run-1');
        expect(result.mode).toBe('');
    });

    it('renders OCR job payload with OCR fields', () => {
        const result = renderTemplate<Record<string, unknown>>(
            JOB_PAYLOAD_TEMPLATE as unknown as Record<string, unknown>,
            {
                id: '99',
                task: 'ocr',
                source_id: 'src-2',
                source_url_id: '',
                document_id: 'doc-5',
                run_id: '',
                created_at: '2025-06-01T12:00:00Z',
                max_attempts: '5',
                cron_time: '',
                manual: '1',
                ocr_mode: 'hybrid',
                ocr_lang: 'ces+eng',
                ocr_dpi: '300',
                ocr_psm: '3',
                ocr_oem: '3',
                ocr_min_text_chars: '30',
                ocr_addon: '1',
            },
        );

        expect(result.task).toBe('ocr');
        expect(result.document_id).toBe('doc-5');
        expect(result.mode).toBe('hybrid');
        expect(result.lang).toBe('ces+eng');
        expect(result.dpi).toBe('300');
        expect(result.psm).toBe('3');
        expect(result.oem).toBe('3');
        expect(result.min_text_chars).toBe('30');
        expect(result.ocr_addon).toBe('1');
        expect(result.manual).toBe('1');
    });
});

describe('RUN_PAYLOAD_TEMPLATE', () => {
    it('renders run payload with default created_by', () => {
        const result = renderTemplate<Record<string, unknown>>(
            RUN_PAYLOAD_TEMPLATE as unknown as Record<string, unknown>,
            {
                source_id: 'src-1',
                source_url_id: null,
                created_by: null,
            },
        );

        expect(result.source_id).toBe('src-1');
        expect(result.source_url_id).toBeNull();
        expect(result.status).toBe('running');
        expect(result.active_stage).toBe('discovery');
        expect(result.created_by).toBe('queue-ui');
        expect(result.finished_at).toBeNull();
        expect(result.error_message).toBeNull();
        // timestamps are ISO strings
        expect(typeof result.started_at).toBe('string');
        expect(typeof result.created_at).toBe('string');
    });

    it('renders run payload with explicit created_by and source_url_id', () => {
        const result = renderTemplate<Record<string, unknown>>(
            RUN_PAYLOAD_TEMPLATE as unknown as Record<string, unknown>,
            {
                source_id: 'src-2',
                source_url_id: 'su-5',
                created_by: 'cron-scheduler',
            },
        );

        expect(result.source_url_id).toBe('su-5');
        expect(result.created_by).toBe('cron-scheduler');
    });
});
