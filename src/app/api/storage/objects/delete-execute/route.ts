import crypto from 'node:crypto';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { consumeStorageObjectPreview } from '@/lib/storage-object-preview-store';
import { deleteAnyObjects } from '@/lib/r2';

const RequestSchema = z.object({
    preview_token: z.string().min(1),
    confirmation: z.string().min(1),
});

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const parsed = RequestSchema.safeParse(body);

        if (!parsed.success) {
            return NextResponse.json({ error: 'Invalid input', details: parsed.error.format() }, { status: 400 });
        }

        if (parsed.data.confirmation !== 'DELETE OBJECTS') {
            return NextResponse.json({ error: 'Confirmation string mismatch' }, { status: 400 });
        }

        const preview = consumeStorageObjectPreview(parsed.data.preview_token);
        if (!preview) {
            return NextResponse.json({ error: 'Preview token is missing, expired, or already used' }, { status: 400 });
        }

        const operationId = crypto.randomUUID();
        const result = await deleteAnyObjects(preview.items.map((item) => item.key));

        return NextResponse.json({
            success: true,
            operation_id: operationId,
            deleted_count: result.deletedCount,
            failed_count: result.failedCount,
            results: result.results,
        });
    } catch (error) {
        console.error('storage object delete execute failed', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Failed to execute object deletion' },
            { status: 500 },
        );
    }
}
