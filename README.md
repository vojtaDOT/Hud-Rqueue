# HUD Queue

Internal web scraping automation platform. Visual workflow builder, Redis job queue, Supabase (PostgreSQL/Citus) database management, real-time monitoring.

## Tech Stack

- **Frontend:** Next.js 16 (App Router), React 19, Tailwind CSS, shadcn/ui, dnd-kit
- **Queue:** Redis (ioredis)
- **Database:** PostgreSQL/Citus via Supabase
- **Rendering:** Playwright (optional, for JS-heavy pages)

## Pages

| Route | Description |
|-------|-------------|
| `/` | Dashboard — Redis queue stats, worker performance, database metrics |
| `/tasks` | Task Wizard — create Scrapy/OCR jobs (single or bulk) |
| `/sources` | Source Editor — visual workflow builder with iframe simulator |
| `/database` | Database Manager — full CRUD for all tables |
| `/data` | Data Seeder — seed reference data |

## Environment Variables

| Variable | Description |
|----------|-------------|
| `REDIS_URL` | Redis connection string |
| `DEV` | Optional debug toggle for `/pipeline` (`true`,`1`,`yes`,`on` => enabled) |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon/public key |

## Setup — Localhost

```bash
# 1. Install dependencies
npm install

# 2. Copy env template and fill in values
cp .env.example .env.local

# 3. Start dev server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Setup — Docker

```bash
# 1. Copy env and fill in values
cp .env.example .env.local

# 2. Build and run
docker compose up --build -d
```

The app runs on port `3000`. Redis and Supabase are external services — configure their URLs in `.env.local`.

## Setup — Portainer Stack

1. In Portainer, go to **Stacks → Add stack**.
2. Use **Repository** method pointing to this repo, or paste the compose file below.
3. Add environment variables in the **Environment variables** section:

   | Name | Value |
   |------|-------|
   | `REDIS_URL` | `redis://...` |
   | `DEV` | `false` |
   | `NEXT_PUBLIC_SUPABASE_URL` | `https://your-project.supabase.co` |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `your-anon-key` |

4. Click **Deploy the stack**.

### Stack compose file

```yaml
services:
  app:
    build:
      context: .
      dockerfile: Dockerfile
      args:
        NEXT_PUBLIC_SUPABASE_URL: ${NEXT_PUBLIC_SUPABASE_URL}
        NEXT_PUBLIC_SUPABASE_ANON_KEY: ${NEXT_PUBLIC_SUPABASE_ANON_KEY}
    ports:
      - "3000:3000"
    environment:
      - REDIS_URL=${REDIS_URL}
      - DEV=${DEV}
      - NEXT_PUBLIC_SUPABASE_URL=${NEXT_PUBLIC_SUPABASE_URL}
      - NEXT_PUBLIC_SUPABASE_ANON_KEY=${NEXT_PUBLIC_SUPABASE_ANON_KEY}
    restart: unless-stopped
```

> **Note:** If deploying from a pre-built image (e.g. pushed to a registry), replace the `build` section with `image: your-registry/hud-queue:latest` and pass the `NEXT_PUBLIC_*` vars at runtime.

## Build

```bash
npm run build    # Production build
npm start        # Start production server
```
