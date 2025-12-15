// Functions for exporting crawler configuration

import { CrawlerConfig, ScrapyConfig, PlaywrightConfig, CrawlerStep, ExtractStep, SelectStep, ClickStep, PaginationStep } from './crawler-types';

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
    steps: Array<{ type: string; config: any }>
): CrawlerConfig {
    const crawlerSteps: CrawlerStep[] = steps.map(step => {
        switch (step.type) {
            case 'select':
                return {
                    type: 'select',
                    selector: step.config.selector || '',
                    waitForSelector: step.config.waitForSelector !== false,
                    waitTimeout: step.config.waitTimeout || 30000,
                    multiple: step.config.multiple || false,
                };

            case 'extract':
                return {
                    type: 'extract',
                    selector: step.config.selector || '',
                    attribute: step.config.attribute || 'text',
                    fieldName: step.config.fieldName || 'value',
                    required: step.config.required !== false,
                };

            case 'click':
                return {
                    type: 'click',
                    selector: step.config.selector || '',
                    waitForNavigation: step.config.waitForNavigation !== false,
                    waitTimeout: step.config.waitTimeout || 30000,
                };

            case 'pagination':
                return {
                    type: 'pagination',
                    nextButtonSelector: step.config.nextButtonSelector,
                    nextLinkSelector: step.config.nextLinkSelector,
                    maxPages: step.config.maxPages || 10,
                    waitForSelector: step.config.waitForSelector !== false,
                };

            case 'source':
                return {
                    type: 'source',
                    url: step.config.url || baseUrl,
                    method: step.config.method || 'GET',
                    headers: step.config.headers || {},
                    body: step.config.body,
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
            framework: pageType.framework as any,
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

