import { beforeEach, describe, expect, it, vi } from 'vitest';

const consumeStorageObjectPreview = vi.fn();
const deleteAnyObjects = vi.fn();

vi.mock('@/lib/storage-object-preview-store', () => ({
    consumeStorageObjectPreview,
}));

vi.mock('@/lib/r2', () => ({
    deleteAnyObjects,
}));

describe('POST /api/storage/objects/delete-execute', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('rejects mismatched confirmation string', async () => {
        const { POST } = await import('@/app/api/storage/objects/delete-execute/route');
        const request = new Request('http://localhost/api/storage/objects/delete-execute', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
                preview_token: 'preview-token',
                confirmation: 'WRONG',
            }),
        });

        const response = await POST(request);
        const json = await response.json();

        expect(response.status).toBe(400);
        expect(json.error).toBe('Confirmation string mismatch');
        expect(consumeStorageObjectPreview).not.toHaveBeenCalled();
    });

    it('rejects missing or expired preview token', async () => {
        consumeStorageObjectPreview.mockReturnValue(null);

        const { POST } = await import('@/app/api/storage/objects/delete-execute/route');
        const request = new Request('http://localhost/api/storage/objects/delete-execute', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
                preview_token: 'expired-token',
                confirmation: 'DELETE OBJECTS',
            }),
        });

        const response = await POST(request);
        const json = await response.json();

        expect(response.status).toBe(400);
        expect(json.error).toBe('Preview token is missing, expired, or already used');
    });

    it('returns per-key execution results', async () => {
        consumeStorageObjectPreview.mockReturnValue({
            createdAt: '2026-03-04T10:00:00.000Z',
            expiresAt: '2026-03-04T10:10:00.000Z',
            summary: {
                totalKeys: 2,
                totalBytes: 300,
            },
            items: [
                { key: 'documents/a.pdf', size: 100, lastModified: null },
                { key: 'documents/b.pdf', size: 200, lastModified: null },
            ],
        });

        deleteAnyObjects.mockResolvedValue({
            deletedCount: 1,
            failedCount: 1,
            results: [
                { key: 'documents/a.pdf', deleted: true, error: null },
                { key: 'documents/b.pdf', deleted: false, error: 'Access denied' },
            ],
        });

        const { POST } = await import('@/app/api/storage/objects/delete-execute/route');
        const request = new Request('http://localhost/api/storage/objects/delete-execute', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
                preview_token: 'preview-token',
                confirmation: 'DELETE OBJECTS',
            }),
        });

        const response = await POST(request);
        const json = await response.json();

        expect(response.status).toBe(200);
        expect(json.success).toBe(true);
        expect(json.deleted_count).toBe(1);
        expect(json.failed_count).toBe(1);
        expect(json.results).toEqual([
            { key: 'documents/a.pdf', deleted: true, error: null },
            { key: 'documents/b.pdf', deleted: false, error: 'Access denied' },
        ]);
    });
});
