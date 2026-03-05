'use client';

import { useCallback, useState } from 'react';
import { toast } from 'sonner';

import type { CrawlStrategy, RssDetectionWarning, RssWarningReason } from '@/components/sources/types';

export type RssDetectionStatus =
    | { type: 'idle' }
    | { type: 'detecting' }
    | { type: 'success'; feedCount: number }
    | { type: 'no_feeds' }
    | { type: 'error'; message: string };

interface UseRssDetectionOptions {
    baseUrl: string;
    setBaseUrl: (url: string) => void;
    setCrawlStrategy: (strategy: CrawlStrategy) => void;
    setPlaywrightEnabled: (enabled: boolean) => void;
}

interface RssDetectionResult {
    feedUrls: string[];
    warnings: RssDetectionWarning[];
}

async function fetchAndParseRssFeeds(url: string): Promise<RssDetectionResult> {
    const response = await fetch(`/api/sources/rss-detect?url=${encodeURIComponent(url)}`);
    const data = await response.json();

    if (!response.ok) {
        throw new Error(data.error || 'Detekce RSS selhala');
    }

    const feedUrls: string[] = Array.isArray(data.feed_urls)
        ? data.feed_urls.filter((item: unknown): item is string => typeof item === 'string')
        : [];

    const warnings: RssDetectionWarning[] = Array.isArray(data.warnings)
        ? data.warnings.filter((item: unknown): item is RssDetectionWarning => (
            typeof item === 'object'
            && item !== null
            && typeof (item as { url?: unknown }).url === 'string'
            && (
                (item as { reason?: unknown }).reason === 'http_error'
                || (item as { reason?: unknown }).reason === 'not_feed'
                || (item as { reason?: unknown }).reason === 'network_error'
                || (item as { reason?: unknown }).reason === 'timeout'
            )
        ))
        : [];

    return { feedUrls, warnings };
}

export function useRssDetection({
    baseUrl,
    setBaseUrl,
    setCrawlStrategy,
    setPlaywrightEnabled,
}: UseRssDetectionOptions) {
    const [detectingRss, setDetectingRss] = useState(false);
    const [rssFeedOptions, setRssFeedOptions] = useState<string[]>([]);
    const [selectedRssFeed, setSelectedRssFeed] = useState('');
    const [rssWarnings, setRssWarnings] = useState<RssDetectionWarning[]>([]);
    const [detectionStatus, setDetectionStatus] = useState<RssDetectionStatus>({ type: 'idle' });

    const clearRssFeeds = useCallback(() => {
        setRssFeedOptions([]);
        setSelectedRssFeed('');
        setRssWarnings([]);
        setDetectionStatus({ type: 'idle' });
    }, []);

    const detectRssFeeds = useCallback(async () => {
        if (!/^https?:\/\//.test(baseUrl)) {
            toast.error('Zadejte platnou URL zacinajici na http:// nebo https://');
            return;
        }

        setDetectingRss(true);
        setDetectionStatus({ type: 'detecting' });
        try {
            const { feedUrls, warnings } = await fetchAndParseRssFeeds(baseUrl);

            if (feedUrls.length < 1) {
                clearRssFeeds();
                setDetectionStatus({ type: 'no_feeds' });
                toast.info('RSS/Atom feed nebyl nalezen nebo dostupny.');
                return;
            }

            setRssFeedOptions(feedUrls);
            setSelectedRssFeed(feedUrls[0]);
            setRssWarnings(warnings);
            setDetectionStatus({ type: 'success', feedCount: feedUrls.length });
            toast.success(`Nalezen RSS/Atom feed (${feedUrls.length})`);

            if (warnings.length > 0) {
                const reasonCounts = warnings.reduce<Record<RssWarningReason, number>>((acc, warning) => {
                    acc[warning.reason] += 1;
                    return acc;
                }, {
                    http_error: 0,
                    not_feed: 0,
                    network_error: 0,
                    timeout: 0,
                });

                const statusCounts = warnings.reduce<Record<string, number>>((acc, warning) => {
                    if (warning.reason !== 'http_error' || warning.status === null) {
                        return acc;
                    }
                    const key = String(warning.status);
                    acc[key] = (acc[key] ?? 0) + 1;
                    return acc;
                }, {});
                const statusSummary = Object.entries(statusCounts)
                    .sort(([a], [b]) => Number(a) - Number(b))
                    .map(([status, count]) => (count > 1 ? `${status}x${count}` : status))
                    .join('/');

                const summaryParts = [
                    statusSummary || null,
                    reasonCounts.timeout ? 'timeout' : null,
                    reasonCounts.network_error ? 'sit' : null,
                    reasonCounts.not_feed ? 'neni feed' : null,
                ].filter((part): part is string => Boolean(part));

                toast.warning(
                    `${warnings.length} kandidatu zamitnuto${summaryParts.length > 0 ? ` (${summaryParts.join(', ')})` : ''}`,
                );
            }
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Nepodarilo se detekovat RSS feed';
            setDetectionStatus({ type: 'error', message });
            toast.error(message);
        } finally {
            setDetectingRss(false);
        }
    }, [baseUrl, clearRssFeeds]);

    const autoDetectOnUrl = useCallback(async (url: string) => {
        if (!/^https?:\/\//.test(url)) {
            return;
        }

        setDetectingRss(true);
        setDetectionStatus({ type: 'detecting' });
        try {
            const { feedUrls, warnings } = await fetchAndParseRssFeeds(url);

            if (feedUrls.length === 1) {
                setBaseUrl(feedUrls[0]);
                setCrawlStrategy('rss');
                setPlaywrightEnabled(false);
                setRssFeedOptions(feedUrls);
                setSelectedRssFeed(feedUrls[0]);
                setRssWarnings(warnings);
                setDetectionStatus({ type: 'success', feedCount: feedUrls.length });
                toast.success('RSS feed detekovan a aplikovan.');
            } else if (feedUrls.length > 1) {
                setRssFeedOptions(feedUrls);
                setSelectedRssFeed(feedUrls[0]);
                setRssWarnings(warnings);
                setDetectionStatus({ type: 'success', feedCount: feedUrls.length });
                toast.success(`Nalezeno ${feedUrls.length} RSS feedu — vyberte feed.`);
            } else {
                // No feeds: stay silent
                setDetectionStatus({ type: 'idle' });
            }
        } catch {
            // Silent on error
            setDetectionStatus({ type: 'idle' });
        } finally {
            setDetectingRss(false);
        }
    }, [setBaseUrl, setCrawlStrategy, setPlaywrightEnabled]);

    const applySelectedRssFeed = useCallback(() => {
        if (!selectedRssFeed) {
            toast.info('Nejprve vyberte RSS/Atom feed.');
            return;
        }
        setBaseUrl(selectedRssFeed);
        setCrawlStrategy('rss');
        setPlaywrightEnabled(false);
        toast.success('Vybrany feed byl pouzit jako Base URL.');
    }, [selectedRssFeed, setBaseUrl, setCrawlStrategy, setPlaywrightEnabled]);

    return {
        detectingRss,
        detectionStatus,
        rssFeedOptions,
        selectedRssFeed,
        rssWarnings,
        setSelectedRssFeed,
        detectRssFeeds,
        autoDetectOnUrl,
        applySelectedRssFeed,
        clearRssFeeds,
    };
}
