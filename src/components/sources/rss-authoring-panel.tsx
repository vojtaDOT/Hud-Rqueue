'use client';

import { FileText, Globe, Link2, MousePointerClick } from 'lucide-react';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';

export interface RssAuthoringValues {
    singlePage: boolean;
    allowHtmlDocuments: boolean;
    usePlaywright: boolean;
    entryLinkSelector: string;
    documentUrlSelector: string;
    documentUrlExtract: 'href' | 'text';
    filenameSelector: string;
    filenameExtract: 'href' | 'text';
    processingUsePlaywright: boolean;
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

            {/* single_page toggle */}
            <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0">
                    <Link2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <Label htmlFor="rss-single-page" className="text-sm text-foreground cursor-pointer">
                        Primo dokumenty (RSS linky = soubory)
                    </Label>
                </div>
                <Switch
                    id="rss-single-page"
                    checked={values.singlePage}
                    onCheckedChange={(checked) =>
                        onChange({ ...values, singlePage: checked })
                    }
                />
            </div>

            {/* Processing section — shown when singlePage is OFF */}
            {!values.singlePage && (
                <div className="rounded border border-primary/20 bg-primary/5 p-2.5 space-y-2.5">
                    <p className="text-[10px] font-medium text-primary uppercase tracking-wider">
                        Extrakce dokumentu ze stranky
                    </p>

                    {/* document_url_selector + extract type */}
                    <div className="space-y-1">
                        <Label htmlFor="rss-doc-selector" className="text-xs text-foreground">
                            CSS selektor pro dokument URL
                        </Label>
                        <div className="flex gap-2">
                            <Input
                                id="rss-doc-selector"
                                value={values.documentUrlSelector}
                                onChange={(e) => onChange({ ...values, documentUrlSelector: e.target.value })}
                                placeholder='napr. a[href$=".pdf"]'
                                className="text-sm flex-1"
                            />
                            <Select
                                value={values.documentUrlExtract}
                                onValueChange={(v) => onChange({ ...values, documentUrlExtract: v as 'href' | 'text' })}
                            >
                                <SelectTrigger className="w-24 text-xs">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="href">href</SelectItem>
                                    <SelectItem value="text">text</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    {/* filename_selector + extract type */}
                    <div className="space-y-1">
                        <Label htmlFor="rss-filename-selector" className="text-xs text-foreground">
                            CSS selektor pro nazev souboru (volitelne)
                        </Label>
                        <div className="flex gap-2">
                            <Input
                                id="rss-filename-selector"
                                value={values.filenameSelector}
                                onChange={(e) => onChange({ ...values, filenameSelector: e.target.value })}
                                placeholder="napr. span.filename"
                                className="text-sm flex-1"
                            />
                            <Select
                                value={values.filenameExtract}
                                onValueChange={(v) => onChange({ ...values, filenameExtract: v as 'href' | 'text' })}
                            >
                                <SelectTrigger className="w-24 text-xs">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="href">href</SelectItem>
                                    <SelectItem value="text">text</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    {/* processing playwright */}
                    <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2 min-w-0">
                            <Globe className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                            <Label htmlFor="rss-proc-playwright" className="text-xs text-foreground cursor-pointer">
                                Playwright pro source stranku
                            </Label>
                        </div>
                        <Switch
                            id="rss-proc-playwright"
                            checked={values.processingUsePlaywright}
                            onCheckedChange={(checked) =>
                                onChange({ ...values, processingUsePlaywright: checked })
                            }
                        />
                    </div>
                </div>
            )}

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
