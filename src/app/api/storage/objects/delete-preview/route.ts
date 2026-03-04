import { NextResponse } from 'next/server';
import { z } from 'zod';
import { lookupObjects } from '@/lib/r2';
import { createStorageObjectPreview } from '@/lib/storage-object-preview-store';

const RequestSchema = z.object({
    keys: z.array(z.string().min(1)).min(1).max(200),
});

function normalizeKeys(keys: string[]): string[] {
    return Array.from(
        new Set(
            keys
                .map((key) => key.trim())
                .filter(Boolean),
        ),
    );
}

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const parsed = RequestSchema.safeParse(body);

        if (!parsed.success) {
            return NextResponse.json({ error: 'Invalid input', details: parsed.error.format() }, { status: 400 });
        }

        const keys = normalizeKeys(parsed.data.keys);
        if (keys.length === 0) {
            return NextResponse.json({ error: 'At least one key is required' }, { status: 400 });
        }

        if (keys.length > 200) {
            return NextResponse.json({ error: 'Too many keys, maximum is 200' }, { status: 400 });
        }

        const lookup = await lookupObjects(keys);
        if (lookup.missingKeys.length > 0) {
            return NextResponse.json(
                {
                    error: 'Some keys were not found in storage',
                    missing_keys: lookup.missingKeys,
                },
                { status: 400 },
            );
        }

        const { token, preview } = createStorageObjectPreview(lookup.items);

        return NextResponse.json({
            success: true,
            preview_token: token,
            created_at: preview.createdAt,
            expires_at: preview.expiresAt,
            summary: preview.summary,
            items: preview.items,
        });
    } catch (error) {
        console.error('storage object delete preview failed', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Failed to create delete preview' },
            { status: 500 },
        );
    }
}
