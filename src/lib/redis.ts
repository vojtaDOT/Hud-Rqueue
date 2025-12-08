import Redis from 'ioredis';

const getRedisUrl = () => {
    if (process.env.REDIS_URL) return process.env.REDIS_URL;
    return 'redis://localhost:6379';
};

// Prevent multiple instances in development
const globalForRedis = global as unknown as { redis: Redis };

export const redis =
    globalForRedis.redis ||
    new Redis(getRedisUrl(), {
        // Redis Cloud often requires these TLS settings if using rediss://
        tls: process.env.REDIS_URL?.startsWith('rediss:')
            ? {
                rejectUnauthorized: false, // Helpful for some cloud providers
            }
            : undefined,
        maxRetriesPerRequest: null,
    });

if (process.env.NODE_ENV !== 'production') globalForRedis.redis = redis;

