import { z } from 'zod';

import type {
    BeforeAction,
    DownloadFileStep,
    PhaseConfig,
    RepeaterNode,
    RepeaterStep,
    ScopeModule,
    ScrapingWorkflow,
    UnifiedWorkerBeforeAction,
    UnifiedWorkerCrawlParams,
    UnifiedWorkerPhaseV2,
    UnifiedWorkerProcessingPhaseV2,
    UnifiedWorkerRepeaterNodeV2,
    UnifiedWorkerRepeaterStepV2,
    UnifiedWorkerScopeNodeV2,
} from '@/lib/crawler-types';
import {
    createEmptyPhase,
    createId,
} from '@/lib/workflow-tree';

export interface EditorEnvelopeV1 {
    config_version: 1;
    strategy: 'list';
    generator_kind: 'ui-step-builder';
    generator_version: 1;
    editor_model: UnifiedWorkerCrawlParams;
    ui_state: Record<string, unknown>;
}

type ValidationIssue = {
    message: string;
    path: Array<string | number>;
};

function normalizeRequiredString(value: unknown): string {
    return typeof value === 'string' ? value.trim() : '';
}

function normalizeOptionalString(value: unknown): string | undefined {
    if (typeof value !== 'string') return undefined;
    const normalized = value.trim();
    return normalized.length > 0 ? normalized : undefined;
}

const SelectorSchema = z.string().trim().min(1);
const NonNegativeIntegerSchema = z.number().int().min(0);
const PositiveIntegerSchema = z.number().int().min(1);

const BeforeActionSchema = z.discriminatedUnion('action', [
    z.object({
        action: z.literal('remove_element'),
        selector: SelectorSchema,
    }).strict(),
    z.object({
        action: z.literal('wait_timeout'),
        ms: NonNegativeIntegerSchema,
    }).strict(),
    z.object({
        action: z.literal('wait_selector'),
        selector: SelectorSchema,
        timeout: PositiveIntegerSchema.optional(),
    }).strict(),
    z.object({
        action: z.literal('wait_network'),
        state: z.enum(['networkidle', 'domcontentloaded', 'load']),
    }).strict(),
    z.object({
        action: z.literal('click'),
        selector: SelectorSchema,
        wait_after: NonNegativeIntegerSchema.optional(),
    }).strict(),
    z.object({
        action: z.literal('scroll'),
        count: PositiveIntegerSchema,
        delay: NonNegativeIntegerSchema,
    }).strict(),
    z.object({
        action: z.literal('fill'),
        selector: SelectorSchema,
        value: z.string(),
        press_enter: z.boolean(),
    }).strict(),
    z.object({
        action: z.literal('select_option'),
        selector: SelectorSchema,
        value: z.string(),
    }).strict(),
    z.object({
        action: z.literal('evaluate'),
        script: z.string().trim().min(1),
    }).strict(),
    z.object({
        action: z.literal('screenshot'),
        filename: z.string().trim().min(1),
    }).strict(),
]);

const DataExtractStepSchema = z.object({
    type: z.literal('data_extract'),
    key: z.string().trim().min(1),
    selector: SelectorSchema,
    extract: z.enum(['text', 'href']),
}).strict();

const SourceUrlStepSchema = z.object({
    type: z.literal('source_url'),
    selector: SelectorSchema,
    url_type: z.string().trim().min(1),
    emit_parent_url: z.boolean().optional(),
}).strict();

const DocumentUrlStepSchema = z.object({
    type: z.literal('document_url'),
    selector: SelectorSchema,
    filename_selector: SelectorSchema,
}).strict();

const DownloadFileStepSchema = z.object({
    type: z.literal('download_file'),
    url_selector: SelectorSchema,
    filename_selector: SelectorSchema,
}).strict();

const RepeaterStepSchema = z.discriminatedUnion('type', [
    DataExtractStepSchema,
    SourceUrlStepSchema,
    DocumentUrlStepSchema,
    DownloadFileStepSchema,
]);

type ScopeSchemaType = z.ZodType<UnifiedWorkerScopeNodeV2>;

const ScopeNodeSchema: ScopeSchemaType = z.lazy(() => z.object({
    selector: SelectorSchema,
    label: z.string(),
    repeater: z.object({
        selector: SelectorSchema,
        label: z.string(),
        route_key_selector: SelectorSchema.optional(),
        route_key_extract: z.enum(['text', 'href']).optional(),
        steps: z.array(RepeaterStepSchema),
    }).strict().nullable(),
    pagination: z.object({
        selector: z.string(),
        max_pages: NonNegativeIntegerSchema,
        url: z.object({
            mode: z.enum(['hybrid', 'pattern']),
            pattern: z.string().trim().min(1),
            template: z.string().trim().min(1),
            start_page: PositiveIntegerSchema,
            step: PositiveIntegerSchema,
        }).strict().nullable(),
    }).strict().nullable(),
    children: z.array(ScopeNodeSchema),
}).strict());

export const UnifiedListCrawlParamsSchema = z.object({
    schema_version: z.literal(2),
    playwright: z.boolean(),
    discovery: z.object({
        before: z.array(BeforeActionSchema),
        chain: z.array(ScopeNodeSchema),
    }).strict(),
    processing: z.array(z.object({
        url_type: z.string().trim().min(1),
        before: z.array(BeforeActionSchema),
        chain: z.array(ScopeNodeSchema),
    }).strict()),
}).strict();

export const ListEditorEnvelopeSchema = z.object({
    config_version: z.literal(1),
    strategy: z.literal('list'),
    generator_kind: z.literal('ui-step-builder'),
    generator_version: z.literal(1),
    editor_model: UnifiedListCrawlParamsSchema,
    ui_state: z.record(z.string(), z.unknown()),
}).strict();

function isObjectRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeWorkerStep(step: UnifiedWorkerRepeaterStepV2): UnifiedWorkerRepeaterStepV2 {
    if (step.type === 'source_url') {
        const selector = normalizeRequiredString(step.selector);
        return {
            type: 'source_url',
            selector: step.emit_parent_url ? 'self' : selector,
            url_type: normalizeRequiredString(step.url_type),
            ...(step.emit_parent_url ? { emit_parent_url: true } : {}),
        };
    }

    if (step.type === 'document_url') {
        return {
            type: 'document_url',
            selector: normalizeRequiredString(step.selector),
            filename_selector: normalizeRequiredString(step.filename_selector) || 'self',
        };
    }

    if (step.type === 'download_file') {
        return {
            type: 'download_file',
            url_selector: normalizeRequiredString(step.url_selector),
            filename_selector: normalizeRequiredString(step.filename_selector) || 'self',
        };
    }

    return {
        type: 'data_extract',
        key: normalizeRequiredString(step.key),
        selector: normalizeRequiredString(step.selector),
        extract: step.extract,
    };
}

function normalizeWorkerRepeater(repeater: UnifiedWorkerRepeaterNodeV2 | null): UnifiedWorkerRepeaterNodeV2 | null {
    if (!repeater) return null;

    const routeKeySelector = normalizeOptionalString(repeater.route_key_selector);
    return {
        selector: normalizeRequiredString(repeater.selector),
        label: repeater.label,
        ...(routeKeySelector ? {
            route_key_selector: routeKeySelector,
            route_key_extract: repeater.route_key_extract ?? 'text',
        } : {}),
        steps: repeater.steps.map(normalizeWorkerStep),
    };
}

function normalizeWorkerScope(scope: UnifiedWorkerScopeNodeV2): UnifiedWorkerScopeNodeV2 {
    return {
        selector: normalizeRequiredString(scope.selector),
        label: scope.label,
        repeater: normalizeWorkerRepeater(scope.repeater),
        pagination: scope.pagination
            ? {
                selector: typeof scope.pagination.selector === 'string' ? scope.pagination.selector.trim() : '',
                max_pages: scope.pagination.max_pages,
                url: scope.pagination.url
                    ? {
                        mode: scope.pagination.url.mode,
                        pattern: normalizeRequiredString(scope.pagination.url.pattern),
                        template: normalizeRequiredString(scope.pagination.url.template),
                        start_page: scope.pagination.url.start_page,
                        step: scope.pagination.url.step,
                    }
                    : null,
            }
            : null,
        children: scope.children.map(normalizeWorkerScope),
    };
}

export function normalizeUnifiedListCrawlParams(crawlParams: UnifiedWorkerCrawlParams): UnifiedWorkerCrawlParams {
    return {
        schema_version: 2,
        playwright: crawlParams.playwright,
        discovery: {
            before: crawlParams.discovery.before.map((action) => ({ ...action })),
            chain: crawlParams.discovery.chain.map(normalizeWorkerScope),
        },
        processing: crawlParams.processing.map((entry) => ({
            url_type: normalizeRequiredString(entry.url_type),
            before: entry.before.map((action) => ({ ...action })),
            chain: entry.chain.map(normalizeWorkerScope),
        })),
    };
}

function walkScopes(
    scopes: UnifiedWorkerScopeNodeV2[],
    visitor: (scope: UnifiedWorkerScopeNodeV2, path: Array<string | number>) => void,
    path: Array<string | number>,
) {
    scopes.forEach((scope, index) => {
        const nextPath = [...path, index];
        visitor(scope, nextPath);
        walkScopes(scope.children, visitor, [...nextPath, 'children']);
    });
}

function collectEmitterTypes(scopes: UnifiedWorkerScopeNodeV2[]): Array<'source_url' | 'document_url' | 'download_file'> {
    const emitterTypes: Array<'source_url' | 'document_url' | 'download_file'> = [];
    walkScopes(scopes, (scope) => {
        scope.repeater?.steps.forEach((step) => {
            if (step.type === 'source_url' || step.type === 'document_url' || step.type === 'download_file') {
                emitterTypes.push(step.type);
            }
        });
    }, []);
    return emitterTypes;
}

function collectProcessingRouteKeys(entry: UnifiedWorkerProcessingPhaseV2): Set<string> {
    const keys = new Set<string>();
    walkScopes(entry.chain, (scope) => {
        const selector = scope.repeater?.route_key_selector?.trim();
        if (!selector) return;
        keys.add(`${selector}::${scope.repeater?.route_key_extract ?? 'text'}`);
    }, []);
    return keys;
}

export function validateUnifiedListCrawlParams(crawlParams: UnifiedWorkerCrawlParams): ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    const emitterTypes = collectEmitterTypes(crawlParams.discovery.chain);
    const processingUrlTypes = new Set(crawlParams.processing.map((entry) => entry.url_type));

    if (crawlParams.discovery.chain.length === 0) {
        issues.push({
            path: ['crawl_params', 'discovery', 'chain'],
            message: 'Discovery chain nesmí být prázdný.',
        });
    }

    if (emitterTypes.length === 0) {
        issues.push({
            path: ['crawl_params', 'discovery', 'chain'],
            message: 'Discovery musí obsahovat alespoň jeden source_url, document_url nebo download_file krok.',
        });
    }

    const hasDiscoverySourceUrl = emitterTypes.includes('source_url');
    if (hasDiscoverySourceUrl && crawlParams.processing.length === 0) {
        issues.push({
            path: ['crawl_params', 'processing'],
            message: 'Processing nesmí být prázdný, pokud discovery emituje source_url.',
        });
    }

    crawlParams.processing.forEach((entry, index) => {
        if (crawlParams.processing.findIndex((item) => item.url_type === entry.url_type) !== index) {
            issues.push({
                path: ['crawl_params', 'processing', index, 'url_type'],
                message: `Processing větev "${entry.url_type}" je duplicitní.`,
            });
        }
    });

    const validateBeforeActions = (
        before: UnifiedWorkerBeforeAction[],
        path: Array<string | number>,
    ) => {
        if (crawlParams.playwright) return;

        before.forEach((action, index) => {
            if (action.action === 'remove_element' || action.action === 'wait_timeout') return;
            issues.push({
                path: [...path, index],
                message: `Akce "${action.action}" vyžaduje playwright=true.`,
            });
        });
    };

    validateBeforeActions(crawlParams.discovery.before, ['crawl_params', 'discovery', 'before']);
    crawlParams.processing.forEach((entry, index) => {
        validateBeforeActions(entry.before, ['crawl_params', 'processing', index, 'before']);
    });

    const validateScopeChain = (
        scopes: UnifiedWorkerScopeNodeV2[],
        path: Array<string | number>,
        phase: 'discovery' | 'processing',
        urlType?: string,
    ) => {
        walkScopes(scopes, (scope, scopePath) => {
            const absoluteScopePath = [...path, ...scopePath];

            if (scope.pagination?.url?.mode === 'hybrid' && !scope.pagination.selector.trim()) {
                issues.push({
                    path: [...absoluteScopePath, 'pagination', 'selector'],
                    message: 'Hybrid pagination vyžaduje selector.',
                });
            }

            if (scope.pagination?.url && !scope.pagination.url.template.includes('{page}')) {
                issues.push({
                    path: [...absoluteScopePath, 'pagination', 'url', 'template'],
                    message: 'Pagination template musí obsahovat {page}.',
                });
            }

            if (!scope.repeater) return;

            const seenKeys = new Set<string>();
            scope.repeater.steps.forEach((step, stepIndex) => {
                const stepPath = [...absoluteScopePath, 'repeater', 'steps', stepIndex];
                if (step.type === 'data_extract') {
                    if (seenKeys.has(step.key)) {
                        issues.push({
                            path: [...stepPath, 'key'],
                            message: `Data extract key "${step.key}" je v repeateru duplicitní.`,
                        });
                    }
                    seenKeys.add(step.key);
                }

                if (phase === 'discovery' && step.type === 'source_url') {
                    if (!processingUrlTypes.has(step.url_type)) {
                        issues.push({
                            path: [...stepPath, 'url_type'],
                            message: `Source URL odkazuje na neexistující processing větev "${step.url_type}".`,
                        });
                    }

                    if (step.emit_parent_url) {
                        const routeKeySelector = scope.repeater?.route_key_selector?.trim();
                        const routeKeyExtract = scope.repeater?.route_key_extract ?? 'text';
                        if (!routeKeySelector) {
                            issues.push({
                                path: [...absoluteScopePath, 'repeater', 'route_key_selector'],
                                message: 'emit_parent_url vyžaduje route_key_selector na discovery repeateru.',
                            });
                        }
                        if (step.selector !== 'self') {
                            issues.push({
                                path: [...stepPath, 'selector'],
                                message: 'emit_parent_url=true vyžaduje selector="self".',
                            });
                        }

                        const processingEntry = crawlParams.processing.find((entry) => entry.url_type === step.url_type);
                        const processingKeys = processingEntry ? collectProcessingRouteKeys(processingEntry) : new Set<string>();
                        if (!processingKeys.has(`${routeKeySelector}::${routeKeyExtract}`)) {
                            issues.push({
                                path: ['crawl_params', 'processing'],
                                message: `Processing větev "${step.url_type}" musí obsahovat repeater se stejným route key (${routeKeySelector}, ${routeKeyExtract}).`,
                            });
                        }
                    }
                }
            });

            if (phase === 'processing' && urlType && scope.repeater?.route_key_selector) {
                const routeKeySelector = scope.repeater.route_key_selector.trim();
                const routeKeyExtract = scope.repeater.route_key_extract ?? 'text';
                const matchingDiscoveryRepeater = crawlParams.discovery.chain.some((discoveryScope) => {
                    let matches = false;
                    walkScopes([discoveryScope], (candidate) => {
                        if (
                            candidate.repeater?.route_key_selector?.trim() === routeKeySelector
                            && (candidate.repeater.route_key_extract ?? 'text') === routeKeyExtract
                        ) {
                            matches = true;
                        }
                    }, []);
                    return matches;
                });

                if (!matchingDiscoveryRepeater) {
                    issues.push({
                        path: [...absoluteScopePath, 'repeater', 'route_key_selector'],
                        message: `Processing route_key_selector "${routeKeySelector}" pro "${urlType}" nemá matching discovery repeater.`,
                    });
                }
            }
        }, []);
    };

    validateScopeChain(crawlParams.discovery.chain, ['crawl_params', 'discovery', 'chain'], 'discovery');
    crawlParams.processing.forEach((entry, index) => {
        validateScopeChain(entry.chain, ['crawl_params', 'processing', index, 'chain'], 'processing', entry.url_type);
    });

    return issues;
}

export function createValidationError(issues: ValidationIssue[]): z.ZodError {
    return new z.ZodError(issues.map((issue) => ({
        code: z.ZodIssueCode.custom,
        path: issue.path,
        message: issue.message,
    })));
}

export function buildListSourceConfig(
    crawlParams: UnifiedWorkerCrawlParams,
    uiState: Record<string, unknown> = {},
): {
    crawl_strategy: 'list';
    crawl_params: UnifiedWorkerCrawlParams;
    extraction_data: EditorEnvelopeV1;
} {
    const normalized = normalizeUnifiedListCrawlParams(crawlParams);
    const parsed = UnifiedListCrawlParamsSchema.safeParse(normalized);
    if (!parsed.success) {
        throw parsed.error;
    }
    const semanticIssues = validateUnifiedListCrawlParams(parsed.data);
    if (semanticIssues.length > 0) {
        throw createValidationError(semanticIssues);
    }

    return {
        crawl_strategy: 'list',
        crawl_params: parsed.data,
        extraction_data: {
            config_version: 1,
            strategy: 'list',
            generator_kind: 'ui-step-builder',
            generator_version: 1,
            editor_model: parsed.data,
            ui_state: uiState,
        },
    };
}

export function coerceLegacyListCrawlParams(value: unknown): UnifiedWorkerCrawlParams | null {
    if (!isObjectRecord(value)) return null;

    const stripped = {
        schema_version: value.schema_version,
        playwright: value.playwright,
        discovery: value.discovery,
        processing: value.processing,
    };

    const parsed = UnifiedListCrawlParamsSchema.safeParse(stripped);
    if (!parsed.success) return null;

    return normalizeUnifiedListCrawlParams(parsed.data);
}

function toLegacyBeforeAction(action: UnifiedWorkerBeforeAction): BeforeAction {
    switch (action.action) {
        case 'remove_element':
            return { type: 'remove_element', css_selector: action.selector };
        case 'wait_timeout':
            return { type: 'wait_timeout', ms: action.ms };
        case 'wait_selector':
            return { type: 'wait_selector', css_selector: action.selector, timeout_ms: action.timeout ?? 10000 };
        case 'wait_network':
            return { type: 'wait_network', state: action.state };
        case 'click':
            return { type: 'click', css_selector: action.selector, wait_after_ms: action.wait_after };
        case 'scroll':
            return { type: 'scroll', count: action.count, delay_ms: action.delay };
        case 'fill':
            return { type: 'fill', css_selector: action.selector, value: action.value, press_enter: action.press_enter };
        case 'select_option':
            return { type: 'select_option', css_selector: action.selector, value: action.value };
        case 'evaluate':
            return { type: 'evaluate', script: action.script };
        case 'screenshot':
            return { type: 'screenshot', filename: action.filename };
    }
}

function toLegacyRepeaterStep(
    step: UnifiedWorkerRepeaterStepV2,
    urlTypeIdsByName: Map<string, string>,
): RepeaterStep {
    if (step.type === 'source_url') {
        return {
            id: createId('step'),
            type: 'source_url',
            selector: step.selector,
            extract_type: 'href',
            url_type_id: urlTypeIdsByName.get(step.url_type),
            emit_parent_url: step.emit_parent_url ?? false,
        };
    }

    if (step.type === 'document_url') {
        return {
            id: createId('step'),
            type: 'document_url',
            selector: step.selector,
            filename_selector: step.filename_selector,
        };
    }

    if (step.type === 'download_file') {
        const legacyStep: DownloadFileStep = {
            id: createId('step'),
            type: 'download_file',
            url_selector: step.url_selector,
            filename_selector: step.filename_selector,
        };
        return legacyStep;
    }

    return {
        id: createId('step'),
        type: 'data_extract',
        key: step.key,
        selector: step.selector,
        extract_type: step.extract,
    };
}

function toLegacyScopeModule(
    scope: UnifiedWorkerScopeNodeV2,
    urlTypeIdsByName: Map<string, string>,
): ScopeModule {
    const repeater: RepeaterNode | null = scope.repeater
        ? {
            id: createId('repeater'),
            css_selector: scope.repeater.selector,
            label: scope.repeater.label,
            route_key_selector: scope.repeater.route_key_selector ?? '',
            route_key_extract: scope.repeater.route_key_extract ?? 'text',
            steps: scope.repeater.steps.map((step) => toLegacyRepeaterStep(step, urlTypeIdsByName)),
        }
        : null;

    return {
        id: createId('scope'),
        css_selector: scope.selector,
        label: scope.label,
        repeater,
        pagination: scope.pagination
            ? {
                css_selector: scope.pagination.selector,
                max_pages: scope.pagination.max_pages,
                url: scope.pagination.url
                    ? {
                        mode: scope.pagination.url.mode,
                        pattern: scope.pagination.url.pattern,
                        template: scope.pagination.url.template,
                        start_page: scope.pagination.url.start_page,
                        step: scope.pagination.url.step,
                    }
                    : null,
            }
            : null,
        children: scope.children.map((child) => toLegacyScopeModule(child, urlTypeIdsByName)),
    };
}

function toLegacyPhaseConfig(
    phase: UnifiedWorkerPhaseV2,
    urlTypeIdsByName: Map<string, string>,
): PhaseConfig {
    return {
        before: phase.before.map(toLegacyBeforeAction),
        chain: phase.chain.map((scope) => toLegacyScopeModule(scope, urlTypeIdsByName)),
    };
}

export function workflowFromUnifiedConfig(crawlParams: UnifiedWorkerCrawlParams): ScrapingWorkflow {
    const urlTypes = crawlParams.processing.map((entry) => ({
        id: createId('url-type'),
        name: entry.url_type,
        processing: createEmptyPhase(),
    }));

    if (urlTypes.length === 0) {
        urlTypes.push({
            id: createId('url-type'),
            name: 'default',
            processing: createEmptyPhase(),
        });
    }

    const urlTypeIdsByName = new Map(urlTypes.map((entry) => [entry.name, entry.id]));

    const workflow: ScrapingWorkflow = {
        playwright_enabled: crawlParams.playwright,
        discovery: toLegacyPhaseConfig(crawlParams.discovery, urlTypeIdsByName),
        url_types: urlTypes.map((entry, index) => ({
            ...entry,
            processing: crawlParams.processing[index]
                ? toLegacyPhaseConfig(crawlParams.processing[index], urlTypeIdsByName)
                : createEmptyPhase(),
        })),
    };

    return workflow;
}
