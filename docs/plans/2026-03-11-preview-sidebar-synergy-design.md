# Preview–Sidebar Synergy: Smart Selector Picking & Match Feedback

**Date:** 2026-03-11
**Status:** Approved

## Problem

The preview iframe and V2 timeline sidebar are disconnected. Users must manually type CSS selectors into node cards instead of picking elements visually. Picked selectors are too specific (`:nth-of-type(3)`) when Scrapy workers need pattern selectors (`ul > li`) that match all repeated items. There's no feedback showing how many elements a selector matches.

## Solution

Focus-aware smart pick with inline match count badges.

### 1. Smart Selector Generation (iframe)

Extend existing `getElementSelector()` in proxy/render injected scripts:

- When element is inside a detected list (`detectListPattern()`), produce a `patternSelector` by stripping `:nth-of-type()` / `:nth-child()` qualifiers.
  - Example: `div.listings > div.card:nth-of-type(3) > h2` → `div.listings > div.card > h2`
- `element-select` message gains: `patternSelector: string | null`, `matchCount: number`
- Non-list elements (unique buttons, nav links): `patternSelector = null`, original selector used as-is.

New bridge message pair for match counting:
- `count-selector-matches` (parent → iframe): `{ selector: string }`
- `selector-match-count` (iframe → parent): `{ selector: string, count: number }`

### 2. Focus Target Tracking (sidebar)

New state in `SourceEditorContainer`:

```typescript
selectorTarget: { nodeId: string; field?: string } | null
```

- When any selector input in a node card is focused → calls `onSelectorTargetChange({ nodeId, field? })` upward
- When blurred → clears target
- Each selector input gets a small crosshair/pick icon button:
  - Click: sets this field as target + activates pick mode in preview (`enable-selection`)
  - Visual: icon highlights when this field is the active pick target

### 3. Auto-fill Flow

When `element-select` arrives from iframe while `selectorTarget` is set:

1. Use `patternSelector` if available, fall back to `selector`
2. Update targeted node's selector field via existing `updateNode`
3. Send `highlight-selector` to iframe with chosen selector
4. Send `count-selector-matches` → update badge

### 4. Match Count Badge

Each selector input displays an inline badge:

- Small pill to the right of the input showing match count (e.g. `"12"`)
- Green tint if count > 0, muted if count = 0
- Updates on: focus (immediate), typing (debounced 300ms), after pick auto-fill
- Driven by `count-selector-matches` / `selector-match-count` bridge messages

### 5. Message Flow

```
Focus selector input
  → onSelectorTargetChange({ nodeId, field })
  → highlight-selector (existing)
  → count-selector-matches (new) → badge updates

Click pick icon on input
  → sets selectorTarget
  → enable-selection → iframe

Click element in preview
  → iframe: element-select { selector, patternSelector, matchCount }
  → parent: auto-fill patternSelector into targeted field
  → highlight-selector with filled selector
  → badge shows matchCount

Type in selector input
  → debounced highlight-selector (existing)
  → debounced count-selector-matches (new) → badge updates
```

### 6. Files Affected

| File | Change |
|------|--------|
| `/api/proxy/route.ts` (injected script) | `patternSelector` + `matchCount` in element-select; `count-selector-matches` handler |
| `/api/render/route.ts` (injected script) | Same |
| `/lib/preview-bridge.ts` | New message types |
| `source-editor-container.tsx` | `selectorTarget` state, auto-fill on element-select |
| `timeline/nodes/*.tsx` | Pick icon, `onSelectorTargetChange`, match count badge |
| `timeline/nodes/use-selector-preview.ts` | Extend with match count requests |
| `timeline/timeline-editor.tsx` | Pass new callbacks |
| `timeline/simulator-sidebar-v2.tsx` | Pass new callbacks |
| `simulator/simulator-frame.tsx` | Handle new message types, forward match counts |

### 7. Selector Priority Logic

When stripping nth-qualifiers for pattern selector:

1. Start with the full selector path
2. Remove `:nth-of-type(N)` and `:nth-child(N)` segments
3. Count matches with `document.querySelectorAll(patternSelector).length`
4. If count > 1, use pattern (it's a repeating element — good for Scrapy)
5. If count === 1 or 0, fall back to original selector (unique element or broken pattern)

### 8. Non-goals

- No selector palette / multi-option chooser — auto-fill picks the best one
- No persistent match count on all inputs at once — only the focused one queries
- No XPath support — CSS selectors only
