import { fetchQueueStats } from '@/lib/queue-stats';

const INTERVAL_MS = 2000; // Send stats every 2 seconds

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request: Request) {
    const encoder = new TextEncoder();
    const signal = request.signal;

    const stream = new ReadableStream({
        async start(controller) {
            let intervalId: ReturnType<typeof setInterval> | null = null;

            const send = async () => {
                try {
                    const data = await fetchQueueStats();
                    controller.enqueue(
                        encoder.encode(`data: ${JSON.stringify(data)}\n\n`)
                    );
                } catch (err) {
                    console.error('Stats stream error:', err);
                    controller.enqueue(
                        encoder.encode(
                            `data: ${JSON.stringify({ success: false, error: 'Failed to fetch stats' })}\n\n`
                        )
                    );
                }
            };

            const cleanup = () => {
                if (intervalId) clearInterval(intervalId);
                clearTimeout(timeoutId);
                controller.close();
            };

            signal?.addEventListener('abort', cleanup);
            const timeoutId = setTimeout(cleanup, 5 * 60 * 1000);

            await send();
            intervalId = setInterval(send, INTERVAL_MS);
        },
    });

    return new Response(stream, {
        headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-store, no-cache, must-revalidate',
            Connection: 'keep-alive',
        },
    });
}
