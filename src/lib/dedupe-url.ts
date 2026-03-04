const TRACKING_QUERY_PARAMS = new Set([
    'utm_source',
    'utm_medium',
    'utm_campaign',
    'utm_term',
    'utm_content',
    'gclid',
    'fbclid',
    'mc_cid',
    'mc_eid',
]);

export function normalizeUrlForDedupe(value: string | null | undefined): string | null {
    if (typeof value !== 'string') return null;

    const trimmed = value.trim().toLowerCase();
    if (!trimmed) return null;

    const withoutFragment = trimmed.split('#', 1)[0] ?? '';
    const [baseRaw, queryRaw = ''] = withoutFragment.split('?', 2);
    const withoutTrailingSlash = baseRaw.replace(/\/+$/, '').trim();
    if (!withoutTrailingSlash) return null;

    if (!queryRaw) return withoutTrailingSlash;

    const filteredQueryParams = queryRaw
        .split('&')
        .map((segment) => segment.trim())
        .filter(Boolean)
        .filter((segment) => {
            const key = segment.split('=', 1)[0]?.trim() ?? '';
            return key.length > 0 && !TRACKING_QUERY_PARAMS.has(key);
        });

    if (filteredQueryParams.length < 1) return withoutTrailingSlash;

    const normalized = `${withoutTrailingSlash}?${filteredQueryParams.join('&')}`.trim();

    return normalized || null;
}
