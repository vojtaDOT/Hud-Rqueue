# Preview–Sidebar Synergy Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Wire the preview iframe and V2 timeline sidebar so clicking elements auto-fills focused node card selectors with pattern-optimized CSS selectors, and show inline match count badges.

**Architecture:** Extend iframe injected scripts to return pattern selectors (nth-stripped) alongside exact selectors. Add `selectorTarget` state to track which sidebar field is active. New bridge messages for match counting. Pick icon on each selector input activates pick mode targeted to that field.

**Tech Stack:** React 19, TypeScript, postMessage bridge, CSS selectors, existing shadcn/ui components

---

### Task 1: Add pattern selector to proxy route injected script

**Files:**
- Modify: `src/app/api/proxy/route.ts:603-639` (getElementSelector), `src/app/api/proxy/route.ts:944-965` (handleClick elementInfo), `src/app/api/proxy/route.ts:991-1010` (message handlers)

**Step 1: Add `getPatternSelector()` function after `detectListPattern()` (line 662)**

Insert after line 662:

```javascript
function getPatternSelector(el) {
    const path = [];
    let current = el;
    while (current && current.nodeType === 1) {
        let selector = current.tagName.toLowerCase();
        if (current.id) {
            selector += '#' + current.id;
            path.unshift(selector);
            break;
        }
        if (current.className && typeof current.className === 'string') {
            const classes = current.className.trim().split(/\\s+/).filter(Boolean);
            if (classes.length > 0) selector += '.' + classes[0];
        }
        // No :nth-of-type — this is the pattern version
        path.unshift(selector);
        current = current.parentElement;
    }
    const patternSel = path.join(' > ');
    try {
        const count = document.querySelectorAll(patternSel).length;
        if (count > 1) return { patternSelector: patternSel, matchCount: count };
    } catch {}
    return { patternSelector: null, matchCount: 0 };
}
```

**Step 2: Add `patternSelector` and `matchCount` to elementInfo in handleClick (line 952-962)**

Replace the `const elementInfo = { ... }` block at lines 952-962 with:

```javascript
const patternInfo = listInfo.isList ? getPatternSelector(elementToSelect) : { patternSelector: null, matchCount: 0 };
const selectorMatchCount = (function() {
    try { return document.querySelectorAll(localSelector).length; } catch { return 0; }
})();

const elementInfo = {
    selector: fullSelector,
    localSelector: localSelector,
    framePath: FRAME_PATH,
    inIframe: FRAME_PATH.length > 0,
    tagName: elementToSelect.tagName.toLowerCase(),
    textContent: elementToSelect.textContent?.substring(0, 100) || '',
    isList: listInfo.isList,
    listItemCount: listInfo.count,
    parentSelector: listInfo.isList ? getElementSelector(elementToSelect.parentElement) : undefined,
    patternSelector: patternInfo.patternSelector,
    matchCount: patternInfo.matchCount || selectorMatchCount
};
```

**Step 3: Add `count-selector-matches` message handler (after line ~1009, inside the message listener)**

Add a new `else if` branch in the `window.addEventListener('message', ...)` block:

```javascript
else if (event.data.type === 'count-selector-matches') {
    const sel = event.data.selector;
    let count = 0;
    try { count = document.querySelectorAll(sel).length; } catch {}
    window.parent.postMessage({ type: 'selector-match-count', selector: sel, count: count }, '*');
}
```

**Step 4: Verify** — check that the proxy route has no syntax errors by loading a source page in the simulator.

**Step 5: Commit**

```bash
git add src/app/api/proxy/route.ts
git commit -m "feat: add pattern selector + match count to proxy bridge script"
```

---

### Task 2: Add pattern selector to render route injected script

**Files:**
- Modify: `src/app/api/render/route.ts:437-464` (getSelector), `src/app/api/render/route.ts:807-829` (click handler elementInfo), `src/app/api/render/route.ts:867+` (message handlers)

**Step 1: Add `getPatternSelector()` function after `detectList()` (line 485)**

Insert after line 485:

```javascript
function getPatternSelector(el) {
    const path = [];
    let cur = el;
    let depth = 0;
    while (cur && cur.nodeType === 1 && depth < 5) {
        let sel = cur.tagName.toLowerCase();
        if (cur.id && /^[a-zA-Z][a-zA-Z0-9_-]*$/.test(cur.id)) { path.unshift(sel + '#' + cur.id); break; }
        if (cur.className && typeof cur.className === 'string') {
            const cls = cur.className.trim().split(/\\s+/).filter(c => c && /^[a-zA-Z_-]/.test(c) && !c.includes(':'))[0];
            if (cls) sel += '.' + cls;
        }
        path.unshift(sel);
        cur = cur.parentElement;
        depth++;
    }
    const patternSel = path.join(' > ');
    try {
        const count = document.querySelectorAll(patternSel).length;
        if (count > 1) return { patternSelector: patternSel, matchCount: count };
    } catch {}
    return { patternSelector: null, matchCount: 0 };
}
```

**Step 2: Add `patternSelector` and `matchCount` to elementInfo in click handler (lines 817-829)**

Replace the `const msg = { ... }` block with:

```javascript
const patternInfo = list.isList ? getPatternSelector(t) : { patternSelector: null, matchCount: 0 };
const selectorMatchCount = (function() {
    try { return document.querySelectorAll(finalSelector).length; } catch { return 0; }
})();

const msg = {
    type: 'element-select',
    elementInfo: {
        selector: fullSelector,
        localSelector: finalSelector,
        framePath: FRAME_PATH,
        tagName: t.tagName.toLowerCase(),
        textContent: (t.textContent || '').substring(0, 100).trim(),
        isList: list.isList,
        listItemCount: list.count,
        inIframe: FRAME_PATH.length > 0,
        patternSelector: patternInfo.patternSelector,
        matchCount: patternInfo.matchCount || selectorMatchCount
    }
};
```

**Step 3: Add `count-selector-matches` message handler** in the message listener (near line 867):

```javascript
else if (e.data.type === 'count-selector-matches') {
    const sel = e.data.selector;
    let count = 0;
    try { count = document.querySelectorAll(sel).length; } catch {}
    window.parent.postMessage({ type: 'selector-match-count', selector: sel, count: count }, '*');
}
```

**Step 4: Commit**

```bash
git add src/app/api/render/route.ts
git commit -m "feat: add pattern selector + match count to render bridge script"
```

---

### Task 3: Update preview-bridge.ts types and simulator-frame.tsx

**Files:**
- Modify: `src/lib/preview-bridge.ts`
- Modify: `src/components/simulator/simulator-frame.tsx`

**Step 1: Add new message types to preview-bridge.ts**

Add `'count-selector-matches'` and `'selector-match-count'` to the `PREVIEW_BRIDGE_EVENT_TYPES` array (line 3-14).

Add to the `ElementSelector` type (in `crawler-types.ts` if that's where it lives, or in `preview-bridge.ts`):

```typescript
patternSelector?: string | null;
matchCount?: number;
```

**Step 2: Update SimulatorFrame props**

Add to `SimulatorFrameProps` interface (line 22-34):

```typescript
onMatchCount?: (selector: string, count: number) => void;
```

**Step 3: Handle `selector-match-count` message in SimulatorFrame**

In the message handler useEffect (line 215-326), add a new case:

```typescript
case 'selector-match-count': {
    const sel = msg.data?.selector as string;
    const count = msg.data?.count as number;
    if (sel && typeof count === 'number') {
        onMatchCount?.(sel, count);
    }
    break;
}
```

**Step 4: Add `countSelectorMatches` helper to SimulatorFrame**

Expose a method (via ref or callback) to send `count-selector-matches` to iframe. Add a new function inside the component:

```typescript
const countSelectorMatches = useCallback((selector: string) => {
    const iframe = iframeRef.current;
    if (iframe?.contentWindow && selector) {
        iframe.contentWindow.postMessage({ type: 'count-selector-matches', selector }, '*');
    }
}, []);
```

Pass this up via a new prop `onRequestMatchCount` or via `useImperativeHandle` on the frame ref.

**Step 5: Commit**

```bash
git add src/lib/preview-bridge.ts src/components/simulator/simulator-frame.tsx
git commit -m "feat: add match count bridge messages + SimulatorFrame handler"
```

---

### Task 4: Add selectorTarget state and auto-fill logic to SourceEditorContainer

**Files:**
- Modify: `src/components/sources/source-editor-container.tsx`

**Step 1: Add state**

Near `selectorPreview` state (line 71), add:

```typescript
const [selectorTarget, setSelectorTarget] = useState<{ nodeId: string; field?: string } | null>(null);
const [matchCounts, setMatchCounts] = useState<Record<string, number>>({});
```

**Step 2: Create match count handler**

```typescript
const handleMatchCount = useCallback((selector: string, count: number) => {
    setMatchCounts(prev => ({ ...prev, [selector]: count }));
}, []);
```

**Step 3: Modify `handleElementSelect` (line 263-270) to use selectorTarget**

Replace with:

```typescript
const handleElementSelect = (selector: string, elementInfo?: ElementSelector) => {
    // If V2 sidebar has an active target field, auto-fill with pattern selector
    if (selectorTarget && sidebarV2Ref.current) {
        const bestSelector = elementInfo?.patternSelector || elementInfo?.localSelector || selector;
        sidebarV2Ref.current.fillSelectorTarget(selectorTarget, bestSelector);
        setSelectorPreview(bestSelector);
        setMatchCounts(prev => ({
            ...prev,
            [bestSelector]: elementInfo?.matchCount ?? 0
        }));
        toast.success(`Selector vložen (${elementInfo?.matchCount ?? '?'} shod)`);
        return;
    }
    // Fall back to V1 sidebar behavior
    const applied = sidebarRef.current?.applySelectedSelector(selector, elementInfo) ?? false;
    if (!applied) {
        toast.info('Vyberte cílový Scope/Repeater nebo fokusujte CSS input v panelu workflow.');
    } else {
        toast.success('Selector byl vložen do aktivního pole.');
    }
};
```

**Step 4: Pass new callbacks to SimulatorSidebarV2 (line 427-432)**

```typescript
<SimulatorSidebarV2
    ref={sidebarV2Ref}
    initialWorkflow={workflowDataV2}
    onWorkflowChange={setWorkflowDataV2}
    onSelectorPreviewChange={setSelectorPreview}
    onSelectorTargetChange={setSelectorTarget}
    matchCounts={matchCounts}
/>
```

**Step 5: Pass `onMatchCount` to SourceSimulatorLayout (line 470-488)**

Add `onMatchCount={handleMatchCount}` which flows to SimulatorFrame.

**Step 6: Add `fillSelectorTarget` to SimulatorSidebarV2Ref interface**

In `simulator-sidebar-v2.tsx`, extend the ref:

```typescript
export interface SimulatorSidebarV2Ref {
    getWorkflow: () => ScrapingWorkflowV2;
    reset: (workflow?: ScrapingWorkflowV2) => void;
    fillSelectorTarget: (target: { nodeId: string; field?: string }, selector: string) => void;
}
```

**Step 7: Commit**

```bash
git add src/components/sources/source-editor-container.tsx
git commit -m "feat: add selectorTarget state + auto-fill on element pick"
```

---

### Task 5: Wire selectorTarget and matchCounts through SimulatorSidebarV2 → TimelineEditor → node cards

**Files:**
- Modify: `src/components/sources/timeline/simulator-sidebar-v2.tsx`
- Modify: `src/components/sources/timeline/timeline-editor.tsx`

**Step 1: Add props to SimulatorSidebarV2**

```typescript
interface SimulatorSidebarV2Props {
    // ... existing
    onSelectorTargetChange?: (target: { nodeId: string; field?: string } | null) => void;
    matchCounts?: Record<string, number>;
}
```

Implement `fillSelectorTarget` in `useImperativeHandle`:

```typescript
fillSelectorTarget: (target, selector) => {
    updateNode(target.nodeId, target.field ? { [target.field]: selector } : { selector });
},
```

Pass `onSelectorTargetChange` and `matchCounts` to both `<TimelineEditor>` instances.

**Step 2: Add props to TimelineEditor**

```typescript
interface TimelineEditorProps {
    // ... existing
    onSelectorTargetChange?: (target: { nodeId: string; field?: string } | null) => void;
    matchCounts?: Record<string, number>;
}
```

Pass to each node card component.

**Step 3: Commit**

```bash
git add src/components/sources/timeline/simulator-sidebar-v2.tsx src/components/sources/timeline/timeline-editor.tsx
git commit -m "feat: wire selectorTarget + matchCounts through sidebar to node cards"
```

---

### Task 6: Update node cards with pick icon + match count badge

**Files:**
- Modify: `src/components/sources/timeline/nodes/use-selector-preview.ts`
- Modify: All node card files: `scope-node-card.tsx`, `click-node-card.tsx`, `source-url-node-card.tsx`, `document-url-node-card.tsx`, `pagination-node-card.tsx`, `data-extract-node-card.tsx`
- Skip: `repeater-node-card.tsx` uses same pattern

**Step 1: Extend `useSelectorPreview` hook**

Update `use-selector-preview.ts` to also accept and return match count state:

```typescript
import { useCallback, useRef } from 'react';

interface UseSelectorPreviewOptions {
    onSelectorPreviewChange?: (selector: string | null) => void;
    onSelectorTargetChange?: (target: { nodeId: string; field?: string } | null) => void;
    nodeId: string;
    matchCounts?: Record<string, number>;
}

export function useSelectorPreview({
    onSelectorPreviewChange,
    onSelectorTargetChange,
    nodeId,
    matchCounts,
}: UseSelectorPreviewOptions) {
    const debounceRef = useRef<ReturnType<typeof setTimeout>>();

    const preview = useCallback((selector: string | null) => {
        clearTimeout(debounceRef.current);
        onSelectorPreviewChange?.(selector?.trim() || null);
    }, [onSelectorPreviewChange]);

    const previewDebounced = useCallback((selector: string | null) => {
        clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => {
            onSelectorPreviewChange?.(selector?.trim() || null);
        }, 300);
    }, [onSelectorPreviewChange]);

    const clearPreview = useCallback(() => {
        clearTimeout(debounceRef.current);
        onSelectorPreviewChange?.(null);
    }, [onSelectorPreviewChange]);

    const setPickTarget = useCallback((field?: string) => {
        onSelectorTargetChange?.({ nodeId, field });
    }, [onSelectorTargetChange, nodeId]);

    const clearPickTarget = useCallback(() => {
        onSelectorTargetChange?.(null);
    }, [onSelectorTargetChange]);

    const getMatchCount = useCallback((selector: string) => {
        return matchCounts?.[selector] ?? null;
    }, [matchCounts]);

    return { preview, previewDebounced, clearPreview, setPickTarget, clearPickTarget, getMatchCount };
}
```

**Step 2: Update each node card**

For each node card with a selector input, add:

1. **Pick icon button** — small `Crosshair` icon next to the selector input. On click, calls `setPickTarget()` to activate pick-for-this-field mode.

2. **Match count badge** — after the input, show count from `getMatchCount(node.selector)`. Small pill, green if > 0.

3. **Update focus/blur** — on focus, call `setPickTarget()` to register as target. On blur, call `clearPickTarget()`.

Example for a simple card (e.g. `click-node-card.tsx`):

```tsx
import { Crosshair, MousePointerClick, Trash2 } from 'lucide-react';

// In the component:
const { preview, previewDebounced, clearPreview, setPickTarget, clearPickTarget, getMatchCount } = useSelectorPreview({
    onSelectorPreviewChange,
    onSelectorTargetChange,
    nodeId: node.id,
    matchCounts,
});
const count = getMatchCount(node.selector);

// In the JSX, replace the selector Input with:
<div className="flex items-center gap-1">
    <Input
        value={node.selector}
        onChange={(e) => {
            onUpdate({ selector: e.target.value });
            previewDebounced(e.target.value);
        }}
        onFocus={() => { preview(node.selector); setPickTarget(); }}
        onBlur={() => { clearPreview(); clearPickTarget(); }}
        placeholder="CSS selektor"
        className="h-7 flex-1 border-border bg-card/50 text-xs font-mono"
    />
    <Button
        variant="ghost"
        size="icon"
        className="h-6 w-6 shrink-0 text-muted-foreground hover:text-primary"
        onClick={(e) => { e.stopPropagation(); setPickTarget(); }}
        title="Vybrat z preview"
    >
        <Crosshair className="h-3 w-3" />
    </Button>
    {count !== null && (
        <span className={`text-[10px] font-medium tabular-nums px-1 py-0.5 rounded ${count > 0 ? 'text-green-500 bg-green-500/10' : 'text-muted-foreground bg-muted/30'}`}>
            {count}
        </span>
    )}
</div>
```

Apply this pattern to all 7 node cards (scope, repeater, click, source-url, document-url, pagination, data-extract). For data-extract, apply per-field with `setPickTarget('fields.' + i + '.selector')`.

**Step 3: Update all node card prop interfaces**

Each card needs:
```typescript
onSelectorTargetChange?: (target: { nodeId: string; field?: string } | null) => void;
matchCounts?: Record<string, number>;
```

**Step 4: Commit**

```bash
git add src/components/sources/timeline/nodes/
git commit -m "feat: add pick icon + match count badge to all node cards"
```

---

### Task 7: Wire SourceSimulatorLayout to pass onMatchCount

**Files:**
- Modify: `src/components/sources/source-simulator-layout.tsx`

**Step 1: Add `onMatchCount` prop**

```typescript
onMatchCount?: (selector: string, count: number) => void;
```

Pass it through to `SimulatorFrame` component.

**Step 2: Commit**

```bash
git add src/components/sources/source-simulator-layout.tsx
git commit -m "feat: wire onMatchCount through layout to frame"
```

---

### Task 8: Integration test — verify full flow

**Step 1: Load a source with a base URL in the simulator**

**Step 2: Add a Scope node in the timeline. Focus its selector input.**

**Step 3: Click the pick icon (crosshair) on the selector input.**

**Step 4: Click a repeated element (e.g. list item) in the preview iframe.**

**Step 5: Verify:**
- The selector input auto-fills with a pattern selector (no `:nth-of-type`)
- The match count badge shows > 1
- The preview highlights all matching elements with green dashed overlays

**Step 6: Type a selector manually, verify badge updates after 300ms debounce.**

**Step 7: Commit any fixes.**

```bash
git add -A
git commit -m "fix: integration fixes for preview-sidebar synergy"
```
