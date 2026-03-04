import { beforeEach, describe, expect, it, vi } from 'vitest';

const lookupObjects = vi.fn();
const createStorageObjectPreview = vi.fn();

vi.mock('@/lib/r2', () => ({
    lookupObjects,
}));

vi.mock('@/lib/storage-object-preview-store', () => ({
    createStorageObjectPreview,
}));

describe('POST /api/storage/objects/delete-preview', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('rejects oversized key list', async () => {
        const { POST } = await import('@/app/api/storage/objects/delete-preview/route');
        const keys = Array.from({ length: 201 }, (_, index) => `documents/file-${index}.pdf`);

        const request = new Request('http://localhost/api/storage/objects/delete-preview', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ keys }),
        });

        const response = await POST(request);
        const json = await response.json();

        expect(response.status).toBe(400);
        expect(json.error).toBe('Invalid input');
        expect(lookupObjects).not.toHaveBeenCalled();
    });

    it('rejects when some keys are missing', async () => {
        lookupObjects.mockResolvedValue({
            items: [{ key: 'documents/a.pdf', size: 100, lastModified: null }],
            missingKeys: ['documents/missing.pdf'],
        });

        const { POST } = await import('@/app/api/storage/objects/delete-preview/route');
        const request = new Request('http://localhost/api/storage/objects/delete-preview', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ keys: ['documents/a.pdf', 'documents/missing.pdf'] }),
        });

        const response = await POST(request);
        const json = await response.json();

        expect(response.status).toBe(400);
        expect(json.error).toBe('Some keys were not found in storage');
        expect(json.missing_keys).toEqual(['documents/missing.pdf']);
    });

    it('returns preview token and summary for valid keys', async () => {
        lookupObjects.mockResolvedValue({
            items: [
                { key: 'documents/a.pdf', size: 100, lastModified: '2026-03-01T12:00:00.000Z' },
                { key: 'documents/b.pdf', size: 200, lastModified: '2026-03-01T12:01:00.000Z' },
            ],
            missingKeys: [],
        });

        createStorageObjectPreview.mockReturnValue({
            token: 'preview-token',
            preview: {
                createdAt: '2026-03-04T10:00:00.000Z',
                expiresAt: '2026-03-04T10:10:00.000Z',
                items: [
                    { key: 'documents/a.pdf', size: 100, lastModified: '2026-03-01T12:00:00.000Z' },
                    { key: 'documents/b.pdf', size: 200, lastModified: '2026-03-01T12:01:00.000Z' },
                ],
                summary: {
                    totalKeys: 2,
                    totalBytes: 300,
                },
            },
        });

        const { POST } = await import('@/app/api/storage/objects/delete-preview/route');
        const request = new Request('http://localhost/api/storage/objects/delete-preview', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ keys: ['documents/a.pdf', 'documents/b.pdf'] }),
        });

        const response = await POST(request);
        const json = await response.json();

        expect(response.status).toBe(200);
        expect(json.success).toBe(true);
        expect(json.preview_token).toBe('preview-token');
        expect(json.summary.totalKeys).toBe(2);
        expect(json.summary.totalBytes).toBe(300);
        expect(createStorageObjectPreview).toHaveBeenCalledTimes(1);
    });
});
