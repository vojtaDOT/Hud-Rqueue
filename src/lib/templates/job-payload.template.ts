/**
 * json-e template for Redis job hash payload.
 *
 * Used by /api/pipeline/jobs and /api/tasks when enqueuing jobs.
 * All fields are strings (Redis hash values).
 */
export const JOB_PAYLOAD_TEMPLATE = {
    id: { $eval: 'id' },
    task: { $eval: 'task' },
    source_id: { $eval: 'source_id' },
    source_url_id: { $eval: 'source_url_id' },
    document_id: { $eval: 'document_id' },
    run_id: { $eval: 'run_id' },
    status: 'pending',
    created_at: { $eval: 'created_at' },
    attempts: '0',
    max_attempts: { $eval: 'max_attempts' },
    worker: '',
    started_at: '',
    completed_at: '',
    error_message: '',
    cron_time: { $eval: 'cron_time' },
    manual: { $eval: 'manual' },
    // OCR fields (empty string when not applicable)
    mode: { $eval: 'ocr_mode' },
    lang: { $eval: 'ocr_lang' },
    dpi: { $eval: 'ocr_dpi' },
    psm: { $eval: 'ocr_psm' },
    oem: { $eval: 'ocr_oem' },
    min_text_chars: { $eval: 'ocr_min_text_chars' },
    ocr_addon: { $eval: 'ocr_addon' },
} as const;

/**
 * Context shape for JOB_PAYLOAD_TEMPLATE.
 */
export interface JobPayloadContext {
    id: string | number;
    task: string;
    source_id: string;
    source_url_id: string;
    document_id: string;
    run_id: string;
    created_at: string;
    max_attempts: string;
    cron_time: string;
    manual: string;
    ocr_mode: string;
    ocr_lang: string;
    ocr_dpi: string;
    ocr_psm: string | number;
    ocr_oem: string | number;
    ocr_min_text_chars: string;
    ocr_addon: string;
}
