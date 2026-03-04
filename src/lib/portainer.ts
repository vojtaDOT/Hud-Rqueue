const DEFAULT_TIMEOUT_MS = 8000;

export interface PortainerConfig {
    baseUrl: string;
    endpointId: number;
    apiToken: string;
    requestTimeoutMs: number;
}

export interface DockerPort {
    IP?: string;
    PrivatePort?: number;
    PublicPort?: number;
    Type?: string;
}

export interface DockerContainerSummary {
    Id: string;
    Names?: string[];
    Image?: string;
    State?: string;
    Status?: string;
    Created?: number;
    Ports?: DockerPort[];
}

export interface DockerContainerStats {
    cpu_stats?: {
        cpu_usage?: {
            total_usage?: number;
            percpu_usage?: number[];
        };
        system_cpu_usage?: number;
        online_cpus?: number;
    };
    precpu_stats?: {
        cpu_usage?: {
            total_usage?: number;
            percpu_usage?: number[];
        };
        system_cpu_usage?: number;
    };
    memory_stats?: {
        usage?: number;
        limit?: number;
        stats?: Record<string, number | undefined>;
    };
    networks?: Record<string, { rx_bytes?: number; tx_bytes?: number }>;
    blkio_stats?: {
        io_service_bytes_recursive?: Array<{ op?: string; value?: number }>;
    };
    pids_stats?: {
        current?: number;
    };
}

export interface DockerInfo {
    NCPU?: number;
    MemTotal?: number;
    DockerRootDir?: string;
    OperatingSystem?: string;
    KernelVersion?: string;
}

function parseTimeoutMs(value: string | undefined): number {
    if (!value) return DEFAULT_TIMEOUT_MS;
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_TIMEOUT_MS;
    return parsed;
}

export function getPortainerConfig(): PortainerConfig {
    const baseUrl = process.env.PORTAINER_BASE_URL?.trim();
    const apiToken = process.env.PORTAINER_API_TOKEN?.trim();
    const endpointIdRaw = process.env.PORTAINER_ENDPOINT_ID?.trim();

    if (!baseUrl) {
        const err = new Error('Missing PORTAINER_BASE_URL');
        err.name = 'InfraConfigError';
        throw err;
    }
    if (!apiToken) {
        const err = new Error('Missing PORTAINER_API_TOKEN');
        err.name = 'InfraConfigError';
        throw err;
    }
    if (!endpointIdRaw) {
        const err = new Error('Missing PORTAINER_ENDPOINT_ID');
        err.name = 'InfraConfigError';
        throw err;
    }

    let endpointId: number;
    try {
        endpointId = Number.parseInt(endpointIdRaw, 10);
    } catch {
        const err = new Error('PORTAINER_ENDPOINT_ID must be a number');
        err.name = 'InfraConfigError';
        throw err;
    }
    if (!Number.isFinite(endpointId) || endpointId <= 0) {
        const err = new Error('PORTAINER_ENDPOINT_ID must be a positive number');
        err.name = 'InfraConfigError';
        throw err;
    }

    return {
        baseUrl: baseUrl.replace(/\/+$/, ''),
        apiToken,
        endpointId,
        requestTimeoutMs: parseTimeoutMs(process.env.PORTAINER_REQUEST_TIMEOUT_MS),
    };
}

function buildDockerPath(endpointId: number, path: string): string {
    return `/api/endpoints/${endpointId}/docker${path}`;
}

async function fetchPortainerJson<T>(config: PortainerConfig, path: string): Promise<T> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), config.requestTimeoutMs);
    const url = `${config.baseUrl}${path}`;

    try {
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                Accept: 'application/json',
                'X-API-Key': config.apiToken,
            },
            cache: 'no-store',
            signal: controller.signal,
        });

        if (!response.ok) {
            const body = await response.text().catch(() => '');
            const shortBody = body.slice(0, 200);
            throw new Error(`Portainer request failed (${response.status})${shortBody ? `: ${shortBody}` : ''}`);
        }

        return (await response.json()) as T;
    } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
            throw new Error('Portainer request timed out');
        }
        throw error;
    } finally {
        clearTimeout(timeoutId);
    }
}

export async function listDockerContainers(config: PortainerConfig): Promise<DockerContainerSummary[]> {
    return await fetchPortainerJson<DockerContainerSummary[]>(
        config,
        buildDockerPath(config.endpointId, '/containers/json?all=1')
    );
}

export async function getDockerContainerStats(
    config: PortainerConfig,
    containerId: string
): Promise<DockerContainerStats> {
    return await fetchPortainerJson<DockerContainerStats>(
        config,
        buildDockerPath(config.endpointId, `/containers/${encodeURIComponent(containerId)}/stats?stream=false`)
    );
}

export async function getDockerInfo(config: PortainerConfig): Promise<DockerInfo> {
    return await fetchPortainerJson<DockerInfo>(config, buildDockerPath(config.endpointId, '/info'));
}
