import crypto from 'node:crypto';

export type CleanupMode = 'blob_only' | 'blob_and_delete_document';

export interface CleanupPreviewTarget {
    uuid: string;
    prefix: string;
    documentIds: string[];
    objectCount: number;
    sampleKeys: string[];
    dbImpact: {
        action: 'clear_blob_pointers' | 'hard_delete_documents';
        documentRowsAffected: number;
    };
}

export interface CleanupPreviewPayload {
    mode: CleanupMode;
    createdAt: string;
    expiresAt: string;
    targets: CleanupPreviewTarget[];
}

const PREVIEW_TTL_MS = 10 * 60 * 1000;

function getStore(): Map<string, CleanupPreviewPayload> {
    const globalStore = globalThis as typeof globalThis & {
        __storageCleanupPreviewStore?: Map<string, CleanupPreviewPayload>;
    };

    if (!globalStore.__storageCleanupPreviewStore) {
        globalStore.__storageCleanupPreviewStore = new Map<string, CleanupPreviewPayload>();
    }

    return globalStore.__storageCleanupPreviewStore;
}

function pruneExpired(store: Map<string, CleanupPreviewPayload>): void {
    const now = Date.now();
    for (const [token, payload] of store.entries()) {
        if (new Date(payload.expiresAt).getTime() <= now) {
            store.delete(token);
        }
    }
}

export function createCleanupPreview(mode: CleanupMode, targets: CleanupPreviewTarget[]): { token: string; preview: CleanupPreviewPayload } {
    const store = getStore();
    pruneExpired(store);

    const createdAt = new Date().toISOString();
    const expiresAt = new Date(Date.now() + PREVIEW_TTL_MS).toISOString();
    const token = crypto.randomUUID();

    const payload: CleanupPreviewPayload = {
        mode,
        createdAt,
        expiresAt,
        targets,
    };

    store.set(token, payload);

    return {
        token,
        preview: payload,
    };
}

export function consumeCleanupPreview(token: string): CleanupPreviewPayload | null {
    const store = getStore();
    pruneExpired(store);

    const payload = store.get(token);
    if (!payload) return null;

    store.delete(token);
    return payload;
}

export function peekCleanupPreview(token: string): CleanupPreviewPayload | null {
    const store = getStore();
    pruneExpired(store);

    return store.get(token) ?? null;
}
