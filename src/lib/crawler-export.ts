// Functions for exporting crawler configuration

import {
    CrawlerConfig,
    ScrapyConfig,
    PlaywrightConfig,
    CrawlerStep,
    ExtractStep,
    SelectStep,
    ClickStep,
    PaginationStep,
    HierarchicalCrawlerConfig,
    HierarchicalStep,
    HierarchicalSource,
    WorkflowData,
    WorkerRuntimeConfig,
    ScrapingWorkflow,
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
    const selectSteps = config.steps.filter(s => s.type === 'select') as Array<SelectStep>;
    const clickSteps = config.steps.filter(s => s.type === 'click') as Array<ClickStep>;
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

/**
 * Generate full worker runtime config from workflow data.
 * Matches the worker-runtime-minimal-template.json structure.
 *
 * - mainLoop blocks → steps.source.workflow (discover source_urls)
 * - sources with their steps → steps.source_urls.workflow (download documents)
 */
export function generateWorkerRuntimeConfig(
    workflowData: ScrapingWorkflow,
    pageType: { requiresPlaywright: boolean; framework: string },
    baseUrl: string,
): WorkerRuntimeConfig {
    const playwrightEnabled = workflowData.playwright_enabled;

    return {
        schema_version: '1.0',
        runtime_contract: 'scrapy-worker.runtime.minimal.v1',
        flow: ['source', 'source_urls'],
        worker_preconditions: {
            database: {
                source_exists: true,
                source_enabled: true,
            },
            download: {
                source_url_exists: true,
                source_url_enabled: true,
            },
        },
        steps: {
            source: {
                task: 'discover',
                required_task_fields_after_claim: ['id', 'source_id', 'task'],
                controller_api_enqueue: {
                    required_fields: ['source_id', 'task'],
                    payload_template: {
                        source_id: '<SOURCE_ID:int>',
                        task: 'discover',
                        max_attempts: 3,
                        idempotency_key: 'discover-<SOURCE_ID>-<YYYY-MM-DD>',
                    },
                },
                redis_enqueue: {
                    required_fields: ['id', 'source_id', 'task'],
                    payload_template: {
                        id: 'discover-<SOURCE_ID>-<UUID>',
                        source_id: '<SOURCE_ID>',
                        task: 'discover',
                        source_url_id: '',
                        document_id: 'None',
                        status: 'pending',
                        attempts: '0',
                        max_attempts: '3',
                        created_at: '<ISO8601_UTC>',
                        error_message: '',
                        worker: '',
                        started_at: '',
                        completed_at: '',
                        cron_time: '',
                    },
                },
                workflow: {
                    version: 'scoped_chain.v2.1',
                    phase: 'discovery',
                    playwright_enabled: playwrightEnabled,
                    config: workflowData.discovery,
                },
            },
            source_urls: {
                task: 'download',
                required_task_fields_after_claim: ['id', 'source_id', 'source_url_id', 'task'],
                controller_api_enqueue: {
                    required_fields: ['source_id', 'source_url_id', 'task'],
                    payload_template: {
                        source_id: '<SOURCE_ID:int>',
                        source_url_id: '<SOURCE_URL_ID:int>',
                        task: 'download',
                        max_attempts: 3,
                        idempotency_key: 'download-<SOURCE_ID>-<SOURCE_URL_ID>-<YYYY-MM-DD>',
                    },
                },
                redis_enqueue: {
                    required_fields: ['id', 'source_id', 'source_url_id', 'task'],
                    payload_template: {
                        id: 'download-<SOURCE_ID>-<SOURCE_URL_ID>-<UUID>',
                        source_id: '<SOURCE_ID>',
                        source_url_id: '<SOURCE_URL_ID>',
                        task: 'download',
                        document_id: 'None',
                        status: 'pending',
                        attempts: '0',
                        max_attempts: '3',
                        created_at: '<ISO8601_UTC>',
                        error_message: '',
                        worker: '',
                        started_at: '',
                        completed_at: '',
                        cron_time: '',
                    },
                },
                workflow: {
                    version: 'scoped_chain.v2.1',
                    phase: 'processing',
                    playwright_enabled: playwrightEnabled,
                    url_types: workflowData.url_types,
                },
            },
        },
        optional_tasks: {
            ocr: {
                task: 'ocr',
                required_task_fields_after_claim: ['id', 'source_id', 'document_id', 'task'],
                controller_api_enqueue: {
                    required_fields: ['source_id', 'document_id', 'task'],
                    payload_template: {
                        source_id: '<SOURCE_ID:int>',
                        document_id: '<DOCUMENT_ID:int>',
                        task: 'ocr',
                        max_attempts: 3,
                        idempotency_key: 'ocr-<DOCUMENT_ID>-<YYYY-MM-DD>',
                    },
                },
                redis_enqueue: {
                    required_fields: ['id', 'source_id', 'document_id', 'task'],
                    payload_template: {
                        id: 'ocr-<DOCUMENT_ID>-<UUID>',
                        source_id: '<SOURCE_ID>',
                        source_url_id: '',
                        task: 'ocr',
                        document_id: '<DOCUMENT_ID>',
                        status: 'pending',
                        attempts: '0',
                        max_attempts: '3',
                        created_at: '<ISO8601_UTC>',
                        error_message: '',
                        worker: '',
                        started_at: '',
                        completed_at: '',
                        cron_time: '',
                    },
                },
                workflow: {
                    version: 'scoped_chain.v2.1',
                    phase: 'processing',
                    playwright_enabled: playwrightEnabled,
                    url_types: [],
                },
            },
        },
        metadata: {
            pageType: playwrightEnabled ? 'playwright' : 'scrapy',
            framework: pageType.framework || 'unknown',
            requiresPlaywright: playwrightEnabled,
            baseUrl,
            createdAt: new Date().toISOString(),
        },
    };
}
