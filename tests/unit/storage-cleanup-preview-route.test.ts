import { beforeEach, describe, expect, it, vi } from 'vitest';

const fetchAllDocuments = vi.fn();
const listObjectsByPrefix = vi.fn();
const createCleanupPreview = vi.fn();

vi.mock('@/lib/storage-data', () => ({
    fetchAllDocuments,
}));

vi.mock('@/lib/r2', () => ({
    listObjectsByPrefix,
}));

vi.mock('@/lib/storage-preview-store', () => ({
    createCleanupPreview,
}));

describe('POST /api/storage/cleanup/preview', () => {
    beforeEach(() => {
        vi.clearAllMocks();

        fetchAllDocuments.mockResolvedValue([
            {
                id: '1',
                source_url_id: '11',
                url: 'https://example.com/a.pdf',
                filename: 'a.pdf',
                checksum: 'aaa',
                created_at: null,
                last_seen_at: null,
                deleted_at: null,
                external_storage: {
                    uuid: '11111111-2222-3333-4444-555555555555',
                },
                meta: null,
            },
        ]);

        listObjectsByPrefix.mockResolvedValue({
            prefix: 'documents/11111111-2222-3333-4444-555555555555/',
            totalCount: 2,
            keys: ['documents/11111111-2222-3333-4444-555555555555/a.pdf'],
            truncated: false,
        });

        createCleanupPreview.mockReturnValue({
            token: 'preview-token',
            preview: {
                mode: 'blob_only',
                createdAt: '2026-03-02T10:00:00.000Z',
                expiresAt: '2026-03-02T10:10:00.000Z',
                targets: [],
            },
        });
    });

    it('returns preview token and targets', async () => {
        const { POST } = await import('@/app/api/storage/cleanup/preview/route');

        const request = new Request('http://localhost/api/storage/cleanup/preview', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
                mode: 'blob_only',
                targets: {
                    document_ids: ['1'],
                    uuids: [],
                },
            }),
        });

        const response = await POST(request);
        const json = await response.json();

        expect(response.status).toBe(200);
        expect(json.success).toBe(true);
        expect(json.preview_token).toBe('preview-token');
        expect(json.targets).toHaveLength(1);
        expect(json.targets[0].uuid).toBe('11111111-2222-3333-4444-555555555555');
        expect(listObjectsByPrefix).toHaveBeenCalledWith('documents/11111111-2222-3333-4444-555555555555/', 10);
    });
});
