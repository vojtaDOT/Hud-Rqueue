import { NextResponse } from 'next/server';
import { redis } from '@/lib/redis';
import { z } from 'zod';
import { toRedisBool } from '@/lib/redis-bool';

const TaskSchema = z.object({
    document_id: z.string().optional(),
    source_id: z.string().optional(),
    source_url_id: z.string().optional(),
    task: z.string().min(1, 'Task type is required'),
    max_attempts: z.number().int().default(3),
    cron_time: z.string().optional(),
    count: z.number().int().min(1).max(1000).optional().default(1),
    manual: z.boolean().optional().default(false),
    // Scrapy-specific
    method: z.string().optional(),
    source_url: z.string().optional(),
    // OCR-specific
    ocr_language: z.string().optional(),
    ocr_psm: z.number().int().min(0).max(13).optional(),
    ocr_oem: z.number().int().min(0).max(3).optional(),
});

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const result = TaskSchema.safeParse(body);

        if (!result.success) {
            return NextResponse.json(
                { error: 'Invalid input', details: result.error.format() },
                { status: 400 }
            );
        }

        const {
            document_id, source_id, source_url_id, task, max_attempts, cron_time, count,
            method, source_url, ocr_language, ocr_psm, ocr_oem, manual,
        } = result.data;

        // Validate connection string availability
        if (!process.env.REDIS_URL) {
            // fallback is localhost in lib/redis but good to check connectivity if needed
        }

        // Generate new IDs
        const startId = await redis.incrby('job_id_counter', count);
        const firstId = startId - count + 1;

        const now = new Date().toISOString();
        const queueName = 'queue'; // Default queue name

        // Use pipeline for atomic-like batch insertion
        const pipeline = redis.pipeline();

        const createdJobs: Array<{
            id: number;
            document_id: string;
            source_id: string;
            source_url_id: string;
            status: string;
            attempts: number;
            max_attempts: number;
            error_message: string;
            created_at: string;
            started_at: string;
            completed_at: string;
            worker: string;
            task: string;
            cron_time: string;
            method: string;
            source_url: string;
            ocr_language: string;
            ocr_psm: number | string;
            ocr_oem: number | string;
            manual: boolean;
        }> = [];

        for (let i = 0; i < count; i++) {
            const id = firstId + i;
            const jobData = {
                id,
                document_id: document_id || '',
                source_id: source_id || '',
                source_url_id: source_url_id || '',
                status: 'pending',
                attempts: 0,
                max_attempts: max_attempts,
                error_message: '',
                created_at: now,
                started_at: '',
                completed_at: '',
                worker: '',
                task: task,
                cron_time: cron_time || '',
                method: method || '',
                source_url: source_url || '',
                ocr_language: ocr_language || '',
                ocr_psm: ocr_psm ?? '',
                ocr_oem: ocr_oem ?? '',
                manual: toRedisBool(manual ?? false),
            };

            // Store hash
            pipeline.hset(`job:${id}`, jobData);
            // Add to queue
            pipeline.rpush(queueName, id);

            if (count === 1) {
                createdJobs.push({
                    id,
                    document_id: document_id || '',
                    source_id: source_id || '',
                    source_url_id: source_url_id || '',
                    status: 'pending',
                    attempts: 0,
                    max_attempts,
                    error_message: '',
                    created_at: now,
                    started_at: '',
                    completed_at: '',
                    worker: '',
                    task,
                    cron_time: cron_time || '',
                    method: method || '',
                    source_url: source_url || '',
                    ocr_language: ocr_language || '',
                    ocr_psm: ocr_psm ?? '',
                    ocr_oem: ocr_oem ?? '',
                    manual: manual ?? false,
                });
            } else if (i === 0 || i === count - 1) {
                // For large batches, strictly return first and last for verification to save bandwidth if needed, 
                // but user wants to "test", so knowing it succeeded is enough. 
                // Let's return the first job as a sample if batch.
            }
        }

        await pipeline.exec();

        if (count === 1) {
            return NextResponse.json({ success: true, job: createdJobs[0] });
        }

        return NextResponse.json({
            success: true,
            message: `Successfully queued ${count} tasks`,
            first_job_id: firstId,
            last_job_id: startId
        });

    } catch (error) {
        console.error('Error adding task:', error);
        return NextResponse.json(
            { error: 'Internal Server Error' },
            { status: 500 }
        );
    }
}

export async function DELETE() {
    try {
        const queueName = 'queue';

        // Get all job keys using SCAN to avoid blocking
        let cursor = '0';
        const jobKeys: string[] = [];

        do {
            const [nextCursor, keys] = await redis.scan(cursor, 'MATCH', 'job:*', 'COUNT', 100);
            cursor = nextCursor;
            jobKeys.push(...keys);
        } while (cursor !== '0');

        // Delete all job hashes and the queue
        const pipeline = redis.pipeline();

        for (const key of jobKeys) {
            pipeline.del(key);
        }

        // Clear the queue list
        pipeline.del(queueName);

        // Reset the job ID counter
        pipeline.set('job_id_counter', 0);

        await pipeline.exec();

        return NextResponse.json({
            success: true,
            message: `Flushed ${jobKeys.length} jobs from queue`,
            deleted_jobs: jobKeys.length
        });

    } catch (error) {
        console.error('Error flushing queue:', error);
        return NextResponse.json(
            { error: 'Internal Server Error' },
            { status: 500 }
        );
    }
}
