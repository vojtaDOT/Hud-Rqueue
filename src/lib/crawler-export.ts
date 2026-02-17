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
    RepeaterStep,
    ScopeModule,
    ScrapingWorkflow,
    UnifiedWorkerBeforeAction,
    UnifiedWorkerCrawlParams,
    UnifiedWorkerField,
    UnifiedWorkerPhase,
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

function flattenScopes(scopes: ScopeModule[]): ScopeModule[] {
    const output: ScopeModule[] = [];
    const walk = (items: ScopeModule[]) => {
        for (const scope of items) {
            output.push(scope);
            walk(scope.children);
        }
    };
    walk(scopes);
    return output;
}

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

function toWorkerField(step: RepeaterStep): UnifiedWorkerField[] {
    switch (step.type) {
        case 'source_url':
            return [{
                name: 'source_url',
                selector: step.selector,
                type: 'href',
            }];
        case 'download_file':
            return [
                {
                    name: 'file_url',
                    selector: step.url_selector,
                    type: 'href',
                },
                ...(step.filename_selector?.trim()
                    ? [{
                        name: 'file_name',
                        selector: step.filename_selector,
                        type: 'text' as const,
                    }]
                    : []),
            ];
        case 'data_extract':
            return [{
                name: step.key,
                selector: step.selector,
                type: step.extract_type,
            }];
        default:
            return [];
    }
}

function toWorkerPhase(phase: PhaseConfig, phaseName: string): UnifiedWorkerPhase {
    const allScopes = flattenScopes(phase.chain);
    if (allScopes.length > 1) {
        throw new Error(`${phaseName} obsahuje více Scope bloků. Aktuální worker export podporuje jen jeden Scope na fázi.`);
    }

    const scope = allScopes[0] ?? null;
    const fields = scope?.repeater?.steps.flatMap((step) => toWorkerField(step)) ?? [];

    return {
        before: toWorkerBeforeActions(phase.before),
        scope: scope?.css_selector?.trim() || null,
        repeater: scope?.repeater?.css_selector?.trim() || null,
        fields,
        pagination: scope?.pagination
            ? {
                selector: scope.pagination.css_selector,
                max_pages: scope.pagination.max_pages,
            }
            : null,
    };
}

export function hasPlaywrightBeforeAction(actions: BeforeAction[]): boolean {
    return actions.some((action) => PLAYWRIGHT_ACTION_TYPES.has(action.type));
}

/**
 * Export workflow into worker-compatible unified crawl_params JSON.
 */
export function generateUnifiedCrawlParams(workflowData: ScrapingWorkflow): UnifiedWorkerCrawlParams {
    return {
        playwright: workflowData.playwright_enabled,
        discovery: toWorkerPhase(workflowData.discovery, 'Discovery'),
        processing: workflowData.url_types.map((urlType) => ({
            url_type: urlType.name.trim() || urlType.id,
            ...toWorkerPhase(urlType.processing, `Processing (${urlType.name})`),
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
