# RSS Toolbox Sidebar — Implementation Plan

Design: `2026-03-06-rss-toolbox-sidebar-design.md`

## Tasks

### 1. Fix baseUrl overwrite in use-rss-detection.ts
- `autoDetectOnUrl`: replace `setBaseUrl(feedUrls[0])` with just `setSelectedRssFeed` + `setCrawlStrategy('rss')`
- `applySelectedRssFeed`: remove `setBaseUrl(selectedRssFeed)`, just set strategy
- baseUrl must always stay as the original HTML page URL

### 2. Create toolbox-tabs.tsx — Path/RSS tab switcher
- shadcn-style tabs in sidebar header
- Two tabs: "Path" (list icon) and "RSS" (rss icon)
- Active tab uses primary color accent
- Clicking tab calls `onTabChange` callback
- Compact height, fits in sidebar header area

### 3. Create rss-toolbox-panel.tsx — RSS sidebar content
- Scrollable container (`overflow-y-auto h-full`)
- Contains in order:
  1. "Detekovat RSS" button (moved from form)
  2. Detection status indicator
  3. RssProbeResultsPanel (reused)
  4. Feed selector dropdown (from RssDetectionPanel, inlined)
  5. RssPreviewPanel (reused)
  6. RssAuthoringPanel (reused)
  7. RssScraperSummaryPanel (reused)
- All compact for sidebar width
- Dark theme tokens

### 4. Update source-simulator-layout.tsx
- Add optional `sidebarContent?: ReactNode` prop
- When provided, render it in right ResizablePanel instead of SimulatorSidebar
- SimulatorSidebar stays default for Path mode

### 5. Wire everything in source-editor-container.tsx
- Add `activeToolboxTab` state synced with `crawlStrategy`
- When crawlStrategy changes → update active tab
- When tab changes → update crawlStrategy
- Pass RSS toolbox panel as `sidebarContent` when RSS tab active
- Remove rssPanel and rssPreviewPanel from SourceMetadataForm
- Remove "Detekovat RSS" button from form (moved to toolbox)
- Keep "Ulozit zdroj" button in form

### 6. Clean up source-metadata-form.tsx
- Remove `rssPanel` and `rssPreviewPanel` prop slots
- Remove "Detekovat RSS" button (moved to toolbox)
- Keep strategy dropdown (syncs with tab)

### 7. Verify build + tests
- TypeScript check
- Unit tests pass
- Visual verification on dev server
