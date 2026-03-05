import type { WorkerContractMetadataV11 } from './worker-contract-metadata';

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

// Worker Runtime Config - matches worker-runtime-minimal-template.json
export interface WorkerRuntimePayloadTemplate {
    [key: string]: string | number;
}

export interface WorkerRuntimeEnqueueConfig {
    required_fields: string[];
    payload_template: WorkerRuntimePayloadTemplate;
}

export type ExtractType = 'text' | 'href';

export type PaginationUrlMode = 'hybrid' | 'url';

export interface PaginationUrlConfig {
    mode: PaginationUrlMode;
    pattern: string;
    template: string;
    start_page: number;
    step: number;
}

export interface PaginationConfig {
    css_selector: string;
    max_pages: number;
    url: PaginationUrlConfig | null;
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

export interface DocumentUrlStep {
    id: string;
    type: 'document_url';
    selector: string;
    filename_selector?: string;
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

export type RepeaterStep = SourceUrlStep | DocumentUrlStep | DownloadFileStep | DataExtractStep;

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

export interface UnifiedWorkerDataItem {
    type: 'data_extract';
    key: string;
    extract: ExtractType;
    selector: string;
}

export interface UnifiedWorkerSourceUrlStepV2 {
    type: 'source_url';
    selector: string;
    url_type: string;
}

export interface UnifiedWorkerDocumentUrlStepV2 {
    type: 'document_url';
    selector: string;
    filename_selector: string;
}

export interface UnifiedWorkerDownloadFileStepV2 {
    type: 'download_file';
    url_selector: string;
    filename_selector: string;
}

export type UnifiedWorkerRepeaterStepV2 =
    | UnifiedWorkerSourceUrlStepV2
    | UnifiedWorkerDocumentUrlStepV2
    | UnifiedWorkerDownloadFileStepV2
    | UnifiedWorkerDataItem;

export interface UnifiedWorkerPaginationV2 {
    selector: string;
    max_pages: number;
    url?: {
        mode: PaginationUrlMode;
        pattern: string;
        template: string;
        start_page: number;
        step: number;
    } | null;
}

export interface UnifiedWorkerRepeaterNodeV2 {
    selector: string;
    label: string;
    steps: UnifiedWorkerRepeaterStepV2[];
}

export interface UnifiedWorkerScopeNodeV2 {
    selector: string;
    label: string;
    repeater: UnifiedWorkerRepeaterNodeV2 | null;
    pagination: UnifiedWorkerPaginationV2 | null;
    children: UnifiedWorkerScopeNodeV2[];
}

export interface UnifiedWorkerPhaseV2 {
    before: UnifiedWorkerBeforeAction[];
    chain: UnifiedWorkerScopeNodeV2[];
}

export interface UnifiedWorkerProcessingPhaseV2 extends UnifiedWorkerPhaseV2 {
    url_type: string;
}

export interface UnifiedWorkerCrawlParams extends Partial<WorkerContractMetadataV11> {
    schema_version: 2;
    playwright: boolean;
    discovery: UnifiedWorkerPhaseV2;
    processing: UnifiedWorkerProcessingPhaseV2[];
}

export interface RssCrawlParamsV1 extends Partial<WorkerContractMetadataV11> {
    schema_version: 1;
    strategy: 'rss';
    feed_url: string;
    item_identity: 'link_then_guid';
    route: {
        emit_to: 'source_urls';
    };
    fetch: {
        timeout_ms: number;
    };
}

export const PLAYWRIGHT_ACTION_TYPES = new Set<BeforeAction['type']>([
    'wait_selector',
    'wait_network',
    'click',
    'scroll',
    'fill',
    'select_option',
    'evaluate',
    'screenshot',
]);
