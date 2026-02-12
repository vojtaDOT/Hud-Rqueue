'use client';

import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { cn } from '@/lib/utils';
import { Check, ChevronsUpDown, Link, Loader2 } from 'lucide-react';
import { useSourceUrls, type SourceUrl } from '@/hooks/use-source-urls';

interface SourceUrlComboboxProps {
    value: string;
    onSelect: (item: SourceUrl | null) => void;
}

export function SourceUrlCombobox({ value, onSelect }: SourceUrlComboboxProps) {
    const { sourceUrls, loading } = useSourceUrls();
    const [open, setOpen] = React.useState(false);

    const selected = sourceUrls.find((s) => String(s.id) === value);

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button variant="outline" role="combobox" aria-expanded={open} className="w-full justify-between h-10 font-normal">
                    {loading ? (
                        <span className="flex items-center gap-2 text-muted-foreground">
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            Loading...
                        </span>
                    ) : selected ? (
                        <span className="flex items-center gap-2 truncate">
                            <Link className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                            <span className="truncate">{selected.label || selected.url}</span>
                        </span>
                    ) : (
                        <span className="text-muted-foreground">Search source URLs...</span>
                    )}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                <Command>
                    <CommandInput placeholder="Search by URL or label..." />
                    <CommandList>
                        <CommandEmpty>No source URLs found.</CommandEmpty>
                        <CommandGroup>
                            {sourceUrls.map((item) => (
                                <CommandItem
                                    key={item.id}
                                    value={`${item.label || ''} ${item.url}`}
                                    onSelect={() => {
                                        onSelect(String(item.id) === value ? null : item);
                                        setOpen(false);
                                    }}
                                >
                                    <Check className={cn('mr-2 h-4 w-4 shrink-0', String(item.id) === value ? 'opacity-100' : 'opacity-0')} />
                                    <div className="flex flex-col gap-0.5 min-w-0">
                                        {item.label && <span className="text-sm font-medium truncate">{item.label}</span>}
                                        <span className="text-xs text-muted-foreground truncate font-mono">{item.url}</span>
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
