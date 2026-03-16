# RSS Item Sampling Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Auto-detect document links on RSS entry pages by sampling N entries, then suggest a CSS selector to the user.

**Architecture:** New API route `POST /api/sources/rss-sample` fetches the feed, picks first 3 entries, fetches each entry page via HTTP, extracts `<a>` elements matching document patterns, and derives a common CSS selector. A new React hook + panel in the RSS toolbox surfaces results and lets the user apply the suggested selector.

**Tech Stack:** Next.js API route, regex-based RSS parsing (same as rss-preview), CSS selector heuristics, React hook + shadcn/ui components.

---

### Task 1: Add `RssSampleResult` types to `source-config.ts`

**Files:**
- Modify: `src/lib/source-config.ts` (after line 57, after `RssProbeResult`)

**Step 1: Add types**

Add after the `RssProbeResult` interface:

```ts
export interface RssSampleDocument {
    url: string;
    text: string;
    selector: string;
}

export interface RssSampleEntry {
    entryTitle: string;
    entryUrl: string;
    documents: RssSampleDocument[];
    error?: string;
}

export interface RssSampleResult {
    samples: RssSampleEntry[];
    suggestedSelector: string | null;
    totalDocuments: number;
}
```

**Step 2: Commit**

```bash
git add src/lib/source-config.ts
git commit -m "feat: add RssSampleResult types for RSS item sampling"
```

---

### Task 2: Create API route `POST /api/sources/rss-sample`

**Files:**
- Create: `src/app/api/sources/rss-sample/route.ts`

**Step 1: Create the route**

```ts
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

    // Prefer selectors that appear on 2+ pages
    const samplesWithDocs = allDocs.filter((d) => d.length > 0).length;
    const threshold = Math.max(2, Math.ceil(samplesWithDocs * 0.6));

    let best: { selector: string; count: number } | null = null;
    for (const [selector, count] of selectorCounts) {
        if (selector === 'a') continue; // skip generic fallback
        if (count >= threshold && (!best || count > best.count)) {
            best = { selector, count };
        }
    }

    if (best) return best.selector;

    // Fallback: most common extension-based selector
    const extSelectors = [...selectorCounts.entries()]
        .filter(([sel]) => sel.startsWith('a[href$='))
        .sort((a, b) => b[1] - a[1]);

    if (extSelectors.length > 0) return extSelectors[0][0];

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
```

**Step 2: Commit**

```bash
git add src/app/api/sources/rss-sample/route.ts
git commit -m "feat: add /api/sources/rss-sample endpoint"
```

---

### Task 3: Create `useRssSampling` hook

**Files:**
- Create: `src/components/sources/hooks/use-rss-sampling.ts`

**Step 1: Create the hook**

```ts
'use client';

import { useCallback, useState } from 'react';
import { toast } from 'sonner';

import type { RssSampleResult } from '@/lib/source-config';

export function useRssSampling() {
    const [sampling, setSampling] = useState(false);
    const [sampleResult, setSampleResult] = useState<RssSampleResult | null>(null);
    const [sampleError, setSampleError] = useState<string | null>(null);

    const runSampling = useCallback(async (feedUrl: string) => {
        if (!feedUrl || !/^https?:\/\//.test(feedUrl)) {
            toast.error('Neni vybran platny RSS feed');
            return;
        }

        setSampling(true);
        setSampleError(null);
        setSampleResult(null);

        try {
            const response = await fetch('/api/sources/rss-sample', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ feedUrl, sampleSize: 3 }),
            });

            if (!response.ok) {
                const data = await response.json().catch(() => ({}));
                throw new Error((data as { error?: string }).error || `HTTP ${response.status}`);
            }

            const result: RssSampleResult = await response.json();
            setSampleResult(result);

            if (result.totalDocuments > 0) {
                toast.success(
                    `Nalezeno ${result.totalDocuments} dokumentu na ${result.samples.filter((s) => s.documents.length > 0).length} strankach`,
                );
            } else {
                toast.info('Na samplovanych strankach nebyly nalezeny dokumenty');
            }
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Analyza polozek selhala';
            setSampleError(message);
            toast.error(message);
        } finally {
            setSampling(false);
        }
    }, []);

    const clearSampling = useCallback(() => {
        setSampleResult(null);
        setSampleError(null);
    }, []);

    return {
        sampling,
        sampleResult,
        sampleError,
        runSampling,
        clearSampling,
    };
}
```

**Step 2: Commit**

```bash
git add src/components/sources/hooks/use-rss-sampling.ts
git commit -m "feat: add useRssSampling hook"
```

---

### Task 4: Create `RssSampleResultsPanel` component

**Files:**
- Create: `src/components/sources/rss-sample-results-panel.tsx`

**Step 1: Create the panel**

```tsx
'use client';

import { AlertCircle, CheckCircle2, ExternalLink, FileText, Loader2, Search } from 'lucide-react';

import { Button } from '@/components/ui/button';
import type { RssSampleResult } from '@/lib/source-config';

interface RssSampleResultsPanelProps {
    sampling: boolean;
    sampleResult: RssSampleResult | null;
    sampleError: string | null;
    onRunSampling: () => void;
    onApplySelector: (selector: string) => void;
    disabled?: boolean;
}

export function RssSampleResultsPanel({
    sampling,
    sampleResult,
    sampleError,
    onRunSampling,
    onApplySelector,
    disabled,
}: RssSampleResultsPanelProps) {
    return (
        <div className="rounded-md border border-border bg-muted/30 p-3 space-y-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Analyza polozek
            </p>

            <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-full justify-center gap-1.5"
                onClick={onRunSampling}
                disabled={disabled || sampling}
            >
                {sampling ? (
                    <>
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        Analyzuji polozky...
                    </>
                ) : (
                    <>
                        <Search className="h-3.5 w-3.5" />
                        Analyzovat polozky
                    </>
                )}
            </Button>

            {sampleError && (
                <div className="flex items-center gap-1.5 text-xs text-destructive">
                    <AlertCircle className="h-3 w-3 shrink-0" />
                    {sampleError}
                </div>
            )}

            {sampleResult && (
                <div className="space-y-2">
                    {/* Summary */}
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <FileText className="h-3 w-3 shrink-0" />
                        <span>
                            {sampleResult.totalDocuments > 0
                                ? `${sampleResult.totalDocuments} dokumentu na ${sampleResult.samples.filter((s) => s.documents.length > 0).length}/${sampleResult.samples.length} strankach`
                                : 'Zadne dokumenty nenalezeny'}
                        </span>
                    </div>

                    {/* Sample cards */}
                    {sampleResult.samples.map((sample, idx) => (
                        <div
                            key={`${sample.entryUrl}-${idx}`}
                            className="rounded border border-border bg-muted/20 p-2 space-y-1"
                        >
                            <div className="flex items-center gap-1.5 min-w-0">
                                {sample.documents.length > 0 ? (
                                    <CheckCircle2 className="h-3 w-3 shrink-0 text-green-500" />
                                ) : (
                                    <AlertCircle className="h-3 w-3 shrink-0 text-muted-foreground/50" />
                                )}
                                <span className="text-xs text-foreground truncate">
                                    {sample.entryTitle || 'Bez nazvu'}
                                </span>
                            </div>
                            {sample.entryUrl && (
                                <div className="text-[10px] text-muted-foreground/70 truncate">
                                    {sample.entryUrl}
                                </div>
                            )}
                            {sample.error && (
                                <div className="text-[10px] text-destructive">{sample.error}</div>
                            )}
                            {sample.documents.length > 0 && (
                                <div className="space-y-0.5 ml-4">
                                    {sample.documents.map((doc, docIdx) => (
                                        <div
                                            key={`${doc.url}-${docIdx}`}
                                            className="flex items-center gap-1.5 text-[10px] text-muted-foreground"
                                        >
                                            <ExternalLink className="h-2.5 w-2.5 shrink-0" />
                                            <span className="truncate">{doc.text || doc.url.split('/').pop()}</span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    ))}

                    {/* Suggested selector */}
                    {sampleResult.suggestedSelector && (
                        <div className="rounded border border-primary/30 bg-primary/5 p-2 space-y-1.5">
                            <p className="text-[10px] font-medium text-primary uppercase tracking-wider">
                                Navrzeny selektor
                            </p>
                            <code className="block text-xs text-foreground bg-muted/50 rounded px-2 py-1 font-mono">
                                {sampleResult.suggestedSelector}
                            </code>
                            <Button
                                type="button"
                                size="sm"
                                className="w-full"
                                onClick={() => onApplySelector(sampleResult.suggestedSelector!)}
                            >
                                Pouzit selektor
                            </Button>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
```

**Step 2: Commit**

```bash
git add src/components/sources/rss-sample-results-panel.tsx
git commit -m "feat: add RssSampleResultsPanel component"
```

---

### Task 5: Wire sampling into `RssToolboxPanel`

**Files:**
- Modify: `src/components/sources/rss-toolbox-panel.tsx`

**Step 1: Add sampling props to interface**

Add to `RssToolboxPanelProps`:

```ts
// Sampling
sampling: boolean;
sampleResult: RssSampleResult | null;
sampleError: string | null;
onRunSampling: () => void;
onApplySuggestedSelector: (selector: string) => void;
```

Add import:

```ts
import { RssSampleResultsPanel } from '@/components/sources/rss-sample-results-panel';
import type { RssSampleResult } from '@/lib/source-config';
```

**Step 2: Add destructured props and render panel**

Add to destructured props: `sampling`, `sampleResult`, `sampleError`, `onRunSampling`, `onApplySuggestedSelector`.

Add after the `<RssAuthoringPanel>` section (after the comment `{/* 6. Authoring panel */}`), before `{/* 7. Scraper summary */}`:

```tsx
{/* 6b. Item sampling — shown when single_page is OFF */}
{!rssAuthoring.singlePage && selectedRssFeed && (
    <RssSampleResultsPanel
        sampling={sampling}
        sampleResult={sampleResult}
        sampleError={sampleError}
        onRunSampling={onRunSampling}
        onApplySelector={onApplySuggestedSelector}
        disabled={!selectedRssFeed}
    />
)}
```

**Step 3: Commit**

```bash
git add src/components/sources/rss-toolbox-panel.tsx
git commit -m "feat: wire RssSampleResultsPanel into toolbox"
```

---

### Task 6: Wire hook into `SourceEditorContainer`

**Files:**
- Modify: `src/components/sources/source-editor-container.tsx`

**Step 1: Import and instantiate hook**

Add import:

```ts
import { useRssSampling } from '@/components/sources/hooks/use-rss-sampling';
```

Instantiate near the other hooks:

```ts
const { sampling, sampleResult, sampleError, runSampling, clearSampling } = useRssSampling();
```

**Step 2: Create handler functions**

```ts
const handleRunSampling = useCallback(() => {
    const feedUrl = selectedRssFeed || baseUrl;
    void runSampling(feedUrl);
}, [selectedRssFeed, baseUrl, runSampling]);

const handleApplySuggestedSelector = useCallback((selector: string) => {
    setRssAuthoring((prev) => ({
        ...prev,
        singlePage: false,
        documentUrlSelector: selector,
        documentUrlExtract: 'href',
    }));
    toast.success('Selektor aplikovan');
}, []);
```

**Step 3: Pass to RssToolboxPanel**

Add these props to the `<RssToolboxPanel>` component:

```tsx
sampling={sampling}
sampleResult={sampleResult}
sampleError={sampleError}
onRunSampling={handleRunSampling}
onApplySuggestedSelector={handleApplySuggestedSelector}
```

**Step 4: Commit**

```bash
git add src/components/sources/source-editor-container.tsx
git commit -m "feat: wire useRssSampling into source editor"
```

---

### Task 7: Manual E2E verification

**Step 1:** Open `http://localhost:3000/sources`

**Step 2:** Enter a URL like `http://eud.praha5.cz/pub/rss/13000002/MC05AWO0A02N/` in Base URL

**Step 3:** Click RSS tab, then "Detekovat RSS"

**Step 4:** Toggle "Primo dokumenty" OFF (single_page = false)

**Step 5:** Click "Analyzovat polozky"

**Step 6:** Verify:
- Loading spinner shows during analysis
- Sample cards appear with entry titles and found documents
- Suggested selector appears (if documents found)
- "Pouzit selektor" fills the CSS selector field

**Step 7: Commit all remaining changes**

```bash
git add -A
git commit -m "feat: RSS item sampling — auto-detect documents on entry pages"
```
