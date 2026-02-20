import { NextResponse } from 'next/server';
import { z } from 'zod';
import { redis } from '@/lib/redis';

const JobSchema = z.object({
    task: z.enum(['discover', 'download', 'ocr']),
    source_id: z.string().min(1, 'source_id is required'),
    source_url_id: z.string().optional(),
    document_id: z.string().optional(),
    max_attempts: z.number().int().min(1).max(20).optional().default(3),
});

const RequestSchema = z.object({
    jobs: z.array(JobSchema).min(1).max(500),
});

type JobInput = z.infer<typeof JobSchema>;

function validateTaskSpecificFields(job: JobInput): string | null {
    if (job.task === 'download' && !job.source_url_id) {
        return 'download job requires source_url_id';
    }
    if (job.task === 'ocr' && !job.document_id) {
        return 'ocr job requires document_id';
    }
    return null;
}

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const parsed = RequestSchema.safeParse(body);

        if (!parsed.success) {
            return NextResponse.json(
                { error: 'Invalid input', details: parsed.error.format() },
                { status: 400 },
            );
        }

        for (const job of parsed.data.jobs) {
            const taskError = validateTaskSpecificFields(job);
            if (taskError) {
                return NextResponse.json({ error: taskError }, { status: 400 });
            }
        }

        const { jobs } = parsed.data;
        const count = jobs.length;
        const endId = await redis.incrby('job_id_counter', count);
        const firstId = endId - count + 1;
        const createdAt = new Date().toISOString();

        const pipeline = redis.pipeline();
        const responseJobs: Array<{
            id: string;
            task: string;
            source_id: string;
            source_url_id: string;
            document_id: string;
        }> = [];

        for (let i = 0; i < jobs.length; i++) {
            const job = jobs[i];
            const id = String(firstId + i);
            const sourceUrlId = job.source_url_id ?? '';
            const documentId = job.document_id ?? '';

            const redisJob = {
                id,
                task: job.task,
                source_id: job.source_id,
                source_url_id: sourceUrlId,
                document_id: documentId,
                status: 'pending',
                created_at: createdAt,
                attempts: '0',
                max_attempts: String(job.max_attempts ?? 3),
                worker: '',
                started_at: '',
                completed_at: '',
                error_message: '',
                cron_time: '',
            };

            pipeline.hset(`job:${id}`, redisJob);
            pipeline.rpush('queue', id);

            responseJobs.push({
                id,
                task: job.task,
                source_id: job.source_id,
                source_url_id: sourceUrlId,
                document_id: documentId,
            });
        }

        await pipeline.exec();

        return NextResponse.json({
            success: true,
            jobs: responseJobs,
        });
    } catch (error) {
        console.error('Error creating pipeline jobs:', error);
        return NextResponse.json(
            { error: 'Internal Server Error' },
            { status: 500 },
        );
    }
}
