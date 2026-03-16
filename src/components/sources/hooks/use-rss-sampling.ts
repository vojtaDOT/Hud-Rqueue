'use client';

import { useCallback, useState } from 'react';
import { toast } from 'sonner';

import type { RssSampleResult } from '@/lib/source-config';

export function useRssSampling() {
    const [sampling, setSampling] = useState(false);
    const [sampleResult, setSampleResult] = useState<RssSampleResult | null>(null);
    const [sampleError, setSampleError] = useState<string | null>(null);

    const runSampling = useCallback(async (feedUrl: string) => {
        if (!feedUrl || !/^https?:\/\//.test(feedUrl)) {
            toast.error('Neni vybran platny RSS feed');
            return;
        }

        setSampling(true);
        setSampleError(null);
        setSampleResult(null);

        try {
            const response = await fetch('/api/sources/rss-sample', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ feedUrl, sampleSize: 3 }),
            });

            if (!response.ok) {
                const data = await response.json().catch(() => ({}));
                throw new Error((data as { error?: string }).error || `HTTP ${response.status}`);
            }

            const result: RssSampleResult = await response.json();
            setSampleResult(result);

            if (result.totalDocuments > 0) {
                toast.success(
                    `Nalezeno ${result.totalDocuments} dokumentu na ${result.samples.filter((s) => s.documents.length > 0).length} strankach`,
                );
            } else {
                toast.info('Na samplovanych strankach nebyly nalezeny dokumenty');
            }
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Analyza polozek selhala';
            setSampleError(message);
            toast.error(message);
        } finally {
            setSampling(false);
        }
    }, []);

    const clearSampling = useCallback(() => {
        setSampleResult(null);
        setSampleError(null);
    }, []);

    return {
        sampling,
        sampleResult,
        sampleError,
        runSampling,
        clearSampling,
    };
}
