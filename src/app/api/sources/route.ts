import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { findSourceDuplicate } from '@/lib/duplicate-precheck';
import { validateSourcePayload } from '@/lib/source-config';

function isDuplicateConstraintError(error: { code?: string; message?: string } | null): boolean {
    if (!error) return false;
    if (error.code === '23505') return true;
    return /duplicate key value/i.test(error.message || '');
}

function duplicateSourceConflictResponse(key: string) {
    return NextResponse.json(
        {
            error: 'Duplicate source base URL',
            code: 'DUPLICATE_CONFLICT',
            conflict: {
                table: 'sources',
                key,
            },
        },
        { status: 409 },
    );
}

async function ensureSeedSourceUrl(input: {
    sourceId: string | number;
    baseUrl: string;
    sourceName: string;
}) {
    const now = new Date().toISOString();
    const payload = {
        source_id: input.sourceId,
        url: input.baseUrl,
        label: `Seed URL for source: ${input.sourceName}`,
        enabled: true,
        created_at: now,
        updated_at: now,
    };

    const { error } = await supabase
        .from('source_urls')
        .insert([payload]);

    if (error && !isDuplicateConstraintError(error)) {
        throw new Error(error.message);
    }
}

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const validated = validateSourcePayload(body);
        if (!validated.success) {
            const details = validated.error ? validated.error.format() : { _errors: ['Invalid source payload'] };
            return NextResponse.json(
                {
                    error: 'Invalid source payload',
                    details,
                },
                { status: 400 },
            );
        }
        const payload = validated.data;

        const duplicateConflict = await findSourceDuplicate(payload.base_url);
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
        const { data: source, error } = await supabase
            .from('sources')
            .insert([
                {
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
                },
            ])
            .select()
            .single();

        if (error) {
            if (isDuplicateConstraintError(error)) {
                return duplicateSourceConflictResponse(payload.base_url);
            }
            console.error('Supabase error:', error);
            return NextResponse.json(
                { error: error.message },
                { status: 500 },
            );
        }

        await ensureSeedSourceUrl({
            sourceId: source.id,
            baseUrl: payload.base_url,
            sourceName: payload.name,
        });

        return NextResponse.json({ source });
    } catch (error) {
        console.error('API error:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Internal Server Error' },
            { status: 500 },
        );
    }
}
