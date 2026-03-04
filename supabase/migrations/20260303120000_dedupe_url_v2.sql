create or replace function public.normalize_dedupe_url(input text)
returns text
language sql
immutable
as $$
    with raw as (
        select lower(trim(coalesce(input, ''))) as value
    ),
    without_fragment as (
        select split_part(value, '#', 1) as value
        from raw
    ),
    parts as (
        select
            split_part(value, '?', 1) as base_part,
            split_part(value, '?', 2) as query_part
        from without_fragment
    ),
    normalized_base as (
        select
            nullif(regexp_replace(base_part, '/+$', ''), '') as base_part,
            query_part
        from parts
    ),
    filtered_query as (
        select
            base_part,
            (
                select string_agg(param, '&' order by ord)
                from unnest(string_to_array(query_part, '&')) with ordinality as query_parts(param, ord)
                where param <> ''
                  and split_part(param, '=', 1) not in (
                      'utm_source',
                      'utm_medium',
                      'utm_campaign',
                      'utm_term',
                      'utm_content',
                      'gclid',
                      'fbclid',
                      'mc_cid',
                      'mc_eid'
                  )
            ) as query_part
        from normalized_base
    )
    select nullif(
        case
            when base_part is null then ''
            when query_part is null or query_part = '' then base_part
            else base_part || '?' || query_part
        end,
        ''
    )
    from filtered_query;
$$;

do $$
begin
    if exists (
        select 1
        from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
        where c.relkind = 'i'
          and c.relname = 'sources_base_url_dedupe_uidx'
          and n.nspname = 'public'
    ) then
        execute 'reindex index public.sources_base_url_dedupe_uidx';
    end if;

    if exists (
        select 1
        from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
        where c.relkind = 'i'
          and c.relname = 'source_urls_source_id_url_dedupe_uidx'
          and n.nspname = 'public'
    ) then
        execute 'reindex index public.source_urls_source_id_url_dedupe_uidx';
    end if;

    if exists (
        select 1
        from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
        where c.relkind = 'i'
          and c.relname = 'documents_source_url_id_url_dedupe_uidx'
          and n.nspname = 'public'
    ) then
        execute 'reindex index public.documents_source_url_id_url_dedupe_uidx';
    end if;
end $$;
