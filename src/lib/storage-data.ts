import { supabase } from '@/lib/supabase';
import { normalizeUrlForDedupe } from '@/lib/dedupe-url';
import { extractDocumentBlobRef } from '@/lib/document-blob';

const PAGE_SIZE = 1000;

export interface SourceRow {
    id: string;
    name: string | null;
    base_url: string | null;
    created_at: string | null;
}

export interface SourceUrlRow {
    id: string;
    source_id: string;
    url: string | null;
    label: string | null;
    created_at: string | null;
}

export interface DocumentRow {
    id: string;
    source_url_id: string;
    url: string | null;
    filename: string | null;
    checksum: string | null;
    created_at: string | null;
    last_seen_at: string | null;
    deleted_at: string | null;
    meta: unknown;
    external_storage: unknown;
}

export interface DuplicateGroup<T> {
    key: string;
    count: number;
    items: T[];
}

function toText(value: unknown): string | null {
    if (value === null || value === undefined) return null;
    return String(value);
}

export async function fetchAllSources(): Promise<SourceRow[]> {
    const allRows: SourceRow[] = [];
    let from = 0;

    while (true) {
        const { data, error } = await supabase
            .from('sources')
            .select('id, name, base_url, created_at')
            .range(from, from + PAGE_SIZE - 1);

        if (error) throw new Error(error.message);

        const rows = data ?? [];
        allRows.push(...rows.map((row) => ({
            id: String(row.id),
            name: toText(row.name),
            base_url: toText(row.base_url),
            created_at: toText(row.created_at),
        })));

        if (rows.length < PAGE_SIZE) break;
        from += PAGE_SIZE;
    }

    return allRows;
}

export async function fetchAllSourceUrls(): Promise<SourceUrlRow[]> {
    const allRows: SourceUrlRow[] = [];
    let from = 0;

    while (true) {
        const { data, error } = await supabase
            .from('source_urls')
            .select('id, source_id, url, label, created_at')
            .range(from, from + PAGE_SIZE - 1);

        if (error) throw new Error(error.message);

        const rows = data ?? [];
        allRows.push(...rows.map((row) => ({
            id: String(row.id),
            source_id: String(row.source_id),
            url: toText(row.url),
            label: toText(row.label),
            created_at: toText(row.created_at),
        })));

        if (rows.length < PAGE_SIZE) break;
        from += PAGE_SIZE;
    }

    return allRows;
}

export async function fetchAllDocuments(includeDeleted = false): Promise<DocumentRow[]> {
    const allRows: DocumentRow[] = [];
    let from = 0;

    while (true) {
        let query = supabase
            .from('documents')
            .select('id, source_url_id, url, filename, checksum, created_at, last_seen_at, deleted_at, meta, external_storage')
            .range(from, from + PAGE_SIZE - 1);

        if (!includeDeleted) {
            query = query.is('deleted_at', null);
        }

        const { data, error } = await query;
        if (error) throw new Error(error.message);

        const rows = data ?? [];
        allRows.push(...rows.map((row) => ({
            id: String(row.id),
            source_url_id: String(row.source_url_id),
            url: toText(row.url),
            filename: toText(row.filename),
            checksum: toText(row.checksum),
            created_at: toText(row.created_at),
            last_seen_at: toText(row.last_seen_at),
            deleted_at: toText(row.deleted_at),
            meta: row.meta ?? null,
            external_storage: row.external_storage ?? null,
        })));

        if (rows.length < PAGE_SIZE) break;
        from += PAGE_SIZE;
    }

    return allRows;
}

export function groupDuplicates<T>(items: T[], keySelector: (item: T) => string | null): DuplicateGroup<T>[] {
    const grouped = new Map<string, T[]>();

    for (const item of items) {
        const key = keySelector(item);
        if (!key) continue;

        const bucket = grouped.get(key) ?? [];
        bucket.push(item);
        grouped.set(key, bucket);
    }

    return Array.from(grouped.entries())
        .filter(([, bucket]) => bucket.length > 1)
        .map(([key, bucket]) => ({
            key,
            count: bucket.length,
            items: bucket,
        }))
        .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
}

export function getSourceDuplicateGroups(rows: SourceRow[]): DuplicateGroup<SourceRow>[] {
    return groupDuplicates(rows, (row) => normalizeUrlForDedupe(row.base_url));
}

export function getSourceUrlDuplicateGroups(rows: SourceUrlRow[]): DuplicateGroup<SourceUrlRow>[] {
    return groupDuplicates(rows, (row) => {
        const normalized = normalizeUrlForDedupe(row.url);
        return normalized ? `${row.source_id}::${normalized}` : null;
    });
}

export function getDocumentUrlDuplicateGroups(rows: DocumentRow[]): DuplicateGroup<DocumentRow>[] {
    return groupDuplicates(rows, (row) => {
        const normalized = normalizeUrlForDedupe(row.url);
        return normalized ? `${row.source_url_id}::${normalized}` : null;
    });
}

export function getDocumentChecksumDuplicateGroups(rows: DocumentRow[]): DuplicateGroup<DocumentRow>[] {
    return groupDuplicates(rows, (row) => {
        const checksum = row.checksum?.trim();
        return checksum ? checksum : null;
    });
}

export function paginateGroups<T>(groups: DuplicateGroup<T>[], page: number, pageSize: number) {
    const safePage = Math.max(0, page);
    const safePageSize = Math.min(200, Math.max(1, pageSize));

    const start = safePage * safePageSize;
    const end = start + safePageSize;

    return {
        page: safePage,
        pageSize: safePageSize,
        total: groups.length,
        groups: groups.slice(start, end),
    };
}

export function computeDocumentHealth(rows: DocumentRow[]) {
    let withValidUuid = 0;
    let missingUuid = 0;
    let missingBlobMetadata = 0;

    for (const row of rows) {
        const blobRef = extractDocumentBlobRef(row);

        if (blobRef.uuid) {
            withValidUuid += 1;
        } else {
            missingUuid += 1;
        }

        if (blobRef.hasBlobMetadata && (!blobRef.uuid || !blobRef.documentKey)) {
            missingBlobMetadata += 1;
        }
    }

    const documentUrlDuplicateGroups = getDocumentUrlDuplicateGroups(rows);
    const checksumCollisionGroups = getDocumentChecksumDuplicateGroups(rows);

    return {
        totalDocuments: rows.length,
        documentsWithValidUuid: withValidUuid,
        documentsMissingUuid: missingUuid,
        documentsMissingBlobMetadata: missingBlobMetadata,
        duplicateDocumentUrlGroups: documentUrlDuplicateGroups.length,
        duplicateDocumentChecksumGroups: checksumCollisionGroups.length,
    };
}
