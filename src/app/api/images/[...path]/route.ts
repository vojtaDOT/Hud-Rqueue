import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const FALLBACK_USER_AGENT =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36';

function resolvePreviewTargetOrigin(request: NextRequest): string | null {
    const referer = request.headers.get('referer');
    if (!referer) return null;

    try {
        const refererUrl = new URL(referer);
        const previewTarget = refererUrl.searchParams.get('url');
        if (!previewTarget) return null;

        const parsedTarget = new URL(previewTarget);
        if (!['http:', 'https:'].includes(parsedTarget.protocol)) return null;

        return parsedTarget.origin;
    } catch {
        return null;
    }
}

export async function GET(
    request: NextRequest,
    context: { params: Promise<{ path: string[] }> },
) {
    const { path } = await context.params;
    if (!Array.isArray(path) || path.length === 0) {
        return NextResponse.json({ error: 'Missing asset path' }, { status: 400 });
    }

    const targetOrigin = resolvePreviewTargetOrigin(request);
    if (!targetOrigin) {
        return NextResponse.json({ error: 'Missing preview referer context' }, { status: 400 });
    }

    const upstreamUrl = `${targetOrigin}/api/images/${path.join('/')}${request.nextUrl.search}`;

    try {
        const upstreamResponse = await fetch(upstreamUrl, {
            headers: {
                'User-Agent': request.headers.get('user-agent') || FALLBACK_USER_AGENT,
                'Accept': request.headers.get('accept') || '*/*',
                'Accept-Language': request.headers.get('accept-language') || 'cs-CZ,cs;q=0.9,en-US;q=0.8,en;q=0.7',
                'Referer': `${targetOrigin}/`,
            },
            redirect: 'follow',
        });

        if (!upstreamResponse.ok) {
            const requestedFile = path[path.length - 1]?.toLowerCase() || '';
            if (requestedFile.endsWith('.svg')) {
                const emptySvg = '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1" viewBox="0 0 1 1"></svg>';
                return new NextResponse(emptySvg, {
                    status: 200,
                    headers: {
                        'Content-Type': 'image/svg+xml; charset=utf-8',
                        'Cache-Control': 'public, max-age=3600',
                        'Access-Control-Allow-Origin': '*',
                    },
                });
            }
            return new NextResponse('', { status: upstreamResponse.status });
        }

        const buffer = await upstreamResponse.arrayBuffer();
        const contentType = upstreamResponse.headers.get('content-type') || 'application/octet-stream';

        return new NextResponse(buffer, {
            status: 200,
            headers: {
                'Content-Type': contentType,
                'Cache-Control': 'public, max-age=3600',
                'Access-Control-Allow-Origin': '*',
            },
        });
    } catch {
        return new NextResponse('', { status: 502 });
    }
}
