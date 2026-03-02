# HUD Queue

Internal tool for managing web scraping pipelines — source editor, visual workflow builder, database CRUD, task scheduling.

## Commands

```bash
npm run dev          # Dev server on :3000
npm run build        # Production build (standalone)
npm run lint         # ESLint
npm test             # Vitest unit tests
npm run test:watch   # Vitest watch mode
npm run test:smoke   # Playwright E2E (builds + runs on :3101)
```

## Stack

- **Framework:** Next.js 16 (App Router), React 19, TypeScript 5
- **Styling:** Tailwind CSS 4, shadcn/ui (new-york style), lucide-react icons
- **Database:** Supabase (Postgres) — direct client queries, no ORM
- **Queue/Cache:** Redis (ioredis)
- **Testing:** Vitest (unit), Playwright (smoke/E2E)
- **Deployment:** Docker multi-stage (node:22-alpine + Chromium), standalone output

## Architecture

```
src/
├── app/                    # Next.js App Router
│   ├── api/                # 16 API routes (db CRUD, pipeline, proxy, render, stats)
│   ├── page.tsx            # Dashboard (Overview / Redis / Database tabs)
│   ├── sources/page.tsx    # Source editor + visual simulator
│   ├── pipeline/page.tsx   # Pipeline runs & job status
│   ├── database/page.tsx   # Generic table CRUD manager
│   ├── tasks/page.tsx      # Task wizard (Scrapy/OCR jobs)
│   └── data/page.tsx       # Data seeding
├── components/
│   ├── ui/                 # shadcn/ui primitives (DO NOT edit manually)
│   ├── dashboard/          # Dashboard tabs
│   ├── database/           # DB manager + row form dialog
│   ├── simulator/          # Visual workflow builder (frame, sidebar, steps)
│   ├── sources/            # Source editing + hooks
│   ├── task-wizard/        # Task creation wizard
│   ├── pipeline/           # Manual pipeline trigger
│   ├── header.tsx          # Left nav sidebar (auto-hide + pin)
│   ├── sidebar-context.tsx # Sidebar state (pinned/unpinned)
│   └── main-content.tsx    # Content wrapper (responds to sidebar width)
├── hooks/                  # Data fetching hooks (use-sources, use-documents, etc.)
└── lib/                    # Utilities
    ├── supabase.ts         # Supabase client init
    ├── redis.ts            # Redis client init
    ├── crawler-types.ts    # Crawler config type definitions
    ├── crawler-export.ts   # Export workflows to Scrapy/Playwright JSON
    ├── workflow-validation.ts
    ├── workflow-tree.ts
    └── utils.ts            # cn() helper (clsx + tailwind-merge)
```

## Theme & Styling

**Dark-first design** with teal/cyan primary color. All colors use **theme tokens only** — never hardcode colors.

### Token Reference

| Use case | Token |
|----------|-------|
| Primary accent | `text-primary`, `bg-primary`, `border-primary` |
| Primary button | `bg-primary text-primary-foreground hover:bg-primary/90` |
| Body text | `text-foreground` |
| Secondary text | `text-muted-foreground` |
| Borders | `border-border` |
| Card surfaces | `bg-card` |
| Subtle backgrounds | `bg-muted/30`, `bg-muted/50` |
| Popover/dropdown | `bg-popover text-popover-foreground` |
| Inputs | `bg-muted/30 border-border text-foreground placeholder:text-muted-foreground/50` |
| Hover states | `hover:bg-muted/50`, `hover:text-foreground` |

### What NOT to use

- No `text-white`, `bg-black`, `bg-zinc-*` — use `text-foreground`, `bg-card`, `bg-background`
- No `text-purple-*`, `bg-purple-*` — use `text-primary`, `bg-primary/XX`
- No `text-cyan-*`, `bg-cyan-*` — use `text-primary`
- No `bg-gradient-to-r from-purple-* to-blue-*` — use `bg-primary`
- Exception: semantic status colors (green for success, red for error, blue for processing) are OK

### CSS Variables (dark mode)

Primary: `oklch(0.75 0.14 190)` — teal/cyan
Background: `oklch(0.13 0.004 260)`
Card: `oklch(0.16 0.005 260)`
Border: `oklch(1 0 0 / 8%)`

Page layout utilities: `.page-shell`, `.page-header`, `.page-title` defined in globals.css.

## Sidebar

The left sidebar uses a **pin/unpin pattern**:
- Default: collapsed (52px), expands on hover (overlays, doesn't push content)
- Pin button locks it open (200px, content shifts)
- State managed via `SidebarProvider` context in `sidebar-context.tsx`
- `header.tsx` has local `hovered` state; visual expanded = `pinned || hovered`
- `main-content.tsx` reads `sidebarWidth` (52px or 200px) for content padding

## Database

Supabase tables: `sources`, `source_urls`, `ingestion_runs`, `ingestion_items`, `documents`, `document_texts`, `cz_regions_kraj`, `cz_regions_okres`, `cz_regions_obec`.

Generic CRUD via `/api/db/[table]` with cascade delete map. Real-time subscriptions via Supabase Postgres Changes.

## Simulator / Workflow Builder

The Sources page has a visual workflow builder:
- **Frame:** iframe preview with proxy or Playwright rendering
- **DOM Inspector:** CSS selector picking, auto-scaffold
- **Sidebar:** Step chooser, Phase editor (Before Pipeline + Core Chain)
- **Steps:** Scope, Repeater, Pagination, Click, Extract, Select, Remove Element, Source URL
- Two-phase workflow: Discovery → Processing
- Export to Scrapy/Playwright JSON via `crawler-export.ts`

## Environment

```
REDIS_URL=redis://...
NEXT_PUBLIC_SUPABASE_URL=https://...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
DEV=false
```

## Gotchas

- `src/components/ui/` is managed by shadcn/ui CLI — don't edit manually
- Path alias: `@/*` maps to `./src/*`
- Tailwind v4 uses PostCSS plugin (not config file) — theme in `globals.css`
- Next.js standalone output for Docker — no `node_modules` in prod image
- Supabase client is initialized per-request (no persistent connection pool)
- Czech language UI — labels and status messages are in Czech
- `dashboard-redis.tsx` uses `blue-500` for "processing" status intentionally (semantic color)
