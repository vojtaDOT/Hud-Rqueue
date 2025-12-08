import { NextResponse } from 'next/server';
import { redis } from '@/lib/redis';
import { z } from 'zod';

const TaskSchema = z.object({
    document_id: z.string().optional(),
    source_id: z.string().optional(),
    task: z.string().min(1, 'Task type is required'),
    max_attempts: z.number().int().default(3),
    cron_time: z.string().optional(),
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

        const { document_id, source_id, task, max_attempts, cron_time } = result.data;

        // Validate connection string availability
        if (!process.env.REDIS_URL) {
            // fallback is localhost in lib/redis but good to check connectivity if needed
        }

        // Generate new ID
        const id = await redis.incr('job_id_counter');

        const now = new Date().toISOString();

        const jobData = {
            id,
            document_id: document_id || '',
            source_id: source_id || '',
            status: 'pending',
            attempts: 0,
            max_attempts: max_attempts, // Corrected spelling from image 'max_attemps' to 'max_attempts'
            error_message: '',
            created_at: now,
            started_at: '',
            completed_at: '',
            worker: '',
            task: task,
            cron_time: cron_time || '',
        };

        // Store hash
        await redis.hset(`job:${id}`, jobData);

        // Add to queue (RPUSH for FIFO)
        const queueName = 'queue'; // Default queue name
        await redis.rpush(queueName, id);

        return NextResponse.json({ success: true, job: jobData });
    } catch (error) {
        console.error('Error adding task:', error);
        return NextResponse.json(
            { error: 'Internal Server Error' },
            { status: 500 }
        );
    }
}
