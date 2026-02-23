export type PipelineTask = 'discover' | 'download' | 'ocr';

export type PipelineStage = 'sources' | 'discovery' | 'download' | 'ocr' | 'summary';

export type PipelineJobStatusValue = 'pending' | 'processing' | 'completed' | 'failed' | 'unknown';

export interface PipelineJobRequest {
    task: PipelineTask;
    source_id: string;
    source_url_id?: string;
    document_id?: string;
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
    source_id: string;
    source_url_id: string;
    document_id: string;
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
    attempts: string;
    error_message: string;
    started_at: string;
    completed_at: string;
    source_id?: string;
    source_url_id?: string;
    document_id?: string;
    mode?: string;
    lang?: string;
    dpi?: string;
    psm?: string;
    oem?: string;
    min_text_chars?: string;
    ocr_addon?: string;
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
    runStartedAt: string | null;
    activeStage: PipelineStage;
}
