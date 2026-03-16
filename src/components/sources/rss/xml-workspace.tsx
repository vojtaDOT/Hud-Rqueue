'use client';

import { xml } from '@codemirror/lang-xml';
import { EditorView } from '@codemirror/view';
import CodeMirror from '@uiw/react-codemirror';
import { AlertCircle, Loader2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

interface XmlWorkspaceProps {
    feedUrl: string;
    className?: string;
}

function formatXml(raw: string): string {
    const INDENT = '  ';
    let formatted = '';
    let indent = 0;
    // Split on tags while keeping them
    const parts = raw.replace(/>\s*</g, '><').split(/(<[^>]+>)/);
    for (const part of parts) {
        const trimmed = part.trim();
        if (!trimmed) continue;
        if (trimmed.startsWith('</')) {
            indent = Math.max(indent - 1, 0);
            formatted += INDENT.repeat(indent) + trimmed + '\n';
        } else if (trimmed.startsWith('<?')) {
            formatted += trimmed + '\n';
        } else if (trimmed.startsWith('<') && trimmed.endsWith('/>')) {
            formatted += INDENT.repeat(indent) + trimmed + '\n';
        } else if (trimmed.startsWith('<') && !trimmed.startsWith('</')) {
            formatted += INDENT.repeat(indent) + trimmed + '\n';
            indent++;
        } else {
            // Text content
            formatted += INDENT.repeat(indent) + trimmed + '\n';
        }
    }
    return formatted.trimEnd();
}

const darkTheme = EditorView.theme({
    '&': {
        backgroundColor: 'oklch(0.16 0.005 260)',
        color: 'oklch(0.9 0 0)',
    },
    '.cm-scroller': {
        overflow: 'auto',
    },
    '.cm-gutters': {
        backgroundColor: 'oklch(0.14 0.004 260)',
        borderRight: '1px solid oklch(1 0 0 / 8%)',
    },
    '.cm-activeLineGutter': {
        backgroundColor: 'oklch(0.2 0.005 260)',
    },
    '.cm-activeLine': {
        backgroundColor: 'oklch(1 0 0 / 4%)',
    },
});

export function XmlWorkspace({ feedUrl, className }: XmlWorkspaceProps) {
    const [xmlContent, setXmlContent] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [height, setHeight] = useState<number>(400);
    const containerRef = useRef<HTMLDivElement>(null);

    // Measure container height with ResizeObserver
    useEffect(() => {
        const node = containerRef.current;
        if (!node) return;
        const ro = new ResizeObserver((entries) => {
            for (const entry of entries) {
                const h = entry.contentRect.height;
                if (h > 0) setHeight(h);
            }
        });
        ro.observe(node);
        return () => ro.disconnect();
    }, []);

    useEffect(() => {
        if (!feedUrl || !/^https?:\/\//.test(feedUrl)) {
            queueMicrotask(() => {
                setXmlContent('');
                setLoading(false);
                setError(null);
            });
            return;
        }

        const controller = new AbortController();
        queueMicrotask(() => {
            if (controller.signal.aborted) return;
            setLoading(true);
            setError(null);
        });

        fetch(`/api/proxy?url=${encodeURIComponent(feedUrl)}`, {
            signal: controller.signal,
        })
            .then(async (res) => {
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                return res.text();
            })
            .then((text) => {
                setXmlContent(formatXml(text));
                setLoading(false);
            })
            .catch((err: unknown) => {
                if (err instanceof Error && err.name === 'AbortError') return;
                setError(err instanceof Error ? err.message : 'Nelze načíst feed');
                setLoading(false);
            });

        return () => {
            controller.abort();
        };
    }, [feedUrl]);

    if (!feedUrl) {
        return (
            <div className={`flex items-center justify-center text-sm text-muted-foreground ${className ?? ''}`}>
                Zadejte URL feedu pro zobrazení XML
            </div>
        );
    }

    if (loading) {
        return (
            <div className={`flex items-center justify-center gap-2 text-sm text-muted-foreground ${className ?? ''}`}>
                <Loader2 className="h-4 w-4 animate-spin" />
                Načítání XML...
            </div>
        );
    }

    if (error) {
        return (
            <div className={`flex items-center justify-center gap-2 text-sm text-red-500 ${className ?? ''}`}>
                <AlertCircle className="h-4 w-4" />
                {error}
            </div>
        );
    }

    return (
        <div ref={containerRef} className={`overflow-hidden ${className ?? ''}`}>
            <CodeMirror
                value={xmlContent}
                extensions={[xml()]}
                theme={darkTheme}
                height={`${height}px`}
                readOnly
                basicSetup={{
                    lineNumbers: true,
                    foldGutter: true,
                    highlightActiveLine: true,
                }}
            />
        </div>
    );
}
