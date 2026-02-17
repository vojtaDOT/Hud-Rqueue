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
    localSelector?: string;
    framePath?: string[];
    inIframe?: boolean;
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

// Worker Runtime Config - matches worker-runtime-minimal-template.json
export interface WorkerRuntimePayloadTemplate {
    [key: string]: string | number;
}

export interface WorkerRuntimeEnqueueConfig {
    required_fields: string[];
    payload_template: WorkerRuntimePayloadTemplate;
}

export type ExtractType = 'text' | 'href';

export interface PaginationConfig {
    css_selector: string;
    max_pages: number;
}

export type PlaywrightAction =
    | { type: 'wait_selector'; css_selector: string; timeout_ms: number }
    | { type: 'wait_network'; state: 'networkidle' | 'domcontentloaded' | 'load' }
    | { type: 'click'; css_selector: string; wait_after_ms?: number }
    | { type: 'scroll'; count: number; delay_ms: number }
    | { type: 'fill'; css_selector: string; value: string; press_enter: boolean }
    | { type: 'select_option'; css_selector: string; value: string }
    | { type: 'evaluate'; script: string }
    | { type: 'screenshot'; filename: string };

export type BeforeAction =
    | { type: 'remove_element'; css_selector: string }
    | { type: 'wait_timeout'; ms: number }
    | PlaywrightAction;

export interface SourceUrlStep {
    id: string;
    type: 'source_url';
    selector: string;
    extract_type: 'href';
    url_type_id?: string;
}

export interface DownloadFileStep {
    id: string;
    type: 'download_file';
    url_selector: string;
    filename_selector?: string;
    file_type_hint?: string;
}

export interface DataExtractStep {
    id: string;
    type: 'data_extract';
    key: string;
    selector: string;
    extract_type: ExtractType;
}

export type RepeaterStep = SourceUrlStep | DownloadFileStep | DataExtractStep;

export interface RepeaterNode {
    id: string;
    css_selector: string;
    label: string;
    steps: RepeaterStep[];
}

export interface ScopeModule {
    id: string;
    css_selector: string;
    label: string;
    repeater: RepeaterNode | null;
    pagination: PaginationConfig | null;
    children: ScopeModule[];
}

export interface PhaseConfig {
    before: BeforeAction[];
    chain: ScopeModule[];
}

export interface SourceUrlType {
    id: string;
    name: string;
    processing: PhaseConfig;
}

export interface ScrapingWorkflow {
    playwright_enabled: boolean;
    discovery: PhaseConfig;
    url_types: SourceUrlType[];
}

export type UnifiedWorkerBeforeAction =
    | { action: 'remove_element'; selector: string }
    | { action: 'wait_timeout'; ms: number }
    | { action: 'wait_selector'; selector: string; timeout?: number }
    | { action: 'wait_network'; state: 'networkidle' | 'domcontentloaded' | 'load' }
    | { action: 'click'; selector: string; wait_after?: number }
    | { action: 'scroll'; count: number; delay: number }
    | { action: 'fill'; selector: string; value: string; press_enter: boolean }
    | { action: 'select_option'; selector: string; value: string }
    | { action: 'evaluate'; script: string }
    | { action: 'screenshot'; filename: string };

export interface UnifiedWorkerField {
    name: string;
    selector: string;
    type: ExtractType;
}

export interface UnifiedWorkerPagination {
    selector: string;
    max_pages: number;
}

export interface UnifiedWorkerPhase {
    before: UnifiedWorkerBeforeAction[];
    scope: string | null;
    repeater: string | null;
    fields: UnifiedWorkerField[];
    pagination: UnifiedWorkerPagination | null;
}

export interface UnifiedWorkerProcessingPhase extends UnifiedWorkerPhase {
    url_type: string;
}

export interface UnifiedWorkerCrawlParams {
    playwright: boolean;
    discovery: UnifiedWorkerPhase;
    processing: UnifiedWorkerProcessingPhase[];
}
