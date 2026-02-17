import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

type SqlRow = Record<string, unknown>;
type ExecSqlResponse = { data: unknown; error: unknown };
interface RpcCapableClient {
    rpc: (fn: string, args?: unknown) => Promise<ExecSqlResponse>;
}

function getSupabase(): RpcCapableClient | null {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) return null;
    return createClient(url, key) as unknown as RpcCapableClient;
}

async function queryRows(supabase: RpcCapableClient, sql: string): Promise<SqlRow[] | null> {
    // Try using supabase.rpc or a raw fetch to the PostgREST RPC endpoint
    // If exec_sql doesn't exist, we fall back to direct pg fetch
    const { data, error } = await supabase.rpc('exec_sql', { query: sql });
    if (!error && Array.isArray(data)) {
        return data.filter((row): row is SqlRow => typeof row === 'object' && row !== null);
    }

    // Fallback: use the Supabase Management API or direct postgres connection
    // For now, return null so the frontend shows "unavailable"
    return null;
}

export async function GET() {
    const supabase = getSupabase();
    if (!supabase) {
        return NextResponse.json({ error: 'Database not configured' }, { status: 503 });
    }

    const results: Record<string, unknown> = {};

    // 1. Version & Citus version
    const versionResult = await queryRows(supabase, 'SELECT version()');
    results.version = versionResult?.[0]?.version ?? versionResult;

    const citusResult = await queryRows(supabase, "SELECT extversion FROM pg_extension WHERE extname = 'citus'");
    results.citusVersion = citusResult?.[0]?.extversion ?? null;

    // 2. Database size
    const dbSizeResult = await queryRows(supabase, 'SELECT pg_size_pretty(pg_database_size(current_database())) as size');
    results.databaseSize = dbSizeResult?.[0]?.size ?? null;

    // 3. Active connections
    const connResult = await queryRows(supabase, `
        SELECT count(*) as total,
               count(*) FILTER (WHERE state = 'active') as active,
               count(*) FILTER (WHERE state = 'idle') as idle
        FROM pg_stat_activity
        WHERE datname = current_database()
    `);
    results.connections = connResult?.[0] ?? null;

    // 4. Max connections
    const maxConnResult = await queryRows(supabase, "SHOW max_connections");
    results.maxConnections = maxConnResult?.[0]?.max_connections ?? null;

    // 5. Table stats (sizes, row estimates, index sizes)
    const tableResult = await queryRows(supabase, `
        SELECT
            schemaname,
            relname as table_name,
            n_live_tup as row_estimate,
            pg_size_pretty(pg_total_relation_size(schemaname || '.' || relname)) as total_size,
            pg_size_pretty(pg_relation_size(schemaname || '.' || relname)) as data_size,
            pg_size_pretty(pg_indexes_size(schemaname || '.' || relname)) as index_size,
            n_tup_ins as inserts,
            n_tup_upd as updates,
            n_tup_del as deletes,
            last_vacuum,
            last_autovacuum,
            last_analyze,
            last_autoanalyze
        FROM pg_stat_user_tables
        ORDER BY pg_total_relation_size(schemaname || '.' || relname) DESC
        LIMIT 50
    `);
    results.tables = tableResult ?? [];

    // 6. Citus distributed tables (if Citus is installed)
    if (results.citusVersion) {
        const distResult = await queryRows(supabase, `
            SELECT
                logicalrelid::text as table_name,
                partmethod as partition_method,
                colocationid as colocation_id,
                repmodel as replication_model
            FROM pg_dist_partition
            ORDER BY logicalrelid::text
        `);
        results.distributedTables = distResult ?? [];

        // Citus worker nodes
        const workerResult = await queryRows(supabase, `
            SELECT nodename, nodeport, noderole, isactive
            FROM pg_dist_node
            ORDER BY nodename
        `);
        results.citusNodes = workerResult ?? [];

        // Shard count per table
        const shardResult = await queryRows(supabase, `
            SELECT logicalrelid::text as table_name, count(*) as shard_count
            FROM pg_dist_shard
            GROUP BY logicalrelid
            ORDER BY logicalrelid::text
        `);
        results.shardCounts = shardResult ?? [];
    }

    // 7. Slow queries (top 10 by mean time, if pg_stat_statements is enabled)
    const slowResult = await queryRows(supabase, `
        SELECT
            substring(query for 120) as query,
            calls,
            round(mean_exec_time::numeric, 2) as avg_time_ms,
            round(total_exec_time::numeric, 2) as total_time_ms,
            rows
        FROM pg_stat_statements
        WHERE userid = (SELECT usesysid FROM pg_user WHERE usename = current_user)
        ORDER BY mean_exec_time DESC
        LIMIT 10
    `);
    results.slowQueries = slowResult ?? [];

    // 8. Index usage stats
    const indexResult = await queryRows(supabase, `
        SELECT
            schemaname,
            relname as table_name,
            indexrelname as index_name,
            idx_scan as scans,
            pg_size_pretty(pg_relation_size(indexrelid)) as size
        FROM pg_stat_user_indexes
        ORDER BY idx_scan DESC
        LIMIT 30
    `);
    results.indexes = indexResult ?? [];

    // 9. Replication / lag (useful for Citus or read replicas)
    const replResult = await queryRows(supabase, `
        SELECT
            client_addr,
            state,
            sent_lsn,
            write_lsn,
            flush_lsn,
            replay_lsn,
            pg_wal_lsn_diff(sent_lsn, replay_lsn) as replay_lag_bytes
        FROM pg_stat_replication
    `);
    results.replication = replResult ?? [];

    // 10. Cache hit ratio
    const cacheResult = await queryRows(supabase, `
        SELECT
            sum(heap_blks_hit) / NULLIF(sum(heap_blks_hit) + sum(heap_blks_read), 0) * 100 as cache_hit_ratio
        FROM pg_statio_user_tables
    `);
    results.cacheHitRatio = cacheResult?.[0]?.cache_hit_ratio ?? null;

    return NextResponse.json({ success: true, ...results });
}
