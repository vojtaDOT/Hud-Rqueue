import { describe, expect, it } from 'vitest';

import {
    appendBlobCleanupAudit,
    clearBlobPointersFromMeta,
    extractDocumentBlobRef,
    isDocumentsPrefix,
    toDocumentPrefix,
} from '@/lib/document-blob';

describe('document-blob extraction', () => {
    it('prefers external_storage.uuid', () => {
        const result = extractDocumentBlobRef({
            external_storage: {
                uuid: '11111111-2222-3333-4444-555555555555',
                worker: { input_key: 'documents/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee/input.pdf' },
            },
            meta: {
                storage_upload: {
                    storage: {
                        document_key: 'documents/99999999-2222-3333-4444-555555555555/file.pdf',
                    },
                },
            },
        });

        expect(result.uuid).toBe('11111111-2222-3333-4444-555555555555');
        expect(result.sourceField).toBe('external_storage.uuid');
        expect(result.prefix).toBe('documents/11111111-2222-3333-4444-555555555555/');
    });

    it('falls back to document key and worker input key', () => {
        const fromDocumentKey = extractDocumentBlobRef({
            meta: {
                storage_upload: {
                    storage: {
                        document_key: 'documents/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee/output.pdf',
                    },
                },
            },
        });

        expect(fromDocumentKey.uuid).toBe('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee');
        expect(fromDocumentKey.sourceField).toBe('meta.storage_upload.storage.document_key');

        const fromWorkerInput = extractDocumentBlobRef({
            external_storage: {
                worker: {
                    input_key: 'documents/ffffffff-1111-2222-3333-aaaaaaaaaaaa/input.pdf',
                },
            },
        });

        expect(fromWorkerInput.uuid).toBe('ffffffff-1111-2222-3333-aaaaaaaaaaaa');
        expect(fromWorkerInput.sourceField).toBe('external_storage.worker.input_key');
    });

    it('supports pointer cleanup on metadata object', () => {
        const cleaned = clearBlobPointersFromMeta({
            storage_upload: {
                url: 'https://example.com',
                storage: {
                    document_key: 'documents/x/y.pdf',
                },
            },
            other: true,
        }) as Record<string, unknown>;

        const upload = cleaned.storage_upload as Record<string, unknown>;
        expect(upload.storage).toBeUndefined();

        const withAudit = appendBlobCleanupAudit(cleaned, { mode: 'blob_only' });
        expect(Array.isArray(withAudit.storage_cleanup_history)).toBe(true);
    });
});

describe('documents prefix guard', () => {
    it('accepts valid documents uuid prefix', () => {
        const prefix = toDocumentPrefix('abc-123');
        expect(prefix).toBe('documents/abc-123/');
        expect(isDocumentsPrefix(prefix)).toBe(true);
    });

    it('rejects invalid uuid values', () => {
        expect(() => toDocumentPrefix('../unsafe')).toThrow();
        expect(isDocumentsPrefix('contracts/abc/')).toBe(false);
    });
});
