'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { toast } from 'sonner';
import {
    Search,
    Plus,
    RefreshCw,
    Pencil,
    Trash2,
    ChevronLeft,
    ChevronRight,
    ChevronsLeft,
    ChevronsRight,
    ArrowUp,
    ArrowDown,
    Loader2,
    Database,
    Table2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import {
    TABLE_SCHEMAS,
    TableSchema,
    getTableSchema,
    getVisibleColumns,
    formatCellValue,
} from './table-schema';
import { RowFormDialog } from './row-form-dialog';

const PAGE_SIZE = 25;

export function DatabaseManager() {
    const [selectedTable, setSelectedTable] = useState(TABLE_SCHEMAS[0].name);
    const [rows, setRows] = useState<Record<string, unknown>[]>([]);
    const [totalCount, setTotalCount] = useState(0);
    const [page, setPage] = useState(0);
    const [sortColumn, setSortColumn] = useState('');
    const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
    const [search, setSearch] = useState('');
    const [loading, setLoading] = useState(false);
    const [tableCounts, setTableCounts] = useState<Record<string, number>>({});

    // Dialog state
    const [formOpen, setFormOpen] = useState(false);
    const [formMode, setFormMode] = useState<'create' | 'edit'>('create');
    const [editingRow, setEditingRow] = useState<Record<string, unknown> | undefined>();
    const [deleteRow, setDeleteRow] = useState<Record<string, unknown> | null>(null);
    const [deleting, setDeleting] = useState(false);

    const searchTimeout = useRef<NodeJS.Timeout | null>(null);
    const schema = getTableSchema(selectedTable)!;
    const visibleCols = getVisibleColumns(schema);
    const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

    // Fetch rows
    const fetchRows = useCallback(async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams({
                page: String(page),
                pageSize: String(PAGE_SIZE),
                sort: sortColumn || schema.primaryKey,
                order: sortDir,
            });
            if (search) params.set('search', search);

            const res = await fetch(`/api/db/${selectedTable}?${params}`);
            const data = await res.json();

            if (!res.ok) throw new Error(data.error);

            setRows(data.rows);
            setTotalCount(data.count);
        } catch (e) {
            toast.error(e instanceof Error ? e.message : 'Chyba při načítání dat');
        } finally {
            setLoading(false);
        }
    }, [selectedTable, page, sortColumn, sortDir, search, schema.primaryKey]);

    useEffect(() => {
        fetchRows();
    }, [fetchRows]);

    // Fetch table counts for sidebar badges
    useEffect(() => {
        async function loadCounts() {
            const counts: Record<string, number> = {};
            await Promise.all(
                TABLE_SCHEMAS.map(async t => {
                    try {
                        const res = await fetch(`/api/db/${t.name}?page=0&pageSize=1`);
                        const data = await res.json();
                        counts[t.name] = data.count ?? 0;
                    } catch {
                        counts[t.name] = 0;
                    }
                }),
            );
            setTableCounts(counts);
        }
        loadCounts();
    }, []);

    // Reset page when table or search changes
    useEffect(() => {
        setPage(0);
    }, [selectedTable, search]);

    // Reset sort when table changes
    useEffect(() => {
        setSortColumn('');
        setSortDir('desc');
        setSearch('');
    }, [selectedTable]);

    const handleSearchInput = (value: string) => {
        if (searchTimeout.current) clearTimeout(searchTimeout.current);
        searchTimeout.current = setTimeout(() => {
            setSearch(value);
        }, 400);
    };

    const handleSort = (column: string) => {
        if (sortColumn === column) {
            setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
        } else {
            setSortColumn(column);
            setSortDir('asc');
        }
    };

    const handleCreate = async (data: Record<string, unknown>) => {
        const res = await fetch(`/api/db/${selectedTable}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
        });
        const result = await res.json();
        if (!res.ok) throw new Error(result.error);
        toast.success('Záznam vytvořen');
        fetchRows();
    };

    const handleUpdate = async (data: Record<string, unknown>) => {
        const res = await fetch(`/api/db/${selectedTable}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                __pk: editingRow?.[schema.primaryKey],
                ...data,
            }),
        });
        const result = await res.json();
        if (!res.ok) throw new Error(result.error);
        toast.success('Záznam upraven');
        fetchRows();
    };

    const handleDelete = async () => {
        if (!deleteRow) return;
        setDeleting(true);
        try {
            const pk = deleteRow[schema.primaryKey];
            const res = await fetch(
                `/api/db/${selectedTable}?pk=${encodeURIComponent(String(pk))}`,
                { method: 'DELETE' },
            );
            const result = await res.json();
            if (!res.ok) throw new Error(result.error);
            toast.success('Záznam smazán');
            setDeleteRow(null);
            fetchRows();
        } catch (e) {
            toast.error(e instanceof Error ? e.message : 'Chyba při mazání');
        } finally {
            setDeleting(false);
        }
    };

    const openCreate = () => {
        setFormMode('create');
        setEditingRow(undefined);
        setFormOpen(true);
    };

    const openEdit = (row: Record<string, unknown>) => {
        setFormMode('edit');
        setEditingRow(row);
        setFormOpen(true);
    };

    return (
        <div className="flex h-full">
            {/* Sidebar */}
            <aside className="w-56 shrink-0 border-r border-white/10 bg-black/20 overflow-y-auto">
                <div className="p-4 border-b border-white/10">
                    <div className="flex items-center gap-2 text-sm font-medium text-white/70">
                        <Database className="w-4 h-4" />
                        <span>Tabulky</span>
                    </div>
                </div>
                <nav className="p-2 space-y-0.5">
                    {TABLE_SCHEMAS.map(t => (
                        <button
                            key={t.name}
                            onClick={() => setSelectedTable(t.name)}
                            className={cn(
                                'w-full text-left px-3 py-2 rounded-md text-sm transition-colors flex items-center justify-between gap-2',
                                selectedTable === t.name
                                    ? 'bg-purple-500/20 text-white border border-purple-500/30'
                                    : 'text-white/60 hover:text-white hover:bg-white/5',
                            )}
                        >
                            <div className="flex items-center gap-2 min-w-0">
                                <Table2 className="w-3.5 h-3.5 shrink-0" />
                                <span className="truncate">{t.label}</span>
                            </div>
                            {tableCounts[t.name] !== undefined && (
                                <span className="text-[10px] bg-white/10 px-1.5 py-0.5 rounded text-white/40 shrink-0">
                                    {tableCounts[t.name]}
                                </span>
                            )}
                        </button>
                    ))}
                </nav>
            </aside>

            {/* Main Content */}
            <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
                {/* Toolbar */}
                <div className="shrink-0 px-4 py-3 border-b border-white/10 bg-black/10 flex items-center gap-3">
                    <h2 className="text-sm font-semibold text-white mr-2">{schema.label}</h2>
                    <span className="text-xs text-white/40">
                        {totalCount} záznamů
                    </span>
                    <div className="flex-1" />
                    <div className="relative w-56">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/30" />
                        <Input
                            placeholder="Hledat..."
                            onChange={e => handleSearchInput(e.target.value)}
                            className="h-8 pl-8 text-xs bg-white/5 border-white/15 text-white placeholder:text-white/30"
                        />
                    </div>
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={fetchRows}
                        className="h-8 w-8 text-white/50 hover:text-white"
                    >
                        <RefreshCw className={cn('w-3.5 h-3.5', loading && 'animate-spin')} />
                    </Button>
                    <Button
                        size="sm"
                        onClick={openCreate}
                        className="h-8 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white text-xs"
                    >
                        <Plus className="w-3.5 h-3.5 mr-1" />
                        Přidat
                    </Button>
                </div>

                {/* Table */}
                <div className="flex-1 overflow-auto relative">
                    {loading && rows.length === 0 && (
                        <div className="absolute inset-0 flex items-center justify-center">
                            <Loader2 className="w-6 h-6 text-purple-400 animate-spin" />
                        </div>
                    )}

                    <table className="w-full text-sm">
                        <thead className="sticky top-0 z-10 bg-zinc-900/95 backdrop-blur-sm">
                            <tr className="border-b border-white/10">
                                {visibleCols.map(col => {
                                    const isSorted = sortColumn === col.name;
                                    return (
                                        <th
                                            key={col.name}
                                            onClick={() => handleSort(col.name)}
                                            className="px-3 py-2 text-left text-xs font-medium text-white/50 uppercase tracking-wider cursor-pointer hover:text-white/80 transition-colors select-none whitespace-nowrap"
                                        >
                                            <div className="flex items-center gap-1">
                                                {col.label}
                                                {isSorted && (
                                                    sortDir === 'asc'
                                                        ? <ArrowUp className="w-3 h-3" />
                                                        : <ArrowDown className="w-3 h-3" />
                                                )}
                                            </div>
                                        </th>
                                    );
                                })}
                                <th className="px-3 py-2 text-right text-xs font-medium text-white/50 uppercase tracking-wider w-20">
                                    Akce
                                </th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                            {rows.map((row, i) => (
                                <tr
                                    key={`${selectedTable}-${row[schema.primaryKey] ?? i}`}
                                    className="hover:bg-white/[0.03] transition-colors group"
                                >
                                    {visibleCols.map(col => {
                                        const val = row[col.name];
                                        const display = formatCellValue(val, col);
                                        const isBoolean = col.type === 'boolean';
                                        const isNull = val === null || val === undefined;

                                        return (
                                            <td
                                                key={col.name}
                                                className="px-3 py-2 text-sm whitespace-nowrap max-w-[300px] truncate"
                                            >
                                                {isBoolean ? (
                                                    <span
                                                        className={cn(
                                                            'inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium',
                                                            val
                                                                ? 'bg-green-500/15 text-green-400'
                                                                : 'bg-red-500/15 text-red-400',
                                                        )}
                                                    >
                                                        <span className={cn(
                                                            'w-1.5 h-1.5 rounded-full',
                                                            val ? 'bg-green-400' : 'bg-red-400',
                                                        )} />
                                                        {display}
                                                    </span>
                                                ) : isNull ? (
                                                    <span className="text-white/20">—</span>
                                                ) : col.type === 'jsonb' || col.type === 'json' ? (
                                                    <span className="font-mono text-xs text-purple-300/70">{display}</span>
                                                ) : col.primaryKey ? (
                                                    <span className="font-mono text-white/80">{display}</span>
                                                ) : (
                                                    <span className="text-white/70">{display}</span>
                                                )}
                                            </td>
                                        );
                                    })}
                                    <td className="px-3 py-2 text-right whitespace-nowrap">
                                        <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <button
                                                onClick={() => openEdit(row)}
                                                className="p-1.5 rounded hover:bg-white/10 text-white/40 hover:text-blue-400 transition-colors"
                                                title="Upravit"
                                            >
                                                <Pencil className="w-3.5 h-3.5" />
                                            </button>
                                            <button
                                                onClick={() => setDeleteRow(row)}
                                                className="p-1.5 rounded hover:bg-white/10 text-white/40 hover:text-red-400 transition-colors"
                                                title="Smazat"
                                            >
                                                <Trash2 className="w-3.5 h-3.5" />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}

                            {!loading && rows.length === 0 && (
                                <tr>
                                    <td
                                        colSpan={visibleCols.length + 1}
                                        className="text-center py-16 text-white/30 text-sm"
                                    >
                                        {search ? 'Žádné výsledky pro tento dotaz' : 'Tabulka je prázdná'}
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                    <div className="shrink-0 px-4 py-2 border-t border-white/10 bg-black/10 flex items-center justify-between">
                        <span className="text-xs text-white/40">
                            Stránka {page + 1} z {totalPages}
                        </span>
                        <div className="flex items-center gap-1">
                            <button
                                onClick={() => setPage(0)}
                                disabled={page === 0}
                                className="p-1 rounded text-white/40 hover:text-white disabled:opacity-20 disabled:cursor-not-allowed transition-colors"
                            >
                                <ChevronsLeft className="w-4 h-4" />
                            </button>
                            <button
                                onClick={() => setPage(p => Math.max(0, p - 1))}
                                disabled={page === 0}
                                className="p-1 rounded text-white/40 hover:text-white disabled:opacity-20 disabled:cursor-not-allowed transition-colors"
                            >
                                <ChevronLeft className="w-4 h-4" />
                            </button>
                            <button
                                onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                                disabled={page >= totalPages - 1}
                                className="p-1 rounded text-white/40 hover:text-white disabled:opacity-20 disabled:cursor-not-allowed transition-colors"
                            >
                                <ChevronRight className="w-4 h-4" />
                            </button>
                            <button
                                onClick={() => setPage(totalPages - 1)}
                                disabled={page >= totalPages - 1}
                                className="p-1 rounded text-white/40 hover:text-white disabled:opacity-20 disabled:cursor-not-allowed transition-colors"
                            >
                                <ChevronsRight className="w-4 h-4" />
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* Create / Edit Dialog */}
            <RowFormDialog
                open={formOpen}
                onClose={() => setFormOpen(false)}
                schema={schema}
                mode={formMode}
                initialData={editingRow}
                onSubmit={formMode === 'create' ? handleCreate : handleUpdate}
            />

            {/* Delete Confirmation Dialog */}
            <Dialog open={!!deleteRow} onOpenChange={v => !v && setDeleteRow(null)}>
                <DialogContent className="sm:max-w-sm bg-zinc-950 border-white/10 text-white">
                    <DialogHeader>
                        <DialogTitle>Smazat záznam?</DialogTitle>
                        <DialogDescription>
                            Opravdu chcete smazat záznam s klíčem{' '}
                            <span className="font-mono text-white/80">
                                {String(deleteRow?.[schema.primaryKey])}
                            </span>
                            ? Tuto akci nelze vrátit.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="flex justify-end gap-3 pt-2">
                        <Button
                            variant="ghost"
                            onClick={() => setDeleteRow(null)}
                            disabled={deleting}
                        >
                            Zrušit
                        </Button>
                        <Button
                            onClick={handleDelete}
                            disabled={deleting}
                            className="bg-red-600 hover:bg-red-700 text-white"
                        >
                            {deleting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                            Smazat
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}
