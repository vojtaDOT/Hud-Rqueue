import { NextRequest, NextResponse } from 'next/server';

const REQUEST_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (compatible; HUD-Queue-RSS-Preview/1.0)',
    'Accept': 'application/rss+xml, application/atom+xml, application/xml, text/xml, */*;q=0.8',
};

interface FeedItem {
    title: string;
    link: string;
    pubDate: string | null;
}

interface FeedPreview {
    title: string;
    itemCount: number;
    lastPublished: string | null;
    items: FeedItem[];
}

const HTML_ENTITIES: Record<string, string> = {
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&#39;': "'",
    '&apos;': "'",
};

function decodeHtmlEntities(text: string): string {
    // Decode named entities
    let decoded = text.replace(/&(?:amp|lt|gt|quot|apos|#39);/g, (entity) => HTML_ENTITIES[entity] ?? entity);
    // Decode numeric entities (decimal &#NNN; and hex &#xHHH;)
    decoded = decoded.replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
    decoded = decoded.replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(parseInt(dec, 10)));
    return decoded;
}

function extractTagContent(xml: string, tagName: string): string | null {
    // Match both <tag>content</tag> and <tag><![CDATA[content]]></tag>
    const re = new RegExp(
        `<${tagName}[^>]*>(?:<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>|([\\s\\S]*?))</${tagName}>`,
        'i',
    );
    const m = re.exec(xml);
    if (!m) return null;
    const raw = (m[1] ?? m[2] ?? '').trim();
    return decodeHtmlEntities(raw);
}

function parseRssFeed(xml: string): FeedPreview | null {
    // RSS 2.0 — look for <channel> inside <rss>
    const channelMatch = /<channel>([\s\S]*?)<\/channel>/i.exec(xml);
    if (!channelMatch) return null;
    const channel = channelMatch[1];

    const title = extractTagContent(channel, 'title') ?? 'Untitled Feed';

    // Extract all <item> blocks from the full XML (items can be inside or outside <channel>)
    const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
    const items: FeedItem[] = [];
    let match: RegExpExecArray | null;
    while ((match = itemRegex.exec(xml)) !== null) {
        items.push({
            title: extractTagContent(match[1], 'title') ?? '',
            link: extractTagContent(match[1], 'link') ?? '',
            pubDate: extractTagContent(match[1], 'pubDate'),
        });
    }

    return {
        title,
        itemCount: items.length,
        lastPublished: items[0]?.pubDate ?? null,
        items: items.slice(0, 3),
    };
}

function parseAtomFeed(xml: string): FeedPreview | null {
    // Atom 1.0 — look for <feed> root element
    const feedMatch = /<feed[\s>]/i.exec(xml);
    if (!feedMatch) return null;

    const title = extractTagContent(xml, 'title') ?? 'Untitled Feed';

    const entryRegex = /<entry>([\s\S]*?)<\/entry>/gi;
    const items: FeedItem[] = [];
    let match: RegExpExecArray | null;
    while ((match = entryRegex.exec(xml)) !== null) {
        const entryTitle = extractTagContent(match[1], 'title') ?? '';
        // Atom uses <link href="..." /> (self-closing) or <link href="...">...</link>
        // Prefer rel="alternate" link, fall back to first link with href
        const altLinkMatch = /<link[^>]*\brel=["']alternate["'][^>]*\bhref=["']([^"']*)["'][^>]*\/?>/i.exec(match[1])
            ?? /<link[^>]*\bhref=["']([^"']*)["'][^>]*\brel=["']alternate["'][^>]*\/?>/i.exec(match[1]);
        const anyLinkMatch = /<link[^>]*\bhref=["']([^"']*)["'][^>]*\/?>/i.exec(match[1]);
        const link = altLinkMatch?.[1] ?? anyLinkMatch?.[1] ?? '';
        const pubDate = extractTagContent(match[1], 'updated')
            ?? extractTagContent(match[1], 'published');
        items.push({ title: entryTitle, link: decodeHtmlEntities(link), pubDate });
    }

    return {
        title,
        itemCount: items.length,
        lastPublished: items[0]?.pubDate ?? null,
        items: items.slice(0, 3),
    };
}

export async function GET(request: NextRequest) {
    const url = request.nextUrl.searchParams.get('url')?.trim();

    if (!url) {
        return NextResponse.json({ error: 'Missing url parameter' }, { status: 400 });
    }

    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 8000);

        const response = await fetch(url, {
            headers: REQUEST_HEADERS,
            signal: controller.signal,
            redirect: 'follow',
        });
        clearTimeout(timeoutId);

        if (!response.ok) {
            return NextResponse.json(
                { error: `Feed returned ${response.status}` },
                { status: 502 },
            );
        }

        const body = await response.text();

        // Try RSS first, then Atom
        const preview = parseRssFeed(body) ?? parseAtomFeed(body);

        if (!preview) {
            return NextResponse.json(
                { error: 'Could not parse RSS/Atom feed' },
                { status: 422 },
            );
        }

        return NextResponse.json(preview);
    } catch (error) {
        const isTimeout = (error as { name?: string }).name === 'AbortError';
        return NextResponse.json(
            { error: isTimeout ? 'Feed request timed out' : 'Failed to fetch feed' },
            { status: 502 },
        );
    }
}
