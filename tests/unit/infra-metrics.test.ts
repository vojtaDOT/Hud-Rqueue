import { describe, expect, it } from 'vitest';
import {
    calculateMemoryPercent,
    collectLocalProbeForTest,
    computeDockerCpuPercent,
    extractMemoryCacheBytes,
} from '@/lib/infra-metrics';

describe('infra-metrics helpers', () => {
    it('computes docker CPU percent from cpu/system deltas', () => {
        const cpuPercent = computeDockerCpuPercent({
            cpu_stats: {
                cpu_usage: { total_usage: 300000000, percpu_usage: [1, 1] },
                system_cpu_usage: 1200000000,
                online_cpus: 2,
            },
            precpu_stats: {
                cpu_usage: { total_usage: 100000000, percpu_usage: [1, 1] },
                system_cpu_usage: 1000000000,
            },
        });

        expect(cpuPercent).toBe(200);
    });

    it('returns null CPU percent for invalid deltas', () => {
        const cpuPercent = computeDockerCpuPercent({
            cpu_stats: {
                cpu_usage: { total_usage: 100000000, percpu_usage: [1] },
                system_cpu_usage: 1000,
                online_cpus: 1,
            },
            precpu_stats: {
                cpu_usage: { total_usage: 100000000, percpu_usage: [1] },
                system_cpu_usage: 2000,
            },
        });

        expect(cpuPercent).toBeNull();
    });

    it('extracts memory cache with fallbacks', () => {
        expect(extractMemoryCacheBytes({ stats: { cache: 11 } })).toBe(11);
        expect(extractMemoryCacheBytes({ stats: { total_inactive_file: 22 } })).toBe(22);
        expect(extractMemoryCacheBytes({ stats: { inactive_file: 33 } })).toBe(33);
    });

    it('calculates memory percent', () => {
        expect(calculateMemoryPercent(256, 1024)).toBe(25);
        expect(calculateMemoryPercent(null, 1024)).toBeNull();
        expect(calculateMemoryPercent(256, 0)).toBeNull();
    });

    it('maps local probe disk stats and adds warning when statfs fails', async () => {
        const warnings: string[] = [];
        const probe = await collectLocalProbeForTest(warnings, {
            hostname: () => 'hud-vps',
            uptime: () => 180,
            loadavg: () => [0.5, 0.4, 0.3],
            cpus: () => [{ model: 'test' }, { model: 'test' }],
            totalmem: () => 1000,
            freemem: () => 400,
            statfs: async () => ({ bsize: 100, blocks: 10, bavail: 3 }),
            isContainerized: () => true,
        });

        expect(probe?.diskTotalBytes).toBe(1000);
        expect(probe?.diskFreeBytes).toBe(300);
        expect(probe?.diskUsedBytes).toBe(700);
        expect(probe?.memUsedBytes).toBe(600);
        expect(probe?.memUsedPercent).toBe(60);
        expect(warnings).toHaveLength(0);

        const warningBucket: string[] = [];
        const probeWithoutDisk = await collectLocalProbeForTest(warningBucket, {
            hostname: () => 'hud-vps',
            uptime: () => 180,
            loadavg: () => [0.5, 0.4, 0.3],
            cpus: () => [{ model: 'test' }],
            totalmem: () => 1000,
            freemem: () => 400,
            statfs: async () => {
                throw new Error('unsupported');
            },
            isContainerized: () => false,
        });

        expect(probeWithoutDisk?.diskTotalBytes).toBeNull();
        expect(probeWithoutDisk?.diskUsedPercent).toBeNull();
        expect(warningBucket[0]).toContain('Local disk stats unavailable');
    });
});
