'use client';

import { FileText, Globe, MousePointerClick } from 'lucide-react';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';

export interface RssAuthoringValues {
    allowHtmlDocuments: boolean;
    usePlaywright: boolean;
    entryLinkSelector: string;
}

interface RssAuthoringPanelProps {
    values: RssAuthoringValues;
    onChange: (next: RssAuthoringValues) => void;
    selectorError?: string | null;
}

export function RssAuthoringPanel({ values, onChange, selectorError }: RssAuthoringPanelProps) {
    return (
        <div className="rounded-md border border-border bg-muted/30 p-3 space-y-3">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Nastaveni RSS scraperu
            </p>

            {/* allow_html_documents */}
            <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0">
                    <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <Label htmlFor="rss-allow-html" className="text-sm text-foreground cursor-pointer">
                        Ukladat HTML stranky
                    </Label>
                </div>
                <Switch
                    id="rss-allow-html"
                    checked={values.allowHtmlDocuments}
                    onCheckedChange={(checked) =>
                        onChange({ ...values, allowHtmlDocuments: checked })
                    }
                />
            </div>

            {/* use_playwright */}
            <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0">
                    <Globe className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <Label htmlFor="rss-playwright" className="text-sm text-foreground cursor-pointer">
                        Pouzit Playwright pro renderovani
                    </Label>
                </div>
                <Switch
                    id="rss-playwright"
                    checked={values.usePlaywright}
                    onCheckedChange={(checked) =>
                        onChange({ ...values, usePlaywright: checked })
                    }
                />
            </div>

            {/* entry_link_selector */}
            <div className="space-y-1">
                <div className="flex items-center gap-2">
                    <MousePointerClick className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <Label htmlFor="rss-entry-selector" className="text-sm text-foreground">
                        CSS selektor pro detail stranky
                    </Label>
                </div>
                <Input
                    id="rss-entry-selector"
                    value={values.entryLinkSelector}
                    onChange={(event) =>
                        onChange({ ...values, entryLinkSelector: event.target.value })
                    }
                    placeholder="napr. article a.detail-link"
                    className="text-sm"
                />
                {selectorError && (
                    <p className="text-xs text-destructive">{selectorError}</p>
                )}
                <p className="text-xs text-muted-foreground/70">
                    Volitelne. Pokud je vyplneno, scraper nasleduje odkaz na detail stranku pomoci tohoto selektoru.
                </p>
            </div>
        </div>
    );
}
