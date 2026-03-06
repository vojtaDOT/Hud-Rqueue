import { NextRequest, NextResponse } from 'next/server';

import type {
    RssDiscoveryMethod,
    RssFeedType,
    RssProbeCandidate,
    RssProbeResult,
} from '@/lib/source-config';

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

interface CandidateEntry {
    url: string;
    discoveryMethod: RssDiscoveryMethod;
}

function normalizeUrl(value: string): string {
    try {
        return new URL(value).href;
    } catch {
        return value;
    }
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

function detectFeedType(body: string): RssFeedType {
    if (/<rss[\s>]/i.test(body)) return 'rss2';
    if (/<feed[\s>]/i.test(body) && /xmlns.*atom/i.test(body)) return 'atom';
    if (/<rdf:RDF[\s>]/i.test(body)) return 'rdf';
    return 'unknown';
}

function extractFeedTitle(body: string): string | null {
    const channelTitleMatch = body.match(/<channel[^>]*>[\s\S]*?<title[^>]*>([^<]+)<\/title>/i);
    if (channelTitleMatch) return channelTitleMatch[1].trim();
    const feedTitleMatch = body.match(/<feed[^>]*>[\s\S]*?<title[^>]*>([^<]+)<\/title>/i);
    if (feedTitleMatch) return feedTitleMatch[1].trim();
    return null;
}

function computeConfidence(discoveryMethod: RssDiscoveryMethod, sameOrigin: boolean): number {
    const base: Record<RssDiscoveryMethod, number> = {
        direct_feed: 0.98,
        link_alternate: 0.95,
        anchor_href: 0.80,
        common_path: 0.70,
    };
    const score = base[discoveryMethod];
    return sameOrigin ? score : Math.max(score - 0.10, 0.50);
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

function extractFeedLinksFromHtml(html: string, baseUrl: string): CandidateEntry[] {
    const discovered: CandidateEntry[] = [];
    const seen = new Set<string>();

    const addUnique = (url: string, method: RssDiscoveryMethod) => {
        const normalized = normalizeUrl(url);
        if (seen.has(normalized)) return;
        seen.add(normalized);
        discovered.push({ url: normalized, discoveryMethod: method });
    };

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
            addUnique(resolved, 'link_alternate');
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
            addUnique(resolved, 'anchor_href');
        }
    }

    return discovered;
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
        const body = (await response.text()).slice(0, 65536);

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

function buildGuessedFeedUrls(url: URL): CandidateEntry[] {
    const guessed: string[] = [...COMMON_FEED_PATHS];
    const trimmedPath = url.pathname.replace(/\/+$/, '');

    if (trimmedPath && trimmedPath !== '/') {
        guessed.push(`${trimmedPath}/feed`);
        guessed.push(`${trimmedPath}/rss`);
        guessed.push(`${trimmedPath}/rss.xml`);
        guessed.push(`${trimmedPath}/atom.xml`);
    }

    const seen = new Set<string>();
    const entries: CandidateEntry[] = [];
    for (const path of guessed) {
        const resolved = resolveUrl(path, url.origin);
        if (!resolved) continue;
        const normalized = normalizeUrl(resolved);
        if (seen.has(normalized)) continue;
        seen.add(normalized);
        entries.push({ url: normalized, discoveryMethod: 'common_path' });
    }
    return entries;
}

async function withConcurrency<T>(items: T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
    const executing = new Set<Promise<void>>();
    for (const item of items) {
        const p = fn(item).then(() => { executing.delete(p); });
        executing.add(p);
        if (executing.size >= limit) {
            await Promise.race(executing);
        }
    }
    await Promise.all(executing);
}

function isSameOrigin(candidateUrl: string, baseUrl: URL): boolean {
    try {
        return new URL(candidateUrl).origin === baseUrl.origin;
    } catch {
        return false;
    }
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
    const candidateEntries: CandidateEntry[] = [];
    const enqueueCandidate = (entry: CandidateEntry) => {
        const normalized = normalizeUrl(entry.url);
        if (candidateSet.has(normalized)) return;
        candidateSet.add(normalized);
        candidateEntries.push({ url: normalized, discoveryMethod: entry.discoveryMethod });
    };

    enqueueCandidate({ url: parsedUrl.href, discoveryMethod: 'direct_feed' });

    const attemptCache = new Map<string, FetchAttemptResult>();
    const probeCandidate = async (url: string, timeoutMs = 6000): Promise<FetchAttemptResult> => {
        const normalized = normalizeUrl(url);
        const cached = attemptCache.get(normalized);
        if (cached) return cached;
        const attempt = await fetchSnapshot(normalized, timeoutMs);
        attemptCache.set(normalized, attempt);
        return attempt;
    };

    const initialAttempt = await probeCandidate(parsedUrl.href, 8000);
    const initialSnapshot = initialAttempt.snapshot;

    let pageKind: RssProbeResult['page_kind'] = 'error';
    if (initialSnapshot?.ok) {
        pageKind = isFeedSnapshot(initialSnapshot) ? 'feed' : 'html';
    }

    if (initialSnapshot?.finalUrl) {
        enqueueCandidate({ url: initialSnapshot.finalUrl, discoveryMethod: 'direct_feed' });
    }
    if (initialSnapshot?.ok && !isFeedSnapshot(initialSnapshot)) {
        for (const entry of extractFeedLinksFromHtml(initialSnapshot.body, initialSnapshot.finalUrl)) {
            enqueueCandidate(entry);
        }
    }

    for (const entry of buildGuessedFeedUrls(parsedUrl)) {
        enqueueCandidate(entry);
    }

    const discoveredCandidates: RssProbeCandidate[] = [];
    const warnings: FeedDetectionWarning[] = [];

    await withConcurrency(candidateEntries, 4, async (entry) => {
        const attempt = await probeCandidate(entry.url);
        const snapshot = attempt.snapshot;
        if (!snapshot) {
            warnings.push({
                url: entry.url,
                status: null,
                reason: attempt.errorReason ?? 'network_error',
            });
            return;
        }
        if (!snapshot.ok) {
            warnings.push({ url: entry.url, status: snapshot.status, reason: 'http_error' });
            return;
        }
        if (!isFeedSnapshot(snapshot)) {
            warnings.push({ url: entry.url, status: snapshot.status, reason: 'not_feed' });
            return;
        }

        const sameOrigin = isSameOrigin(snapshot.finalUrl, parsedUrl);
        const feedType = detectFeedType(snapshot.body);
        const title = extractFeedTitle(snapshot.body);
        const confidence = computeConfidence(entry.discoveryMethod, sameOrigin);

        discoveredCandidates.push({
            feed_url: snapshot.finalUrl,
            feed_type: feedType,
            confidence,
            discovery_method: entry.discoveryMethod,
            content_type: snapshot.contentType,
            title,
            same_origin: sameOrigin,
        });
    });

    discoveredCandidates.sort((a, b) => b.confidence - a.confidence);

    const selectedCandidate = discoveredCandidates.length > 0 ? discoveredCandidates[0] : null;

    const probeResult: RssProbeResult = {
        canonical_url: initialSnapshot?.finalUrl ?? parsedUrl.href,
        page_kind: pageKind,
        selected_candidate: selectedCandidate,
        candidates: discoveredCandidates,
        warnings,
    };

    const feedUrls = discoveredCandidates.map((c) => c.feed_url);

    return NextResponse.json({
        detected: feedUrls.length > 0,
        feed_urls: feedUrls,
        checked_url: parsedUrl.href,
        warnings,
        probe_result: probeResult,
    });
}
