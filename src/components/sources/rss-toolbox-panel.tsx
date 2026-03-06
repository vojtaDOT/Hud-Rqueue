'use client';

import { Loader2, Rss } from 'lucide-react';

import { RssAuthoringPanel, type RssAuthoringValues } from '@/components/sources/rss-authoring-panel';
import { RssDetectionPanel } from '@/components/sources/rss-detection-panel';
import type { RssDetectionStatus } from '@/components/sources/hooks/use-rss-detection';
import { RssPreviewPanel, type FeedPreview } from '@/components/sources/rss-preview-panel';
import { RssProbeResultsPanel } from '@/components/sources/rss-probe-results-panel';
import { RssScraperSummaryPanel } from '@/components/sources/rss-scraper-summary-panel';
import { Button } from '@/components/ui/button';
import type { RssProbeResult } from '@/lib/source-config';

interface RssToolboxPanelProps {
    // Detection
    baseUrl: string;
    detectingRss: boolean;
    detectionStatus: RssDetectionStatus;
    onDetectRssFeeds: () => void;

    // Feed selection
    rssFeedOptions: string[];
    selectedRssFeed: string;
    onSelectedRssFeedChange: (value: string) => void;
    onApplySelectedRssFeed: () => void;

    // Probe results
    probeResult: RssProbeResult | null;
    onSelectCandidate: (feedUrl: string) => void;

    // Preview
    rssPreview: FeedPreview | null;
    rssPreviewLoading: boolean;
    rssPreviewError: string | null;

    // Authoring
    rssAuthoring: RssAuthoringValues;
    onRssAuthoringChange: (values: RssAuthoringValues) => void;
    selectorError: string | null;

    // Summary
    rssSummary: string;
    crawlParamsPreview: Record<string, unknown> | null;
    extractionDataPreview: Record<string, unknown> | null;
}

export function RssToolboxPanel({
    baseUrl,
    detectingRss,
    detectionStatus,
    onDetectRssFeeds,
    rssFeedOptions,
    selectedRssFeed,
    onSelectedRssFeedChange,
    onApplySelectedRssFeed,
    probeResult,
    onSelectCandidate,
    rssPreview,
    rssPreviewLoading,
    rssPreviewError,
    rssAuthoring,
    onRssAuthoringChange,
    selectorError,
    rssSummary,
    crawlParamsPreview,
    extractionDataPreview,
}: RssToolboxPanelProps) {
    const hasValidUrl = /^https?:\/\//.test(baseUrl);

    return (
        <div className="flex h-full flex-col overflow-y-auto">
            <div className="space-y-3 p-3">
                {/* 1. Detect button */}
                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="w-full justify-center gap-1.5"
                    onClick={onDetectRssFeeds}
                    disabled={detectingRss || !hasValidUrl}
                >
                    {detectingRss ? (
                        <>
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            Hledam RSS...
                        </>
                    ) : (
                        <>
                            <Rss className="h-3.5 w-3.5" />
                            Detekovat RSS
                        </>
                    )}
                </Button>

                {/* 2. Detection status */}
                <DetectionStatusIndicator status={detectionStatus} />

                {/* 3. Probe results — candidate cards with confidence */}
                {probeResult && (
                    <RssProbeResultsPanel
                        probeResult={probeResult}
                        selectedFeedUrl={selectedRssFeed}
                        onSelectCandidate={onSelectCandidate}
                    />
                )}

                {/* 4. Feed selector dropdown */}
                <RssDetectionPanel
                    rssFeedOptions={rssFeedOptions}
                    selectedRssFeed={selectedRssFeed}
                    onSelectedRssFeedChange={onSelectedRssFeedChange}
                    onApplySelectedRssFeed={onApplySelectedRssFeed}
                />

                {/* 5. Feed preview */}
                <RssPreviewPanel
                    preview={rssPreview}
                    loading={rssPreviewLoading}
                    error={rssPreviewError}
                />

                {/* 6. Authoring panel — switches + CSS selector */}
                <RssAuthoringPanel
                    values={rssAuthoring}
                    onChange={onRssAuthoringChange}
                    selectorError={selectorError}
                />

                {/* 7. Scraper summary */}
                {rssSummary && (
                    <RssScraperSummaryPanel
                        summary={rssSummary}
                        crawlParamsPreview={crawlParamsPreview}
                        extractionDataPreview={extractionDataPreview}
                    />
                )}

                {/* Empty state when no URL entered */}
                {!hasValidUrl && detectionStatus.type === 'idle' && (
                    <div className="rounded-md border border-dashed border-border p-4 text-center">
                        <Rss className="mx-auto mb-2 h-5 w-5 text-muted-foreground/50" />
                        <p className="text-xs text-muted-foreground">
                            Zadejte URL ve formulari a kliknete na Detekovat RSS
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
}

function DetectionStatusIndicator({ status }: { status: RssDetectionStatus }) {
    if (status.type === 'idle' || status.type === 'detecting') return null;

    const variants: Record<string, { className: string; text: string }> = {
        success: {
            className: 'text-green-500',
            text: `Nalezeno ${(status as { feedCount: number }).feedCount} feedu`,
        },
        no_feeds: {
            className: 'text-muted-foreground',
            text: 'Zadne RSS/Atom feedy nenalezeny',
        },
        error: {
            className: 'text-destructive',
            text: (status as { message: string }).message,
        },
    };

    const variant = variants[status.type];
    if (!variant) return null;

    return (
        <div className={`flex items-center gap-1.5 text-xs ${variant.className}`}>
            <span className="h-1.5 w-1.5 rounded-full bg-current" />
            {variant.text}
        </div>
    );
}
