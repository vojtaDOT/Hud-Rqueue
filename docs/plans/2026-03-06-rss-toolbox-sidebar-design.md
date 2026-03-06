# RSS Toolbox Sidebar Design

## Problem

The right sidebar (workflow builder) is hard-coded to Path strategy only. When the user clicks "Detekovat RSS", three things break:

1. `baseUrl` gets overwritten with the feed URL — iframe shows raw XML instead of the original HTML page
2. RSS config panels live in the top form bar — invisible next to the iframe, requires scrolling
3. No clear visual separation between Path (scraping workflow) and RSS (feed detection) modes

## Design

### Core idea

The right sidebar becomes a **tabbed toolbox** with two modes: **Path** (current workflow builder) and **RSS** (feed detection + configuration). Clicking the RSS tab auto-sets `crawlStrategy = 'rss'`. Clicking Path sets it back to `'list'`.

### Layout

```
┌─────────────── form (top bar) ──────────────────┐
│  Name, URL, Strategy, "Ulozit zdroj"            │
│  (RSS panels REMOVED from here)                 │
└──────────────────────────────────────────────────┘
┌────────────── flex-1 (bottom) ───────────────────┐
│ ┌── iframe (75%) ──────┐ ┌── toolbox (25%) ────┐ │
│ │                      │ │ [Path] [RSS]  tabs  │ │
│ │  always shows the    │ │                     │ │
│ │  original HTML page  │ │  RSS tab content:   │ │
│ │  (baseUrl never      │ │  - Detect button    │ │
│ │   overwritten)       │ │  - Probe results    │ │
│ │                      │ │  - Feed selector    │ │
│ │                      │ │  - Feed preview     │ │
│ │                      │ │  - Authoring panel  │ │
│ │                      │ │  - Scraper summary  │ │
│ └──────────────────────┘ └─────────────────────┘ │
└──────────────────────────────────────────────────┘
```

### Tab behavior

- **Path tab**: renders existing `SimulatorSidebar` (workflow builder) unchanged. Sets `crawlStrategy = 'list'`.
- **RSS tab**: renders new `RssToolboxPanel`. Sets `crawlStrategy = 'rss'`. Shows "Detekovat RSS" button. After detection, shows probe results, feed selector, preview, authoring config, scraper summary.
- Active tab syncs with `crawlStrategy` state — switching strategy dropdown also switches tab.
- Tab indicator uses primary color accent for active state.

### baseUrl fix

`baseUrl` stays as the original page URL always. New separate `selectedRssFeed` state holds the detected feed URL. Changes:
- `autoDetectOnUrl`: stop calling `setBaseUrl(feedUrls[0])`, only set `selectedRssFeed` + `setCrawlStrategy('rss')`
- `applySelectedRssFeed`: stop calling `setBaseUrl(selectedRssFeed)`, just set strategy
- Submit: pass `selectedRssFeed` as `feed_url` to `buildRssSourceConfig` (already done)

### RSS toolbox panel content (scrollable)

1. **Detect button** — prominent "Detekovat RSS" button at top, disabled when no valid URL
2. **Probe results** — detected candidates with confidence badges, clickable to select
3. **Feed selector** — dropdown when multiple feeds found
4. **Feed preview** — parsed feed title, item count, last 3 items with dates
5. **Authoring panel** — switches: HTML storage, Playwright, CSS selector input
6. **Scraper summary** — human-readable summary + collapsible JSON preview

### Components

- `ToolboxTabs` — tab switcher in sidebar header using shadcn Tabs
- `RssToolboxPanel` — scrollable container for all RSS content in sidebar
- Reuse existing: `RssProbeResultsPanel`, `RssAuthoringPanel`, `RssScraperSummaryPanel`, `RssPreviewPanel`
- Move "Detekovat RSS" button from top form into RSS toolbox panel
- `RssDetectionPanel` (feed dropdown) embedded inline in toolbox

### Files changed

| File | Change |
|------|--------|
| `source-simulator-layout.tsx` | Accept `toolboxContent` prop, render it instead of SimulatorSidebar when provided |
| `source-editor-container.tsx` | Conditionally pass RSS toolbox as sidebar content; remove RSS panels from form; sync tab with strategy |
| `use-rss-detection.ts` | Stop overwriting baseUrl in autoDetect and applySelectedRssFeed |
| `source-metadata-form.tsx` | Remove rssPanel/rssPreviewPanel slots, simplify form |
| New: `rss-toolbox-panel.tsx` | Scrollable RSS sidebar with all panels |
| New: `toolbox-tabs.tsx` | Path/RSS tab switcher component |

### Styling

- Dark-first, theme tokens only (no hardcoded colors)
- Tab active: `text-primary border-primary`, inactive: `text-muted-foreground`
- Sidebar scrollable with `overflow-y-auto`
- Compact spacing to fit panels in sidebar width (~25% of viewport)
