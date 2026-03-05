'use client';

import { useEffect, useRef, useState } from 'react';
import { Plus, Settings2, Trash2 } from 'lucide-react';

import { cn } from '@/lib/utils';
import type { SourceUrlType } from '@/lib/crawler-types';
import { Button } from '@/components/ui/button';

interface UrlTypePanelProps {
    urlTypes: SourceUrlType[];
    activeUrlTypeId: string;
    onSelect: (id: string) => void;
    onAdd: () => void;
    onRename: (id: string, newName: string) => void;
    onDelete: (id: string) => void;
}

export function UrlTypePanel({
    urlTypes,
    activeUrlTypeId,
    onSelect,
    onAdd,
    onRename,
    onDelete,
}: UrlTypePanelProps) {
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editValue, setEditValue] = useState('');
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (editingId && inputRef.current) {
            inputRef.current.focus();
            inputRef.current.select();
        }
    }, [editingId]);

    const startEditing = (urlType: SourceUrlType) => {
        setEditingId(urlType.id);
        setEditValue(urlType.name);
    };

    const commitEdit = () => {
        if (editingId) {
            onRename(editingId, editValue);
            setEditingId(null);
        }
    };

    const cancelEdit = () => {
        setEditingId(null);
    };

    return (
        <div className="border-b border-border p-4">
            <div className="mb-3 flex items-center justify-between">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">URL Types</h3>
                <Button type="button" size="sm" variant="ghost" className="h-7 text-muted-foreground hover:bg-muted/50" onClick={onAdd}>
                    <Plus className="mr-1 h-3 w-3" />
                    Add URL Type
                </Button>
            </div>
            <div className="space-y-2">
                {urlTypes.map((urlType) => (
                    <div
                        key={urlType.id}
                        role="button"
                        tabIndex={0}
                        aria-pressed={activeUrlTypeId === urlType.id}
                        onClick={() => onSelect(urlType.id)}
                        onKeyDown={(event) => {
                            if (event.key === 'Enter' || event.key === ' ') {
                                event.preventDefault();
                                onSelect(urlType.id);
                            }
                        }}
                        className={cn(
                            'w-full rounded-lg border px-3 py-2 text-left transition-colors',
                            activeUrlTypeId === urlType.id
                                ? 'border-primary/50 bg-primary/20'
                                : 'border-border bg-card/50 hover:border-border',
                        )}
                    >
                        <div className="flex items-center justify-between gap-2">
                            {editingId === urlType.id ? (
                                <input
                                    ref={inputRef}
                                    type="text"
                                    value={editValue}
                                    onChange={(event) => setEditValue(event.target.value)}
                                    onKeyDown={(event) => {
                                        event.stopPropagation();
                                        if (event.key === 'Enter') {
                                            commitEdit();
                                        } else if (event.key === 'Escape') {
                                            cancelEdit();
                                        }
                                    }}
                                    onClick={(event) => event.stopPropagation()}
                                    onBlur={commitEdit}
                                    className="min-w-0 flex-1 rounded border border-primary bg-muted/30 px-1.5 py-0.5 text-sm text-foreground outline-none"
                                />
                            ) : (
                                <span
                                    className="truncate text-sm text-foreground"
                                    onDoubleClick={(event) => {
                                        event.stopPropagation();
                                        startEditing(urlType);
                                    }}
                                >
                                    {urlType.name}
                                </span>
                            )}
                            <span className="flex shrink-0 gap-1">
                                {editingId !== urlType.id && (
                                    <Button
                                        type="button"
                                        size="icon"
                                        variant="ghost"
                                        className="h-6 w-6 text-muted-foreground/60 hover:text-foreground"
                                        onClick={(event) => {
                                            event.stopPropagation();
                                            startEditing(urlType);
                                        }}
                                    >
                                        <Settings2 className="h-3.5 w-3.5" />
                                    </Button>
                                )}
                                {urlTypes.length > 1 && (
                                    <Button
                                        type="button"
                                        size="icon"
                                        variant="ghost"
                                        className="h-6 w-6 text-muted-foreground/60 hover:text-red-300"
                                        onClick={(event) => {
                                            event.stopPropagation();
                                            onDelete(urlType.id);
                                        }}
                                    >
                                        <Trash2 className="h-3.5 w-3.5" />
                                    </Button>
                                )}
                            </span>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
