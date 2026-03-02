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
            let closed = false;

            const send = async () => {
                if (closed) return;
                try {
                    const data = await fetchQueueStats();
                    if (closed) return;
                    controller.enqueue(
                        encoder.encode(`data: ${JSON.stringify(data)}\n\n`)
                    );
                } catch (err) {
                    if (closed) return;
                    console.error('Stats stream error:', err);
                    try {
                        controller.enqueue(
                            encoder.encode(
                                `data: ${JSON.stringify({ success: false, error: 'Failed to fetch stats' })}\n\n`
                            )
                        );
                    } catch {
                        // Controller already closed, ignore
                    }
                }
            };

            const cleanup = () => {
                if (closed) return;
                closed = true;
                if (intervalId) clearInterval(intervalId);
                clearTimeout(timeoutId);
                try {
                    controller.close();
                } catch {
                    // Already closed, ignore
                }
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
