begin;

alter table public.ingestion_items
  add column if not exists source_id bigint,
  add column if not exists item_key text,
  add column if not exists stage text,
  add column if not exists item_type text,
  add column if not exists status text,
  add column if not exists job_id text,
  add column if not exists item_label text,
  add column if not exists step_order smallint,
  add column if not exists context_json jsonb default '{}'::jsonb,
  add column if not exists first_seen_at timestamp without time zone default now(),
  add column if not exists last_seen_at timestamp without time zone default now();

update public.ingestion_items i
set source_id = su.source_id
from public.source_urls su
where i.source_id is null
  and i.source_url_id = su.id;

update public.ingestion_items
set item_key = coalesce(
  item_key,
  case
    when document_id is not null then 'document:' || document_id::text
    when source_url_id is not null then 'source_url:' || source_url_id::text
    when document_url is not null and document_url <> '' then 'url:' || md5(document_url)
    else 'item:' || id::text
  end
);

update public.ingestion_items
set stage = coalesce(
  stage,
  case
    when coalesce(ingest_reason, '') ilike '%ocr%' then 'ocr'
    when document_id is not null and coalesce(ingest_reason, '') ilike '%process%' then 'ocr'
    when document_id is not null then 'documents'
    else 'discovery'
  end
);

update public.ingestion_items
set item_type = coalesce(
  item_type,
  case
    when stage = 'ocr' then 'ocr_job'
    when stage = 'documents' then 'document'
    else 'source_url'
  end
);

update public.ingestion_items
set status = coalesce(
  status,
  case
    when lower(coalesce(ingest_status, '')) in ('pending') then 'pending'
    when lower(coalesce(ingest_status, '')) in ('processing','running','in_progress') then 'running'
    when lower(coalesce(ingest_status, '')) in ('done','ok','success','completed') then 'completed'
    when lower(coalesce(ingest_status, '')) in ('failed','fail','error') then 'failed'
    when lower(coalesce(ingest_status, '')) in ('canceled','cancelled') then 'canceled'
    when lower(coalesce(ingest_status, '')) in ('skipped') then 'skipped'
    when needs_review = true then 'review_required'
    else 'pending'
  end
);

update public.ingestion_items
set item_label = coalesce(item_label, filename, document_url, item_key);

alter table public.ingestion_items
  alter column item_key set not null,
  alter column stage set not null,
  alter column item_type set not null,
  alter column status set not null,
  alter column first_seen_at set default now(),
  alter column last_seen_at set default now();

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'ingestion_items_run_fkey'
      and conrelid = 'public.ingestion_items'::regclass
  ) then
    alter table public.ingestion_items
      add constraint ingestion_items_run_fkey
      foreign key (run_id) references public.ingestion_runs(id) on delete cascade;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'ingestion_items_source_fkey'
      and conrelid = 'public.ingestion_items'::regclass
  ) then
    alter table public.ingestion_items
      add constraint ingestion_items_source_fkey
      foreign key (source_id) references public.sources(id) on delete cascade;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'ingestion_items_stage_check'
      and conrelid = 'public.ingestion_items'::regclass
  ) then
    alter table public.ingestion_items
      add constraint ingestion_items_stage_check
      check (stage in ('discovery','documents','ocr'));
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'ingestion_items_item_type_check'
      and conrelid = 'public.ingestion_items'::regclass
  ) then
    alter table public.ingestion_items
      add constraint ingestion_items_item_type_check
      check (item_type in ('source_url','document','ocr_job'));
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'ingestion_items_status_check'
      and conrelid = 'public.ingestion_items'::regclass
  ) then
    alter table public.ingestion_items
      add constraint ingestion_items_status_check
      check (status in ('pending','running','completed','failed','canceled','skipped','review_required'));
  end if;
end $$;

create unique index if not exists ingestion_items_run_item_key_uidx
  on public.ingestion_items (run_id, item_key)
  where run_id is not null;

create index if not exists ingestion_items_run_stage_idx
  on public.ingestion_items (run_id, stage, last_seen_at desc);

create index if not exists ingestion_items_run_status_idx
  on public.ingestion_items (run_id, status);

create index if not exists ingestion_items_source_idx
  on public.ingestion_items (source_id, last_seen_at desc);

create index if not exists ingestion_items_source_url_idx
  on public.ingestion_items (source_url_id, last_seen_at desc);

create index if not exists ingestion_items_document_idx
  on public.ingestion_items (document_id, last_seen_at desc);

create index if not exists ingestion_items_job_idx
  on public.ingestion_items (job_id);

create or replace function public.sync_ingestion_item_status()
returns trigger
language plpgsql
as $$
begin
  if new.status is null and new.ingest_status is not null then
    new.status := case
      when lower(coalesce(new.ingest_status, '')) in ('pending') then 'pending'
      when lower(coalesce(new.ingest_status, '')) in ('processing','running','in_progress') then 'running'
      when lower(coalesce(new.ingest_status, '')) in ('done','ok','success','completed') then 'completed'
      when lower(coalesce(new.ingest_status, '')) in ('failed','fail','error') then 'failed'
      when lower(coalesce(new.ingest_status, '')) in ('canceled','cancelled') then 'canceled'
      when lower(coalesce(new.ingest_status, '')) in ('skipped') then 'skipped'
      else 'pending'
    end;
  end if;

  if new.status is not null then
    new.ingest_status := new.status;
  end if;

  if tg_op = 'INSERT' and new.first_seen_at is null then
    new.first_seen_at := now();
  end if;

  new.last_seen_at := now();
  return new;
end;
$$;

drop trigger if exists trg_sync_ingestion_item_status on public.ingestion_items;

create trigger trg_sync_ingestion_item_status
before insert or update on public.ingestion_items
for each row
execute function public.sync_ingestion_item_status();

alter table public.ingestion_items replica identity full;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'ingestion_items'
  ) then
    alter publication supabase_realtime add table public.ingestion_items;
  end if;
end $$;

commit;
