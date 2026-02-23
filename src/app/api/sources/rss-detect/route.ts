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

type FeedWarningReason = 'http_error' | 'not_feed' | 'network_error' | 'timeout';

interface FeedDetectionWarning {
    url: string;
    status: number | null;
    reason: FeedWarningReason;
}

interface FetchAttemptResult {
    snapshot: FetchSnapshot | null;
    errorReason: 'network_error' | 'timeout' | null;
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

async function fetchSnapshot(url: string, timeoutMs = 8000): Promise<FetchAttemptResult> {
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
            snapshot: {
                ok: response.ok,
                status: response.status,
                finalUrl: response.url,
                contentType,
                body,
            },
            errorReason: null,
        };
    } catch (error) {
        const isTimeout = (error as { name?: string }).name === 'AbortError';
        return {
            snapshot: null,
            errorReason: isTimeout ? 'timeout' : 'network_error',
        };
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

    const candidateSet = new Set<string>();
    const candidates: string[] = [];
    const enqueueCandidate = (candidate: string | null | undefined) => {
        if (!candidate) return;
        const normalized = normalizeUrl(candidate);
        if (candidateSet.has(normalized)) return;
        candidateSet.add(normalized);
        candidates.push(normalized);
    };

    enqueueCandidate(parsedUrl.href);

    const attemptCache = new Map<string, FetchAttemptResult>();
    const probeCandidate = async (candidate: string, timeoutMs = 6000): Promise<FetchAttemptResult> => {
        const normalized = normalizeUrl(candidate);
        const cached = attemptCache.get(normalized);
        if (cached) return cached;
        const attempt = await fetchSnapshot(normalized, timeoutMs);
        attemptCache.set(normalized, attempt);
        return attempt;
    };

    const initialAttempt = await probeCandidate(parsedUrl.href, 8000);
    const initialSnapshot = initialAttempt.snapshot;
    if (initialSnapshot?.finalUrl) {
        enqueueCandidate(initialSnapshot.finalUrl);
    }
    if (initialSnapshot?.ok && !isFeedSnapshot(initialSnapshot)) {
        extractFeedLinksFromHtml(initialSnapshot.body, initialSnapshot.finalUrl)
            .forEach((candidate) => enqueueCandidate(candidate));
    }

    buildGuessedFeedUrls(parsedUrl).forEach((candidate) => enqueueCandidate(candidate));

    const discovered: string[] = [];
    const warnings: FeedDetectionWarning[] = [];

    for (const candidate of candidates) {
        const attempt = await probeCandidate(candidate);
        const snapshot = attempt.snapshot;
        if (!snapshot) {
            warnings.push({
                url: candidate,
                status: null,
                reason: attempt.errorReason ?? 'network_error',
            });
            continue;
        }

        if (!snapshot.ok) {
            warnings.push({
                url: candidate,
                status: snapshot.status,
                reason: 'http_error',
            });
            continue;
        }

        if (!isFeedSnapshot(snapshot)) {
            warnings.push({
                url: candidate,
                status: snapshot.status,
                reason: 'not_feed',
            });
            continue;
        }

        discovered.push(snapshot.finalUrl);
    }

    const feeds = uniqueUrls(discovered);

    return NextResponse.json({
        detected: feeds.length > 0,
        feed_urls: feeds,
        checked_url: parsedUrl.href,
        warnings,
    });
}
