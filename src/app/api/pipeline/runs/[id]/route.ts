import { NextResponse } from 'next/server';
import { z } from 'zod';
import { supabase } from '@/lib/supabase';

type RouteContext = { params: Promise<{ id: string }> };
const DELETABLE_RUN_STATUSES = new Set(['pending', 'running']);

const PatchRunSchema = z.object({
    status: z.enum(['pending', 'running', 'completed', 'failed', 'canceled']).optional(),
    active_stage: z.enum(['discovery', 'documents', 'ocr', 'summary']).optional(),
    finished_at: z.string().nullable().optional(),
    error_message: z.string().nullable().optional(),
    stats_json: z.unknown().nullable().optional(),
});

function toStringOrNull(value: unknown): string | null {
    if (value === null || value === undefined) return null;
    return String(value);
}

function normalizeRunRow(row: Record<string, unknown>): Record<string, unknown> {
    return {
        ...row,
        id: String(row.id),
        source_id: toStringOrNull(row.source_id),
        source_url_id: toStringOrNull(row.source_url_id),
        created_by: toStringOrNull(row.created_by),
        status: toStringOrNull(row.status) ?? 'pending',
        active_stage: toStringOrNull(row.active_stage),
        started_at: toStringOrNull(row.started_at),
        finished_at: toStringOrNull(row.finished_at),
        error_message: toStringOrNull(row.error_message),
        created_at: toStringOrNull(row.created_at),
        updated_at: toStringOrNull(row.updated_at),
    };
}

async function resolveSourceIdFromSourceUrl(sourceUrlId: string | null): Promise<string | null> {
    if (!sourceUrlId) return null;
    const { data, error } = await supabase
        .from('source_urls')
        .select('source_id')
        .eq('id', sourceUrlId)
        .maybeSingle();
    if (error || !data?.source_id) return null;
    return String(data.source_id);
}

function normalizeItemRow(row: Record<string, unknown>): Record<string, unknown> {
    return {
        ...row,
        id: String(row.id),
        run_id: toStringOrNull(row.run_id),
        source_id: toStringOrNull(row.source_id),
        source_url_id: toStringOrNull(row.source_url_id),
        document_id: toStringOrNull(row.document_id),
        item_key: toStringOrNull(row.item_key),
        item_label: toStringOrNull(row.item_label),
        stage: toStringOrNull(row.stage),
        item_type: toStringOrNull(row.item_type),
        status: toStringOrNull(row.status),
        ingest_status: toStringOrNull(row.ingest_status),
        ingest_reason: toStringOrNull(row.ingest_reason),
        job_id: toStringOrNull(row.job_id),
        step_order: row.step_order === null || row.step_order === undefined ? null : Number(row.step_order),
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
        created_at: toStringOrNull(row.created_at),
        updated_at: toStringOrNull(row.updated_at),
    };
}

export async function GET(_: Request, context: RouteContext) {
    try {
        const { id } = await context.params;

        const { data: runData, error: runError } = await supabase
            .from('ingestion_runs')
            .select('*')
            .eq('id', id)
            .single();

        if (runError) {
            const status = runError.code === 'PGRST116' ? 404 : 500;
            return NextResponse.json({ error: runError.message }, { status });
        }

        const { data: itemData, error: itemError } = await supabase
            .from('ingestion_items')
            .select('*')
            .eq('run_id', id)
            .order('last_seen_at', { ascending: false })
            .order('updated_at', { ascending: false });

        if (itemError) {
            return NextResponse.json({ error: itemError.message }, { status: 500 });
        }

        const run = normalizeRunRow(runData as Record<string, unknown>);
        if (!run.source_id) {
            run.source_id = await resolveSourceIdFromSourceUrl(toStringOrNull(run.source_url_id));
        }
        const items = (itemData || []).map((row) => normalizeItemRow(row as Record<string, unknown>));

        return NextResponse.json({ run, items });
    } catch (error) {
        console.error('Error fetching pipeline run detail:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

export async function PATCH(request: Request, context: RouteContext) {
    try {
        const { id } = await context.params;
        const body = await request.json();
        const parsed = PatchRunSchema.safeParse(body);

        if (!parsed.success) {
            return NextResponse.json(
                { error: 'Invalid input', details: parsed.error.format() },
                { status: 400 },
            );
        }

        const updates = {
            ...parsed.data,
            updated_at: new Date().toISOString(),
        };

        const { data, error } = await supabase
            .from('ingestion_runs')
            .update(updates)
            .eq('id', id)
            .select('*')
            .single();

        if (error) {
            const message = (error.message || '').toLowerCase();
            const compatUpdates: Record<string, unknown> = {};
            if (parsed.data.status !== undefined) compatUpdates.status = parsed.data.status;
            if (parsed.data.finished_at !== undefined) compatUpdates.finished_at = parsed.data.finished_at;
            if (parsed.data.stats_json !== undefined) compatUpdates.stats_json = parsed.data.stats_json;

            if (Object.keys(compatUpdates).length === 0 || !message.includes('does not exist')) {
                const status = error.code === 'PGRST116' ? 404 : 500;
                return NextResponse.json({ error: error.message }, { status });
            }

            const { data: compatData, error: compatError } = await supabase
                .from('ingestion_runs')
                .update(compatUpdates)
                .eq('id', id)
                .select('*')
                .single();

            if (compatError) {
                const status = compatError.code === 'PGRST116' ? 404 : 500;
                return NextResponse.json({ error: compatError.message }, { status });
            }

            const compatRun = normalizeRunRow(compatData as Record<string, unknown>);
            if (!compatRun.source_id) {
                compatRun.source_id = await resolveSourceIdFromSourceUrl(toStringOrNull(compatRun.source_url_id));
            }
            if (parsed.data.active_stage !== undefined) compatRun.active_stage = parsed.data.active_stage;
            if (parsed.data.error_message !== undefined) compatRun.error_message = parsed.data.error_message;
            return NextResponse.json({ run: compatRun });
        }

        const run = normalizeRunRow(data as Record<string, unknown>);
        if (!run.source_id) {
            run.source_id = await resolveSourceIdFromSourceUrl(toStringOrNull(run.source_url_id));
        }
        return NextResponse.json({ run });
    } catch (error) {
        console.error('Error patching pipeline run:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

export async function DELETE(_: Request, context: RouteContext) {
    try {
        const { id } = await context.params;

        const { data: runData, error: runError } = await supabase
            .from('ingestion_runs')
            .select('id, status')
            .eq('id', id)
            .maybeSingle();

        if (runError) {
            const status = runError.code === 'PGRST116' ? 404 : 500;
            return NextResponse.json({ error: runError.message }, { status });
        }

        if (!runData?.id) {
            return NextResponse.json({ error: 'Run nenalezen' }, { status: 404 });
        }

        const runStatus = String(runData.status || '').toLowerCase();
        if (!DELETABLE_RUN_STATUSES.has(runStatus)) {
            return NextResponse.json(
                { error: 'Smazat lze pouze nedokončené běhy (pending/running).' },
                { status: 400 },
            );
        }

        const { error: deleteItemsError } = await supabase
            .from('ingestion_items')
            .delete()
            .eq('run_id', id);

        if (deleteItemsError) {
            return NextResponse.json({ error: deleteItemsError.message }, { status: 500 });
        }

        const { data: deletedRun, error: deleteRunError } = await supabase
            .from('ingestion_runs')
            .delete()
            .eq('id', id)
            .in('status', Array.from(DELETABLE_RUN_STATUSES))
            .select('id')
            .maybeSingle();

        if (deleteRunError) {
            return NextResponse.json({ error: deleteRunError.message }, { status: 500 });
        }

        if (!deletedRun?.id) {
            return NextResponse.json(
                { error: 'Run byl mezitím dokončen a nelze ho smazat.' },
                { status: 409 },
            );
        }

        return NextResponse.json({ ok: true, id: String(deletedRun.id) });
    } catch (error) {
        console.error('Error deleting pipeline run:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
