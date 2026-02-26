'use client';

import * as React from 'react';
import {
    CheckCircle2,
    Loader2,
    Play,
    RefreshCw,
    Search,
    FileDown,
    ScanText,
    BarChart3,
    AlertCircle,
    Copy,
    ExternalLink,
    TriangleAlert,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { supabase } from '@/lib/supabase';
import { useSources, type Source } from '@/hooks/use-sources';
import { useIngestionItems } from '@/hooks/use-ingestion-items';
import { useIngestionRuns } from '@/hooks/use-ingestion-runs';
import type {
    PipelineCreatedJob,
    PipelineIngestionItem,
    PipelineJobRequest,
    PipelineJobStatus,
    PipelineJobStatusValue,
    PipelineRunListItem,
    PipelineRunScope,
    PipelineRunState,
    PipelineStage,
    PipelineSummary,
} from './types';

interface SourceUrlMeta {
    id: string;
    source_id: string;
    url?: string;
    label?: string | null;
    created_at?: string;
    updated_at?: string;
}

interface DocumentItem {
    id: string;
    source_url_id: string;
    url: string;
    filename: string | null;
    checksum: string | null;
    created_at: string;
    last_seen_at: string | null;
    updated_at: string;
    meta: unknown;
    external_storage: unknown;
}

interface IngestionRunItem {
    id: string;
    source_id: string;
    source_url_id: string | null;
    status: string;
    active_stage: string | null;
    started_at: string | null;
    finished_at: string | null;
    error_message: string | null;
    created_at: string;
    updated_at: string | null;
    stats_json: unknown;
}

interface IngestionItemRow {
    id: string;
    run_id: string | null;
    source_id: string | null;
    document_id: string | null;
    source_url_id: string | null;
    item_key: string | null;
    item_label: string | null;
    stage: string | null;
    item_type: string | null;
    status: string | null;
    ingest_status: string;
    error_message: string | null;
    last_error_message: string | null;
    review_reason: string | null;
    needs_review: boolean;
    updated_at: string;
    created_at: string;
    filename: string | null;
    document_url: string;
    file_kind: string | null;
    file_checksum: string | null;
    ingest_reason: string | null;
    job_id: string | null;
    step_order: number | null;
    context_json: unknown;
    payload_json: unknown;
    first_seen_at: string | null;
    last_seen_at: string | null;
}

interface QueueOperatorJobProgress {
    job_id: string;
    parent_job_id: string | null;
    source_id: string;
    task_type: string;
    attempt: number;
    status: 'queued' | 'processing' | 'completed' | 'failed' | string;
    phase: string | null;
    step: string | null;
    progress_pct: number;
    units_completed: number | null;
    units_total: number | null;
    children_total: number | null;
    children_completed: number | null;
    children_failed: number | null;
    started_at: string | null;
    updated_at: string | null;
    completed_at: string | null;
    error: string | null;
}

interface QueueOperatorSourceActiveJob {
    job_id: string;
    task_type: string;
    status: 'queued' | 'processing' | 'completed' | 'failed' | string;
    phase: string | null;
    step: string | null;
    progress_pct: number;
    updated_at: string | null;
}

interface QueueOperatorSourceProgress {
    source_id: string;
    active_jobs: QueueOperatorSourceActiveJob[];
    aggregate_progress_pct: number;
    status: 'queued' | 'processing' | 'completed' | 'failed' | 'idle' | string;
    updated_at: string | null;
}

const STAGES: Array<{ key: PipelineStage; label: string; icon: React.ComponentType<{ className?: string }> }> = [
    { key: 'sources', label: 'Sources', icon: Search },
    { key: 'discovery', label: 'Discovery', icon: Search },
    { key: 'download', label: 'Download', icon: FileDown },
    { key: 'ocr', label: 'OCR', icon: ScanText },
    { key: 'summary', label: 'Souhrn', icon: BarChart3 },
];

const STAGE_ORDER: PipelineStage[] = ['sources', 'discovery', 'download', 'ocr', 'summary'];
const QUEUE_OPERATOR_TIMEOUT_MS = 4000;
const QUEUE_OPERATOR_POLL_MS = 3000;
const QUEUE_OPERATOR_STALE_MS = 15000;
const OCR_JOB_DEFAULTS = {
    mode: 'hybrid',
    lang: 'ces+eng',
    dpi: '300',
    psm: '3',
    oem: '3',
    min_text_chars: '30',
    ocr_addon: '1',
} as const;

const TERMINAL_STATUSES: PipelineJobStatusValue[] = ['completed', 'failed', 'unknown'];

function isTerminal(status: PipelineJobStatusValue): boolean {
    return TERMINAL_STATUSES.includes(status);
}

function parseDate(value: string | null | undefined): Date | null {
    if (!value) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
}

function daysBetween(now: Date, past: Date): number {
    const diffMs = now.getTime() - past.getTime();
    return Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
}

function getStatusDot(status: PipelineJobStatusValue): string {
    switch (status) {
        case 'pending':
            return 'bg-yellow-500';
        case 'processing':
            return 'bg-blue-500 animate-pulse';
        case 'completed':
            return 'bg-green-500';
        case 'failed':
            return 'bg-red-500';
        default:
            return 'bg-zinc-500';
    }
}

function getStatusLabel(status: PipelineJobStatusValue): string {
    switch (status) {
        case 'pending':
            return 'pending';
        case 'processing':
            return 'processing';
        case 'completed':
            return 'completed';
        case 'failed':
            return 'failed';
        default:
            return 'unknown';
    }
}

function hasBlobStorage(value: unknown): boolean {
    if (value === null || value === undefined) return false;
    if (typeof value === 'string') return value.trim().length > 0;
    if (typeof value === 'object') return Object.keys(value as Record<string, unknown>).length > 0;
    return Boolean(value);
}

function hasText(value: string | null | undefined): boolean {
    return Boolean(value && value.trim().length > 0);
}

function getNumber(value: unknown): number | null {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.trim() !== '') {
        const parsed = Number(value);
        if (Number.isFinite(parsed)) return parsed;
    }
    return null;
}

function getString(value: unknown): string | null {
    return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function formatBytes(bytes: number | null): string {
    if (bytes === null || bytes < 0) return '—';
    if (bytes === 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    const idx = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
    const value = bytes / (1024 ** idx);
    return `${value.toFixed(value >= 10 || idx === 0 ? 0 : 1)} ${units[idx]}`;
}

function toPrettyJson(value: unknown): string {
    try {
        return JSON.stringify(value, null, 2);
    } catch {
        return String(value);
    }
}

interface DocumentDebugDetails {
    blobUuid: string | null;
    blobEndpoint: string | null;
    blobBucket: string | null;
    blobExtension: string | null;
    blobDocumentKey: string | null;
    blobInputKey: string | null;
    sourcePageUrl: string | null;
    fileSizeBytes: number | null;
    fileContentType: string | null;
    fileChecksum: string | null;
    uploadTimestamp: string | null;
}

interface OcrUnifiedRow {
    documentId: string;
    document: DocumentItem | null;
    latestJob: PipelineJobStatus | null;
    jobCount: number;
    isCandidate: boolean;
    blobUuid: string | null;
}

function getDocumentDebugDetails(doc: DocumentItem, sourcePageUrl: string | null): DocumentDebugDetails {
    const storage = isObjectRecord(doc.external_storage) ? doc.external_storage : null;
    const meta = isObjectRecord(doc.meta) ? doc.meta : null;
    const storageUpload = meta && isObjectRecord(meta.storage_upload) ? meta.storage_upload : null;
    const outputs = storage && isObjectRecord(storage.outputs) ? storage.outputs : null;

    let outputSizeBytes: number | null = null;
    if (outputs) {
        for (const value of Object.values(outputs)) {
            if (!isObjectRecord(value)) continue;
            const size = getNumber(value.size_bytes);
            if (size !== null) {
                outputSizeBytes = size;
                break;
            }
        }
    }

    const storageBlock = storageUpload && isObjectRecord(storageUpload.storage)
        ? storageUpload.storage
        : null;
    const documentKey = getString(storageBlock?.document_key)
        ?? getString(storageBlock?.input_key)
        ?? getString(storage?.worker && isObjectRecord(storage.worker) ? storage.worker.input_key : null);

    return {
        blobUuid: getString(storage?.uuid),
        blobEndpoint: getString(storage?.endpoint),
        blobBucket: getString(storage?.bucket),
        blobExtension: getString(storage?.extension),
        blobDocumentKey: documentKey,
        blobInputKey: getString(storage?.worker && isObjectRecord(storage.worker) ? storage.worker.input_key : null),
        sourcePageUrl: getString(storageUpload?.url) ?? sourcePageUrl,
        fileSizeBytes: getNumber(storageUpload?.file_size) ?? outputSizeBytes,
        fileContentType: getString(storageUpload?.content_type),
        fileChecksum: getString(storageUpload?.checksum) ?? getString(doc.checksum),
        uploadTimestamp: getString(storageUpload?.uploaded_at),
    };
}

function isIngestionRunIssue(run: IngestionRunItem): boolean {
    return /(fail|error)/i.test(run.status || '');
}

function getIngestionItemIssueMessage(item: IngestionItemRow): string | null {
    if (hasText(item.last_error_message)) return item.last_error_message!;
    if (hasText(item.error_message)) return item.error_message!;
    if (hasText(item.review_reason)) return item.review_reason!;
    if (item.needs_review) return 'needs_review=true';
    if (/(fail|error|review)/i.test(item.ingest_status || '')) {
        return `ingest_status=${item.ingest_status}`;
    }
    return null;
}

function chunk<T>(items: T[], size: number): T[][] {
    const result: T[][] = [];
    for (let i = 0; i < items.length; i += size) {
        result.push(items.slice(i, i + size));
    }
    return result;
}

function getStageIndex(stage: PipelineStage): number {
    return STAGE_ORDER.indexOf(stage);
}

function getJobCounts(jobs: PipelineJobStatus[]) {
    return jobs.reduce(
        (acc, job) => {
            if (job.status === 'pending') acc.pending++;
            if (job.status === 'processing') acc.processing++;
            if (job.status === 'completed') acc.completed++;
            if (job.status === 'failed') acc.failed++;
            return acc;
        },
        { pending: 0, processing: 0, completed: 0, failed: 0 },
    );
}

function normalizeProgressPct(value: number | null | undefined): number {
    if (typeof value !== 'number' || Number.isNaN(value)) return 0;
    return Math.max(0, Math.min(100, Math.round(value)));
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === 'object';
}

function hasDiscoveryDownloadFileStep(crawlParams: unknown): boolean {
    if (!isObjectRecord(crawlParams)) return false;
    const discovery = crawlParams.discovery;
    if (!isObjectRecord(discovery)) return false;
    const chain = discovery.chain;
    if (!Array.isArray(chain)) return false;

    const visit = (nodes: unknown[]): boolean => {
        for (const node of nodes) {
            if (!isObjectRecord(node)) continue;
            const repeater = node.repeater;
            if (isObjectRecord(repeater) && Array.isArray(repeater.steps)) {
                const hasDownloadFile = repeater.steps.some((step) => (
                    isObjectRecord(step) && step.type === 'download_file'
                ));
                if (hasDownloadFile) return true;
            }

            const children = node.children;
            if (Array.isArray(children) && visit(children)) {
                return true;
            }
        }

        return false;
    };

    return visit(chain);
}

function buildQueueOperatorUrl(pathname: string): string {
    const base = process.env.NEXT_PUBLIC_QUEUE_OPERATOR_URL?.trim();
    if (!base) return pathname;
    return `${base.replace(/\/$/, '')}${pathname}`;
}

async function fetchQueueOperatorJson<T>(pathname: string): Promise<{ status: number; data: T | null }> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), QUEUE_OPERATOR_TIMEOUT_MS);
    try {
        const response = await fetch(buildQueueOperatorUrl(pathname), {
            method: 'GET',
            headers: { Accept: 'application/json' },
            cache: 'no-store',
            signal: controller.signal,
        });

        if (!response.ok) {
            return { status: response.status, data: null };
        }

        const data = (await response.json()) as T;
        return { status: response.status, data };
    } finally {
        clearTimeout(timer);
    }
}

function mergeStatuses(
    previous: PipelineJobStatus[],
    updates: PipelineJobStatus[],
): PipelineJobStatus[] {
    if (previous.length === 0) return previous;
    const byId = new Map(updates.map((job) => [job.id, job]));
    return previous.map((job) => byId.get(job.id) ?? job);
}

function toPendingStatuses(jobs: PipelineCreatedJob[]): PipelineJobStatus[] {
    return jobs.map((job) => ({
        id: job.id,
        task: job.task,
        status: 'pending',
        run_id: job.run_id,
        attempts: '0',
        error_message: '',
        started_at: '',
        completed_at: '',
        source_id: job.source_id,
        source_url_id: job.source_url_id,
        document_id: job.document_id,
        manual: job.manual ?? false,
    }));
}

interface ManualPipelineProps {
    devMode: boolean;
}

export function ManualPipeline({ devMode }: ManualPipelineProps) {
    const { sources, loading: sourcesLoading } = useSources();
    const [runScope, setRunScope] = React.useState<PipelineRunScope>('active');
    const [runState, setRunState] = React.useState<PipelineRunState>({
        selectedSourceId: null,
        selectedRunId: null,
        runStartedAt: null,
        activeStage: 'sources',
    });
    const [maxVisitedStage, setMaxVisitedStage] = React.useState<PipelineStage>('sources');

    const [sourceUrlMeta, setSourceUrlMeta] = React.useState<SourceUrlMeta[]>([]);
    const [sourceMetaLoading, setSourceMetaLoading] = React.useState(false);

    const [discoverJobs, setDiscoverJobs] = React.useState<PipelineJobStatus[]>([]);
    const [downloadJobs, setDownloadJobs] = React.useState<PipelineJobStatus[]>([]);
    const [ocrJobs, setOcrJobs] = React.useState<PipelineJobStatus[]>([]);

    const [discoveredSourceUrls, setDiscoveredSourceUrls] = React.useState<SourceUrlMeta[]>([]);
    const [downloadDocuments, setDownloadDocuments] = React.useState<DocumentItem[]>([]);
    const [changedDocuments, setChangedDocuments] = React.useState<DocumentItem[]>([]);
    const [ingestionRuns, setIngestionRuns] = React.useState<IngestionRunItem[]>([]);
    const [ingestionItems, setIngestionItems] = React.useState<IngestionItemRow[]>([]);
    const [ingestionLoading, setIngestionLoading] = React.useState(false);

    const {
        runs: activeRuns,
        loading: activeRunsLoading,
        refresh: refreshActiveRuns,
    } = useIngestionRuns('active');
    const {
        runs: historyRuns,
        loading: historyRunsLoading,
        refresh: refreshHistoryRuns,
    } = useIngestionRuns('history');
    const {
        items: selectedRunItems,
        loading: selectedRunItemsLoading,
        refresh: refreshSelectedRunItems,
    } = useIngestionItems(runState.selectedRunId);

    const [submittingDiscovery, setSubmittingDiscovery] = React.useState(false);
    const [submittingDownload, setSubmittingDownload] = React.useState(false);
    const [submittingOcr, setSubmittingOcr] = React.useState(false);
    const [refreshingData, setRefreshingData] = React.useState(false);
    const [operatorJobProgressById, setOperatorJobProgressById] = React.useState<Record<string, QueueOperatorJobProgress>>({});
    const [operatorSourceProgress, setOperatorSourceProgress] = React.useState<QueueOperatorSourceProgress | null>(null);
    const [operatorConnectionState, setOperatorConnectionState] = React.useState<'idle' | 'connecting' | 'connected' | 'error'>('idle');
    const [operatorError, setOperatorError] = React.useState<string | null>(null);

    const [discoverySettled, setDiscoverySettled] = React.useState(false);
    const [downloadSettled, setDownloadSettled] = React.useState(false);
    const [ocrSettled, setOcrSettled] = React.useState(false);
    const [loadingDiscoveryDetails, setLoadingDiscoveryDetails] = React.useState(false);
    const [loadingDownloadDetails, setLoadingDownloadDetails] = React.useState(false);
    const [loadingOcrDetails, setLoadingOcrDetails] = React.useState(false);
    const [downloadSkippedByDiscovery, setDownloadSkippedByDiscovery] = React.useState(false);

    const selectedSource = React.useMemo(
        () => sources.find((source) => String(source.id) === runState.selectedSourceId) ?? null,
        [sources, runState.selectedSourceId],
    );
    const allRuns = React.useMemo(() => {
        const byId = new Map<string, PipelineRunListItem>();
        for (const run of [...activeRuns, ...historyRuns]) {
            byId.set(String(run.id), run);
        }
        return Array.from(byId.values()).sort((a, b) => {
            const aTime = parseDate(a.started_at)?.getTime() ?? 0;
            const bTime = parseDate(b.started_at)?.getTime() ?? 0;
            return bTime - aTime;
        });
    }, [activeRuns, historyRuns]);
    const scopedRuns = React.useMemo(
        () => (runScope === 'active' ? activeRuns : historyRuns),
        [activeRuns, historyRuns, runScope],
    );
    const selectedRun = React.useMemo(
        () => allRuns.find((run) => String(run.id) === runState.selectedRunId) ?? null,
        [allRuns, runState.selectedRunId],
    );
    const selectedSourceHasDiscoveryDownloadFile = React.useMemo(
        () => hasDiscoveryDownloadFileStep(selectedSource?.crawl_params),
        [selectedSource?.crawl_params],
    );

    const sourceStats = React.useMemo(() => {
        const countBySource = new Map<string, number>();
        const latestBySource = new Map<string, string>();

        for (const item of sourceUrlMeta) {
            const sourceId = String(item.source_id);
            countBySource.set(sourceId, (countBySource.get(sourceId) ?? 0) + 1);

            if (!item.updated_at) continue;
            const existing = latestBySource.get(sourceId);
            if (!existing || new Date(item.updated_at).getTime() > new Date(existing).getTime()) {
                latestBySource.set(sourceId, item.updated_at);
            }
        }

        return { countBySource, latestBySource };
    }, [sourceUrlMeta]);

    const discoverCompleted = discoverJobs.length > 0 && discoverJobs.every((job) => job.status === 'completed');
    const downloadCompleted = downloadJobs.length > 0 && downloadJobs.every((job) => job.status === 'completed');
    const downloadStageCompleted = downloadCompleted || downloadSkippedByDiscovery;
    const ocrCompleted = ocrJobs.length > 0 && ocrJobs.every((job) => job.status === 'completed');

    const allJobs = React.useMemo(
        () => [...discoverJobs, ...downloadJobs, ...ocrJobs],
        [discoverJobs, downloadJobs, ocrJobs],
    );

    const activeJobIds = React.useMemo(
        () => allJobs.filter((job) => !isTerminal(job.status)).map((job) => job.id),
        [allJobs],
    );

    const discoveryFocusJobId = React.useMemo(
        () => discoverJobs.find((job) => !isTerminal(job.status))?.id ?? discoverJobs[0]?.id ?? null,
        [discoverJobs],
    );
    const downloadFocusJobId = React.useMemo(
        () => downloadJobs.find((job) => !isTerminal(job.status))?.id ?? downloadJobs[0]?.id ?? null,
        [downloadJobs],
    );
    const ocrFocusJobId = React.useMemo(
        () => ocrJobs.find((job) => !isTerminal(job.status))?.id ?? ocrJobs[0]?.id ?? null,
        [ocrJobs],
    );

    const queueOperatorTrackedJobIds = React.useMemo(() => {
        const ids = [discoveryFocusJobId, downloadFocusJobId, ocrFocusJobId].filter((id): id is string => Boolean(id));
        return Array.from(new Set(ids));
    }, [discoveryFocusJobId, downloadFocusJobId, ocrFocusJobId]);

    const summary = React.useMemo<PipelineSummary>(() => {
        const runStarted = parseDate(runState.runStartedAt);
        const newSourceUrls = runStarted
            ? discoveredSourceUrls.filter((item) => {
                const createdAt = parseDate(item.created_at);
                return createdAt ? createdAt.getTime() >= runStarted.getTime() : false;
            }).length
            : 0;

        return {
            newSourceUrls,
            changedDocuments: changedDocuments.length,
            blobOk: changedDocuments.filter((doc) => hasBlobStorage(doc.external_storage)).length,
            ocrCompleted: ocrJobs.filter((job) => job.status === 'completed').length,
            ocrFailed: ocrJobs.filter((job) => job.status === 'failed').length,
        };
    }, [changedDocuments, discoveredSourceUrls, ocrJobs, runState.runStartedAt]);

    React.useEffect(() => {
        if (!selectedRun) {
            setIngestionRuns([]);
            return;
        }

        setIngestionRuns([{
            id: String(selectedRun.id),
            source_id: String(selectedRun.source_id),
            source_url_id: selectedRun.source_url_id ? String(selectedRun.source_url_id) : null,
            status: String(selectedRun.status),
            active_stage: selectedRun.active_stage ? String(selectedRun.active_stage) : null,
            started_at: selectedRun.started_at,
            finished_at: selectedRun.finished_at,
            error_message: selectedRun.error_message,
            created_at: selectedRun.created_at,
            updated_at: selectedRun.updated_at,
            stats_json: selectedRun.stats_json ?? null,
        }]);
    }, [selectedRun]);

    React.useEffect(() => {
        if (!selectedRun) return;
        const nextSourceId = selectedRun.source_id ? String(selectedRun.source_id) : null;
        const nextStartedAt = selectedRun.started_at || selectedRun.created_at || null;
        const activeStageRaw = String(selectedRun.active_stage || '').toLowerCase();
        const mappedStage: PipelineStage | null = activeStageRaw === 'documents'
            ? 'download'
            : activeStageRaw === 'discovery' || activeStageRaw === 'ocr' || activeStageRaw === 'summary'
                ? (activeStageRaw as PipelineStage)
                : null;
        setRunState((prev) => {
            if (
                prev.selectedSourceId === nextSourceId
                && prev.runStartedAt === nextStartedAt
                && (!mappedStage || prev.activeStage === mappedStage)
            ) {
                return prev;
            }
            return {
                ...prev,
                selectedSourceId: nextSourceId || prev.selectedSourceId,
                runStartedAt: nextStartedAt,
                activeStage: mappedStage || prev.activeStage,
            };
        });
    }, [selectedRun]);

    React.useEffect(() => {
        const normalizedItems = selectedRunItems.map((item) => ({
            ...item,
            document_id: item.document_id,
            source_url_id: item.source_url_id,
            source_id: item.source_id,
            ingest_status: item.ingest_status || item.status || 'pending',
            updated_at: item.updated_at || item.last_seen_at || item.created_at,
            created_at: item.created_at,
            document_url: item.document_url || '',
            payload_json: item.payload_json ?? null,
            context_json: item.context_json ?? null,
        })) as IngestionItemRow[];
        setIngestionItems(normalizedItems);
    }, [selectedRunItems]);

    React.useEffect(() => {
        setIngestionLoading(activeRunsLoading || historyRunsLoading || selectedRunItemsLoading);
    }, [activeRunsLoading, historyRunsLoading, selectedRunItemsLoading]);

    const discoverCounts = React.useMemo(() => getJobCounts(discoverJobs), [discoverJobs]);
    const downloadCounts = React.useMemo(() => getJobCounts(downloadJobs), [downloadJobs]);
    const ocrCounts = React.useMemo(() => getJobCounts(ocrJobs), [ocrJobs]);
    const discoveryOperatorProgress = discoveryFocusJobId ? operatorJobProgressById[discoveryFocusJobId] : undefined;
    const downloadOperatorProgress = downloadFocusJobId ? operatorJobProgressById[downloadFocusJobId] : undefined;
    const ocrOperatorProgress = ocrFocusJobId ? operatorJobProgressById[ocrFocusJobId] : undefined;
    const sourceAggregateProgressPct = operatorSourceProgress
        ? normalizeProgressPct(operatorSourceProgress.aggregate_progress_pct)
        : null;
    const sourceActiveJobById = React.useMemo(() => {
        const map = new Map<string, QueueOperatorSourceActiveJob>();
        for (const job of operatorSourceProgress?.active_jobs ?? []) {
            map.set(String(job.job_id), job);
        }
        return map;
    }, [operatorSourceProgress]);
    const operatorSourceStale = React.useMemo(() => {
        if (!operatorSourceProgress?.updated_at) return false;
        return Date.now() - new Date(operatorSourceProgress.updated_at).getTime() > QUEUE_OPERATOR_STALE_MS;
    }, [operatorSourceProgress]);
    const discoveryOperatorState = React.useMemo(() => {
        const sourceJob = discoveryFocusJobId ? sourceActiveJobById.get(discoveryFocusJobId) : undefined;
        if (discoveryOperatorProgress) {
            return {
                progressPct: normalizeProgressPct(discoveryOperatorProgress.progress_pct),
                phase: discoveryOperatorProgress.phase,
                step: discoveryOperatorProgress.step,
                status: discoveryOperatorProgress.status,
                stale: operatorSourceStale,
                source: 'job' as const,
            };
        }
        if (sourceAggregateProgressPct !== null) {
            return {
                progressPct: sourceAggregateProgressPct,
                phase: sourceJob?.phase ?? null,
                step: sourceJob?.step ?? null,
                status: sourceJob?.status ?? operatorSourceProgress?.status ?? null,
                stale: operatorSourceStale,
                source: 'source' as const,
            };
        }
        return undefined;
    }, [
        discoveryFocusJobId,
        discoveryOperatorProgress,
        operatorSourceProgress?.status,
        operatorSourceStale,
        sourceActiveJobById,
        sourceAggregateProgressPct,
    ]);

    const downloadOperatorState = React.useMemo(() => {
        const sourceJob = downloadFocusJobId ? sourceActiveJobById.get(downloadFocusJobId) : undefined;
        if (downloadOperatorProgress) {
            return {
                progressPct: normalizeProgressPct(downloadOperatorProgress.progress_pct),
                phase: downloadOperatorProgress.phase,
                step: downloadOperatorProgress.step,
                status: downloadOperatorProgress.status,
                stale: operatorSourceStale,
                source: 'job' as const,
            };
        }
        if (sourceAggregateProgressPct !== null) {
            return {
                progressPct: sourceAggregateProgressPct,
                phase: sourceJob?.phase ?? null,
                step: sourceJob?.step ?? null,
                status: sourceJob?.status ?? operatorSourceProgress?.status ?? null,
                stale: operatorSourceStale,
                source: 'source' as const,
            };
        }
        return undefined;
    }, [
        downloadFocusJobId,
        downloadOperatorProgress,
        operatorSourceProgress?.status,
        operatorSourceStale,
        sourceActiveJobById,
        sourceAggregateProgressPct,
    ]);

    const ocrOperatorState = React.useMemo(() => {
        const sourceJob = ocrFocusJobId ? sourceActiveJobById.get(ocrFocusJobId) : undefined;
        if (ocrOperatorProgress) {
            return {
                progressPct: normalizeProgressPct(ocrOperatorProgress.progress_pct),
                phase: ocrOperatorProgress.phase,
                step: ocrOperatorProgress.step,
                status: ocrOperatorProgress.status,
                stale: operatorSourceStale,
                source: 'job' as const,
            };
        }
        if (sourceAggregateProgressPct !== null) {
            return {
                progressPct: sourceAggregateProgressPct,
                phase: sourceJob?.phase ?? null,
                step: sourceJob?.step ?? null,
                status: sourceJob?.status ?? operatorSourceProgress?.status ?? null,
                stale: operatorSourceStale,
                source: 'source' as const,
            };
        }
        return undefined;
    }, [
        ocrFocusJobId,
        ocrOperatorProgress,
        operatorSourceProgress?.status,
        operatorSourceStale,
        sourceActiveJobById,
        sourceAggregateProgressPct,
    ]);

    const activeStageLabel = React.useMemo(
        () => STAGES.find((stage) => stage.key === runState.activeStage)?.label ?? 'Pipeline',
        [runState.activeStage],
    );

    const activeWaitReasons = React.useMemo(() => {
        const reasons: string[] = [];

        if (submittingDiscovery) reasons.push('Odesílám discovery job do Redis queue');
        if (submittingDownload) reasons.push('Odesílám download joby do Redis queue');
        if (submittingOcr) reasons.push('Odesílám OCR joby do Redis queue');

        if (discoverCounts.pending + discoverCounts.processing > 0) {
            reasons.push(`Discovery běží (${discoverCounts.pending} pending, ${discoverCounts.processing} processing)`);
        }
        if (downloadCounts.pending + downloadCounts.processing > 0) {
            reasons.push(`Download běží (${downloadCounts.pending} pending, ${downloadCounts.processing} processing)`);
        }
        if (ocrCounts.pending + ocrCounts.processing > 0) {
            reasons.push(`OCR běží (${ocrCounts.pending} pending, ${ocrCounts.processing} processing)`);
        }

        if (loadingDiscoveryDetails) reasons.push('Načítám výsledky discovery (source URLs + diagnostika)');
        if (loadingDownloadDetails) reasons.push('Načítám výsledky download (documents + diagnostika)');
        if (loadingOcrDetails) reasons.push('Donačítám OCR diagnostiku');
        if (refreshingData) reasons.push('Obnovuji všechna data obrazovky');
        if (ingestionLoading) reasons.push('Načítám ingestion runs/items z databáze');
        if (operatorConnectionState === 'connecting') reasons.push('Napojování na Queue-Operator progress API');
        if (operatorConnectionState === 'error' && operatorError) reasons.push(`Queue-Operator chyba: ${operatorError}`);
        if (operatorSourceStale) reasons.push('Queue-Operator data jsou stale (>15s)');

        return reasons;
    }, [
        discoverCounts.pending,
        discoverCounts.processing,
        downloadCounts.pending,
        downloadCounts.processing,
        ingestionLoading,
        loadingDiscoveryDetails,
        loadingDownloadDetails,
        loadingOcrDetails,
        operatorConnectionState,
        operatorError,
        operatorSourceStale,
        ocrCounts.pending,
        ocrCounts.processing,
        refreshingData,
        submittingDiscovery,
        submittingDownload,
        submittingOcr,
    ]);

    const isBusy = activeWaitReasons.length > 0;

    const fetchAllSourceUrlMeta = React.useCallback(async () => {
        setSourceMetaLoading(true);
        try {
            const pageSize = 1000;
            let from = 0;
            const allRows: SourceUrlMeta[] = [];

            while (true) {
                const { data, error } = await supabase
                    .from('source_urls')
                    .select('id, source_id, url, label, created_at, updated_at')
                    .range(from, from + pageSize - 1);

                if (error) throw error;
                if (!data || data.length === 0) break;

                allRows.push(...data.map((row) => ({
                    ...row,
                    id: String(row.id),
                    source_id: String(row.source_id),
                })));
                if (data.length < pageSize) break;
                from += pageSize;
            }

            setSourceUrlMeta(allRows);
        } catch (error) {
            console.error('Failed to fetch source URL metadata:', error);
            toast.error('Nepodařilo se načíst stav source URLs');
        } finally {
            setSourceMetaLoading(false);
        }
    }, []);

    const fetchDocumentsByIds = React.useCallback(async (documentIds: string[]) => {
        if (documentIds.length === 0) return [] as DocumentItem[];

        const batches = chunk(documentIds, 300);
        const allRows: DocumentItem[] = [];

        for (const batch of batches) {
            const { data, error } = await supabase
                .from('documents')
                .select('id, source_url_id, url, filename, checksum, created_at, last_seen_at, updated_at, meta, external_storage')
                .in('id', batch)
                .is('deleted_at', null)
                .order('updated_at', { ascending: false });

            if (error) throw error;
            if (data) {
                allRows.push(...data.map((row) => ({ ...row, source_url_id: String(row.source_url_id) })));
            }
        }

        return allRows;
    }, []);

    const fetchIngestionDiagnostics = React.useCallback(async (runId: string) => {
        setIngestionLoading(true);
        try {
            const { data: runData, error: runError } = await supabase
                .from('ingestion_runs')
                .select('*')
                .eq('id', runId)
                .single();

            if (runError) throw runError;
            if (!runData) {
                setIngestionRuns([]);
                setIngestionItems([]);
                setDiscoveredSourceUrls([]);
                setDownloadDocuments([]);
                setChangedDocuments([]);
                return;
            }

            const normalizedRun: IngestionRunItem = {
                id: String(runData.id),
                source_id: String((runData as { source_id?: string | number }).source_id ?? runState.selectedSourceId ?? ''),
                source_url_id: (runData as { source_url_id?: string | number | null }).source_url_id
                    ? String((runData as { source_url_id?: string | number }).source_url_id)
                    : null,
                status: String((runData as { status?: string }).status ?? 'pending'),
                active_stage: (runData as { active_stage?: string | null }).active_stage ?? null,
                started_at: (runData as { started_at?: string | null }).started_at ?? null,
                finished_at: (runData as { finished_at?: string | null }).finished_at ?? null,
                error_message: (runData as { error_message?: string | null }).error_message ?? null,
                created_at: String((runData as { created_at?: string }).created_at ?? ''),
                updated_at: (runData as { updated_at?: string | null }).updated_at ?? null,
                stats_json: (runData as { stats_json?: unknown }).stats_json ?? null,
            };
            setIngestionRuns([normalizedRun]);

            const { data: items, error: itemError } = await supabase
                .from('ingestion_items')
                .select('*')
                .eq('run_id', runId)
                .order('last_seen_at', { ascending: false })
                .order('updated_at', { ascending: false });

            if (itemError) throw itemError;

            const allItems: IngestionItemRow[] = [];
            for (const item of items ?? []) {
                const row = item as PipelineIngestionItem;
                allItems.push({
                    ...row,
                    id: String(row.id),
                    run_id: row.run_id ? String(row.run_id) : null,
                    source_id: row.source_id ? String(row.source_id) : null,
                    document_id: row.document_id ? String(row.document_id) : null,
                    source_url_id: row.source_url_id ? String(row.source_url_id) : null,
                    item_key: row.item_key ?? null,
                    item_label: row.item_label ?? null,
                    stage: row.stage ?? null,
                    item_type: row.item_type ?? null,
                    status: row.status ?? null,
                    ingest_status: row.ingest_status || row.status || 'pending',
                    ingest_reason: row.ingest_reason ?? null,
                    job_id: row.job_id ?? null,
                    step_order: row.step_order ?? null,
                    context_json: row.context_json ?? null,
                    updated_at: row.updated_at,
                    created_at: row.created_at,
                    filename: row.filename ?? null,
                    document_url: row.document_url || '',
                    file_kind: row.file_kind ?? null,
                    file_checksum: row.file_checksum ?? null,
                    payload_json: row.payload_json ?? null,
                    error_message: row.error_message ?? null,
                    last_error_message: row.last_error_message ?? null,
                    review_reason: row.review_reason ?? null,
                    needs_review: Boolean(row.needs_review),
                    first_seen_at: row.first_seen_at ?? null,
                    last_seen_at: row.last_seen_at ?? null,
                });
            }

            setIngestionItems(allItems);

            const sourceUrlMetaById = new Map<string, SourceUrlMeta>();
            for (const meta of sourceUrlMeta) {
                sourceUrlMetaById.set(String(meta.id), meta);
            }

            const sourceUrlIds = Array.from(new Set(
                allItems
                    .filter((item) => item.stage === 'discovery' || item.item_type === 'source_url')
                    .map((item) => item.source_url_id)
                    .filter((item): item is string => Boolean(item)),
            ));

            const missingSourceUrlIds = sourceUrlIds.filter((id) => !sourceUrlMetaById.has(id));
            if (missingSourceUrlIds.length > 0) {
                const { data: missingSourceUrls, error: missingSourceUrlsError } = await supabase
                    .from('source_urls')
                    .select('id, source_id, url, label, created_at, updated_at')
                    .in('id', missingSourceUrlIds);
                if (!missingSourceUrlsError) {
                    for (const row of missingSourceUrls ?? []) {
                        sourceUrlMetaById.set(String(row.id), {
                            ...row,
                            id: String(row.id),
                            source_id: String(row.source_id),
                        });
                    }
                }
            }

            const discovered = sourceUrlIds.map((sourceUrlId) => {
                const existing = sourceUrlMetaById.get(sourceUrlId);
                if (existing) return existing;
                const item = allItems.find((row) => row.source_url_id === sourceUrlId);
                return {
                    id: sourceUrlId,
                    source_id: normalizedRun.source_id,
                    url: item?.document_url || item?.item_label || undefined,
                    label: item?.item_label ?? null,
                    created_at: item?.created_at,
                    updated_at: item?.updated_at,
                } satisfies SourceUrlMeta;
            });
            setDiscoveredSourceUrls(discovered);

            const documentIds = Array.from(new Set(
                allItems
                    .filter((item) => (
                        item.document_id
                        && (item.stage === 'documents' || item.stage === 'ocr' || item.item_type === 'document' || item.item_type === 'ocr_job')
                    ))
                    .map((item) => item.document_id)
                    .filter((item): item is string => Boolean(item)),
            ));

            const docs = await fetchDocumentsByIds(documentIds);
            setDownloadDocuments(docs);

            const ocrCandidateIds = new Set(
                allItems
                    .filter((item) => item.stage === 'ocr' || item.item_type === 'ocr_job')
                    .map((item) => item.document_id)
                    .filter((item): item is string => Boolean(item)),
            );
            const changed = ocrCandidateIds.size > 0
                ? docs.filter((doc) => ocrCandidateIds.has(String(doc.id)))
                : docs;
            setChangedDocuments(changed);
        } catch (error) {
            console.error('Failed to fetch ingestion diagnostics:', error);
            toast.error('Nepodařilo se načíst ingestion diagnostiku');
        } finally {
            setIngestionLoading(false);
        }
    }, [fetchDocumentsByIds, runState.selectedSourceId, sourceUrlMeta]);

    const refreshDerivedData = React.useCallback(async () => {
        if (!runState.selectedRunId) return;

        setRefreshingData(true);
        try {
            await fetchIngestionDiagnostics(runState.selectedRunId);
            await fetchAllSourceUrlMeta();
            await Promise.all([refreshActiveRuns(), refreshHistoryRuns(), refreshSelectedRunItems()]);
        } catch (error) {
            console.error('Refresh pipeline data failed:', error);
            toast.error('Nepodařilo se obnovit data pipeline');
        } finally {
            setRefreshingData(false);
        }
    }, [
        fetchAllSourceUrlMeta,
        fetchIngestionDiagnostics,
        refreshActiveRuns,
        refreshHistoryRuns,
        refreshSelectedRunItems,
        runState.selectedRunId,
    ]);

    const enqueueJobs = React.useCallback(async (jobs: PipelineJobRequest[]) => {
        const response = await fetch('/api/pipeline/jobs', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ jobs }),
        });
        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.error || 'Failed to enqueue jobs');
        }
        return data.jobs as PipelineCreatedJob[];
    }, []);

    const fetchJobStatuses = React.useCallback(async (jobIds: string[]) => {
        const response = await fetch('/api/pipeline/job-status', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ job_ids: jobIds }),
        });
        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.error || 'Failed to fetch job statuses');
        }
        return data.jobs as PipelineJobStatus[];
    }, []);

    const createPipelineRun = React.useCallback(async (sourceId: string) => {
        const response = await fetch('/api/pipeline/runs', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ source_id: sourceId }),
        });
        const data = await response.json();
        if (!response.ok || !data.run) {
            throw new Error(data.error || 'Nepodařilo se vytvořit pipeline run');
        }
        return data.run as PipelineRunListItem;
    }, []);

    const patchPipelineRun = React.useCallback(async (runId: string, updates: Record<string, unknown>) => {
        const response = await fetch(`/api/pipeline/runs/${encodeURIComponent(runId)}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updates),
        });
        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.error || 'Nepodařilo se upravit pipeline run');
        }
        return data.run as PipelineRunListItem;
    }, []);

    const patchSelectedRun = React.useCallback(async (updates: Record<string, unknown>) => {
        if (!runState.selectedRunId) return;
        try {
            await patchPipelineRun(runState.selectedRunId, updates);
            await Promise.all([refreshActiveRuns(), refreshHistoryRuns()]);
        } catch (error) {
            console.error('Failed to patch selected run:', error);
        }
    }, [patchPipelineRun, refreshActiveRuns, refreshHistoryRuns, runState.selectedRunId]);

    const unlockStage = React.useCallback((stage: PipelineStage) => {
        setMaxVisitedStage((prev) => (
            getStageIndex(stage) > getStageIndex(prev) ? stage : prev
        ));
    }, []);

    const resetRunStateForSource = React.useCallback((sourceId: string, runId: string, runStartedAt: string) => {
        setRunState({
            selectedSourceId: sourceId,
            selectedRunId: runId,
            runStartedAt,
            activeStage: 'discovery',
        });
        setMaxVisitedStage('discovery');
        setDiscoverJobs([]);
        setDownloadJobs([]);
        setOcrJobs([]);
        setDiscoveredSourceUrls([]);
        setDownloadDocuments([]);
        setChangedDocuments([]);
        setIngestionRuns([]);
        setIngestionItems([]);
        setIngestionLoading(false);
        setOperatorJobProgressById({});
        setOperatorSourceProgress(null);
        setOperatorConnectionState('idle');
        setOperatorError(null);
        setDiscoverySettled(false);
        setDownloadSettled(false);
        setOcrSettled(false);
        setLoadingDiscoveryDetails(false);
        setLoadingDownloadDetails(false);
        setLoadingOcrDetails(false);
        setDownloadSkippedByDiscovery(false);
    }, []);

    const handleSelectRun = React.useCallback((run: PipelineRunListItem) => {
        const runId = String(run.id);
        const sourceId = String(run.source_id);
        const startedAt = run.started_at || run.created_at || null;
        setRunState((prev) => ({
            ...prev,
            selectedRunId: runId,
            selectedSourceId: sourceId,
            runStartedAt: startedAt,
            activeStage: prev.activeStage === 'sources' ? 'discovery' : prev.activeStage,
        }));
        setMaxVisitedStage('summary');
        setDiscoverJobs([]);
        setDownloadJobs([]);
        setOcrJobs([]);
        setOperatorJobProgressById({});
        setOperatorSourceProgress(null);
        setOperatorConnectionState('idle');
        setOperatorError(null);
        setDiscoverySettled(false);
        setDownloadSettled(false);
        setOcrSettled(false);
        setDownloadSkippedByDiscovery(false);
        void fetchIngestionDiagnostics(runId);
    }, [fetchIngestionDiagnostics]);

    React.useEffect(() => {
        if (runState.selectedRunId) return;
        if (activeRuns.length === 0) return;
        handleSelectRun(activeRuns[0]);
    }, [activeRuns, handleSelectRun, runState.selectedRunId]);

    React.useEffect(() => {
        if (!runState.selectedRunId) return;
        void fetchIngestionDiagnostics(runState.selectedRunId);
    }, [fetchIngestionDiagnostics, runState.selectedRunId]);

    const handleStartDiscovery = React.useCallback(async (source: Source) => {
        const sourceId = String(source.id);
        setSubmittingDiscovery(true);
        let createdRunId: string | null = null;

        try {
            const run = await createPipelineRun(sourceId);
            const runId = String(run.id);
            createdRunId = runId;
            const runStartedAt = run.started_at || run.created_at || new Date().toISOString();

            resetRunStateForSource(sourceId, runId, runStartedAt);
            const jobs = await enqueueJobs([
                { task: 'discover', run_id: runId, source_id: sourceId, max_attempts: 3, manual: true },
            ]);
            setDiscoverJobs(toPendingStatuses(jobs));
            await Promise.all([refreshActiveRuns(), refreshHistoryRuns()]);
            toast.success(`Discovery zařazeno do fronty pro source #${sourceId}`);
        } catch (error) {
            console.error('Discovery enqueue failed:', error);
            if (createdRunId) {
                void patchPipelineRun(createdRunId, {
                    status: 'failed',
                    active_stage: 'discovery',
                    error_message: error instanceof Error ? error.message : 'Discovery enqueue failed',
                    finished_at: new Date().toISOString(),
                });
            }
            toast.error(error instanceof Error ? error.message : 'Nepodařilo se spustit discovery');
        } finally {
            setSubmittingDiscovery(false);
        }
    }, [createPipelineRun, enqueueJobs, patchPipelineRun, refreshActiveRuns, refreshHistoryRuns, resetRunStateForSource]);

    const handleStartDownload = React.useCallback(async () => {
        if (!runState.selectedSourceId || !runState.selectedRunId || discoveredSourceUrls.length === 0 || downloadSkippedByDiscovery) return;
        setSubmittingDownload(true);

        try {
            const jobs = await enqueueJobs(
                discoveredSourceUrls.map((sourceUrl) => ({
                    task: 'download',
                    run_id: runState.selectedRunId!,
                    source_id: runState.selectedSourceId!,
                    source_url_id: String(sourceUrl.id),
                    max_attempts: 3,
                    manual: true,
                })),
            );
            setDownloadJobs((prev) => [...prev, ...toPendingStatuses(jobs)]);
            setRunState((prev) => ({ ...prev, activeStage: 'download' }));
            unlockStage('download');
            setDownloadSettled(false);
            void patchSelectedRun({ active_stage: 'documents', status: 'running', error_message: null });
            toast.success(`Download jobs vytvořeny: ${jobs.length}`);
        } catch (error) {
            console.error('Download enqueue failed:', error);
            toast.error(error instanceof Error ? error.message : 'Nepodařilo se spustit download');
        } finally {
            setSubmittingDownload(false);
        }
    }, [discoveredSourceUrls, downloadSkippedByDiscovery, enqueueJobs, patchSelectedRun, runState.selectedRunId, runState.selectedSourceId, unlockStage]);

    const handleStartDownloadForSourceUrl = React.useCallback(async (sourceUrlId: string) => {
        if (!runState.selectedSourceId || !runState.selectedRunId || downloadSkippedByDiscovery) return;
        setSubmittingDownload(true);

        try {
            const jobs = await enqueueJobs([
                {
                    task: 'download',
                    run_id: runState.selectedRunId,
                    source_id: runState.selectedSourceId,
                    source_url_id: sourceUrlId,
                    max_attempts: 3,
                    manual: true,
                },
            ]);
            setDownloadJobs((prev) => [...prev, ...toPendingStatuses(jobs)]);
            setRunState((prev) => ({ ...prev, activeStage: 'download' }));
            setDownloadSettled(false);
            unlockStage('download');
            void patchSelectedRun({ active_stage: 'documents', status: 'running', error_message: null });
            toast.success('Download job vytvořen');
        } catch (error) {
            console.error('Single download enqueue failed:', error);
            toast.error(error instanceof Error ? error.message : 'Nepodařilo se spustit download');
        } finally {
            setSubmittingDownload(false);
        }
    }, [downloadSkippedByDiscovery, enqueueJobs, patchSelectedRun, runState.selectedRunId, runState.selectedSourceId, unlockStage]);

    const handleStartOcr = React.useCallback(async () => {
        if (!runState.selectedSourceId || !runState.selectedRunId || changedDocuments.length === 0) return;
        setSubmittingOcr(true);

        try {
            const jobs = await enqueueJobs(
                changedDocuments.map((document) => ({
                    task: 'ocr',
                    run_id: runState.selectedRunId!,
                    source_id: runState.selectedSourceId!,
                    source_url_id: String(document.source_url_id),
                    document_id: String(document.id),
                    max_attempts: 3,
                    manual: true,
                    ...OCR_JOB_DEFAULTS,
                })),
            );
            setOcrJobs((prev) => [...prev, ...toPendingStatuses(jobs)]);
            setRunState((prev) => ({ ...prev, activeStage: 'ocr' }));
            unlockStage('ocr');
            setOcrSettled(false);
            void patchSelectedRun({ active_stage: 'ocr', status: 'running', error_message: null });
            toast.success(`OCR jobs vytvořeny: ${jobs.length}`);
        } catch (error) {
            console.error('OCR enqueue failed:', error);
            toast.error(error instanceof Error ? error.message : 'Nepodařilo se spustit OCR');
        } finally {
            setSubmittingOcr(false);
        }
    }, [changedDocuments, enqueueJobs, patchSelectedRun, runState.selectedRunId, runState.selectedSourceId, unlockStage]);

    const handleStartOcrForDocument = React.useCallback(async (document: DocumentItem) => {
        if (!runState.selectedSourceId || !runState.selectedRunId) return;
        setSubmittingOcr(true);

        try {
            const jobs = await enqueueJobs([
                {
                    task: 'ocr',
                    run_id: runState.selectedRunId,
                    source_id: runState.selectedSourceId,
                    source_url_id: String(document.source_url_id),
                    document_id: String(document.id),
                    max_attempts: 3,
                    manual: true,
                    ...OCR_JOB_DEFAULTS,
                },
            ]);
            setOcrJobs((prev) => [...prev, ...toPendingStatuses(jobs)]);
            setRunState((prev) => ({ ...prev, activeStage: 'ocr' }));
            setOcrSettled(false);
            unlockStage('ocr');
            void patchSelectedRun({ active_stage: 'ocr', status: 'running', error_message: null });
            toast.success('OCR job vytvořen');
        } catch (error) {
            console.error('Single OCR enqueue failed:', error);
            toast.error(error instanceof Error ? error.message : 'Nepodařilo se spustit OCR');
        } finally {
            setSubmittingOcr(false);
        }
    }, [enqueueJobs, patchSelectedRun, runState.selectedRunId, runState.selectedSourceId, unlockStage]);

    React.useEffect(() => {
        fetchAllSourceUrlMeta();
    }, [fetchAllSourceUrlMeta]);

    React.useEffect(() => {
        const activeIndex = getStageIndex(runState.activeStage);
        const visitedIndex = getStageIndex(maxVisitedStage);
        if (activeIndex > visitedIndex) {
            setMaxVisitedStage(runState.activeStage);
        }
    }, [maxVisitedStage, runState.activeStage]);

    React.useEffect(() => {
        if (activeJobIds.length === 0) return;

        let cancelled = false;

        const poll = async () => {
            try {
                const jobs = await fetchJobStatuses(activeJobIds);
                if (cancelled) return;

                setDiscoverJobs((prev) => mergeStatuses(prev, jobs));
                setDownloadJobs((prev) => mergeStatuses(prev, jobs));
                setOcrJobs((prev) => mergeStatuses(prev, jobs));
            } catch (error) {
                console.error('Job status polling failed:', error);
            }
        };

        poll();
        const timer = setInterval(poll, 2000);

        return () => {
            cancelled = true;
            clearInterval(timer);
        };
    }, [activeJobIds, fetchJobStatuses]);

    React.useEffect(() => {
        if (!runState.selectedSourceId) return;

        let cancelled = false;
        let timer: ReturnType<typeof setTimeout> | null = null;
        setOperatorConnectionState('connecting');

        const poll = async () => {
            try {
                const sourceResponse = await fetchQueueOperatorJson<QueueOperatorSourceProgress>(
                    `/sources/${encodeURIComponent(runState.selectedSourceId!)}/progress`,
                );

                if (sourceResponse.status === 200 && sourceResponse.data) {
                    const sourceData = sourceResponse.data;
                    setOperatorSourceProgress({
                        ...sourceData,
                        source_id: String(sourceData.source_id),
                        aggregate_progress_pct: normalizeProgressPct(sourceData.aggregate_progress_pct),
                        active_jobs: (sourceData.active_jobs ?? []).map((job) => ({
                            ...job,
                            job_id: String(job.job_id),
                            progress_pct: normalizeProgressPct(job.progress_pct),
                        })),
                    });
                } else if (sourceResponse.status === 404) {
                    setOperatorSourceProgress(null);
                } else if (sourceResponse.status !== 0) {
                    throw new Error(`source progress HTTP ${sourceResponse.status}`);
                }

                if (queueOperatorTrackedJobIds.length > 0) {
                    const jobResponses = await Promise.all(
                        queueOperatorTrackedJobIds.map(async (jobId) => {
                            const response = await fetchQueueOperatorJson<QueueOperatorJobProgress>(
                                `/jobs/${encodeURIComponent(jobId)}/progress`,
                            );
                            return { jobId, response };
                        }),
                    );

                    setOperatorJobProgressById((prev) => {
                        const next = { ...prev };
                        for (const { jobId, response } of jobResponses) {
                            if (response.status === 200 && response.data) {
                                const job = response.data;
                                next[jobId] = {
                                    ...job,
                                    job_id: String(job.job_id),
                                    source_id: String(job.source_id),
                                    parent_job_id: job.parent_job_id ? String(job.parent_job_id) : null,
                                    progress_pct: normalizeProgressPct(job.progress_pct),
                                };
                            } else if (response.status === 404) {
                                delete next[jobId];
                            }
                        }
                        return next;
                    });
                }

                setOperatorConnectionState('connected');
                setOperatorError(null);
            } catch (error) {
                if (cancelled) return;
                setOperatorConnectionState('error');
                setOperatorError(error instanceof Error ? error.message : 'Queue-Operator progress unavailable');
            } finally {
                if (cancelled) return;
                const jitter = Math.floor(Math.random() * 300);
                timer = setTimeout(poll, QUEUE_OPERATOR_POLL_MS + jitter);
            }
        };

        poll();

        return () => {
            cancelled = true;
            if (timer) clearTimeout(timer);
        };
    }, [queueOperatorTrackedJobIds, runState.selectedSourceId]);

    React.useEffect(() => {
        const hasFailure = discoverJobs.some((job) => job.status === 'failed');
        if (hasFailure && !discoverySettled) {
            setDiscoverySettled(true);
            void patchSelectedRun({
                status: 'failed',
                active_stage: 'discovery',
                error_message: 'Discovery job selhal',
                finished_at: new Date().toISOString(),
            });
            toast.error('Discovery job selhal. Zkontrolujte error_message.');
        }
    }, [discoverJobs, discoverySettled, patchSelectedRun]);

    React.useEffect(() => {
        if (!discoverCompleted || discoverySettled || !runState.selectedRunId) return;

        setDiscoverySettled(true);
        setLoadingDiscoveryDetails(true);

        (async () => {
            try {
                await fetchIngestionDiagnostics(runState.selectedRunId!);
                await fetchAllSourceUrlMeta();
                if (selectedSourceHasDiscoveryDownloadFile) {
                    setDownloadSkippedByDiscovery(true);
                    setDownloadSettled(true);
                    void patchSelectedRun({ active_stage: 'ocr', status: 'running', error_message: null });
                    unlockStage('ocr');
                    toast.success('Discovery dokončeno. Download krok přeskočen, soubory připravené pro OCR.');
                } else {
                    setDownloadSkippedByDiscovery(false);
                    void patchSelectedRun({ active_stage: 'documents', status: 'running', error_message: null });
                    unlockStage('download');
                    toast.success('Discovery dokončeno');
                }
            } catch (error) {
                console.error('Failed to load discovered URLs:', error);
                toast.error('Nepodařilo se načíst discovered source URLs');
            } finally {
                setLoadingDiscoveryDetails(false);
            }
        })();
    }, [
        discoverCompleted,
        discoverySettled,
        fetchAllSourceUrlMeta,
        fetchIngestionDiagnostics,
        patchSelectedRun,
        runState.selectedRunId,
        selectedSourceHasDiscoveryDownloadFile,
        unlockStage,
    ]);

    React.useEffect(() => {
        const hasFailure = downloadJobs.some((job) => job.status === 'failed');
        if (hasFailure && !downloadSettled) {
            setDownloadSettled(true);
            void patchSelectedRun({
                status: 'failed',
                active_stage: 'documents',
                error_message: 'Některé download joby selhaly',
                finished_at: new Date().toISOString(),
            });
            toast.error('Některé download joby selhaly');
        }
    }, [downloadJobs, downloadSettled, patchSelectedRun]);

    React.useEffect(() => {
        if (!downloadCompleted || downloadSettled || !runState.selectedRunId) return;

        setDownloadSettled(true);
        setLoadingDownloadDetails(true);

        (async () => {
            try {
                await fetchIngestionDiagnostics(runState.selectedRunId!);
                void patchSelectedRun({ active_stage: 'ocr', status: 'running', error_message: null });
                unlockStage('ocr');
                toast.success('Download fáze dokončena');
            } catch (error) {
                console.error('Failed to load download results:', error);
                toast.error('Nepodařilo se načíst dokumenty po downloadu');
            } finally {
                setLoadingDownloadDetails(false);
            }
        })();
    }, [
        downloadCompleted,
        downloadSettled,
        fetchIngestionDiagnostics,
        patchSelectedRun,
        runState.selectedRunId,
        unlockStage,
    ]);

    React.useEffect(() => {
        const hasFailure = ocrJobs.some((job) => job.status === 'failed');
        if (hasFailure && !ocrSettled) {
            setOcrSettled(true);
            void patchSelectedRun({
                status: 'failed',
                active_stage: 'ocr',
                error_message: 'Některé OCR joby selhaly',
                finished_at: new Date().toISOString(),
            });
            unlockStage('summary');
            toast.error('Některé OCR joby selhaly');
        }
    }, [ocrJobs, ocrSettled, patchSelectedRun, unlockStage]);

    React.useEffect(() => {
        if (!ocrCompleted || ocrSettled) return;
        setOcrSettled(true);
        void patchSelectedRun({
            status: 'completed',
            active_stage: 'summary',
            error_message: null,
            finished_at: new Date().toISOString(),
        });
        unlockStage('summary');
        toast.success('OCR fáze dokončena');
    }, [ocrCompleted, ocrSettled, patchSelectedRun, unlockStage]);

    React.useEffect(() => {
        if (!ocrSettled || !runState.selectedRunId) return;
        (async () => {
            setLoadingOcrDetails(true);
            try {
                await fetchIngestionDiagnostics(runState.selectedRunId!);
            } finally {
                setLoadingOcrDetails(false);
            }
        })();
    }, [fetchIngestionDiagnostics, ocrSettled, runState.selectedRunId]);

    const renderSourceStatus = (source: Source) => {
        const sourceId = String(source.id);
        const count = sourceStats.countBySource.get(sourceId) ?? 0;

        if (count === 0) {
            return <span className="text-red-400 font-medium">neobjeveno</span>;
        }

        const reference = parseDate(source.last_crawled_at) ?? parseDate(sourceStats.latestBySource.get(sourceId));
        if (!reference) {
            return <span className="text-red-400 font-medium">neobjeveno</span>;
        }

        const dayDiff = daysBetween(new Date(), reference);
        const colorClass = dayDiff <= 1 ? 'text-green-400' : 'text-amber-400';
        const label = dayDiff === 0
            ? 'objeveno dnes'
            : dayDiff === 1
                ? 'objeveno před 1 dnem'
                : `objeveno před ${dayDiff} dny`;

        return <span className={cn('font-medium', colorClass)}>{label}</span>;
    };

    const renderRunsPanel = () => {
        const runsLoading = runScope === 'active' ? activeRunsLoading : historyRunsLoading;
        return (
            <Card className="ring-1 ring-blue-500/30">
                <CardHeader>
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                        <div>
                            <CardTitle>Pipeline Runs</CardTitle>
                            <CardDescription>Nedokončené běhy + historie</CardDescription>
                        </div>
                        <div className="inline-flex rounded-md border border-border/80 p-0.5">
                            <button
                                type="button"
                                className={cn(
                                    'px-3 py-1.5 text-xs rounded',
                                    runScope === 'active' ? 'bg-blue-500/20 text-blue-200' : 'text-muted-foreground hover:text-foreground',
                                )}
                                onClick={() => setRunScope('active')}
                            >
                                Aktivní
                            </button>
                            <button
                                type="button"
                                className={cn(
                                    'px-3 py-1.5 text-xs rounded',
                                    runScope === 'history' ? 'bg-blue-500/20 text-blue-200' : 'text-muted-foreground hover:text-foreground',
                                )}
                                onClick={() => setRunScope('history')}
                            >
                                Historie
                            </button>
                        </div>
                    </div>
                </CardHeader>
                <CardContent>
                    {runsLoading ? (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Načítám runy...
                        </div>
                    ) : scopedRuns.length === 0 ? (
                        <p className="text-sm text-muted-foreground">Žádné runy v tomto přehledu.</p>
                    ) : (
                        <div className="space-y-2">
                            {scopedRuns.map((run) => {
                                const source = sources.find((item) => String(item.id) === String(run.source_id));
                                const selected = String(run.id) === runState.selectedRunId;
                                const runStatus = String(run.status || 'pending');
                                const badgeClass = runStatus === 'completed'
                                    ? 'bg-green-500/15 text-green-300 border-green-500/30'
                                    : runStatus === 'failed'
                                        ? 'bg-red-500/15 text-red-300 border-red-500/30'
                                        : runStatus === 'canceled'
                                            ? 'bg-zinc-500/20 text-zinc-300 border-zinc-500/30'
                                            : 'bg-blue-500/15 text-blue-300 border-blue-500/30';
                                return (
                                    <button
                                        key={run.id}
                                        type="button"
                                        onClick={() => handleSelectRun(run)}
                                        className={cn(
                                            'w-full rounded-md border px-3 py-2 text-left transition-colors',
                                            selected
                                                ? 'border-blue-500/50 bg-blue-500/10'
                                                : 'border-border hover:bg-muted/30',
                                        )}
                                    >
                                        <div className="flex items-center gap-3 flex-wrap">
                                            <span className="font-mono text-xs w-20 shrink-0">#{run.id}</span>
                                            <span className="font-medium min-w-0 flex-1 truncate">
                                                {source?.name || `Source #${run.source_id}`}
                                            </span>
                                            <span className={cn('inline-flex items-center rounded-full border px-2 py-0.5 text-xs', badgeClass)}>
                                                {runStatus}
                                            </span>
                                            <span className="text-xs text-muted-foreground">
                                                {run.started_at ? new Date(run.started_at).toLocaleString('cs-CZ') : '—'}
                                            </span>
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    )}
                </CardContent>
            </Card>
        );
    };

    const renderJobsTable = (jobs: PipelineJobStatus[], emptyLabel: string) => (
        <div className="overflow-x-auto">
            <table className="w-full text-sm">
                <thead className="border-b border-border/60">
                    <tr>
                        <th className="text-left p-2">ID</th>
                        <th className="text-left p-2">Task</th>
                        <th className="text-left p-2">Status</th>
                        <th className="text-left p-2">Attempts</th>
                        <th className="text-left p-2">Error</th>
                    </tr>
                </thead>
                <tbody>
                    {jobs.length === 0 ? (
                        <tr>
                            <td colSpan={5} className="p-3 text-muted-foreground">{emptyLabel}</td>
                        </tr>
                    ) : (
                        jobs.map((job) => (
                            <tr key={job.id} className="border-b border-border/40">
                                <td className="p-2 font-mono text-xs">{job.id}</td>
                                <td className="p-2">{job.task}</td>
                                <td className="p-2">
                                    <span className="inline-flex items-center gap-1.5">
                                        <span className={cn('h-2 w-2 rounded-full', getStatusDot(job.status))} />
                                        {getStatusLabel(job.status)}
                                    </span>
                                </td>
                                <td className="p-2">{job.attempts}</td>
                                <td className="p-2 text-red-400">{job.error_message || '—'}</td>
                            </tr>
                        ))
                    )}
                </tbody>
            </table>
        </div>
    );

    const stageDone = (stage: PipelineStage): boolean => {
        if (stage === 'sources') return Boolean(runState.selectedRunId);
        if (stage === 'discovery') return discoverCompleted;
        if (stage === 'download') return downloadStageCompleted;
        if (stage === 'ocr') return ocrSettled || ocrCompleted;
        if (stage === 'summary') return ocrSettled || ocrCompleted || ocrJobs.some((job) => job.status === 'failed');
        return false;
    };

    const canNavigateToStage = React.useCallback((stage: PipelineStage) => {
        if (stage === 'sources') return true;
        return getStageIndex(stage) <= getStageIndex(maxVisitedStage);
    }, [maxVisitedStage]);

    const handleStepNavigate = React.useCallback((stage: PipelineStage) => {
        if (!canNavigateToStage(stage)) return;
        setRunState((prev) => ({ ...prev, activeStage: stage }));
    }, [canNavigateToStage]);

    const discoveredSourceUrlIds = React.useMemo(
        () => new Set(discoveredSourceUrls.map((item) => String(item.id))),
        [discoveredSourceUrls],
    );
    const discoveredSourceUrlById = React.useMemo(() => {
        const map = new Map<string, SourceUrlMeta>();
        for (const sourceUrl of discoveredSourceUrls) {
            map.set(String(sourceUrl.id), sourceUrl);
        }
        return map;
    }, [discoveredSourceUrls]);
    const changedDocumentIds = React.useMemo(
        () => new Set(changedDocuments.map((doc) => String(doc.id))),
        [changedDocuments],
    );
    const downloadDocumentById = React.useMemo(() => {
        const map = new Map<string, DocumentItem>();
        for (const document of downloadDocuments) {
            map.set(String(document.id), document);
        }
        return map;
    }, [downloadDocuments]);
    const changedDocumentById = React.useMemo(() => {
        const map = new Map<string, DocumentItem>();
        for (const document of changedDocuments) {
            map.set(String(document.id), document);
        }
        return map;
    }, [changedDocuments]);
    const ocrJobsByDocumentId = React.useMemo(() => {
        const map = new Map<string, PipelineJobStatus[]>();
        for (const job of ocrJobs) {
            const documentId = job.document_id?.trim();
            if (!documentId) continue;
            const existing = map.get(documentId);
            if (existing) {
                existing.push(job);
            } else {
                map.set(documentId, [job]);
            }
        }
        return map;
    }, [ocrJobs]);
    const ocrDocumentRows = React.useMemo<OcrUnifiedRow[]>(() => {
        const orderedIds: string[] = [];
        const seen = new Set<string>();
        const addDocumentId = (value: string | null | undefined) => {
            const documentId = value?.trim();
            if (!documentId || seen.has(documentId)) return;
            seen.add(documentId);
            orderedIds.push(documentId);
        };

        for (const document of downloadDocuments) {
            addDocumentId(String(document.id));
        }

        for (const documentId of ocrJobsByDocumentId.keys()) {
            addDocumentId(documentId);
        }

        return orderedIds.map((documentId) => {
            const document = downloadDocumentById.get(documentId) ?? changedDocumentById.get(documentId) ?? null;
            const jobs = ocrJobsByDocumentId.get(documentId) ?? [];
            const latestJob = jobs.length > 0 ? jobs[jobs.length - 1] : null;
            return {
                documentId,
                document,
                latestJob,
                jobCount: jobs.length,
                isCandidate: changedDocumentIds.has(documentId),
                blobUuid: document ? getDocumentDebugDetails(document, null).blobUuid : null,
            };
        });
    }, [changedDocumentById, changedDocumentIds, downloadDocumentById, downloadDocuments, ocrJobsByDocumentId]);
    const ocrDocumentRowById = React.useMemo(() => {
        const map = new Map<string, OcrUnifiedRow>();
        for (const row of ocrDocumentRows) {
            map.set(row.documentId, row);
        }
        return map;
    }, [ocrDocumentRows]);
    const activeProcessingOcrJob = React.useMemo(() => {
        const processingJobs = ocrJobs.filter((job) => job.status === 'processing' && hasText(job.document_id));
        if (processingJobs.length === 0) return null;

        let selected = processingJobs[0];
        let selectedStartedAt = parseDate(selected.started_at)?.getTime() ?? null;

        for (const job of processingJobs.slice(1)) {
            const candidateStartedAt = parseDate(job.started_at)?.getTime() ?? null;
            if (candidateStartedAt === null) continue;
            if (selectedStartedAt === null || candidateStartedAt > selectedStartedAt) {
                selected = job;
                selectedStartedAt = candidateStartedAt;
            }
        }

        return selected;
    }, [ocrJobs]);
    const activeProcessingDocumentId = activeProcessingOcrJob?.document_id?.trim() || null;
    const activeProcessingDocumentRow = React.useMemo(() => (
        activeProcessingDocumentId ? (ocrDocumentRowById.get(activeProcessingDocumentId) ?? null) : null
    ), [activeProcessingDocumentId, ocrDocumentRowById]);
    const activeProcessingDocumentUuid = activeProcessingDocumentRow?.blobUuid ?? null;

    const handleCopyToClipboard = React.useCallback(async (value: string, label: string) => {
        try {
            await navigator.clipboard.writeText(value);
            toast.success(`${label} zkopírováno`);
        } catch (error) {
            console.error('Copy to clipboard failed:', error);
            toast.error('Nepodařilo se zkopírovat hodnotu');
        }
    }, []);

    const discoveryErrors = React.useMemo(() => (
        discoverJobs
            .filter((job) => hasText(job.error_message))
            .map((job) => ({
                id: `redis-discovery-${job.id}`,
                source: `Redis job #${job.id}`,
                message: job.error_message,
            }))
    ), [discoverJobs]);

    const downloadErrors = React.useMemo(() => {
        const redisErrors = downloadJobs
            .filter((job) => hasText(job.error_message))
            .map((job) => ({
                id: `redis-download-${job.id}`,
                source: `Redis job #${job.id}`,
                message: job.error_message,
            }));

        const runErrors = ingestionRuns
            .filter((run) => String(run.id) === runState.selectedRunId && isIngestionRunIssue(run))
            .map((run) => ({
                id: `run-${run.id}`,
                source: `Ingestion run #${run.id}`,
                message: `status=${run.status}`,
            }));

        const itemErrors = ingestionItems
            .filter((item) => Boolean(item.source_url_id) && discoveredSourceUrlIds.has(item.source_url_id!))
            .map((item) => {
                const message = getIngestionItemIssueMessage(item);
                if (!message) return null;
                return {
                    id: `item-${item.id}`,
                    source: `Ingestion item #${item.id}`,
                    message,
                };
            })
            .filter((item): item is { id: string; source: string; message: string } => item !== null);

        return [...redisErrors, ...runErrors, ...itemErrors];
    }, [discoveredSourceUrlIds, downloadJobs, ingestionItems, ingestionRuns, runState.selectedRunId]);

    const ocrErrors = React.useMemo(() => {
        const redisErrors = ocrJobs
            .filter((job) => hasText(job.error_message))
            .map((job) => ({
                id: `redis-ocr-${job.id}`,
                source: `Redis job #${job.id}`,
                message: job.error_message,
            }));

        const itemErrors = ingestionItems
            .filter((item) => Boolean(item.document_id) && changedDocumentIds.has(item.document_id!))
            .map((item) => {
                const message = getIngestionItemIssueMessage(item);
                if (!message) return null;
                return {
                    id: `ocr-item-${item.id}`,
                    source: `Ingestion item #${item.id}`,
                    message,
                };
            })
            .filter((item): item is { id: string; source: string; message: string } => item !== null);

        return [...redisErrors, ...itemErrors];
    }, [changedDocumentIds, ingestionItems, ocrJobs]);

    const renderErrorPanel = (
        title: string,
        errors: Array<{ id: string; source: string; message: string }>,
    ) => {
        const visibleErrors = devMode ? errors : errors.slice(0, 12);
        return (
            <div className="rounded-md border border-red-500/30 bg-red-500/5 p-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                    <h4 className="text-sm font-semibold text-red-300">{title}</h4>
                    {ingestionLoading && (
                        <span className="inline-flex items-center gap-1 text-xs text-red-200/80">
                            <Loader2 className="h-3 w-3 animate-spin" />
                            loading db...
                        </span>
                    )}
                </div>
                {visibleErrors.length === 0 ? (
                    <p className="text-xs text-red-200/80">Žádné chyby v tomto kroku.</p>
                ) : (
                    <div className="space-y-1.5">
                        {visibleErrors.map((error) => (
                            <div key={error.id} className="text-xs text-red-100">
                                <span className="font-semibold">{error.source}:</span>{' '}
                                <span className="break-all">{error.message}</span>
                            </div>
                        ))}
                        {!devMode && errors.length > 12 && (
                            <p className="text-xs text-red-200/80">
                                + dalších {errors.length - 12} chyb
                            </p>
                        )}
                    </div>
                )}
            </div>
        );
    };

    const renderRawDebugPanel = (title: string, payload: unknown) => {
        if (!devMode) return null;
        return (
            <details className="rounded-md border border-sky-500/30 bg-sky-500/5 p-3">
                <summary className="cursor-pointer text-xs font-semibold text-sky-300">
                    {title}
                </summary>
                <pre className="mt-2 max-h-80 overflow-auto rounded bg-zinc-950/70 p-2 text-[11px] text-sky-100">
                    {toPrettyJson(payload)}
                </pre>
            </details>
        );
    };

    const renderStepProgress = (
        label: string,
        isLoading: boolean,
        stats?: { pending: number; processing: number; completed: number; failed: number },
        operator?: {
            progressPct: number | null;
            phase?: string | null;
            step?: string | null;
            status?: string | null;
            stale?: boolean;
            source?: 'job' | 'source';
        },
    ) => (
        <div className={cn(
            'rounded-md border p-2 text-xs space-y-2',
            isLoading ? 'border-blue-500/40 bg-blue-500/10 text-blue-100' : 'border-border text-muted-foreground',
        )}>
            <div className="flex items-center justify-between gap-2">
                <span className="font-medium">{label}</span>
                {isLoading ? (
                    <span className="inline-flex items-center gap-1">
                        <Loader2 className="h-3 w-3 animate-spin" />
                        Probíhá...
                    </span>
                ) : (
                    <span>Idle</span>
                )}
            </div>
            {operator && (
                <div className="space-y-1">
                    <div className="flex items-center justify-between gap-2 text-[11px]">
                        <span>
                            Queue-Operator {operator.source === 'source' ? '(source aggregate)' : '(job detail)'}
                        </span>
                        <span className="font-semibold">{operator.progressPct ?? 0}%</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-muted/60 overflow-hidden">
                        <div
                            className={cn(
                                'h-full rounded-full bg-blue-400 transition-all duration-500',
                                isLoading && 'pipeline-status-shimmer',
                                operator.stale && 'bg-amber-400',
                            )}
                            style={{ width: `${operator.progressPct ?? 0}%` }}
                        />
                    </div>
                    <div className="flex items-center gap-2 text-[11px]">
                        {operator.phase && <span>phase: {operator.phase}</span>}
                        {operator.step && <span>step: {operator.step}</span>}
                        {operator.status && <span>status: {operator.status}</span>}
                        {operator.stale && <span className="text-amber-300">stale</span>}
                    </div>
                </div>
            )}
            {stats && (
                <div className="mt-1 flex flex-wrap gap-3">
                    <span>pending: {stats.pending}</span>
                    <span>processing: {stats.processing}</span>
                    <span>completed: {stats.completed}</span>
                    <span>failed: {stats.failed}</span>
                </div>
            )}
        </div>
    );

    const renderSourcesCard = () => (
        <Card className="ring-1 ring-blue-500/40">
            <CardHeader>
                <CardTitle>1. Sources</CardTitle>
                <CardDescription>Kliknutím na source se enqueue discovery job</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
                {sourcesLoading || sourceMetaLoading ? (
                    <div className="flex items-center gap-2 text-muted-foreground text-sm">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Načítám sources...
                    </div>
                ) : sources.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Žádné sources.</p>
                ) : (
                    <div className="space-y-2">
                        {sources.map((source) => {
                            const selected = String(source.id) === runState.selectedSourceId;
                            return (
                                <button
                                    key={source.id}
                                    type="button"
                                    onClick={() => handleStartDiscovery(source)}
                                    disabled={submittingDiscovery}
                                    className={cn(
                                        'w-full rounded-md border px-3 py-2 text-left transition-colors',
                                        selected
                                            ? 'border-blue-500/50 bg-blue-500/10'
                                            : 'border-border hover:bg-muted/40',
                                    )}
                                >
                                    <div className="flex items-center gap-3">
                                        <span className="text-xs font-mono w-20 shrink-0">{source.id}</span>
                                        <span className="font-medium flex-1 truncate">{source.name}</span>
                                        <span className="text-sm">{renderSourceStatus(source)}</span>
                                        <span className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-border bg-muted/50">
                                            <Play className="h-3 w-3 text-muted-foreground" />
                                        </span>
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                )}
            </CardContent>
        </Card>
    );

    const renderDiscoveryCard = () => (
        <Card className="ring-1 ring-blue-500/40">
            <CardHeader>
                <CardTitle>2. Discovery</CardTitle>
                <CardDescription>
                    {selectedSource
                        ? `Source #${selectedSource.id}: ${selectedSource.name}`
                        : 'Nejprve vyberte source'}
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                {renderJobsTable(discoverJobs, 'Discovery zatím nebylo spuštěno')}
                {renderStepProgress(
                    'Stav discovery kroku',
                    submittingDiscovery || loadingDiscoveryDetails || discoverCounts.pending + discoverCounts.processing > 0,
                    discoverCounts,
                    discoveryOperatorState,
                )}
                {renderErrorPanel('Chyby discovery', discoveryErrors)}
                {renderRawDebugPanel('DEV raw: Discovery jobs + Queue-Operator', {
                    discoverJobs,
                    discoverCounts,
                    discoveryOperatorState,
                    operatorConnectionState,
                    operatorError,
                    queueOperatorTrackedJobIds,
                })}
                {downloadSkippedByDiscovery && (
                    <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-100">
                        Download krok přeskočen: soubory byly staženy již v Discovery, připraveno pro OCR.
                    </div>
                )}

                <div className="space-y-2">
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                        <h3 className="text-sm font-semibold">Discovered source URLs (aktuální run)</h3>
                        <Button
                            onClick={handleStartDownload}
                            disabled={!discoverCompleted || discoveredSourceUrls.length === 0 || submittingDownload || downloadSkippedByDiscovery}
                            size="sm"
                        >
                            {submittingDownload ? (
                                <>
                                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                    Enqueue...
                                </>
                            ) : downloadSkippedByDiscovery ? (
                                <>
                                    <CheckCircle2 className="h-4 w-4 mr-2" />
                                    Download skipnuto
                                </>
                            ) : (
                                <>
                                    <Play className="h-4 w-4 mr-2" />
                                    Scrape all
                                </>
                            )}
                        </Button>
                    </div>
                    <div className="border rounded-md divide-y">
                        {discoveredSourceUrls.length === 0 ? (
                            <p className="p-3 text-sm text-muted-foreground">
                                Žádné discovered URL v aktuálním runu.
                            </p>
                        ) : (
                            discoveredSourceUrls.map((item) => (
                                <div key={item.id} className="p-3 text-sm flex items-center gap-2">
                                    <span className="font-mono text-xs text-muted-foreground w-20">{item.id}</span>
                                    <span className="flex-1 truncate">{item.label || item.url}</span>
                                    <button
                                        type="button"
                                        onClick={() => handleStartDownloadForSourceUrl(String(item.id))}
                                        disabled={!discoverCompleted || submittingDownload || downloadSkippedByDiscovery}
                                        className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-border bg-muted/50 disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        <Play className="h-3 w-3 text-muted-foreground" />
                                    </button>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            </CardContent>
        </Card>
    );

    const renderDownloadCard = () => (
        <Card className="ring-1 ring-blue-500/40">
            <CardHeader>
                <CardTitle>3. Download + Blob</CardTitle>
                <CardDescription>Výsledek download fáze pro discovered URL</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                    <span className="text-sm text-muted-foreground">
                        OCR kandidáti: <span className="font-semibold text-foreground">{changedDocuments.length}</span>
                    </span>
                    <Button
                        onClick={handleStartOcr}
                        disabled={!downloadStageCompleted || changedDocuments.length === 0 || submittingOcr}
                        size="sm"
                    >
                        {submittingOcr ? (
                            <>
                                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                Enqueue...
                            </>
                        ) : (
                            <>
                                <ScanText className="h-4 w-4 mr-2" />
                                Scrape all
                            </>
                        )}
                    </Button>
                </div>
                {downloadSkippedByDiscovery && (
                    <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-100">
                        Download krok přeskočen: soubory byly staženy již v Discovery, připraveno pro OCR.
                    </div>
                )}
                {renderJobsTable(downloadJobs, 'Download jobs zatím nebyly vytvořeny')}
                {renderStepProgress(
                    'Stav download kroku',
                    submittingDownload || loadingDownloadDetails || downloadCounts.pending + downloadCounts.processing > 0,
                    downloadCounts,
                    downloadOperatorState,
                )}
                {renderErrorPanel('Chyby download', downloadErrors)}
                {renderRawDebugPanel('DEV raw: Download docs + ingestion diagnostika', {
                    downloadJobs,
                    downloadCounts,
                    downloadDocuments,
                    discoveredSourceUrls,
                    ingestionRuns,
                    ingestionItems,
                    downloadOperatorState,
                })}
                <div className="border rounded-md divide-y">
                    {downloadDocuments.length === 0 ? (
                        <p className="p-3 text-sm text-muted-foreground">Zatím nejsou žádné dokumenty.</p>
                    ) : (
                        downloadDocuments.map((doc) => {
                            const sourceUrlMeta = discoveredSourceUrlById.get(String(doc.source_url_id));
                            const sourcePageUrl = sourceUrlMeta?.url ?? null;
                            const debugDetails = getDocumentDebugDetails(doc, sourcePageUrl);
                            const blobUuid = debugDetails.blobUuid;
                            const hasBlob = hasBlobStorage(doc.external_storage);
                            const missingBlobMeta = !debugDetails.blobUuid || !debugDetails.blobDocumentKey;
                            const missingContentType = !debugDetails.fileContentType;
                            const zeroSize = debugDetails.fileSizeBytes === 0;

                            return (
                                <div key={doc.id} className="p-3 text-sm space-y-2">
                                    <div className="flex items-center gap-2">
                                        <span className="font-mono text-xs text-muted-foreground w-20">{doc.id}</span>
                                        <span className="flex-1 truncate">{doc.filename || doc.url}</span>
                                        <span className={cn(
                                            'text-xs font-medium px-2 py-1 rounded-full',
                                            hasBlob
                                                ? 'bg-green-500/15 text-green-400'
                                                : 'bg-amber-500/15 text-amber-400',
                                        )}>
                                            {hasBlob ? 'Blob OK' : 'Blob missing'}
                                        </span>
                                        <button
                                            type="button"
                                            onClick={() => handleStartOcrForDocument(doc)}
                                            disabled={!downloadStageCompleted || submittingOcr}
                                            className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-border bg-muted/50 disabled:opacity-50 disabled:cursor-not-allowed"
                                            title="Spustit OCR pro tento dokument"
                                        >
                                            <Play className="h-3 w-3 text-muted-foreground" />
                                        </button>
                                    </div>

                                    <div className="flex flex-wrap items-center gap-2 text-xs">
                                        <span className="text-muted-foreground">Source page:</span>
                                        {debugDetails.sourcePageUrl ? (
                                            <a
                                                href={debugDetails.sourcePageUrl}
                                                target="_blank"
                                                rel="noreferrer noopener"
                                                className="inline-flex items-center gap-1 text-blue-300 hover:underline break-all"
                                            >
                                                {debugDetails.sourcePageUrl}
                                                <ExternalLink className="h-3 w-3" />
                                            </a>
                                        ) : (
                                            <span className="text-amber-300">není dostupná</span>
                                        )}
                                    </div>

                                    {devMode && (
                                        <div className="space-y-2 rounded border border-sky-500/30 bg-sky-500/5 p-2 text-xs">
                                            <div className="flex flex-wrap items-center gap-2">
                                                <span className="font-semibold text-sky-300">Blob UUID:</span>
                                                <span className="font-mono text-sky-100 break-all">{blobUuid ?? '—'}</span>
                                                {blobUuid && (
                                                    <button
                                                        type="button"
                                                        onClick={() => handleCopyToClipboard(blobUuid, 'Blob UUID')}
                                                        className="inline-flex items-center justify-center rounded border border-sky-400/40 bg-sky-500/10 p-1 text-sky-200 hover:bg-sky-500/20"
                                                        title="Kopírovat UUID"
                                                    >
                                                        <Copy className="h-3.5 w-3.5" />
                                                    </button>
                                                )}
                                            </div>

                                            <div className="grid gap-1 text-[11px] text-sky-100 sm:grid-cols-2">
                                                <span>Size: {formatBytes(debugDetails.fileSizeBytes)}</span>
                                                <span>Content-Type: {debugDetails.fileContentType ?? '—'}</span>
                                                <span>Checksum: {debugDetails.fileChecksum ?? '—'}</span>
                                                <span>Bucket: {debugDetails.blobBucket ?? '—'}</span>
                                                <span>Extension: {debugDetails.blobExtension ?? '—'}</span>
                                                <span>Uploaded: {debugDetails.uploadTimestamp ?? '—'}</span>
                                                <span>Created: {doc.created_at || '—'}</span>
                                                <span>Last seen: {doc.last_seen_at || '—'}</span>
                                                <span className="sm:col-span-2 break-all">Blob key: {debugDetails.blobDocumentKey ?? '—'}</span>
                                                <span className="sm:col-span-2 break-all">Input key: {debugDetails.blobInputKey ?? '—'}</span>
                                                <span className="sm:col-span-2 break-all">Endpoint: {debugDetails.blobEndpoint ?? '—'}</span>
                                            </div>

                                            <div className="flex flex-wrap items-center gap-2">
                                                {missingBlobMeta && (
                                                    <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-amber-200">
                                                        <TriangleAlert className="h-3 w-3" />
                                                        Missing blob metadata
                                                    </span>
                                                )}
                                                {zeroSize && (
                                                    <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-amber-200">
                                                        <TriangleAlert className="h-3 w-3" />
                                                        File size = 0
                                                    </span>
                                                )}
                                                {missingContentType && (
                                                    <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-amber-200">
                                                        <TriangleAlert className="h-3 w-3" />
                                                        Missing content-type
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            );
                        })
                    )}
                </div>
            </CardContent>
        </Card>
    );

    const renderOcrCard = () => (
        <Card className="ring-1 ring-blue-500/40">
            <CardHeader>
                <CardTitle>4. OCR</CardTitle>
                <CardDescription>OCR pro dokumenty změněné během runu</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                    <span className="text-sm text-muted-foreground">
                        Kandidáti OCR: <span className="font-semibold text-foreground">{changedDocuments.length}</span>
                    </span>
                    <Button
                        onClick={handleStartOcr}
                        disabled={!downloadStageCompleted || changedDocuments.length === 0 || submittingOcr}
                        size="sm"
                    >
                        {submittingOcr ? (
                            <>
                                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                Enqueue...
                            </>
                        ) : (
                            <>
                                <ScanText className="h-4 w-4 mr-2" />
                                OCR all
                            </>
                        )}
                    </Button>
                </div>
                <div className="rounded-md border border-border/60 bg-background/40 p-3 text-xs text-muted-foreground flex items-center justify-between gap-3">
                    <span>
                        Dokumenty v seznamu: <span className="font-semibold text-foreground">{ocrDocumentRows.length}</span>
                    </span>
                    <span>
                        OCR kandidáti: <span className="font-semibold text-foreground">{changedDocuments.length}</span>
                    </span>
                    <span>
                        Aktivní processing: <span className="font-semibold text-foreground">{activeProcessingDocumentId ? `#${activeProcessingDocumentId}` : '—'}</span>
                    </span>
                </div>
                <div className="rounded-md border border-border/60 overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                        <thead className="border-b border-border/60">
                            <tr>
                                <th className="text-left p-2">Document ID</th>
                                <th className="text-left p-2">Dokument</th>
                                <th className="text-left p-2">Candidate</th>
                                <th className="text-left p-2">Task status</th>
                                <th className="text-left p-2">Attempts</th>
                                <th className="text-left p-2">Retries</th>
                                <th className="text-left p-2">Error</th>
                                <th className="text-left p-2">UUID</th>
                            </tr>
                        </thead>
                        <tbody>
                            {ocrDocumentRows.length === 0 ? (
                                <tr>
                                    <td colSpan={8} className="p-3 text-muted-foreground">
                                        Po download kroku zatím nejsou dostupné žádné soubory.
                                    </td>
                                </tr>
                            ) : (
                                ocrDocumentRows.map((row) => {
                                    const latestJob = row.latestJob;
                                    const statusLabel = latestJob ? getStatusLabel(latestJob.status) : 'idle';
                                    const statusDot = latestJob ? getStatusDot(latestJob.status) : 'bg-zinc-500';
                                    const retries = row.jobCount > 0 ? row.jobCount - 1 : 0;
                                    const isActiveProcessing = activeProcessingDocumentId === row.documentId && latestJob?.status === 'processing';
                                    const displayName = row.document?.filename || row.document?.url || `Dokument #${row.documentId}`;

                                    return (
                                        <tr key={row.documentId} className={cn('border-b border-border/40', isActiveProcessing && 'bg-blue-500/10')}>
                                            <td className="p-2 font-mono text-xs align-top">{row.documentId}</td>
                                            <td className="p-2 align-top max-w-[30rem]">
                                                {row.document?.url ? (
                                                    <a
                                                        href={row.document.url}
                                                        target="_blank"
                                                        rel="noreferrer noopener"
                                                        className="inline-flex max-w-full items-center gap-1 text-blue-300 hover:underline"
                                                        title={row.document.url}
                                                    >
                                                        <span className="truncate">{displayName}</span>
                                                        <ExternalLink className="h-3 w-3 shrink-0" />
                                                    </a>
                                                ) : (
                                                    <div className="truncate">{displayName}</div>
                                                )}
                                                {!row.document && (
                                                    <div className="text-xs text-muted-foreground">
                                                        Dostupné pouze přes OCR task
                                                    </div>
                                                )}
                                            </td>
                                            <td className="p-2 align-top">
                                                <span className={cn(
                                                    'text-xs font-medium px-2 py-1 rounded-full whitespace-nowrap',
                                                    row.isCandidate ? 'bg-blue-500/15 text-blue-300' : 'bg-zinc-500/20 text-zinc-300',
                                                )}>
                                                    {row.isCandidate ? 'OCR candidate' : 'beze změny'}
                                                </span>
                                            </td>
                                            <td className="p-2 align-top whitespace-nowrap">
                                                <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                                                    <span className={cn('h-2 w-2 rounded-full', statusDot)} />
                                                    {statusLabel}
                                                    {isActiveProcessing && (
                                                        <span
                                                            className="inline-flex h-1.5 w-1.5 rounded-full bg-blue-300 shrink-0"
                                                            title="Aktivně zpracovávaný dokument"
                                                        />
                                                    )}
                                                </span>
                                            </td>
                                            <td className="p-2 align-top">{latestJob?.attempts ?? '—'}</td>
                                            <td className="p-2 align-top">{retries}</td>
                                            <td className="p-2 align-top text-red-400 break-words max-w-[20rem]">
                                                {latestJob?.error_message || '—'}
                                            </td>
                                            <td className="p-2 align-top">
                                                <Button
                                                    type="button"
                                                    variant="outline"
                                                    size="icon-sm"
                                                    disabled={!row.blobUuid}
                                                    onClick={() => {
                                                        if (!row.blobUuid) return;
                                                        handleCopyToClipboard(row.blobUuid, 'UUID dokumentu');
                                                    }}
                                                    title={row.blobUuid ? `Kopírovat UUID dokumentu #${row.documentId}` : 'UUID není dostupné'}
                                                >
                                                    <Copy className="h-4 w-4" />
                                                </Button>
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                        </table>
                    </div>
                </div>
                {renderStepProgress(
                    'Stav OCR kroku',
                    submittingOcr || loadingOcrDetails || ocrCounts.pending + ocrCounts.processing > 0,
                    ocrCounts,
                    ocrOperatorState,
                )}
                {renderErrorPanel('Chyby OCR', ocrErrors)}
                {renderRawDebugPanel('DEV raw: OCR jobs + ingestion items', {
                    ocrJobs,
                    ocrCounts,
                    ocrDocumentRows,
                    activeProcessingDocumentId,
                    activeProcessingDocumentUuid,
                    changedDocuments,
                    ingestionItems,
                    ocrOperatorState,
                })}
            </CardContent>
        </Card>
    );

    const renderSummaryCard = () => (
        <Card className="ring-1 ring-blue-500/40">
            <CardHeader>
                <CardTitle>5. Souhrn</CardTitle>
                <CardDescription>Výsledky aktuálního manuálního běhu</CardDescription>
            </CardHeader>
            <CardContent>
                {!runState.runStartedAt ? (
                    <div className="text-sm text-muted-foreground flex items-center gap-2">
                        <AlertCircle className="h-4 w-4" />
                        Spusťte nejdříve discovery na vybraném source.
                    </div>
                ) : (
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                        <div className="rounded-lg border p-3">
                            <p className="text-xs text-muted-foreground">Nové source URLs</p>
                            <p className="text-2xl font-bold">{summary.newSourceUrls}</p>
                        </div>
                        <div className="rounded-lg border p-3">
                            <p className="text-xs text-muted-foreground">Změněné dokumenty</p>
                            <p className="text-2xl font-bold">{summary.changedDocuments}</p>
                        </div>
                        <div className="rounded-lg border p-3">
                            <p className="text-xs text-muted-foreground">Blob OK</p>
                            <p className="text-2xl font-bold">{summary.blobOk}</p>
                        </div>
                        <div className="rounded-lg border p-3">
                            <p className="text-xs text-muted-foreground">OCR completed</p>
                            <p className="text-2xl font-bold text-green-400">{summary.ocrCompleted}</p>
                        </div>
                        <div className="rounded-lg border p-3">
                            <p className="text-xs text-muted-foreground">OCR failed</p>
                            <p className="text-2xl font-bold text-red-400">{summary.ocrFailed}</p>
                        </div>
                    </div>
                )}
            </CardContent>
        </Card>
    );

    const renderActiveStageCard = () => {
        if (runState.activeStage === 'sources') return renderSourcesCard();
        if (runState.activeStage === 'discovery') return renderDiscoveryCard();
        if (runState.activeStage === 'download') return renderDownloadCard();
        if (runState.activeStage === 'ocr') return renderOcrCard();
        return renderSummaryCard();
    };

    return (
        <div className="w-full max-w-6xl mx-auto space-y-6">
            <div className="flex items-center justify-between gap-3 flex-wrap">
                <div>
                    <h1 className="text-2xl font-bold">Manuální Pipeline</h1>
                    <p className="text-sm text-muted-foreground">
                        Discovery → Download/Blob → OCR → Summary
                    </p>
                </div>
                <Button onClick={refreshDerivedData} variant="outline" size="sm" disabled={refreshingData}>
                    <RefreshCw className={cn('h-4 w-4 mr-2', refreshingData && 'animate-spin')} />
                    Obnovit data
                </Button>
            </div>

            {renderRunsPanel()}

            <div className={cn(
                'rounded-md border px-3 py-2 text-xs flex flex-wrap items-center gap-2',
                isBusy ? 'border-blue-500/40 bg-blue-500/5' : 'border-border bg-background/40',
            )}>
                <span className={cn(
                    'inline-flex items-center gap-1 rounded-full border px-2 py-0.5',
                    isBusy ? 'border-blue-500/40 text-blue-200 bg-blue-500/10' : 'border-green-500/40 text-green-300 bg-green-500/10',
                )}>
                    {isBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3" />}
                    {isBusy ? 'RUNNING' : 'IDLE'}
                </span>
                <span className="text-muted-foreground">
                    Krok: <span className="text-blue-300 font-medium">{activeStageLabel}</span>
                </span>
                <span className="text-muted-foreground">
                    Run: <span className="text-blue-300 font-medium">{runState.selectedRunId ? `#${runState.selectedRunId}` : '—'}</span>
                </span>
                <span className={cn(
                    'inline-flex items-center rounded-full border px-2 py-0.5',
                    operatorConnectionState === 'connected'
                        ? 'border-green-500/40 text-green-300 bg-green-500/10'
                        : operatorConnectionState === 'error'
                            ? 'border-red-500/40 text-red-300 bg-red-500/10'
                            : 'border-blue-500/40 text-blue-200 bg-blue-500/10',
                )}>
                    Queue-Operator: {operatorConnectionState}
                </span>
                {sourceAggregateProgressPct !== null && (
                    <span className="inline-flex items-center rounded-full border border-blue-500/40 px-2 py-0.5 text-blue-200 bg-blue-500/10">
                        Progress: {sourceAggregateProgressPct}%
                    </span>
                )}
                {operatorSourceStale && (
                    <span className="inline-flex items-center rounded-full border border-amber-500/40 px-2 py-0.5 text-amber-200 bg-amber-500/10">
                        stale data
                    </span>
                )}
                <span
                    className="text-muted-foreground truncate min-w-0 flex-1"
                    title={isBusy ? activeWaitReasons[0] : 'Pipeline čeká na další akci.'}
                >
                    {isBusy ? activeWaitReasons[0] : 'Pipeline čeká na další akci.'}
                </span>
            </div>

            <Card>
                <CardContent className="pt-6">
                    <div className="flex flex-wrap items-center gap-3 sm:gap-4">
                        {STAGES.map((stage, index) => {
                            const Icon = stage.icon;
                            const isActive = runState.activeStage === stage.key;
                            const isDone = stageDone(stage.key);
                            const isPassed = getStageIndex(runState.activeStage) > index;
                            const activeEdge = isBusy && isActive;
                            const highlightedEdge = isPassed || isDone || activeEdge;
                            const isUnlocked = canNavigateToStage(stage.key);

                            return (
                                <React.Fragment key={stage.key}>
                                    <button
                                        type="button"
                                        onClick={() => handleStepNavigate(stage.key)}
                                        disabled={!isUnlocked}
                                        className={cn(
                                            'flex items-center gap-2 transition-all duration-200',
                                            'hover:scale-[1.02]',
                                            isActive && 'scale-[1.03]',
                                            !isUnlocked && 'opacity-45 cursor-not-allowed',
                                        )}
                                    >
                                        <span
                                            className={cn(
                                                'h-8 w-8 rounded-full border flex items-center justify-center transition-all duration-200',
                                                isDone
                                                    ? 'border-green-500 bg-green-500/20 text-green-300'
                                                    : isActive
                                                        ? 'border-blue-500 bg-blue-500/20 text-blue-300 shadow-[0_0_0_3px_rgba(59,130,246,0.15)]'
                                                        : 'border-zinc-600 text-zinc-400',
                                            )}
                                        >
                                            {isDone ? <CheckCircle2 className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
                                        </span>
                                        <span className={cn('text-sm', isActive ? 'text-white font-medium' : 'text-muted-foreground')}>
                                            {stage.label}
                                        </span>
                                    </button>
                                    {index < STAGES.length - 1 && (
                                        <div className={cn(
                                            'h-[2px] w-8 sm:w-16 rounded-full',
                                            highlightedEdge
                                                ? (isBusy ? 'pipeline-flow-connector' : 'bg-blue-400')
                                                : 'bg-zinc-700',
                                        )} />
                                    )}
                                </React.Fragment>
                            );
                        })}
                    </div>
                </CardContent>
            </Card>

            <div key={runState.activeStage} className="pipeline-stage-enter">
                {renderActiveStageCard()}
            </div>
        </div>
    );
}
