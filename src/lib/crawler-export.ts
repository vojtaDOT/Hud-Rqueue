// Functions for exporting crawler configuration

import {
    BeforeAction,
    CrawlerConfig,
    ScrapyConfig,
    PlaywrightConfig,
    CrawlerStep,
    ExtractStep,
    PaginationStep,
    HierarchicalCrawlerConfig,
    HierarchicalStep,
    HierarchicalSource,
    WorkflowData,
    PhaseConfig,
    ScopeModule,
    RepeaterStep,
    ScrapingWorkflow,
    UnifiedWorkerBeforeAction,
    UnifiedWorkerCrawlParams,
    UnifiedWorkerPhaseV2,
    UnifiedWorkerScopeNodeV2,
    UnifiedWorkerRepeaterStepV2,
} from './crawler-types';

function getConfigRecord(value: unknown): Record<string, unknown> {
    if (value && typeof value === 'object') {
        return value as Record<string, unknown>;
    }
    return {};
}

function getString(value: unknown, fallback = ''): string {
    return typeof value === 'string' ? value : fallback;
}

function getBoolean(value: unknown, fallback = false): boolean {
    return typeof value === 'boolean' ? value : fallback;
}

function getNumber(value: unknown, fallback = 0): number {
    return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/**
 * Convert CrawlerConfig to Scrapy JSON format
 */
export function exportToScrapy(config: CrawlerConfig): ScrapyConfig {
    const url = new URL(config.baseUrl);
    const domain = url.hostname;

    const scrapyConfig: ScrapyConfig = {
        name: config.baseUrl.split('/').pop() || 'spider',
        allowed_domains: [domain],
        start_urls: [config.startUrl || config.baseUrl],
        custom_settings: {
            DOWNLOAD_DELAY: 1,
            RANDOMIZE_DOWNLOAD_DELAY: true,
            USER_AGENT: config.userAgent || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            ROBOTSTXT_OBEY: true,
        },
    };

    // Process steps
    const extractSteps = config.steps.filter(s => s.type === 'extract') as Array<ExtractStep>;
    const paginationSteps = config.steps.filter(s => s.type === 'pagination') as Array<PaginationStep>;

    if (extractSteps.length > 0) {
        scrapyConfig.parse = {
            selectors: extractSteps.map(step => ({
                selector: step.selector,
                field: step.fieldName,
                attribute: step.attribute || 'text',
            })),
        };
    }

    // Add rules for pagination
    if (paginationSteps.length > 0) {
        const paginationStep = paginationSteps[0];
        scrapyConfig.rules = [{
            allow: paginationStep.nextLinkSelector ? [paginationStep.nextLinkSelector] : undefined,
            follow: true,
        }];
    }

    return scrapyConfig;
}

/**
 * Convert CrawlerConfig to Playwright JSON format
 */
export function exportToPlaywright(config: CrawlerConfig): PlaywrightConfig {
    const playwrightSteps: PlaywrightConfig['steps'] = [];

    // Convert steps to Playwright format
    for (const step of config.steps) {
        switch (step.type) {
            case 'source':
                playwrightSteps.push({
                    action: 'goto',
                    url: step.url,
                    waitForSelector: config.waitForSelector,
                    waitTimeout: config.waitTimeout || 30000,
                });
                break;

            case 'select':
                playwrightSteps.push({
                    action: 'wait',
                    waitForSelector: step.selector,
                    waitTimeout: step.waitTimeout || 30000,
                });
                break;

            case 'click':
                playwrightSteps.push({
                    action: 'click',
                    selector: step.selector,
                    waitForNavigation: step.waitForNavigation,
                    waitTimeout: step.waitTimeout || 30000,
                });
                break;

            case 'extract':
                playwrightSteps.push({
                    action: 'extract',
                    selector: step.selector,
                    extract: {
                        selector: step.selector,
                        attribute: step.attribute || 'text',
                        field: step.fieldName,
                    },
                });
                break;

            case 'pagination':
                if (step.nextButtonSelector) {
                    playwrightSteps.push({
                        action: 'click',
                        selector: step.nextButtonSelector,
                        waitForNavigation: true,
                        waitTimeout: step.waitTimeout || 30000,
                    });
                } else if (step.nextLinkSelector) {
                    playwrightSteps.push({
                        action: 'click',
                        selector: step.nextLinkSelector,
                        waitForNavigation: true,
                        waitTimeout: step.waitTimeout || 30000,
                    });
                }
                break;
        }
    }

    // Extract field names from extract steps
    const extractSteps = config.steps.filter(s => s.type === 'extract') as ExtractStep[];
    const outputFields = extractSteps.map(s => s.fieldName);

    return {
        name: config.baseUrl.split('/').pop() || 'playwright-scraper',
        baseUrl: config.baseUrl,
        steps: playwrightSteps,
        output: {
            format: config.outputFormat || 'json',
            fields: outputFields.length > 0 ? outputFields : config.outputFields || [],
        },
    };
}

/**
 * Generate crawler configuration from workflow blocks
 */
export function generateCrawlerConfig(
    baseUrl: string,
    pageType: { requiresPlaywright: boolean; framework: string },
    steps: Array<{ type: string; config: Record<string, unknown> }>
): CrawlerConfig {
    const crawlerSteps: CrawlerStep[] = steps.map(step => {
        const config = getConfigRecord(step.config);
        switch (step.type) {
            case 'select':
                return {
                    type: 'select',
                    selector: getString(config.selector),
                    waitForSelector: config.waitForSelector !== false,
                    waitTimeout: getNumber(config.waitTimeout, 30000),
                    multiple: getBoolean(config.multiple, false),
                };

            case 'extract':
                return {
                    type: 'extract',
                    selector: getString(config.selector),
                    attribute: getString(config.attribute, 'text'),
                    fieldName: getString(config.fieldName, 'value'),
                    required: config.required !== false,
                };

            case 'click':
                return {
                    type: 'click',
                    selector: getString(config.selector),
                    waitForNavigation: config.waitForNavigation !== false,
                    waitTimeout: getNumber(config.waitTimeout, 30000),
                };

            case 'pagination':
                return {
                    type: 'pagination',
                    nextButtonSelector: getString(config.nextButtonSelector, undefined),
                    nextLinkSelector: getString(config.nextLinkSelector, undefined),
                    maxPages: getNumber(config.maxPages, 10),
                    waitForSelector: config.waitForSelector !== false,
                };

            case 'source':
                return {
                    type: 'source',
                    url: getString(config.url, baseUrl),
                    method: getString(config.method, 'GET') as 'GET' | 'POST',
                    headers: getConfigRecord(config.headers) as Record<string, string>,
                    body: getString(config.body, undefined),
                };

            default:
                throw new Error(`Unknown step type: ${step.type}`);
        }
    });

    return {
        pageType: {
            isReact: pageType.framework === 'react' || pageType.framework === 'nextjs',
            isSPA: pageType.requiresPlaywright,
            isSSR: !pageType.requiresPlaywright,
            framework: pageType.framework as 'react' | 'nextjs' | 'vue' | 'angular' | 'unknown',
            requiresPlaywright: pageType.requiresPlaywright,
        },
        crawlerType: pageType.requiresPlaywright ? 'playwright' : 'scrapy',
        baseUrl,
        steps: crawlerSteps,
        outputFormat: 'json',
    };
}

/**
 * Export configuration to JSON string
 */
export function exportConfigToJSON(config: CrawlerConfig): string {
    if (config.crawlerType === 'playwright') {
        return JSON.stringify(exportToPlaywright(config), null, 2);
    } else {
        return JSON.stringify(exportToScrapy(config), null, 2);
    }
}

/**
 * Convert a block config to HierarchicalStep format
 */
function blockToHierarchicalStep(block: { type: string; config?: Record<string, unknown> }): HierarchicalStep {
    const config = getConfigRecord(block.config);
    
    switch (block.type) {
        case 'select':
            return {
                type: 'select',
                selector: getString(config.selector),
                waitForSelector: config.waitForSelector !== false,
                waitTimeout: getNumber(config.waitTimeout, 30000),
                multiple: getBoolean(config.multiple, false),
            };
        
        case 'extract':
            return {
                type: 'extract',
                selector: getString(config.selector),
                attribute: getString(config.attribute, 'text'),
                fieldName: getString(config.fieldName, 'value'),
                required: config.required !== false,
            };
        
        case 'click':
            return {
                type: 'click',
                selector: getString(config.selector),
                waitForNavigation: config.waitForNavigation !== false,
                waitTimeout: getNumber(config.waitTimeout, 30000),
            };
        
        case 'pagination':
            return {
                type: 'pagination',
                nextButtonSelector: getString(config.nextButtonSelector, undefined),
                nextLinkSelector: getString(config.nextLinkSelector, undefined),
                maxPages: getNumber(config.maxPages, 10),
                waitForSelector: config.waitForSelector !== false,
                waitTimeout: getNumber(config.waitTimeout, 30000),
            };
        
        case 'source':
            return {
                type: 'source',
                url: getString(config.url),
                method: getString(config.method, 'GET') as 'GET' | 'POST',
                headers: getConfigRecord(config.headers) as Record<string, string>,
                body: getString(config.body, undefined),
            };

        case 'remove_element':
            return {
                type: 'select',
                selector: getString(config.selector),
            };

        default:
            return {
                type: 'select',
                selector: getString(config.selector),
            };
    }
}

/**
 * Generate hierarchical crawler configuration from workflow data
 */
export function generateHierarchicalConfig(
    workflowData: WorkflowData,
    pageType: { requiresPlaywright: boolean; framework: string }
): HierarchicalCrawlerConfig {
    // Convert main loop blocks to hierarchical steps
    const mainLoopSteps: HierarchicalStep[] = workflowData.mainLoop.map(block => 
        blockToHierarchicalStep(block)
    );
    
    // Convert sources to hierarchical format
    const sources: HierarchicalSource[] = workflowData.sources.map(source => ({
        id: source.id,
        url: source.url,
        label: source.label,
        loopConfig: source.loopConfig,
        steps: source.steps.map(block => blockToHierarchicalStep(block)),
    }));
    
    return {
        mainLoop: {
            steps: mainLoopSteps,
        },
        sources,
        metadata: {
            pageType: pageType.requiresPlaywright ? 'playwright' : 'scrapy',
            framework: pageType.framework as 'react' | 'nextjs' | 'vue' | 'angular' | 'unknown',
            requiresPlaywright: pageType.requiresPlaywright,
        },
    };
}

/**
 * Export hierarchical configuration to JSON string
 */
export function exportHierarchicalJSON(config: HierarchicalCrawlerConfig): string {
    return JSON.stringify(config, null, 2);
}

/**
 * Generate hierarchical config and export to JSON in one step
 */
export function workflowToJSON(
    workflowData: WorkflowData,
    pageType: { requiresPlaywright: boolean; framework: string }
): string {
    const config = generateHierarchicalConfig(workflowData, pageType);
    return exportHierarchicalJSON(config);
}

const PLAYWRIGHT_ACTION_TYPES = new Set<BeforeAction['type']>([
    'wait_selector',
    'wait_network',
    'click',
    'scroll',
    'fill',
    'select_option',
    'evaluate',
    'screenshot',
]);

function toWorkerBeforeActions(before: BeforeAction[]): UnifiedWorkerBeforeAction[] {
    return before.map((action) => {
        switch (action.type) {
            case 'remove_element':
                return { action: 'remove_element', selector: action.css_selector };
            case 'wait_timeout':
                return { action: 'wait_timeout', ms: action.ms };
            case 'wait_selector':
                return { action: 'wait_selector', selector: action.css_selector, timeout: action.timeout_ms };
            case 'wait_network':
                return { action: 'wait_network', state: action.state };
            case 'click':
                return {
                    action: 'click',
                    selector: action.css_selector,
                    wait_after: action.wait_after_ms,
                };
            case 'scroll':
                return { action: 'scroll', count: action.count, delay: action.delay_ms };
            case 'fill':
                return {
                    action: 'fill',
                    selector: action.css_selector,
                    value: action.value,
                    press_enter: action.press_enter,
                };
            case 'select_option':
                return { action: 'select_option', selector: action.css_selector, value: action.value };
            case 'evaluate':
                return { action: 'evaluate', script: action.script };
            case 'screenshot':
                return { action: 'screenshot', filename: action.filename };
            default:
                return { action: 'wait_timeout', ms: 0 };
        }
    });
}

function toWorkerRepeaterStep(
    step: RepeaterStep,
    resolveUrlTypeName: (urlTypeId?: string) => string,
): UnifiedWorkerRepeaterStepV2 {
    if (step.type === 'source_url') {
        return {
            type: 'source_url',
            selector: step.selector,
            url_type: resolveUrlTypeName(step.url_type_id),
        };
    }

    if (step.type === 'document_url') {
        return {
            type: 'document_url',
            selector: step.selector,
            filename_selector: step.filename_selector?.trim() || 'self',
        };
    }

    if (step.type === 'download_file') {
        return {
            type: 'download_file',
            url_selector: step.url_selector,
            filename_selector: step.filename_selector?.trim() || 'self',
        };
    }

    return {
        type: 'data_extract',
        key: step.key,
        extract: step.extract_type,
        selector: step.selector,
    };
}

function toWorkerScopeChain(
    scopes: ScopeModule[],
    resolveUrlTypeName: (urlTypeId?: string) => string,
): UnifiedWorkerScopeNodeV2[] {
    return scopes.map((scope) => ({
        selector: scope.css_selector.trim(),
        label: scope.label.trim(),
        repeater: scope.repeater
            ? {
                selector: scope.repeater.css_selector.trim(),
                label: scope.repeater.label.trim(),
                steps: scope.repeater.steps.map((step) => toWorkerRepeaterStep(step, resolveUrlTypeName)),
            }
            : null,
        pagination: scope.pagination
            ? {
                selector: scope.pagination.css_selector,
                max_pages: scope.pagination.max_pages,
            }
            : null,
        children: toWorkerScopeChain(scope.children, resolveUrlTypeName),
    }));
}

function createUrlTypeNameResolver(urlTypes: ScrapingWorkflow['url_types']): (urlTypeId?: string) => string {
    const normalizedById = new Map(
        urlTypes.map((urlType) => [urlType.id, urlType.name.trim() || urlType.id]),
    );
    const fallbackUrlTypeName = urlTypes[0]
        ? (urlTypes[0].name.trim() || urlTypes[0].id)
        : '';

    return (urlTypeId?: string) => {
        if (!urlTypeId) {
            return fallbackUrlTypeName;
        }
        return normalizedById.get(urlTypeId) ?? urlTypeId;
    };
}

function toWorkerPhase(
    phase: PhaseConfig,
    resolveUrlTypeName: (urlTypeId?: string) => string,
): UnifiedWorkerPhaseV2 {
    return {
        before: toWorkerBeforeActions(phase.before),
        chain: toWorkerScopeChain(phase.chain, resolveUrlTypeName),
    };
}

export function hasPlaywrightBeforeAction(actions: BeforeAction[]): boolean {
    return actions.some((action) => PLAYWRIGHT_ACTION_TYPES.has(action.type));
}

/**
 * Export workflow into the new worker crawl_params JSON contract.
 */
export function generateUnifiedCrawlParams(workflowData: ScrapingWorkflow): UnifiedWorkerCrawlParams {
    const resolveUrlTypeName = createUrlTypeNameResolver(workflowData.url_types);

    return {
        schema_version: 2,
        playwright: workflowData.playwright_enabled,
        discovery: toWorkerPhase(workflowData.discovery, resolveUrlTypeName),
        processing: workflowData.url_types.map((urlType) => ({
            url_type: urlType.name.trim() || urlType.id,
            ...toWorkerPhase(urlType.processing, resolveUrlTypeName),
        })),
    };
}

/**
 * Backward-compatible alias for previous call sites.
 */
export function generateWorkerRuntimeConfig(
    workflowData: ScrapingWorkflow,
): UnifiedWorkerCrawlParams {
    return generateUnifiedCrawlParams(workflowData);
}
