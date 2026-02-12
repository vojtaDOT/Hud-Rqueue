'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

export interface Source {
    id: string;
    name: string;
    base_url: string;
    enabled: boolean;
    crawl_strategy: string | null;
    crawl_interval: string | null;
}

export function useSources() {
    const [sources, setSources] = useState<Source[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let mounted = true;

        // Initial fetch
        async function fetchSources() {
            const { data, error } = await supabase
                .from('sources')
                .select('id, name, base_url, enabled, crawl_strategy, crawl_interval')
                .order('name', { ascending: true });

            if (!error && data && mounted) {
                setSources(data);
            }
            if (mounted) setLoading(false);
        }

        fetchSources();

        // Realtime subscription
        const channel = supabase
            .channel('sources-realtime')
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'sources' },
                (payload) => {
                    if (!mounted) return;

                    if (payload.eventType === 'INSERT') {
                        const row = payload.new as Source;
                        setSources((prev) =>
                            [...prev, row].sort((a, b) => a.name.localeCompare(b.name))
                        );
                    } else if (payload.eventType === 'UPDATE') {
                        const row = payload.new as Source;
                        setSources((prev) =>
                            prev.map((s) => (s.id === row.id ? row : s))
                        );
                    } else if (payload.eventType === 'DELETE') {
                        const old = payload.old as { id: string };
                        setSources((prev) => prev.filter((s) => s.id !== old.id));
                    }
                }
            )
            .subscribe();

        return () => {
            mounted = false;
            supabase.removeChannel(channel);
        };
    }, []);

    return { sources, loading };
}
