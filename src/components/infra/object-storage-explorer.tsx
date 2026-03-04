'use client';

import * as React from 'react';
import { toast } from 'sonner';
import { Loader2, RefreshCw, Search, Trash2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';

interface ObjectItem {
    key: string;
    size: number;
    lastModified: string | null;
    etag: string | null;
    storageClass: string | null;
}

interface ObjectsResponse {
    success: boolean;
    prefix: string;
    cursor: string | null;
    nextCursor: string | null;
    pageSize: number;
    items: ObjectItem[];
    returnedCount: number;
}

interface DeletePreviewResponse {
    success: boolean;
    preview_token: string;
    created_at: string;
    expires_at: string;
    summary: {
        totalKeys: number;
        totalBytes: number;
    };
    items: Array<{
        key: string;
        size: number;
        lastModified: string | null;
    }>;
}

interface DeleteExecuteResponse {
    success: boolean;
    operation_id: string;
    deleted_count: number;
    failed_count: number;
    results: Array<{
        key: string;
        deleted: boolean;
        error: string | null;
    }>;
}

const PAGE_SIZE = 50;

function formatBytes(value: number): string {
    if (!Number.isFinite(value) || value < 0) return '—';
    if (value === 0) return '0 B';

    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let size = value;
    let unit = 0;

    while (size >= 1024 && unit < units.length - 1) {
        size /= 1024;
        unit += 1;
    }

    return `${size.toFixed(size >= 10 || unit === 0 ? 0 : 1)} ${units[unit]}`;
}

function formatDate(value: string | null): string {
    if (!value) return '—';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return '—';
    return parsed.toLocaleString();
}

export function ObjectStorageExplorer() {
    const [prefixInput, setPrefixInput] = React.useState('');
    const [queryInput, setQueryInput] = React.useState('');

    const [appliedPrefix, setAppliedPrefix] = React.useState('');
    const [appliedQuery, setAppliedQuery] = React.useState('');

    const [cursor, setCursor] = React.useState<string | null>(null);
    const [nextCursor, setNextCursor] = React.useState<string | null>(null);
    const [cursorHistory, setCursorHistory] = React.useState<Array<string | null>>([]);

    const [items, setItems] = React.useState<ObjectItem[]>([]);
    const [loading, setLoading] = React.useState(true);

    const [selectedKeys, setSelectedKeys] = React.useState<Set<string>>(new Set());

    const [deleteDialogOpen, setDeleteDialogOpen] = React.useState(false);
    const [previewLoading, setPreviewLoading] = React.useState(false);
    const [preview, setPreview] = React.useState<DeletePreviewResponse | null>(null);
    const [executeConfirmText, setExecuteConfirmText] = React.useState('');
    const [executing, setExecuting] = React.useState(false);
    const [executeResult, setExecuteResult] = React.useState<DeleteExecuteResponse | null>(null);

    const fetchObjects = React.useCallback(async (params: { prefix: string; query: string; cursor: string | null }) => {
        setLoading(true);
        try {
            const searchParams = new URLSearchParams({
                prefix: params.prefix,
                pageSize: String(PAGE_SIZE),
            });

            if (params.cursor) searchParams.set('cursor', params.cursor);
            if (params.query) searchParams.set('query', params.query);

            const response = await fetch(`/api/storage/objects?${searchParams.toString()}`, { cache: 'no-store' });
            const json = await response.json() as ObjectsResponse & { error?: string };
            if (!response.ok || !json.success) {
                throw new Error(json.error || 'Failed to load storage objects');
            }

            setItems(json.items);
            setNextCursor(json.nextCursor);
            setSelectedKeys(new Set());
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Failed to load storage objects');
        } finally {
            setLoading(false);
        }
    }, []);

    React.useEffect(() => {
        void fetchObjects({
            prefix: '',
            query: '',
            cursor: null,
        });
    }, [fetchObjects]);

    const applyFilters = async () => {
        const nextPrefix = prefixInput.trim();
        const nextQuery = queryInput.trim();

        setAppliedPrefix(nextPrefix);
        setAppliedQuery(nextQuery);
        setCursor(null);
        setNextCursor(null);
        setCursorHistory([]);

        await fetchObjects({
            prefix: nextPrefix,
            query: nextQuery,
            cursor: null,
        });
    };

    const refresh = async () => {
        await fetchObjects({
            prefix: appliedPrefix,
            query: appliedQuery,
            cursor,
        });
    };

    const goToNextPage = async () => {
        if (!nextCursor) return;

        setCursorHistory((prev) => [...prev, cursor]);
        setCursor(nextCursor);

        await fetchObjects({
            prefix: appliedPrefix,
            query: appliedQuery,
            cursor: nextCursor,
        });
    };

    const goToPreviousPage = async () => {
        if (cursorHistory.length === 0) return;

        const previousCursor = cursorHistory[cursorHistory.length - 1] ?? null;
        setCursorHistory((prev) => prev.slice(0, -1));
        setCursor(previousCursor);

        await fetchObjects({
            prefix: appliedPrefix,
            query: appliedQuery,
            cursor: previousCursor,
        });
    };

    const toggleSelectRow = (key: string, checked: boolean) => {
        setSelectedKeys((prev) => {
            const next = new Set(prev);
            if (checked) next.add(key);
            else next.delete(key);
            return next;
        });
    };

    const pageKeys = items.map((item) => item.key);
    const allRowsSelected = pageKeys.length > 0 && pageKeys.every((key) => selectedKeys.has(key));

    const toggleSelectAllCurrentPage = (checked: boolean) => {
        setSelectedKeys((prev) => {
            const next = new Set(prev);
            for (const key of pageKeys) {
                if (checked) next.add(key);
                else next.delete(key);
            }
            return next;
        });
    };

    const handleDeletePreview = async () => {
        const keys = Array.from(selectedKeys);
        if (keys.length === 0) {
            toast.error('Select at least one object key to delete.');
            return;
        }

        setPreviewLoading(true);
        setPreview(null);
        setExecuteResult(null);

        try {
            const response = await fetch('/api/storage/objects/delete-preview', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ keys }),
            });

            const json = await response.json() as DeletePreviewResponse & { error?: string };
            if (!response.ok || !json.success) {
                throw new Error(json.error || 'Failed to create delete preview');
            }

            setPreview(json);
            setExecuteConfirmText('');
            setDeleteDialogOpen(true);
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Failed to create delete preview');
        } finally {
            setPreviewLoading(false);
        }
    };

    const handleDeleteExecute = async () => {
        if (!preview) return;

        setExecuting(true);
        try {
            const response = await fetch('/api/storage/objects/delete-execute', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    preview_token: preview.preview_token,
                    confirmation: executeConfirmText,
                }),
            });

            const json = await response.json() as DeleteExecuteResponse & { error?: string };
            if (!response.ok || !json.success) {
                throw new Error(json.error || 'Failed to execute object deletion');
            }

            setExecuteResult(json);
            setDeleteDialogOpen(false);
            setPreview(null);
            setExecuteConfirmText('');
            setSelectedKeys(new Set());

            if (json.failed_count > 0) {
                toast.error(`Delete finished with ${json.failed_count} failure(s).`);
            } else {
                toast.success('Objects deleted successfully.');
            }

            await refresh();
        } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Failed to execute object deletion');
        } finally {
            setExecuting(false);
        }
    };

    return (
        <div className="space-y-4">
            <Card>
                <CardHeader>
                    <CardTitle>Blob Object Explorer</CardTitle>
                    <CardDescription>
                        Browse object keys across all storage prefixes, filter rows, and delete selected objects with preview + confirmation.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="flex flex-wrap items-center gap-2">
                        <Input
                            value={prefixInput}
                            onChange={(event) => setPrefixInput(event.target.value)}
                            placeholder="Prefix (example: documents/ or ingestion/)"
                            className="max-w-sm"
                        />
                        <div className="relative w-full max-w-sm">
                            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                            <Input
                                value={queryInput}
                                onChange={(event) => setQueryInput(event.target.value)}
                                placeholder="Find key substring on current page"
                                className="pl-8"
                            />
                        </div>
                        <Button variant="outline" onClick={applyFilters} disabled={loading}>
                            Apply filters
                        </Button>
                        <Button variant="outline" onClick={refresh} disabled={loading}>
                            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                            Refresh
                        </Button>
                        <Button variant="destructive" onClick={handleDeletePreview} disabled={previewLoading || selectedKeys.size === 0}>
                            {previewLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                            Delete selected ({selectedKeys.size})
                        </Button>
                    </div>

                    <div className="text-xs text-muted-foreground">
                        Applied prefix: <span className="font-mono text-foreground">{appliedPrefix || '(all prefixes)'}</span>
                        {' '}| Page: <span className="font-medium text-foreground">{cursorHistory.length + 1}</span>
                    </div>

                    <div className="overflow-x-auto rounded-md border">
                        <table className="w-full text-xs">
                            <thead className="bg-muted/40 border-b">
                                <tr>
                                    <th className="p-2 text-left">
                                        <input
                                            type="checkbox"
                                            checked={allRowsSelected}
                                            onChange={(event) => toggleSelectAllCurrentPage(event.target.checked)}
                                        />
                                    </th>
                                    <th className="p-2 text-left">Key</th>
                                    <th className="p-2 text-left">Size</th>
                                    <th className="p-2 text-left">Last Modified</th>
                                    <th className="p-2 text-left">ETag</th>
                                    <th className="p-2 text-left">Storage Class</th>
                                </tr>
                            </thead>
                            <tbody>
                                {loading ? (
                                    <tr>
                                        <td colSpan={6} className="p-6 text-center text-muted-foreground">
                                            <span className="inline-flex items-center gap-2">
                                                <Loader2 className="h-4 w-4 animate-spin" />
                                                Loading objects...
                                            </span>
                                        </td>
                                    </tr>
                                ) : items.length === 0 ? (
                                    <tr>
                                        <td colSpan={6} className="p-6 text-center text-muted-foreground">
                                            No objects for current filters.
                                        </td>
                                    </tr>
                                ) : (
                                    items.map((item) => (
                                        <tr key={item.key} className="border-b border-border/40 align-top">
                                            <td className="p-2">
                                                <input
                                                    type="checkbox"
                                                    checked={selectedKeys.has(item.key)}
                                                    onChange={(event) => toggleSelectRow(item.key, event.target.checked)}
                                                />
                                            </td>
                                            <td className="p-2 font-mono break-all">{item.key}</td>
                                            <td className="p-2 whitespace-nowrap">{formatBytes(item.size)}</td>
                                            <td className="p-2 whitespace-nowrap">{formatDate(item.lastModified)}</td>
                                            <td className="p-2 font-mono break-all">{item.etag || '—'}</td>
                                            <td className="p-2">{item.storageClass || '—'}</td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>

                    <div className="flex items-center justify-between">
                        <div className="text-xs text-muted-foreground">
                            Rows in current page: <span className="font-medium text-foreground">{items.length}</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={goToPreviousPage}
                                disabled={loading || cursorHistory.length === 0}
                            >
                                Prev
                            </Button>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={goToNextPage}
                                disabled={loading || !nextCursor}
                            >
                                Next
                            </Button>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {executeResult && (
                <Card>
                    <CardHeader>
                        <CardTitle className="text-base">Last Delete Operation</CardTitle>
                        <CardDescription>
                            Operation ID: <span className="font-mono text-foreground">{executeResult.operation_id}</span>
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-2 text-xs">
                        <div>
                            Deleted: <span className="font-medium text-foreground">{executeResult.deleted_count}</span>
                            {' '}| Failed: <span className="font-medium text-foreground">{executeResult.failed_count}</span>
                        </div>
                        <div className="max-h-52 overflow-auto rounded border">
                            <table className="w-full text-xs">
                                <thead className="bg-muted/40 border-b">
                                    <tr>
                                        <th className="p-2 text-left">Key</th>
                                        <th className="p-2 text-left">Deleted</th>
                                        <th className="p-2 text-left">Error</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {executeResult.results.map((item) => (
                                        <tr key={item.key} className="border-b border-border/40">
                                            <td className="p-2 font-mono break-all">{item.key}</td>
                                            <td className="p-2">{item.deleted ? 'yes' : 'no'}</td>
                                            <td className="p-2 text-red-500">{item.error || '—'}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </CardContent>
                </Card>
            )}

            <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Delete selected objects</DialogTitle>
                        <DialogDescription>
                            Preview is required before delete execution. Type <span className="font-mono">DELETE OBJECTS</span> to confirm.
                        </DialogDescription>
                    </DialogHeader>

                    {preview && (
                        <div className="space-y-2 text-sm">
                            <p>
                                Selected keys: <span className="font-medium">{preview.summary.totalKeys}</span>
                            </p>
                            <p>
                                Total size: <span className="font-medium">{formatBytes(preview.summary.totalBytes)}</span>
                            </p>
                            <p className="text-xs text-muted-foreground">
                                Preview expires: {formatDate(preview.expires_at)}
                            </p>
                            <Input
                                value={executeConfirmText}
                                onChange={(event) => setExecuteConfirmText(event.target.value)}
                                placeholder="Type DELETE OBJECTS"
                            />
                        </div>
                    )}

                    <DialogFooter>
                        <Button variant="outline" onClick={() => setDeleteDialogOpen(false)} disabled={executing}>Cancel</Button>
                        <Button
                            variant="destructive"
                            onClick={handleDeleteExecute}
                            disabled={!preview || executing || executeConfirmText !== 'DELETE OBJECTS'}
                        >
                            {executing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                            Execute delete
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
