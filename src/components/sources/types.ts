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

export type RssWarningReason = 'http_error' | 'not_feed' | 'network_error' | 'timeout';

export interface RssDetectionWarning {
    url: string;
    status: number | null;
    reason: RssWarningReason;
}
