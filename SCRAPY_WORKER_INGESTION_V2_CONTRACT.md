# Scrapy Worker Ingestion V2 Contract (Pipeline Runs + Items)

Tento dokument definuje, jak má Scrapy worker zapisovat do `ingestion_runs` a `ingestion_items`, aby `/pipeline` stránka v Queue aplikaci fungovala konzistentně (Aktivní runy, Historie, detail kroků Discovery/Documents/OCR).

## 1. Cíl integrace

- `ingestion_runs` = 1 pipeline běh na 1 kliknutí `Run` pro 1 `source_id`.
- `ingestion_items` = aktuální stav položek v běhu (stavová tabulka, ne append-only event log).
- UI `/pipeline` čte detail kroku primárně z `ingestion_items.stage + item_type + status`.
- `run_id` musí téct přes celý lifecycle jobů (discovery -> download -> ocr).

## 2. Předpoklady

1. V Supabase jsou aplikované migrace:
- `20260225130000_pipeline_runs_v2.sql`
- `20260225130100_pipeline_items_v2.sql`

2. Queue API při create jobu zapisuje do Redis `job:{id}.run_id`.

3. Worker čte `run_id` z Redis job hash a propaguje ho do follow-up jobů.

## 3. Redis job input (worker)

Worker musí číst minimálně:

- `id`
- `task` (`discover` | `download` | `ocr`)
- `run_id`
- `source_id`
- `source_url_id` (pro download)
- `document_id` (pro ocr)
- `manual`

### Pravidlo

- Pokud `run_id` chybí u legacy jobu, worker má logovat warning a fallbacknout na kompatibilní mód.
- Pro V2 pipeline je `run_id` povinný.

## 4. `ingestion_runs` lifecycle contract

## 4.1 Stavový model runu

- `pending`
- `running`
- `completed`
- `failed`
- `canceled`

## 4.2 Stage runu (`active_stage`)

- `discovery`
- `documents`
- `ocr`
- `summary`

## 4.3 Přechody

1. Při claimu prvního jobu v runu:
- `status = running`
- `active_stage` dle tasku (`discover -> discovery`, `download -> documents`, `ocr -> ocr`)
- `updated_at = now()`

2. Po dokončení všech kroků bez chyby:
- `status = completed`
- `active_stage = summary`
- `finished_at = now()`

3. Pokud selže část runu a už se nepokračuje:
- `status = failed`
- `error_message` stručně
- `finished_at = now()`

4. `stats_json` aktualizovat průběžně (viz sekce 8).

## 5. `ingestion_items` contract

Tabulka je stavová. Zápis musí být `UPSERT` přes unikát `(run_id, item_key)`.

## 5.1 Povinné sloupce při zápisu

- `run_id`
- `source_id`
- `item_key`
- `stage`
- `item_type`
- `status`
- `last_seen_at`

## 5.2 Doporučené sloupce

- `source_url_id`
- `document_id`
- `document_url`
- `filename`
- `job_id`
- `ingest_reason`
- `error_message`, `last_error_message`
- `needs_review`, `review_reason`
- `context_json`, `payload_json`

## 5.3 Enumy

### stage
- `discovery`
- `documents`
- `ocr`

### item_type
- `source_url`
- `document`
- `ocr_job`

### status
- `pending`
- `running`
- `completed`
- `failed`
- `canceled`
- `skipped`
- `review_required`

## 5.4 Item key pravidla (deterministická identita)

Používej přesně tato pravidla, v tomto pořadí:

1. Discovery URL item:
- `item_key = source_url:{source_url_id}`
- fallback bez `source_url_id`: `item_key = source_url_url:{sha256(normalized_url)}`

2. Download/document item:
- `item_key = document:{document_id}`
- fallback bez `document_id`: `item_key = document_url:{sha256(normalized_document_url)}`

3. OCR item:
- `item_key = ocr_job:{document_id}`
- fallback bez `document_id`: `item_key = ocr_job_url:{sha256(normalized_document_url)}`

`item_key` se po prvním vytvoření nemá měnit.

## 6. Co zapisovat v jednotlivých krocích

## 6.1 Discovery

Pro každou nalezenou URL zapisuj/upsertuj item:

- `stage = discovery`
- `item_type = source_url`
- `status = completed` (nebo `running` -> `completed`)
- `source_url_id` pokud existuje
- `document_url` může obsahovat discovered URL
- `item_label` = titul/label URL pokud je k dispozici

Při discovery chybě:
- `status = failed`
- `last_error_message` + `error_message`

## 6.2 Documents (download / ingest)

Pro každý dokument zapisuj/upsertuj item:

- `stage = documents`
- `item_type = document`
- `status` dle výsledku (`running/completed/failed/skipped`)
- `document_id`, `source_url_id`, `document_url`, `filename`, `file_checksum`, `file_kind`

## 6.3 OCR

Pro každý OCR job zapisuj/upsertuj item:

- `stage = ocr`
- `item_type = ocr_job`
- `status` dle výsledku
- `document_id`, `source_url_id`, `job_id`
- `needs_review/review_reason` pokud text quality gate neprojde

## 7. UPSERT šablona (SQL)

```sql
insert into public.ingestion_items (
  run_id,
  source_id,
  source_url_id,
  document_id,
  item_key,
  item_label,
  stage,
  item_type,
  status,
  ingest_status,
  ingest_reason,
  job_id,
  document_url,
  filename,
  file_checksum,
  file_kind,
  error_message,
  last_error_message,
  needs_review,
  review_reason,
  context_json,
  payload_json,
  first_seen_at,
  last_seen_at,
  created_at,
  updated_at
)
values (
  :run_id,
  :source_id,
  :source_url_id,
  :document_id,
  :item_key,
  :item_label,
  :stage,
  :item_type,
  :status,
  :status,
  :ingest_reason,
  :job_id,
  :document_url,
  :filename,
  :file_checksum,
  :file_kind,
  :error_message,
  :last_error_message,
  :needs_review,
  :review_reason,
  coalesce(:context_json, '{}'::jsonb),
  :payload_json,
  now(),
  now(),
  now(),
  now()
)
on conflict (run_id, item_key)
do update set
  source_id = excluded.source_id,
  source_url_id = coalesce(excluded.source_url_id, ingestion_items.source_url_id),
  document_id = coalesce(excluded.document_id, ingestion_items.document_id),
  item_label = coalesce(excluded.item_label, ingestion_items.item_label),
  stage = excluded.stage,
  item_type = excluded.item_type,
  status = excluded.status,
  ingest_status = excluded.status,
  ingest_reason = coalesce(excluded.ingest_reason, ingestion_items.ingest_reason),
  job_id = coalesce(excluded.job_id, ingestion_items.job_id),
  document_url = coalesce(excluded.document_url, ingestion_items.document_url),
  filename = coalesce(excluded.filename, ingestion_items.filename),
  file_checksum = coalesce(excluded.file_checksum, ingestion_items.file_checksum),
  file_kind = coalesce(excluded.file_kind, ingestion_items.file_kind),
  error_message = coalesce(excluded.error_message, ingestion_items.error_message),
  last_error_message = coalesce(excluded.last_error_message, ingestion_items.last_error_message),
  needs_review = coalesce(excluded.needs_review, ingestion_items.needs_review),
  review_reason = coalesce(excluded.review_reason, ingestion_items.review_reason),
  context_json = coalesce(excluded.context_json, ingestion_items.context_json),
  payload_json = coalesce(excluded.payload_json, ingestion_items.payload_json),
  last_seen_at = now(),
  updated_at = now();
```

## 8. `stats_json` doporučený tvar v `ingestion_runs`

```json
{
  "discovery": {"total": 0, "completed": 0, "failed": 0},
  "documents": {"total": 0, "completed": 0, "failed": 0, "skipped": 0},
  "ocr": {"total": 0, "completed": 0, "failed": 0, "review_required": 0},
  "updated_at": "2026-02-25T13:00:00Z"
}
```

## 9. Run-level update šablona

```sql
update public.ingestion_runs
set
  status = :status,
  active_stage = :active_stage,
  error_message = :error_message,
  stats_json = :stats_json,
  finished_at = :finished_at,
  updated_at = now()
where id = :run_id;
```

## 10. Idempotence a retry pravidla

1. Nikdy nevytvářej nový item řádek pro stejný `(run_id, item_key)`.
2. Retry stejného jobu musí jen updatovat existující item.
3. `status` se může měnit např. `pending -> running -> completed/failed`.
4. `last_error_message` drž poslední chybu, `error_message` může držet první/hlavní.

## 11. Co UI `/pipeline` očekává

Aby UI správně renderovalo:

- Discovery seznam: `stage=discovery` nebo `item_type=source_url`
- Download/Documents seznam: `stage=documents` nebo `item_type=document`
- OCR seznam: `stage=ocr` nebo `item_type=ocr_job`
- Error panely: `error_message`, `last_error_message`, `review_reason`, `needs_review`, `status=failed/review_required`
- Aktivní runy: `ingestion_runs.status in ('pending','running')`
- Historie: `ingestion_runs.status in ('completed','failed','canceled')`

## 12. Minimální implementační checklist pro worker

1. Převzít `run_id` z job inputu a propagovat ho do child jobů.
2. Při každém významném kroku upsertnout `ingestion_items` přes `(run_id,item_key)`.
3. Aktualizovat `ingestion_runs.active_stage/status/stats_json`.
4. Korektně zavřít run (`completed` nebo `failed`) v terminálním stavu.
5. Nepoužívat append-only zápis pro itemy v rámci stejného `item_key`.

---

Pokud worker používá Supabase client místo raw SQL, musí zachovat stejnou semantiku:

- stejný `item_key`
- stejné enum hodnoty
- stejnou idempotentní upsert logiku
- stejný run lifecycle model
