import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { findSourceDuplicate } from '@/lib/duplicate-precheck';
import { validateSourcePayload } from '@/lib/source-config';

export async function GET(
    _request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;

    const numericId = Number(id);
    if (!Number.isFinite(numericId) || numericId <= 0) {
        return NextResponse.json({ error: 'Invalid source ID' }, { status: 400 });
    }

    const { data, error } = await supabase
        .from('sources')
        .select('*')
        .eq('id', numericId)
        .single();

    if (error || !data) {
        return NextResponse.json({ error: 'Source not found' }, { status: 404 });
    }

    return NextResponse.json({ source: data });
}

export async function PUT(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;

    const numericId = Number(id);
    if (!Number.isFinite(numericId) || numericId <= 0) {
        return NextResponse.json({ error: 'Invalid source ID' }, { status: 400 });
    }

    try {
        const body = await request.json();
        const validated = validateSourcePayload(body);
        if (!validated.success) {
            const details = validated.error ? validated.error.format() : { _errors: ['Invalid source payload'] };
            return NextResponse.json({ error: 'Invalid source payload', details }, { status: 400 });
        }
        const payload = validated.data;

        const duplicateConflict = await findSourceDuplicate(payload.base_url, String(numericId));
        if (duplicateConflict) {
            return NextResponse.json(
                {
                    error: 'Duplicate source base URL',
                    code: 'DUPLICATE_CONFLICT',
                    conflict: duplicateConflict,
                },
                { status: 409 },
            );
        }

        const now = new Date().toISOString();
        const { data, error } = await supabase
            .from('sources')
            .update({
                name: payload.name,
                base_url: payload.base_url,
                enabled: payload.enabled,
                crawl_strategy: payload.crawl_strategy,
                extraction_data: payload.extraction_data,
                crawl_params: payload.crawl_params,
                crawl_interval: payload.crawl_interval,
                typ_id: payload.typ_id,
                obec_id: payload.obec_id,
                okres_id: payload.okres_id,
                kraj_id: payload.kraj_id,
                workflow_data: body.workflow_data ?? null,
                updated_at: now,
            })
            .eq('id', numericId)
            .select()
            .single();

        if (error) {
            if (error.code === 'PGRST116') {
                return NextResponse.json({ error: 'Source not found' }, { status: 404 });
            }
            console.error('Supabase error:', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ source: data });
    } catch (error) {
        console.error('API error:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Internal Server Error' },
            { status: 500 },
        );
    }
}
