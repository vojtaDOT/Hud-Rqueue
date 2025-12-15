import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const query = searchParams.get('q');

        if (!query || query.length < 2) {
            return NextResponse.json({ obce: [] });
        }

        // Search obce by nazev (jsonb field) with join to okres and kraj
        const { data, error } = await supabase
            .from('cz_regions_obec')
            .select(`
                id,
                kod,
                nazev,
                okres_id,
                cz_regions_okres!inner (
                    id,
                    name,
                    kraj_id,
                    cz_regions_kraj!inner (
                        id,
                        name
                    )
                )
            `)
            .ilike('nazev->>cs', `%${query}%`)
            .limit(10);

        if (error) {
            console.error('Supabase error:', error);
            return NextResponse.json(
                { error: error.message },
                { status: 500 }
            );
        }

        // Transform the data to a flatter structure
        const transformedData = data?.map((obec) => {
            const okres = obec.cz_regions_okres as unknown as {
                id: string;
                name: { cs: string } | string;
                kraj_id: string;
                cz_regions_kraj: { id: string; name: { cs: string } | string };
            };
            return {
                id: obec.id,
                kod: obec.kod,
                nazev: typeof obec.nazev === 'object' ? (obec.nazev as { cs: string }).cs : obec.nazev,
                okres_id: obec.okres_id,
                okres_nazev: typeof okres.name === 'object' ? okres.name.cs : okres.name,
                kraj_id: okres.kraj_id,
                kraj_nazev: typeof okres.cz_regions_kraj.name === 'object'
                    ? okres.cz_regions_kraj.name.cs
                    : okres.cz_regions_kraj.name,
            };
        }) || [];

        return NextResponse.json({ obce: transformedData });
    } catch (error) {
        console.error('API error:', error);
        return NextResponse.json(
            { error: 'Internal Server Error' },
            { status: 500 }
        );
    }
}
