type PrimitiveGuard<T> = (value: unknown) => value is T;

export interface DiscoveryConfigSnapshot {
    repeaterCount: number;
    repeaterSelectors: string[];
    emitterStepCount: number;
    emitterStepTypes: Array<'source_url' | 'document_url' | 'download_file'>;
    beforeActionCount: number;
}

export interface DiscoveryStatsSnapshot {
    reason: string | null;
    errors: number | null;
    documentsFound: number | null;
    sourceUrlsFound: number | null;
    rows: number | null;
    manualMode: boolean;
    downloadFanoutSkipped: boolean;
}

export type DiscoveryDiagnosisKind =
    | 'neutral'
    | 'success_with_matches'
    | 'zero_match_success'
    | 'config_drift'
    | 'runtime_failure';

export type DiscoveryDiagnosisSeverity = 'neutral' | 'success' | 'warning' | 'error';

export interface DiscoveryDiagnosis {
    kind: DiscoveryDiagnosisKind;
    severity: DiscoveryDiagnosisSeverity;
    title: string;
    summary: string;
    action: string | null;
    config: DiscoveryConfigSnapshot;
    stats: DiscoveryStatsSnapshot;
    isZeroOutputFinished: boolean;
    suppressFanoutAsPrimaryCause: boolean;
}

interface AnalyzeDiscoveryInput {
    crawlParams: unknown;
    statsJson: unknown;
    runStatus?: string | null;
    manualModeHint?: boolean;
    jobErrorMessages?: string[];
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === 'object';
}

function isNumber(value: unknown): value is number {
    return typeof value === 'number' && Number.isFinite(value);
}

function isBoolean(value: unknown): value is boolean {
    return typeof value === 'boolean';
}

function isNonEmptyString(value: unknown): value is string {
    return typeof value === 'string' && value.trim().length > 0;
}

function findValueByKeys<T>(
    value: unknown,
    keys: string[],
    guard: PrimitiveGuard<T>,
    seen = new WeakSet<object>(),
): T | null {
    if (Array.isArray(value)) {
        for (const entry of value) {
            const nested = findValueByKeys(entry, keys, guard, seen);
            if (nested !== null) return nested;
        }
        return null;
    }

    if (!isObjectRecord(value)) return null;
    if (seen.has(value)) return null;
    seen.add(value);

    for (const key of keys) {
        if (key in value && guard(value[key])) {
            return value[key];
        }
    }

    for (const nested of Object.values(value)) {
        const found = findValueByKeys(nested, keys, guard, seen);
        if (found !== null) return found;
    }

    return null;
}

function getNumberByKeys(value: unknown, keys: string[]): number | null {
    const direct = findValueByKeys(value, keys, isNumber);
    if (direct !== null) return direct;

    const asString = findValueByKeys(value, keys, isNonEmptyString);
    if (asString === null) return null;

    const parsed = Number(asString);
    return Number.isFinite(parsed) ? parsed : null;
}

function getBooleanByKeys(value: unknown, keys: string[]): boolean | null {
    const direct = findValueByKeys(value, keys, isBoolean);
    if (direct !== null) return direct;

    const asString = findValueByKeys(value, keys, isNonEmptyString);
    if (asString === null) return null;

    const normalized = asString.trim().toLowerCase();
    if (normalized === 'true' || normalized === '1' || normalized === 'yes') return true;
    if (normalized === 'false' || normalized === '0' || normalized === 'no') return false;
    return null;
}

function getStringByKeys(value: unknown, keys: string[]): string | null {
    return findValueByKeys(value, keys, isNonEmptyString);
}

function inspectDiscoveryConfig(crawlParams: unknown): DiscoveryConfigSnapshot {
    const empty: DiscoveryConfigSnapshot = {
        repeaterCount: 0,
        repeaterSelectors: [],
        emitterStepCount: 0,
        emitterStepTypes: [],
        beforeActionCount: 0,
    };

    if (!isObjectRecord(crawlParams)) return empty;
    const discovery = crawlParams.discovery;
    if (!isObjectRecord(discovery)) return empty;

    const beforeActionCount = Array.isArray(discovery.before) ? discovery.before.length : 0;
    const chain = Array.isArray(discovery.chain) ? discovery.chain : [];
    const repeaterSelectors: string[] = [];
    const emitterStepTypes = new Set<'source_url' | 'document_url' | 'download_file'>();
    let emitterStepCount = 0;

    const visit = (nodes: unknown[]) => {
        for (const node of nodes) {
            if (!isObjectRecord(node)) continue;

            const repeater = node.repeater;
            if (isObjectRecord(repeater)) {
                const selector = typeof repeater.selector === 'string'
                    ? repeater.selector
                    : typeof repeater.css_selector === 'string'
                        ? repeater.css_selector
                        : '';
                if (selector.trim()) repeaterSelectors.push(selector.trim());

                if (Array.isArray(repeater.steps)) {
                    for (const step of repeater.steps) {
                        if (!isObjectRecord(step)) continue;
                        const type = step.type;
                        if (type === 'source_url' || type === 'document_url' || type === 'download_file') {
                            emitterStepCount += 1;
                            emitterStepTypes.add(type);
                        }
                    }
                }
            }

            const children = Array.isArray(node.children) ? node.children : [];
            if (children.length > 0) visit(children);
        }
    };

    visit(chain);

    return {
        repeaterCount: repeaterSelectors.length,
        repeaterSelectors,
        emitterStepCount,
        emitterStepTypes: Array.from(emitterStepTypes),
        beforeActionCount,
    };
}

export function isDownloadFanoutSkipMessage(message: string): boolean {
    return /skip(?:ping)?\s+download\s+fanout/i.test(message);
}

function extractDiscoveryStats(
    statsJson: unknown,
    manualModeHint: boolean,
    jobErrorMessages: string[],
): DiscoveryStatsSnapshot {
    const reason = getStringByKeys(statsJson, ['reason', 'terminal_reason', 'finish_reason']);
    const errors = getNumberByKeys(statsJson, ['errors', 'error_count']);
    const documentsFound = getNumberByKeys(statsJson, ['documents_found', 'document_count']);
    const sourceUrlsFound = getNumberByKeys(statsJson, ['source_urls_found', 'source_url_count']);
    const rows = getNumberByKeys(statsJson, ['rows', 'row_count', 'repeater_rows', 'selector_rows']);
    const manualMode = manualModeHint || Boolean(getBooleanByKeys(statsJson, ['manual_mode', 'manual']));
    const fanoutFromStats = Boolean(
        getBooleanByKeys(statsJson, ['download_fanout_skipped', 'skipping_download_fanout', 'skip_download_fanout']),
    );
    const fanoutFromMessages = jobErrorMessages.some((message) => isDownloadFanoutSkipMessage(message));

    return {
        reason,
        errors,
        documentsFound,
        sourceUrlsFound,
        rows,
        manualMode,
        downloadFanoutSkipped: fanoutFromStats || fanoutFromMessages,
    };
}

function isFinishedWithoutOutputs(stats: DiscoveryStatsSnapshot): boolean {
    return stats.reason?.trim().toLowerCase() === 'finished'
        && stats.errors === 0
        && stats.documentsFound === 0
        && stats.sourceUrlsFound === 0;
}

function hasOutputs(stats: DiscoveryStatsSnapshot): boolean {
    return (stats.documentsFound ?? 0) > 0 || (stats.sourceUrlsFound ?? 0) > 0;
}

export function analyzeDiscovery(input: AnalyzeDiscoveryInput): DiscoveryDiagnosis {
    const config = inspectDiscoveryConfig(input.crawlParams);
    const stats = extractDiscoveryStats(input.statsJson, Boolean(input.manualModeHint), input.jobErrorMessages ?? []);
    const runStatus = String(input.runStatus || '').trim().toLowerCase();
    const zeroOutputFinished = isFinishedWithoutOutputs(stats);
    const suppressFanoutAsPrimaryCause = stats.manualMode && zeroOutputFinished && stats.downloadFanoutSkipped;

    if (runStatus === 'failed' || ((stats.errors ?? 0) > 0 && !zeroOutputFinished)) {
        return {
            kind: 'runtime_failure',
            severity: 'error',
            title: 'Runtime failure',
            summary: 'Worker skoncil chybou. Primarni pricina je runtime fail, ne nulovy discovery vysledek.',
            action: null,
            config,
            stats,
            isZeroOutputFinished: zeroOutputFinished,
            suppressFanoutAsPrimaryCause,
        };
    }

    if (zeroOutputFinished) {
        if (config.emitterStepCount === 0) {
            return {
                kind: 'config_drift',
                severity: 'warning',
                title: 'Selector/config drift',
                summary: 'Discovery skoncilo bez matchu a repeater nema zadny emitujici krok (source_url, document_url nebo download_file).',
                action: 'Porovnej live DOM s ulozenym crawl_params a oprav repeater kroky nebo before actions.',
                config,
                stats,
                isZeroOutputFinished: true,
                suppressFanoutAsPrimaryCause,
            };
        }

        if (stats.rows === 0) {
            return {
                kind: 'config_drift',
                severity: 'warning',
                title: 'Selector/config drift',
                summary: 'Discovery skoncilo bez matchu a repeater selector vratil 0 rows. To vypada na selector drift, ne na runtime pad.',
                action: 'Porovnej live DOM s ulozenym crawl_params a oprav repeater selector nebo before actions.',
                config,
                stats,
                isZeroOutputFinished: true,
                suppressFanoutAsPrimaryCause,
            };
        }

        return {
            kind: 'zero_match_success',
            severity: 'success',
            title: 'Dokonceno bez matchu',
            summary: 'Worker skoncil reason=finished, errors=0 a nenasel zadne source URLs ani dokumenty. Je to uspesne dokonceny crawl bez matchu.',
            action: null,
            config,
            stats,
            isZeroOutputFinished: true,
            suppressFanoutAsPrimaryCause,
        };
    }

    if (runStatus === 'completed' && hasOutputs(stats)) {
        return {
            kind: 'success_with_matches',
            severity: 'success',
            title: 'Discovery uspesne',
            summary: 'Discovery dokoncilo crawl a emitovalo vystupy do dalsich kroku.',
            action: null,
            config,
            stats,
            isZeroOutputFinished: false,
            suppressFanoutAsPrimaryCause,
        };
    }

    return {
        kind: 'neutral',
        severity: 'neutral',
        title: 'Discovery diagnostika',
        summary: 'Zatim neni dost dat pro spolehlivou klasifikaci discovery vysledku.',
        action: null,
        config,
        stats,
        isZeroOutputFinished: false,
        suppressFanoutAsPrimaryCause,
    };
}
