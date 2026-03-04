import {
    S3Client,
    DeleteObjectsCommand,
    HeadObjectCommand,
    ListObjectsV2Command,
} from '@aws-sdk/client-s3';
import { isDocumentsPrefix } from '@/lib/document-blob';

interface R2Config {
    accountId: string;
    accessKeyId: string;
    secretAccessKey: string;
    bucket: string;
    endpoint: string;
}

const MAX_DELETE_BATCH = 1000;
const MAX_PAGE_SIZE = 200;

function requireEnv(name: string): string {
    const value = process.env[name]?.trim();
    if (!value) {
        throw new Error(`Missing ${name}`);
    }
    return value;
}

function getR2Config(): R2Config {
    const accountId = requireEnv('R2_ACCOUNT_ID');
    const accessKeyId = requireEnv('R2_ACCESS_KEY_ID');
    const secretAccessKey = requireEnv('R2_SECRET_ACCESS_KEY');
    const bucket = requireEnv('R2_BUCKET');

    const endpoint = process.env.R2_ENDPOINT?.trim() || `https://${accountId}.r2.cloudflarestorage.com`;

    return {
        accountId,
        accessKeyId,
        secretAccessKey,
        bucket,
        endpoint,
    };
}

let client: S3Client | null = null;
let configCache: R2Config | null = null;

export function getR2Client(): S3Client {
    if (client) return client;

    const config = getR2Config();
    configCache = config;
    client = new S3Client({
        region: 'auto',
        endpoint: config.endpoint,
        credentials: {
            accessKeyId: config.accessKeyId,
            secretAccessKey: config.secretAccessKey,
        },
        forcePathStyle: true,
    });

    return client;
}

export function getR2Bucket(): string {
    if (configCache) return configCache.bucket;
    return getR2Config().bucket;
}

function normalizePrefix(prefix: string | undefined): string {
    const trimmed = (prefix ?? '').trim();
    return trimmed.startsWith('/') ? trimmed.slice(1) : trimmed;
}

function normalizeObjectKey(key: string): string {
    const trimmed = key.trim();
    if (!trimmed) throw new Error('Object key cannot be empty');
    return trimmed.startsWith('/') ? trimmed.slice(1) : trimmed;
}

function normalizeUniqueObjectKeys(keys: string[]): string[] {
    const unique = new Set<string>();
    for (const key of keys) {
        unique.add(normalizeObjectKey(key));
    }
    return Array.from(unique);
}

function isNotFoundError(error: unknown): boolean {
    if (!error || typeof error !== 'object') return false;

    const maybe = error as {
        name?: string;
        $metadata?: {
            httpStatusCode?: number;
        };
    };

    return maybe.name === 'NotFound'
        || maybe.name === 'NoSuchKey'
        || maybe.$metadata?.httpStatusCode === 404;
}

export function assertAllowedDocumentsPrefix(prefix: string): void {
    if (!isDocumentsPrefix(prefix)) {
        throw new Error('Only documents/<uuid>/ prefixes are allowed');
    }
}

export interface ListedPrefix {
    prefix: string;
    totalCount: number;
    keys: string[];
    truncated: boolean;
}

export interface ListedObjectItem {
    key: string;
    size: number;
    lastModified: string | null;
    etag: string | null;
    storageClass: string | null;
}

export interface ListedObjectsPage {
    prefix: string;
    cursor: string | null;
    nextCursor: string | null;
    pageSize: number;
    items: ListedObjectItem[];
}

export interface ObjectLookupItem {
    key: string;
    size: number;
    lastModified: string | null;
}

export interface DeleteObjectResult {
    key: string;
    deleted: boolean;
    error: string | null;
}

export async function listObjectsPage(prefix = '', cursor: string | null = null, pageSize = 50): Promise<ListedObjectsPage> {
    const safePrefix = normalizePrefix(prefix);
    const safePageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, Number.isFinite(pageSize) ? Math.floor(pageSize) : 50));

    const s3 = getR2Client();
    const bucket = getR2Bucket();

    const response = await s3.send(new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: safePrefix || undefined,
        ContinuationToken: cursor || undefined,
        MaxKeys: safePageSize,
    }));

    const items: ListedObjectItem[] = (response.Contents ?? [])
        .map((item) => {
            const key = item.Key;
            if (!key) return null;
            return {
                key,
                size: item.Size ?? 0,
                lastModified: item.LastModified ? item.LastModified.toISOString() : null,
                etag: item.ETag ?? null,
                storageClass: item.StorageClass ?? null,
            };
        })
        .filter((item): item is ListedObjectItem => Boolean(item));

    return {
        prefix: safePrefix,
        cursor: cursor || null,
        nextCursor: response.NextContinuationToken ?? null,
        pageSize: safePageSize,
        items,
    };
}

export async function lookupObjects(keys: string[]): Promise<{ items: ObjectLookupItem[]; missingKeys: string[] }> {
    const normalizedKeys = normalizeUniqueObjectKeys(keys);
    const s3 = getR2Client();
    const bucket = getR2Bucket();

    const values = await Promise.all(normalizedKeys.map(async (key) => {
        try {
            const response = await s3.send(new HeadObjectCommand({
                Bucket: bucket,
                Key: key,
            }));

            return {
                key,
                size: response.ContentLength ?? 0,
                lastModified: response.LastModified ? response.LastModified.toISOString() : null,
                missing: false,
            };
        } catch (error) {
            if (isNotFoundError(error)) {
                return {
                    key,
                    size: 0,
                    lastModified: null,
                    missing: true,
                };
            }
            throw error;
        }
    }));

    const items: ObjectLookupItem[] = [];
    const missingKeys: string[] = [];

    for (const value of values) {
        if (value.missing) {
            missingKeys.push(value.key);
            continue;
        }

        items.push({
            key: value.key,
            size: value.size,
            lastModified: value.lastModified,
        });
    }

    return {
        items,
        missingKeys,
    };
}

export async function deleteAnyObjects(keys: string[]): Promise<{ deletedCount: number; failedCount: number; results: DeleteObjectResult[] }> {
    const normalizedKeys = normalizeUniqueObjectKeys(keys);
    if (normalizedKeys.length === 0) {
        return {
            deletedCount: 0,
            failedCount: 0,
            results: [],
        };
    }

    const s3 = getR2Client();
    const bucket = getR2Bucket();

    const results: DeleteObjectResult[] = [];

    for (let i = 0; i < normalizedKeys.length; i += MAX_DELETE_BATCH) {
        const chunk = normalizedKeys.slice(i, i + MAX_DELETE_BATCH);
        const response = await s3.send(new DeleteObjectsCommand({
            Bucket: bucket,
            Delete: {
                Objects: chunk.map((key) => ({ Key: key })),
                Quiet: false,
            },
        }));

        const deletedKeys = new Set(
            (response.Deleted ?? [])
                .map((item) => item.Key)
                .filter((key): key is string => Boolean(key)),
        );

        const errorByKey = new Map<string, string>();
        for (const item of response.Errors ?? []) {
            if (!item.Key) continue;
            errorByKey.set(item.Key, item.Message || 'Failed to delete object from storage');
        }

        const chunkHadErrors = (response.Errors?.length ?? 0) > 0;

        for (const key of chunk) {
            const error = errorByKey.get(key);
            if (error) {
                results.push({
                    key,
                    deleted: false,
                    error,
                });
                continue;
            }

            if (deletedKeys.has(key) || !chunkHadErrors) {
                results.push({
                    key,
                    deleted: true,
                    error: null,
                });
                continue;
            }

            results.push({
                key,
                deleted: false,
                error: 'Unknown delete status for object',
            });
        }
    }

    const deletedCount = results.filter((item) => item.deleted).length;
    const failedCount = results.length - deletedCount;

    return {
        deletedCount,
        failedCount,
        results,
    };
}

export async function listObjectsByPrefix(prefix: string, maxKeys = 20): Promise<ListedPrefix> {
    assertAllowedDocumentsPrefix(prefix);

    const s3 = getR2Client();
    const bucket = getR2Bucket();

    let continuationToken: string | undefined;
    let totalCount = 0;
    const keys: string[] = [];
    let truncated = false;

    do {
        const response = await s3.send(new ListObjectsV2Command({
            Bucket: bucket,
            Prefix: prefix,
            ContinuationToken: continuationToken,
            MaxKeys: 1000,
        }));

        const chunkKeys = (response.Contents ?? [])
            .map((item) => item.Key)
            .filter((key): key is string => Boolean(key));

        totalCount += chunkKeys.length;

        if (keys.length < maxKeys) {
            keys.push(...chunkKeys.slice(0, Math.max(0, maxKeys - keys.length)));
        }

        continuationToken = response.NextContinuationToken;
        truncated = Boolean(response.IsTruncated);
    } while (continuationToken);

    return {
        prefix,
        totalCount,
        keys,
        truncated,
    };
}

export async function deleteObjects(keys: string[]): Promise<{ deletedCount: number }> {
    const filtered = keys.filter((key) => key.startsWith('documents/'));
    if (filtered.length !== keys.length) {
        throw new Error('Only documents/* keys are allowed');
    }

    const result = await deleteAnyObjects(filtered);
    if (result.failedCount > 0) {
        const firstFailure = result.results.find((item) => !item.deleted);
        throw new Error(firstFailure?.error || 'Failed to delete one or more objects from R2');
    }

    return {
        deletedCount: result.deletedCount,
    };
}

export async function deletePrefix(prefix: string): Promise<{ deletedCount: number; listedCount: number }> {
    assertAllowedDocumentsPrefix(prefix);

    const allKeys: string[] = [];
    const s3 = getR2Client();
    const bucket = getR2Bucket();

    let continuationToken: string | undefined;

    do {
        const response = await s3.send(new ListObjectsV2Command({
            Bucket: bucket,
            Prefix: prefix,
            ContinuationToken: continuationToken,
            MaxKeys: 1000,
        }));

        const chunkKeys = (response.Contents ?? [])
            .map((item) => item.Key)
            .filter((key): key is string => Boolean(key));
        allKeys.push(...chunkKeys);

        continuationToken = response.NextContinuationToken;
    } while (continuationToken);

    const listedCount = allKeys.length;
    const { deletedCount } = await deleteObjects(allKeys);

    return { deletedCount, listedCount };
}
