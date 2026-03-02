import { supabase } from '@/lib/supabase';
import { normalizeUrlForDedupe } from '@/lib/dedupe-url';

const PAGE_SIZE = 1000;

export interface DuplicateConflict {
    table: 'sources' | 'source_urls' | 'documents';
    key: string;
    existing_id: string;
    input: Record<string, unknown>;
}

export async function findSourceDuplicate(baseUrl: string, excludeId?: string): Promise<DuplicateConflict | null> {
    const normalized = normalizeUrlForDedupe(baseUrl);
    if (!normalized) return null;

    let from = 0;
    while (true) {
        const { data, error } = await supabase
            .from('sources')
            .select('id, base_url')
            .range(from, from + PAGE_SIZE - 1);

        if (error) throw new Error(error.message);

        const rows = data ?? [];
        for (const row of rows) {
            const rowId = String(row.id);
            if (excludeId && rowId === excludeId) continue;

            const rowUrl = typeof row.base_url === 'string' ? row.base_url : '';
            if (normalizeUrlForDedupe(rowUrl) === normalized) {
                return {
                    table: 'sources',
                    key: normalized,
                    existing_id: rowId,
                    input: { base_url: baseUrl },
                };
            }
        }

        if (rows.length < PAGE_SIZE) break;
        from += PAGE_SIZE;
    }

    return null;
}

export async function findSourceUrlDuplicate(sourceId: string, url: string, excludeId?: string): Promise<DuplicateConflict | null> {
    const normalized = normalizeUrlForDedupe(url);
    if (!normalized) return null;

    let from = 0;
    while (true) {
        const { data, error } = await supabase
            .from('source_urls')
            .select('id, source_id, url')
            .eq('source_id', sourceId)
            .range(from, from + PAGE_SIZE - 1);

        if (error) throw new Error(error.message);

        const rows = data ?? [];
        for (const row of rows) {
            const rowId = String(row.id);
            if (excludeId && rowId === excludeId) continue;

            const rowUrl = typeof row.url === 'string' ? row.url : '';
            if (normalizeUrlForDedupe(rowUrl) === normalized) {
                return {
                    table: 'source_urls',
                    key: `${sourceId}::${normalized}`,
                    existing_id: rowId,
                    input: { source_id: sourceId, url },
                };
            }
        }

        if (rows.length < PAGE_SIZE) break;
        from += PAGE_SIZE;
    }

    return null;
}

export async function findDocumentDuplicate(sourceUrlId: string, url: string, excludeId?: string): Promise<DuplicateConflict | null> {
    const normalized = normalizeUrlForDedupe(url);
    if (!normalized) return null;

    let from = 0;
    while (true) {
        const { data, error } = await supabase
            .from('documents')
            .select('id, source_url_id, url')
            .eq('source_url_id', sourceUrlId)
            .is('deleted_at', null)
            .range(from, from + PAGE_SIZE - 1);

        if (error) throw new Error(error.message);

        const rows = data ?? [];
        for (const row of rows) {
            const rowId = String(row.id);
            if (excludeId && rowId === excludeId) continue;

            const rowUrl = typeof row.url === 'string' ? row.url : '';
            if (normalizeUrlForDedupe(rowUrl) === normalized) {
                return {
                    table: 'documents',
                    key: `${sourceUrlId}::${normalized}`,
                    existing_id: rowId,
                    input: { source_url_id: sourceUrlId, url },
                };
            }
        }

        if (rows.length < PAGE_SIZE) break;
        from += PAGE_SIZE;
    }

    return null;
}
