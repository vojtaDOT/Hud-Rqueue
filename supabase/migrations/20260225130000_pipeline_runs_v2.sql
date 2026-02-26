begin;

alter table public.ingestion_runs
  add column if not exists source_id bigint,
  add column if not exists active_stage text default 'discovery',
  add column if not exists error_message text,
  add column if not exists updated_at timestamp without time zone default now();

update public.ingestion_runs r
set source_id = su.source_id
from public.source_urls su
where r.source_id is null
  and r.source_url_id = su.id;

update public.ingestion_runs
set status = case
  when lower(coalesce(status, '')) in ('pending','running','completed','failed','canceled') then lower(status)
  when lower(coalesce(status, '')) in ('processing','in_progress') then 'running'
  when lower(coalesce(status, '')) in ('done','success','ok') then 'completed'
  when lower(coalesce(status, '')) in ('error') then 'failed'
  else 'pending'
end;

update public.ingestion_runs
set active_stage = coalesce(active_stage, 'discovery');

alter table public.ingestion_runs
  alter column source_id set not null,
  alter column status set default 'pending',
  alter column started_at set default now(),
  alter column created_at set default now();

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'ingestion_runs_source_fkey'
      and conrelid = 'public.ingestion_runs'::regclass
  ) then
    alter table public.ingestion_runs
      add constraint ingestion_runs_source_fkey
      foreign key (source_id) references public.sources(id) on delete cascade;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'ingestion_runs_status_check'
      and conrelid = 'public.ingestion_runs'::regclass
  ) then
    alter table public.ingestion_runs
      add constraint ingestion_runs_status_check
      check (status in ('pending','running','completed','failed','canceled'));
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'ingestion_runs_stage_check'
      and conrelid = 'public.ingestion_runs'::regclass
  ) then
    alter table public.ingestion_runs
      add constraint ingestion_runs_stage_check
      check (active_stage in ('discovery','documents','ocr','summary'));
  end if;
end $$;

create index if not exists ingestion_runs_source_started_idx
  on public.ingestion_runs (source_id, started_at desc);

create index if not exists ingestion_runs_status_started_idx
  on public.ingestion_runs (status, started_at desc);

create index if not exists ingestion_runs_unfinished_idx
  on public.ingestion_runs (started_at desc)
  where status in ('pending','running');

alter table public.ingestion_runs replica identity full;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'ingestion_runs'
  ) then
    alter publication supabase_realtime add table public.ingestion_runs;
  end if;
end $$;

commit;
