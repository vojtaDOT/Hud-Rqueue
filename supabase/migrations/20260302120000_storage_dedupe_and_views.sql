create or replace function public.normalize_dedupe_url(input text)
returns text
language sql
immutable
as $$
    select nullif(
        regexp_replace(
            split_part(lower(trim(coalesce(input, ''))), '#', 1),
            '/+$',
            ''
        ),
        ''
    );
$$;

create unique index if not exists sources_base_url_dedupe_uidx
    on public.sources (public.normalize_dedupe_url(base_url));

create unique index if not exists source_urls_source_id_url_dedupe_uidx
    on public.source_urls (source_id, public.normalize_dedupe_url(url));

create unique index if not exists documents_source_url_id_url_dedupe_uidx
    on public.documents (source_url_id, public.normalize_dedupe_url(url))
    where deleted_at is null;

create index if not exists documents_source_url_id_checksum_idx
    on public.documents (source_url_id, checksum)
    where deleted_at is null and checksum is not null;

create or replace view public.v_duplicate_sources as
select
    public.normalize_dedupe_url(base_url) as dedupe_key,
    count(*) as duplicate_count,
    array_agg(id order by id) as row_ids
from public.sources
where public.normalize_dedupe_url(base_url) is not null
group by public.normalize_dedupe_url(base_url)
having count(*) > 1;

create or replace view public.v_duplicate_source_urls as
select
    source_id,
    public.normalize_dedupe_url(url) as dedupe_key,
    count(*) as duplicate_count,
    array_agg(id order by id) as row_ids
from public.source_urls
where public.normalize_dedupe_url(url) is not null
group by source_id, public.normalize_dedupe_url(url)
having count(*) > 1;

create or replace view public.v_duplicate_documents_url as
select
    source_url_id,
    public.normalize_dedupe_url(url) as dedupe_key,
    count(*) as duplicate_count,
    array_agg(id order by id) as row_ids
from public.documents
where deleted_at is null
  and public.normalize_dedupe_url(url) is not null
group by source_url_id, public.normalize_dedupe_url(url)
having count(*) > 1;

create or replace view public.v_duplicate_documents_checksum as
select
    checksum,
    count(*) as duplicate_count,
    array_agg(id order by id) as row_ids
from public.documents
where deleted_at is null
  and checksum is not null
  and btrim(checksum) <> ''
group by checksum
having count(*) > 1;
