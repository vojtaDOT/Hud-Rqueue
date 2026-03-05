# Sources Page — Full Polish Design

**Date:** 2026-03-05
**Status:** Approved
**Scope:** Dead code removal, sidebar decomposition, RSS polish, source edit flow, UX improvements

---

## Context

The sources page (`/sources`) is functionally complete — form, simulator frame, workflow builder, RSS detection, validation, export, and persistence all work end-to-end across ~40 files. However it has accumulated Gen 1 dead code, UX rough edges, duplicated types, and a 1957-line monolith sidebar. The page is also create-only with no way to edit existing sources.

This design covers a full polish pass: cleanup, decomposition, RSS improvements, edit flow, and minor UX fixes.

---

## Section 1: Dead Code Removal & Type Hygiene

**Risk: Low | Impact: High (cleaner codebase)**

### Delete entirely
- `src/components/simulator/steps/` (6 files: click-config, extract-config, pagination-config, remove-element-config, select-config, source-config) — zero import sites
- `src/components/source-editor.tsx` — unnecessary 7-line pass-through wrapper

### Strip Gen 1 types from `crawler-types.ts`
Remove: `PageType`, `ElementSelector`, `SelectStep`, `ExtractStep`, `ClickStep`, `PaginationStep`, `SourceStep`, `CrawlerConfig`, `ScrapyConfig`, `PlaywrightConfig`, `HierarchicalStep`, `HierarchicalSource`, `HierarchicalCrawlerConfig`, `WorkflowData`

### Strip Gen 1 functions from `crawler-export.ts`
Remove: `exportToScrapy`, `exportToPlaywright`, `generateCrawlerConfig`, `exportConfigToJSON`, `generateHierarchicalConfig`, `exportHierarchicalJSON`, `workflowToJSON`, `blockToHierarchicalStep`, `generateWorkerRuntimeConfig` alias

### Clean `simulator/types.ts`
Remove Gen 1 types: `BlockType`, `BlockData`, `SourceData`, `WorkflowData`. Keep Gen 2 re-exports.

### Deduplicate
- `PLAYWRIGHT_ACTION_TYPES`: define once in `crawler-types.ts`, import in `crawler-export.ts` and `workflow-tree.ts`
- `RssWarningReason`: define once in `lib/source-config.ts`, import in `components/sources/types.ts`

### Update import
- `src/app/sources/page.tsx` imports `SourceEditorContainer` directly (skip deleted wrapper)

**Estimated: ~600 lines removed, 7 files deleted**

---

## Section 2: Sidebar Full Decomposition

**Risk: Medium | Impact: High (maintainability, testability)**

### Current problem
`simulator-sidebar.tsx` is 1957 lines with interleaved state management, imperative handle, and inline render functions. Untestable as individual units.

### New file structure

```
src/components/simulator/sidebar/
├── simulator-sidebar.tsx          (~200 lines) — orchestrator + useImperativeHandle
├── hooks/
│   ├── use-workflow-state.ts      (~300 lines) — workflow CRUD, phase management
│   ├── use-focus-system.ts        (~150 lines) — focusedTarget, armedTarget, selector resolution
│   └── use-url-type-manager.ts    (~100 lines) — URL type add/rename/delete
├── workflow-tabs.tsx              (~80 lines)  — Discovery/Processing tab switcher
├── url-type-panel.tsx             (~100 lines) — URL type list + inline rename
├── before-action-renderer.tsx     (~150 lines) — Before Pipeline action list
├── repeater-step-renderer.tsx     (~150 lines) — individual repeater step config
├── scope-node-renderer.tsx        (~200 lines) — recursive scope tree
├── before-action-card.tsx         (existing)
├── repeater-step-card.tsx         (existing)
├── scope-node-card.tsx            (existing)
├── step-chooser.tsx               (existing)
└── phase-editor.tsx               (existing)
```

### Hook responsibilities

**`useWorkflowState(initialWorkflow, onChange)`**
- Owns `workflow: ScrapingWorkflow`
- Exposes: `updateWorkflowPhase()`, `addScope()`, `removeScope()`, `addRepeater()`, `removeRepeater()`, `addStep()`, `removeStep()`, `updateStep()`, `addBeforeAction()`, `removeBeforeAction()`, `updateBeforeAction()`, `moveBeforeAction()`, `clearAllPlaywrightActions()`, `hasAnyPlaywrightActions()`
- Fires `onChange` on every mutation

**`useFocusSystem()`**
- Owns `focusedTarget: FocusTarget | null`, `armedTarget: FocusTarget | null`
- Exposes: `setFocused()`, `setArmed()`, `clearArmed()`, `getResolvedTarget()`, `resolveSelectorForTarget()`
- Handles Escape key to clear armed target

**`useUrlTypeManager(workflow, updateWorkflow)`**
- Owns `activeUrlTypeId: string`
- Exposes: `addUrlType()`, `renameUrlType(id, newName)`, `deleteUrlType(id)`, `setActiveUrlType()`

### UX replacements
- `window.prompt()` for URL type rename → inline editable input (click label, Enter to save, Escape to cancel)
- `window.confirm()` for Playwright toggle → shadcn `AlertDialog`

---

## Section 3: RSS Detection & Setup Polish

**Risk: Medium | Impact: Medium (UX quality)**

### 3a. Concurrent RSS probing
- Replace sequential `for...of` in `/api/sources/rss-detect` with `Promise.allSettled()`, concurrency limit of 4
- Expected: worst case 60s → ~18s for 10 candidates

### 3b. Auto-detection flow
- **On URL blur:** auto-trigger RSS detection (background, subtle spinner by input)
- **Single feed found:** auto-apply (set feed URL, switch to `rss` strategy, disable Playwright) + toast
- **Multiple feeds:** auto-expand `RssDetectionPanel` for user selection
- **No feeds:** silent, stay on `list` strategy
- Keep manual "Detect RSS" button as fallback

### 3c. RSS feed preview
- New `GET /api/sources/rss-preview?url=` endpoint
- Fetches and parses feed XML, returns: feed title, item count, last published date, first 3 item titles
- Preview panel renders below the form when RSS strategy is selected and a feed URL is set

### 3d. Better error states
- Inline alert component below URL input (replaces toast-only feedback)
- Three states: info (no feeds found), error (URL unreachable), warning (feeds found but invalid, with reasons)

---

## Section 4: Source Edit Flow

**Risk: Medium-High | Impact: High (feature completeness)**

### 4a. Database change
- New `workflow_data JSONB` column on `sources` table
- Stores the raw `ScrapingWorkflow` JSON alongside computed `crawl_params`
- Migration via Supabase

### 4b. API routes
- **`GET /api/sources/[id]`** — returns source + workflow_data + related source_urls
- **`PUT /api/sources/[id]`** — validates via `validateSourcePayload()`, updates source, optionally updates seed source_url
- Duplicate detection skips self-match on update

### 4c. URL routing
- `/sources` = create new (current behavior)
- `/sources?edit=<source_id>` = edit mode
- `SourceEditorContainer` reads `searchParams`, triggers load on mount

### 4d. New hook: `useSourceLoad`
- Fetches source by ID from `GET /api/sources/[id]`
- Parses `workflow_data` back into `ScrapingWorkflow` for editor state
- Falls back to `crawl_params` reverse-engineering if `workflow_data` is null (legacy sources)
- Returns: `{source, workflow, loading, error}`

### 4e. Form state changes
- `useSourceSubmit` gets `editMode: boolean` — POST vs PUT
- Save button: "Uložit zdroj" (create) / "Aktualizovat zdroj" (update)
- "Nový zdroj" button in header to reset to create mode
- "Zrušit" (Cancel) button in edit mode

### 4f. Navigation
- Dashboard source list: add "Upravit" (Edit) action → `/sources?edit=<id>`
- Database page source rows: same

---

## Section 5: Remaining Polish

**Risk: Low | Impact: Medium**

### 5a. Form validation
- Add HTML `required` to Name, Source Type, Base URL inputs
- Add `type="url"` to Base URL
- Keep toast validation as secondary layer

### 5b. Duplicate detection performance
- Add unique index: `CREATE UNIQUE INDEX idx_sources_normalized_url ON sources (...)`
- Replace full-table-scan `findSourceDuplicate()` with indexed query

### 5c. Minor UX fixes
- Replace sidebar remount (`key={sidebarKey}`) with imperative `reset()` method
- Fix `use-obec-search.ts` unmount race (mounted guard)
- Increase RSS body slice 16KB → 64KB

### 5d. Crawl interval configuration
- New select field: "1 hodina", "6 hodin", "1 den" (default), "3 dny", "1 týden"
- Pass to API instead of hardcoded `'1 day'`

---

## Implementation Order

1. **Section 1** — Dead code removal (safe, unblocks cleaner work)
2. **Section 2** — Sidebar decomposition (refactor before adding features)
3. **Section 5** — Minor polish (quick wins while context is fresh)
4. **Section 3** — RSS improvements (feature enhancement)
5. **Section 4** — Source edit flow (biggest scope, depends on clean codebase)

---

## Out of Scope

- Source deletion (can be done from database page)
- Bulk source operations
- Workflow versioning/history
- Source scheduling UI (beyond crawl_interval select)
- Real-time collaboration on source editing
