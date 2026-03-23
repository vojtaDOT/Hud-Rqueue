export interface DiscoveredSourceUrlMeta {
    id: string;
    source_id: string;
    url?: string;
    label?: string | null;
    created_at?: string;
    updated_at?: string;
}

export interface DiscoveryItemCandidate {
    id: string;
    source_url_id: string | null;
    item_label: string | null;
    document_url: string;
    created_at: string;
    updated_at: string;
    stage: string | null;
    item_type: string | null;
}

export const PENDING_DISCOVERED_SOURCE_URL_PREFIX = 'pending:';

function normalizeLookupValue(value: string | null | undefined): string | null {
    const trimmed = value?.trim();
    return trimmed ? trimmed : null;
}

function toLookupKey(value: string): string {
    return value.trim().toLowerCase();
}

export function isPendingDiscoveredSourceUrlId(id: string): boolean {
    return id.startsWith(PENDING_DISCOVERED_SOURCE_URL_PREFIX);
}

export function buildDiscoveredSourceUrls(input: {
    items: DiscoveryItemCandidate[];
    sourceUrlMeta: DiscoveredSourceUrlMeta[];
    sourceId: string;
}): DiscoveredSourceUrlMeta[] {
    const metaById = new Map<string, DiscoveredSourceUrlMeta>();
    const metaByUrl = new Map<string, DiscoveredSourceUrlMeta>();

    for (const meta of input.sourceUrlMeta) {
        metaById.set(String(meta.id), meta);
        const normalizedUrl = normalizeLookupValue(meta.url);
        if (normalizedUrl && !metaByUrl.has(toLookupKey(normalizedUrl))) {
            metaByUrl.set(toLookupKey(normalizedUrl), meta);
        }
    }

    const discovered: DiscoveredSourceUrlMeta[] = [];
    const seenResolvedIds = new Set<string>();
    const seenPendingUrls = new Set<string>();

    for (const item of input.items) {
        if (!(item.stage === 'discovery' || item.item_type === 'source_url')) continue;

        const normalizedSourceUrlId = normalizeLookupValue(item.source_url_id);
        let resolved: DiscoveredSourceUrlMeta | null = normalizedSourceUrlId
            ? metaById.get(normalizedSourceUrlId) ?? null
            : null;

        if (!resolved) {
            const lookupCandidates = [
                normalizeLookupValue(item.document_url),
                normalizeLookupValue(item.item_label),
            ];

            for (const candidate of lookupCandidates) {
                if (!candidate) continue;
                const byUrl = metaByUrl.get(toLookupKey(candidate));
                if (byUrl) {
                    resolved = byUrl;
                    break;
                }
            }
        }

        if (resolved) {
            if (seenResolvedIds.has(resolved.id)) continue;
            seenResolvedIds.add(resolved.id);
            discovered.push(resolved);
            continue;
        }

        const fallbackUrl = normalizeLookupValue(item.document_url) ?? normalizeLookupValue(item.item_label);
        if (!fallbackUrl) continue;

        const pendingKey = toLookupKey(fallbackUrl);
        if (seenPendingUrls.has(pendingKey)) continue;
        seenPendingUrls.add(pendingKey);

        discovered.push({
            id: `${PENDING_DISCOVERED_SOURCE_URL_PREFIX}${normalizedSourceUrlId ?? item.id}`,
            source_id: input.sourceId,
            url: fallbackUrl,
            label: item.item_label ?? null,
            created_at: item.created_at,
            updated_at: item.updated_at,
        });
    }

    return discovered;
}
