import { NextRequest, NextResponse } from 'next/server';

const FEED_CONTENT_TYPE_RE = /(application\/(rss\+xml|atom\+xml|xml)|text\/xml)/i;
const FEED_BODY_RE = /<(rss|feed|rdf:RDF)(\s|>)/i;
const ALT_FEED_TYPE_RE = /application\/(rss\+xml|atom\+xml|xml)|text\/xml/i;

const COMMON_FEED_PATHS = [
    '/feed',
    '/rss',
    '/rss.xml',
    '/atom.xml',
    '/feed.xml',
    '/index.xml',
] as const;

const REQUEST_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (compatible; HUD-Queue-RSS-Detector/1.0)',
    'Accept': 'application/rss+xml, application/atom+xml, application/xml, text/xml, text/html;q=0.9, */*;q=0.8',
};

interface FetchSnapshot {
    ok: boolean;
    status: number;
    finalUrl: string;
    contentType: string;
    body: string;
}

function normalizeUrl(value: string): string {
    try {
        return new URL(value).href;
    } catch {
        return value;
    }
}

function uniqueUrls(values: string[]): string[] {
    const seen = new Set<string>();
    const output: string[] = [];

    for (const value of values) {
        const normalized = normalizeUrl(value);
        if (!seen.has(normalized)) {
            seen.add(normalized);
            output.push(normalized);
        }
    }

    return output;
}

function parseAttributes(tag: string): Record<string, string> {
    const attrs: Record<string, string> = {};
    const attrRe = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g;

    let match: RegExpExecArray | null;
    while ((match = attrRe.exec(tag)) !== null) {
        const key = match[1].toLowerCase();
        const value = (match[2] ?? match[3] ?? match[4] ?? '').trim();
        attrs[key] = value;
    }

    return attrs;
}

function isFeedSnapshot(snapshot: Pick<FetchSnapshot, 'contentType' | 'body'>): boolean {
    return FEED_CONTENT_TYPE_RE.test(snapshot.contentType) || FEED_BODY_RE.test(snapshot.body);
}

function resolveUrl(value: string, baseUrl: string): string | null {
    if (!value) return null;

    try {
        const resolved = new URL(value, baseUrl);
        if (resolved.protocol !== 'http:' && resolved.protocol !== 'https:') {
            return null;
        }
        return resolved.href;
    } catch {
        return null;
    }
}

function extractFeedLinksFromHtml(html: string, baseUrl: string): string[] {
    const discovered: string[] = [];

    const linkTagRe = /<link\b[^>]*>/gi;
    let linkMatch: RegExpExecArray | null;
    while ((linkMatch = linkTagRe.exec(html)) !== null) {
        const attrs = parseAttributes(linkMatch[0]);
        const rel = (attrs.rel ?? '').toLowerCase();
        const type = (attrs.type ?? '').toLowerCase();
        if (!rel.includes('alternate') || !ALT_FEED_TYPE_RE.test(type)) {
            continue;
        }

        const resolved = resolveUrl(attrs.href ?? '', baseUrl);
        if (resolved) {
            discovered.push(resolved);
        }
    }

    const anchorTagRe = /<a\b[^>]*>/gi;
    let anchorMatch: RegExpExecArray | null;
    while ((anchorMatch = anchorTagRe.exec(html)) !== null) {
        const attrs = parseAttributes(anchorMatch[0]);
        const href = attrs.href ?? '';
        if (!/(rss|atom|feed|\.xml($|[?#]))/i.test(href)) {
            continue;
        }

        const resolved = resolveUrl(href, baseUrl);
        if (resolved) {
            discovered.push(resolved);
        }
    }

    return uniqueUrls(discovered);
}

async function fetchSnapshot(url: string, timeoutMs = 8000): Promise<FetchSnapshot | null> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
        const response = await fetch(url, {
            headers: REQUEST_HEADERS,
            redirect: 'follow',
            signal: controller.signal,
        });

        const contentType = response.headers.get('content-type') ?? '';
        const body = (await response.text()).slice(0, 16000);

        return {
            ok: response.ok,
            status: response.status,
            finalUrl: response.url,
            contentType,
            body,
        };
    } catch {
        return null;
    } finally {
        clearTimeout(timeoutId);
    }
}

function buildGuessedFeedUrls(url: URL): string[] {
    const guessed: string[] = [...COMMON_FEED_PATHS];
    const trimmedPath = url.pathname.replace(/\/+$/, '');

    if (trimmedPath && trimmedPath !== '/') {
        guessed.push(`${trimmedPath}/feed`);
        guessed.push(`${trimmedPath}/rss`);
        guessed.push(`${trimmedPath}/rss.xml`);
        guessed.push(`${trimmedPath}/atom.xml`);
    }

    return uniqueUrls(
        guessed
            .map((path) => resolveUrl(path, url.origin))
            .filter((value): value is string => Boolean(value)),
    );
}

export async function GET(request: NextRequest) {
    const targetUrl = request.nextUrl.searchParams.get('url')?.trim();

    if (!targetUrl) {
        return NextResponse.json({ error: 'URL parametr je povinný' }, { status: 400 });
    }

    let parsedUrl: URL;
    try {
        parsedUrl = new URL(targetUrl);
    } catch {
        return NextResponse.json({ error: 'Neplatná URL adresa' }, { status: 400 });
    }

    if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
        return NextResponse.json({ error: 'Povolené jsou pouze HTTP a HTTPS URL' }, { status: 400 });
    }

    const discovered: string[] = [];
    const inspected: string[] = [];

    const initialSnapshot = await fetchSnapshot(parsedUrl.href);
    if (initialSnapshot) {
        inspected.push(parsedUrl.href);

        if (initialSnapshot.ok && isFeedSnapshot(initialSnapshot)) {
            discovered.push(initialSnapshot.finalUrl);
        } else if (initialSnapshot.ok) {
            discovered.push(...extractFeedLinksFromHtml(initialSnapshot.body, initialSnapshot.finalUrl));
        }
    }

    const guessedCandidates = buildGuessedFeedUrls(parsedUrl)
        .filter((candidate) => !inspected.includes(normalizeUrl(candidate)));

    if (guessedCandidates.length > 0) {
        const probeResults = await Promise.all(
            guessedCandidates.map(async (candidate) => {
                const snapshot = await fetchSnapshot(candidate, 6000);
                if (!snapshot || !snapshot.ok) return null;
                if (!isFeedSnapshot(snapshot)) return null;
                return snapshot.finalUrl;
            }),
        );

        discovered.push(...probeResults.filter((value): value is string => Boolean(value)));
    }

    const feeds = uniqueUrls(discovered);

    return NextResponse.json({
        detected: feeds.length > 0,
        feed_urls: feeds,
        checked_url: parsedUrl.href,
    });
}
