import { NextResponse } from 'next/server';
import { redis } from '@/lib/redis';
import { z } from 'zod';

const TaskSchema = z.object({
    document_id: z.string().optional(),
    source_id: z.string().optional(),
    task: z.string().min(1, 'Task type is required'),
    max_attempts: z.number().int().default(3),
    cron_time: z.string().optional(),
    count: z.number().int().min(1).max(1000).optional().default(1),
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

        const { document_id, source_id, task, max_attempts, cron_time, count } = result.data;

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

        const createdJobs = [];

        for (let i = 0; i < count; i++) {
            const id = firstId + i;
            const jobData = {
                id,
                document_id: document_id || '',
                source_id: source_id || '',
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
            };

            // Store hash
            pipeline.hset(`job:${id}`, jobData);
            // Add to queue
            pipeline.rpush(queueName, id);

            if (count === 1) {
                createdJobs.push(jobData);
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
