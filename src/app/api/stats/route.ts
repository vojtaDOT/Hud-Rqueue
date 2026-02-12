import { NextResponse } from 'next/server';
import { fetchQueueStats } from '@/lib/queue-stats';

export async function GET() {
    try {
        const data = await fetchQueueStats();
        return NextResponse.json(data);
    } catch (error) {
        console.error('Error fetching stats:', error);
        return NextResponse.json(
            { error: 'Internal Server Error' },
            { status: 500 }
        );
    }
}
