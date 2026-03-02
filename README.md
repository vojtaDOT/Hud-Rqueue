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
| `/` | Dashboard — Overview, Redis queue stats, database metrics, Portainer infra telemetry |
| `/tasks` | Task Wizard — create Scrapy/OCR jobs (single or bulk) |
| `/sources` | Source Editor — visual workflow builder with iframe simulator |
| `/database` | Database Manager — full CRUD for all tables |
| `/data` | Data Seeder — seed reference data |
| `/infra` | Infra Documents Storage Manager — R2 `documents/` cleanup + duplicate audit |

## Environment Variables

| Variable | Description |
|----------|-------------|
| `REDIS_URL` | Redis connection string |
| `DEV` | Optional debug toggle for `/pipeline` (`true`,`1`,`yes`,`on` => enabled) |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon/public key |
| `R2_ACCOUNT_ID` | Cloudflare account ID used for R2 endpoint |
| `R2_ACCESS_KEY_ID` | Cloudflare R2 S3 access key ID |
| `R2_SECRET_ACCESS_KEY` | Cloudflare R2 S3 secret access key |
| `R2_BUCKET` | R2 bucket name |
| `R2_ENDPOINT` | Optional S3 endpoint override |
| `PORTAINER_BASE_URL` | Base URL of Portainer instance (for dashboard infra tab) |
| `PORTAINER_API_TOKEN` | Portainer API token used for read-only Docker endpoint calls |
| `PORTAINER_ENDPOINT_ID` | Portainer endpoint id to monitor |
| `PORTAINER_REQUEST_TIMEOUT_MS` | Optional request timeout (default `8000`) |
| `INFRA_STREAM_INTERVAL_MS` | Optional SSE refresh interval in ms (default `5000`) |
| `INFRA_ENABLE_LOCAL_PROBES` | Optional local host probe toggle (`true`/`false`, default `true`) |

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
   | `PORTAINER_BASE_URL` | `https://portainer.example.com` |
   | `PORTAINER_API_TOKEN` | `ptr_xxx...` |
   | `PORTAINER_ENDPOINT_ID` | `1` |
   | `INFRA_ENABLE_LOCAL_PROBES` | `true` |

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

## Portainer Dashboard Setup

1. In Portainer, generate a read-only API token for the target environment.
2. Find the endpoint id from the Portainer UI URL or endpoint details page.
3. Set `PORTAINER_BASE_URL`, `PORTAINER_API_TOKEN`, and `PORTAINER_ENDPOINT_ID` in `.env.local`.
4. Open `/` and switch to the `Infra` tab.

The infra tab combines Portainer container stats with local probes from the HUD runtime. When HUD runs in Docker, local probe memory/disk values can reflect container cgroup limits instead of full VPS capacity.

## Build

```bash
npm run build    # Production build
npm start        # Start production server
```
