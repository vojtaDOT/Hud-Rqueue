'use client';

import * as React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { RefreshCw, Clock, CheckCircle2, XCircle, Loader2, ListTodo, Activity } from 'lucide-react';

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
    byWorker: {
        [key: string]: WorkerStats;
    };
}

interface StatsResponse {
    success: boolean;
    queueLength: number;
    stats: Stats;
}

function formatDuration(ms: number | null): string {
    if (ms === null) return 'N/A';
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${(ms / 60000).toFixed(1)}m`;
}

function StatCard({
    title,
    value,
    description,
    icon: Icon,
    className = ''
}: {
    title: string;
    value: string | number;
    description?: string;
    icon: React.ElementType;
    className?: string;
}) {
    return (
        <Card className={`relative overflow-hidden ${className}`}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">{title}</CardTitle>
                <Icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
                <div className="text-2xl font-bold">{value}</div>
                {description && (
                    <p className="text-xs text-muted-foreground">{description}</p>
                )}
            </CardContent>
        </Card>
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

export function Dashboard() {
    const [stats, setStats] = React.useState<StatsResponse | null>(null);
    const [loading, setLoading] = React.useState(true);
    const [error, setError] = React.useState<string | null>(null);
    const [lastUpdated, setLastUpdated] = React.useState<Date | null>(null);

    const fetchStats = React.useCallback(async () => {
        try {
            setLoading(true);
            setError(null);
            const response = await fetch('/api/stats');
            if (!response.ok) {
                throw new Error('Failed to fetch stats');
            }
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
        fetchStats();

        // Auto-refresh every 30 seconds
        const interval = setInterval(fetchStats, 30000);
        return () => clearInterval(interval);
    }, [fetchStats]);

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

    return (
        <div className="w-full max-w-6xl mx-auto space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
                    <p className="text-muted-foreground">
                        Redis Queue Statistics
                        {lastUpdated && (
                            <span className="ml-2 text-xs">
                                Last updated: {lastUpdated.toLocaleTimeString()}
                            </span>
                        )}
                    </p>
                </div>
                <Button
                    onClick={fetchStats}
                    variant="outline"
                    size="sm"
                    disabled={loading}
                >
                    <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                    Refresh
                </Button>
            </div>

            {loading && !stats ? (
                <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
            ) : stats ? (
                <>
                    {/* Overview Stats */}
                    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                        <StatCard
                            title="Queue Length"
                            value={stats.queueLength}
                            description="Jobs waiting in queue"
                            icon={ListTodo}
                        />
                        <StatCard
                            title="Total Jobs"
                            value={stats.stats.total}
                            description="All tracked jobs"
                            icon={Activity}
                        />
                        <StatCard
                            title="Completed"
                            value={stats.stats.completed}
                            description={`${stats.stats.failed} failed`}
                            icon={CheckCircle2}
                            className="border-green-500/20"
                        />
                        <StatCard
                            title="Avg Completion"
                            value={formatDuration(stats.stats.avgCompletionTimeMs)}
                            description="Average processing time"
                            icon={Clock}
                        />
                    </div>

                    {/* Status Breakdown */}
                    <Card>
                        <CardHeader>
                            <CardTitle>Job Status Overview</CardTitle>
                            <CardDescription>Current status of all jobs in the system</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="flex gap-4 flex-wrap">
                                <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-yellow-500/10 text-yellow-600 dark:text-yellow-400">
                                    <span className="h-3 w-3 rounded-full bg-yellow-500" />
                                    <span className="font-medium">{stats.stats.pending}</span>
                                    <span className="text-sm">Pending</span>
                                </div>
                                <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400">
                                    <span className="h-3 w-3 rounded-full bg-blue-500 animate-pulse" />
                                    <span className="font-medium">{stats.stats.processing}</span>
                                    <span className="text-sm">Processing</span>
                                </div>
                                <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-green-500/10 text-green-600 dark:text-green-400">
                                    <span className="h-3 w-3 rounded-full bg-green-500" />
                                    <span className="font-medium">{stats.stats.completed}</span>
                                    <span className="text-sm">Completed</span>
                                </div>
                                <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-red-500/10 text-red-600 dark:text-red-400">
                                    <span className="h-3 w-3 rounded-full bg-red-500" />
                                    <span className="font-medium">{stats.stats.failed}</span>
                                    <span className="text-sm">Failed</span>
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Worker Stats */}
                    {Object.keys(stats.stats.byWorker).length > 0 && (
                        <div className="space-y-4">
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
