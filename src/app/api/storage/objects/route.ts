import { NextResponse } from 'next/server';
import { listObjectsPage } from '@/lib/r2';

export const dynamic = 'force-dynamic';

function parsePageSize(value: string | null): number {
    const parsed = Number.parseInt(value || '50', 10);
    if (!Number.isFinite(parsed)) return 50;
    return Math.min(200, Math.max(1, parsed));
}

export async function GET(request: Request) {
    try {
        const url = new URL(request.url);

        const prefix = url.searchParams.get('prefix') ?? '';
        const cursor = url.searchParams.get('cursor');
        const pageSize = parsePageSize(url.searchParams.get('pageSize'));
        const query = (url.searchParams.get('query') ?? '').trim().toLowerCase();

        const page = await listObjectsPage(prefix, cursor, pageSize);
        const items = query
            ? page.items.filter((item) => item.key.toLowerCase().includes(query))
            : page.items;

        return NextResponse.json({
            success: true,
            prefix: page.prefix,
            cursor: page.cursor,
            nextCursor: page.nextCursor,
            pageSize: page.pageSize,
            items,
            returnedCount: items.length,
        });
    } catch (error) {
        console.error('storage objects list failed', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Failed to list storage objects' },
            { status: 500 },
        );
    }
}
