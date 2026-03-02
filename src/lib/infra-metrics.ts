import os from 'node:os';
import { existsSync } from 'node:fs';
import { statfs as statfsFs } from 'node:fs/promises';
import {
    type DockerPort,
    getDockerContainerStats,
    getDockerInfo,
    getPortainerConfig,
    listDockerContainers,
    type DockerContainerStats,
    type DockerContainerSummary,
} from '@/lib/portainer';

export type HealthStatus = 'healthy' | 'unhealthy' | 'starting' | 'unknown';

export interface InfraMetricsResponse {
    success: boolean;
    timestamp: string;
    source: {
        portainerBaseUrl: string;
        endpointId: number;
        localProbesEnabled: boolean;
    };
    summary: {
        containersTotal: number;
        containersRunning: number;
        containersStopped: number;
        unhealthyCount: number;
    };
    server: {
        portainerHost: {
            cpuCores: number | null;
            memTotalBytes: number | null;
            dockerRootDir: string | null;
            os: string | null;
            kernel: string | null;
        } | null;
        localProbe: {
            hostname: string;
            uptimeSec: number;
            loadAvg1m: number;
            cpuCores: number;
            memTotalBytes: number;
            memFreeBytes: number;
            memUsedBytes: number;
            memUsedPercent: number;
            diskTotalBytes: number | null;
            diskFreeBytes: number | null;
            diskUsedBytes: number | null;
            diskUsedPercent: number | null;
            note: string;
        } | null;
    };
    containers: Array<{
        id: string;
        name: string;
        image: string;
        state: string;
        status: string;
        health: HealthStatus;
        createdAt: string | null;
        ports: string[];
        metrics: {
            cpuPercent: number | null;
            memUsageBytes: number | null;
            memLimitBytes: number | null;
            memPercent: number | null;
            cacheBytes: number | null;
            netRxBytes: number | null;
            netTxBytes: number | null;
            blockReadBytes: number | null;
            blockWriteBytes: number | null;
            pidsCurrent: number | null;
        };
    }>;
    warnings: string[];
}

type StatFsResult = {
    bsize?: number;
    frsize?: number;
    blocks?: number;
    bavail?: number;
    bfree?: number;
};

type LocalProbeDeps = {
    hostname: () => string;
    uptime: () => number;
    loadavg: () => number[];
    cpus: () => { model: string }[];
    totalmem: () => number;
    freemem: () => number;
    statfs: (path: string) => Promise<StatFsResult>;
    isContainerized: () => boolean;
};

const DEFAULT_LOCAL_PROBE_DEPS: LocalProbeDeps = {
    hostname: () => os.hostname(),
    uptime: () => os.uptime(),
    loadavg: () => os.loadavg(),
    cpus: () => os.cpus(),
    totalmem: () => os.totalmem(),
    freemem: () => os.freemem(),
    statfs: async (path: string) => await statfsFs(path),
    isContainerized: () => existsSync('/.dockerenv'),
};

function toSafeNumber(value: unknown): number | null {
    if (typeof value !== 'number') return null;
    if (!Number.isFinite(value)) return null;
    return value;
}

function formatContainerPort(port: DockerPort | undefined): string {
    if (!port) return '—';
    const privatePort = port.PrivatePort ?? '?';
    const type = port.Type ?? 'tcp';
    if (port.PublicPort != null) {
        return `${port.PublicPort}:${privatePort}/${type}`;
    }
    return `${privatePort}/${type}`;
}

export function extractMemoryCacheBytes(stats: DockerContainerStats['memory_stats'] | undefined): number | null {
    const map = stats?.stats;
    if (!map) return null;
    const direct = toSafeNumber(map.cache);
    if (direct != null) return direct;
    const totalInactive = toSafeNumber(map.total_inactive_file);
    if (totalInactive != null) return totalInactive;
    return toSafeNumber(map.inactive_file);
}

export function calculateMemoryPercent(usage: number | null, limit: number | null): number | null {
    if (usage == null || limit == null || limit <= 0) return null;
    return Number(((usage / limit) * 100).toFixed(2));
}

export function computeDockerCpuPercent(stats: DockerContainerStats): number | null {
    const cpuTotal = toSafeNumber(stats.cpu_stats?.cpu_usage?.total_usage);
    const preCpuTotal = toSafeNumber(stats.precpu_stats?.cpu_usage?.total_usage);
    const systemCpu = toSafeNumber(stats.cpu_stats?.system_cpu_usage);
    const preSystemCpu = toSafeNumber(stats.precpu_stats?.system_cpu_usage);

    if (cpuTotal == null || preCpuTotal == null || systemCpu == null || preSystemCpu == null) {
        return null;
    }

    const cpuDelta = cpuTotal - preCpuTotal;
    const systemDelta = systemCpu - preSystemCpu;
    if (cpuDelta <= 0 || systemDelta <= 0) return null;

    const onlineCpus = toSafeNumber(stats.cpu_stats?.online_cpus)
        ?? stats.cpu_stats?.cpu_usage?.percpu_usage?.length
        ?? 1;
    if (!Number.isFinite(onlineCpus) || onlineCpus <= 0) return null;

    return Number((((cpuDelta / systemDelta) * onlineCpus) * 100).toFixed(2));
}

function mapHealth(status: string, state: string): HealthStatus {
    const s = `${status} ${state}`.toLowerCase();
    if (s.includes('unhealthy')) return 'unhealthy';
    if (s.includes('healthy')) return 'healthy';
    if (s.includes('starting')) return 'starting';
    return 'unknown';
}

function mapBlockIo(stats: DockerContainerStats): { read: number | null; write: number | null } {
    const records = stats.blkio_stats?.io_service_bytes_recursive ?? [];
    if (!Array.isArray(records) || records.length === 0) return { read: null, write: null };

    let read = 0;
    let write = 0;
    for (const row of records) {
        const value = toSafeNumber(row.value);
        if (value == null) continue;
        const op = (row.op ?? '').toLowerCase();
        if (op === 'read') read += value;
        if (op === 'write') write += value;
    }

    return {
        read: read > 0 ? read : null,
        write: write > 0 ? write : null,
    };
}

function mapNetworkTotals(stats: DockerContainerStats): { rx: number | null; tx: number | null } {
    const networks = stats.networks;
    if (!networks || typeof networks !== 'object') return { rx: null, tx: null };

    let rx = 0;
    let tx = 0;
    let hasRx = false;
    let hasTx = false;
    for (const net of Object.values(networks)) {
        const netRx = toSafeNumber(net?.rx_bytes);
        const netTx = toSafeNumber(net?.tx_bytes);
        if (netRx != null) {
            rx += netRx;
            hasRx = true;
        }
        if (netTx != null) {
            tx += netTx;
            hasTx = true;
        }
    }

    return {
        rx: hasRx ? rx : null,
        tx: hasTx ? tx : null,
    };
}

async function mapLocalProbe(
    warnings: string[],
    deps: LocalProbeDeps = DEFAULT_LOCAL_PROBE_DEPS,
): Promise<InfraMetricsResponse['server']['localProbe']> {
    const memTotalBytes = deps.totalmem();
    const memFreeBytes = deps.freemem();
    const memUsedBytes = Math.max(memTotalBytes - memFreeBytes, 0);
    const memUsedPercent = memTotalBytes > 0 ? Number(((memUsedBytes / memTotalBytes) * 100).toFixed(2)) : 0;

    let diskTotalBytes: number | null = null;
    let diskFreeBytes: number | null = null;
    let diskUsedBytes: number | null = null;
    let diskUsedPercent: number | null = null;

    try {
        const fsStats = await deps.statfs('/');
        const blockSize = toSafeNumber(fsStats.frsize) ?? toSafeNumber(fsStats.bsize) ?? 0;
        const blocks = toSafeNumber(fsStats.blocks) ?? 0;
        const freeBlocks = toSafeNumber(fsStats.bavail) ?? toSafeNumber(fsStats.bfree) ?? 0;
        if (blockSize > 0 && blocks > 0) {
            diskTotalBytes = Math.max(Math.floor(blocks * blockSize), 0);
            diskFreeBytes = Math.max(Math.floor(freeBlocks * blockSize), 0);
            diskUsedBytes = Math.max(diskTotalBytes - diskFreeBytes, 0);
            diskUsedPercent = diskTotalBytes > 0
                ? Number(((diskUsedBytes / diskTotalBytes) * 100).toFixed(2))
                : null;
        }
    } catch {
        warnings.push('Local disk stats unavailable (statfs not supported by runtime).');
    }

    const note = deps.isContainerized()
        ? 'Local probe runs inside HUD container and may reflect container cgroup limits, not full VPS capacity.'
        : 'Local probe reflects the host where HUD process runs.';

    return {
        hostname: deps.hostname(),
        uptimeSec: Math.floor(deps.uptime()),
        loadAvg1m: Number((deps.loadavg()[0] ?? 0).toFixed(2)),
        cpuCores: deps.cpus().length,
        memTotalBytes,
        memFreeBytes,
        memUsedBytes,
        memUsedPercent,
        diskTotalBytes,
        diskFreeBytes,
        diskUsedBytes,
        diskUsedPercent,
        note,
    };
}

function isEnabled(value: string | undefined, fallback = true): boolean {
    if (!value) return fallback;
    const normalized = value.trim().toLowerCase();
    if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
    if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
    return fallback;
}

function mapContainerName(container: DockerContainerSummary): string {
    const raw = container.Names?.[0] ?? '';
    const normalized = raw.startsWith('/') ? raw.slice(1) : raw;
    return normalized || container.Id.slice(0, 12);
}

function mapCreatedAt(created: number | undefined): string | null {
    if (!created || !Number.isFinite(created) || created <= 0) return null;
    return new Date(created * 1000).toISOString();
}

export async function collectInfraMetrics(): Promise<InfraMetricsResponse> {
    const config = getPortainerConfig();
    const warnings: string[] = [];
    const localProbesEnabled = isEnabled(process.env.INFRA_ENABLE_LOCAL_PROBES, true);

    let portainerHost: InfraMetricsResponse['server']['portainerHost'] = null;
    try {
        const info = await getDockerInfo(config);
        portainerHost = {
            cpuCores: toSafeNumber(info.NCPU),
            memTotalBytes: toSafeNumber(info.MemTotal),
            dockerRootDir: typeof info.DockerRootDir === 'string' ? info.DockerRootDir : null,
            os: typeof info.OperatingSystem === 'string' ? info.OperatingSystem : null,
            kernel: typeof info.KernelVersion === 'string' ? info.KernelVersion : null,
        };
    } catch (error) {
        warnings.push(`Portainer host info unavailable: ${error instanceof Error ? error.message : 'unknown error'}`);
    }

    let dockerContainers: DockerContainerSummary[] = [];
    try {
        dockerContainers = await listDockerContainers(config);
    } catch (error) {
        warnings.push(`Portainer containers list unavailable: ${error instanceof Error ? error.message : 'unknown error'}`);
    }

    const statsById = new Map<string, DockerContainerStats>();
    const statsResults = await Promise.allSettled(
        dockerContainers.map(async (container) => {
            const stats = await getDockerContainerStats(config, container.Id);
            return { id: container.Id, stats, name: mapContainerName(container) };
        })
    );

    for (const result of statsResults) {
        if (result.status === 'fulfilled') {
            statsById.set(result.value.id, result.value.stats);
        } else {
            warnings.push(`Container stats unavailable for one container: ${result.reason instanceof Error ? result.reason.message : 'unknown error'}`);
        }
    }

    const containers: InfraMetricsResponse['containers'] = dockerContainers.map((container) => {
        const stats = statsById.get(container.Id);
        const memUsageBytes = toSafeNumber(stats?.memory_stats?.usage);
        const memLimitBytes = toSafeNumber(stats?.memory_stats?.limit);
        const network = stats ? mapNetworkTotals(stats) : { rx: null, tx: null };
        const blockIo = stats ? mapBlockIo(stats) : { read: null, write: null };

        return {
            id: container.Id,
            name: mapContainerName(container),
            image: container.Image ?? '—',
            state: container.State ?? 'unknown',
            status: container.Status ?? 'unknown',
            health: mapHealth(container.Status ?? '', container.State ?? ''),
            createdAt: mapCreatedAt(container.Created),
            ports: (container.Ports ?? []).map((port) => formatContainerPort(port)),
            metrics: {
                cpuPercent: stats ? computeDockerCpuPercent(stats) : null,
                memUsageBytes,
                memLimitBytes,
                memPercent: calculateMemoryPercent(memUsageBytes, memLimitBytes),
                cacheBytes: stats ? extractMemoryCacheBytes(stats.memory_stats) : null,
                netRxBytes: network.rx,
                netTxBytes: network.tx,
                blockReadBytes: blockIo.read,
                blockWriteBytes: blockIo.write,
                pidsCurrent: toSafeNumber(stats?.pids_stats?.current),
            },
        };
    });

    const containersRunning = containers.filter((c) => c.state === 'running').length;
    const unhealthyCount = containers.filter((c) => c.health === 'unhealthy').length;

    let localProbe: InfraMetricsResponse['server']['localProbe'] = null;
    if (localProbesEnabled) {
        localProbe = await mapLocalProbe(warnings);
    }

    return {
        success: true,
        timestamp: new Date().toISOString(),
        source: {
            portainerBaseUrl: config.baseUrl,
            endpointId: config.endpointId,
            localProbesEnabled,
        },
        summary: {
            containersTotal: containers.length,
            containersRunning,
            containersStopped: containers.length - containersRunning,
            unhealthyCount,
        },
        server: {
            portainerHost,
            localProbe,
        },
        containers,
        warnings,
    };
}

export async function collectLocalProbeForTest(
    warnings: string[],
    deps: LocalProbeDeps,
): Promise<InfraMetricsResponse['server']['localProbe']> {
    return await mapLocalProbe(warnings, deps);
}

export function getInfraStreamIntervalMs(): number {
    const raw = process.env.INFRA_STREAM_INTERVAL_MS;
    if (!raw) return 5000;
    const parsed = Number.parseInt(raw, 10);
    if (!Number.isFinite(parsed)) return 5000;
    return Math.max(1000, Math.min(parsed, 60000));
}
