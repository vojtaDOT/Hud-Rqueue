'use client';

import { xml } from '@codemirror/lang-xml';
import { EditorView } from '@codemirror/view';
import CodeMirror from '@uiw/react-codemirror';
import { AlertCircle, Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';

interface XmlWorkspaceProps {
    feedUrl: string;
    className?: string;
}

const darkTheme = EditorView.theme({
    '&': {
        backgroundColor: 'oklch(0.16 0.005 260)',
        color: 'oklch(0.9 0 0)',
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

    useEffect(() => {
        if (!feedUrl || !/^https?:\/\//.test(feedUrl)) {
            setXmlContent('');
            setError(null);
            return;
        }

        const controller = new AbortController();
        setLoading(true);
        setError(null);

        fetch(`/api/proxy?url=${encodeURIComponent(feedUrl)}`, {
            signal: controller.signal,
        })
            .then(async (res) => {
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                return res.text();
            })
            .then((text) => {
                setXmlContent(text);
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
        <div className={`overflow-hidden ${className ?? ''}`}>
            <CodeMirror
                value={xmlContent}
                extensions={[xml()]}
                theme={darkTheme}
                height="100%"
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
