import { NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { z } from 'zod';
import { supabase } from '@/lib/supabase';
import { appendBlobCleanupAudit, clearBlobPointersFromMeta, extractDocumentBlobRef } from '@/lib/document-blob';
import { deletePrefix } from '@/lib/r2';

const RequestSchema = z.object({
    canonical_document_id: z.string().min(1),
    duplicate_document_ids: z.array(z.string().min(1)).min(1).max(200),
    mode: z.enum(['blob_only', 'blob_and_delete_document']),
    dry_run: z.boolean().default(true),
    confirmation: z.string().optional(),
});

interface ResolutionPlanItem {
    document_id: string;
    uuid: string | null;
    prefix: string | null;
    can_execute: boolean;
    reason: string | null;
}

async function hardDeleteDocumentCascade(documentId: string): Promise<void> {
    const { error: textsError } = await supabase
        .from('document_texts')
        .delete()
        .eq('document_id', documentId);

    if (textsError) throw new Error(`document_texts delete failed for ${documentId}: ${textsError.message}`);

    const { error: itemsError } = await supabase
        .from('ingestion_items')
        .delete()
        .eq('document_id', documentId);

    if (itemsError) throw new Error(`ingestion_items delete failed for ${documentId}: ${itemsError.message}`);

    const { error: documentError } = await supabase
        .from('documents')
        .delete()
        .eq('id', documentId);

    if (documentError) throw new Error(`documents delete failed for ${documentId}: ${documentError.message}`);
}

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const parsed = RequestSchema.safeParse(body);

        if (!parsed.success) {
            return NextResponse.json({ error: 'Invalid input', details: parsed.error.format() }, { status: 400 });
        }

        const canonicalId = parsed.data.canonical_document_id.trim();
        const duplicateIds = Array.from(new Set(parsed.data.duplicate_document_ids.map((id) => id.trim()).filter(Boolean)));

        if (duplicateIds.includes(canonicalId)) {
            return NextResponse.json({ error: 'Canonical document cannot be inside duplicate_document_ids' }, { status: 400 });
        }

        if (parsed.data.mode === 'blob_and_delete_document' && !parsed.data.dry_run && parsed.data.confirmation !== 'DELETE DOCUMENTS') {
            return NextResponse.json({ error: 'Confirmation string mismatch for hard delete mode' }, { status: 400 });
        }

        const targetIds = [canonicalId, ...duplicateIds];

        const { data: docs, error: docsError } = await supabase
            .from('documents')
            .select('id, source_url_id, url, filename, checksum, meta, external_storage')
            .in('id', targetIds)
            .is('deleted_at', null);

        if (docsError) {
            return NextResponse.json({ error: docsError.message }, { status: 500 });
        }

        const docsById = new Map((docs ?? []).map((row) => [String(row.id), row]));

        if (!docsById.has(canonicalId)) {
            return NextResponse.json({ error: 'Canonical document not found' }, { status: 404 });
        }

        const missingDuplicates = duplicateIds.filter((id) => !docsById.has(id));
        if (missingDuplicates.length > 0) {
            return NextResponse.json({
                error: 'Some duplicate documents were not found',
                missing_document_ids: missingDuplicates,
            }, { status: 404 });
        }

        const plan: ResolutionPlanItem[] = duplicateIds.map((documentId) => {
            const doc = docsById.get(documentId)!;
            const blob = extractDocumentBlobRef(doc);
            const canExecute = Boolean(blob.uuid && blob.prefix);

            return {
                document_id: documentId,
                uuid: blob.uuid,
                prefix: blob.prefix,
                can_execute: canExecute,
                reason: canExecute ? null : 'Missing blob uuid/prefix for this document',
            };
        });

        if (parsed.data.dry_run) {
            return NextResponse.json({
                success: true,
                dry_run: true,
                canonical_document_id: canonicalId,
                mode: parsed.data.mode,
                plan,
            });
        }

        const now = new Date().toISOString();
        const operationId = crypto.randomUUID();
        const results: Array<{
            document_id: string;
            uuid: string | null;
            r2_deleted_count: number;
            db_updated: boolean;
            db_deleted: boolean;
            error: string | null;
        }> = [];

        for (const item of plan) {
            let r2DeletedCount = 0;
            let dbUpdated = false;
            let dbDeleted = false;
            let errorMessage: string | null = null;

            if (!item.can_execute || !item.prefix || !item.uuid) {
                results.push({
                    document_id: item.document_id,
                    uuid: item.uuid,
                    r2_deleted_count: 0,
                    db_updated: false,
                    db_deleted: false,
                    error: item.reason || 'Cannot execute without valid blob target',
                });
                continue;
            }

            try {
                const deleted = await deletePrefix(item.prefix);
                r2DeletedCount = deleted.deletedCount;
            } catch (error) {
                errorMessage = error instanceof Error ? error.message : 'R2 deletion failed';
                results.push({
                    document_id: item.document_id,
                    uuid: item.uuid,
                    r2_deleted_count: 0,
                    db_updated: false,
                    db_deleted: false,
                    error: errorMessage,
                });
                continue;
            }

            try {
                if (parsed.data.mode === 'blob_only') {
                    const doc = docsById.get(item.document_id)!;
                    const nextMeta = appendBlobCleanupAudit(
                        clearBlobPointersFromMeta(doc.meta ?? null),
                        {
                            operation_id: operationId,
                            mode: 'duplicate_resolution_blob_only',
                            canonical_document_id: canonicalId,
                            duplicate_document_id: item.document_id,
                            uuid: item.uuid,
                        },
                    );

                    const { error: updateError } = await supabase
                        .from('documents')
                        .update({
                            external_storage: null,
                            meta: nextMeta,
                            updated_at: now,
                        })
                        .eq('id', item.document_id);

                    if (updateError) {
                        throw new Error(updateError.message);
                    }

                    dbUpdated = true;
                } else {
                    await hardDeleteDocumentCascade(item.document_id);
                    dbDeleted = true;
                }
            } catch (error) {
                errorMessage = error instanceof Error ? error.message : 'Database mutation failed';
            }

            results.push({
                document_id: item.document_id,
                uuid: item.uuid,
                r2_deleted_count: r2DeletedCount,
                db_updated: dbUpdated,
                db_deleted: dbDeleted,
                error: errorMessage,
            });
        }

        return NextResponse.json({
            success: true,
            dry_run: false,
            canonical_document_id: canonicalId,
            mode: parsed.data.mode,
            operation_id: operationId,
            plan,
            results,
        });
    } catch (error) {
        console.error('resolve duplicates failed', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Failed to resolve duplicates' },
            { status: 500 },
        );
    }
}
