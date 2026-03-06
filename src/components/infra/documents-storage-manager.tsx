'use client';

import * as React from 'react';
import { toast } from 'sonner';
import {
    AlertCircle,
    CheckCircle2,
    FolderSearch,
    Loader2,
    RefreshCw,
    ShieldAlert,
    Trash2,
    Wrench,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';

type DuplicateKind = 'sources' | 'source_urls' | 'documents_url' | 'documents_checksum';
type CleanupMode = 'blob_only' | 'blob_and_delete_document';

interface StorageOverviewResponse {
    success: boolean;
    health: {
        totalDocuments: number;
        documentsWithValidUuid: number;
        documentsMissingUuid: number;
        documentsMissingBlobMetadata: number;
        duplicateDocumentUrlGroups: number;
        duplicateDocumentChecksumGroups: number;
    };
    duplicateSummary: {
        sourceGroups: number;
        sourceUrlGroups: number;
        documentUrlGroups: number;
        documentChecksumGroups: number;
    };
}

interface DuplicateGroupItem {
    id?: string;
    source_id?: string;
    source_url_id?: string;
    name?: string;
    base_url?: string;
    url?: string;
    label?: string;
    filename?: string;
    checksum?: string;
    blob_uuid?: string | null;
    created_at?: string | null;
    last_seen_at?: string | null;
}

interface DuplicateGroup {
    key: string;
    source_id?: string;
    source_url_id?: string;
    normalized_url?: string;
    checksum?: string;
    count: number;
    items: DuplicateGroupItem[];
}

interface DuplicateResponse {
    success: boolean;
    kind: DuplicateKind;
    page: number;
    pageSize: number;
    total: number;
    groups: DuplicateGroup[];
}

interface OrphanedFolder {
    uuid: string;
    prefix: string;
    objectCount: number;
    sampleKeys: string[];
}

interface OrphanScanResponse {
    success: boolean;
    r2PrefixCount: number;
    dbUuidCount: number;
    orphanCount: number;
    orphans: OrphanedFolder[];
}

interface CleanupPreviewTarget {
    uuid: string;
    prefix: string;
    documentIds: string[];
    objectCount: number;
    sampleKeys: string[];
    dbImpact: {
        action: 'clear_blob_pointers' | 'hard_delete_documents';
        documentRowsAffected: number;
    };
}

interface CleanupPreviewResponse {
    success: boolean;
    preview_token: string;
    mode: CleanupMode;
    created_at: string;
    expires_at: string;
    targets: CleanupPreviewTarget[];
}

interface CleanupExecuteResponse {
    success: boolean;
    operation_id: string;
    mode: CleanupMode;
    results: Array<{
        uuid: string;
        prefix: string;
        document_ids: string[];
        r2_deleted_count: number;
        db_updated_count: number;
        db_deleted_count: number;
        error: string | null;
    }>;
}

interface ResolveDuplicatesResponse {
    success: boolean;
    dry_run: boolean;
    canonical_document_id: string;
    mode: CleanupMode;
    plan: Array<{
        document_id: string;
        uuid: string | null;
        prefix: string | null;
        can_execute: boolean;
        reason: string | null;
    }>;
    results?: Array<{
        document_id: string;
        uuid: string | null;
        r2_deleted_count: number;
        db_updated: boolean;
        db_deleted: boolean;
        error: string | null;
    }>;
}

const DUPLICATE_TABS: Array<{ key: DuplicateKind; label: string }> = [
    { key: 'sources', label: 'sources' },
    { key: 'source_urls', label: 'source_urls' },
    { key: 'documents_url', label: 'documents by URL' },
    { key: 'documents_checksum', label: 'documents by checksum' },
];

function parseCsvList(value: string): string[] {
    return value
        .split(/[\n,;\s]+/)
        .map((item) => item.trim())
        .filter(Boolean);
}

function formatDate(value: string | null | undefined): string {
    if (!value) return '—';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return '—';
    return parsed.toLocaleString();
}

function getResolveSignature(canonicalId: string, duplicateIds: string[], mode: CleanupMode): string {
    const sorted = [...duplicateIds].sort((a, b) => a.localeCompare(b));
    return `${canonicalId}|${mode}|${sorted.join(',')}`;
}

export function DocumentsStorageManager({ embedded = false }: { embedded?: boolean }) {
    const [overview, setOverview] = React.useState<StorageOverviewResponse | null>(null);
    const [loadingOverview, setLoadingOverview] = React.useState(true);

    const [duplicateKind, setDuplicateKind] = React.useState<DuplicateKind>('sources');
    const [duplicatePage, setDuplicatePage] = React.useState(0);
    const [duplicateData, setDuplicateData] = React.useState<DuplicateResponse | null>(null);
    const [loadingDuplicates, setLoadingDuplicates] = React.useState(false);

    const [selectedDocumentIds, setSelectedDocumentIds] = React.useState<Set<string>>(new Set());
    const [canonicalDocumentId, setCanonicalDocumentId] = React.useState<string | null>(null);

    const [cleanupMode, setCleanupMode] = React.useState<CleanupMode>('blob_only');
    const [cleanupDocIdsText, setCleanupDocIdsText] = React.useState('');
    const [cleanupUuidsText, setCleanupUuidsText] = React.useState('');
    const [includeSelectedRows, setIncludeSelectedRows] = React.useState(true);

    const [preview, setPreview] = React.useState<CleanupPreviewResponse | null>(null);
    const [previewLoading, setPreviewLoading] = React.useState(false);

    const [executeOpen, setExecuteOpen] = React.useState(false);
    const [executeConfirmText, setExecuteConfirmText] = React.useState('');
    const [executing, setExecuting] = React.useState(false);
    const [executeResult, setExecuteResult] = React.useState<CleanupExecuteResponse | null>(null);

    const [resolveLoading, setResolveLoading] = React.useState(false);
    const [resolveDryRun, setResolveDryRun] = React.useState<ResolveDuplicatesResponse | null>(null);
    const [resolveDryRunSignature, setResolveDryRunSignature] = React.useState<string | null>(null);
    const [resolveApplyResult, setResolveApplyResult] = React.useState<ResolveDuplicatesResponse | null>(null);

    const [orphanScan, setOrphanScan] = React.useState<OrphanScanResponse | null>(null);
    const [orphanLoading, setOrphanLoading] = React.useState(false);
    const [orphanVisibleCount, setOrphanVisibleCount] = React.useState(20);
    const [orphanDeleting, setOrphanDeleting] = React.useState(false);

    const refreshOverview = React.useCallback(async () => {
        setLoadingOverview(true);
        try {
            const response = await fetch('/api/storage/overview', { cache: 'no-store' });
            const json = await response.json();
            if (!response.ok) throw new Error(json.error || 'Failed to load overview');
            setOverview(json);
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Failed to load storage overview');
        } finally {
            setLoadingOverview(false);
        }
    }, []);

    const refreshDuplicates = React.useCallback(async (kind: DuplicateKind, page: number) => {
        setLoadingDuplicates(true);
        try {
            const response = await fetch(`/api/storage/duplicates?kind=${kind}&page=${page}&pageSize=10`, { cache: 'no-store' });
            const json = await response.json();
            if (!response.ok) throw new Error(json.error || 'Failed to load duplicate data');
            setDuplicateData(json);
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Failed to load duplicate data');
        } finally {
            setLoadingDuplicates(false);
        }
    }, []);

    React.useEffect(() => {
        void refreshOverview();
    }, [refreshOverview]);

    React.useEffect(() => {
        void refreshDuplicates(duplicateKind, duplicatePage);
    }, [duplicateKind, duplicatePage, refreshDuplicates]);

    const onChangeDuplicateTab = (next: string) => {
        const kind = next as DuplicateKind;
        setDuplicateKind(kind);
        setDuplicatePage(0);
    };

    const isDocumentsTab = duplicateKind === 'documents_url' || duplicateKind === 'documents_checksum';

    const toggleDocumentSelection = (documentId: string, selected: boolean) => {
        setSelectedDocumentIds((prev) => {
            const next = new Set(prev);
            if (selected) next.add(documentId);
            else next.delete(documentId);
            return next;
        });

        if (!selected && canonicalDocumentId === documentId) {
            setCanonicalDocumentId(null);
        }
    };

    const refreshAll = async () => {
        await Promise.all([
            refreshOverview(),
            refreshDuplicates(duplicateKind, duplicatePage),
        ]);
    };

    const handleDeleteOrphans = async () => {
        if (!orphanScan || orphanScan.orphans.length === 0) return;
        setOrphanDeleting(true);
        try {
            const res = await fetch('/api/storage/cleanup/orphans', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ prefixes: orphanScan.orphans.map((o) => o.prefix) }),
            });
            const json = await res.json();
            if (!res.ok) throw new Error(json.error || 'Delete failed');
            if (json.failed === 0) {
                toast.success(`Deleted ${json.deleted} orphaned folder(s)`);
                setOrphanScan(null);
            } else {
                toast.warning(`Deleted ${json.deleted}, failed ${json.failed}`);
            }
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Orphan delete failed');
        } finally {
            setOrphanDeleting(false);
        }
    };

    const handleOrphanScan = async () => {
        setOrphanLoading(true);
        setOrphanVisibleCount(20);
        try {
            const response = await fetch('/api/storage/cleanup/orphans', { cache: 'no-store' });
            const json = await response.json();
            if (!response.ok) throw new Error(json.error || 'Failed to scan for orphaned folders');
            setOrphanScan(json);
            if (json.orphanCount === 0) {
                toast.success('No orphaned folders found');
            } else {
                toast.success(`Found ${json.orphanCount} orphaned folder${json.orphanCount > 1 ? 's' : ''}`);
            }
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Orphan scan failed');
        } finally {
            setOrphanLoading(false);
        }
    };

    const handleFeedOrphansToCleanup = () => {
        if (!orphanScan || orphanScan.orphans.length === 0) return;
        const uuids = orphanScan.orphans.map((o) => o.uuid).join('\n');
        setCleanupUuidsText((prev) => {
            const existing = prev.trim();
            return existing ? `${existing}\n${uuids}` : uuids;
        });
        setCleanupMode('blob_only');
        toast.success(`${orphanScan.orphans.length} orphan UUID(s) added to cleanup input`);
    };

    const handleCreatePreview = async () => {
        const documentIds = parseCsvList(cleanupDocIdsText);
        const uuids = parseCsvList(cleanupUuidsText);

        if (includeSelectedRows) {
            for (const id of selectedDocumentIds) {
                documentIds.push(id);
            }
        }

        const uniqDocumentIds = Array.from(new Set(documentIds));
        const uniqUuids = Array.from(new Set(uuids));

        if (uniqDocumentIds.length === 0 && uniqUuids.length === 0) {
            toast.error('Enter at least one document ID, UUID, or select rows from duplicate groups.');
            return;
        }

        setPreviewLoading(true);
        setPreview(null);
        setExecuteResult(null);

        try {
            const response = await fetch('/api/storage/cleanup/preview', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    mode: cleanupMode,
                    targets: {
                        document_ids: uniqDocumentIds,
                        uuids: uniqUuids,
                    },
                }),
            });
            const json = await response.json();
            if (!response.ok) throw new Error(json.error || 'Failed to build cleanup preview');
            setPreview(json);
            toast.success(`Preview ready (${json.targets.length} UUID target${json.targets.length > 1 ? 's' : ''})`);
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Failed to build cleanup preview');
        } finally {
            setPreviewLoading(false);
        }
    };

    const handleExecute = async () => {
        if (!preview) return;

        setExecuting(true);
        try {
            const response = await fetch('/api/storage/cleanup/execute', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    preview_token: preview.preview_token,
                    mode: cleanupMode,
                    confirmation: cleanupMode === 'blob_and_delete_document' ? executeConfirmText : undefined,
                }),
            });
            const json = await response.json();
            if (!response.ok) throw new Error(json.error || 'Cleanup execution failed');

            setExecuteResult(json);
            setPreview(null);
            setExecuteOpen(false);
            setExecuteConfirmText('');

            const failures = (json.results as CleanupExecuteResponse['results']).filter((item) => item.error);
            if (failures.length > 0) {
                toast.error(`Cleanup finished with ${failures.length} target failure(s)`);
            } else {
                toast.success('Cleanup completed successfully');
            }
            await refreshAll();
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Cleanup execution failed');
        } finally {
            setExecuting(false);
        }
    };

    const handleResolveDryRun = async () => {
        if (!canonicalDocumentId) {
            toast.error('Select a canonical document ID first.');
            return;
        }

        const duplicates = Array.from(selectedDocumentIds).filter((id) => id !== canonicalDocumentId);
        if (duplicates.length === 0) {
            toast.error('Select at least one duplicate document row.');
            return;
        }

        setResolveLoading(true);
        setResolveDryRun(null);
        setResolveApplyResult(null);

        try {
            const response = await fetch('/api/storage/documents/resolve-duplicates', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    canonical_document_id: canonicalDocumentId,
                    duplicate_document_ids: duplicates,
                    mode: cleanupMode,
                    dry_run: true,
                }),
            });

            const json = await response.json();
            if (!response.ok) throw new Error(json.error || 'Dry-run failed');

            setResolveDryRun(json);
            setResolveDryRunSignature(getResolveSignature(canonicalDocumentId, duplicates, cleanupMode));
            toast.success('Duplicate resolution dry-run ready');
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Dry-run failed');
        } finally {
            setResolveLoading(false);
        }
    };

    const handleResolveApply = async () => {
        if (!canonicalDocumentId) {
            toast.error('Select a canonical document ID first.');
            return;
        }

        const duplicates = Array.from(selectedDocumentIds).filter((id) => id !== canonicalDocumentId);
        if (duplicates.length === 0) {
            toast.error('Select at least one duplicate document row.');
            return;
        }

        const currentSignature = getResolveSignature(canonicalDocumentId, duplicates, cleanupMode);
        if (!resolveDryRunSignature || resolveDryRunSignature !== currentSignature) {
            toast.error('Run dry-run first for the exact same canonical + duplicate selection.');
            return;
        }

        let confirmation = '';
        if (cleanupMode === 'blob_and_delete_document') {
            confirmation = window.prompt('Type DELETE DOCUMENTS to confirm hard delete duplicate resolution') || '';
            if (confirmation !== 'DELETE DOCUMENTS') {
                toast.error('Hard delete confirmation mismatch.');
                return;
            }
        }

        setResolveLoading(true);
        try {
            const response = await fetch('/api/storage/documents/resolve-duplicates', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    canonical_document_id: canonicalDocumentId,
                    duplicate_document_ids: duplicates,
                    mode: cleanupMode,
                    dry_run: false,
                    confirmation,
                }),
            });

            const json = await response.json();
            if (!response.ok) throw new Error(json.error || 'Apply duplicate resolution failed');

            setResolveApplyResult(json);
            toast.success('Duplicate resolution executed');

            setSelectedDocumentIds(new Set([canonicalDocumentId]));
            await refreshAll();
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Apply duplicate resolution failed');
        } finally {
            setResolveLoading(false);
        }
    };

    return (
        <div className={embedded ? 'w-full space-y-6' : 'w-full max-w-7xl mx-auto space-y-6 p-6 pt-5'}>
            <div className="flex items-center justify-between gap-3 flex-wrap">
                <div>
                    <h1 className="text-2xl font-semibold tracking-tight">Cleanup Process</h1>
                    <p className="text-sm text-muted-foreground mt-1">
                        Document-centric cleanup tools for `documents/` blobs and related database records.
                    </p>
                </div>
                <Button variant="outline" onClick={refreshAll} disabled={loadingOverview || loadingDuplicates}>
                    {loadingOverview || loadingDuplicates ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                    Refresh
                </Button>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>R2 Documents Health</CardTitle>
                    <CardDescription>Current state of document blob metadata and duplicate groups.</CardDescription>
                </CardHeader>
                <CardContent>
                    {loadingOverview && !overview ? (
                        <div className="py-8 flex items-center justify-center text-muted-foreground">
                            <Loader2 className="h-5 w-5 animate-spin mr-2" />
                            Loading health metrics...
                        </div>
                    ) : overview ? (
                        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                            <MetricCard label="Total docs" value={overview.health.totalDocuments} icon={<CheckCircle2 className="h-4 w-4" />} />
                            <MetricCard label="Docs with UUID" value={overview.health.documentsWithValidUuid} icon={<CheckCircle2 className="h-4 w-4 text-green-500" />} />
                            <MetricCard label="Docs missing UUID" value={overview.health.documentsMissingUuid} icon={<AlertCircle className="h-4 w-4 text-amber-500" />} />
                            <MetricCard label="Missing blob metadata" value={overview.health.documentsMissingBlobMetadata} icon={<ShieldAlert className="h-4 w-4 text-amber-500" />} />
                            <MetricCard label="Duplicate URL groups" value={overview.health.duplicateDocumentUrlGroups} icon={<Wrench className="h-4 w-4" />} />
                            <MetricCard label="Checksum collision groups" value={overview.health.duplicateDocumentChecksumGroups} icon={<Wrench className="h-4 w-4" />} />
                        </div>
                    ) : (
                        <p className="text-sm text-muted-foreground">No overview data available.</p>
                    )}
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Orphaned R2 Folders</CardTitle>
                    <CardDescription>
                        Scan R2 for <code className="text-xs">documents/&lt;uuid&gt;/</code> prefixes that have no matching document in the database.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="flex items-center gap-2">
                        <Button onClick={handleOrphanScan} disabled={orphanLoading}>
                            {orphanLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FolderSearch className="h-4 w-4" />}
                            Scan for orphans
                        </Button>
                        {orphanScan && orphanScan.orphans.length > 0 && (
                            <>
                                <Button variant="outline" onClick={handleFeedOrphansToCleanup}>
                                    <Trash2 className="h-4 w-4" />
                                    Send to cleanup
                                </Button>
                                <Button variant="destructive" onClick={handleDeleteOrphans} disabled={orphanDeleting}>
                                    {orphanDeleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                                    Delete all orphans
                                </Button>
                            </>
                        )}
                    </div>

                    {orphanScan && (
                        <>
                            <div className="grid gap-3 sm:grid-cols-3">
                                <MetricCard label="R2 prefixes" value={orphanScan.r2PrefixCount} icon={<CheckCircle2 className="h-4 w-4" />} />
                                <MetricCard label="DB UUIDs" value={orphanScan.dbUuidCount} icon={<CheckCircle2 className="h-4 w-4" />} />
                                <MetricCard
                                    label="Orphaned folders"
                                    value={orphanScan.orphanCount}
                                    icon={orphanScan.orphanCount > 0
                                        ? <AlertCircle className="h-4 w-4 text-amber-500" />
                                        : <CheckCircle2 className="h-4 w-4 text-green-500" />
                                    }
                                />
                            </div>

                            {orphanScan.orphans.length > 0 && (
                                <div className="rounded-md border overflow-x-auto">
                                    <table className="w-full text-xs">
                                        <thead className="bg-muted/40 border-b">
                                            <tr>
                                                <th className="text-left p-2">UUID</th>
                                                <th className="text-left p-2">Prefix</th>
                                                <th className="text-left p-2">Objects</th>
                                                <th className="text-left p-2">Sample keys</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {orphanScan.orphans.slice(0, orphanVisibleCount).map((orphan) => (
                                                <tr key={orphan.uuid} className="border-b border-border/40 align-top">
                                                    <td className="p-2 font-mono">{orphan.uuid}</td>
                                                    <td className="p-2 font-mono">{orphan.prefix}</td>
                                                    <td className="p-2 tabular-nums">{orphan.objectCount}</td>
                                                    <td className="p-2 font-mono break-all">{orphan.sampleKeys.join(', ') || '—'}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                    {orphanScan.orphans.length > orphanVisibleCount && (
                                        <div className="flex items-center justify-center py-2">
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => setOrphanVisibleCount((prev) => prev + 20)}
                                            >
                                                Show more ({orphanScan.orphans.length - orphanVisibleCount} remaining)
                                            </Button>
                                        </div>
                                    )}
                                </div>
                            )}
                        </>
                    )}
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Duplicate Audit</CardTitle>
                    <CardDescription>
                        `sources` and `source_urls` are detect-only in this version. Document groups support manual dry-run resolution.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <Tabs value={duplicateKind} onValueChange={onChangeDuplicateTab}>
                        <TabsList className="h-auto flex-wrap gap-1 p-1">
                            {DUPLICATE_TABS.map((tab) => (
                                <TabsTrigger key={tab.key} value={tab.key}>{tab.label}</TabsTrigger>
                            ))}
                        </TabsList>

                        {DUPLICATE_TABS.map((tab) => (
                            <TabsContent key={tab.key} value={tab.key} className="space-y-3">
                                {loadingDuplicates && !duplicateData ? (
                                    <div className="py-6 text-sm text-muted-foreground flex items-center gap-2">
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                        Loading duplicate groups...
                                    </div>
                                ) : duplicateData ? (
                                    <>
                                        {isDocumentsTab && (
                                            <Card className="border-dashed">
                                                <CardHeader>
                                                    <CardTitle className="text-base">Document Duplicate Resolution</CardTitle>
                                                    <CardDescription>
                                                        1) select rows, 2) choose canonical row, 3) dry-run, 4) apply.
                                                    </CardDescription>
                                                </CardHeader>
                                                <CardContent className="space-y-3">
                                                    <div className="text-xs text-muted-foreground">
                                                        Selected rows: <span className="font-medium text-foreground">{selectedDocumentIds.size}</span>
                                                        {canonicalDocumentId ? (
                                                            <>
                                                                {' '}| Canonical: <span className="font-mono text-foreground">{canonicalDocumentId}</span>
                                                            </>
                                                        ) : null}
                                                    </div>
                                                    <div className="flex flex-wrap gap-2">
                                                        <Button size="sm" variant="outline" onClick={handleResolveDryRun} disabled={resolveLoading}>
                                                            {resolveLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wrench className="h-4 w-4" />}
                                                            Dry-run resolve duplicates
                                                        </Button>
                                                        <Button size="sm" onClick={handleResolveApply} disabled={resolveLoading}>
                                                            {resolveLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                                                            Apply resolve duplicates
                                                        </Button>
                                                    </div>

                                                    {resolveDryRun && (
                                                        <div className="rounded-md border p-3 text-xs space-y-1">
                                                            <p className="font-medium">Dry-run plan</p>
                                                            {resolveDryRun.plan.map((item) => (
                                                                <div key={item.document_id} className="flex items-center justify-between gap-2">
                                                                    <span className="font-mono">{item.document_id}</span>
                                                                    <span className={item.can_execute ? 'text-green-500' : 'text-amber-500'}>
                                                                        {item.can_execute ? `uuid=${item.uuid}` : (item.reason || 'cannot execute')}
                                                                    </span>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    )}

                                                    {resolveApplyResult?.results && (
                                                        <div className="rounded-md border p-3 text-xs space-y-1">
                                                            <p className="font-medium">Apply result</p>
                                                            {resolveApplyResult.results.map((item) => (
                                                                <div key={item.document_id} className="flex items-center justify-between gap-2">
                                                                    <span className="font-mono">{item.document_id}</span>
                                                                    <span className={item.error ? 'text-red-500' : 'text-green-500'}>
                                                                        {item.error ? item.error : `r2=${item.r2_deleted_count}, db_updated=${String(item.db_updated)}, db_deleted=${String(item.db_deleted)}`}
                                                                    </span>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    )}
                                                </CardContent>
                                            </Card>
                                        )}

                                        {duplicateData.groups.length === 0 ? (
                                            <p className="text-sm text-muted-foreground">No duplicate groups for this tab.</p>
                                        ) : (
                                            <div className="space-y-3">
                                                {duplicateData.groups.map((group) => (
                                                    <div key={group.key} className="rounded-md border">
                                                        <div className="flex items-center justify-between gap-2 border-b px-3 py-2 text-xs">
                                                            <span className="font-mono text-muted-foreground truncate">{group.key}</span>
                                                            <span className="font-medium">{group.count} rows</span>
                                                        </div>
                                                        <div className="overflow-x-auto">
                                                            <table className="w-full text-xs">
                                                                <thead className="bg-muted/40 border-b">
                                                                    <tr>
                                                                        {isDocumentsTab && <th className="text-left p-2">Select</th>}
                                                                        {isDocumentsTab && <th className="text-left p-2">Canonical</th>}
                                                                        <th className="text-left p-2">ID</th>
                                                                        <th className="text-left p-2">URL / Name</th>
                                                                        <th className="text-left p-2">Filename/Label</th>
                                                                        <th className="text-left p-2">Checksum</th>
                                                                        <th className="text-left p-2">Blob UUID</th>
                                                                        <th className="text-left p-2">Created</th>
                                                                    </tr>
                                                                </thead>
                                                                <tbody>
                                                                    {group.items.map((item) => {
                                                                        const docId = item.id || '';
                                                                        const isSelected = selectedDocumentIds.has(docId);
                                                                        const isCanonical = canonicalDocumentId === docId;
                                                                        return (
                                                                            <tr key={`${group.key}-${docId}`} className="border-b border-border/40 align-top">
                                                                                {isDocumentsTab && (
                                                                                    <td className="p-2">
                                                                                        <input
                                                                                            type="checkbox"
                                                                                            checked={isSelected}
                                                                                            onChange={(event) => toggleDocumentSelection(docId, event.target.checked)}
                                                                                        />
                                                                                    </td>
                                                                                )}
                                                                                {isDocumentsTab && (
                                                                                    <td className="p-2">
                                                                                        <input
                                                                                            type="radio"
                                                                                            name="canonical-document"
                                                                                            checked={isCanonical}
                                                                                            disabled={!isSelected}
                                                                                            onChange={() => setCanonicalDocumentId(docId)}
                                                                                        />
                                                                                    </td>
                                                                                )}
                                                                                <td className="p-2 font-mono">{item.id || '—'}</td>
                                                                                <td className="p-2 break-all">{item.url || item.base_url || item.name || '—'}</td>
                                                                                <td className="p-2">{item.filename || item.label || '—'}</td>
                                                                                <td className="p-2 font-mono">{item.checksum || '—'}</td>
                                                                                <td className="p-2 font-mono">{item.blob_uuid || '—'}</td>
                                                                                <td className="p-2 text-muted-foreground">{formatDate(item.created_at)}</td>
                                                                            </tr>
                                                                        );
                                                                    })}
                                                                </tbody>
                                                            </table>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}

                                        <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                                            <span>Groups: {duplicateData.total}</span>
                                            <div className="flex items-center gap-1">
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    disabled={duplicatePage === 0 || loadingDuplicates}
                                                    onClick={() => setDuplicatePage((prev) => Math.max(0, prev - 1))}
                                                >
                                                    Prev
                                                </Button>
                                                <span>Page {duplicatePage + 1}</span>
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    disabled={loadingDuplicates || ((duplicatePage + 1) * (duplicateData.pageSize || 10) >= duplicateData.total)}
                                                    onClick={() => setDuplicatePage((prev) => prev + 1)}
                                                >
                                                    Next
                                                </Button>
                                            </div>
                                        </div>
                                    </>
                                ) : (
                                    <p className="text-sm text-muted-foreground">No duplicate data loaded.</p>
                                )}
                            </TabsContent>
                        ))}
                    </Tabs>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Cleanup by UUID / Document</CardTitle>
                    <CardDescription>
                        Dry-run first, then execute. The manager deletes full `documents/&lt;uuid&gt;/` prefix in R2 and then applies selected DB action.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="grid gap-3 lg:grid-cols-2">
                        <div className="space-y-2">
                            <label className="text-sm font-medium">Document IDs (comma/newline separated)</label>
                            <Textarea
                                value={cleanupDocIdsText}
                                onChange={(event) => setCleanupDocIdsText(event.target.value)}
                                placeholder="123\n124"
                                className="min-h-[80px]"
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-medium">UUIDs (comma/newline separated)</label>
                            <Textarea
                                value={cleanupUuidsText}
                                onChange={(event) => setCleanupUuidsText(event.target.value)}
                                placeholder="0dff..."
                                className="min-h-[80px]"
                            />
                        </div>
                    </div>

                    <div className="flex items-center gap-3 flex-wrap">
                        <label className="text-sm font-medium">Mode</label>
                        <select
                            className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
                            value={cleanupMode}
                            onChange={(event) => setCleanupMode(event.target.value as CleanupMode)}
                        >
                            <option value="blob_only">Blob cleanup only (clear pointers)</option>
                            <option value="blob_and_delete_document">Blob cleanup + hard delete document</option>
                        </select>

                        <label className="inline-flex items-center gap-2 text-sm">
                            <input
                                type="checkbox"
                                checked={includeSelectedRows}
                                onChange={(event) => setIncludeSelectedRows(event.target.checked)}
                            />
                            Include selected document rows from duplicate tabs
                        </label>
                    </div>

                    <div className="flex gap-2">
                        <Button onClick={handleCreatePreview} disabled={previewLoading}>
                            {previewLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wrench className="h-4 w-4" />}
                            Create dry-run preview
                        </Button>
                        <Button
                            variant="destructive"
                            disabled={!preview || preview.targets.length === 0}
                            onClick={() => setExecuteOpen(true)}
                        >
                            <Trash2 className="h-4 w-4" />
                            Execute cleanup
                        </Button>
                    </div>

                    {preview && (
                        <div className="rounded-md border">
                            <div className="border-b px-3 py-2 text-xs text-muted-foreground flex items-center justify-between">
                                <span>Preview token: <span className="font-mono text-foreground">{preview.preview_token}</span></span>
                                <span>Expires: {formatDate(preview.expires_at)}</span>
                            </div>
                            <div className="overflow-x-auto">
                                <table className="w-full text-xs">
                                    <thead className="bg-muted/40 border-b">
                                        <tr>
                                            <th className="text-left p-2">UUID</th>
                                            <th className="text-left p-2">Prefix</th>
                                            <th className="text-left p-2">Objects</th>
                                            <th className="text-left p-2">Document IDs</th>
                                            <th className="text-left p-2">DB impact</th>
                                            <th className="text-left p-2">Sample keys</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {preview.targets.map((target) => (
                                            <tr key={target.uuid} className="border-b border-border/40 align-top">
                                                <td className="p-2 font-mono">{target.uuid}</td>
                                                <td className="p-2 font-mono">{target.prefix}</td>
                                                <td className="p-2">{target.objectCount}</td>
                                                <td className="p-2 font-mono break-all">{target.documentIds.join(', ') || '—'}</td>
                                                <td className="p-2">{target.dbImpact.action} ({target.dbImpact.documentRowsAffected})</td>
                                                <td className="p-2 font-mono break-all">{target.sampleKeys.join(', ') || '—'}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {executeResult && (
                        <div className="rounded-md border">
                            <div className="border-b px-3 py-2 text-xs text-muted-foreground">
                                Operation: <span className="font-mono text-foreground">{executeResult.operation_id}</span>
                            </div>
                            <div className="overflow-x-auto">
                                <table className="w-full text-xs">
                                    <thead className="bg-muted/40 border-b">
                                        <tr>
                                            <th className="text-left p-2">UUID</th>
                                            <th className="text-left p-2">R2 deleted</th>
                                            <th className="text-left p-2">DB updated</th>
                                            <th className="text-left p-2">DB deleted</th>
                                            <th className="text-left p-2">Error</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {executeResult.results.map((row) => (
                                            <tr key={row.uuid} className="border-b border-border/40">
                                                <td className="p-2 font-mono">{row.uuid}</td>
                                                <td className="p-2">{row.r2_deleted_count}</td>
                                                <td className="p-2">{row.db_updated_count}</td>
                                                <td className="p-2">{row.db_deleted_count}</td>
                                                <td className="p-2 text-red-500">{row.error || '—'}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </CardContent>
            </Card>

            <Dialog open={executeOpen} onOpenChange={setExecuteOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Execute cleanup</DialogTitle>
                        <DialogDescription>
                            This will execute R2 deletion first and DB mutation second for each UUID target.
                        </DialogDescription>
                    </DialogHeader>

                    {preview ? (
                        <div className="space-y-3 text-sm">
                            <p>
                                Mode: <span className="font-medium">{cleanupMode}</span>
                            </p>
                            <p>
                                UUID targets: <span className="font-medium">{preview.targets.length}</span>
                            </p>
                            {cleanupMode === 'blob_and_delete_document' && (
                                <div className="space-y-2">
                                    <p className="text-amber-500 text-xs">
                                        Hard delete mode will remove document rows after successful R2 deletion.
                                    </p>
                                    <Input
                                        value={executeConfirmText}
                                        onChange={(event) => setExecuteConfirmText(event.target.value)}
                                        placeholder="Type DELETE DOCUMENTS"
                                    />
                                </div>
                            )}
                        </div>
                    ) : null}

                    <DialogFooter>
                        <Button variant="outline" onClick={() => setExecuteOpen(false)} disabled={executing}>Cancel</Button>
                        <Button
                            variant="destructive"
                            onClick={handleExecute}
                            disabled={executing || !preview || (cleanupMode === 'blob_and_delete_document' && executeConfirmText !== 'DELETE DOCUMENTS')}
                        >
                            {executing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                            Execute
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}

function MetricCard({ label, value, icon }: { label: string; value: number; icon: React.ReactNode }) {
    return (
        <div className="rounded-md border p-3 bg-card">
            <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                <span>{label}</span>
                {icon}
            </div>
            <div className="mt-1 text-2xl font-semibold tabular-nums">{value.toLocaleString()}</div>
        </div>
    );
}
