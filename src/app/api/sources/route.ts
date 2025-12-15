import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { name, base_url, enabled, crawl_strategy, crawl_params, crawl_interval, typ_id, obec_id, okres_id, kraj_id } = body;

        // Basic server-side validation
        if (!name || !base_url) {
            return NextResponse.json(
                { error: 'Name and Base URL are required' },
                { status: 400 }
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
