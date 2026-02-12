'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

export interface SourceUrl {
    id: string;
    source_id: string;
    url: string;
    label: string | null;
    enabled: boolean;
}

export function useSourceUrls() {
    const [sourceUrls, setSourceUrls] = useState<SourceUrl[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let mounted = true;

        async function fetch() {
            const { data, error } = await supabase
                .from('source_urls')
                .select('id, source_id, url, label, enabled')
                .order('url', { ascending: true });

            if (!error && data && mounted) setSourceUrls(data);
            if (mounted) setLoading(false);
        }

        fetch();

        const channel = supabase
            .channel('source-urls-realtime')
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'source_urls' },
                (payload) => {
                    if (!mounted) return;
                    if (payload.eventType === 'INSERT') {
                        setSourceUrls((prev) => [...prev, payload.new as SourceUrl].sort((a, b) => a.url.localeCompare(b.url)));
                    } else if (payload.eventType === 'UPDATE') {
                        const row = payload.new as SourceUrl;
                        setSourceUrls((prev) => prev.map((s) => (s.id === row.id ? row : s)));
                    } else if (payload.eventType === 'DELETE') {
                        const old = payload.old as { id: string };
                        setSourceUrls((prev) => prev.filter((s) => s.id !== old.id));
                    }
                }
            )
            .subscribe();

        return () => {
            mounted = false;
            supabase.removeChannel(channel);
        };
    }, []);

    return { sourceUrls, loading };
}
