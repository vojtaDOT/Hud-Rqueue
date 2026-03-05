export interface SourceType {
    id: number;
    name: string;
}

export interface Obec {
    id: string;
    kod: string;
    nazev: string;
    okres_id: string;
    okres_nazev: string;
    kraj_id: string;
    kraj_nazev: string;
}

export type CrawlStrategy = 'list' | 'rss';

import type { RssWarningReason } from '@/lib/source-config';
export type { RssWarningReason } from '@/lib/source-config';

export interface RssDetectionWarning {
    url: string;
    status: number | null;
    reason: RssWarningReason;
}
