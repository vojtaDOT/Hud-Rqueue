'use client';

import * as React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
    Database,
    HardDrive,
    Activity,
    RefreshCw,
    Loader2,
    XCircle,
    Server,
    Gauge,
    Network,
    Zap,
    Layers,
    Search,
} from 'lucide-react';

interface TableInfo {
    schemaname: string;
    table_name: string;
    row_estimate: number;
    total_size: string;
    data_size: string;
    index_size: string;
    inserts: number;
    updates: number;
    deletes: number;
    last_vacuum: string | null;
    last_autovacuum: string | null;
    last_analyze: string | null;
    last_autoanalyze: string | null;
}

interface CitusNode {
    nodename: string;
    nodeport: number;
    noderole: string;
    isactive: boolean;
}

interface DistributedTable {
    table_name: string;
    partition_method: string;
    colocation_id: number;
    replication_model: string;
}

interface ShardCount {
    table_name: string;
    shard_count: number;
}

interface SlowQuery {
    query: string;
    calls: number;
    avg_time_ms: number;
    total_time_ms: number;
    rows: number;
}

interface IndexInfo {
    schemaname: string;
    table_name: string;
    index_name: string;
    scans: number;
    size: string;
}

interface ReplicationInfo {
    client_addr: string;
    state: string;
    sent_lsn: string;
    replay_lsn: string;
    replay_lag_bytes: number;
}

interface DbStats {
    success: boolean;
    version: string | null;
    citusVersion: string | null;
    databaseSize: string | null;
    connections: { total: number; active: number; idle: number } | null;
    maxConnections: string | null;
    tables: TableInfo[];
    distributedTables: DistributedTable[];
    citusNodes: CitusNode[];
    shardCounts: ShardCount[];
    slowQueries: SlowQuery[];
    indexes: IndexInfo[];
    replication: ReplicationInfo[];
    cacheHitRatio: number | null;
}

export function DashboardDatabase() {
    const [data, setData] = React.useState<DbStats | null>(null);
    const [loading, setLoading] = React.useState(true);
    const [error, setError] = React.useState<string | null>(null);

    const fetchData = React.useCallback(async () => {
        try {
            setLoading(true);
            setError(null);
            const res = await fetch('/api/db/stats');
            if (!res.ok) throw new Error('Failed to fetch DB stats');
            const json = await res.json();
            setData(json);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Unknown error');
        } finally {
            setLoading(false);
        }
    }, []);

    React.useEffect(() => {
        fetchData();
    }, [fetchData]);

    if (error) {
        return (
            <div className="w-full max-w-6xl mx-auto">
                <Card>
                    <CardContent className="flex flex-col items-center justify-center py-12 space-y-4">
                        <XCircle className="h-12 w-12 text-red-500" />
                        <p className="text-lg text-muted-foreground">{error}</p>
                        <p className="text-sm text-muted-foreground">
                            Ensure the <code className="bg-muted px-1 rounded">exec_sql</code> RPC function exists in your Supabase project, or connect directly via Postgres.
                        </p>
                        <Button onClick={fetchData} variant="outline">
                            <RefreshCw className="mr-2 h-4 w-4" />
                            Retry
                        </Button>
                    </CardContent>
                </Card>
            </div>
        );
    }

    return (
        <div className="w-full max-w-6xl mx-auto space-y-6">
            {/* Header */}
            <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight">PostgreSQL / Citus</h1>
                    <p className="text-muted-foreground text-sm mt-1">
                        Distributed database overview
                    </p>
                </div>
                <Button onClick={fetchData} variant="outline" size="sm" disabled={loading}>
                    <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                    Refresh
                </Button>
            </div>

            {loading && !data ? (
                <div className="flex items-center justify-center py-16">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
            ) : data ? (
                <>
                    {/* ─── Top metric cards ─── */}
                    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                        <Card>
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-sm font-medium">DB Size</CardTitle>
                                <HardDrive className="h-4 w-4 text-muted-foreground" />
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold">{data.databaseSize ?? '—'}</div>
                                <p className="text-xs text-muted-foreground">Total on disk</p>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-sm font-medium">Connections</CardTitle>
                                <Activity className="h-4 w-4 text-muted-foreground" />
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold tabular-nums">
                                    {data.connections ? `${data.connections.active} / ${data.maxConnections ?? '?'}` : '—'}
                                </div>
                                <p className="text-xs text-muted-foreground">
                                    {data.connections ? `${data.connections.idle} idle, ${data.connections.total} total` : 'Active / Max'}
                                </p>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-sm font-medium">Cache Hit</CardTitle>
                                <Gauge className="h-4 w-4 text-muted-foreground" />
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold tabular-nums">
                                    {data.cacheHitRatio != null ? `${Number(data.cacheHitRatio).toFixed(1)}%` : '—'}
                                </div>
                                <p className="text-xs text-muted-foreground">Buffer cache hit ratio</p>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-sm font-medium">Citus</CardTitle>
                                <Network className="h-4 w-4 text-muted-foreground" />
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold">
                                    {data.citusVersion ? `v${data.citusVersion}` : 'N/A'}
                                </div>
                                <p className="text-xs text-muted-foreground">
                                    {data.citusNodes?.length
                                        ? `${data.citusNodes.length} node${data.citusNodes.length > 1 ? 's' : ''}`
                                        : 'Extension version'}
                                </p>
                            </CardContent>
                        </Card>
                    </div>

                    {/* ─── Version info ─── */}
                    {data.version && (
                        <p className="text-xs text-muted-foreground font-mono break-all">
                            {data.version}
                        </p>
                    )}

                    {/* ─── Citus nodes ─── */}
                    {data.citusNodes && data.citusNodes.length > 0 && (
                        <Card>
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2">
                                    <Server className="h-4 w-4" />
                                    Citus Nodes
                                </CardTitle>
                                <CardDescription>Worker and coordinator nodes in the cluster</CardDescription>
                            </CardHeader>
                            <CardContent className="p-0">
                                <div className="overflow-x-auto">
                                    <table className="w-full text-sm">
                                        <thead className="border-b bg-muted/40">
                                            <tr>
                                                <th className="text-left font-medium p-3">Host</th>
                                                <th className="text-left font-medium p-3">Port</th>
                                                <th className="text-left font-medium p-3">Role</th>
                                                <th className="text-left font-medium p-3">Active</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {data.citusNodes.map((n, i) => (
                                                <tr key={i} className="border-b border-border/50 hover:bg-muted/30">
                                                    <td className="p-3 font-mono text-xs">{n.nodename}</td>
                                                    <td className="p-3 tabular-nums">{n.nodeport}</td>
                                                    <td className="p-3 capitalize">{n.noderole === 'primary' ? 'coordinator' : n.noderole}</td>
                                                    <td className="p-3">
                                                        <span className={`inline-flex items-center gap-1.5 ${n.isactive ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                                                            <span className={`h-1.5 w-1.5 rounded-full ${n.isactive ? 'bg-green-500' : 'bg-red-500'}`} />
                                                            {n.isactive ? 'Yes' : 'No'}
                                                        </span>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </CardContent>
                        </Card>
                    )}

                    {/* ─── Distributed tables + shards ─── */}
                    {data.distributedTables && data.distributedTables.length > 0 && (
                        <Card>
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2">
                                    <Layers className="h-4 w-4" />
                                    Distributed Tables
                                </CardTitle>
                                <CardDescription>Tables managed by Citus across the cluster</CardDescription>
                            </CardHeader>
                            <CardContent className="p-0">
                                <div className="overflow-x-auto">
                                    <table className="w-full text-sm">
                                        <thead className="border-b bg-muted/40">
                                            <tr>
                                                <th className="text-left font-medium p-3">Table</th>
                                                <th className="text-left font-medium p-3">Partition</th>
                                                <th className="text-left font-medium p-3">Colocation</th>
                                                <th className="text-left font-medium p-3">Shards</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {data.distributedTables.map((t, i) => {
                                                const sc = data.shardCounts?.find((s) => s.table_name === t.table_name);
                                                return (
                                                    <tr key={i} className="border-b border-border/50 hover:bg-muted/30">
                                                        <td className="p-3 font-mono text-xs">{t.table_name}</td>
                                                        <td className="p-3">{t.partition_method === 'h' ? 'Hash' : t.partition_method === 'a' ? 'Append' : t.partition_method}</td>
                                                        <td className="p-3 tabular-nums">{t.colocation_id}</td>
                                                        <td className="p-3 tabular-nums">{sc?.shard_count ?? '—'}</td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            </CardContent>
                        </Card>
                    )}

                    {/* ─── Table sizes ─── */}
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <Database className="h-4 w-4" />
                                Tables
                            </CardTitle>
                            <CardDescription>Sizes, row estimates, and maintenance info (top 50 by size)</CardDescription>
                        </CardHeader>
                        <CardContent className="p-0">
                            <div className="overflow-x-auto max-h-[50vh] overflow-y-auto">
                                <table className="w-full text-sm">
                                    <thead className="sticky top-0 bg-muted/80 backdrop-blur border-b">
                                        <tr>
                                            <th className="text-left font-medium p-3">Table</th>
                                            <th className="text-right font-medium p-3">Rows (est)</th>
                                            <th className="text-right font-medium p-3">Total</th>
                                            <th className="text-right font-medium p-3">Data</th>
                                            <th className="text-right font-medium p-3">Indexes</th>
                                            <th className="text-right font-medium p-3">INS</th>
                                            <th className="text-right font-medium p-3">UPD</th>
                                            <th className="text-right font-medium p-3">DEL</th>
                                            <th className="text-left font-medium p-3">Last Vacuum</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {(!data.tables || data.tables.length === 0) ? (
                                            <tr>
                                                <td colSpan={9} className="p-6 text-center text-muted-foreground">
                                                    No table data available
                                                </td>
                                            </tr>
                                        ) : (
                                            data.tables.map((t, i) => (
                                                <tr key={i} className="border-b border-border/50 hover:bg-muted/30">
                                                    <td className="p-3 font-mono text-xs">
                                                        {t.schemaname !== 'public' ? `${t.schemaname}.` : ''}{t.table_name}
                                                    </td>
                                                    <td className="p-3 text-right tabular-nums">{Number(t.row_estimate).toLocaleString()}</td>
                                                    <td className="p-3 text-right">{t.total_size}</td>
                                                    <td className="p-3 text-right">{t.data_size}</td>
                                                    <td className="p-3 text-right">{t.index_size}</td>
                                                    <td className="p-3 text-right tabular-nums">{Number(t.inserts).toLocaleString()}</td>
                                                    <td className="p-3 text-right tabular-nums">{Number(t.updates).toLocaleString()}</td>
                                                    <td className="p-3 text-right tabular-nums">{Number(t.deletes).toLocaleString()}</td>
                                                    <td className="p-3 text-muted-foreground text-xs">
                                                        {t.last_autovacuum
                                                            ? new Date(t.last_autovacuum).toLocaleString()
                                                            : t.last_vacuum
                                                                ? new Date(t.last_vacuum).toLocaleString()
                                                                : '—'}
                                                    </td>
                                                </tr>
                                            ))
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </CardContent>
                    </Card>

                    {/* ─── Slow queries ─── */}
                    {data.slowQueries && data.slowQueries.length > 0 && (
                        <Card>
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2">
                                    <Zap className="h-4 w-4" />
                                    Slow Queries
                                </CardTitle>
                                <CardDescription>Top 10 by average execution time (pg_stat_statements)</CardDescription>
                            </CardHeader>
                            <CardContent className="p-0">
                                <div className="overflow-x-auto max-h-[40vh] overflow-y-auto">
                                    <table className="w-full text-sm">
                                        <thead className="sticky top-0 bg-muted/80 backdrop-blur border-b">
                                            <tr>
                                                <th className="text-left font-medium p-3">Query</th>
                                                <th className="text-right font-medium p-3">Calls</th>
                                                <th className="text-right font-medium p-3">Avg (ms)</th>
                                                <th className="text-right font-medium p-3">Total (ms)</th>
                                                <th className="text-right font-medium p-3">Rows</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {data.slowQueries.map((q, i) => (
                                                <tr key={i} className="border-b border-border/50 hover:bg-muted/30">
                                                    <td className="p-3 font-mono text-xs max-w-[400px] truncate" title={q.query}>
                                                        {q.query}
                                                    </td>
                                                    <td className="p-3 text-right tabular-nums">{Number(q.calls).toLocaleString()}</td>
                                                    <td className="p-3 text-right tabular-nums">{q.avg_time_ms}</td>
                                                    <td className="p-3 text-right tabular-nums">{Number(q.total_time_ms).toLocaleString()}</td>
                                                    <td className="p-3 text-right tabular-nums">{Number(q.rows).toLocaleString()}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </CardContent>
                        </Card>
                    )}

                    {/* ─── Index usage ─── */}
                    {data.indexes && data.indexes.length > 0 && (
                        <Card>
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2">
                                    <Search className="h-4 w-4" />
                                    Index Usage
                                </CardTitle>
                                <CardDescription>Top indexes by scan count</CardDescription>
                            </CardHeader>
                            <CardContent className="p-0">
                                <div className="overflow-x-auto max-h-[40vh] overflow-y-auto">
                                    <table className="w-full text-sm">
                                        <thead className="sticky top-0 bg-muted/80 backdrop-blur border-b">
                                            <tr>
                                                <th className="text-left font-medium p-3">Table</th>
                                                <th className="text-left font-medium p-3">Index</th>
                                                <th className="text-right font-medium p-3">Scans</th>
                                                <th className="text-right font-medium p-3">Size</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {data.indexes.map((idx, i) => (
                                                <tr key={i} className="border-b border-border/50 hover:bg-muted/30">
                                                    <td className="p-3 font-mono text-xs">{idx.table_name}</td>
                                                    <td className="p-3 font-mono text-xs">{idx.index_name}</td>
                                                    <td className="p-3 text-right tabular-nums">{Number(idx.scans).toLocaleString()}</td>
                                                    <td className="p-3 text-right">{idx.size}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </CardContent>
                        </Card>
                    )}

                    {/* ─── Replication ─── */}
                    {data.replication && data.replication.length > 0 && (
                        <Card>
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2">
                                    <Network className="h-4 w-4" />
                                    Replication
                                </CardTitle>
                                <CardDescription>WAL replication status and lag</CardDescription>
                            </CardHeader>
                            <CardContent className="p-0">
                                <div className="overflow-x-auto">
                                    <table className="w-full text-sm">
                                        <thead className="border-b bg-muted/40">
                                            <tr>
                                                <th className="text-left font-medium p-3">Client</th>
                                                <th className="text-left font-medium p-3">State</th>
                                                <th className="text-left font-medium p-3">Sent LSN</th>
                                                <th className="text-left font-medium p-3">Replay LSN</th>
                                                <th className="text-right font-medium p-3">Lag (bytes)</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {data.replication.map((r, i) => (
                                                <tr key={i} className="border-b border-border/50 hover:bg-muted/30">
                                                    <td className="p-3 font-mono text-xs">{r.client_addr}</td>
                                                    <td className="p-3 capitalize">{r.state}</td>
                                                    <td className="p-3 font-mono text-xs">{r.sent_lsn}</td>
                                                    <td className="p-3 font-mono text-xs">{r.replay_lsn}</td>
                                                    <td className="p-3 text-right tabular-nums">{Number(r.replay_lag_bytes).toLocaleString()}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </CardContent>
                        </Card>
                    )}
                </>
            ) : null}
        </div>
    );
}
