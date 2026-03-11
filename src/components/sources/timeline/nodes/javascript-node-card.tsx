'use client';

import { Code, Pencil, Trash2 } from 'lucide-react';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import type { TimelineJavascriptNode } from '@/lib/crawler-types';

import { CodeMirrorDialog } from '../codemirror-dialog';

interface JavascriptNodeCardProps {
    node: TimelineJavascriptNode;
    depth: number;
    onUpdate: (patch: Partial<Pick<TimelineJavascriptNode, 'script'>>) => void;
    onRemove: () => void;
}

export function JavascriptNodeCard({ node, depth, onUpdate, onRemove }: JavascriptNodeCardProps) {
    const [editorOpen, setEditorOpen] = useState(false);

    const preview = node.script
        ? node.script.split('\n')[0].slice(0, 60) + (node.script.length > 60 ? '...' : '')
        : '(prázdný skript)';

    return (
        <>
            <div className={`rounded-lg border border-border bg-card/50 p-2 ${depth > 0 ? 'ml-4' : ''}`}>
                <div className="flex items-center gap-1.5">
                    <Code className="h-3.5 w-3.5 shrink-0 text-primary" />
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                        JavaScript
                    </span>
                    <div className="flex-1" />
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-5 w-5 text-muted-foreground hover:text-foreground"
                        onClick={() => setEditorOpen(true)}
                    >
                        <Pencil className="h-3 w-3" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-5 w-5 text-muted-foreground hover:text-red-500" onClick={onRemove}>
                        <Trash2 className="h-3 w-3" />
                    </Button>
                </div>
                <button
                    type="button"
                    onClick={() => setEditorOpen(true)}
                    className="mt-1 w-full rounded border border-border/50 bg-card/30 px-2 py-1 text-left font-mono text-[11px] text-muted-foreground hover:bg-muted/30 transition-colors"
                >
                    {preview}
                </button>
            </div>
            <CodeMirrorDialog
                open={editorOpen}
                onOpenChange={setEditorOpen}
                title="JavaScript"
                language="javascript"
                value={node.script}
                onSave={(script) => {
                    onUpdate({ script });
                    setEditorOpen(false);
                }}
            />
        </>
    );
}
