import { NextRequest, NextResponse } from 'next/server';

const REQUEST_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (compatible; HUD-Queue-RSS-Sampler/1.0)',
    'Accept': 'text/html, application/xhtml+xml, */*;q=0.8',
};

const FEED_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (compatible; HUD-Queue-RSS-Sampler/1.0)',
    'Accept': 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*;q=0.8',
};

/** File extensions considered document links */
const DOC_EXTENSIONS = /\.(pdf|doc|docx|xlsx|xls|odt|rtf|zip|rar|csv|pptx|ppt)($|\?|#)/i;

interface ParsedEntry {
    title: string;
    link: string;
}

interface FoundDocument {
    url: string;
    text: string;
    tagHtml: string;
}

// ── RSS/Atom parsing (reuse rss-preview patterns) ──

function extractTagContent(xml: string, tagName: string): string | null {
    const re = new RegExp(
        `<${tagName}[^>]*>(?:<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>|([\\s\\S]*?))</${tagName}>`,
        'i',
    );
    const m = re.exec(xml);
    if (!m) return null;
    return (m[1] ?? m[2] ?? '').trim();
}

function parseEntries(xml: string): ParsedEntry[] {
    const entries: ParsedEntry[] = [];

    // RSS 2.0 items
    const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
    let match: RegExpExecArray | null;
    while ((match = itemRegex.exec(xml)) !== null) {
        entries.push({
            title: extractTagContent(match[1], 'title') ?? '',
            link: extractTagContent(match[1], 'link') ?? '',
        });
    }

    // Atom entries (if no RSS items found)
    if (entries.length === 0) {
        const entryRegex = /<entry>([\s\S]*?)<\/entry>/gi;
        while ((match = entryRegex.exec(xml)) !== null) {
            const title = extractTagContent(match[1], 'title') ?? '';
            const altLink = /<link[^>]*\bhref=["']([^"']*)["'][^>]*\/?>/i.exec(match[1]);
            entries.push({ title, link: altLink?.[1] ?? '' });
        }
    }

    return entries;
}

// ── HTML document link extraction ──

function extractDocumentLinks(html: string, pageUrl: string): FoundDocument[] {
    const docs: FoundDocument[] = [];
    const seen = new Set<string>();
    const anchorRe = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;

    let match: RegExpExecArray | null;
    while ((match = anchorRe.exec(html)) !== null) {
        const attrs = match[1];
        const hrefMatch = /href=["']([^"']*)["']/i.exec(attrs);
        if (!hrefMatch) continue;

        const href = hrefMatch[1];
        if (!DOC_EXTENSIONS.test(href)) continue;

        let resolved: string;
        try {
            resolved = new URL(href, pageUrl).href;
        } catch {
            continue;
        }

        if (seen.has(resolved)) continue;
        seen.add(resolved);

        const text = match[2].replace(/<[^>]+>/g, '').trim();
        docs.push({ url: resolved, text, tagHtml: match[0] });
    }

    return docs;
}

// ── CSS selector derivation ──

function deriveSelector(tagHtml: string): string {
    // Try to build a specific selector from the <a> tag
    const classMatch = /class=["']([^"']*)["']/i.exec(tagHtml);
    const hrefMatch = /href=["']([^"']*)["']/i.exec(tagHtml);

    if (classMatch?.[1]) {
        const classes = classMatch[1].trim().split(/\s+/).join('.');
        return `a.${classes}`;
    }

    // Fallback: use extension pattern from href
    if (hrefMatch?.[1]) {
        const extMatch = /\.(\w+)($|\?|#)/.exec(hrefMatch[1]);
        if (extMatch) {
            return `a[href$=".${extMatch[1].toLowerCase()}"]`;
        }
    }

    return 'a';
}

function findCommonSelector(allDocs: FoundDocument[][]): string | null {
    // Collect all selectors across all samples
    const selectorCounts = new Map<string, number>();

    for (const docs of allDocs) {
        // Count unique selectors per page (not per doc)
        const pageSelectors = new Set(docs.map((d) => deriveSelector(d.tagHtml)));
        for (const sel of pageSelectors) {
            selectorCounts.set(sel, (selectorCounts.get(sel) ?? 0) + 1);
        }
    }

    // Prefer class-based selectors that appear on 2+ pages
    const samplesWithDocs = allDocs.filter((d) => d.length > 0).length;
    const threshold = Math.max(2, Math.ceil(samplesWithDocs * 0.6));

    let best: { selector: string; count: number } | null = null;
    for (const [selector, count] of selectorCounts) {
        if (selector === 'a' || selector.startsWith('a[href$=')) continue;
        if (count >= threshold && (!best || count > best.count)) {
            best = { selector, count };
        }
    }

    if (best) return best.selector;

    // Fallback: combine ALL found document extensions into one selector
    const extensions = new Set<string>();
    for (const docs of allDocs) {
        for (const doc of docs) {
            const extMatch = /\.(\w+)($|\?|#)/.exec(doc.url);
            if (extMatch) extensions.add(extMatch[1].toLowerCase());
        }
    }

    if (extensions.size > 0) {
        // Build combined selector: a[href$=".pdf"], a[href$=".doc"], ...
        const parts = [...extensions].sort().map((ext) => `a[href$=".${ext}"]`);
        return parts.join(', ');
    }

    return null;
}

// ── Fetch helpers ──

async function fetchText(url: string, headers: Record<string, string>, timeoutMs = 10000): Promise<string> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const res = await fetch(url, {
            headers,
            redirect: 'follow',
            signal: controller.signal,
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return await res.text();
    } finally {
        clearTimeout(timeoutId);
    }
}

// ── Route handler ──

export async function POST(request: NextRequest) {
    let body: { feedUrl?: string; sampleSize?: number };
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const feedUrl = body.feedUrl?.trim();
    const sampleSize = Math.min(Math.max(body.sampleSize ?? 3, 1), 5);

    if (!feedUrl || !/^https?:\/\//.test(feedUrl)) {
        return NextResponse.json({ error: 'Missing or invalid feedUrl' }, { status: 400 });
    }

    // 1. Fetch and parse feed
    let entries: ParsedEntry[];
    try {
        const xml = await fetchText(feedUrl, FEED_HEADERS);
        entries = parseEntries(xml);
    } catch (err) {
        return NextResponse.json(
            { error: `Failed to fetch feed: ${err instanceof Error ? err.message : 'unknown'}` },
            { status: 502 },
        );
    }

    if (entries.length === 0) {
        return NextResponse.json({
            samples: [],
            suggestedSelector: null,
            totalDocuments: 0,
        });
    }

    // 2. Sample first N entries
    const sampled = entries.slice(0, sampleSize);
    const allDocs: FoundDocument[][] = [];
    const samples = await Promise.all(
        sampled.map(async (entry) => {
            if (!entry.link) {
                return {
                    entryTitle: entry.title,
                    entryUrl: '',
                    documents: [],
                    error: 'No link in entry',
                };
            }

            try {
                const html = await fetchText(entry.link, REQUEST_HEADERS);
                const docs = extractDocumentLinks(html, entry.link);
                allDocs.push(docs);
                return {
                    entryTitle: entry.title,
                    entryUrl: entry.link,
                    documents: docs.map((d) => ({
                        url: d.url,
                        text: d.text,
                        selector: deriveSelector(d.tagHtml),
                    })),
                };
            } catch (err) {
                allDocs.push([]);
                return {
                    entryTitle: entry.title,
                    entryUrl: entry.link,
                    documents: [],
                    error: err instanceof Error ? err.message : 'Fetch failed',
                };
            }
        }),
    );

    // 3. Derive common selector
    const suggestedSelector = findCommonSelector(allDocs);
    const totalDocuments = samples.reduce((sum, s) => sum + s.documents.length, 0);

    return NextResponse.json({
        samples,
        suggestedSelector,
        totalDocuments,
    });
}
