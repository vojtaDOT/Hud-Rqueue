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
| `NEXT_PUBLIC_QUEUE_OPERATOR_URL` | Optional base URL for Scrapy API / Queue Operator (`/jobs/*`, `/sources/*` progress endpoints) |
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

## Production Release — Ubuntu VPS + Portainer + NPM

This repo builds/deploys the **HUD Queue web app**.  
`scrapy-api` and `scrapy-worker` services are typically deployed as separate images/services in Portainer.

### Recommended topology

- `hud-queue` (this repo, Next.js app)
- `scrapy-api` (Queue Operator / worker orchestrator HTTP API)
- `scrapy-worker-1` to `scrapy-worker-4` (default 4 workers)
- NPM (Nginx Proxy Manager) routing:
- `queue.example.com` -> `hud-queue:3000`
- `scrapy-api.example.com` -> `scrapy-api:8000` (or your API port)

### Release checklist

1. Build and push image tags (immutable tags recommended, e.g. git SHA).
2. In Portainer, update stack image tags:
- first `scrapy-api`
- then `scrapy-worker-1..4`
- finally `hud-queue`
3. Redeploy stack(s) with pull enabled.
4. Verify health:
- `hud-queue` is reachable and UI loads
- Scrapy API progress endpoints return `200`
- workers are `running` and connected to Redis
5. Run smoke:
- create one `source` in `/sources`
- enqueue one discovery run in `/pipeline` or `/tasks`
- verify jobs transition `pending -> processing -> completed/failed` with visible status
6. Rollback plan:
- revert tags in Portainer to previous known-good release
- redeploy in reverse order (`hud-queue` -> workers -> API) if needed

### Portainer stack example (default 4 workers, standalone Docker)

Use this when Portainer runs in **standalone Docker** mode (non-Swarm).

```yaml
services:
  hud-queue:
    image: ghcr.io/<your-org>/hud-queue:<release-tag>
    restart: unless-stopped
    ports:
      - "3000:3000"
    environment:
      - REDIS_URL=${REDIS_URL}
      - DEV=false
      - NEXT_PUBLIC_SUPABASE_URL=${NEXT_PUBLIC_SUPABASE_URL}
      - NEXT_PUBLIC_SUPABASE_ANON_KEY=${NEXT_PUBLIC_SUPABASE_ANON_KEY}
      - NEXT_PUBLIC_QUEUE_OPERATOR_URL=${NEXT_PUBLIC_QUEUE_OPERATOR_URL}
      - PORTAINER_BASE_URL=${PORTAINER_BASE_URL}
      - PORTAINER_API_TOKEN=${PORTAINER_API_TOKEN}
      - PORTAINER_ENDPOINT_ID=${PORTAINER_ENDPOINT_ID}

  scrapy-api:
    image: ghcr.io/<your-org>/scrapy-api:<release-tag>
    restart: unless-stopped
    ports:
      - "8000:8000"
    environment:
      - REDIS_URL=${REDIS_URL}
      - SUPABASE_URL=${NEXT_PUBLIC_SUPABASE_URL}
      - SUPABASE_ANON_KEY=${NEXT_PUBLIC_SUPABASE_ANON_KEY}

  scrapy-worker-1:
    image: ghcr.io/<your-org>/scrapy-worker:<release-tag>
    restart: unless-stopped
    environment: &worker-env
      - REDIS_URL=${REDIS_URL}
      - SUPABASE_URL=${NEXT_PUBLIC_SUPABASE_URL}
      - SUPABASE_ANON_KEY=${NEXT_PUBLIC_SUPABASE_ANON_KEY}
      - SCRAPY_API_URL=http://scrapy-api:8000

  scrapy-worker-2:
    image: ghcr.io/<your-org>/scrapy-worker:<release-tag>
    restart: unless-stopped
    environment: *worker-env

  scrapy-worker-3:
    image: ghcr.io/<your-org>/scrapy-worker:<release-tag>
    restart: unless-stopped
    environment: *worker-env

  scrapy-worker-4:
    image: ghcr.io/<your-org>/scrapy-worker:<release-tag>
    restart: unless-stopped
    environment: *worker-env
```

### If you run Docker Swarm in Portainer

You can use one worker service with replicas instead:

```yaml
services:
  scrapy-worker:
    image: ghcr.io/<your-org>/scrapy-worker:<release-tag>
    environment:
      - REDIS_URL=${REDIS_URL}
      - SUPABASE_URL=${NEXT_PUBLIC_SUPABASE_URL}
      - SUPABASE_ANON_KEY=${NEXT_PUBLIC_SUPABASE_ANON_KEY}
      - SCRAPY_API_URL=http://scrapy-api:8000
    deploy:
      replicas: 4
      restart_policy:
        condition: any
```

## Build

```bash
npm run build    # Production build
npm start        # Start production server
```
