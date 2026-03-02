export function normalizeUrlForDedupe(value: string | null | undefined): string | null {
    if (typeof value !== 'string') return null;

    const trimmed = value.trim().toLowerCase();
    if (!trimmed) return null;

    const withoutFragment = trimmed.split('#', 1)[0] ?? '';
    const withoutTrailingSlash = withoutFragment.replace(/\/+$/, '');
    const normalized = withoutTrailingSlash.trim();

    return normalized || null;
}
