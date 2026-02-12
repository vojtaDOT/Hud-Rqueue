'use client';

import * as React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Activity, Database, Layers, TrendingUp } from 'lucide-react';

export function DashboardOverview() {
    const [summary, setSummary] = React.useState<{ queueLength?: number; totalJobs?: number } | null>(null);

    React.useEffect(() => {
        let cancelled = false;
        fetch('/api/stats')
            .then((r) => (r.ok ? r.json() : null))
            .then((data) => {
                if (!cancelled && data?.success) {
                    setSummary({
                        queueLength: data.queueLength,
                        totalJobs: data.stats?.total,
                    });
                }
            })
            .catch(() => {});
        return () => {
            cancelled = true;
        };
    }, []);

    return (
        <div className="w-full max-w-6xl mx-auto space-y-6">
            <div>
                <h1 className="text-2xl font-bold tracking-tight">Overview</h1>
                <p className="text-muted-foreground text-sm mt-1">
                    Project health and key metrics at a glance
                </p>
            </div>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Queue (Redis)</CardTitle>
                        <Layers className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold tabular-nums">
                            {summary?.queueLength ?? '—'}
                        </div>
                        <p className="text-xs text-muted-foreground">Jobs waiting in queue</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Total Jobs</CardTitle>
                        <Activity className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold tabular-nums">
                            {summary?.totalJobs ?? '—'}
                        </div>
                        <p className="text-xs text-muted-foreground">All tracked jobs</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Database</CardTitle>
                        <Database className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">—</div>
                        <p className="text-xs text-muted-foreground">See Database tab for details</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Throughput</CardTitle>
                        <TrendingUp className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">—</div>
                        <p className="text-xs text-muted-foreground">Graph placeholder</p>
                    </CardContent>
                </Card>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
                <Card>
                    <CardHeader>
                        <CardTitle>Job throughput</CardTitle>
                        <CardDescription>Completed jobs over time (graph view)</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="h-[240px] rounded-lg border border-dashed border-muted-foreground/25 flex items-center justify-center text-muted-foreground text-sm">
                            Chart placeholder — add time-series data and a chart library
                        </div>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader>
                        <CardTitle>Status distribution</CardTitle>
                        <CardDescription>Pending / Processing / Completed / Failed</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="h-[240px] rounded-lg border border-dashed border-muted-foreground/25 flex items-center justify-center text-muted-foreground text-sm">
                            Chart placeholder — pie or bar chart
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
