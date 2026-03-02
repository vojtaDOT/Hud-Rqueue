import { NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { z } from 'zod';
import { supabase } from '@/lib/supabase';
import { appendBlobCleanupAudit, clearBlobPointersFromMeta } from '@/lib/document-blob';
import { consumeCleanupPreview } from '@/lib/storage-preview-store';
import { deletePrefix } from '@/lib/r2';

const RequestSchema = z.object({
    preview_token: z.string().min(1),
    mode: z.enum(['blob_only', 'blob_and_delete_document']),
    confirmation: z.string().optional(),
});

interface ExecuteTargetResult {
    uuid: string;
    prefix: string;
    document_ids: string[];
    r2_deleted_count: number;
    db_updated_count: number;
    db_deleted_count: number;
    error: string | null;
}

async function hardDeleteDocumentCascade(documentId: string): Promise<void> {
    const { error: textsError } = await supabase
        .from('document_texts')
        .delete()
        .eq('document_id', documentId);

    if (textsError) {
        throw new Error(`document_texts delete failed for ${documentId}: ${textsError.message}`);
    }

    const { error: ingestionError } = await supabase
        .from('ingestion_items')
        .delete()
        .eq('document_id', documentId);

    if (ingestionError) {
        throw new Error(`ingestion_items delete failed for ${documentId}: ${ingestionError.message}`);
    }

    const { error: documentError } = await supabase
        .from('documents')
        .delete()
        .eq('id', documentId);

    if (documentError) {
        throw new Error(`documents delete failed for ${documentId}: ${documentError.message}`);
    }
}

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const parsed = RequestSchema.safeParse(body);

        if (!parsed.success) {
            return NextResponse.json({ error: 'Invalid input', details: parsed.error.format() }, { status: 400 });
        }

        if (parsed.data.mode === 'blob_and_delete_document' && parsed.data.confirmation !== 'DELETE DOCUMENTS') {
            return NextResponse.json({ error: 'Confirmation string mismatch for hard delete mode' }, { status: 400 });
        }

        const preview = consumeCleanupPreview(parsed.data.preview_token);
        if (!preview) {
            return NextResponse.json({ error: 'Preview token is missing, expired, or already used' }, { status: 400 });
        }

        if (preview.mode !== parsed.data.mode) {
            return NextResponse.json({ error: 'Preview mode does not match execute mode' }, { status: 400 });
        }

        const operationId = crypto.randomUUID();
        const now = new Date().toISOString();

        const results: ExecuteTargetResult[] = [];

        for (const target of preview.targets) {
            const targetResult: ExecuteTargetResult = {
                uuid: target.uuid,
                prefix: target.prefix,
                document_ids: target.documentIds,
                r2_deleted_count: 0,
                db_updated_count: 0,
                db_deleted_count: 0,
                error: null,
            };

            try {
                const deleted = await deletePrefix(target.prefix);
                targetResult.r2_deleted_count = deleted.deletedCount;
            } catch (error) {
                targetResult.error = error instanceof Error ? error.message : 'R2 deletion failed';
                results.push(targetResult);
                continue;
            }

            try {
                if (parsed.data.mode === 'blob_only') {
                    if (target.documentIds.length === 0) {
                        results.push(targetResult);
                        continue;
                    }

                    const { data: docs, error: docsError } = await supabase
                        .from('documents')
                        .select('id, meta')
                        .in('id', target.documentIds);

                    if (docsError) {
                        throw new Error(docsError.message);
                    }

                    for (const doc of docs ?? []) {
                        const documentId = String(doc.id);
                        const nextMeta = appendBlobCleanupAudit(
                            clearBlobPointersFromMeta(doc.meta ?? null),
                            {
                                operation_id: operationId,
                                mode: parsed.data.mode,
                                uuid: target.uuid,
                                note: 'blob cleanup executed',
                            },
                        );

                        const { error: updateError } = await supabase
                            .from('documents')
                            .update({
                                external_storage: null,
                                meta: nextMeta,
                                updated_at: now,
                            })
                            .eq('id', documentId);

                        if (updateError) {
                            throw new Error(`documents update failed for ${documentId}: ${updateError.message}`);
                        }

                        targetResult.db_updated_count += 1;
                    }
                } else {
                    for (const documentId of target.documentIds) {
                        await hardDeleteDocumentCascade(documentId);
                        targetResult.db_deleted_count += 1;
                    }
                }
            } catch (error) {
                targetResult.error = error instanceof Error ? error.message : 'Database mutation failed';
            }

            results.push(targetResult);
        }

        console.info('storage cleanup execute', {
            operationId,
            mode: parsed.data.mode,
            targetCount: preview.targets.length,
            results,
        });

        return NextResponse.json({
            success: true,
            operation_id: operationId,
            mode: parsed.data.mode,
            results,
        });
    } catch (error) {
        console.error('storage cleanup execute failed', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Failed to execute cleanup' },
            { status: 500 },
        );
    }
}
