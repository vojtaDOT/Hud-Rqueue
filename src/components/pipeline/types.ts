export type PipelineTask = 'discover' | 'download' | 'ocr';

export type PipelineStage = 'sources' | 'discovery' | 'download' | 'ocr' | 'summary';

export type PipelineJobStatusValue = 'pending' | 'processing' | 'completed' | 'failed' | 'unknown';
export type PipelineRunStatus = 'pending' | 'running' | 'completed' | 'failed' | 'canceled';
export type PipelineRunScope = 'active' | 'history';
export type PipelineItemStage = 'discovery' | 'documents' | 'ocr';
export type PipelineItemType = 'source_url' | 'document' | 'ocr_job';
export type PipelineItemStatus =
    | 'pending'
    | 'running'
    | 'completed'
    | 'failed'
    | 'canceled'
    | 'skipped'
    | 'review_required';

export interface PipelineJobRequest {
    task: PipelineTask;
    run_id?: string;
    source_id: string;
    source_url_id?: string;
    document_id?: string;
    manual?: boolean;
    max_attempts?: number;
    mode?: string;
    lang?: string;
    dpi?: string;
    psm?: string;
    oem?: string;
    min_text_chars?: string;
    ocr_addon?: string;
}

export interface PipelineCreatedJob {
    id: string;
    task: PipelineTask;
    run_id: string;
    source_id: string;
    source_url_id: string;
    document_id: string;
    manual: boolean;
    mode?: string;
    lang?: string;
    dpi?: string;
    psm?: string;
    oem?: string;
    min_text_chars?: string;
    ocr_addon?: string;
}

export interface PipelineJobStatus {
    id: string;
    task: string;
    status: PipelineJobStatusValue;
    run_id?: string;
    attempts: string;
    error_message: string;
    started_at: string;
    completed_at: string;
    source_id?: string;
    source_url_id?: string;
    document_id?: string;
    manual?: boolean;
    mode?: string;
    lang?: string;
    dpi?: string;
    psm?: string;
    oem?: string;
    min_text_chars?: string;
    ocr_addon?: string;
}

export interface PipelineIngestionItem {
    id: string;
    run_id: string | null;
    source_id: string | null;
    source_url_id: string | null;
    document_id: string | null;
    item_key: string | null;
    item_label: string | null;
    stage: PipelineItemStage | null;
    item_type: PipelineItemType | null;
    status: PipelineItemStatus | null;
    ingest_status: string | null;
    ingest_reason: string | null;
    job_id: string | null;
    step_order: number | null;
    context_json: unknown;
    payload_json: unknown;
    filename: string | null;
    document_url: string | null;
    file_kind: string | null;
    file_checksum: string | null;
    error_message: string | null;
    last_error_message: string | null;
    review_reason: string | null;
    needs_review: boolean;
    first_seen_at: string | null;
    last_seen_at: string | null;
    created_at: string;
    updated_at: string;
}

export interface PipelineRunListItem {
    id: string;
    source_id: string;
    source_url_id: string | null;
    status: PipelineRunStatus | string;
    active_stage: PipelineStage | string | null;
    started_at: string | null;
    finished_at: string | null;
    error_message: string | null;
    stats_json: unknown;
    created_by: string | null;
    created_at: string;
    updated_at: string | null;
}

export interface PipelineRunDetail extends PipelineRunListItem {
    items?: PipelineIngestionItem[];
}

export interface PipelineSummary {
    newSourceUrls: number;
    changedDocuments: number;
    blobOk: number;
    ocrCompleted: number;
    ocrFailed: number;
}

export interface PipelineRunState {
    selectedSourceId: string | null;
    selectedRunId: string | null;
    runStartedAt: string | null;
    activeStage: PipelineStage;
}
