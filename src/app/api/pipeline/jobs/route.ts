import { NextResponse } from 'next/server';
import { z } from 'zod';
import { redis } from '@/lib/redis';
import { toRedisBool } from '@/lib/redis-bool';

const JobSchema = z.object({
    task: z.enum(['discover', 'download', 'ocr']),
    source_id: z.string().min(1, 'source_id is required'),
    source_url_id: z.string().optional(),
    document_id: z.string().optional(),
    manual: z.boolean().optional().default(false),
    max_attempts: z.number().int().min(1).max(20).optional().default(3),
    mode: z.string().optional(),
    lang: z.string().optional(),
    dpi: z.string().optional(),
    psm: z.string().optional(),
    oem: z.string().optional(),
    min_text_chars: z.string().optional(),
    ocr_addon: z.string().optional(),
});

const RequestSchema = z.object({
    jobs: z.array(JobSchema).min(1).max(500),
});

type JobInput = z.infer<typeof JobSchema>;
type OcrTemplate = {
    mode: string;
    lang: string;
    dpi: string;
    psm: string;
    oem: string;
    min_text_chars: string;
    ocr_addon: string;
};

const DEFAULT_OCR_TEMPLATE: OcrTemplate = {
    mode: 'hybrid',
    lang: 'ces+eng',
    dpi: '300',
    psm: '3',
    oem: '3',
    min_text_chars: '30',
    ocr_addon: '1',
};

function validateTaskSpecificFields(job: JobInput): string | null {
    if (job.task === 'download' && !job.source_url_id) {
        return 'download job requires source_url_id';
    }
    if (job.task === 'ocr' && !job.document_id) {
        return 'ocr job requires document_id';
    }
    return null;
}

function resolveOcrTemplate(job: JobInput): OcrTemplate {
    return {
        mode: job.mode || DEFAULT_OCR_TEMPLATE.mode,
        lang: job.lang || DEFAULT_OCR_TEMPLATE.lang,
        dpi: job.dpi || DEFAULT_OCR_TEMPLATE.dpi,
        psm: job.psm || DEFAULT_OCR_TEMPLATE.psm,
        oem: job.oem || DEFAULT_OCR_TEMPLATE.oem,
        min_text_chars: job.min_text_chars || DEFAULT_OCR_TEMPLATE.min_text_chars,
        ocr_addon: job.ocr_addon || DEFAULT_OCR_TEMPLATE.ocr_addon,
    };
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
            mode: string;
            lang: string;
            dpi: string;
            psm: string;
            oem: string;
            min_text_chars: string;
            ocr_addon: string;
            manual: boolean;
        }> = [];

        for (let i = 0; i < jobs.length; i++) {
            const job = jobs[i];
            const id = String(firstId + i);
            const sourceUrlId = job.source_url_id ?? '';
            const documentId = job.document_id ?? '';
            const ocrTemplate = job.task === 'ocr'
                ? resolveOcrTemplate(job)
                : {
                    mode: '',
                    lang: '',
                    dpi: '',
                    psm: '',
                    oem: '',
                    min_text_chars: '',
                    ocr_addon: '',
                };

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
                mode: ocrTemplate.mode,
                lang: ocrTemplate.lang,
                dpi: ocrTemplate.dpi,
                psm: ocrTemplate.psm,
                oem: ocrTemplate.oem,
                min_text_chars: ocrTemplate.min_text_chars,
                ocr_addon: ocrTemplate.ocr_addon,
                manual: toRedisBool(job.manual ?? false),
            };

            pipeline.hset(`job:${id}`, redisJob);
            pipeline.rpush('queue', id);

            responseJobs.push({
                id,
                task: job.task,
                source_id: job.source_id,
                source_url_id: sourceUrlId,
                document_id: documentId,
                mode: ocrTemplate.mode,
                lang: ocrTemplate.lang,
                dpi: ocrTemplate.dpi,
                psm: ocrTemplate.psm,
                oem: ocrTemplate.oem,
                min_text_chars: ocrTemplate.min_text_chars,
                ocr_addon: ocrTemplate.ocr_addon,
                manual: job.manual ?? false,
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
