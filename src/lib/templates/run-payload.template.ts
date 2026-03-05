/**
 * json-e template for ingestion_runs insert payload.
 *
 * Used by /api/pipeline/runs when creating a new pipeline run.
 */
export const RUN_PAYLOAD_TEMPLATE = {
    source_id: { $eval: 'source_id' },
    source_url_id: { $if: 'source_url_id', then: { $eval: 'source_url_id' }, else: null },
    status: 'running',
    active_stage: 'discovery',
    started_at: { $eval: 'now()' },
    finished_at: null,
    error_message: null,
    created_by: { $if: 'created_by', then: { $eval: 'created_by' }, else: 'queue-ui' },
    created_at: { $eval: 'now()' },
    updated_at: { $eval: 'now()' },
} as const;

/**
 * Context shape for RUN_PAYLOAD_TEMPLATE.
 */
export interface RunPayloadContext {
    source_id: string;
    source_url_id?: string | null;
    created_by?: string;
}
