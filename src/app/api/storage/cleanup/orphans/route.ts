import { NextRequest, NextResponse } from 'next/server';
import { fetchAllDocuments } from '@/lib/storage-data';
import { extractDocumentBlobRef } from '@/lib/document-blob';
import { listDocumentPrefixes, listObjectsByPrefix, deletePrefix } from '@/lib/r2';

export const dynamic = 'force-dynamic';

const UUID_FROM_PREFIX_RE = /^documents\/([^/]+)\/$/;

function extractUuidFromPrefix(prefix: string): string | null {
    const match = prefix.match(UUID_FROM_PREFIX_RE);
    return match?.[1] ?? null;
}

export interface OrphanedFolder {
    uuid: string;
    prefix: string;
    objectCount: number;
    sampleKeys: string[];
}

export async function GET() {
    try {
        const [r2Prefixes, allDocuments] = await Promise.all([
            listDocumentPrefixes(),
            fetchAllDocuments(true),
        ]);

        const dbUuids = new Set<string>();
        for (const doc of allDocuments) {
            const blob = extractDocumentBlobRef(doc);
            if (blob.uuid) dbUuids.add(blob.uuid);
        }

        const orphanUuids: string[] = [];
        for (const prefix of r2Prefixes) {
            const uuid = extractUuidFromPrefix(prefix);
            if (uuid && !dbUuids.has(uuid)) {
                orphanUuids.push(uuid);
            }
        }

        const orphans: OrphanedFolder[] = await Promise.all(
            orphanUuids.map(async (uuid) => {
                const prefix = `documents/${uuid}/`;
                const listing = await listObjectsByPrefix(prefix, 5);
                return {
                    uuid,
                    prefix,
                    objectCount: listing.totalCount,
                    sampleKeys: listing.keys,
                };
            }),
        );

        return NextResponse.json({
            success: true,
            r2PrefixCount: r2Prefixes.length,
            dbUuidCount: dbUuids.size,
            orphanCount: orphans.length,
            orphans,
        });
    } catch (error) {
        console.error('orphan scan failed', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Failed to scan for orphaned folders' },
            { status: 500 },
        );
    }
}

export async function DELETE(request: NextRequest) {
    try {
        const body = await request.json();
        const prefixes: string[] = Array.isArray(body?.prefixes) ? body.prefixes : body?.prefix ? [body.prefix] : [];

        const valid = prefixes.filter(
            (p): p is string => typeof p === 'string' && p.startsWith('documents/') && p.endsWith('/'),
        );
        if (valid.length === 0) {
            return NextResponse.json({ error: 'No valid prefixes provided' }, { status: 400 });
        }

        const CONCURRENCY = 10;
        const results: Array<{ prefix: string; deletedCount: number; error: string | null }> = [];
        for (let i = 0; i < valid.length; i += CONCURRENCY) {
            const batch = valid.slice(i, i + CONCURRENCY);
            const batchResults = await Promise.allSettled(batch.map((p) => deletePrefix(p)));
            for (let j = 0; j < batch.length; j++) {
                const r = batchResults[j];
                results.push(
                    r.status === 'fulfilled'
                        ? { prefix: batch[j], deletedCount: r.value.deletedCount, error: null }
                        : { prefix: batch[j], deletedCount: 0, error: r.reason instanceof Error ? r.reason.message : 'Unknown error' },
                );
            }
        }

        const deleted = results.filter((r) => r.error === null).length;
        const failed = results.filter((r) => r.error !== null).length;
        return NextResponse.json({ success: true, deleted, failed, results });
    } catch (error) {
        console.error('orphan delete failed', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Failed to delete orphan folders' },
            { status: 500 },
        );
    }
}
