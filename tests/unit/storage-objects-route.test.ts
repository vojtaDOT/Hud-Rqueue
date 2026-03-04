import { beforeEach, describe, expect, it, vi } from 'vitest';

const listObjectsPage = vi.fn();

vi.mock('@/lib/r2', () => ({
    listObjectsPage,
}));

describe('GET /api/storage/objects', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('lists objects with default params', async () => {
        listObjectsPage.mockResolvedValue({
            prefix: '',
            cursor: null,
            nextCursor: 'next-cursor',
            pageSize: 50,
            items: [
                {
                    key: 'documents/a.pdf',
                    size: 100,
                    lastModified: '2026-03-01T12:00:00.000Z',
                    etag: 'etag-a',
                    storageClass: 'STANDARD',
                },
            ],
        });

        const { GET } = await import('@/app/api/storage/objects/route');
        const request = new Request('http://localhost/api/storage/objects');

        const response = await GET(request);
        const json = await response.json();

        expect(response.status).toBe(200);
        expect(json.success).toBe(true);
        expect(json.returnedCount).toBe(1);
        expect(listObjectsPage).toHaveBeenCalledWith('', null, 50);
    });

    it('supports prefix/cursor and filters returned page by query', async () => {
        listObjectsPage.mockResolvedValue({
            prefix: 'documents/',
            cursor: 'cursor-1',
            nextCursor: 'cursor-2',
            pageSize: 20,
            items: [
                {
                    key: 'documents/a.pdf',
                    size: 100,
                    lastModified: null,
                    etag: null,
                    storageClass: null,
                },
                {
                    key: 'documents/b.pdf',
                    size: 200,
                    lastModified: null,
                    etag: null,
                    storageClass: null,
                },
            ],
        });

        const { GET } = await import('@/app/api/storage/objects/route');
        const request = new Request('http://localhost/api/storage/objects?prefix=documents/&cursor=cursor-1&pageSize=20&query=a.pdf');

        const response = await GET(request);
        const json = await response.json();

        expect(response.status).toBe(200);
        expect(json.items).toHaveLength(1);
        expect(json.items[0].key).toBe('documents/a.pdf');
        expect(listObjectsPage).toHaveBeenCalledWith('documents/', 'cursor-1', 20);
    });

    it('enforces page size bounds', async () => {
        listObjectsPage.mockResolvedValue({
            prefix: '',
            cursor: null,
            nextCursor: null,
            pageSize: 200,
            items: [],
        });

        const { GET } = await import('@/app/api/storage/objects/route');

        await GET(new Request('http://localhost/api/storage/objects?pageSize=0'));
        expect(listObjectsPage).toHaveBeenLastCalledWith('', null, 1);

        await GET(new Request('http://localhost/api/storage/objects?pageSize=999'));
        expect(listObjectsPage).toHaveBeenLastCalledWith('', null, 200);
    });
});
