import { NextResponse, NextRequest } from 'next/server';
import { supabase } from '@/lib/supabase';
import { ALLOWED_TABLES, getTableSchema } from '@/components/database/table-schema';

type RouteContext = { params: Promise<{ table: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
    const { table: tableName } = await context.params;

    if (!ALLOWED_TABLES.includes(tableName)) {
        return NextResponse.json({ error: 'Invalid table name' }, { status: 400 });
    }

    const schema = getTableSchema(tableName)!;
    const sp = request.nextUrl.searchParams;
    const page = parseInt(sp.get('page') || '0');
    const pageSize = parseInt(sp.get('pageSize') || '25');
    const sortColumn = sp.get('sort') || schema.primaryKey;
    const sortDir = sp.get('order') || 'desc';
    const search = sp.get('search') || '';

    // Build search filter for text/varchar columns
    const searchableTextCols = schema.columns.filter(
        c => c.searchable && (c.type === 'text' || c.type === 'varchar'),
    );
    const orFilter =
        search && searchableTextCols.length > 0
            ? searchableTextCols.map(c => `${c.name}.ilike.%${search}%`).join(',')
            : null;

    // Count query
    let countQ = supabase.from(tableName).select('*', { count: 'exact', head: true });
    if (orFilter) countQ = countQ.or(orFilter);
    const { count } = await countQ;

    // Data query
    let query = supabase.from(tableName).select('*');
    if (orFilter) query = query.or(orFilter);
    query = query
        .order(sortColumn, { ascending: sortDir === 'asc' })
        .range(page * pageSize, (page + 1) * pageSize - 1);

    const { data, error } = await query;

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ rows: data || [], count: count || 0 });
}

export async function POST(request: NextRequest, context: RouteContext) {
    const { table: tableName } = await context.params;

    if (!ALLOWED_TABLES.includes(tableName)) {
        return NextResponse.json({ error: 'Invalid table name' }, { status: 400 });
    }

    const body = await request.json();

    const { data, error } = await supabase
        .from(tableName)
        .insert([body])
        .select()
        .single();

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ row: data });
}

export async function PATCH(request: NextRequest, context: RouteContext) {
    const { table: tableName } = await context.params;

    if (!ALLOWED_TABLES.includes(tableName)) {
        return NextResponse.json({ error: 'Invalid table name' }, { status: 400 });
    }

    const schema = getTableSchema(tableName)!;
    const body = await request.json();
    const { __pk, ...updates } = body;

    if (__pk === undefined || __pk === null) {
        return NextResponse.json({ error: 'Missing primary key (__pk)' }, { status: 400 });
    }

    const { data, error } = await supabase
        .from(tableName)
        .update(updates)
        .eq(schema.primaryKey, __pk)
        .select()
        .single();

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ row: data });
}

// FK cascade chains: parent table → { childTable, childFkColumn }
const CASCADE_MAP: Record<string, { table: string; fk: string }[]> = {
    sources: [
        { table: 'source_urls', fk: 'source_id' },
        { table: 'ingestion_runs', fk: 'source_id' },
        { table: 'ingestion_items', fk: 'source_id' },
    ],
    source_urls: [
        { table: 'documents', fk: 'source_url_id' },
        { table: 'ingestion_items', fk: 'source_url_id' },
        { table: 'ingestion_runs', fk: 'source_url_id' },
    ],
    ingestion_runs: [{ table: 'ingestion_items', fk: 'run_id' }],
    documents: [
        { table: 'document_texts', fk: 'document_id' },
        { table: 'ingestion_items', fk: 'document_id' },
    ],
    cz_regions_kraj: [{ table: 'cz_regions_okres', fk: 'kraj_id' }],
    cz_regions_okres: [{ table: 'cz_regions_obec', fk: 'okres_id' }],
};

async function cascadeDelete(tableName: string, pkColumn: string, pkValue: string): Promise<string | null> {
    const children = CASCADE_MAP[tableName];
    if (children) {
        for (const child of children) {
            // Fetch child PKs to cascade deeper
            const childSchema = getTableSchema(child.table);
            if (!childSchema) continue;

            const { data: childRows } = await supabase
                .from(child.table)
                .select(childSchema.primaryKey)
                .eq(child.fk, pkValue);

            if (childRows && childRows.length > 0) {
                for (const childRow of childRows) {
                    const childPk = String((childRow as unknown as Record<string, unknown>)[childSchema.primaryKey]);
                    const childErr = await cascadeDelete(child.table, childSchema.primaryKey, childPk);
                    if (childErr) return childErr;
                }
            }
        }
    }

    const { error } = await supabase.from(tableName).delete().eq(pkColumn, pkValue);
    return error ? error.message : null;
}

export async function DELETE(request: NextRequest, context: RouteContext) {
    const { table: tableName } = await context.params;

    if (!ALLOWED_TABLES.includes(tableName)) {
        return NextResponse.json({ error: 'Invalid table name' }, { status: 400 });
    }

    const schema = getTableSchema(tableName)!;
    const pk = request.nextUrl.searchParams.get('pk');

    if (!pk) {
        return NextResponse.json({ error: 'Missing primary key (pk)' }, { status: 400 });
    }

    const err = await cascadeDelete(tableName, schema.primaryKey, pk);

    if (err) {
        return NextResponse.json({ error: err }, { status: 500 });
    }

    return NextResponse.json({ success: true });
}
