import {
    S3Client,
    ListObjectsV2Command,
    DeleteObjectsCommand,
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

    if (filtered.length === 0) return { deletedCount: 0 };

    const s3 = getR2Client();
    const bucket = getR2Bucket();

    let deletedCount = 0;

    for (let i = 0; i < filtered.length; i += MAX_DELETE_BATCH) {
        const chunk = filtered.slice(i, i + MAX_DELETE_BATCH);
        const response = await s3.send(new DeleteObjectsCommand({
            Bucket: bucket,
            Delete: {
                Objects: chunk.map((key) => ({ Key: key })),
                Quiet: true,
            },
        }));

        deletedCount += response.Deleted?.length ?? 0;

        if ((response.Errors?.length ?? 0) > 0) {
            const first = response.Errors?.[0];
            throw new Error(first?.Message || 'Failed to delete one or more objects from R2');
        }
    }

    return { deletedCount };
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
