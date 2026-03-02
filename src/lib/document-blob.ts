const UUID_PATH_RE = /^documents\/([^/]+)\//i;
const UUID_DIRECT_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F-]{4,}$/;

function asObject(value: unknown): Record<string, unknown> | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    return value as Record<string, unknown>;
}

function asString(value: unknown): string | null {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
}

function extractUuidFromKey(value: string | null): string | null {
    if (!value) return null;
    const match = value.match(UUID_PATH_RE);
    return match?.[1] ?? null;
}

function normalizeUuid(value: string | null): string | null {
    if (!value) return null;

    const fromPath = extractUuidFromKey(value);
    if (fromPath) return fromPath;

    if (UUID_DIRECT_RE.test(value)) return value;
    return null;
}

export interface BlobRef {
    uuid: string | null;
    prefix: string | null;
    sourceField: 'external_storage.uuid' | 'meta.storage_upload.storage.document_key' | 'meta.storage_upload.storage.input_key' | 'external_storage.worker.input_key' | null;
    documentKey: string | null;
    inputKey: string | null;
    hasBlobMetadata: boolean;
}

export interface BlobDocument {
    id?: string | number;
    meta?: unknown;
    external_storage?: unknown;
}

export function toDocumentPrefix(uuid: string): string {
    const clean = uuid.trim();
    if (!clean || clean.includes('/') || clean.includes('..')) {
        throw new Error('Invalid blob uuid');
    }
    return `documents/${clean}/`;
}

export function isDocumentsPrefix(prefix: string): boolean {
    return /^documents\/[A-Za-z0-9-]+\/$/.test(prefix);
}

export function extractDocumentBlobRef(document: BlobDocument): BlobRef {
    const externalStorage = asObject(document.external_storage);
    const meta = asObject(document.meta);
    const storageUpload = asObject(meta?.storage_upload);
    const storage = asObject(storageUpload?.storage);
    const worker = asObject(externalStorage?.worker);

    const externalUuid = normalizeUuid(asString(externalStorage?.uuid));
    const documentKey = asString(storage?.document_key);
    const inputKey = asString(storage?.input_key) ?? asString(worker?.input_key);

    let sourceField: BlobRef['sourceField'] = null;
    let uuid: string | null = null;

    if (externalUuid) {
        uuid = externalUuid;
        sourceField = 'external_storage.uuid';
    } else {
        const fromDocumentKey = normalizeUuid(documentKey);
        if (fromDocumentKey) {
            uuid = fromDocumentKey;
            sourceField = 'meta.storage_upload.storage.document_key';
        } else {
            const fromInputKey = normalizeUuid(asString(storage?.input_key));
            if (fromInputKey) {
                uuid = fromInputKey;
                sourceField = 'meta.storage_upload.storage.input_key';
            } else {
                const fromWorkerInputKey = normalizeUuid(asString(worker?.input_key));
                if (fromWorkerInputKey) {
                    uuid = fromWorkerInputKey;
                    sourceField = 'external_storage.worker.input_key';
                }
            }
        }
    }

    const prefix = uuid ? toDocumentPrefix(uuid) : null;

    return {
        uuid,
        prefix,
        sourceField,
        documentKey,
        inputKey,
        hasBlobMetadata: Boolean(externalStorage || documentKey || inputKey),
    };
}

export function clearBlobPointersFromMeta(metaValue: unknown): unknown {
    const meta = asObject(metaValue);
    if (!meta) return metaValue ?? null;

    const storageUpload = asObject(meta.storage_upload);
    if (!storageUpload) return meta;

    const nextStorageUpload = { ...storageUpload };
    delete nextStorageUpload.storage;

    return {
        ...meta,
        storage_upload: nextStorageUpload,
    };
}

export function appendBlobCleanupAudit(metaValue: unknown, payload: Record<string, unknown>): Record<string, unknown> {
    const meta = asObject(metaValue) ?? {};
    const existing = Array.isArray(meta.storage_cleanup_history) ? meta.storage_cleanup_history : [];

    return {
        ...meta,
        storage_cleanup_history: [
            {
                ...payload,
                at: new Date().toISOString(),
            },
            ...existing,
        ].slice(0, 20),
    };
}
