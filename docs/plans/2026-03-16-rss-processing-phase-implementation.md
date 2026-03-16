# RSS Processing Phase Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a `single_page` toggle and processing config to RSS sources so workers can visit source_url pages and extract document URLs from them.

**Architecture:** Extend `RssCrawlParamsV1` (schema_version: 1) with `single_page` boolean and optional `processing` object. Extend the RSS authoring panel UI with a switch and CSS selector fields. Update config builder, template, validation, and restore flow.

**Tech Stack:** TypeScript, React 19, Next.js 16, Zod, shadcn/ui, json-e templates

---

### Task 1: Add RssProcessingConfig type and extend RssCrawlParamsV1

**Files:**
- Modify: `src/lib/crawler-types.ts:227-241`

**Step 1: Add the RssProcessingConfig interface**

Above `RssCrawlParamsV1` (line 227), add:

```typescript
export interface RssProcessingConfig {
    document_url_selector: string;
    document_url_extract: 'href' | 'text';
    filename_selector?: string;
    filename_extract?: 'href' | 'text';
    use_playwright?: boolean;
}
```

**Step 2: Extend RssCrawlParamsV1**

Change lines 227-241 to:

```typescript
export interface RssCrawlParamsV1 extends Partial<WorkerContractMetadataV11> {
    schema_version: 1;
    strategy: 'rss';
    feed_url: string;
    item_identity: 'link_then_guid';
    single_page?: boolean;
    route: {
        emit_to: 'source_urls' | 'documents';
    };
    fetch: {
        timeout_ms: number;
    };
    processing?: RssProcessingConfig;
    allow_html_documents?: boolean;
    use_playwright?: boolean;
    entry_link_selector?: string;
}
```

**Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit 2>&1 | grep -c "error TS"` — expect same count as before (5 pre-existing errors, none new).

**Step 4: Commit**

```
feat: add RssProcessingConfig type and extend RssCrawlParamsV1
```

---

### Task 2: Extend RssAuthoringValues and RssAuthoringPanel UI

**Files:**
- Modify: `src/components/sources/rss-authoring-panel.tsx:1-88`

**Step 1: Extend the RssAuthoringValues interface**

Change lines 9-13 to:

```typescript
export interface RssAuthoringValues {
    singlePage: boolean;
    allowHtmlDocuments: boolean;
    usePlaywright: boolean;
    entryLinkSelector: string;
    documentUrlSelector: string;
    documentUrlExtract: 'href' | 'text';
    filenameSelector: string;
    filenameExtract: 'href' | 'text';
    processingUsePlaywright: boolean;
}
```

**Step 2: Add imports for new UI components**

Add to imports:

```typescript
import { Link2, Type } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
```

**Step 3: Add singlePage switch at top of panel + processing section**

After the opening `<div>` with "Nastaveni RSS scraperu" heading, add the singlePage switch as the first control. Then add a processing section that shows when `!values.singlePage`:

```tsx
{/* single_page toggle */}
<div className="flex items-center justify-between gap-3">
    <div className="flex items-center gap-2 min-w-0">
        <Link2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <Label htmlFor="rss-single-page" className="text-sm text-foreground cursor-pointer">
            Primo dokumenty (RSS linky = soubory)
        </Label>
    </div>
    <Switch
        id="rss-single-page"
        checked={values.singlePage}
        onCheckedChange={(checked) =>
            onChange({ ...values, singlePage: checked })
        }
    />
</div>

{/* Processing section — shown when singlePage is OFF */}
{!values.singlePage && (
    <div className="rounded border border-primary/20 bg-primary/5 p-2.5 space-y-2.5">
        <p className="text-[10px] font-medium text-primary uppercase tracking-wider">
            Extrakce dokumentu ze stranky
        </p>

        {/* document_url_selector + extract type */}
        <div className="space-y-1">
            <Label htmlFor="rss-doc-selector" className="text-xs text-foreground">
                CSS selektor pro dokument URL
            </Label>
            <div className="flex gap-2">
                <Input
                    id="rss-doc-selector"
                    value={values.documentUrlSelector}
                    onChange={(e) => onChange({ ...values, documentUrlSelector: e.target.value })}
                    placeholder='napr. a[href$=".pdf"]'
                    className="text-sm flex-1"
                />
                <Select
                    value={values.documentUrlExtract}
                    onValueChange={(v) => onChange({ ...values, documentUrlExtract: v as 'href' | 'text' })}
                >
                    <SelectTrigger className="w-24 text-xs">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="href">href</SelectItem>
                        <SelectItem value="text">text</SelectItem>
                    </SelectContent>
                </Select>
            </div>
        </div>

        {/* filename_selector + extract type */}
        <div className="space-y-1">
            <Label htmlFor="rss-filename-selector" className="text-xs text-foreground">
                CSS selektor pro nazev souboru (volitelne)
            </Label>
            <div className="flex gap-2">
                <Input
                    id="rss-filename-selector"
                    value={values.filenameSelector}
                    onChange={(e) => onChange({ ...values, filenameSelector: e.target.value })}
                    placeholder="napr. span.filename"
                    className="text-sm flex-1"
                />
                <Select
                    value={values.filenameExtract}
                    onValueChange={(v) => onChange({ ...values, filenameExtract: v as 'href' | 'text' })}
                >
                    <SelectTrigger className="w-24 text-xs">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="href">href</SelectItem>
                        <SelectItem value="text">text</SelectItem>
                    </SelectContent>
                </Select>
            </div>
        </div>

        {/* processing playwright */}
        <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
                <Globe className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <Label htmlFor="rss-proc-playwright" className="text-xs text-foreground cursor-pointer">
                    Playwright pro source stranku
                </Label>
            </div>
            <Switch
                id="rss-proc-playwright"
                checked={values.processingUsePlaywright}
                onCheckedChange={(checked) =>
                    onChange({ ...values, processingUsePlaywright: checked })
                }
            />
        </div>
    </div>
)}
```

**Step 4: Verify TypeScript compiles**

Run: `npx tsc --noEmit 2>&1 | grep "rss-authoring"` — expect errors only from consumers not yet updated (source-editor-container).

**Step 5: Commit**

```
feat: extend RssAuthoringPanel with singlePage toggle and processing fields
```

---

### Task 3: Update DEFAULT_RSS_AUTHORING and restore flow in source-editor-container

**Files:**
- Modify: `src/components/sources/source-editor-container.tsx:41-45,156-186,257-264`

**Step 1: Update DEFAULT_RSS_AUTHORING (line 41-45)**

```typescript
const DEFAULT_RSS_AUTHORING: RssAuthoringValues = {
    singlePage: true,
    allowHtmlDocuments: false,
    usePlaywright: false,
    entryLinkSelector: '',
    documentUrlSelector: '',
    documentUrlExtract: 'href',
    filenameSelector: '',
    filenameExtract: 'text',
    processingUsePlaywright: false,
};
```

**Step 2: Update rssSummary useMemo (line 156-167)**

Add the new fields to the `buildRssAuthoringSummary` call:

```typescript
const rssSummary = useMemo(() => {
    if (crawlStrategy !== 'rss') return '';
    const feedUrl = selectedRssFeed || baseUrl;
    if (!feedUrl) return '';
    return buildRssAuthoringSummary({
        feedUrl,
        singlePage: rssAuthoring.singlePage,
        allowHtmlDocuments: rssAuthoring.allowHtmlDocuments,
        usePlaywright: rssAuthoring.usePlaywright,
        entryLinkSelector: rssAuthoring.entryLinkSelector,
        documentUrlSelector: rssAuthoring.documentUrlSelector,
    });
}, [crawlStrategy, selectedRssFeed, baseUrl, rssAuthoring]);
```

**Step 3: Update rssConfigPreview useMemo (line 169-186)**

Pass new fields to `buildRssSourceConfig`:

```typescript
const rssConfigPreview = useMemo(() => {
    if (crawlStrategy !== 'rss') return null;
    const feedUrl = (selectedRssFeed || baseUrl).trim();
    if (!feedUrl || !/^https?:\/\//.test(feedUrl)) return null;
    try {
        return buildRssSourceConfig({
            feedUrl,
            detectedFeedCandidates: rssFeedOptions,
            warnings: rssWarnings,
            singlePage: rssAuthoring.singlePage,
            allowHtmlDocuments: rssAuthoring.allowHtmlDocuments,
            usePlaywright: rssAuthoring.usePlaywright,
            entryLinkSelector: rssAuthoring.entryLinkSelector,
            documentUrlSelector: rssAuthoring.documentUrlSelector,
            documentUrlExtract: rssAuthoring.documentUrlExtract,
            filenameSelector: rssAuthoring.filenameSelector,
            filenameExtract: rssAuthoring.filenameExtract,
            processingUsePlaywright: rssAuthoring.processingUsePlaywright,
            probeResult,
        });
    } catch {
        return null;
    }
}, [crawlStrategy, selectedRssFeed, baseUrl, rssFeedOptions, rssWarnings, rssAuthoring, probeResult]);
```

**Step 4: Update restore flow (line 257-264)**

Restore new fields from `crawl_params.processing`:

```typescript
if (loadedSource.crawl_strategy === 'rss' && loadedSource.crawl_params) {
    const cp = loadedSource.crawl_params as Record<string, unknown>;
    const processing = (cp.processing ?? {}) as Record<string, unknown>;
    setRssAuthoring({
        singlePage: cp.single_page !== false,
        allowHtmlDocuments: cp.allow_html_documents === true,
        usePlaywright: cp.use_playwright === true,
        entryLinkSelector: typeof cp.entry_link_selector === 'string' ? cp.entry_link_selector : '',
        documentUrlSelector: typeof processing.document_url_selector === 'string' ? processing.document_url_selector : '',
        documentUrlExtract: processing.document_url_extract === 'text' ? 'text' : 'href',
        filenameSelector: typeof processing.filename_selector === 'string' ? processing.filename_selector : '',
        filenameExtract: processing.filename_extract === 'text' ? 'text' : 'href',
        processingUsePlaywright: processing.use_playwright === true,
    });
}
```

**Step 5: Commit**

```
feat: wire new RSS authoring values in source-editor-container
```

---

### Task 4: Update buildRssSourceConfig and buildRssAuthoringSummary

**Files:**
- Modify: `src/lib/source-config.ts:213-293`

**Step 1: Update buildRssSourceConfig input interface and logic (line 213-264)**

Extend the input type and build `processing` + `single_page` into crawl_params:

```typescript
export function buildRssSourceConfig(input: {
    feedUrl: string;
    detectedFeedCandidates?: string[];
    warnings?: RssDetectionWarningLike[];
    singlePage?: boolean;
    allowHtmlDocuments?: boolean;
    usePlaywright?: boolean;
    entryLinkSelector?: string;
    documentUrlSelector?: string;
    documentUrlExtract?: 'href' | 'text';
    filenameSelector?: string;
    filenameExtract?: 'href' | 'text';
    processingUsePlaywright?: boolean;
    probeResult?: RssProbeResult | null;
}): {
    crawl_params: RssCrawlParamsV1;
    extraction_data: SourceRssExtractionDataV1;
} {
    const feedUrl = input.feedUrl.trim();
    const detectedFeedCandidates = (input.detectedFeedCandidates ?? []).map((item) => item.trim()).filter(Boolean);
    const warnings = input.warnings ?? [];
    const singlePage = input.singlePage ?? true;
    const allowHtmlDocuments = input.allowHtmlDocuments ?? false;
    const usePlaywright = input.usePlaywright ?? false;
    const entryLinkSelector = (input.entryLinkSelector ?? '').trim();

    const summary = buildRssAuthoringSummary({
        feedUrl,
        singlePage,
        allowHtmlDocuments,
        usePlaywright,
        entryLinkSelector,
        documentUrlSelector: input.documentUrlSelector ?? '',
    });

    const extractionData = renderTemplate<SourceRssExtractionDataWithNullableProbe>(
        EXTRACTION_DATA_RSS_TEMPLATE as unknown as Record<string, unknown>,
        {
            feed_url: feedUrl,
            detected_feed_candidates: detectedFeedCandidates,
            warnings,
            probe_result: input.probeResult ?? null,
            authoring_summary: summary,
            selected_preset: 'rss_v1',
        },
    );

    // Build processing config when not single_page
    const processing = !singlePage && input.documentUrlSelector?.trim()
        ? {
            document_url_selector: input.documentUrlSelector.trim(),
            document_url_extract: input.documentUrlExtract ?? 'href',
            ...(input.filenameSelector?.trim() ? {
                filename_selector: input.filenameSelector.trim(),
                filename_extract: input.filenameExtract ?? 'text',
            } : {}),
            ...(input.processingUsePlaywright ? { use_playwright: true } : {}),
        }
        : undefined;

    return {
        crawl_params: renderTemplate<RssCrawlParamsV1>(
            CRAWL_PARAMS_RSS_TEMPLATE as unknown as Record<string, unknown>,
            {
                contract_metadata: { ...WORKER_CONTRACT_METADATA_V11 },
                feed_url: feedUrl,
                single_page: singlePage,
                emit_to: singlePage ? 'documents' : 'source_urls',
                allow_html_documents: allowHtmlDocuments,
                use_playwright: usePlaywright,
                entry_link_selector: entryLinkSelector,
                processing: processing ?? null,
            },
        ),
        extraction_data: normalizeRssExtractionData(extractionData),
    };
}
```

**Step 2: Update buildRssAuthoringSummary (line 266-293)**

```typescript
export function buildRssAuthoringSummary(input: {
    feedUrl: string;
    singlePage?: boolean;
    allowHtmlDocuments: boolean;
    usePlaywright: boolean;
    entryLinkSelector: string;
    documentUrlSelector?: string;
}): string {
    const singlePage = input.singlePage ?? true;
    const parts: string[] = [
        'Detect feed',
        'Use RSS strategy',
    ];

    if (singlePage) {
        parts.push('Primo dokumenty');
    } else {
        parts.push('Discover per entry → Source URL');
        if (input.documentUrlSelector?.trim()) {
            parts.push(`Extrakce dokumentu via "${input.documentUrlSelector.trim()}"`);
        }
    }

    if (input.entryLinkSelector) {
        parts.push(`Follow detail page via "${input.entryLinkSelector}"`);
    }

    if (input.allowHtmlDocuments) {
        parts.push('Store HTML pages');
    }

    if (input.usePlaywright) {
        parts.push('Use Playwright for rendering');
    }

    return parts.join(' → ');
}
```

**Step 3: Commit**

```
feat: update RSS config builder with single_page and processing support
```

---

### Task 5: Update CRAWL_PARAMS_RSS_TEMPLATE

**Files:**
- Modify: `src/lib/templates/crawl-params-rss.template.ts:1-37`

**Step 1: Add single_page, emit_to, and conditional processing to template**

```typescript
export const CRAWL_PARAMS_RSS_TEMPLATE = {
    $merge: [
        { $eval: 'contract_metadata' },
        {
            schema_version: 1,
            strategy: 'rss',
            feed_url: { $eval: 'feed_url' },
            item_identity: 'link_then_guid',
            single_page: { $eval: 'single_page' },
            route: { emit_to: { $eval: 'emit_to' } },
            fetch: { timeout_ms: 8000 },
            allow_html_documents: { $eval: 'allow_html_documents' },
            use_playwright: { $eval: 'use_playwright' },
        },
        {
            $if: 'entry_link_selector != ""',
            then: { entry_link_selector: { $eval: 'entry_link_selector' } },
        },
        {
            $if: 'processing != null',
            then: { processing: { $eval: 'processing' } },
        },
    ],
} as const;

export interface CrawlParamsRssContext {
    contract_metadata: Record<string, unknown>;
    feed_url: string;
    single_page: boolean;
    emit_to: 'source_urls' | 'documents';
    allow_html_documents: boolean;
    use_playwright: boolean;
    entry_link_selector: string;
    processing: Record<string, unknown> | null;
}
```

**Step 2: Commit**

```
feat: extend RSS crawl_params template with processing support
```

---

### Task 6: Update Zod validation schema

**Files:**
- Modify: `src/lib/source-config.ts:122-137`

**Step 1: Update RssCrawlParamsSchema**

```typescript
const RssProcessingConfigSchema = z.object({
    document_url_selector: z.string().trim().min(1),
    document_url_extract: z.enum(['href', 'text']),
    filename_selector: z.string().trim().optional(),
    filename_extract: z.enum(['href', 'text']).optional(),
    use_playwright: z.boolean().optional(),
}).strict();

const RssCrawlParamsSchema = z.object({
    schema_version: z.literal(1),
    strategy: z.literal('rss'),
    feed_url: UrlSchema,
    item_identity: z.literal('link_then_guid'),
    single_page: z.boolean().optional().default(true),
    route: z.object({
        emit_to: z.enum(['source_urls', 'documents']),
    }).strict(),
    fetch: z.object({
        timeout_ms: z.number().int().min(1),
    }).strict(),
    processing: RssProcessingConfigSchema.optional(),
    allow_html_documents: z.boolean().optional().default(false),
    use_playwright: z.boolean().optional().default(false),
    entry_link_selector: z.string().trim().optional(),
    ...ContractMetadataShape,
}).passthrough();
```

**Step 2: Commit**

```
feat: update Zod schema for RSS processing validation
```

---

### Task 7: Update use-source-submit hook

**Files:**
- Modify: `src/components/sources/hooks/use-source-submit.ts:124-134`

**Step 1: Pass new authoring fields to buildRssSourceConfig**

```typescript
const rssConfig = buildRssSourceConfig({
    feedUrl,
    detectedFeedCandidates: rssFeedOptions,
    warnings: rssWarnings,
    singlePage: rssAuthoring?.singlePage,
    allowHtmlDocuments: rssAuthoring?.allowHtmlDocuments,
    usePlaywright: rssAuthoring?.usePlaywright,
    entryLinkSelector: rssAuthoring?.entryLinkSelector,
    documentUrlSelector: rssAuthoring?.documentUrlSelector,
    documentUrlExtract: rssAuthoring?.documentUrlExtract,
    filenameSelector: rssAuthoring?.filenameSelector,
    filenameExtract: rssAuthoring?.filenameExtract,
    processingUsePlaywright: rssAuthoring?.processingUsePlaywright,
    probeResult: probeResult ?? null,
});
```

**Step 2: Commit**

```
feat: pass processing fields through use-source-submit
```

---

### Task 8: Verify end-to-end

**Step 1: TypeScript check**

Run: `npx tsc --noEmit` — expect no new errors.

**Step 2: Lint check**

Run: `npm run lint` — expect clean or pre-existing issues only.

**Step 3: Manual verification**

1. Open http://localhost:3000/sources
2. Switch to RSS strategy
3. Verify "Primo dokumenty" switch appears (default ON)
4. Toggle OFF → processing section appears with document URL selector + extract type
5. Fill in `a[href$=".pdf"]` and check JSON preview shows `processing` object
6. Toggle back ON → processing section disappears, JSON preview shows `single_page: true`

**Step 4: Final commit**

```
feat: RSS processing phase — single_page toggle with document URL extraction
```
