import crypto from 'node:crypto';

export interface StorageObjectPreviewItem {
    key: string;
    size: number;
    lastModified: string | null;
}

export interface StorageObjectPreviewPayload {
    createdAt: string;
    expiresAt: string;
    items: StorageObjectPreviewItem[];
    summary: {
        totalKeys: number;
        totalBytes: number;
    };
}

const PREVIEW_TTL_MS = 10 * 60 * 1000;

function getStore(): Map<string, StorageObjectPreviewPayload> {
    const globalStore = globalThis as typeof globalThis & {
        __storageObjectPreviewStore?: Map<string, StorageObjectPreviewPayload>;
    };

    if (!globalStore.__storageObjectPreviewStore) {
        globalStore.__storageObjectPreviewStore = new Map<string, StorageObjectPreviewPayload>();
    }

    return globalStore.__storageObjectPreviewStore;
}

function pruneExpired(store: Map<string, StorageObjectPreviewPayload>): void {
    const now = Date.now();
    for (const [token, payload] of store.entries()) {
        if (new Date(payload.expiresAt).getTime() <= now) {
            store.delete(token);
        }
    }
}

export function createStorageObjectPreview(items: StorageObjectPreviewItem[]) {
    const store = getStore();
    pruneExpired(store);

    const createdAt = new Date().toISOString();
    const expiresAt = new Date(Date.now() + PREVIEW_TTL_MS).toISOString();
    const token = crypto.randomUUID();

    const payload: StorageObjectPreviewPayload = {
        createdAt,
        expiresAt,
        items,
        summary: {
            totalKeys: items.length,
            totalBytes: items.reduce((sum, item) => sum + item.size, 0),
        },
    };

    store.set(token, payload);

    return {
        token,
        preview: payload,
    };
}

export function consumeStorageObjectPreview(token: string): StorageObjectPreviewPayload | null {
    const store = getStore();
    pruneExpired(store);

    const payload = store.get(token);
    if (!payload) return null;

    store.delete(token);
    return payload;
}

export function peekStorageObjectPreview(token: string): StorageObjectPreviewPayload | null {
    const store = getStore();
    pruneExpired(store);

    return store.get(token) ?? null;
}
