import { NextRequest, NextResponse } from 'next/server';
import {
    fetchAllDocuments,
    fetchAllSources,
    fetchAllSourceUrls,
    getDocumentChecksumDuplicateGroups,
    getDocumentUrlDuplicateGroups,
    getSourceDuplicateGroups,
    getSourceUrlDuplicateGroups,
    paginateGroups,
} from '@/lib/storage-data';
import { extractDocumentBlobRef } from '@/lib/document-blob';

type DuplicateKind = 'sources' | 'source_urls' | 'documents_url' | 'documents_checksum';

const KINDS = new Set<DuplicateKind>(['sources', 'source_urls', 'documents_url', 'documents_checksum']);

function parsePage(value: string | null): number {
    const parsed = Number.parseInt(value || '0', 10);
    if (!Number.isFinite(parsed)) return 0;
    return Math.max(0, parsed);
}

function parsePageSize(value: string | null): number {
    const parsed = Number.parseInt(value || '20', 10);
    if (!Number.isFinite(parsed)) return 20;
    return Math.min(200, Math.max(1, parsed));
}

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
    try {
        const kind = request.nextUrl.searchParams.get('kind') as DuplicateKind | null;
        const page = parsePage(request.nextUrl.searchParams.get('page'));
        const pageSize = parsePageSize(request.nextUrl.searchParams.get('pageSize'));

        if (!kind || !KINDS.has(kind)) {
            return NextResponse.json({
                error: 'Invalid kind',
                allowed: Array.from(KINDS),
            }, { status: 400 });
        }

        if (kind === 'sources') {
            const groups = getSourceDuplicateGroups(await fetchAllSources());
            const paged = paginateGroups(groups, page, pageSize);

            return NextResponse.json({
                success: true,
                kind,
                ...paged,
                groups: paged.groups.map((group) => ({
                    key: group.key,
                    count: group.count,
                    items: group.items.map((item) => ({
                        id: item.id,
                        name: item.name,
                        base_url: item.base_url,
                        created_at: item.created_at,
                    })),
                })),
            });
        }

        if (kind === 'source_urls') {
            const groups = getSourceUrlDuplicateGroups(await fetchAllSourceUrls());
            const paged = paginateGroups(groups, page, pageSize);

            return NextResponse.json({
                success: true,
                kind,
                ...paged,
                groups: paged.groups.map((group) => {
                    const [sourceId, normalizedUrl] = group.key.split('::');
                    return {
                        key: group.key,
                        source_id: sourceId,
                        normalized_url: normalizedUrl,
                        count: group.count,
                        items: group.items.map((item) => ({
                            id: item.id,
                            source_id: item.source_id,
                            url: item.url,
                            label: item.label,
                            created_at: item.created_at,
                        })),
                    };
                }),
            });
        }

        if (kind === 'documents_url') {
            const groups = getDocumentUrlDuplicateGroups(await fetchAllDocuments(false));
            const paged = paginateGroups(groups, page, pageSize);

            return NextResponse.json({
                success: true,
                kind,
                ...paged,
                groups: paged.groups.map((group) => {
                    const [sourceUrlId, normalizedUrl] = group.key.split('::');
                    return {
                        key: group.key,
                        source_url_id: sourceUrlId,
                        normalized_url: normalizedUrl,
                        count: group.count,
                        items: group.items.map((item) => {
                            const blob = extractDocumentBlobRef(item);
                            return {
                                id: item.id,
                                source_url_id: item.source_url_id,
                                url: item.url,
                                filename: item.filename,
                                checksum: item.checksum,
                                created_at: item.created_at,
                                last_seen_at: item.last_seen_at,
                                blob_uuid: blob.uuid,
                            };
                        }),
                    };
                }),
            });
        }

        const groups = getDocumentChecksumDuplicateGroups(await fetchAllDocuments(false));
        const paged = paginateGroups(groups, page, pageSize);

        return NextResponse.json({
            success: true,
            kind,
            ...paged,
            groups: paged.groups.map((group) => ({
                key: group.key,
                checksum: group.key,
                count: group.count,
                items: group.items.map((item) => {
                    const blob = extractDocumentBlobRef(item);
                    return {
                        id: item.id,
                        source_url_id: item.source_url_id,
                        url: item.url,
                        filename: item.filename,
                        checksum: item.checksum,
                        created_at: item.created_at,
                        last_seen_at: item.last_seen_at,
                        blob_uuid: blob.uuid,
                    };
                }),
            })),
        });
    } catch (error) {
        console.error('storage duplicates failed', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Failed to load duplicate groups' },
            { status: 500 },
        );
    }
}
