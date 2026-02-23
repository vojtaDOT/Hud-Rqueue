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
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { supabase } from '@/lib/supabase';
import { useSources, type Source } from '@/hooks/use-sources';
import type {
    PipelineCreatedJob,
    PipelineJobRequest,
    PipelineJobStatus,
    PipelineJobStatusValue,
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
    updated_at: string;
    external_storage: unknown;
}

interface IngestionRunItem {
    id: string;
    source_url_id: string;
    status: string;
    started_at: string;
    finished_at: string | null;
    created_at: string;
    stats_json: unknown;
}

interface IngestionItemRow {
    id: string;
    run_id: string | null;
    document_id: string;
    source_url_id: string;
    ingest_status: string;
    error_message: string | null;
    last_error_message: string | null;
    review_reason: string | null;
    needs_review: boolean;
    updated_at: string;
    created_at: string;
    filename: string | null;
    document_url: string;
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
        attempts: '0',
        error_message: '',
        started_at: '',
        completed_at: '',
        source_id: job.source_id,
        source_url_id: job.source_url_id,
        document_id: job.document_id,
    }));
}

export function ManualPipeline() {
    const { sources, loading: sourcesLoading } = useSources();
    const [runState, setRunState] = React.useState<PipelineRunState>({
        selectedSourceId: null,
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

    const selectedSource = React.useMemo(
        () => sources.find((source) => String(source.id) === runState.selectedSourceId) ?? null,
        [sources, runState.selectedSourceId],
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
                    .select('id, source_id, updated_at')
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

    const fetchDiscoveredSourceUrls = React.useCallback(async (sourceId: string, runStartedAt: string) => {
        const { data, error } = await supabase
            .from('source_urls')
            .select('id, source_id, url, label, created_at, updated_at')
            .eq('source_id', sourceId)
            .gte('updated_at', runStartedAt)
            .order('updated_at', { ascending: false });

        if (error) throw error;
        const normalized = (data ?? []).map((row) => ({
            ...row,
            id: String(row.id),
            source_id: String(row.source_id),
        }));
        setDiscoveredSourceUrls(normalized);
        return normalized;
    }, []);

    const fetchDocumentsForSourceUrlIds = React.useCallback(async (sourceUrlIds: string[]) => {
        if (sourceUrlIds.length === 0) return [] as DocumentItem[];

        const batches = chunk(sourceUrlIds, 300);
        const allRows: DocumentItem[] = [];

        for (const batch of batches) {
            const { data, error } = await supabase
                .from('documents')
                .select('id, source_url_id, url, filename, updated_at, external_storage')
                .in('source_url_id', batch)
                .is('deleted_at', null)
                .order('updated_at', { ascending: false });

            if (error) throw error;
            if (data) {
                allRows.push(...data.map((row) => ({ ...row, source_url_id: String(row.source_url_id) })));
            }
        }

        return allRows;
    }, []);

    const fetchSourceUrlIdsForSource = React.useCallback(async (sourceId: string) => {
        const pageSize = 1000;
        let from = 0;
        const ids: string[] = [];

        while (true) {
            const { data, error } = await supabase
                .from('source_urls')
                .select('id')
                .eq('source_id', sourceId)
                .range(from, from + pageSize - 1);

            if (error) throw error;
            if (!data || data.length === 0) break;

            ids.push(...data.map((row) => String(row.id)));
            if (data.length < pageSize) break;
            from += pageSize;
        }

        return ids;
    }, []);

    const fetchChangedDocuments = React.useCallback(async (sourceId: string, runStartedAt: string) => {
        const sourceUrlIds = await fetchSourceUrlIdsForSource(sourceId);
        if (sourceUrlIds.length === 0) {
            setChangedDocuments([]);
            return;
        }

        const batches = chunk(sourceUrlIds, 300);
        const allRows: DocumentItem[] = [];

        for (const batch of batches) {
            const { data, error } = await supabase
                .from('documents')
                .select('id, source_url_id, url, filename, updated_at, external_storage')
                .in('source_url_id', batch)
                .is('deleted_at', null)
                .gte('updated_at', runStartedAt)
                .order('updated_at', { ascending: false });

            if (error) throw error;
            if (data) {
                allRows.push(...data.map((row) => ({ ...row, source_url_id: String(row.source_url_id) })));
            }
        }

        setChangedDocuments(allRows);
    }, [fetchSourceUrlIdsForSource]);

    const fetchIngestionDiagnostics = React.useCallback(async (sourceId: string, runStartedAt: string) => {
        setIngestionLoading(true);
        try {
            const sourceUrlIds = await fetchSourceUrlIdsForSource(sourceId);
            if (sourceUrlIds.length === 0) {
                setIngestionRuns([]);
                setIngestionItems([]);
                return;
            }

            const batches = chunk(sourceUrlIds, 300);
            const allRuns: IngestionRunItem[] = [];
            const allItems: IngestionItemRow[] = [];

            for (const batch of batches) {
                const { data: runs, error: runError } = await supabase
                    .from('ingestion_runs')
                    .select('id, source_url_id, status, started_at, finished_at, created_at, stats_json')
                    .in('source_url_id', batch)
                    .gte('created_at', runStartedAt)
                    .order('created_at', { ascending: false });

                if (runError) throw runError;
                if (runs) {
                    allRuns.push(...runs.map((row) => ({
                        ...row,
                        id: String(row.id),
                        source_url_id: String(row.source_url_id),
                    })));
                }

                const { data: items, error: itemError } = await supabase
                    .from('ingestion_items')
                    .select(
                        'id, run_id, document_id, source_url_id, ingest_status, error_message, last_error_message, review_reason, needs_review, updated_at, created_at, filename, document_url',
                    )
                    .in('source_url_id', batch)
                    .gte('updated_at', runStartedAt)
                    .order('updated_at', { ascending: false });

                if (itemError) throw itemError;
                if (items) {
                    allItems.push(...items.map((row) => ({
                        ...row,
                        id: String(row.id),
                        run_id: row.run_id ? String(row.run_id) : null,
                        document_id: String(row.document_id),
                        source_url_id: String(row.source_url_id),
                    })));
                }
            }

            setIngestionRuns(allRuns);
            setIngestionItems(allItems);
        } catch (error) {
            console.error('Failed to fetch ingestion diagnostics:', error);
            toast.error('Nepodařilo se načíst ingestion diagnostiku');
        } finally {
            setIngestionLoading(false);
        }
    }, [fetchSourceUrlIdsForSource]);

    const refreshDerivedData = React.useCallback(async () => {
        if (!runState.selectedSourceId || !runState.runStartedAt) return;

        setRefreshingData(true);
        try {
            const discovered = await fetchDiscoveredSourceUrls(runState.selectedSourceId, runState.runStartedAt);
            const discoveredIds = discovered.map((item) => String(item.id));
            const docs = await fetchDocumentsForSourceUrlIds(discoveredIds);
            setDownloadDocuments(docs);
            await fetchChangedDocuments(runState.selectedSourceId, runState.runStartedAt);
            await fetchIngestionDiagnostics(runState.selectedSourceId, runState.runStartedAt);
            await fetchAllSourceUrlMeta();
        } catch (error) {
            console.error('Refresh pipeline data failed:', error);
            toast.error('Nepodařilo se obnovit data pipeline');
        } finally {
            setRefreshingData(false);
        }
    }, [
        fetchAllSourceUrlMeta,
        fetchChangedDocuments,
        fetchDiscoveredSourceUrls,
        fetchDocumentsForSourceUrlIds,
        fetchIngestionDiagnostics,
        runState.runStartedAt,
        runState.selectedSourceId,
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

    const resetRunStateForSource = React.useCallback((sourceId: string, runStartedAt: string) => {
        setRunState({
            selectedSourceId: sourceId,
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
    }, []);

    const handleStartDiscovery = React.useCallback(async (source: Source) => {
        const sourceId = String(source.id);
        const runStartedAt = new Date().toISOString();

        resetRunStateForSource(sourceId, runStartedAt);
        setSubmittingDiscovery(true);

        try {
            const jobs = await enqueueJobs([
                { task: 'discover', source_id: sourceId, max_attempts: 3 },
            ]);
            setDiscoverJobs(toPendingStatuses(jobs));
            toast.success(`Discovery zařazeno do fronty pro source #${sourceId}`);
        } catch (error) {
            console.error('Discovery enqueue failed:', error);
            toast.error(error instanceof Error ? error.message : 'Nepodařilo se spustit discovery');
        } finally {
            setSubmittingDiscovery(false);
        }
    }, [enqueueJobs, resetRunStateForSource]);

    const handleStartDownload = React.useCallback(async () => {
        if (!runState.selectedSourceId || discoveredSourceUrls.length === 0) return;
        setSubmittingDownload(true);
        setRunState((prev) => ({ ...prev, activeStage: 'download' }));

        try {
            const jobs = await enqueueJobs(
                discoveredSourceUrls.map((sourceUrl) => ({
                    task: 'download',
                    source_id: runState.selectedSourceId!,
                    source_url_id: String(sourceUrl.id),
                    max_attempts: 3,
                })),
            );
            setDownloadJobs(toPendingStatuses(jobs));
            setDownloadSettled(false);
            toast.success(`Download jobs vytvořeny: ${jobs.length}`);
        } catch (error) {
            console.error('Download enqueue failed:', error);
            toast.error(error instanceof Error ? error.message : 'Nepodařilo se spustit download');
        } finally {
            setSubmittingDownload(false);
        }
    }, [discoveredSourceUrls, enqueueJobs, runState.selectedSourceId]);

    const handleStartOcr = React.useCallback(async () => {
        if (!runState.selectedSourceId || changedDocuments.length === 0) return;
        setSubmittingOcr(true);
        setRunState((prev) => ({ ...prev, activeStage: 'ocr' }));

        try {
            const jobs = await enqueueJobs(
                changedDocuments.map((document) => ({
                    task: 'ocr',
                    source_id: runState.selectedSourceId!,
                    source_url_id: String(document.source_url_id),
                    document_id: String(document.id),
                    max_attempts: 3,
                    ...OCR_JOB_DEFAULTS,
                })),
            );
            setOcrJobs(toPendingStatuses(jobs));
            setOcrSettled(false);
            toast.success(`OCR jobs vytvořeny: ${jobs.length}`);
        } catch (error) {
            console.error('OCR enqueue failed:', error);
            toast.error(error instanceof Error ? error.message : 'Nepodařilo se spustit OCR');
        } finally {
            setSubmittingOcr(false);
        }
    }, [changedDocuments, enqueueJobs, runState.selectedSourceId]);

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
            toast.error('Discovery job selhal. Zkontrolujte error_message.');
        }
    }, [discoverJobs, discoverySettled]);

    React.useEffect(() => {
        if (!discoverCompleted || discoverySettled || !runState.selectedSourceId || !runState.runStartedAt) return;

        setDiscoverySettled(true);
        setRunState((prev) => ({ ...prev, activeStage: 'download' }));
        setLoadingDiscoveryDetails(true);

        (async () => {
            try {
                await fetchDiscoveredSourceUrls(runState.selectedSourceId!, runState.runStartedAt!);
                await fetchIngestionDiagnostics(runState.selectedSourceId!, runState.runStartedAt!);
                await fetchAllSourceUrlMeta();
                toast.success('Discovery dokončeno');
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
        fetchDiscoveredSourceUrls,
        fetchIngestionDiagnostics,
        runState.runStartedAt,
        runState.selectedSourceId,
    ]);

    React.useEffect(() => {
        const hasFailure = downloadJobs.some((job) => job.status === 'failed');
        if (hasFailure && !downloadSettled) {
            setDownloadSettled(true);
            toast.error('Některé download joby selhaly');
        }
    }, [downloadJobs, downloadSettled]);

    React.useEffect(() => {
        if (!downloadCompleted || downloadSettled || !runState.selectedSourceId || !runState.runStartedAt) return;

        setDownloadSettled(true);
        setRunState((prev) => ({ ...prev, activeStage: 'ocr' }));
        setLoadingDownloadDetails(true);

        (async () => {
            try {
                const discoveredIds = discoveredSourceUrls.map((item) => String(item.id));
                const docs = await fetchDocumentsForSourceUrlIds(discoveredIds);
                setDownloadDocuments(docs);
                await fetchChangedDocuments(runState.selectedSourceId!, runState.runStartedAt!);
                await fetchIngestionDiagnostics(runState.selectedSourceId!, runState.runStartedAt!);
                toast.success('Download fáze dokončena');
            } catch (error) {
                console.error('Failed to load download results:', error);
                toast.error('Nepodařilo se načíst dokumenty po downloadu');
            } finally {
                setLoadingDownloadDetails(false);
            }
        })();
    }, [
        discoveredSourceUrls,
        downloadCompleted,
        downloadSettled,
        fetchChangedDocuments,
        fetchDocumentsForSourceUrlIds,
        fetchIngestionDiagnostics,
        runState.runStartedAt,
        runState.selectedSourceId,
    ]);

    React.useEffect(() => {
        const hasFailure = ocrJobs.some((job) => job.status === 'failed');
        if (hasFailure && !ocrSettled) {
            setOcrSettled(true);
            setRunState((prev) => ({ ...prev, activeStage: 'summary' }));
            toast.error('Některé OCR joby selhaly');
        }
    }, [ocrJobs, ocrSettled]);

    React.useEffect(() => {
        if (!ocrCompleted || ocrSettled) return;
        setOcrSettled(true);
        setRunState((prev) => ({ ...prev, activeStage: 'summary' }));
        toast.success('OCR fáze dokončena');
    }, [ocrCompleted, ocrSettled]);

    React.useEffect(() => {
        if (!ocrSettled || !runState.selectedSourceId || !runState.runStartedAt) return;
        (async () => {
            setLoadingOcrDetails(true);
            try {
                await fetchIngestionDiagnostics(runState.selectedSourceId!, runState.runStartedAt!);
            } finally {
                setLoadingOcrDetails(false);
            }
        })();
    }, [fetchIngestionDiagnostics, ocrSettled, runState.runStartedAt, runState.selectedSourceId]);

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
        if (stage === 'sources') return Boolean(runState.selectedSourceId);
        if (stage === 'discovery') return discoverCompleted;
        if (stage === 'download') return downloadCompleted;
        if (stage === 'ocr') return ocrCompleted;
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
    const changedDocumentIds = React.useMemo(
        () => new Set(changedDocuments.map((doc) => String(doc.id))),
        [changedDocuments],
    );

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
            .filter((run) => discoveredSourceUrlIds.has(run.source_url_id) && isIngestionRunIssue(run))
            .map((run) => ({
                id: `run-${run.id}`,
                source: `Ingestion run #${run.id}`,
                message: `status=${run.status}`,
            }));

        const itemErrors = ingestionItems
            .filter((item) => discoveredSourceUrlIds.has(item.source_url_id))
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
    }, [discoveredSourceUrlIds, downloadJobs, ingestionItems, ingestionRuns]);

    const ocrErrors = React.useMemo(() => {
        const redisErrors = ocrJobs
            .filter((job) => hasText(job.error_message))
            .map((job) => ({
                id: `redis-ocr-${job.id}`,
                source: `Redis job #${job.id}`,
                message: job.error_message,
            }));

        const itemErrors = ingestionItems
            .filter((item) => changedDocumentIds.has(item.document_id))
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
    ) => (
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
            {errors.length === 0 ? (
                <p className="text-xs text-red-200/80">Žádné chyby v tomto kroku.</p>
            ) : (
                <div className="space-y-1.5">
                    {errors.slice(0, 12).map((error) => (
                        <div key={error.id} className="text-xs text-red-100">
                            <span className="font-semibold">{error.source}:</span>{' '}
                            <span className="break-all">{error.message}</span>
                        </div>
                    ))}
                    {errors.length > 12 && (
                        <p className="text-xs text-red-200/80">
                            + dalších {errors.length - 12} chyb
                        </p>
                    )}
                </div>
            )}
        </div>
    );

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

                <div className="space-y-2">
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                        <h3 className="text-sm font-semibold">Discovered source URLs (aktuální run)</h3>
                        <Button
                            onClick={handleStartDownload}
                            disabled={!discoverCompleted || discoveredSourceUrls.length === 0 || submittingDownload}
                            size="sm"
                        >
                            {submittingDownload ? (
                                <>
                                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                    Enqueue...
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
                                    <span className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-border bg-muted/50">
                                        <Play className="h-3 w-3 text-muted-foreground" />
                                    </span>
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
                {renderJobsTable(downloadJobs, 'Download jobs zatím nebyly vytvořeny')}
                {renderStepProgress(
                    'Stav download kroku',
                    submittingDownload || loadingDownloadDetails || downloadCounts.pending + downloadCounts.processing > 0,
                    downloadCounts,
                    downloadOperatorState,
                )}
                {renderErrorPanel('Chyby download', downloadErrors)}
                <div className="border rounded-md divide-y">
                    {downloadDocuments.length === 0 ? (
                        <p className="p-3 text-sm text-muted-foreground">Zatím nejsou žádné dokumenty.</p>
                    ) : (
                        downloadDocuments.map((doc) => (
                            <div key={doc.id} className="p-3 text-sm flex items-center gap-2">
                                <span className="font-mono text-xs text-muted-foreground w-20">{doc.id}</span>
                                <span className="flex-1 truncate">{doc.filename || doc.url}</span>
                                <span className={cn(
                                    'text-xs font-medium px-2 py-1 rounded-full',
                                    hasBlobStorage(doc.external_storage)
                                        ? 'bg-green-500/15 text-green-400'
                                        : 'bg-amber-500/15 text-amber-400',
                                )}>
                                    {hasBlobStorage(doc.external_storage) ? 'Blob OK' : 'Blob missing'}
                                </span>
                            </div>
                        ))
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
                        disabled={!downloadCompleted || changedDocuments.length === 0 || submittingOcr}
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
                        Stažené dokumenty (download): <span className="font-semibold text-foreground">{downloadDocuments.length}</span>
                    </span>
                    <span>
                        OCR kandidáti: <span className="font-semibold text-foreground">{changedDocuments.length}</span>
                    </span>
                </div>
                <div className="border rounded-md divide-y">
                    {downloadDocuments.length === 0 ? (
                        <p className="p-3 text-sm text-muted-foreground">Po download kroku zatím nejsou dostupné žádné soubory.</p>
                    ) : (
                        downloadDocuments.map((doc) => {
                            const isCandidate = changedDocumentIds.has(String(doc.id));
                            return (
                                <div key={doc.id} className="p-3 text-sm flex items-center gap-2">
                                    <span className="font-mono text-xs text-muted-foreground w-20">{doc.id}</span>
                                    <span className="flex-1 truncate">{doc.filename || doc.url}</span>
                                    <span className={cn(
                                        'text-xs font-medium px-2 py-1 rounded-full',
                                        isCandidate ? 'bg-blue-500/15 text-blue-300' : 'bg-zinc-500/20 text-zinc-300',
                                    )}>
                                        {isCandidate ? 'OCR candidate' : 'beze změny'}
                                    </span>
                                </div>
                            );
                        })
                    )}
                </div>
                {renderJobsTable(ocrJobs, 'OCR jobs zatím nebyly vytvořeny')}
                {renderStepProgress(
                    'Stav OCR kroku',
                    submittingOcr || loadingOcrDetails || ocrCounts.pending + ocrCounts.processing > 0,
                    ocrCounts,
                    ocrOperatorState,
                )}
                {renderErrorPanel('Chyby OCR', ocrErrors)}
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

            <Card className={cn('overflow-hidden', isBusy ? 'border-blue-500/40' : 'border-border')}>
                <div className={cn('h-1 w-full', isBusy ? 'pipeline-status-shimmer bg-gradient-to-r from-blue-500 via-cyan-400 to-blue-500' : 'bg-muted')} />
                <CardContent className="pt-4">
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                        <div className="space-y-1">
                            <p className="text-sm font-semibold">
                                Aktivní krok: <span className="text-blue-300">{activeStageLabel}</span>
                            </p>
                            {isBusy ? (
                                <p className="text-xs text-muted-foreground">
                                    {activeWaitReasons[0]}
                                </p>
                            ) : (
                                <p className="text-xs text-muted-foreground">Pipeline čeká na další akci.</p>
                            )}
                        </div>
                        <div className="inline-flex items-center gap-2 text-xs">
                            {isBusy ? (
                                <>
                                    <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-300" />
                                    <span className="text-blue-200">Právě zpracovávám</span>
                                </>
                            ) : (
                                <>
                                    <CheckCircle2 className="h-3.5 w-3.5 text-green-400" />
                                    <span className="text-green-300">Idle</span>
                                </>
                            )}
                        </div>
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px]">
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
                                source progress: {sourceAggregateProgressPct}%
                            </span>
                        )}
                        {operatorSourceStale && (
                            <span className="inline-flex items-center rounded-full border border-amber-500/40 px-2 py-0.5 text-amber-200 bg-amber-500/10">
                                stale data
                            </span>
                        )}
                    </div>
                    {activeWaitReasons.length > 1 && (
                        <div className="mt-3 grid gap-1">
                            {activeWaitReasons.slice(1, 4).map((reason) => (
                                <div key={reason} className="text-[11px] text-muted-foreground">
                                    - {reason}
                                </div>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>

            <Card>
                <CardContent className="pt-6">
                    <div className="flex flex-wrap items-center gap-3 sm:gap-4">
                        {STAGES.map((stage, index) => {
                            const Icon = stage.icon;
                            const isActive = runState.activeStage === stage.key;
                            const isDone = stageDone(stage.key);
                            const isPassed = getStageIndex(runState.activeStage) > index;
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
                                        <div className={cn('h-[1px] w-8 sm:w-16', isPassed || isDone ? 'bg-blue-400' : 'bg-zinc-700')} />
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
