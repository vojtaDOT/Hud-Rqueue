import { NextResponse } from 'next/server';
import { z } from 'zod';
import { redis } from '@/lib/redis';
import { fromRedisBool } from '@/lib/redis-bool';

const RequestSchema = z.object({
    job_ids: z.array(z.string().min(1)).min(1).max(1000),
});

type StatusValue = 'pending' | 'processing' | 'completed' | 'failed' | 'unknown';

function normalizeStatus(value: string | undefined): StatusValue {
    if (
        value === 'pending'
        || value === 'processing'
        || value === 'completed'
        || value === 'failed'
    ) {
        return value;
    }
    return 'unknown';
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

        const jobs = await Promise.all(
            parsed.data.job_ids.map(async (id) => {
                const data = await redis.hgetall(`job:${id}`);
                if (!data || Object.keys(data).length === 0) {
                    return {
                        id,
                        task: 'unknown',
                        status: 'unknown' as const,
                        attempts: '0',
                        error_message: '',
                        started_at: '',
                        completed_at: '',
                        source_id: '',
                        source_url_id: '',
                        document_id: '',
                        mode: '',
                        lang: '',
                        dpi: '',
                        psm: '',
                        oem: '',
                        min_text_chars: '',
                        ocr_addon: '',
                        manual: false,
                    };
                }

                return {
                    id,
                    task: data.task || 'unknown',
                    status: normalizeStatus(data.status),
                    attempts: data.attempts || '0',
                    error_message: data.error_message || '',
                    started_at: data.started_at || '',
                    completed_at: data.completed_at || '',
                    source_id: data.source_id || '',
                    source_url_id: data.source_url_id || '',
                    document_id: data.document_id || '',
                    mode: data.mode || '',
                    lang: data.lang || '',
                    dpi: data.dpi || '',
                    psm: data.psm || '',
                    oem: data.oem || '',
                    min_text_chars: data.min_text_chars || '',
                    ocr_addon: data.ocr_addon || '',
                    manual: fromRedisBool(data.manual),
                };
            }),
        );

        const totals = {
            pending: 0,
            processing: 0,
            completed: 0,
            failed: 0,
            unknown: 0,
        };

        for (const job of jobs) {
            totals[job.status]++;
        }

        return NextResponse.json({
            success: true,
            jobs,
            totals,
        });
    } catch (error) {
        console.error('Error fetching pipeline job status:', error);
        return NextResponse.json(
            { error: 'Internal Server Error' },
            { status: 500 },
        );
    }
}
