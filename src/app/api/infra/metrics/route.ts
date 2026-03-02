import { NextResponse } from 'next/server';
import { collectInfraMetrics } from '@/lib/infra-metrics';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function isInfraConfigError(error: unknown): error is Error {
    return error instanceof Error && error.name === 'InfraConfigError';
}

export async function GET() {
    try {
        const data = await collectInfraMetrics();
        return NextResponse.json(data);
    } catch (error) {
        if (isInfraConfigError(error)) {
            return NextResponse.json(
                { success: false, error: error.message },
                { status: 503 }
            );
        }

        console.error('Infra metrics fetch error:', error);
        return NextResponse.json(
            { success: false, error: 'Failed to fetch infrastructure metrics' },
            { status: 502 }
        );
    }
}
