'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { PipelineRunListItem, PipelineRunScope } from '@/components/pipeline/types';

function toStringOrNull(value: unknown): string | null {
    if (value === null || value === undefined) return null;
    return String(value);
}

function normalizeRunRow(row: Record<string, unknown>): PipelineRunListItem {
    return {
        ...row,
        id: String(row.id),
        source_id: toStringOrNull(row.source_id) || '',
        source_url_id: toStringOrNull(row.source_url_id),
        status: toStringOrNull(row.status) || 'pending',
        active_stage: toStringOrNull(row.active_stage),
        started_at: toStringOrNull(row.started_at),
        finished_at: toStringOrNull(row.finished_at),
        error_message: toStringOrNull(row.error_message),
        stats_json: row.stats_json ?? null,
        created_by: toStringOrNull(row.created_by),
        created_at: toStringOrNull(row.created_at) || '',
        updated_at: toStringOrNull(row.updated_at),
    };
}

export function useIngestionRuns(scope: PipelineRunScope, sourceId?: string | null) {
    const [runs, setRuns] = useState<PipelineRunListItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const scopeStatuses = useMemo(() => (
        scope === 'active' ? ['pending', 'running'] : ['completed', 'failed', 'canceled']
    ), [scope]);

    const refresh = useCallback(async () => {
        setError(null);
        const sp = new URLSearchParams();
        sp.set('scope', scope);
        sp.set('limit', '300');
        if (sourceId) sp.set('source_id', sourceId);
        if (!sourceId) sp.set('status', scopeStatuses.join(','));

        try {
            const response = await fetch(`/api/pipeline/runs?${sp.toString()}`, {
                method: 'GET',
                cache: 'no-store',
            });
            const json = await response.json();
            if (!response.ok) {
                setError(json.error || 'Failed to load ingestion runs');
                setRuns([]);
                return;
            }
            const next = (json.runs || []).map((row: Record<string, unknown>) => normalizeRunRow(row));
            setRuns(next);
        } catch (error) {
            setError(error instanceof Error ? error.message : 'Failed to load ingestion runs');
            setRuns([]);
        }
    }, [scope, scopeStatuses, sourceId]);

    useEffect(() => {
        let mounted = true;

        (async () => {
            setLoading(true);
            await refresh();
            if (mounted) setLoading(false);
        })();

        const channel = supabase
            .channel(`ingestion-runs-${scope}-${sourceId || 'all'}`)
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'ingestion_runs' },
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
    }, [refresh, scope, sourceId]);

    return { runs, loading, error, refresh };
}
