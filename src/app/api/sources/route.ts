import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { findSourceDuplicate } from '@/lib/duplicate-precheck';

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const {
            name,
            base_url,
            enabled,
            crawl_strategy,
            crawl_params,
            extraction_data,
            crawl_interval,
            typ_id,
            obec_id,
            okres_id,
            kraj_id,
        } = body;

        // Basic server-side validation
        if (!name || !base_url) {
            return NextResponse.json(
                { error: 'Name and Base URL are required' },
                { status: 400 }
            );
        }

        const duplicateConflict = await findSourceDuplicate(String(base_url));
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

        const { data, error } = await supabase
            .from('sources')
            .insert([
                {
                    name,
                    base_url,
                    enabled,
                    crawl_strategy,
                    extraction_data,
                    crawl_params, // Expecting valid JSON object
                    crawl_interval,
                    typ_id: typ_id || null,
                    obec_id: obec_id || null,
                    okres_id: okres_id || null,
                    kraj_id: kraj_id || null,
                    updated_at: new Date().toISOString(),
                },
            ])
            .select()
            .single();

        if (error) {
            if (error.code === '23505' || /duplicate key value/i.test(error.message || '')) {
                return NextResponse.json(
                    {
                        error: 'Duplicate source base URL',
                        code: 'DUPLICATE_CONFLICT',
                        conflict: {
                            table: 'sources',
                            key: String(base_url),
                        },
                    },
                    { status: 409 },
                );
            }
            console.error('Supabase error:', error);
            return NextResponse.json(
                { error: error.message },
                { status: 500 }
            );
        }

        return NextResponse.json({ source: data });
    } catch (error) {
        console.error('API error:', error);
        return NextResponse.json(
            { error: 'Internal Server Error' },
            { status: 500 }
        );
    }
}
