export interface LegacyBlockConfig {
    attribute?: string;
    fieldName?: string;
    maxPages?: string;
    selector?: string;
    url?: string;
    variable?: string;
    wait?: string;
}

export interface LegacyBlockData {
    config?: LegacyBlockConfig | null;
    id: string;
}

export type LegacyBlockChange = (id: string, newConfig: LegacyBlockConfig) => void;
