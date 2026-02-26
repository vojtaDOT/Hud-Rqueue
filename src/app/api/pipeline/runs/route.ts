import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { supabase } from '@/lib/supabase';

const CreateRunSchema = z.object({
    source_id: z.string().min(1, 'source_id is required'),
    created_by: z.string().optional(),
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
        status: toStringOrNull(row.status) ?? 'pending',
        active_stage: toStringOrNull(row.active_stage),
        started_at: toStringOrNull(row.started_at),
        finished_at: toStringOrNull(row.finished_at),
        error_message: toStringOrNull(row.error_message),
        created_by: toStringOrNull(row.created_by),
        created_at: toStringOrNull(row.created_at),
        updated_at: toStringOrNull(row.updated_at),
    };
}

async function findFallbackSourceUrlId(sourceId: string): Promise<string | null> {
    const { data, error } = await supabase
        .from('source_urls')
        .select('id')
        .eq('source_id', sourceId)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();

    if (error) throw error;
    if (!data?.id) return null;
    return String(data.id);
}

export async function GET(request: NextRequest) {
    try {
        const sp = request.nextUrl.searchParams;
        const scope = (sp.get('scope') || 'active').toLowerCase();
        const sourceId = sp.get('source_id') || '';
        const statusFilter = sp.get('status') || '';
        const limit = Math.min(Math.max(parseInt(sp.get('limit') || '25', 10) || 25, 1), 200);
        const offset = Math.max(parseInt(sp.get('offset') || '0', 10) || 0, 0);

        let query = supabase
            .from('ingestion_runs')
            .select('*', { count: 'exact' })
            .order('started_at', { ascending: false })
            .range(offset, offset + limit - 1);

        if (sourceId) {
            query = query.eq('source_id', sourceId);
        }

        if (statusFilter) {
            const statuses = statusFilter
                .split(',')
                .map((item) => item.trim().toLowerCase())
                .filter((item) => item.length > 0);
            if (statuses.length > 0) {
                query = query.in('status', statuses);
            }
        } else if (scope === 'active') {
            query = query.in('status', ['pending', 'running']);
        } else if (scope === 'history') {
            query = query.in('status', ['completed', 'failed', 'canceled']);
        }

        const { data, error, count } = await query;
        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        const rawRuns = (data || []).map((row) => normalizeRunRow(row as Record<string, unknown>));
        const missingSourceRuns = rawRuns.filter((row) => !row.source_id && row.source_url_id);

        let sourceBySourceUrlId = new Map<string, string>();
        if (missingSourceRuns.length > 0) {
            const sourceUrlIds = Array.from(new Set(
                missingSourceRuns
                    .map((row) => String(row.source_url_id))
                    .filter((value) => value && value !== 'null'),
            ));
            if (sourceUrlIds.length > 0) {
                const { data: sourceUrls, error: sourceUrlsError } = await supabase
                    .from('source_urls')
                    .select('id, source_id')
                    .in('id', sourceUrlIds);
                if (!sourceUrlsError) {
                    sourceBySourceUrlId = new Map(
                        (sourceUrls || []).map((row) => [String(row.id), String(row.source_id)]),
                    );
                }
            }
        }

        const runs = rawRuns.map((row) => {
            if (row.source_id) return row;
            if (!row.source_url_id) return row;
            const sourceId = sourceBySourceUrlId.get(String(row.source_url_id));
            return sourceId ? { ...row, source_id: sourceId } : row;
        });
        return NextResponse.json({ runs, total: count || 0 });
    } catch (error) {
        console.error('Error listing pipeline runs:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const parsed = CreateRunSchema.safeParse(body);

        if (!parsed.success) {
            return NextResponse.json(
                { error: 'Invalid input', details: parsed.error.format() },
                { status: 400 },
            );
        }

        const now = new Date().toISOString();
        const { source_id: sourceId, created_by: createdBy } = parsed.data;

        const payload: Record<string, unknown> = {
            source_id: sourceId,
            source_url_id: null,
            status: 'running',
            active_stage: 'discovery',
            started_at: now,
            finished_at: null,
            error_message: null,
            created_by: createdBy || 'queue-ui',
            created_at: now,
            updated_at: now,
        };

        const { data, error } = await supabase
            .from('ingestion_runs')
            .insert([payload])
            .select('*')
            .single();

        if (!error && data) {
            const run = normalizeRunRow(data as Record<string, unknown>);
            if (!run.source_id) run.source_id = sourceId;
            return NextResponse.json({ run });
        }

        const message = (error?.message || '').toLowerCase();
        const needsCompatInsert = message.includes('source_url_id')
            || message.includes('source_id')
            || message.includes('does not exist')
            || message.includes('null value in column');

        if (!needsCompatInsert) {
            return NextResponse.json({ error: error?.message || 'Insert failed' }, { status: 500 });
        }

        const fallbackSourceUrlId = await findFallbackSourceUrlId(sourceId);
        if (!fallbackSourceUrlId) {
            return NextResponse.json(
                {
                    error: 'Pro tento source neexistuje žádné source_url. Spusťte nejdřív migrace pipeline nebo vytvořte source_url.',
                },
                { status: 500 },
            );
        }

        const retryPayload = {
            ...payload,
            source_url_id: fallbackSourceUrlId,
        };

        const { data: retryData, error: retryError } = await supabase
            .from('ingestion_runs')
            .insert([retryPayload])
            .select('*')
            .single();

        if (!retryError && retryData) {
            const run = normalizeRunRow(retryData as Record<string, unknown>);
            run.source_id = run.source_id || sourceId;
            run.source_url_id = run.source_url_id || fallbackSourceUrlId;
            return NextResponse.json({ run });
        }

        const compatPayload: Record<string, unknown> = {
            source_id: sourceId,
            source_url_id: fallbackSourceUrlId,
            started_at: now,
            finished_at: null,
            status: 'running',
            stats_json: null,
            created_by: createdBy || 'queue-ui',
            created_at: now,
        };

        let { data: compatData, error: compatError } = await supabase
            .from('ingestion_runs')
            .insert([compatPayload])
            .select('*')
            .single();

        if (compatError && (compatError.message || '').toLowerCase().includes('source_id')) {
            const legacyCompatPayload = { ...compatPayload };
            delete legacyCompatPayload.source_id;
            const legacyResult = await supabase
                .from('ingestion_runs')
                .insert([legacyCompatPayload])
                .select('*')
                .single();
            compatData = legacyResult.data;
            compatError = legacyResult.error;
        }

        if (compatError || !compatData) {
            return NextResponse.json({ error: compatError?.message || 'Compat insert failed' }, { status: 500 });
        }

        const run = normalizeRunRow(compatData as Record<string, unknown>);
        run.source_id = run.source_id || sourceId;
        run.source_url_id = run.source_url_id || fallbackSourceUrlId;
        run.active_stage = run.active_stage || 'discovery';
        run.updated_at = run.updated_at || now;
        return NextResponse.json({ run });
    } catch (error) {
        console.error('Error creating pipeline run:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
