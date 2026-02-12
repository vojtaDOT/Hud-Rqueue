'use client';

import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { cn } from '@/lib/utils';
import { Check, ChevronsUpDown, FileText, Loader2 } from 'lucide-react';
import { useDocuments, type Document } from '@/hooks/use-documents';

interface DocumentComboboxProps {
    value: string;
    onSelect: (item: Document | null) => void;
}

export function DocumentCombobox({ value, onSelect }: DocumentComboboxProps) {
    const { documents, loading } = useDocuments();
    const [open, setOpen] = React.useState(false);

    const selected = documents.find((d) => String(d.id) === value);

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
                            <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                            <span className="truncate">{selected.filename || selected.url}</span>
                        </span>
                    ) : (
                        <span className="text-muted-foreground">Search documents...</span>
                    )}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                <Command>
                    <CommandInput placeholder="Search by filename or URL..." />
                    <CommandList>
                        <CommandEmpty>No documents found.</CommandEmpty>
                        <CommandGroup>
                            {documents.map((doc) => (
                                <CommandItem
                                    key={doc.id}
                                    value={`${doc.filename || ''} ${doc.url}`}
                                    onSelect={() => {
                                        onSelect(String(doc.id) === value ? null : doc);
                                        setOpen(false);
                                    }}
                                >
                                    <Check className={cn('mr-2 h-4 w-4 shrink-0', String(doc.id) === value ? 'opacity-100' : 'opacity-0')} />
                                    <div className="flex flex-col gap-0.5 min-w-0">
                                        {doc.filename && <span className="text-sm font-medium truncate">{doc.filename}</span>}
                                        <span className="text-xs text-muted-foreground truncate font-mono">{doc.url}</span>
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
