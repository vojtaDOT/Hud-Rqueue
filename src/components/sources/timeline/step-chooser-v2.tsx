'use client';

import {
    ArrowRight,
    Camera,
    Code,
    Clock,
    Database,
    FileDown,
    Download,
    Eraser,
    Globe,
    Layers,
    List,
    Link,
    MousePointerClick,
    Pencil,
    Plus,
    Repeat,
    Search,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from '@/components/ui/popover';
import type { TimelineNodeType } from '@/lib/crawler-types';

interface StepGroup {
    label: string;
    items: { type: TimelineNodeType; label: string; icon: React.ReactNode }[];
}

const ROOT_STEP_GROUPS: StepGroup[] = [
    {
        label: 'Before',
        items: [
            { type: 'remove_element', label: 'Remove Element', icon: <Eraser className="h-3.5 w-3.5 text-primary" /> },
            { type: 'timeout', label: 'Wait Timeout', icon: <Clock className="h-3.5 w-3.5 text-primary" /> },
            { type: 'wait_selector', label: 'Wait Selector', icon: <Search className="h-3.5 w-3.5 text-primary" /> },
            { type: 'wait_network', label: 'Wait Network', icon: <Globe className="h-3.5 w-3.5 text-primary" /> },
            { type: 'click', label: 'Click', icon: <MousePointerClick className="h-3.5 w-3.5 text-primary" /> },
            { type: 'scroll', label: 'Scroll', icon: <ArrowRight className="h-3.5 w-3.5 text-primary" /> },
            { type: 'fill', label: 'Fill', icon: <Pencil className="h-3.5 w-3.5 text-primary" /> },
            { type: 'select_option', label: 'Select Option', icon: <List className="h-3.5 w-3.5 text-primary" /> },
            { type: 'javascript', label: 'Evaluate', icon: <Code className="h-3.5 w-3.5 text-primary" /> },
            { type: 'screenshot', label: 'Screenshot', icon: <Camera className="h-3.5 w-3.5 text-primary" /> },
        ],
    },
    {
        label: 'Struktura',
        items: [
            { type: 'scope', label: 'Scope', icon: <Layers className="h-3.5 w-3.5 text-primary" /> },
        ],
    },
];

const SCOPE_STEP_GROUPS: StepGroup[] = [
    {
        label: 'Struktura',
        items: [
            { type: 'scope', label: 'Scope', icon: <Layers className="h-3.5 w-3.5 text-primary" /> },
            { type: 'repeater', label: 'Repeater', icon: <Repeat className="h-3.5 w-3.5 text-amber-500" /> },
        ],
    },
    {
        label: 'Navigace',
        items: [
            { type: 'pagination', label: 'Pagination', icon: <ArrowRight className="h-3.5 w-3.5 text-red-500" /> },
        ],
    },
];

const REPEATER_STEP_GROUPS: StepGroup[] = [
    {
        label: 'Navigace',
        items: [
            { type: 'source_url', label: 'Source URL', icon: <Link className="h-3.5 w-3.5 text-primary" /> },
            { type: 'document_url', label: 'Document URL', icon: <FileDown className="h-3.5 w-3.5 text-primary" /> },
            { type: 'download_file', label: 'Download File', icon: <Download className="h-3.5 w-3.5 text-primary" /> },
        ],
    },
    {
        label: 'Data',
        items: [
            { type: 'data_extract', label: 'Data Extract', icon: <Database className="h-3.5 w-3.5 text-green-500" /> },
        ],
    },
];

interface StepChooserV2Props {
    mode?: 'root' | 'scope' | 'repeater';
    onSelect: (type: TimelineNodeType) => void;
}

export function StepChooserV2({ mode = 'root', onSelect }: StepChooserV2Props) {
    const groups = mode === 'scope'
        ? SCOPE_STEP_GROUPS
        : mode === 'repeater'
            ? REPEATER_STEP_GROUPS
            : ROOT_STEP_GROUPS;

    return (
        <Popover>
            <PopoverTrigger asChild>
                <Button variant="ghost" size="sm" className="h-6 gap-1 text-xs text-muted-foreground">
                    <Plus className="h-3 w-3" />
                    Přidat krok
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-48 p-1" align="start">
                {groups.map((group, gi) => (
                    <div key={group.label}>
                        {gi > 0 && <div className="my-1 h-px bg-border" />}
                        <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                            {group.label}
                        </div>
                        {group.items.map((item) => (
                            <button
                                key={item.type}
                                type="button"
                                className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-xs hover:bg-muted/50 transition-colors"
                                onClick={() => onSelect(item.type)}
                            >
                                {item.icon}
                                {item.label}
                            </button>
                        ))}
                    </div>
                ))}
            </PopoverContent>
        </Popover>
    );
}
