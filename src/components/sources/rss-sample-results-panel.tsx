'use client';

import { AlertCircle, CheckCircle2, ExternalLink, FileText, Loader2, Search } from 'lucide-react';

import { Button } from '@/components/ui/button';
import type { RssSampleResult } from '@/lib/source-config';

interface RssSampleResultsPanelProps {
    sampling: boolean;
    sampleResult: RssSampleResult | null;
    sampleError: string | null;
    onRunSampling: () => void;
    onApplySelector: (selector: string) => void;
    disabled?: boolean;
}

export function RssSampleResultsPanel({
    sampling,
    sampleResult,
    sampleError,
    onRunSampling,
    onApplySelector,
    disabled,
}: RssSampleResultsPanelProps) {
    return (
        <div className="rounded-md border border-border bg-muted/30 p-3 space-y-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Analyza polozek
            </p>

            <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-full justify-center gap-1.5"
                onClick={onRunSampling}
                disabled={disabled || sampling}
            >
                {sampling ? (
                    <>
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        Analyzuji polozky...
                    </>
                ) : (
                    <>
                        <Search className="h-3.5 w-3.5" />
                        Analyzovat polozky
                    </>
                )}
            </Button>

            {sampleError && (
                <div className="flex items-center gap-1.5 text-xs text-destructive">
                    <AlertCircle className="h-3 w-3 shrink-0" />
                    {sampleError}
                </div>
            )}

            {sampleResult && (
                <div className="space-y-2">
                    {/* Summary */}
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <FileText className="h-3 w-3 shrink-0" />
                        <span>
                            {sampleResult.totalDocuments > 0
                                ? `${sampleResult.totalDocuments} dokumentu na ${sampleResult.samples.filter((s) => s.documents.length > 0).length}/${sampleResult.samples.length} strankach`
                                : 'Zadne dokumenty nenalezeny'}
                        </span>
                    </div>

                    {/* Sample cards */}
                    {sampleResult.samples.map((sample, idx) => (
                        <div
                            key={`${sample.entryUrl}-${idx}`}
                            className="rounded border border-border bg-muted/20 p-2 space-y-1"
                        >
                            <div className="flex items-center gap-1.5 min-w-0">
                                {sample.documents.length > 0 ? (
                                    <CheckCircle2 className="h-3 w-3 shrink-0 text-green-500" />
                                ) : (
                                    <AlertCircle className="h-3 w-3 shrink-0 text-muted-foreground/50" />
                                )}
                                <span className="text-xs text-foreground truncate">
                                    {sample.entryTitle || 'Bez nazvu'}
                                </span>
                            </div>
                            {sample.entryUrl && (
                                <div className="text-[10px] text-muted-foreground/70 truncate">
                                    {sample.entryUrl}
                                </div>
                            )}
                            {sample.error && (
                                <div className="text-[10px] text-destructive">{sample.error}</div>
                            )}
                            {sample.documents.length > 0 && (
                                <div className="space-y-0.5 ml-4">
                                    {sample.documents.map((doc, docIdx) => (
                                        <div
                                            key={`${doc.url}-${docIdx}`}
                                            className="flex items-center gap-1.5 text-[10px] text-muted-foreground"
                                        >
                                            <ExternalLink className="h-2.5 w-2.5 shrink-0" />
                                            <span className="truncate">{doc.text || doc.url.split('/').pop()}</span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    ))}

                    {/* Suggested selector */}
                    {sampleResult.suggestedSelector && (
                        <div className="rounded border border-primary/30 bg-primary/5 p-2 space-y-1.5">
                            <p className="text-[10px] font-medium text-primary uppercase tracking-wider">
                                Navrzeny selektor
                            </p>
                            <code className="block text-xs text-foreground bg-muted/50 rounded px-2 py-1 font-mono">
                                {sampleResult.suggestedSelector}
                            </code>
                            <Button
                                type="button"
                                size="sm"
                                className="w-full"
                                onClick={() => onApplySelector(sampleResult.suggestedSelector!)}
                            >
                                Pouzit selektor
                            </Button>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
