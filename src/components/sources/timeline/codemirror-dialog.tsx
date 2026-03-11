'use client';

import { javascript } from '@codemirror/lang-javascript';
import { xml } from '@codemirror/lang-xml';
import { EditorView } from '@codemirror/view';
import CodeMirror from '@uiw/react-codemirror';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';

interface CodeMirrorDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    title: string;
    language: 'javascript' | 'xml';
    value: string;
    onSave: (value: string) => void;
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

export function CodeMirrorDialog({ open, onOpenChange, title, language, value, onSave }: CodeMirrorDialogProps) {
    const [draft, setDraft] = useState(value);

    // Reset draft when dialog opens
    const handleOpenChange = (nextOpen: boolean) => {
        if (nextOpen) setDraft(value);
        onOpenChange(nextOpen);
    };

    const extensions = language === 'xml' ? [xml()] : [javascript()];

    return (
        <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogContent className="max-w-2xl">
                <DialogHeader>
                    <DialogTitle>{title}</DialogTitle>
                </DialogHeader>
                <div className="rounded-md border border-border overflow-hidden">
                    <CodeMirror
                        value={draft}
                        onChange={setDraft}
                        extensions={extensions}
                        theme={darkTheme}
                        height="320px"
                        basicSetup={{
                            lineNumbers: true,
                            foldGutter: true,
                            bracketMatching: true,
                            closeBrackets: true,
                            autocompletion: true,
                            highlightActiveLine: true,
                        }}
                    />
                </div>
                <DialogFooter>
                    <Button variant="ghost" onClick={() => onOpenChange(false)}>
                        Zrušit
                    </Button>
                    <Button onClick={() => onSave(draft)}>
                        Uložit
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
