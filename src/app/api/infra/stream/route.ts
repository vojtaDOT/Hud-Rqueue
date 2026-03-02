import { collectInfraMetrics, getInfraStreamIntervalMs } from '@/lib/infra-metrics';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const STREAM_TIMEOUT_MS = 5 * 60 * 1000;

export async function GET(request: Request) {
    const encoder = new TextEncoder();
    const signal = request.signal;
    const intervalMs = getInfraStreamIntervalMs();

    const stream = new ReadableStream({
        async start(controller) {
            let intervalId: ReturnType<typeof setInterval> | null = null;
            let timeoutId: ReturnType<typeof setTimeout> | null = null;
            let closed = false;

            const close = () => {
                if (closed) return;
                closed = true;
                if (intervalId) clearInterval(intervalId);
                if (timeoutId) clearTimeout(timeoutId);
                try {
                    controller.close();
                } catch {
                    // no-op
                }
            };

            const send = async () => {
                if (closed) return;
                try {
                    const payload = await collectInfraMetrics();
                    if (closed) return;
                    controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
                } catch (error) {
                    if (closed) return;
                    const isConfigError = error instanceof Error && error.name === 'InfraConfigError';
                    const message = isConfigError
                        ? error.message
                        : 'Failed to fetch infrastructure metrics';
                    try {
                        controller.enqueue(
                            encoder.encode(
                                `data: ${JSON.stringify({ success: false, error: message, timestamp: new Date().toISOString() })}\n\n`
                            )
                        );
                    } catch {
                        // no-op
                    }

                    if (isConfigError) {
                        close();
                    }
                }
            };

            signal?.addEventListener('abort', close);
            timeoutId = setTimeout(close, STREAM_TIMEOUT_MS);

            await send();
            intervalId = setInterval(() => {
                void send();
            }, intervalMs);
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
