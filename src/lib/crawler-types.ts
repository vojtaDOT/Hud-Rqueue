// Types for crawler configuration

export interface PageType {
    isReact: boolean;
    isSPA: boolean;
    isSSR: boolean;
    framework: 'react' | 'nextjs' | 'vue' | 'angular' | 'unknown';
    requiresPlaywright: boolean;
}

export interface ElementSelector {
    selector: string;
    tagName: string;
    textContent?: string;
    isList: boolean;
    listItemCount?: number;
    parentSelector?: string;
}

export interface SelectStep {
    type: 'select';
    selector: string;
    waitForSelector?: boolean;
    waitTimeout?: number;
    multiple?: boolean;
}

export interface ExtractStep {
    type: 'extract';
    selector: string;
    attribute?: string; // 'text', 'html', 'href', 'src', etc.
    fieldName: string;
    required?: boolean;
}

export interface ClickStep {
    type: 'click';
    selector: string;
    waitForNavigation?: boolean;
    waitTimeout?: number;
}

export interface PaginationStep {
    type: 'pagination';
    nextButtonSelector?: string;
    nextLinkSelector?: string;
    maxPages?: number;
    waitForSelector?: boolean;
    waitTimeout?: number;
}

export interface SourceStep {
    type: 'source';
    url: string;
    method?: 'GET' | 'POST';
    headers?: Record<string, string>;
    body?: string;
}

export type CrawlerStep = SelectStep | ExtractStep | ClickStep | PaginationStep | SourceStep;

export interface CrawlerConfig {
    // Page detection
    pageType: PageType;

    // Crawler type
    crawlerType: 'scrapy' | 'playwright';

    // Base configuration
    baseUrl: string;
    startUrl?: string;

    // Workflow steps
    steps: CrawlerStep[];

    // Advanced options
    waitForSelector?: string;
    waitTimeout?: number;
    headers?: Record<string, string>;
    cookies?: Record<string, string>;
    userAgent?: string;

    // Output configuration
    outputFormat?: 'json' | 'csv' | 'xml';
    outputFields?: string[];
}

// Export format for Scrapy
export interface ScrapyConfig {
    name: string;
    allowed_domains: string[];
    start_urls: string[];
    custom_settings: {
        DOWNLOAD_DELAY?: number;
        RANDOMIZE_DOWNLOAD_DELAY?: boolean;
        USER_AGENT?: string;
        ROBOTSTXT_OBEY?: boolean;
    };
    rules?: Array<{
        allow?: string[];
        deny?: string[];
        callback?: string;
        follow?: boolean;
    }>;
    parse?: {
        selectors: Array<{
            selector: string;
            field: string;
            attribute?: string;
        }>;
    };
}

// Export format for Playwright
export interface PlaywrightConfig {
    name: string;
    baseUrl: string;
    steps: Array<{
        action: 'goto' | 'click' | 'select' | 'extract' | 'wait' | 'pagination';
        selector?: string;
        url?: string;
        waitForSelector?: string;
        waitForNavigation?: boolean;
        waitTimeout?: number;
        extract?: {
            selector: string;
            attribute?: string;
            field: string;
        };
    }>;
    output: {
        format: 'json' | 'csv' | 'xml';
        fields: string[];
    };
}


// Hierarchical step configuration (matching BlockData from simulator)
export interface HierarchicalStep {
    type: 'select' | 'extract' | 'click' | 'pagination' | 'source';
    selector?: string;
    fieldName?: string;
    attribute?: string;
    waitForSelector?: boolean;
    waitTimeout?: number;
    waitForNavigation?: boolean;
    multiple?: boolean;
    required?: boolean;
    nextButtonSelector?: string;
    nextLinkSelector?: string;
    maxPages?: number;
    url?: string;
    method?: 'GET' | 'POST';
    headers?: Record<string, string>;
    body?: string;
}

// Hierarchical source configuration
export interface HierarchicalSource {
    id: string;
    url: string;
    label: string;
    loopConfig?: {
        enabled: boolean;
        maxIterations?: number;
        waitBetweenIterations?: number;
    };
    steps: HierarchicalStep[];
}

// Hierarchical crawler configuration - matches the workflow structure
export interface HierarchicalCrawlerConfig {
    mainLoop: {
        steps: HierarchicalStep[];
    };
    sources: HierarchicalSource[];
    metadata: {
        pageType: 'scrapy' | 'playwright';
        framework: 'react' | 'nextjs' | 'vue' | 'angular' | 'unknown';
        requiresPlaywright: boolean;
    };
}

// Workflow data passed from SimulatorSidebar (matches types.ts in simulator)
export interface WorkflowData {
    mainLoop: Array<{
        id: string;
        type: string;
        label: string;
        config?: Record<string, unknown>;
    }>;
    sources: Array<{
        id: string;
        url: string;
        label: string;
        steps: Array<{
            id: string;
            type: string;
            label: string;
            config?: Record<string, unknown>;
        }>;
        loopConfig?: {
            enabled: boolean;
            maxIterations?: number;
            waitBetweenIterations?: number;
        };
    }>;
}
