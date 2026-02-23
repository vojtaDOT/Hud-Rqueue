'use client';

import * as React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { RefreshCw, XCircle, Loader2, Trash2 } from 'lucide-react';

interface WorkerStats {
    total: number;
    pending: number;
    processing: number;
    completed: number;
    failed: number;
    avgCompletionTimeMs: number | null;
}

interface Stats {
    total: number;
    pending: number;
    processing: number;
    completed: number;
    failed: number;
    avgCompletionTimeMs: number | null;
    byWorker: { [key: string]: WorkerStats };
}

interface JobListItem {
    id: string;
    task: string;
    status: string;
    created_at: string;
    started_at: string;
    completed_at: string;
    document_id?: string;
    source_id?: string;
    error_message?: string;
    worker?: string;
    attempts?: string;
    manual: boolean;
}

interface StatsResponse {
    success: boolean;
    queueLength: number;
    stats: Stats;
    jobs: JobListItem[];
}

function formatDuration(ms: number | null): string {
    if (ms === null) return 'N/A';
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${(ms / 60000).toFixed(1)}m`;
}

function StatusPill({ label, value, dotClass }: { label: string; value: number; dotClass: string }) {
    return (
        <span className="inline-flex items-center gap-1.5 text-sm">
            <span className={`h-2 w-2 rounded-full shrink-0 ${dotClass}`} />
            <span className="text-muted-foreground">{label}</span>
            <span className="font-semibold tabular-nums">{value}</span>
        </span>
    );
}

function WorkerCard({ name, stats }: { name: string; stats: WorkerStats }) {
    const successRate = stats.completed + stats.failed > 0
        ? Math.round((stats.completed / (stats.completed + stats.failed)) * 100)
        : null;

    return (
        <Card className="relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent" />
            <CardHeader className="pb-2">
                <CardTitle className="text-lg font-semibold capitalize">{name}</CardTitle>
                <CardDescription>Worker Statistics</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <p className="text-xs text-muted-foreground">Total Jobs</p>
                        <p className="text-xl font-bold">{stats.total}</p>
                    </div>
                    <div>
                        <p className="text-xs text-muted-foreground">Avg Completion</p>
                        <p className="text-xl font-bold">{formatDuration(stats.avgCompletionTimeMs)}</p>
                    </div>
                </div>
                <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                        <span className="flex items-center gap-2">
                            <span className="h-2 w-2 rounded-full bg-yellow-500" />
                            Pending
                        </span>
                        <span className="font-medium">{stats.pending}</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                        <span className="flex items-center gap-2">
                            <span className="h-2 w-2 rounded-full bg-blue-500 animate-pulse" />
                            Processing
                        </span>
                        <span className="font-medium">{stats.processing}</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                        <span className="flex items-center gap-2">
                            <span className="h-2 w-2 rounded-full bg-green-500" />
                            Completed
                        </span>
                        <span className="font-medium">{stats.completed}</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                        <span className="flex items-center gap-2">
                            <span className="h-2 w-2 rounded-full bg-red-500" />
                            Failed
                        </span>
                        <span className="font-medium">{stats.failed}</span>
                    </div>
                </div>
                {successRate !== null && (
                    <div className="pt-2 border-t">
                        <div className="flex items-center justify-between text-sm">
                            <span className="text-muted-foreground">Success Rate</span>
                            <span className={`font-bold ${successRate >= 90 ? 'text-green-500' : successRate >= 70 ? 'text-yellow-500' : 'text-red-500'}`}>
                                {successRate}%
                            </span>
                        </div>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}

const STREAM_URL = '/api/stats/stream';
const POLL_INTERVAL_MS = 30000;

export function DashboardRedis() {
    const [stats, setStats] = React.useState<StatsResponse | null>(null);
    const [loading, setLoading] = React.useState(true);
    const [flushing, setFlushing] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);
    const [lastUpdated, setLastUpdated] = React.useState<Date | null>(null);
    const [live, setLive] = React.useState(false);

    const fetchStats = React.useCallback(async () => {
        try {
            setLoading(true);
            setError(null);
            const response = await fetch('/api/stats');
            if (!response.ok) throw new Error('Failed to fetch stats');
            const data = await response.json();
            setStats(data);
            setLastUpdated(new Date());
        } catch (err) {
            setError(err instanceof Error ? err.message : 'An error occurred');
        } finally {
            setLoading(false);
        }
    }, []);

    React.useEffect(() => {
        let eventSource: EventSource | null = null;
        let pollInterval: ReturnType<typeof setInterval> | null = null;
        let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;

        const connectStream = () => {
            if (typeof EventSource === 'undefined') return;
            const url = new URL(STREAM_URL, window.location.origin).toString();
            eventSource = new EventSource(url);
            setLive(true);
            setError(null);
            eventSource.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data) as StatsResponse;
                    if (data.success) {
                        setStats(data);
                        setLastUpdated(new Date());
                        setLoading(false);
                    }
                } catch { /* ignore */ }
            };
            eventSource.onerror = () => {
                eventSource?.close();
                eventSource = null;
                setLive(false);
                reconnectTimeout = setTimeout(connectStream, 3000);
            };
        };

        fetchStats();
        connectStream();
        pollInterval = setInterval(() => {
            setLive((isLive) => {
                if (!isLive) fetchStats();
                return isLive;
            });
        }, POLL_INTERVAL_MS);

        return () => {
            if (reconnectTimeout) clearTimeout(reconnectTimeout);
            if (pollInterval) clearInterval(pollInterval);
            eventSource?.close();
        };
    }, [fetchStats]);

    const handleFlushQueue = async () => {
        const confirmed = window.confirm(
            'Opravdu chcete kompletně vymazat celou Redis queue? Tato akce je nevratná.',
        );

        if (!confirmed) return;

        try {
            setFlushing(true);

            const response = await fetch('/api/tasks', { method: 'DELETE' });
            const data = await response.json().catch(() => ({}));

            if (!response.ok) {
                throw new Error(data.error || 'Failed to flush queue');
            }

            toast.success(data.message || 'Redis queue byla úspěšně vymazána');
            await fetchStats();
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Nepodařilo se vymazat Redis queue');
        } finally {
            setFlushing(false);
        }
    };

    if (error) {
        return (
            <Card className="w-full max-w-4xl mx-auto">
                <CardContent className="flex flex-col items-center justify-center py-12 space-y-4">
                    <XCircle className="h-12 w-12 text-red-500" />
                    <p className="text-lg text-muted-foreground">{error}</p>
                    <Button onClick={fetchStats} variant="outline">
                        <RefreshCw className="mr-2 h-4 w-4" />
                        Retry
                    </Button>
                </CardContent>
            </Card>
        );
    }

    const formatJobTime = (dateStr: string) => {
        if (!dateStr) return '—';
        const d = new Date(dateStr);
        return isNaN(d.getTime()) ? '—' : d.toLocaleString();
    };

    const jobDuration = (job: JobListItem) => {
        if (job.status !== 'completed' || !job.started_at || !job.completed_at) return null;
        const a = new Date(job.started_at).getTime();
        const b = new Date(job.completed_at).getTime();
        if (isNaN(a) || isNaN(b) || b <= a) return null;
        const ms = b - a;
        if (ms < 1000) return `${ms}ms`;
        if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
        return `${(ms / 60000).toFixed(1)}m`;
    };

    const statusDot = (status: string) => {
        switch (status) {
            case 'pending': return 'bg-yellow-500';
            case 'processing': return 'bg-blue-500 animate-pulse';
            case 'completed': return 'bg-green-500';
            case 'failed': return 'bg-red-500';
            default: return 'bg-muted-foreground';
        }
    };

    return (
        <div className="w-full max-w-6xl mx-auto space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex flex-wrap items-center gap-4">
                    <h1 className="text-2xl font-bold tracking-tight">Redis Queue</h1>
                    {stats && (
                        <div className="flex flex-wrap items-center gap-4 text-sm">
                            <StatusPill label="Pending" value={stats.stats.pending} dotClass="bg-yellow-500" />
                            <StatusPill label="Processing" value={stats.stats.processing} dotClass="bg-blue-500 animate-pulse" />
                            <StatusPill label="Completed" value={stats.stats.completed} dotClass="bg-green-500" />
                            <StatusPill label="Failed" value={stats.stats.failed} dotClass="bg-red-500" />
                        </div>
                    )}
                    {live && (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-green-600 dark:text-green-400">
                            <span className="relative flex h-2 w-2">
                                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
                                <span className="relative inline-flex h-2 w-2 rounded-full bg-green-500" />
                            </span>
                            Live
                        </span>
                    )}
                    {lastUpdated && (
                        <span className="text-xs text-muted-foreground">
                            Updated {lastUpdated.toLocaleTimeString()}
                        </span>
                    )}
                </div>
                <div className="flex items-center gap-2">
                    <Button onClick={fetchStats} variant="outline" size="sm" disabled={loading || flushing}>
                        <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                        Refresh
                    </Button>
                    <Button onClick={handleFlushQueue} variant="destructive" size="sm" disabled={flushing || loading}>
                        {flushing ? (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                            <Trash2 className="mr-2 h-4 w-4" />
                        )}
                        {flushing ? 'Flushing...' : 'Flush queue'}
                    </Button>
                </div>
            </div>

            {loading && !stats ? (
                <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
            ) : stats ? (
                <>
                    <Card>
                        <CardHeader>
                            <CardTitle>Queue jobs</CardTitle>
                            <CardDescription>
                                Live list of Redis queue items (newest first, max 500)
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="p-0">
                            <div className="overflow-x-auto max-h-[60vh] overflow-y-auto">
                                <table className="w-full text-sm">
                                    <thead className="sticky top-0 bg-muted/80 backdrop-blur supports-[backdrop-filter]:bg-muted/60 border-b">
                                        <tr>
                                            <th className="text-left font-medium p-3">ID</th>
                                            <th className="text-left font-medium p-3">Task</th>
                                            <th className="text-left font-medium p-3">Manual</th>
                                            <th className="text-left font-medium p-3">Status</th>
                                            <th className="text-left font-medium p-3">Created</th>
                                            <th className="text-left font-medium p-3">Started</th>
                                            <th className="text-left font-medium p-3">Completed</th>
                                            <th className="text-left font-medium p-3">Duration</th>
                                            <th className="text-left font-medium p-3">Error</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {stats.jobs.length === 0 ? (
                                            <tr>
                                                <td colSpan={9} className="p-6 text-center text-muted-foreground">
                                                    No jobs in queue
                                                </td>
                                            </tr>
                                        ) : (
                                            stats.jobs.map((job) => (
                                                <tr key={job.id} className="border-b border-border/50 hover:bg-muted/30">
                                                    <td className="p-3 font-mono text-xs">{job.id}</td>
                                                    <td className="p-3">{job.task || '—'}</td>
                                                    <td className="p-3">{job.manual ? 'yes' : 'no'}</td>
                                                    <td className="p-3">
                                                        <span className="inline-flex items-center gap-1.5 capitalize">
                                                            <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${statusDot(job.status)}`} />
                                                            {job.status}
                                                        </span>
                                                    </td>
                                                    <td className="p-3 text-muted-foreground">{formatJobTime(job.created_at)}</td>
                                                    <td className="p-3 text-muted-foreground">{formatJobTime(job.started_at)}</td>
                                                    <td className="p-3 text-muted-foreground">{formatJobTime(job.completed_at)}</td>
                                                    <td className="p-3 text-muted-foreground">{jobDuration(job) ?? '—'}</td>
                                                    <td className="p-3 max-w-[200px] truncate text-red-600 dark:text-red-400" title={job.error_message}>
                                                        {job.error_message || '—'}
                                                    </td>
                                                </tr>
                                            ))
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </CardContent>
                    </Card>

                    {Object.keys(stats.stats.byWorker).length > 0 && (
                        <div className="space-y-4 pt-4">
                            <h2 className="text-xl font-semibold">Worker Performance</h2>
                            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                                {Object.entries(stats.stats.byWorker).map(([name, workerStats]) => (
                                    <WorkerCard key={name} name={name} stats={workerStats} />
                                ))}
                            </div>
                        </div>
                    )}
                </>
            ) : null}
        </div>
    );
}
