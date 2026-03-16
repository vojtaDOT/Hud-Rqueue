# RSS Item Sampling — Auto-detect Documents on Entry Pages

## Problem

When RSS feed is detected with 120+ items, the user must manually guess a CSS selector for extracting documents from entry pages. This is tedious and error-prone.

## Solution

Sample N entry pages from the RSS feed, detect document links on each, and suggest a CSS selector automatically.

## API: `POST /api/sources/rss-sample`

### Request

```ts
{ feedUrl: string; sampleSize?: number } // default 3
```

### Flow

1. Fetch RSS feed, parse entries (reuse rss-preview regex parsing)
2. Take first N entries and their `<link>` URLs
3. For each URL: fetch HTML via proxy
4. On each page: find all `<a>` elements with href matching document patterns (`.pdf`, `.doc`, `.docx`, `.xlsx`, `.xls`, `.odt`, `.rtf`, `.zip`)
5. For found links: derive common CSS selector pattern across samples
6. Return results with suggested selector

### Response

```ts
interface RssSampleResult {
  samples: Array<{
    entryTitle: string;
    entryUrl: string;
    documents: Array<{
      url: string;
      text: string;
      selector: string; // CSS selector for this specific element
    }>;
    error?: string; // if page fetch failed
  }>;
  suggestedSelector: string | null; // most common shared selector across samples
  totalDocuments: number;
}
```

### Selector derivation

- Collect CSS selectors for all document links across all sampled pages
- Find the most common shared pattern (e.g. `a[href$=".pdf"]`, `table.files a`, `div.attachment a`)
- Prefer selectors that match documents on >= 2 out of 3 samples
- Fallback: generic `a[href$=".pdf"]` if no common pattern found

## UI: New section in RssToolboxPanel

### Placement

After the "Nastaveni RSS scraperu" section, when `single_page = false`.

### Components

**Button:** "Analyzovat polozky" — triggers sampling
- Disabled when no feed URL selected
- Shows spinner + progress during sampling ("Analyzuji 1/3...")

**Results panel:** `RssSampleResultsPanel`
- Card per sampled entry page showing:
  - Entry title (truncated)
  - Entry URL (truncated)
  - List of found documents (filename + type badge)
  - Error state if page fetch failed
- Summary bar: "Nalezeno X dokumentu na Y strankach"
- Suggested selector with "Pouzit" button → fills `document_url_selector` in authoring panel
- Empty state: "Na samplovanych strankach nebyly nalezeny dokumenty"

### State management

New hook: `useRssSampling(feedUrl)` returning:
- `sampleResult: RssSampleResult | null`
- `sampling: boolean`
- `sampleError: string | null`
- `runSampling(): void`

### Integration with authoring panel

When user clicks "Pouzit" on suggested selector:
- Set `document_url_selector` to `suggestedSelector`
- Set `single_page` to `false` (should already be false)
- Set `document_url_extract` to `'href'`

## Files to create/modify

### New files
- `src/app/api/sources/rss-sample/route.ts` — API endpoint
- `src/components/sources/hooks/use-rss-sampling.ts` — state hook
- `src/components/sources/rss-sample-results-panel.tsx` — results UI

### Modified files
- `src/components/sources/rss-toolbox-panel.tsx` — add sampling section
- `src/components/sources/source-editor-container.tsx` — wire hook + props
- `src/lib/source-config.ts` — add `RssSampleResult` type
