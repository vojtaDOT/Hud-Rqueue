import { NextResponse } from 'next/server';
import { redis } from '@/lib/redis';

interface JobStats {
    total: number;
    pending: number;
    processing: number;
    completed: number;
    failed: number;
    avgCompletionTimeMs: number | null;
    byWorker: {
        [key: string]: {
            total: number;
            pending: number;
            processing: number;
            completed: number;
            failed: number;
            avgCompletionTimeMs: number | null;
        };
    };
}

export async function GET() {
    try {
        const queueName = 'queue';

        // Get queue length
        const queueLength = await redis.llen(queueName);

        // Scan all job keys
        let cursor = '0';
        const jobs: Array<{
            status: string;
            task: string;
            created_at: string;
            completed_at: string;
            started_at: string;
        }> = [];

        do {
            const [nextCursor, keys] = await redis.scan(cursor, 'MATCH', 'job:*', 'COUNT', 100);
            cursor = nextCursor;

            // Get job data for each key
            for (const key of keys) {
                const jobData = await redis.hgetall(key);
                if (jobData && Object.keys(jobData).length > 0) {
                    jobs.push({
                        status: jobData.status || 'unknown',
                        task: jobData.task || 'unknown',
                        created_at: jobData.created_at || '',
                        completed_at: jobData.completed_at || '',
                        started_at: jobData.started_at || '',
                    });
                }
            }
        } while (cursor !== '0');

        // Calculate stats
        const stats: JobStats = {
            total: jobs.length,
            pending: 0,
            processing: 0,
            completed: 0,
            failed: 0,
            avgCompletionTimeMs: null,
            byWorker: {},
        };

        const completionTimes: number[] = [];
        const workerCompletionTimes: { [key: string]: number[] } = {};

        for (const job of jobs) {
            // Count by status
            switch (job.status) {
                case 'pending':
                    stats.pending++;
                    break;
                case 'processing':
                    stats.processing++;
                    break;
                case 'completed':
                    stats.completed++;
                    break;
                case 'failed':
                    stats.failed++;
                    break;
            }

            // Initialize worker stats if needed
            const workerType = job.task || 'unknown';
            if (!stats.byWorker[workerType]) {
                stats.byWorker[workerType] = {
                    total: 0,
                    pending: 0,
                    processing: 0,
                    completed: 0,
                    failed: 0,
                    avgCompletionTimeMs: null,
                };
                workerCompletionTimes[workerType] = [];
            }

            stats.byWorker[workerType].total++;

            // Count worker status
            switch (job.status) {
                case 'pending':
                    stats.byWorker[workerType].pending++;
                    break;
                case 'processing':
                    stats.byWorker[workerType].processing++;
                    break;
                case 'completed':
                    stats.byWorker[workerType].completed++;
                    break;
                case 'failed':
                    stats.byWorker[workerType].failed++;
                    break;
            }

            // Calculate completion time for completed jobs
            if (job.status === 'completed' && job.started_at && job.completed_at) {
                const startTime = new Date(job.started_at).getTime();
                const endTime = new Date(job.completed_at).getTime();
                if (!isNaN(startTime) && !isNaN(endTime) && endTime > startTime) {
                    const duration = endTime - startTime;
                    completionTimes.push(duration);
                    workerCompletionTimes[workerType].push(duration);
                }
            }
        }

        // Calculate average completion times
        if (completionTimes.length > 0) {
            stats.avgCompletionTimeMs = Math.round(
                completionTimes.reduce((a, b) => a + b, 0) / completionTimes.length
            );
        }

        for (const workerType of Object.keys(workerCompletionTimes)) {
            const times = workerCompletionTimes[workerType];
            if (times.length > 0) {
                stats.byWorker[workerType].avgCompletionTimeMs = Math.round(
                    times.reduce((a, b) => a + b, 0) / times.length
                );
            }
        }

        return NextResponse.json({
            success: true,
            queueLength,
            stats,
        });

    } catch (error) {
        console.error('Error fetching stats:', error);
        return NextResponse.json(
            { error: 'Internal Server Error' },
            { status: 500 }
        );
    }
}
