'use client';

import * as React from 'react';
import { Button } from '@/components/ui/button';
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from '@/components/ui/popover';
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
} from '@/components/ui/command';
import { cn } from '@/lib/utils';
import { Check, ChevronsUpDown, Globe, Loader2 } from 'lucide-react';
import { useSources, type Source } from '@/hooks/use-sources';

interface SourceComboboxProps {
    value: string; // sourceId
    onSelect: (source: Source | null) => void;
}

export function SourceCombobox({ value, onSelect }: SourceComboboxProps) {
    const { sources, loading } = useSources();
    const [open, setOpen] = React.useState(false);

    const selected = sources.find((s) => String(s.id) === value);

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={open}
                    className="w-full justify-between h-10 font-normal"
                >
                    {loading ? (
                        <span className="flex items-center gap-2 text-muted-foreground">
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            Loading sources...
                        </span>
                    ) : selected ? (
                        <span className="flex items-center gap-2 truncate">
                            <Globe className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                            <span className="truncate">{selected.name}</span>
                        </span>
                    ) : (
                        <span className="text-muted-foreground">Search sources...</span>
                    )}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                <Command>
                    <CommandInput placeholder="Search by name or URL..." />
                    <CommandList>
                        <CommandEmpty>No sources found.</CommandEmpty>
                        <CommandGroup>
                            {sources.map((source) => (
                                <CommandItem
                                    key={source.id}
                                    value={`${source.name} ${source.base_url}`}
                                    onSelect={() => {
                                        if (String(source.id) === value) {
                                            onSelect(null);
                                        } else {
                                            onSelect(source);
                                        }
                                        setOpen(false);
                                    }}
                                >
                                    <Check
                                        className={cn(
                                            'mr-2 h-4 w-4 shrink-0',
                                            String(source.id) === value ? 'opacity-100' : 'opacity-0'
                                        )}
                                    />
                                    <div className="flex flex-col gap-0.5 min-w-0">
                                        <span className="text-sm font-medium truncate">{source.name}</span>
                                        <span className="text-xs text-muted-foreground truncate font-mono">
                                            {source.base_url}
                                        </span>
                                    </div>
                                </CommandItem>
                            ))}
                        </CommandGroup>
                    </CommandList>
                </Command>
            </PopoverContent>
        </Popover>
    );
}
