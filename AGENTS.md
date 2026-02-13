# AGENTS.md

Guide for AI agents working with this codebase.

## Project Overview

HUD Queue is an internal web scraping automation platform built with Next.js 16 (App Router). It provides a visual workflow builder for configuring scrapy crawlers, a Redis-based job queue, and a full database management UI connected to Supabase (PostgreSQL/Citus).

## Tech Stack

- **Framework:** Next.js 16 with App Router, React 19, TypeScript
- **Styling:** Tailwind CSS v4, shadcn/ui components (Radix primitives)
- **State:** React hooks (no external state library)
- **Queue:** Redis via ioredis
- **Database:** Supabase (PostgreSQL/Citus) — `@supabase/supabase-js` v2
- **Drag & Drop:** dnd-kit
- **Forms:** react-hook-form + zod (in some components), direct state in others
- **Toasts:** sonner
- **Rendering:** Playwright (optional dep, dynamic import for server-side page rendering)

## Directory Structure

```
src/
├── app/                          # Next.js App Router pages + API routes
│   ├── page.tsx                  # / — Dashboard
│   ├── tasks/page.tsx            # /tasks — Task creation wizard
│   ├── sources/page.tsx          # /sources — Source editor + web simulator
│   ├── database/page.tsx         # /database — Database CRUD manager
│   ├── data/page.tsx             # /data — Data seeder
│   └── api/
│       ├── db/
│       │   ├── stats/route.ts    # GET — PostgreSQL/Citus metrics
│       │   └── [table]/route.ts  # GET/POST/PATCH/DELETE — generic CRUD for any table
│       ├── proxy/route.ts        # GET — HTTP proxy for iframe rendering
│       ├── render/route.ts       # GET — Playwright server-side rendering
│       ├── sources/route.ts      # POST — create source
│       ├── source-types/route.ts # GET — list source types
│       ├── regions/obce/route.ts # GET — Czech municipality search
│       ├── stats/
│       │   ├── route.ts          # GET — Redis queue stats
│       │   └── stream/route.ts   # GET — SSE stream for live stats
│       └── tasks/route.ts        # POST/DELETE — create/flush jobs
├── components/
│   ├── ui/                       # shadcn/ui primitives (button, dialog, input, etc.)
│   ├── dashboard/                # Dashboard tab components
│   │   ├── index.tsx             # Tab container
│   │   ├── dashboard-overview.tsx
│   │   ├── dashboard-redis.tsx   # Live Redis monitoring with SSE
│   │   └── dashboard-database.tsx # PostgreSQL/Citus metrics
│   ├── database/                 # Database manager components
│   │   ├── table-schema.ts       # Schema definitions for all 12 tables
│   │   ├── database-manager.tsx  # Main CRUD UI with sidebar + data table
│   │   └── row-form-dialog.tsx   # Create/edit row dialog
│   ├── simulator/                # Web page simulator
│   │   ├── types.ts              # BlockData, SourceData, WorkflowData
│   │   ├── simulator-frame.tsx   # Iframe renderer (proxy + Playwright fallback)
│   │   ├── simulator-sidebar.tsx # Workflow builder with drag-and-drop
│   │   └── steps/                # Step configuration dialogs
│   │       ├── select-config.tsx
│   │       ├── extract-config.tsx
│   │       ├── click-config.tsx
│   │       ├── pagination-config.tsx
│   │       ├── source-config.tsx
│   │       └── remove-element-config.tsx
│   ├── task-wizard/              # Job creation wizard
│   │   ├── task-wizard.tsx       # Main wizard (Scrapy/OCR jobs)
│   │   ├── types.ts              # WizardData, JobType, ScrapyMethod
│   │   ├── source-combobox.tsx
│   │   ├── source-url-combobox.tsx
│   │   ├── document-combobox.tsx
│   │   └── cron-picker.tsx
│   ├── source-editor.tsx         # Source creation page component
│   ├── header.tsx                # Burger menu navigation
│   ├── animated-background.tsx
│   ├── data-seeder.tsx
│   ├── theme-provider.tsx
│   └── theme-toggle.tsx
├── hooks/
│   ├── use-sources.ts            # Supabase real-time sources subscription
│   ├── use-source-urls.ts        # Supabase real-time source_urls subscription
│   └── use-documents.ts          # Supabase real-time documents subscription
└── lib/
    ├── supabase.ts               # Supabase client singleton
    ├── redis.ts                  # Redis client singleton
    ├── utils.ts                  # cn() helper (tailwind-merge + clsx)
    ├── crawler-types.ts          # All TypeScript types for crawler config
    ├── crawler-export.ts         # Workflow → config conversion functions
    └── queue-stats.ts            # Redis queue statistics aggregation
```

## Key Patterns

### API Routes
- All API routes are in `src/app/api/` using Next.js App Router route handlers.
- Dynamic route params are `Promise`-based (Next.js 15+): `const { table } = await context.params`.
- The generic CRUD route at `/api/db/[table]/` validates table names against an allowlist from `table-schema.ts`.
- DELETE operations cascade through foreign key relationships (source → source_urls → documents → document_texts).

### Supabase
- Single client in `src/lib/supabase.ts` using `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
- Hooks in `src/hooks/` subscribe to Supabase real-time channels for live data updates.
- JSONB columns `name`/`nazev` in region tables store `{"cs": "Czech Name"}` objects.

### Worker Runtime Config
- The source editor generates a `crawl_params` JSONB object matching the `worker-runtime-minimal-template.json` structure.
- Two-step workflow: **Step 1 (discover)** = main loop blocks → find source_urls. **Step 2 (download)** = source steps → download documents.
- Generated by `generateWorkerRuntimeConfig()` in `crawler-export.ts`.

### UI Conventions
- Dark theme by default (zinc/black backgrounds, white/purple accents).
- Czech language for user-facing labels (Název, Vytvořeno, Aktivní, etc.).
- shadcn/ui components in `src/components/ui/` — don't modify these directly.
- Toast notifications via `sonner` — use `toast.success()` / `toast.error()`.
- Icons from `lucide-react`.

### Database Tables (12 total)
Core: `sources`, `source_urls`, `documents`, `document_texts`, `source_types`
Ingestion: `ingestion_items`, `ingestion_runs`
Regions: `cz_regions_kraj`, `cz_regions_okres`, `cz_regions_obec`
Auth: `users`
System: `doctrine_migration_versions`

FK chain: `sources` → `source_urls` → `documents` → `document_texts`

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `REDIS_URL` | Yes | Redis connection string |
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Supabase anon key |

## Commands

```bash
npm run dev      # Development server (Turbopack)
npm run build    # Production build
npm start        # Start production server
npm run lint     # ESLint
```

## When Adding New Features

1. **New page:** Create `src/app/<route>/page.tsx`, add link to `src/components/header.tsx`.
2. **New API route:** Create `src/app/api/<route>/route.ts`. Use Supabase client from `src/lib/supabase.ts` or Redis from `src/lib/redis.ts`.
3. **New UI component:** Use existing shadcn/ui primitives from `src/components/ui/`. Style with Tailwind.
4. **New database table:** Add schema definition to `src/components/database/table-schema.ts` — the CRUD UI and API will pick it up automatically.
5. **New crawler step type:** Add to `BlockType` in `simulator/types.ts`, create config component in `simulator/steps/`, add case in `simulator-sidebar.tsx` `renderConfigContent`, add conversion in `crawler-export.ts` `blockToHierarchicalStep`.
