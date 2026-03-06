'use client';

import { useState } from 'react';
import { ChevronDown, ChevronRight, Code, Workflow } from 'lucide-react';

import { Button } from '@/components/ui/button';

interface RssScraperSummaryPanelProps {
    summary: string;
    crawlParamsPreview: Record<string, unknown> | null;
    extractionDataPreview: Record<string, unknown> | null;
}

export function RssScraperSummaryPanel({
    summary,
    crawlParamsPreview,
    extractionDataPreview,
}: RssScraperSummaryPanelProps) {
    const [showJson, setShowJson] = useState(false);

    if (!summary) return null;

    return (
        <div className="rounded-md border border-border bg-muted/30 p-3 space-y-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Jak se bude scraper chovat
            </p>

            {/* Human-readable pipeline summary */}
            <div className="flex items-start gap-2">
                <Workflow className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                <p className="text-sm text-foreground leading-relaxed">{summary}</p>
            </div>

            {/* JSON preview toggle */}
            {(crawlParamsPreview || extractionDataPreview) && (
                <div>
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-6 px-1.5 text-xs text-muted-foreground hover:text-foreground"
                        onClick={() => setShowJson((prev) => !prev)}
                    >
                        {showJson ? (
                            <ChevronDown className="mr-1 h-3 w-3" />
                        ) : (
                            <ChevronRight className="mr-1 h-3 w-3" />
                        )}
                        <Code className="mr-1 h-3 w-3" />
                        JSON nahled
                    </Button>

                    {showJson && (
                        <div className="mt-1.5 space-y-2">
                            {crawlParamsPreview && (
                                <div>
                                    <p className="mb-1 text-[10px] font-medium text-muted-foreground uppercase">
                                        crawl_params
                                    </p>
                                    <pre className="overflow-x-auto rounded border border-border bg-background p-2 text-[11px] text-muted-foreground leading-relaxed">
                                        {JSON.stringify(crawlParamsPreview, null, 2)}
                                    </pre>
                                </div>
                            )}
                            {extractionDataPreview && (
                                <div>
                                    <p className="mb-1 text-[10px] font-medium text-muted-foreground uppercase">
                                        extraction_data
                                    </p>
                                    <pre className="overflow-x-auto rounded border border-border bg-background p-2 text-[11px] text-muted-foreground leading-relaxed">
                                        {JSON.stringify(extractionDataPreview, null, 2)}
                                    </pre>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
