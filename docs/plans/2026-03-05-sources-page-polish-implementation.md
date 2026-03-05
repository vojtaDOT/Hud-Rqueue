# Sources Page Polish — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Clean up dead code, decompose the monolith sidebar, polish RSS detection/setup, add source editing, and fix UX rough edges across the sources page.

**Architecture:** Five sequential phases — dead code removal first (unblocks clean work), then sidebar decomposition (refactor before features), minor polish (quick wins), RSS improvements (feature enhancement), and finally source edit flow (biggest scope, depends on clean codebase).

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript 5, Tailwind CSS 4, shadcn/ui, Supabase, Vitest

**Design doc:** `docs/plans/2026-03-05-sources-page-polish-design.md`

**Existing tests:** `tests/unit/workflow-tree.test.ts`, `tests/unit/workflow-validation.test.ts`, `tests/unit/source-config.test.ts`, `tests/unit/api-sources-route.test.ts`, `tests/smoke/sources-playwright.spec.ts`

---

## Phase 1: Dead Code Removal & Type Hygiene

### Task 1.1: Delete dead simulator step components

**Files:**
- Delete: `src/components/simulator/steps/click-config.tsx`
- Delete: `src/components/simulator/steps/extract-config.tsx`
- Delete: `src/components/simulator/steps/pagination-config.tsx`
- Delete: `src/components/simulator/steps/remove-element-config.tsx`
- Delete: `src/components/simulator/steps/select-config.tsx`
- Delete: `src/components/simulator/steps/source-config.tsx`

**Step 1: Verify zero import sites**

Run: `grep -r "simulator/steps" src/ --include="*.ts" --include="*.tsx" | grep -v "node_modules"`
Expected: No results (confirming zero imports)

**Step 2: Delete the files**

```bash
rm -rf src/components/simulator/steps/
```

**Step 3: Verify build**

Run: `npm run build 2>&1 | tail -20`
Expected: Build succeeds with no errors referencing deleted files

**Step 4: Commit**

```bash
git add -A src/components/simulator/steps/
git commit -m "chore: delete dead Gen 1 simulator step components"
```

---

### Task 1.2: Clean simulator/types.ts — remove Gen 1 types

**Files:**
- Modify: `src/components/simulator/types.ts` (lines 1-25 → keep only lines 27-41)

**Step 1: Verify Gen 1 types have no importers**

Run: `grep -r "BlockType\|BlockData\|SourceData" src/ --include="*.ts" --include="*.tsx" -l`
Expected: Only `src/components/simulator/types.ts` itself

**Step 2: Replace file contents**

Keep only the Gen 2 re-exports (current lines 27-41):

```typescript
export type {
    ScrapingWorkflow,
    PhaseConfig,
    SourceUrlType,
    RepeaterStep,
    DataExtractStep,
    DownloadFileStep,
    SourceUrlStep,
    BeforeAction,
    PlaywrightAction,
    ScopeModule,
    RepeaterNode,
    PaginationConfig,
} from '@/lib/crawler-types';
```

**Step 3: Verify build**

Run: `npm run build 2>&1 | tail -20`
Expected: Build succeeds

**Step 4: Commit**

```bash
git add src/components/simulator/types.ts
git commit -m "chore: remove Gen 1 types from simulator/types.ts"
```

---

### Task 1.3: Strip Gen 1 types from crawler-types.ts

**Files:**
- Modify: `src/lib/crawler-types.ts` (remove lines 5-212)

**Step 1: Verify Gen 1 types have no importers**

Run each separately:
```bash
grep -r "PageType" src/ --include="*.ts" --include="*.tsx" -l
grep -r "ElementSelector" src/ --include="*.ts" --include="*.tsx" -l
grep -r "CrawlerConfig\b" src/ --include="*.ts" --include="*.tsx" -l
grep -r "ScrapyConfig" src/ --include="*.ts" --include="*.tsx" -l
grep -r "PlaywrightConfig\b" src/ --include="*.ts" --include="*.tsx" -l
grep -r "HierarchicalStep\|HierarchicalSource\|HierarchicalCrawlerConfig" src/ --include="*.ts" --include="*.tsx" -l
grep -r "WorkflowData" src/ --include="*.ts" --include="*.tsx" -l
```
Expected: Only `crawler-types.ts` and `crawler-export.ts` (Gen 1 functions we'll delete next)

**Step 2: Remove Gen 1 types**

Remove these interfaces/types from `src/lib/crawler-types.ts`:
- `PageType` (lines 5-11)
- `ElementSelector` (lines 13-23)
- `SelectStep` (lines 25-31)
- `ExtractStep` (lines 33-39)
- `ClickStep` (lines 41-46)
- `PaginationStep` (lines 48-55)
- `SourceStep` (lines 57-63)
- `CrawlerStep` type alias (line 65)
- `CrawlerConfig` (lines 67-91)
- `ScrapyConfig` (lines 93-117)
- `PlaywrightConfig` (lines 119-140)
- `HierarchicalStep` (lines 142-160)
- `HierarchicalSource` (lines 162-173)
- `HierarchicalCrawlerConfig` (lines 175-186)
- `WorkflowData` (lines 188-212)

Keep everything from line 214 onwards (`WorkerRuntimePayloadTemplate` and all Gen 2 types). Also add the `PLAYWRIGHT_ACTION_TYPES` export here (see Task 1.5).

**Step 3: Run existing tests**

Run: `npm test -- --run`
Expected: All tests pass (Gen 1 types are not used in tests)

**Step 4: Commit**

```bash
git add src/lib/crawler-types.ts
git commit -m "chore: remove Gen 1 types from crawler-types.ts"
```

---

### Task 1.4: Strip Gen 1 functions from crawler-export.ts

**Files:**
- Modify: `src/lib/crawler-export.ts` (remove lines 3-14 imports, lines 27-375 functions, line 548-552 alias)

**Step 1: Remove Gen 1 code**

Remove from `src/lib/crawler-export.ts`:
- Gen 1 imports (lines 5-14): `CrawlerConfig`, `ScrapyConfig`, `PlaywrightConfig`, `CrawlerStep`, `ExtractStep` (the old one), `PaginationStep`, `HierarchicalCrawlerConfig`, `HierarchicalStep`, `HierarchicalSource`, `WorkflowData`
- Helper functions only used by Gen 1 (lines 27-44): `getConfigRecord`, `getString`, `getBoolean`, `getNumber`
- Gen 1 functions (lines 46-375): `exportToScrapy`, `exportToPlaywright`, `generateCrawlerConfig`, `exportConfigToJSON`, `generateHierarchicalConfig`, `exportHierarchicalJSON`, `workflowToJSON`, `blockToHierarchicalStep`
- Backward-compatible alias (lines 545-552): `generateWorkerRuntimeConfig`

Keep:
- Gen 2 imports (lines 15-24): `BeforeAction`, `PhaseConfig`, `ScopeModule`, `RepeaterStep`, `ScrapingWorkflow`, `UnifiedWorker*` types
- Template import (line 25)
- `PLAYWRIGHT_ACTION_TYPES` (lines 377-386) — but this will be replaced by import (Task 1.5)
- All Gen 2 functions (lines 388-543): `toWorkerBeforeActions`, `toWorkerRepeaterStep`, `toWorkerScopeChain`, `createUrlTypeNameResolver`, `toWorkerPhase`, `hasPlaywrightBeforeAction`, `generateUnifiedCrawlParams`

**Step 2: Run tests**

Run: `npm test -- --run`
Expected: All tests pass

**Step 3: Verify build**

Run: `npm run build 2>&1 | tail -20`
Expected: Build succeeds

**Step 4: Commit**

```bash
git add src/lib/crawler-export.ts
git commit -m "chore: remove Gen 1 export functions from crawler-export.ts"
```

---

### Task 1.5: Deduplicate PLAYWRIGHT_ACTION_TYPES

**Files:**
- Modify: `src/lib/crawler-types.ts` — add exported `PLAYWRIGHT_ACTION_TYPES`
- Modify: `src/lib/crawler-export.ts` — replace local definition with import
- Modify: `src/lib/workflow-tree.ts` (line 41-50) — replace local definition with import

**Step 1: Add to crawler-types.ts**

Add at the end of `src/lib/crawler-types.ts` (after the `RssCrawlParamsV1` interface):

```typescript
export const PLAYWRIGHT_ACTION_TYPES = new Set<BeforeAction['type']>([
    'wait_selector',
    'wait_network',
    'click',
    'scroll',
    'fill',
    'select_option',
    'evaluate',
    'screenshot',
]);
```

**Step 2: Update crawler-export.ts**

Replace the local `PLAYWRIGHT_ACTION_TYPES` definition (lines 377-386) with:

```typescript
import { PLAYWRIGHT_ACTION_TYPES } from './crawler-types';
```

Add this to the existing import block from `./crawler-types`.

**Step 3: Update workflow-tree.ts**

Replace the local `PLAYWRIGHT_ACTION_TYPES` definition (lines 41-50) with an import. Add `PLAYWRIGHT_ACTION_TYPES` to the existing import from `@/lib/crawler-types`.

**Step 4: Run tests**

Run: `npm test -- --run`
Expected: All tests pass (including `workflow-tree.test.ts`)

**Step 5: Commit**

```bash
git add src/lib/crawler-types.ts src/lib/crawler-export.ts src/lib/workflow-tree.ts
git commit -m "chore: deduplicate PLAYWRIGHT_ACTION_TYPES into crawler-types.ts"
```

---

### Task 1.6: Deduplicate RssWarningReason

**Files:**
- Modify: `src/components/sources/types.ts` (line 18) — replace definition with import
- Keep: `src/lib/source-config.ts` (line 46) — canonical definition

**Step 1: Update components/sources/types.ts**

Replace line 18:
```typescript
export type RssWarningReason = 'http_error' | 'not_feed' | 'network_error' | 'timeout';
```

With:
```typescript
export type { RssWarningReason } from '@/lib/source-config';
```

**Step 2: Verify no broken imports**

Run: `npm run build 2>&1 | tail -20`
Expected: Build succeeds

**Step 3: Commit**

```bash
git add src/components/sources/types.ts
git commit -m "chore: deduplicate RssWarningReason into source-config.ts"
```

---

### Task 1.7: Remove source-editor.tsx wrapper

**Files:**
- Delete: `src/components/source-editor.tsx`
- Modify: `src/app/sources/page.tsx` — import SourceEditorContainer directly

**Step 1: Update page.tsx**

Replace the import and usage in `src/app/sources/page.tsx`:

```typescript
import { SourceEditorContainer } from '@/components/sources/source-editor-container';

export default function SourcesPage() {
    return (
        <main className="h-full">
            <SourceEditorContainer />
        </main>
    );
}
```

Note: `SourceEditorContainer` is a client component (`'use client'`), so importing it in a server component page is fine — Next.js handles the boundary automatically.

**Step 2: Delete the wrapper**

```bash
rm src/components/source-editor.tsx
```

**Step 3: Verify build**

Run: `npm run build 2>&1 | tail -20`
Expected: Build succeeds

**Step 4: Commit**

```bash
git add src/components/source-editor.tsx src/app/sources/page.tsx
git commit -m "chore: remove source-editor.tsx wrapper, import container directly"
```

---

## Phase 2: Sidebar Full Decomposition

### Task 2.1: Extract useWorkflowState hook

**Files:**
- Create: `src/components/simulator/sidebar/hooks/use-workflow-state.ts`
- Modify: `src/components/simulator/simulator-sidebar.tsx`

**Step 1: Create the hook**

Extract from `simulator-sidebar.tsx`:
- `createDefaultWorkflow()` factory (lines 125-137)
- `workflow` useState (line 151)
- `activeTab` useState (line 150)
- `updateWorkflowPhase()` (lines 201-221)
- `useEffect` for `onChange` callback (lines 194-199)
- All step creation functions (lines 631-735): `addBasicBeforeAction`, `addPlaywrightAction`, `addScopeStep`, `addRepeaterStep`, `addSourceUrlStep`, `addDocumentUrlStep`, `addDownloadFileStep`, `addDataExtractStep`, `addPaginationStep`
- Before action manipulation: move/remove/update logic embedded in `renderBeforeAction`'s button handlers
- `clearAllPlaywrightActions` logic (lines 597-618)
- `hasAnyPlaywrightActions` logic

The hook signature:

```typescript
export interface UseWorkflowStateOptions {
    initialWorkflow?: ScrapingWorkflow;
    onChange?: (workflow: ScrapingWorkflow) => void;
}

export function useWorkflowState(options: UseWorkflowStateOptions) {
    // Returns: workflow, activeTab, setActiveTab, updateWorkflowPhase,
    // all add/remove/update functions, clearAllPlaywrightActions, hasAnyPlaywrightActions,
    // resetWorkflow
}
```

**Step 2: Update simulator-sidebar.tsx**

Replace extracted state/functions with hook call:
```typescript
const workflowState = useWorkflowState({ initialWorkflow, onChange: onWorkflowChange });
```

**Step 3: Run tests and build**

Run: `npm test -- --run && npm run build 2>&1 | tail -20`
Expected: All tests pass, build succeeds

**Step 4: Commit**

```bash
git add src/components/simulator/sidebar/hooks/use-workflow-state.ts src/components/simulator/simulator-sidebar.tsx
git commit -m "refactor: extract useWorkflowState hook from sidebar"
```

---

### Task 2.2: Extract useFocusSystem hook

**Files:**
- Create: `src/components/simulator/sidebar/hooks/use-focus-system.ts`
- Modify: `src/components/simulator/simulator-sidebar.tsx`

**Step 1: Create the hook**

Extract from `simulator-sidebar.tsx`:
- `focusedTarget` useState (line 155)
- `armedTarget` useState (line 156)
- `setSelectorFocus()` (lines 223-226)
- `armSelectorTarget()` (lines 228-232)
- `cancelArmedTarget()` (lines 234-236)
- Escape key useEffect (lines 238-247)
- `getFallbackTarget()` (lines 271-298)
- `resolveSelectorForTarget()` (lines 300-325)
- `renderPickButton()` (lines 255-269)

Hook signature:

```typescript
export function useFocusSystem() {
    // Returns: focusedTarget, armedTarget, setSelectorFocus, armSelectorTarget,
    // cancelArmedTarget, getFallbackTarget, resolveSelectorForTarget, renderPickButton
}
```

**Step 2: Update simulator-sidebar.tsx**

Replace extracted state/functions with hook call.

**Step 3: Run tests and build**

Run: `npm test -- --run && npm run build 2>&1 | tail -20`
Expected: All pass

**Step 4: Commit**

```bash
git add src/components/simulator/sidebar/hooks/use-focus-system.ts src/components/simulator/simulator-sidebar.tsx
git commit -m "refactor: extract useFocusSystem hook from sidebar"
```

---

### Task 2.3: Extract useUrlTypeManager hook

**Files:**
- Create: `src/components/simulator/sidebar/hooks/use-url-type-manager.ts`
- Modify: `src/components/simulator/simulator-sidebar.tsx`

**Step 1: Create the hook**

Extract from `simulator-sidebar.tsx`:
- `activeUrlTypeId` useState (line 152)
- `activeUrlType` useMemo (line 160-163)
- `handleUrlTypeAdd()` (lines 737-746)
- `handleUrlTypeRename()` (lines 748-757) — replace `window.prompt()` with a returned state for inline editing
- `handleUrlTypeDelete()` (lines 759-778)

Hook signature:

```typescript
export function useUrlTypeManager(
    workflow: ScrapingWorkflow,
    updateWorkflow: (updater: (w: ScrapingWorkflow) => ScrapingWorkflow) => void,
) {
    // Returns: activeUrlTypeId, activeUrlType, setActiveUrlType,
    // addUrlType, deleteUrlType, renameUrlType,
    // editingUrlTypeId, setEditingUrlTypeId (for inline rename)
}
```

**Step 2: Update simulator-sidebar.tsx**

Replace extracted state/functions with hook call.

**Step 3: Run tests and build**

Run: `npm test -- --run && npm run build 2>&1 | tail -20`
Expected: All pass

**Step 4: Commit**

```bash
git add src/components/simulator/sidebar/hooks/use-url-type-manager.ts src/components/simulator/simulator-sidebar.tsx
git commit -m "refactor: extract useUrlTypeManager hook from sidebar"
```

---

### Task 2.4: Extract BeforeActionRenderer component

**Files:**
- Create: `src/components/simulator/sidebar/before-action-renderer.tsx`
- Modify: `src/components/simulator/simulator-sidebar.tsx`

**Step 1: Create the component**

Extract `renderBeforeAction()` (lines 780-1170) into a proper React component.

```typescript
interface BeforeActionRendererProps {
    action: BeforeAction;
    index: number;
    totalCount: number;
    phaseKey: { phase: 'discovery' } | { phase: 'processing'; urlTypeId: string };
    isDiscovery: boolean;
    focusedTarget: FocusTarget | null;
    armedTarget: FocusTarget | null;
    onFocus: (target: FocusTarget) => void;
    onArm: (target: FocusTarget) => void;
    onUpdate: (index: number, updated: BeforeAction) => void;
    onRemove: (index: number) => void;
    onMove: (fromIndex: number, toIndex: number) => void;
    renderPickButton: (target: FocusTarget) => React.ReactNode;
}

export function BeforeActionRenderer(props: BeforeActionRendererProps) { ... }
```

**Step 2: Update simulator-sidebar.tsx**

Replace `renderBeforeAction(action, index)` calls with `<BeforeActionRenderer ... />`.

**Step 3: Run build**

Run: `npm run build 2>&1 | tail -20`
Expected: Build succeeds

**Step 4: Commit**

```bash
git add src/components/simulator/sidebar/before-action-renderer.tsx src/components/simulator/simulator-sidebar.tsx
git commit -m "refactor: extract BeforeActionRenderer from sidebar"
```

---

### Task 2.5: Extract RepeaterStepRenderer component

**Files:**
- Create: `src/components/simulator/sidebar/repeater-step-renderer.tsx`
- Modify: `src/components/simulator/simulator-sidebar.tsx`

**Step 1: Create the component**

Extract `renderRepeaterStep()` (lines 1170-1433) into a proper React component.

```typescript
interface RepeaterStepRendererProps {
    step: RepeaterStep;
    repeater: RepeaterNode;
    index: number;
    isDiscovery: boolean;
    urlTypes: SourceUrlType[];
    focusedTarget: FocusTarget | null;
    armedTarget: FocusTarget | null;
    onFocus: (target: FocusTarget) => void;
    onArm: (target: FocusTarget) => void;
    onUpdate: (stepId: string, updates: Partial<RepeaterStep>) => void;
    onRemove: (stepId: string) => void;
    onMove: (fromIndex: number, toIndex: number) => void;
    renderPickButton: (target: FocusTarget) => React.ReactNode;
}

export function RepeaterStepRenderer(props: RepeaterStepRendererProps) { ... }
```

**Step 2: Update simulator-sidebar.tsx**

Replace `renderRepeaterStep(step, repeater, index, isDiscovery)` calls with `<RepeaterStepRenderer ... />`.

**Step 3: Run build**

Run: `npm run build 2>&1 | tail -20`
Expected: Build succeeds

**Step 4: Commit**

```bash
git add src/components/simulator/sidebar/repeater-step-renderer.tsx src/components/simulator/simulator-sidebar.tsx
git commit -m "refactor: extract RepeaterStepRenderer from sidebar"
```

---

### Task 2.6: Extract ScopeNodeRenderer component

**Files:**
- Create: `src/components/simulator/sidebar/scope-node-renderer.tsx`
- Modify: `src/components/simulator/simulator-sidebar.tsx`

**Step 1: Create the component**

Extract `renderScopeNode()` (lines 1435-1808) into a proper React component. This is the most complex extraction because it's recursive (calls itself for `scope.children`).

```typescript
interface ScopeNodeRendererProps {
    scope: ScopeModule;
    depth: number;
    phaseKey: { phase: 'discovery' } | { phase: 'processing'; urlTypeId: string };
    isDiscovery: boolean;
    urlTypes: SourceUrlType[];
    selectedScopeId: string | null;
    selectedRepeaterId: string | null;
    focusedTarget: FocusTarget | null;
    armedTarget: FocusTarget | null;
    onFocus: (target: FocusTarget) => void;
    onArm: (target: FocusTarget) => void;
    onScopeUpdate: (scopeId: string, updates: Partial<ScopeModule>) => void;
    onScopeRemove: (scopeId: string) => void;
    onScopeSelect: (scopeId: string) => void;
    onRepeaterSelect: (repeaterId: string) => void;
    onStepUpdate: (stepId: string, updates: Partial<RepeaterStep>) => void;
    onStepRemove: (stepId: string) => void;
    onStepMove: (repeaterId: string, fromIndex: number, toIndex: number) => void;
    onPaginationUpdate: (scopeId: string, pagination: PaginationConfig | null) => void;
    renderPickButton: (target: FocusTarget) => React.ReactNode;
}

export function ScopeNodeRenderer(props: ScopeNodeRendererProps) { ... }
```

**Step 2: Update simulator-sidebar.tsx**

Replace `renderScopeNode(scope, depth)` calls with `<ScopeNodeRenderer ... />`.

**Step 3: Run build**

Run: `npm run build 2>&1 | tail -20`
Expected: Build succeeds

**Step 4: Commit**

```bash
git add src/components/simulator/sidebar/scope-node-renderer.tsx src/components/simulator/simulator-sidebar.tsx
git commit -m "refactor: extract ScopeNodeRenderer from sidebar"
```

---

### Task 2.7: Extract UrlTypePanel component + inline rename

**Files:**
- Create: `src/components/simulator/sidebar/url-type-panel.tsx`
- Modify: `src/components/simulator/simulator-sidebar.tsx`

**Step 1: Create the component**

Extract the URL type selector UI from the Processing tab (sidebar lines ~1880-1948) into a standalone component. Replace `window.prompt()` with inline editable input.

```typescript
interface UrlTypePanelProps {
    urlTypes: SourceUrlType[];
    activeUrlTypeId: string;
    onSelect: (id: string) => void;
    onAdd: () => void;
    onRename: (id: string, newName: string) => void;
    onDelete: (id: string) => void;
}

export function UrlTypePanel(props: UrlTypePanelProps) {
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editValue, setEditValue] = useState('');
    // Inline rename: double-click label → input, Enter saves, Escape cancels
    ...
}
```

**Step 2: Update simulator-sidebar.tsx**

Replace inline URL type UI with `<UrlTypePanel ... />`.

**Step 3: Run build**

Run: `npm run build 2>&1 | tail -20`
Expected: Build succeeds

**Step 4: Commit**

```bash
git add src/components/simulator/sidebar/url-type-panel.tsx src/components/simulator/simulator-sidebar.tsx
git commit -m "refactor: extract UrlTypePanel with inline rename (replaces window.prompt)"
```

---

### Task 2.8: Replace window.confirm with AlertDialog

**Files:**
- Modify: `src/components/sources/source-editor-container.tsx` (line ~105)

**Step 1: Add AlertDialog**

Replace the `window.confirm()` call in `handlePlaywrightToggleRequest` with a state-driven shadcn `AlertDialog`. Add state:

```typescript
const [showPlaywrightConfirm, setShowPlaywrightConfirm] = useState(false);
```

Replace the confirm logic:
```typescript
// Old: if (window.confirm('...')) { ... }
// New: setShowPlaywrightConfirm(true); // dialog handles the rest
```

Add `<AlertDialog>` to the JSX return with Czech text for the confirmation message.

**Step 2: Run build**

Run: `npm run build 2>&1 | tail -20`
Expected: Build succeeds

**Step 3: Commit**

```bash
git add src/components/sources/source-editor-container.tsx
git commit -m "refactor: replace window.confirm with AlertDialog for Playwright toggle"
```

---

### Task 2.9: Verify sidebar decomposition

**Step 1: Check sidebar line count**

Run: `wc -l src/components/simulator/simulator-sidebar.tsx`
Expected: ~200-300 lines (down from 1957)

**Step 2: Run all tests**

Run: `npm test -- --run`
Expected: All tests pass

**Step 3: Run build**

Run: `npm run build 2>&1 | tail -20`
Expected: Build succeeds

**Step 4: Manual smoke test**

Run: `npm run dev`
- Navigate to `/sources`
- Enter a URL in Base URL field
- Verify simulator loads
- Add a scope, repeater, steps in the sidebar
- Switch between Discovery and Processing tabs
- Add/rename/delete URL types
- Toggle Playwright (verify AlertDialog appears)
- Save a source

---

## Phase 3: Minor Polish (Quick Wins)

### Task 3.1: Add HTML form validation attributes

**Files:**
- Modify: `src/components/sources/source-metadata-form.tsx`

**Step 1: Add required and type attributes**

In `source-metadata-form.tsx`, add to the Name input:
```typescript
required
```

Add to the Base URL input:
```typescript
required
type="url"
```

Add to the Source Type select:
```typescript
required
```

**Step 2: Verify build**

Run: `npm run build 2>&1 | tail -20`

**Step 3: Commit**

```bash
git add src/components/sources/source-metadata-form.tsx
git commit -m "fix: add HTML required/type attributes to source form inputs"
```

---

### Task 3.2: Fix use-obec-search unmount race

**Files:**
- Modify: `src/components/sources/hooks/use-obec-search.ts`

**Step 1: Add mounted guard**

Add a `mountedRef` to prevent setState after unmount:

```typescript
const mountedRef = useRef(true);
useEffect(() => {
    return () => { mountedRef.current = false; };
}, []);
```

Guard all async callbacks:
```typescript
if (!mountedRef.current) return;
```

Also clear the search timeout in the cleanup of the mousedown effect.

**Step 2: Verify build**

Run: `npm run build 2>&1 | tail -20`

**Step 3: Commit**

```bash
git add src/components/sources/hooks/use-obec-search.ts
git commit -m "fix: add unmount guard to use-obec-search to prevent setState after unmount"
```

---

### Task 3.3: Add sidebar imperative reset (replace key remount)

**Files:**
- Modify: `src/components/simulator/sidebar/hooks/use-workflow-state.ts` — add `resetWorkflow()`
- Modify: `src/components/simulator/simulator-sidebar.tsx` — expose `reset()` on ref
- Modify: `src/components/sources/source-editor-container.tsx` — remove `sidebarKey`, call `sidebarRef.current?.reset()`

**Step 1: Add resetWorkflow to hook**

In `use-workflow-state.ts`, add a `resetWorkflow()` function that resets workflow to `createDefaultWorkflow()` and `activeTab` to `'discovery'`.

**Step 2: Expose reset() on sidebar ref**

Add `reset` to `SimulatorSidebarRef` interface and `useImperativeHandle`.

**Step 3: Update container**

In `source-editor-container.tsx`:
- Remove `sidebarKey` state and the `key={sidebarKey}` prop
- Replace `setSidebarKey(k => k + 1)` with `sidebarRef.current?.reset()`

**Step 4: Run build**

Run: `npm run build 2>&1 | tail -20`

**Step 5: Commit**

```bash
git add src/components/simulator/sidebar/hooks/use-workflow-state.ts src/components/simulator/simulator-sidebar.tsx src/components/sources/source-editor-container.tsx
git commit -m "refactor: replace sidebar key remount with imperative reset method"
```

---

### Task 3.4: Increase RSS body slice limit

**Files:**
- Modify: `src/app/api/sources/rss-detect/route.ts`

**Step 1: Find and update the slice limit**

Find the line with `.slice(0, 16000)` and change to `.slice(0, 65536)`.

**Step 2: Commit**

```bash
git add src/app/api/sources/rss-detect/route.ts
git commit -m "fix: increase RSS detection body slice from 16KB to 64KB"
```

---

### Task 3.5: Add crawl_interval select to form

**Files:**
- Modify: `src/components/sources/source-metadata-form.tsx` — add select field
- Modify: `src/components/sources/source-editor-container.tsx` — add `crawlInterval` state
- Modify: `src/components/sources/hooks/use-source-submit.ts` — pass `crawlInterval` to API

**Step 1: Add state**

In `source-editor-container.tsx`, add:
```typescript
const [crawlInterval, setCrawlInterval] = useState('1 day');
```

**Step 2: Add select to form**

In `source-metadata-form.tsx`, add a new row after the Base URL row:

```tsx
<Select value={crawlInterval} onValueChange={onCrawlIntervalChange}>
    <SelectTrigger>
        <SelectValue />
    </SelectTrigger>
    <SelectContent>
        <SelectItem value="1 hour">1 hodina</SelectItem>
        <SelectItem value="6 hours">6 hodin</SelectItem>
        <SelectItem value="1 day">1 den</SelectItem>
        <SelectItem value="3 days">3 dny</SelectItem>
        <SelectItem value="1 week">1 týden</SelectItem>
    </SelectContent>
</Select>
```

**Step 3: Update use-source-submit.ts**

Replace hardcoded `'1 day'` with the `crawlInterval` parameter.

**Step 4: Run build**

Run: `npm run build 2>&1 | tail -20`

**Step 5: Commit**

```bash
git add src/components/sources/source-metadata-form.tsx src/components/sources/source-editor-container.tsx src/components/sources/hooks/use-source-submit.ts
git commit -m "feat: add crawl_interval select to source form"
```

---

## Phase 4: RSS Detection & Setup Polish

### Task 4.1: Concurrent RSS probing

**Files:**
- Modify: `src/app/api/sources/rss-detect/route.ts`
- Test: `tests/unit/rss-detect-route.test.ts` (new)

**Step 1: Write test for concurrent probing**

Create `tests/unit/rss-detect-route.test.ts` that mocks `fetch` and verifies:
- Multiple candidates are probed concurrently (not sequentially)
- Concurrency is limited to 4

**Step 2: Run test to verify it fails**

Run: `npm test -- --run tests/unit/rss-detect-route.test.ts`
Expected: FAIL

**Step 3: Implement concurrent probing**

Replace the sequential loop in `rss-detect/route.ts` with a concurrent pattern:

```typescript
// Concurrency limiter
async function withConcurrency<T>(items: T[], limit: number, fn: (item: T) => Promise<void>) {
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

// Usage:
await withConcurrency(candidates, 4, async (candidateUrl) => {
    // ... existing probe logic for each candidate
});
```

**Step 4: Run test**

Run: `npm test -- --run tests/unit/rss-detect-route.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/app/api/sources/rss-detect/route.ts tests/unit/rss-detect-route.test.ts
git commit -m "perf: concurrent RSS feed probing with concurrency limit of 4"
```

---

### Task 4.2: Auto-detect RSS on URL blur

**Files:**
- Modify: `src/components/sources/hooks/use-rss-detection.ts` — add auto-detect mode
- Modify: `src/components/sources/source-editor-container.tsx` — wire blur handler
- Modify: `src/components/sources/source-metadata-form.tsx` — add onBlur to URL input, show spinner

**Step 1: Add autoDetect to use-rss-detection**

Add an `autoDetectOnUrl(url)` function that:
- Validates URL format
- Runs detection silently (no toast on start)
- If exactly 1 feed: auto-applies it + shows success toast
- If multiple feeds: sets state so the panel auto-expands
- If no feeds or error: stays silent

**Step 2: Wire URL input blur**

In `source-editor-container.tsx`, add a `handleBaseUrlBlur` that calls `autoDetectOnUrl(baseUrl)`.

In `source-metadata-form.tsx`, add `onBlur={onBaseUrlBlur}` to the Base URL input. Show a subtle `Loader2` spinner next to the input when `rssDetecting` is true.

**Step 3: Run build**

Run: `npm run build 2>&1 | tail -20`

**Step 4: Commit**

```bash
git add src/components/sources/hooks/use-rss-detection.ts src/components/sources/source-editor-container.tsx src/components/sources/source-metadata-form.tsx
git commit -m "feat: auto-detect RSS feeds on URL blur"
```

---

### Task 4.3: RSS feed preview endpoint

**Files:**
- Create: `src/app/api/sources/rss-preview/route.ts`
- Test: `tests/unit/rss-preview-route.test.ts` (new)

**Step 1: Write test**

Test that the endpoint:
- Returns feed title, item count, last published date, first 3 items
- Returns 400 for missing URL param
- Returns error for non-feed URLs

**Step 2: Run test to verify it fails**

Run: `npm test -- --run tests/unit/rss-preview-route.test.ts`
Expected: FAIL

**Step 3: Implement the endpoint**

```typescript
// GET /api/sources/rss-preview?url=...
export async function GET(request: NextRequest) {
    const url = request.nextUrl.searchParams.get('url');
    if (!url) return NextResponse.json({ error: 'Missing url' }, { status: 400 });

    const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
    const body = await response.text();

    // Parse RSS/Atom XML
    // Extract: title, itemCount, lastPublished, first 3 items (title + link + pubDate)
    // Return JSON
}
```

Use basic XML parsing (DOMParser equivalent for Node.js — can use `fast-xml-parser` or regex for simple RSS/Atom).

**Step 4: Run test**

Run: `npm test -- --run tests/unit/rss-preview-route.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/app/api/sources/rss-preview/route.ts tests/unit/rss-preview-route.test.ts
git commit -m "feat: add RSS feed preview API endpoint"
```

---

### Task 4.4: RSS preview panel UI

**Files:**
- Create: `src/components/sources/rss-preview-panel.tsx`
- Modify: `src/components/sources/source-editor-container.tsx` — add preview state + fetch
- Modify: `src/components/sources/source-metadata-form.tsx` — add preview slot

**Step 1: Create RssPreviewPanel component**

Shows: feed title, item count, last published date, first 3 item titles. Uses theme tokens. Subtle card with `bg-muted/30`.

**Step 2: Add preview fetching**

In `source-editor-container.tsx`, fetch `/api/sources/rss-preview?url=...` when `crawlStrategy === 'rss'` and a feed URL is set. Store in state.

**Step 3: Wire into form**

Add a `rssPreviewPanel` slot to `source-metadata-form.tsx` below the RSS detection panel.

**Step 4: Run build**

Run: `npm run build 2>&1 | tail -20`

**Step 5: Commit**

```bash
git add src/components/sources/rss-preview-panel.tsx src/components/sources/source-editor-container.tsx src/components/sources/source-metadata-form.tsx
git commit -m "feat: add RSS feed preview panel showing feed title, items, and dates"
```

---

### Task 4.5: Better RSS error states (inline alerts)

**Files:**
- Modify: `src/components/sources/hooks/use-rss-detection.ts` — add structured error state
- Modify: `src/components/sources/source-metadata-form.tsx` — render inline alerts

**Step 1: Add error state to hook**

Add to `use-rss-detection.ts`:
```typescript
type RssDetectionStatus =
    | { type: 'idle' }
    | { type: 'detecting' }
    | { type: 'success'; feedCount: number }
    | { type: 'info'; message: string }      // no feeds found
    | { type: 'error'; message: string }      // URL unreachable
    | { type: 'warning'; message: string };   // feeds found but invalid
```

**Step 2: Render inline alert in form**

Below the URL input in `source-metadata-form.tsx`, add a conditional alert using shadcn's `Alert` component with appropriate variant (info/destructive/warning).

**Step 3: Run build**

Run: `npm run build 2>&1 | tail -20`

**Step 4: Commit**

```bash
git add src/components/sources/hooks/use-rss-detection.ts src/components/sources/source-metadata-form.tsx
git commit -m "feat: inline RSS detection status alerts below URL input"
```

---

## Phase 5: Source Edit Flow

### Task 5.1: Add workflow_data column migration

**Files:**
- Apply: Supabase migration

**Step 1: Apply migration**

Use Supabase MCP to apply:

```sql
ALTER TABLE sources
ADD COLUMN IF NOT EXISTS workflow_data jsonb;

COMMENT ON COLUMN sources.workflow_data IS 'Raw ScrapingWorkflow JSON for editor state restoration';
```

**Step 2: Verify**

Query: `SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'sources' AND column_name = 'workflow_data'`
Expected: Returns row with `jsonb` type

**Step 3: Commit note**

Note the migration version for reference. No local file to commit (Supabase manages migrations remotely).

---

### Task 5.2: Update POST /api/sources to save workflow_data

**Files:**
- Modify: `src/app/api/sources/route.ts`
- Modify: `src/components/sources/hooks/use-source-submit.ts`
- Test: `tests/unit/api-sources-route.test.ts`

**Step 1: Update API route**

In `src/app/api/sources/route.ts`, accept `workflow_data` in the POST body and include it in the Supabase insert.

**Step 2: Update submit hook**

In `use-source-submit.ts`, include the raw `ScrapingWorkflow` object as `workflow_data` in the POST body.

**Step 3: Run existing tests**

Run: `npm test -- --run tests/unit/api-sources-route.test.ts`
Expected: Tests may need updating to include `workflow_data` field

**Step 4: Update tests if needed**

Add `workflow_data` to test fixtures.

**Step 5: Commit**

```bash
git add src/app/api/sources/route.ts src/components/sources/hooks/use-source-submit.ts tests/unit/api-sources-route.test.ts
git commit -m "feat: save workflow_data alongside crawl_params on source create"
```

---

### Task 5.3: Create GET /api/sources/[id] route

**Files:**
- Create: `src/app/api/sources/[id]/route.ts`
- Test: `tests/unit/api-sources-id-route.test.ts` (new)

**Step 1: Write test**

Test:
- Returns 404 for non-existent source ID
- Returns source with workflow_data for valid ID
- Returns 400 for invalid ID format

**Step 2: Run test to verify it fails**

Run: `npm test -- --run tests/unit/api-sources-id-route.test.ts`

**Step 3: Implement GET handler**

```typescript
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;
    const { data, error } = await supabase
        .from('sources')
        .select('*, source_urls(*)')
        .eq('id', id)
        .single();

    if (error || !data) {
        return NextResponse.json({ error: 'Source not found' }, { status: 404 });
    }

    return NextResponse.json({ source: data });
}
```

**Step 4: Run test**

Run: `npm test -- --run tests/unit/api-sources-id-route.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/app/api/sources/\[id\]/route.ts tests/unit/api-sources-id-route.test.ts
git commit -m "feat: add GET /api/sources/[id] route"
```

---

### Task 5.4: Create PUT /api/sources/[id] route

**Files:**
- Modify: `src/app/api/sources/[id]/route.ts` — add PUT handler
- Modify: `src/lib/duplicate-precheck.ts` — add `excludeId` param to `findSourceDuplicate`
- Test: `tests/unit/api-sources-id-route.test.ts`

**Step 1: Write test**

Test:
- Updates source fields correctly
- Validates payload via `validateSourcePayload`
- Skips self in duplicate detection
- Returns 404 for non-existent ID

**Step 2: Run test to verify it fails**

**Step 3: Implement PUT handler**

```typescript
export async function PUT(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id } = await params;
    const body = await request.json();

    // Validate
    const validation = validateSourcePayload(body);
    if (!validation.success) { ... }

    // Duplicate check (excluding self)
    const duplicate = await findSourceDuplicate(body.base_url, id);
    if (duplicate) { ... }

    // Update
    const { data, error } = await supabase
        .from('sources')
        .update({ ...validated, workflow_data: body.workflow_data })
        .eq('id', id)
        .select()
        .single();

    return NextResponse.json({ source: data });
}
```

**Step 4: Update findSourceDuplicate**

Add optional `excludeId?: string` parameter to skip self-match.

**Step 5: Run tests**

Run: `npm test -- --run tests/unit/api-sources-id-route.test.ts`
Expected: PASS

**Step 6: Commit**

```bash
git add src/app/api/sources/\[id\]/route.ts src/lib/duplicate-precheck.ts tests/unit/api-sources-id-route.test.ts
git commit -m "feat: add PUT /api/sources/[id] route with self-excluding duplicate check"
```

---

### Task 5.5: Create useSourceLoad hook

**Files:**
- Create: `src/components/sources/hooks/use-source-load.ts`

**Step 1: Implement the hook**

```typescript
interface UseSourceLoadResult {
    source: SourceData | null;
    workflow: ScrapingWorkflow | null;
    loading: boolean;
    error: string | null;
}

export function useSourceLoad(sourceId: string | null): UseSourceLoadResult {
    // Fetch from GET /api/sources/[id]
    // Parse workflow_data if present
    // Return parsed data
}
```

**Step 2: Run build**

Run: `npm run build 2>&1 | tail -20`

**Step 3: Commit**

```bash
git add src/components/sources/hooks/use-source-load.ts
git commit -m "feat: add useSourceLoad hook for fetching source by ID"
```

---

### Task 5.6: Wire edit mode into SourceEditorContainer

**Files:**
- Modify: `src/components/sources/source-editor-container.tsx`
- Modify: `src/components/sources/source-metadata-form.tsx`
- Modify: `src/components/sources/hooks/use-source-submit.ts`

**Step 1: Add edit mode detection**

In `source-editor-container.tsx`:

```typescript
'use client';
import { useSearchParams } from 'next/navigation';

// Inside component:
const searchParams = useSearchParams();
const editSourceId = searchParams.get('edit');
const { source, workflow, loading } = useSourceLoad(editSourceId);
```

**Step 2: Populate form on load**

When `source` loads, populate all form fields:
```typescript
useEffect(() => {
    if (source) {
        setName(source.name);
        setTypeId(source.source_type_id);
        setBaseUrl(source.base_url);
        setCrawlStrategy(source.crawl_strategy);
        setCrawlInterval(source.crawl_interval);
        if (workflow) {
            setWorkflowData(workflow);
        }
    }
}, [source, workflow]);
```

**Step 3: Update submit hook**

In `use-source-submit.ts`, add `editMode` and `sourceId` parameters. When `editMode`, use PUT instead of POST.

**Step 4: Update form labels**

In `source-metadata-form.tsx`:
- Save button: `editMode ? 'Aktualizovat zdroj' : 'Uložit zdroj'`
- Add "Nový zdroj" button (visible in edit mode) that navigates to `/sources`
- Add "Zrušit" button that navigates back

**Step 5: Run build**

Run: `npm run build 2>&1 | tail -20`

**Step 6: Commit**

```bash
git add src/components/sources/source-editor-container.tsx src/components/sources/source-metadata-form.tsx src/components/sources/hooks/use-source-submit.ts
git commit -m "feat: wire source edit mode with URL param, form population, and PUT submit"
```

---

### Task 5.7: Add edit navigation from dashboard

**Files:**
- Modify: dashboard source list component (find the component that renders source rows)

**Step 1: Find the dashboard component**

Grep for the component rendering the sources list on the dashboard. Add an "Upravit" (Edit) link/button to each row.

```tsx
<Link href={`/sources?edit=${source.id}`}>
    <Button variant="ghost" size="sm">
        <Pencil className="h-3.5 w-3.5" />
        Upravit
    </Button>
</Link>
```

**Step 2: Run build**

Run: `npm run build 2>&1 | tail -20`

**Step 3: Commit**

```bash
git add <dashboard-component-file>
git commit -m "feat: add edit source link from dashboard"
```

---

### Task 5.8: Final integration test

**Step 1: Run all tests**

Run: `npm test -- --run`
Expected: All tests pass

**Step 2: Run build**

Run: `npm run build 2>&1 | tail -20`
Expected: Build succeeds with no errors

**Step 3: Run smoke tests (if applicable)**

Run: `npm run test:smoke`
Expected: Sources playwright spec passes

**Step 4: Manual smoke test checklist**

- [ ] Create new source (list strategy) — verify save works
- [ ] Create new source (RSS strategy) — verify auto-detect, preview, save
- [ ] Edit existing source — verify form populates, update works
- [ ] Switch between create/edit modes
- [ ] Sidebar: add scope, repeater, steps — verify all work after decomposition
- [ ] URL type: add, inline rename (no more window.prompt), delete
- [ ] Playwright toggle: verify AlertDialog (no more window.confirm)
- [ ] Crawl interval: verify select updates
- [ ] Build passes in production mode

---

## Summary

| Phase | Tasks | Estimated commits |
|-------|-------|------------------|
| 1. Dead Code Removal | 7 tasks | 7 commits |
| 2. Sidebar Decomposition | 9 tasks | 9 commits |
| 3. Minor Polish | 5 tasks | 5 commits |
| 4. RSS Polish | 5 tasks | 5 commits |
| 5. Source Edit Flow | 8 tasks | 8 commits |
| **Total** | **34 tasks** | **34 commits** |
