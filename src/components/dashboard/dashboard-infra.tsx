'use client';

import * as React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
    Activity,
    AlertTriangle,
    HardDrive,
    Loader2,
    RefreshCw,
    Server,
    XCircle,
} from 'lucide-react';

interface InfraMetricsResponse {
    success: boolean;
    timestamp: string;
    source: {
        portainerBaseUrl: string;
        endpointId: number;
        localProbesEnabled: boolean;
    };
    summary: {
        containersTotal: number;
        containersRunning: number;
        containersStopped: number;
        unhealthyCount: number;
    };
    server: {
        portainerHost: {
            cpuCores: number | null;
            memTotalBytes: number | null;
            dockerRootDir: string | null;
            os: string | null;
            kernel: string | null;
        } | null;
        localProbe: {
            hostname: string;
            uptimeSec: number;
            loadAvg1m: number;
            cpuCores: number;
            memTotalBytes: number;
            memFreeBytes: number;
            memUsedBytes: number;
            memUsedPercent: number;
            diskTotalBytes: number | null;
            diskFreeBytes: number | null;
            diskUsedBytes: number | null;
            diskUsedPercent: number | null;
            note: string;
        } | null;
    };
    containers: Array<{
        id: string;
        name: string;
        image: string;
        state: string;
        status: string;
        health: 'healthy' | 'unhealthy' | 'starting' | 'unknown';
        createdAt: string | null;
        ports: string[];
        metrics: {
            cpuPercent: number | null;
            memUsageBytes: number | null;
            memLimitBytes: number | null;
            memPercent: number | null;
            cacheBytes: number | null;
            netRxBytes: number | null;
            netTxBytes: number | null;
            blockReadBytes: number | null;
            blockWriteBytes: number | null;
            pidsCurrent: number | null;
        };
    }>;
    warnings: string[];
}

type ErrorMessage = {
    success: false;
    error?: string;
    timestamp?: string;
};

type SortKey = 'name' | 'state' | 'health' | 'cpu' | 'memory' | 'cache' | 'network';
type SortDirection = 'asc' | 'desc';

const STREAM_URL = '/api/infra/stream';
const POLL_INTERVAL_MS = 30000;

function formatBytes(bytes: number | null): string {
    if (bytes == null || !Number.isFinite(bytes)) return '—';
    if (bytes === 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let value = bytes;
    let unit = 0;
    while (value >= 1024 && unit < units.length - 1) {
        value /= 1024;
        unit += 1;
    }
    return `${value.toFixed(value >= 10 || unit === 0 ? 0 : 1)} ${units[unit]}`;
}

function formatPercent(value: number | null): string {
    if (value == null || !Number.isFinite(value)) return '—';
    return `${value.toFixed(1)}%`;
}

function formatDate(value: string | null): string {
    if (!value) return '—';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return '—';
    return parsed.toLocaleString();
}

function formatUptime(seconds: number | null): string {
    if (seconds == null || !Number.isFinite(seconds)) return '—';
    if (seconds < 60) return `${Math.floor(seconds)}s`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
    return `${Math.floor(seconds / 86400)}d`;
}

function healthClass(health: InfraMetricsResponse['containers'][number]['health']): string {
    switch (health) {
        case 'healthy':
            return 'text-emerald-600 dark:text-emerald-400';
        case 'unhealthy':
            return 'text-rose-600 dark:text-rose-400';
        case 'starting':
            return 'text-amber-600 dark:text-amber-400';
        default:
            return 'text-muted-foreground';
    }
}

function statusClass(state: string): string {
    if (state === 'running') return 'text-emerald-600 dark:text-emerald-400';
    if (state === 'paused') return 'text-amber-600 dark:text-amber-400';
    if (state === 'exited' || state === 'dead') return 'text-rose-600 dark:text-rose-400';
    return 'text-muted-foreground';
}

export function DashboardInfra() {
    const [data, setData] = React.useState<InfraMetricsResponse | null>(null);
    const [loading, setLoading] = React.useState(true);
    const [error, setError] = React.useState<string | null>(null);
    const [live, setLive] = React.useState(false);
    const [lastUpdated, setLastUpdated] = React.useState<Date | null>(null);
    const [sortKey, setSortKey] = React.useState<SortKey>('cpu');
    const [sortDirection, setSortDirection] = React.useState<SortDirection>('desc');

    const fetchMetrics = React.useCallback(async () => {
        try {
            setLoading(true);
            const response = await fetch('/api/infra/metrics', { cache: 'no-store' });
            const json = await response.json();
            if (!response.ok || !json.success) {
                throw new Error(json.error || 'Failed to load infrastructure metrics');
            }
            setData(json);
            setError(null);
            setLastUpdated(new Date());
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to load infrastructure metrics');
        } finally {
            setLoading(false);
        }
    }, []);

    React.useEffect(() => {
        let eventSource: EventSource | null = null;
        let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
        let pollInterval: ReturnType<typeof setInterval> | null = null;

        const connect = () => {
            if (typeof EventSource === 'undefined') return;

            eventSource = new EventSource(new URL(STREAM_URL, window.location.origin).toString());
            setLive(true);

            eventSource.onmessage = (event) => {
                try {
                    const parsed = JSON.parse(event.data) as InfraMetricsResponse | ErrorMessage;
                    if ('success' in parsed && parsed.success) {
                        setData(parsed);
                        setError(null);
                        setLoading(false);
                        setLastUpdated(new Date());
                        return;
                    }
                    if ('error' in parsed && parsed.error) {
                        setError(parsed.error);
                    }
                } catch {
                    // ignore malformed event payload
                }
            };

            eventSource.onerror = () => {
                eventSource?.close();
                eventSource = null;
                setLive(false);
                reconnectTimeout = setTimeout(connect, 3000);
            };
        };

        void fetchMetrics();
        connect();
        pollInterval = setInterval(() => {
            setLive((isLive) => {
                if (!isLive) {
                    void fetchMetrics();
                }
                return isLive;
            });
        }, POLL_INTERVAL_MS);

        return () => {
            if (reconnectTimeout) clearTimeout(reconnectTimeout);
            if (pollInterval) clearInterval(pollInterval);
            eventSource?.close();
        };
    }, [fetchMetrics]);

    const onSort = React.useCallback((nextKey: SortKey) => {
        setSortKey((currentKey) => {
            if (currentKey === nextKey) {
                setSortDirection((currentDirection) => (currentDirection === 'asc' ? 'desc' : 'asc'));
                return currentKey;
            }
            setSortDirection('desc');
            return nextKey;
        });
    }, []);

    const sortedContainers = React.useMemo(() => {
        if (!data) return [];
        const sorted = [...data.containers];
        sorted.sort((a, b) => {
            const multiplier = sortDirection === 'asc' ? 1 : -1;
            const numeric = (left: number | null, right: number | null) => {
                const aValue = left ?? Number.NEGATIVE_INFINITY;
                const bValue = right ?? Number.NEGATIVE_INFINITY;
                if (aValue === bValue) return 0;
                return aValue > bValue ? 1 * multiplier : -1 * multiplier;
            };

            switch (sortKey) {
                case 'name':
                    return a.name.localeCompare(b.name) * multiplier;
                case 'state':
                    return a.state.localeCompare(b.state) * multiplier;
                case 'health':
                    return a.health.localeCompare(b.health) * multiplier;
                case 'cpu':
                    return numeric(a.metrics.cpuPercent, b.metrics.cpuPercent);
                case 'memory':
                    return numeric(a.metrics.memPercent, b.metrics.memPercent);
                case 'cache':
                    return numeric(a.metrics.cacheBytes, b.metrics.cacheBytes);
                case 'network': {
                    const left = (a.metrics.netRxBytes ?? 0) + (a.metrics.netTxBytes ?? 0);
                    const right = (b.metrics.netRxBytes ?? 0) + (b.metrics.netTxBytes ?? 0);
                    return numeric(left, right);
                }
                default:
                    return 0;
            }
        });
        return sorted;
    }, [data, sortDirection, sortKey]);

    if (error && !data) {
        return (
            <Card className="w-full max-w-6xl mx-auto">
                <CardContent className="flex flex-col items-center justify-center py-12 space-y-4">
                    <XCircle className="h-12 w-12 text-red-500" />
                    <p className="text-lg text-muted-foreground">{error}</p>
                    <Button onClick={fetchMetrics} variant="outline">
                        <RefreshCw className="mr-2 h-4 w-4" />
                        Retry
                    </Button>
                </CardContent>
            </Card>
        );
    }

    const memoryText = data?.server.localProbe
        ? `${formatBytes(data.server.localProbe.memUsedBytes)} / ${formatBytes(data.server.localProbe.memTotalBytes)}`
        : '—';
    const diskText = data?.server.localProbe?.diskUsedBytes != null
        ? `${formatBytes(data.server.localProbe.diskUsedBytes)} / ${formatBytes(data.server.localProbe.diskTotalBytes)}`
        : '—';

    return (
        <div className="w-full max-w-6xl mx-auto space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="space-y-1">
                    <h1 className="text-2xl font-bold tracking-tight">Infrastructure</h1>
                    <p className="text-sm text-muted-foreground">
                        Portainer containers + VPS resource snapshot
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    {live && (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                            <span className="relative flex h-2 w-2">
                                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
                            </span>
                            Live
                        </span>
                    )}
                    {lastUpdated && (
                        <span className="text-xs text-muted-foreground">
                            Updated {lastUpdated.toLocaleTimeString()}
                        </span>
                    )}
                    <Button onClick={fetchMetrics} variant="outline" size="sm" disabled={loading}>
                        <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                        Refresh
                    </Button>
                </div>
            </div>

            {data?.warnings.length ? (
                <Card className="border-yellow-500/40">
                    <CardHeader className="pb-3">
                        <CardTitle className="text-sm flex items-center gap-2">
                            <AlertTriangle className="h-4 w-4 text-yellow-500" />
                            Runtime Warnings
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="pt-0">
                        <ul className="space-y-1 text-xs text-muted-foreground">
                            {data.warnings.map((warning, idx) => (
                                <li key={`${warning}-${idx}`}>{warning}</li>
                            ))}
                        </ul>
                    </CardContent>
                </Card>
            ) : null}

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Running Containers</CardTitle>
                        <Server className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold tabular-nums">
                            {data ? `${data.summary.containersRunning}/${data.summary.containersTotal}` : '—'}
                        </div>
                        <p className="text-xs text-muted-foreground">Running / total</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Unhealthy</CardTitle>
                        <AlertTriangle className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold tabular-nums">
                            {data ? data.summary.unhealthyCount : '—'}
                        </div>
                        <p className="text-xs text-muted-foreground">Containers with unhealthy status</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Server Memory</CardTitle>
                        <Activity className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold tabular-nums">
                            {data ? formatPercent(data.server.localProbe?.memUsedPercent ?? null) : '—'}
                        </div>
                        <p className="text-xs text-muted-foreground">{memoryText}</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Server Disk</CardTitle>
                        <HardDrive className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold tabular-nums">
                            {data ? formatPercent(data.server.localProbe?.diskUsedPercent ?? null) : '—'}
                        </div>
                        <p className="text-xs text-muted-foreground">{diskText}</p>
                    </CardContent>
                </Card>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
                <Card>
                    <CardHeader>
                        <CardTitle>Server resources (Portainer)</CardTitle>
                        <CardDescription>Host snapshot from Docker info on selected Portainer endpoint</CardDescription>
                    </CardHeader>
                    <CardContent className="text-sm space-y-2">
                        <div className="flex justify-between gap-3">
                            <span className="text-muted-foreground">Endpoint</span>
                            <span className="font-mono">#{data?.source.endpointId ?? '—'}</span>
                        </div>
                        <div className="flex justify-between gap-3">
                            <span className="text-muted-foreground">CPU Cores</span>
                            <span>{data?.server.portainerHost?.cpuCores ?? '—'}</span>
                        </div>
                        <div className="flex justify-between gap-3">
                            <span className="text-muted-foreground">Memory Total</span>
                            <span>{formatBytes(data?.server.portainerHost?.memTotalBytes ?? null)}</span>
                        </div>
                        <div className="flex justify-between gap-3">
                            <span className="text-muted-foreground">OS</span>
                            <span>{data?.server.portainerHost?.os ?? '—'}</span>
                        </div>
                        <div className="flex justify-between gap-3">
                            <span className="text-muted-foreground">Kernel</span>
                            <span>{data?.server.portainerHost?.kernel ?? '—'}</span>
                        </div>
                        <div className="flex justify-between gap-3">
                            <span className="text-muted-foreground">Docker Root Dir</span>
                            <span className="font-mono text-xs break-all text-right">
                                {data?.server.portainerHost?.dockerRootDir ?? '—'}
                            </span>
                        </div>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader>
                        <CardTitle>Server resources (Local probe)</CardTitle>
                        <CardDescription>Node-level snapshot from HUD runtime host</CardDescription>
                    </CardHeader>
                    <CardContent className="text-sm space-y-2">
                        <div className="flex justify-between gap-3">
                            <span className="text-muted-foreground">Hostname</span>
                            <span>{data?.server.localProbe?.hostname ?? '—'}</span>
                        </div>
                        <div className="flex justify-between gap-3">
                            <span className="text-muted-foreground">CPU Cores</span>
                            <span>{data?.server.localProbe?.cpuCores ?? '—'}</span>
                        </div>
                        <div className="flex justify-between gap-3">
                            <span className="text-muted-foreground">Load (1m)</span>
                            <span>{data?.server.localProbe?.loadAvg1m ?? '—'}</span>
                        </div>
                        <div className="flex justify-between gap-3">
                            <span className="text-muted-foreground">Uptime</span>
                            <span>{formatUptime(data?.server.localProbe?.uptimeSec ?? null)}</span>
                        </div>
                        <div className="flex justify-between gap-3">
                            <span className="text-muted-foreground">Memory Used</span>
                            <span>
                                {formatBytes(data?.server.localProbe?.memUsedBytes ?? null)}
                                {' / '}
                                {formatBytes(data?.server.localProbe?.memTotalBytes ?? null)}
                            </span>
                        </div>
                        <div className="flex justify-between gap-3">
                            <span className="text-muted-foreground">Disk Used</span>
                            <span>
                                {formatBytes(data?.server.localProbe?.diskUsedBytes ?? null)}
                                {' / '}
                                {formatBytes(data?.server.localProbe?.diskTotalBytes ?? null)}
                            </span>
                        </div>
                        <p className="text-xs text-muted-foreground pt-2 border-t border-border/60">
                            {data?.server.localProbe?.note ?? 'Local probe disabled.'}
                        </p>
                    </CardContent>
                </Card>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Containers</CardTitle>
                    <CardDescription>
                        Runtime stats from Portainer (CPU, memory, cache, network, health)
                    </CardDescription>
                </CardHeader>
                <CardContent className="p-0">
                    {loading && !data ? (
                        <div className="flex items-center justify-center py-12">
                            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                        </div>
                    ) : (
                        <div className="overflow-x-auto max-h-[70vh] overflow-y-auto">
                            <table className="w-full text-sm">
                                <thead className="sticky top-0 bg-muted/80 backdrop-blur border-b">
                                    <tr>
                                        <th className="text-left font-medium p-3">
                                            <button className="hover:underline" onClick={() => onSort('name')}>Container</button>
                                        </th>
                                        <th className="text-left font-medium p-3">Image</th>
                                        <th className="text-left font-medium p-3">
                                            <button className="hover:underline" onClick={() => onSort('state')}>State</button>
                                        </th>
                                        <th className="text-left font-medium p-3">
                                            <button className="hover:underline" onClick={() => onSort('health')}>Health</button>
                                        </th>
                                        <th className="text-right font-medium p-3">
                                            <button className="hover:underline" onClick={() => onSort('cpu')}>CPU</button>
                                        </th>
                                        <th className="text-right font-medium p-3">
                                            <button className="hover:underline" onClick={() => onSort('memory')}>RAM</button>
                                        </th>
                                        <th className="text-right font-medium p-3">
                                            <button className="hover:underline" onClick={() => onSort('cache')}>Cache</button>
                                        </th>
                                        <th className="text-right font-medium p-3">
                                            <button className="hover:underline" onClick={() => onSort('network')}>Network</button>
                                        </th>
                                        <th className="text-left font-medium p-3">Created</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {sortedContainers.length === 0 ? (
                                        <tr>
                                            <td colSpan={9} className="text-center p-6 text-muted-foreground">
                                                No containers found on configured Portainer endpoint.
                                            </td>
                                        </tr>
                                    ) : (
                                        sortedContainers.map((container) => (
                                            <tr key={container.id} className="border-b border-border/50 hover:bg-muted/30">
                                                <td className="p-3">
                                                    <div className="font-medium">{container.name}</div>
                                                    <div className="text-xs text-muted-foreground font-mono">
                                                        {container.id.slice(0, 12)}
                                                    </div>
                                                </td>
                                                <td className="p-3 max-w-[220px]">
                                                    <div className="truncate" title={container.image}>{container.image}</div>
                                                    <div className="text-xs text-muted-foreground truncate" title={container.ports.join(', ')}>
                                                        {container.ports.length > 0 ? container.ports.join(', ') : 'No exposed ports'}
                                                    </div>
                                                </td>
                                                <td className={`p-3 capitalize ${statusClass(container.state)}`}>
                                                    {container.state}
                                                </td>
                                                <td className={`p-3 capitalize ${healthClass(container.health)}`}>
                                                    {container.health}
                                                </td>
                                                <td className="p-3 text-right tabular-nums">{formatPercent(container.metrics.cpuPercent)}</td>
                                                <td className="p-3 text-right tabular-nums">
                                                    <div>{formatBytes(container.metrics.memUsageBytes)}</div>
                                                    <div className="text-xs text-muted-foreground">
                                                        {formatPercent(container.metrics.memPercent)}
                                                    </div>
                                                </td>
                                                <td className="p-3 text-right tabular-nums">{formatBytes(container.metrics.cacheBytes)}</td>
                                                <td className="p-3 text-right tabular-nums">
                                                    <div>RX {formatBytes(container.metrics.netRxBytes)}</div>
                                                    <div className="text-xs text-muted-foreground">
                                                        TX {formatBytes(container.metrics.netTxBytes)}
                                                    </div>
                                                </td>
                                                <td className="p-3 text-muted-foreground">{formatDate(container.createdAt)}</td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
