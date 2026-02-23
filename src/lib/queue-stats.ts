import { redis } from '@/lib/redis';
import { fromRedisBool } from '@/lib/redis-bool';

export interface JobStats {
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

export interface JobListItem {
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

export interface QueueStatsResponse {
    success: boolean;
    queueLength: number;
    stats: JobStats;
    jobs: JobListItem[];
}

export async function fetchQueueStats(): Promise<QueueStatsResponse> {
    const queueName = 'queue';
    const queueLength = await redis.llen(queueName);

    let cursor = '0';
    const jobsRaw: Array<{
        id: string;
        status: string;
        task: string;
        created_at: string;
        completed_at: string;
        started_at: string;
        document_id?: string;
        source_id?: string;
        error_message?: string;
        worker?: string;
        attempts?: string;
        manual: boolean;
    }> = [];

    do {
        const [nextCursor, keys] = await redis.scan(cursor, 'MATCH', 'job:*', 'COUNT', 100);
        cursor = nextCursor;
        for (const key of keys) {
            const jobData = await redis.hgetall(key);
            if (jobData && Object.keys(jobData).length > 0) {
                const id = jobData.id ?? key.replace(/^job:/, '');
                jobsRaw.push({
                    id: String(id),
                    status: jobData.status || 'unknown',
                    task: jobData.task || 'unknown',
                    created_at: jobData.created_at || '',
                    completed_at: jobData.completed_at || '',
                    started_at: jobData.started_at || '',
                    document_id: jobData.document_id,
                    source_id: jobData.source_id,
                    error_message: jobData.error_message,
                    worker: jobData.worker,
                    attempts: jobData.attempts,
                    manual: fromRedisBool(jobData.manual),
                });
            }
        }
    } while (cursor !== '0');

    const jobs: JobListItem[] = jobsRaw
        .sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime())
        .slice(0, 500);

    const stats: JobStats = {
        total: jobsRaw.length,
        pending: 0,
        processing: 0,
        completed: 0,
        failed: 0,
        avgCompletionTimeMs: null,
        byWorker: {},
    };

    const completionTimes: number[] = [];
    const workerCompletionTimes: { [key: string]: number[] } = {};

    for (const job of jobsRaw) {
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

    return { success: true, queueLength, stats, jobs };
}
