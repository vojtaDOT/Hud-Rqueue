'use client';

import { AlertTriangle, CheckCircle2, Rss, Search, Shield } from 'lucide-react';

import type { RssProbeCandidate, RssProbeResult } from '@/lib/source-config';

interface RssProbeResultsPanelProps {
    probeResult: RssProbeResult | null;
    selectedFeedUrl: string;
    onSelectCandidate: (feedUrl: string) => void;
}

const DISCOVERY_METHOD_LABELS: Record<string, string> = {
    direct_feed: 'Primo feed',
    link_alternate: '<link> tag',
    anchor_href: '<a> odkaz',
    common_path: 'Znama cesta',
};

const FEED_TYPE_LABELS: Record<string, string> = {
    rss2: 'RSS 2.0',
    atom: 'Atom',
    rdf: 'RDF',
    unknown: 'Neznamy',
};

function confidenceColor(confidence: number): string {
    if (confidence >= 0.90) return 'text-green-500';
    if (confidence >= 0.70) return 'text-yellow-500';
    return 'text-orange-500';
}

function confidenceBg(confidence: number): string {
    if (confidence >= 0.90) return 'bg-green-500/10 border-green-500/20';
    if (confidence >= 0.70) return 'bg-yellow-500/10 border-yellow-500/20';
    return 'bg-orange-500/10 border-orange-500/20';
}

function CandidateRow({
    candidate,
    isSelected,
    onSelect,
}: {
    candidate: RssProbeCandidate;
    isSelected: boolean;
    onSelect: () => void;
}) {
    const pct = Math.round(candidate.confidence * 100);

    return (
        <button
            type="button"
            onClick={onSelect}
            className={`w-full text-left rounded-md border p-2 transition-colors ${
                isSelected
                    ? 'border-primary/50 bg-primary/5'
                    : 'border-border bg-muted/20 hover:bg-muted/40'
            }`}
        >
            <div className="flex items-center gap-2">
                <Rss className={`h-3.5 w-3.5 shrink-0 ${isSelected ? 'text-primary' : 'text-muted-foreground'}`} />
                <span className="text-sm text-foreground truncate flex-1">
                    {candidate.title || candidate.feed_url}
                </span>
                <span
                    className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-medium ${confidenceBg(candidate.confidence)} ${confidenceColor(candidate.confidence)}`}
                >
                    <Shield className="h-2.5 w-2.5" />
                    {pct}%
                </span>
            </div>
            <div className="mt-1 flex items-center gap-3 text-[11px] text-muted-foreground">
                <span className="truncate">{candidate.feed_url}</span>
            </div>
            <div className="mt-1 flex items-center gap-2 text-[10px] text-muted-foreground/70">
                <span>{FEED_TYPE_LABELS[candidate.feed_type] ?? candidate.feed_type}</span>
                <span>&middot;</span>
                <span>{DISCOVERY_METHOD_LABELS[candidate.discovery_method] ?? candidate.discovery_method}</span>
                {!candidate.same_origin && (
                    <>
                        <span>&middot;</span>
                        <span className="text-yellow-500">cross-origin</span>
                    </>
                )}
            </div>
        </button>
    );
}

export function RssProbeResultsPanel({
    probeResult,
    selectedFeedUrl,
    onSelectCandidate,
}: RssProbeResultsPanelProps) {
    if (!probeResult) return null;

    const { candidates, page_kind, warnings } = probeResult;

    if (candidates.length === 0) {
        return (
            <div className="rounded-md border border-border bg-muted/30 p-3">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Search className="h-3.5 w-3.5" />
                    <span>Zadne RSS/Atom feedy nenalezeny</span>
                </div>
                {page_kind === 'html' && (
                    <p className="mt-1 text-xs text-muted-foreground/70">
                        Stranka je HTML — zkontrolujte, zda obsahuje RSS feed.
                    </p>
                )}
            </div>
        );
    }

    const topConfidence = candidates[0].confidence;
    const autoSelected = topConfidence >= 0.90;

    return (
        <div className="rounded-md border border-border bg-muted/30 p-3 space-y-2">
            <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Detekovane feedy
                </p>
                {autoSelected ? (
                    <span className="flex items-center gap-1 text-[10px] text-green-500">
                        <CheckCircle2 className="h-3 w-3" />
                        Auto-vyber
                    </span>
                ) : (
                    <span className="flex items-center gap-1 text-[10px] text-yellow-500">
                        <AlertTriangle className="h-3 w-3" />
                        Vyzaduje rucni vyber
                    </span>
                )}
            </div>

            <div className="space-y-1.5">
                {candidates.map((candidate) => (
                    <CandidateRow
                        key={candidate.feed_url}
                        candidate={candidate}
                        isSelected={candidate.feed_url === selectedFeedUrl}
                        onSelect={() => onSelectCandidate(candidate.feed_url)}
                    />
                ))}
            </div>

            {warnings.length > 0 && (
                <p className="text-[10px] text-muted-foreground/60">
                    {warnings.length} kandidatu zamitnuto
                </p>
            )}
        </div>
    );
}
