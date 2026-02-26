'use client';

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { PipelineIngestionItem } from '@/components/pipeline/types';

function toStringOrNull(value: unknown): string | null {
    if (value === null || value === undefined) return null;
    return String(value);
}

function normalizeItemRow(row: Record<string, unknown>): PipelineIngestionItem {
    return {
        ...row,
        id: String(row.id),
        run_id: toStringOrNull(row.run_id),
        source_id: toStringOrNull(row.source_id),
        source_url_id: toStringOrNull(row.source_url_id),
        document_id: toStringOrNull(row.document_id),
        item_key: toStringOrNull(row.item_key),
        item_label: toStringOrNull(row.item_label),
        stage: toStringOrNull(row.stage) as PipelineIngestionItem['stage'],
        item_type: toStringOrNull(row.item_type) as PipelineIngestionItem['item_type'],
        status: toStringOrNull(row.status) as PipelineIngestionItem['status'],
        ingest_status: toStringOrNull(row.ingest_status),
        ingest_reason: toStringOrNull(row.ingest_reason),
        job_id: toStringOrNull(row.job_id),
        step_order: row.step_order === null || row.step_order === undefined ? null : Number(row.step_order),
        context_json: row.context_json ?? null,
        payload_json: row.payload_json ?? null,
        filename: toStringOrNull(row.filename),
        document_url: toStringOrNull(row.document_url),
        file_kind: toStringOrNull(row.file_kind),
        file_checksum: toStringOrNull(row.file_checksum),
        error_message: toStringOrNull(row.error_message),
        last_error_message: toStringOrNull(row.last_error_message),
        review_reason: toStringOrNull(row.review_reason),
        needs_review: Boolean(row.needs_review),
        first_seen_at: toStringOrNull(row.first_seen_at),
        last_seen_at: toStringOrNull(row.last_seen_at),
        created_at: toStringOrNull(row.created_at) || '',
        updated_at: toStringOrNull(row.updated_at) || '',
    };
}

export function useIngestionItems(runId: string | null) {
    const [items, setItems] = useState<PipelineIngestionItem[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const refresh = useCallback(async () => {
        if (!runId) {
            setItems([]);
            setError(null);
            return;
        }

        setError(null);

        const { data, error: queryError } = await supabase
            .from('ingestion_items')
            .select('*')
            .eq('run_id', runId)
            .order('last_seen_at', { ascending: false })
            .order('updated_at', { ascending: false });

        if (queryError) {
            setError(queryError.message);
            setItems([]);
            return;
        }

        const next = (data || []).map((row) => normalizeItemRow(row as Record<string, unknown>));
        setItems(next);
    }, [runId]);

    useEffect(() => {
        let mounted = true;

        (async () => {
            setLoading(true);
            await refresh();
            if (mounted) setLoading(false);
        })();

        if (!runId) {
            return () => {
                mounted = false;
            };
        }

        const channel = supabase
            .channel(`ingestion-items-run-${runId}`)
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'ingestion_items',
                    filter: `run_id=eq.${runId}`,
                },
                () => {
                    void refresh();
                },
            )
            .subscribe();

        const pollTimer = setInterval(() => {
            void refresh();
        }, 15000);

        return () => {
            mounted = false;
            clearInterval(pollTimer);
            supabase.removeChannel(channel);
        };
    }, [refresh, runId]);

    return { items, loading, error, refresh };
}
