'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

export interface Document {
    id: string;
    source_url_id: string;
    url: string;
    filename: string | null;
    created_at: string;
}

export function useDocuments() {
    const [documents, setDocuments] = useState<Document[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let mounted = true;

        async function fetch() {
            const { data, error } = await supabase
                .from('documents')
                .select('id, source_url_id, url, filename, created_at')
                .is('deleted_at', null)
                .order('created_at', { ascending: false })
                .limit(5000);

            if (!error && data && mounted) setDocuments(data);
            if (mounted) setLoading(false);
        }

        fetch();

        const channel = supabase
            .channel('documents-realtime')
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'documents' },
                (payload) => {
                    if (!mounted) return;
                    if (payload.eventType === 'INSERT') {
                        setDocuments((prev) => [payload.new as Document, ...prev]);
                    } else if (payload.eventType === 'UPDATE') {
                        const row = payload.new as Document;
                        setDocuments((prev) => prev.map((d) => (d.id === row.id ? row : d)));
                    } else if (payload.eventType === 'DELETE') {
                        const old = payload.old as { id: string };
                        setDocuments((prev) => prev.filter((d) => d.id !== old.id));
                    }
                }
            )
            .subscribe();

        return () => {
            mounted = false;
            supabase.removeChannel(channel);
        };
    }, []);

    return { documents, loading };
}
