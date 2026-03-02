import { beforeEach, describe, expect, it, vi } from 'vitest';

const collectInfraMetrics = vi.fn();

vi.mock('@/lib/infra-metrics', () => ({
    collectInfraMetrics,
}));

describe('GET /api/infra/metrics', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('returns 503 when Portainer env config is missing', async () => {
        const configError = new Error('Missing PORTAINER_BASE_URL');
        configError.name = 'InfraConfigError';
        collectInfraMetrics.mockRejectedValueOnce(configError);

        const { GET } = await import('@/app/api/infra/metrics/route');
        const response = await GET();
        const json = await response.json();

        expect(response.status).toBe(503);
        expect(json.success).toBe(false);
        expect(json.error).toContain('Missing PORTAINER_BASE_URL');
    });

    it('returns normalized metrics payload on success', async () => {
        collectInfraMetrics.mockResolvedValueOnce({
            success: true,
            timestamp: '2026-03-02T10:00:00.000Z',
            source: {
                portainerBaseUrl: 'https://portainer.example.com',
                endpointId: 1,
                localProbesEnabled: true,
            },
            summary: {
                containersTotal: 1,
                containersRunning: 1,
                containersStopped: 0,
                unhealthyCount: 0,
            },
            server: {
                portainerHost: {
                    cpuCores: 4,
                    memTotalBytes: 1000,
                    dockerRootDir: '/var/lib/docker',
                    os: 'Ubuntu',
                    kernel: '6.8',
                },
                localProbe: {
                    hostname: 'hud-vps',
                    uptimeSec: 100,
                    loadAvg1m: 0.3,
                    cpuCores: 4,
                    memTotalBytes: 1000,
                    memFreeBytes: 500,
                    memUsedBytes: 500,
                    memUsedPercent: 50,
                    diskTotalBytes: 2000,
                    diskFreeBytes: 1200,
                    diskUsedBytes: 800,
                    diskUsedPercent: 40,
                    note: 'probe',
                },
            },
            containers: [],
            warnings: [],
        });

        const { GET } = await import('@/app/api/infra/metrics/route');
        const response = await GET();
        const json = await response.json();

        expect(response.status).toBe(200);
        expect(json.success).toBe(true);
        expect(json.source.endpointId).toBe(1);
    });

    it('returns success payload with warnings when partial data fails', async () => {
        collectInfraMetrics.mockResolvedValueOnce({
            success: true,
            timestamp: '2026-03-02T10:00:00.000Z',
            source: {
                portainerBaseUrl: 'https://portainer.example.com',
                endpointId: 1,
                localProbesEnabled: true,
            },
            summary: {
                containersTotal: 1,
                containersRunning: 1,
                containersStopped: 0,
                unhealthyCount: 0,
            },
            server: {
                portainerHost: null,
                localProbe: null,
            },
            containers: [],
            warnings: ['Portainer host info unavailable'],
        });

        const { GET } = await import('@/app/api/infra/metrics/route');
        const response = await GET();
        const json = await response.json();

        expect(response.status).toBe(200);
        expect(json.success).toBe(true);
        expect(json.warnings).toHaveLength(1);
    });
});
