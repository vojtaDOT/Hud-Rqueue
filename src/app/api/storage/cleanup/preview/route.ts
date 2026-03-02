import { NextResponse } from 'next/server';
import { z } from 'zod';
import { fetchAllDocuments } from '@/lib/storage-data';
import { extractDocumentBlobRef, toDocumentPrefix } from '@/lib/document-blob';
import { listObjectsByPrefix } from '@/lib/r2';
import { createCleanupPreview, type CleanupMode, type CleanupPreviewTarget } from '@/lib/storage-preview-store';

const RequestSchema = z.object({
    mode: z.enum(['blob_only', 'blob_and_delete_document']),
    targets: z.object({
        document_ids: z.array(z.string().min(1)).default([]),
        uuids: z.array(z.string().min(1)).default([]),
    }),
});

function normalizeUuid(value: string): string {
    const trimmed = value.trim();
    if (!trimmed || trimmed.includes('/') || trimmed.includes('..')) {
        throw new Error(`Invalid uuid: ${value}`);
    }
    return trimmed;
}

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const parsed = RequestSchema.safeParse(body);

        if (!parsed.success) {
            return NextResponse.json({ error: 'Invalid input', details: parsed.error.format() }, { status: 400 });
        }

        const mode = parsed.data.mode as CleanupMode;
        const inputDocumentIds = new Set(parsed.data.targets.document_ids.map((id) => id.trim()).filter(Boolean));
        const inputUuids = new Set(parsed.data.targets.uuids.map(normalizeUuid));

        if (inputDocumentIds.size === 0 && inputUuids.size === 0) {
            return NextResponse.json({ error: 'At least one target is required' }, { status: 400 });
        }

        const allDocuments = await fetchAllDocuments(false);
        const docsById = new Map(allDocuments.map((doc) => [doc.id, doc]));

        const matchedDocs = new Map<string, typeof allDocuments[number]>();

        for (const documentId of inputDocumentIds) {
            const match = docsById.get(documentId);
            if (match) matchedDocs.set(match.id, match);
        }

        for (const doc of allDocuments) {
            const blob = extractDocumentBlobRef(doc);
            if (blob.uuid && inputUuids.has(blob.uuid)) {
                matchedDocs.set(doc.id, doc);
            }
        }

        const allUuids = new Set<string>(inputUuids);
        for (const doc of matchedDocs.values()) {
            const blob = extractDocumentBlobRef(doc);
            if (blob.uuid) allUuids.add(blob.uuid);
        }

        if (allUuids.size === 0) {
            return NextResponse.json({ error: 'No valid document UUIDs were resolved from targets' }, { status: 400 });
        }

        if (allUuids.size > 200) {
            return NextResponse.json({ error: 'Too many targets, maximum is 200 UUIDs' }, { status: 400 });
        }

        const documentIdsByUuid = new Map<string, string[]>();
        for (const doc of matchedDocs.values()) {
            const blob = extractDocumentBlobRef(doc);
            if (!blob.uuid) continue;
            const bucket = documentIdsByUuid.get(blob.uuid) ?? [];
            bucket.push(doc.id);
            documentIdsByUuid.set(blob.uuid, bucket);
        }

        const sortedUuids = Array.from(allUuids).sort((a, b) => a.localeCompare(b));

        const listed = await Promise.all(sortedUuids.map(async (uuid) => {
            const prefix = toDocumentPrefix(uuid);
            const listing = await listObjectsByPrefix(prefix, 10);
            return {
                uuid,
                prefix,
                listing,
            };
        }));

        const targets: CleanupPreviewTarget[] = listed.map((item) => {
            const documentIds = documentIdsByUuid.get(item.uuid) ?? [];

            return {
                uuid: item.uuid,
                prefix: item.prefix,
                documentIds,
                objectCount: item.listing.totalCount,
                sampleKeys: item.listing.keys,
                dbImpact: {
                    action: mode === 'blob_only' ? 'clear_blob_pointers' : 'hard_delete_documents',
                    documentRowsAffected: documentIds.length,
                },
            };
        });

        const { token, preview } = createCleanupPreview(mode, targets);

        return NextResponse.json({
            success: true,
            preview_token: token,
            mode,
            created_at: preview.createdAt,
            expires_at: preview.expiresAt,
            targets,
        });
    } catch (error) {
        console.error('storage cleanup preview failed', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Failed to create cleanup preview' },
            { status: 500 },
        );
    }
}
