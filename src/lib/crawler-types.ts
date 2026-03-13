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
    patternSelector?: string | null;
    matchCount?: number;
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

export type PaginationUrlMode = 'hybrid' | 'pattern';

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
    emit_parent_url?: boolean;
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
    route_key_selector?: string;
    route_key_extract?: ExtractType;
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
    emit_parent_url?: boolean;
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
    route_key_selector?: string;
    route_key_extract?: ExtractType;
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

export interface UnifiedWorkerCrawlParams {
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
    allow_html_documents?: boolean;
    use_playwright?: boolean;
    entry_link_selector?: string;
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

// ── V2 Timeline Node Types ──────────────────────────────────────────────

export type TimelineNodeType =
    | 'scope'
    | 'repeater'
    | 'source_url'
    | 'document_url'
    | 'download_file'
    | 'data_extract'
    | 'pagination'
    | 'remove_element'
    | 'wait_selector'
    | 'wait_network'
    | 'click'
    | 'scroll'
    | 'fill'
    | 'select_option'
    | 'timeout'
    | 'javascript'
    | 'screenshot';

export interface TimelineNodeBase {
    id: string;
    type: TimelineNodeType;
}

// Container nodes (have children)
export interface TimelineScopeNode extends TimelineNodeBase {
    type: 'scope';
    selector: string;
    label: string;
    children: TimelineNode[];
}

export interface TimelineRepeaterNode extends TimelineNodeBase {
    type: 'repeater';
    selector: string;
    label: string;
    routeKeySelector?: string;
    routeKeyExtract?: ExtractType;
    children: TimelineNode[];
}

// Leaf nodes
export interface TimelineSourceUrlNode extends TimelineNodeBase {
    type: 'source_url';
    selector: string;
    urlType: string;
    emitParentUrl?: boolean;
}

export interface TimelineDocumentUrlNode extends TimelineNodeBase {
    type: 'document_url';
    selector: string;
    filenameSelector?: string;
}

export interface TimelineDownloadFileNode extends TimelineNodeBase {
    type: 'download_file';
    urlSelector: string;
    filenameSelector?: string;
}

export interface DataExtractField {
    key: string;
    selector: string;
    extractType: ExtractType;
}

export interface TimelineDataExtractNode extends TimelineNodeBase {
    type: 'data_extract';
    groupLabel: string;
    fields: DataExtractField[];
}

export interface TimelinePaginationNode extends TimelineNodeBase {
    type: 'pagination';
    selector: string;
    maxPages: number;
    url: PaginationUrlConfig | null;
}

export interface TimelineRemoveElementNode extends TimelineNodeBase {
    type: 'remove_element';
    selector: string;
}

export interface TimelineWaitSelectorNode extends TimelineNodeBase {
    type: 'wait_selector';
    selector: string;
    timeoutMs: number;
}

export interface TimelineWaitNetworkNode extends TimelineNodeBase {
    type: 'wait_network';
    state: 'networkidle' | 'domcontentloaded' | 'load';
}

export interface TimelineClickNode extends TimelineNodeBase {
    type: 'click';
    selector: string;
    waitAfterMs: number;
}

export interface TimelineScrollNode extends TimelineNodeBase {
    type: 'scroll';
    count: number;
    delayMs: number;
}

export interface TimelineFillNode extends TimelineNodeBase {
    type: 'fill';
    selector: string;
    value: string;
    pressEnter: boolean;
}

export interface TimelineSelectOptionNode extends TimelineNodeBase {
    type: 'select_option';
    selector: string;
    value: string;
}

export interface TimelineTimeoutNode extends TimelineNodeBase {
    type: 'timeout';
    ms: number;
}

export interface TimelineJavascriptNode extends TimelineNodeBase {
    type: 'javascript';
    script: string;
}

export interface TimelineScreenshotNode extends TimelineNodeBase {
    type: 'screenshot';
    filename: string;
}

export type TimelineContainerNode = TimelineScopeNode | TimelineRepeaterNode;

export type TimelineLeafNode =
    | TimelineSourceUrlNode
    | TimelineDocumentUrlNode
    | TimelineDownloadFileNode
    | TimelineDataExtractNode
    | TimelinePaginationNode
    | TimelineRemoveElementNode
    | TimelineWaitSelectorNode
    | TimelineWaitNetworkNode
    | TimelineClickNode
    | TimelineScrollNode
    | TimelineFillNode
    | TimelineSelectOptionNode
    | TimelineTimeoutNode
    | TimelineJavascriptNode
    | TimelineScreenshotNode;

export type TimelineNode = TimelineContainerNode | TimelineLeafNode;

// V2 workflow envelope
export interface ScrapingWorkflowV2 {
    version: 2;
    strategy: 'path' | 'rss';
    singlePage: boolean;
    discovery: TimelineNode[];
    process: TimelineNode[] | null; // null when singlePage=true
}

// RSS input config (for rss strategy crawl_params extension)
export interface RssInputConfig {
    single_page: boolean;
    workflow: ScrapingWorkflowV2;
    xml_diff: {
        enabled: boolean;
        hash_algorithm: 'sha256';
    };
}

export function isContainerNode(node: TimelineNode): node is TimelineContainerNode {
    return node.type === 'scope' || node.type === 'repeater';
}

export function isTimelineV2(data: unknown): data is ScrapingWorkflowV2 {
    return (
        typeof data === 'object'
        && data !== null
        && 'version' in data
        && (data as Record<string, unknown>).version === 2
    );
}
