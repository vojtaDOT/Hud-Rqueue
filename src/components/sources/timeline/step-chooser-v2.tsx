'use client';

import {
    ArrowRight,
    Code,
    Clock,
    Database,
    FileDown,
    Layers,
    Link,
    MousePointerClick,
    Plus,
    Repeat,
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

const STEP_GROUPS: StepGroup[] = [
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
            { type: 'source_url', label: 'Source URL', icon: <Link className="h-3.5 w-3.5 text-primary" /> },
            { type: 'document_url', label: 'Document URL', icon: <FileDown className="h-3.5 w-3.5 text-primary" /> },
            { type: 'pagination', label: 'Pagination', icon: <ArrowRight className="h-3.5 w-3.5 text-red-500" /> },
        ],
    },
    {
        label: 'Data',
        items: [
            { type: 'data_extract', label: 'Data Extract', icon: <Database className="h-3.5 w-3.5 text-green-500" /> },
        ],
    },
    {
        label: 'Akce',
        items: [
            { type: 'click', label: 'Click', icon: <MousePointerClick className="h-3.5 w-3.5 text-primary" /> },
            { type: 'timeout', label: 'Timeout', icon: <Clock className="h-3.5 w-3.5 text-primary" /> },
            { type: 'javascript', label: 'JavaScript', icon: <Code className="h-3.5 w-3.5 text-primary" /> },
        ],
    },
];

interface StepChooserV2Props {
    onSelect: (type: TimelineNodeType) => void;
}

export function StepChooserV2({ onSelect }: StepChooserV2Props) {
    return (
        <Popover>
            <PopoverTrigger asChild>
                <Button variant="ghost" size="sm" className="h-6 gap-1 text-xs text-muted-foreground">
                    <Plus className="h-3 w-3" />
                    Přidat krok
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-48 p-1" align="start">
                {STEP_GROUPS.map((group, gi) => (
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
