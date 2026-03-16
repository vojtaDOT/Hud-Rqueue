# RSS Processing Phase — Design

## Problem

RSS strategy (`RssCrawlParamsV1`, schema_version: 1) only handles discovery — it reads the feed, extracts `<link>` from each `<item>`, and emits them as `source_urls`. There is no processing phase to visit those source URL pages and extract document URLs (PDFs, etc.) from them.

Example: Praha 5 úřední deska RSS → each `<item><link>` points to a detail page → that page contains downloadable documents.

## Solution: Approach A — Extend RssCrawlParamsV1

Add `single_page` toggle and optional `processing` config to the existing RSS schema. Minimal changes, no schema version bump needed.

## Data Model

### New types

```typescript
export interface RssProcessingConfig {
    document_url_selector: string;        // CSS selector on source_url HTML page
    document_url_extract: 'href' | 'text'; // what to extract from matched elements
    filename_selector?: string;            // optional filename extraction
    filename_extract?: 'href' | 'text';
    use_playwright?: boolean;              // render source_url page via Playwright
}
```

### Extended RssCrawlParamsV1

```typescript
export interface RssCrawlParamsV1 {
    schema_version: 1;
    strategy: 'rss';
    feed_url: string;
    item_identity: 'link_then_guid';
    single_page: boolean;                  // NEW — true = RSS links are documents directly
    route: {
        emit_to: 'source_urls' | 'documents';  // 'documents' when single_page=true
    };
    processing?: RssProcessingConfig;      // NEW — required when single_page=false
    fetch: { timeout_ms: number };
    allow_html_documents?: boolean;
    use_playwright?: boolean;
    entry_link_selector?: string;
    // ...contract metadata
}
```

### Backwards compatibility

- Existing configs without `single_page` field default to `single_page: true` (current behavior)
- `processing` is only required when `single_page = false`

## UI — Authoring Panel Extension

### Extended RssAuthoringValues

```typescript
export interface RssAuthoringValues {
    singlePage: boolean;                    // NEW — default true
    allowHtmlDocuments: boolean;
    usePlaywright: boolean;
    entryLinkSelector: string;
    // Processing fields (visible only when singlePage=false)
    documentUrlSelector: string;            // NEW
    documentUrlExtract: 'href' | 'text';    // NEW — default 'href'
    filenameSelector: string;               // NEW
    filenameExtract: 'href' | 'text';       // NEW — default 'text'
    processingUsePlaywright: boolean;        // NEW
}
```

### Panel layout

1. **"Primo dokumenty" switch** (`singlePage`) — top of panel
   - ON (default): RSS links = direct documents
   - OFF: RSS links = source URL pages containing document links

2. **Processing section** (shown when `singlePage = false`):
   - Document URL selector (required text input) + extract type toggle (href/text)
   - Filename selector (optional text input) + extract type toggle
   - "Playwright pro source stranku" switch

3. **Existing fields** remain unchanged:
   - "Ukladat HTML stranky"
   - "Pouzit Playwright pro renderovani" (renamed to "Playwright pro RSS feed")
   - "CSS selektor pro detail stranky"

## Config Builder

`buildRssSourceConfig()` changes:

- When `singlePage = true`: `route.emit_to = 'documents'`, no `processing` field
- When `singlePage = false`: `route.emit_to = 'source_urls'`, includes `processing` object

## Template

`CRAWL_PARAMS_RSS_TEMPLATE` extends with conditional `single_page` and `processing` fields.

## Validation

Zod schema extends:
- `single_page`: `z.boolean().default(true)`
- `route.emit_to`: `z.enum(['source_urls', 'documents'])`
- `processing`: conditional — required when `single_page = false`, absent when `true`

## Summary

`buildRssAuthoringSummary()` updated:
- `single_page = true`: "RSS → Primo dokumenty"
- `single_page = false`: "RSS → Source URL → Extrakce dokumentu via 'a[href$=.pdf]'"

## Restore flow

`source-editor-container.tsx` restores `singlePage`, `documentUrlSelector`, etc. from saved `crawl_params.processing` when editing an existing source.

## Files to modify

| File | Change |
|------|--------|
| `src/lib/crawler-types.ts` | Add `RssProcessingConfig`, extend `RssCrawlParamsV1` |
| `src/components/sources/rss-authoring-panel.tsx` | Add singlePage switch + processing section UI |
| `src/lib/source-config.ts` | Extend builder, validation schema, summary |
| `src/lib/templates/crawl-params-rss.template.ts` | Add conditional processing + single_page |
| `src/components/sources/source-editor-container.tsx` | Wire new authoring values, restore from saved config |
| `src/components/sources/hooks/use-source-submit.ts` | Pass new values to builder |
