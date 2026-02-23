# Queue-Operator Worker Error Integration Handoff

## Purpose
This handoff is for an integration agent implementing end-to-end worker error visibility in HUD Queue Manual Pipeline UI.

Goal:
- show worker-level failures in `/pipeline`
- keep progress polling via Queue-Operator
- surface error details from both queue state and ingestion DB

Scope:
- frontend consumption contract
- orchestrator/worker payload and write-path requirements
- validation checklist

Out of scope:
- redesign of queue model
- websocket migration (REST polling stays)

---

## Current UI Integration (already prepared)

Frontend is already wired in:
- `/Users/vojtechstehlik/Documents/GitHub/HUD/queue/src/components/pipeline/manual-pipeline.tsx`

### 1) Queue-Operator progress polling
The page polls:
- `GET /jobs/{job_id}/progress`
- `GET /sources/{source_id}/progress`

Behavior already in UI:
- poll interval `3s` + jitter
- request timeout `4s`
- stale threshold `15s` from `updated_at`
- primary progress source: job `progress_pct`
- fallback: source `aggregate_progress_pct`
- UI shows `status`, `phase`, `step`, stale badge, connection status

Env for remote operator:
- `NEXT_PUBLIC_QUEUE_OPERATOR_URL`
  - if unset, frontend calls relative paths `/jobs/...` and `/sources/...`

### 2) Redis queue error surface
UI already reads Redis job hash via internal API and shows:
- `job.error_message` (per step)
- status in `pending|processing|completed|failed`

### 3) Ingestion DB error surface
UI already reads:
- `ingestion_runs`
- `ingestion_items`

And surfaces (priority order):
1. `ingestion_items.last_error_message`
2. `ingestion_items.error_message`
3. `ingestion_items.review_reason`
4. `needs_review=true`
5. problematic `ingest_status`

---

## Required Queue-Operator Contract

### GET `/jobs/{job_id}/progress`
Must return:
- `job_id`
- `parent_job_id`
- `source_id`
- `task_type`
- `attempt`
- `status` (`queued|processing|completed|failed`)
- `phase`
- `step`
- `progress_pct`
- `units_completed`
- `units_total`
- `children_total`
- `children_completed`
- `children_failed`
- `started_at`
- `updated_at`
- `completed_at`
- `error`

`error` is the canonical worker/orchestrator failure message for the progress API.

### GET `/sources/{source_id}/progress`
Must return:
- `source_id`
- `active_jobs[]` (job snapshots in `queued|processing`)
- `aggregate_progress_pct`
- `status`
- `updated_at`

---

## What Orchestrator Must Implement

## 1) Propagate worker failures into progress endpoint
When a worker fails:
- set job `status = "failed"`
- set `error = "<human readable message>"`
- set `phase`, `step` to the failure location
- update `updated_at` and `completed_at`

Do not return generic-only messages like `"worker failed"`.
Prefer actionable message:
- spider name
- failing URL or entity id
- failure class/code
- concise reason

## 2) Propagate worker failures into Redis hash
For `job:{id}` hash:
- `status=failed`
- `error_message=<same or equivalent failure message>`

This is required because UI shows Redis errors as fallback/parallel signal.

## 3) Propagate worker failures into ingestion tables
For failed ingestion item:
- `ingestion_items.ingest_status = 'failed'` (or equivalent failure status)
- `ingestion_items.last_error_message` must be populated
- optionally `error_message`, `review_reason`
- `needs_review=true` when human review needed

For failed run:
- `ingestion_runs.status` indicates failure
- `finished_at` populated

## 4) Attempt semantics
On retry:
- increment `attempt` in progress payload
- progress can reset for new attempt
- keep previous failure reason in history/log, but current `error` should represent current terminal failure (if failed)

---

## Worker Requirements

Each scrapy worker should return/report structured failure data at minimum:
- `job_id`
- `source_id`
- `attempt`
- `phase`
- `step`
- `error_code` (optional but recommended)
- `error_message` (required)
- `worker_id`/hostname (recommended)
- timestamp

Recommended normalization:
- strip very long traces from UI message
- keep full traceback in logs, but push compact root-cause text into `error`/`error_message`

---

## Error Mapping Rules Used by UI

Priority shown in step error panels:
1. Redis `job.error_message`
2. Ingestion item `last_error_message`
3. Ingestion item `error_message`
4. Ingestion item `review_reason`
5. Ingestion item `needs_review`
6. Ingestion run failing `status`

Queue-Operator `job.error` should be treated as source-of-truth in progress view.
Redis + ingestion are operational corroboration.

---

## HTTP/Error Semantics Required

For progress endpoints:
- `200` valid shape
- `400` invalid id
- `404` unknown/expired id
- `5xx` transient failure

UI behavior expects:
- timeout/network failure => keep last snapshot + stale indicator
- recovery => replace stale state with fresh payload
- terminal `completed|failed` => stop detail polling path for finished job

---

## Known Edge Cases (must support)

1. Parent without children:
- `children_total=0` with `processing` is valid.

2. Child failure while parent processing:
- parent may stay `processing`
- `children_failed` must increment

3. Retry attempt reset:
- new attempt can lower `progress_pct` vs old attempt
- monotonicity is evaluated only within same attempt

4. Partial DB write:
- if Redis marks failed before ingestion row write, UI should still show Redis error
- orchestrator should eventually backfill ingestion error rows when possible

---

## Integration Smoke Scenario

1. Enqueue discover job for source.
2. Worker throws controlled failure in known phase/step.
3. Verify `/jobs/{id}/progress` returns:
- `status=failed`
- `error` non-empty
- `phase`, `step` non-empty
- `completed_at` non-null
4. Verify Redis `job:{id}` has `error_message`.
5. Verify `ingestion_items.last_error_message` (or equivalent fallback fields) contains failure reason.
6. Open `/pipeline` and confirm failure appears in relevant step error panel.

---

## Acceptance Checklist

- [ ] Queue-Operator job progress includes `error`, `phase`, `step`, `attempt`, `updated_at`.
- [ ] Worker failure propagates to orchestrator progress state in under one poll cycle.
- [ ] Redis `job.error_message` populated on failure.
- [ ] Ingestion item failure message persisted in DB.
- [ ] `/pipeline` shows the same failure context in step panel (not generic placeholder).
- [ ] Retry attempt produces incremented `attempt`.
- [ ] Stale data behavior works when operator endpoint is temporarily unavailable.

---

## Optional Recommended Enhancements

For better multi-worker diagnostics, add to `/jobs/{job_id}/progress`:
- `worker_id`
- `worker_name`
- `error_code`

UI can then show:
- `worker_name + error_code + error` in error panel.

