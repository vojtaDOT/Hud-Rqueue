import {
    isContainerNode,
    type ScrapingWorkflowV2,
    type TimelineClickNode,
    type TimelineFillNode,
    type TimelineJavascriptNode,
    type TimelineNode,
    type TimelinePaginationNode,
    type TimelineRemoveElementNode,
    type TimelineRepeaterNode,
    type TimelineScrollNode,
    type TimelineScreenshotNode,
    type TimelineSelectOptionNode,
    type TimelineTimeoutNode,
    type TimelineWaitNetworkNode,
    type TimelineWaitSelectorNode,
    type UnifiedWorkerBeforeAction,
    type UnifiedWorkerCrawlParams,
    type UnifiedWorkerPaginationV2,
    type UnifiedWorkerPhaseV2,
    type UnifiedWorkerRepeaterNodeV2,
    type UnifiedWorkerRepeaterStepV2,
    type UnifiedWorkerScopeNodeV2,
} from './crawler-types';

type BeforeActionNode =
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

const BEFORE_ACTION_TYPES = new Set<TimelineNode['type']>([
    'remove_element',
    'wait_selector',
    'wait_network',
    'click',
    'scroll',
    'fill',
    'select_option',
    'timeout',
    'javascript',
    'screenshot',
]);

function isBeforeActionNode(node: TimelineNode): node is BeforeActionNode {
    return BEFORE_ACTION_TYPES.has(node.type);
}

function toWorkerBeforeAction(node: BeforeActionNode): UnifiedWorkerBeforeAction {
    switch (node.type) {
        case 'remove_element':
            return { action: 'remove_element', selector: node.selector };
        case 'wait_selector':
            return { action: 'wait_selector', selector: node.selector, timeout: node.timeoutMs };
        case 'wait_network':
            return { action: 'wait_network', state: node.state };
        case 'click':
            return { action: 'click', selector: node.selector, wait_after: node.waitAfterMs };
        case 'scroll':
            return { action: 'scroll', count: node.count, delay: node.delayMs };
        case 'fill':
            return {
                action: 'fill',
                selector: node.selector,
                value: node.value,
                press_enter: node.pressEnter,
            };
        case 'select_option':
            return { action: 'select_option', selector: node.selector, value: node.value };
        case 'timeout':
            return { action: 'wait_timeout', ms: node.ms };
        case 'javascript':
            return { action: 'evaluate', script: node.script };
        case 'screenshot':
            return { action: 'screenshot', filename: node.filename };
    }
}

function buildRepeaterSteps(children: TimelineNode[]): UnifiedWorkerRepeaterStepV2[] {
    const steps: UnifiedWorkerRepeaterStepV2[] = [];

    for (const child of children) {
        switch (child.type) {
            case 'source_url':
                steps.push({
                    type: 'source_url',
                    selector: child.emitParentUrl ? 'self' : child.selector,
                    url_type: child.urlType.trim(),
                    ...(child.emitParentUrl ? { emit_parent_url: true } : {}),
                });
                break;
            case 'document_url':
                steps.push({
                    type: 'document_url',
                    selector: child.selector,
                    filename_selector: child.filenameSelector?.trim() || 'self',
                });
                break;
            case 'download_file':
                steps.push({
                    type: 'download_file',
                    url_selector: child.urlSelector,
                    filename_selector: child.filenameSelector?.trim() || 'self',
                });
                break;
            case 'data_extract':
                for (const field of child.fields) {
                    steps.push({
                        type: 'data_extract',
                        key: field.key,
                        selector: field.selector,
                        extract: field.extractType,
                    });
                }
                break;
        }
    }

    return steps;
}

function findPagination(children: TimelineNode[]): UnifiedWorkerPaginationV2 | null {
    const pagination = children.find((node): node is TimelinePaginationNode => node.type === 'pagination');
    if (!pagination) return null;

    return {
        selector: pagination.selector,
        max_pages: pagination.maxPages,
        url: pagination.url
            ? {
                mode: pagination.url.mode,
                pattern: pagination.url.pattern,
                template: pagination.url.template,
                start_page: pagination.url.start_page,
                step: pagination.url.step,
            }
            : null,
    };
}

function buildRepeater(repeaterNode: TimelineRepeaterNode | undefined): UnifiedWorkerRepeaterNodeV2 | null {
    if (!repeaterNode) return null;

    const routeKeySelector = repeaterNode.routeKeySelector?.trim();

    return {
        selector: repeaterNode.selector,
        label: repeaterNode.label,
        ...(routeKeySelector
            ? {
                route_key_selector: routeKeySelector,
                route_key_extract: repeaterNode.routeKeyExtract ?? 'text',
            }
            : {}),
        steps: buildRepeaterSteps(repeaterNode.children),
    };
}

function buildScopeChain(nodes: TimelineNode[]): UnifiedWorkerScopeNodeV2[] {
    return nodes.flatMap((node) => {
        if (node.type !== 'scope') {
            return [];
        }

        const repeaterNode = node.children.find(
            (child): child is TimelineRepeaterNode => child.type === 'repeater',
        );

        return [{
            selector: node.selector,
            label: node.label,
            repeater: buildRepeater(repeaterNode),
            pagination: findPagination(node.children),
            children: buildScopeChain(node.children.filter((child) => child.type === 'scope')),
        }];
    });
}

function toWorkerPhaseV2(nodes: TimelineNode[]): UnifiedWorkerPhaseV2 {
    const before: UnifiedWorkerBeforeAction[] = [];
    const chainNodes: TimelineNode[] = [];

    for (const node of nodes) {
        if (isBeforeActionNode(node)) {
            before.push(toWorkerBeforeAction(node));
        } else {
            chainNodes.push(node);
        }
    }

    return {
        before,
        chain: buildScopeChain(chainNodes),
    };
}

function collectDiscoveryUrlTypes(nodes: TimelineNode[]): string[] {
    const urlTypes = new Set<string>();

    const walk = (items: TimelineNode[]) => {
        for (const node of items) {
            if (node.type === 'source_url' && node.urlType.trim()) {
                urlTypes.add(node.urlType.trim());
            }
            if (isContainerNode(node)) {
                walk(node.children);
            }
        }
    };

    walk(nodes);
    return [...urlTypes];
}

export function generateCrawlParamsV2(workflow: ScrapingWorkflowV2): UnifiedWorkerCrawlParams {
    const discovery = toWorkerPhaseV2(workflow.discovery);
    const discoveryUrlTypes = collectDiscoveryUrlTypes(workflow.discovery);
    const processPhase = workflow.process && workflow.process.length > 0
        ? toWorkerPhaseV2(workflow.process)
        : null;

    return {
        schema_version: 2,
        playwright: false,
        discovery,
        processing: processPhase && discoveryUrlTypes.length > 0
            ? discoveryUrlTypes.map((urlType) => ({
                url_type: urlType,
                before: processPhase.before,
                chain: processPhase.chain,
            }))
            : [],
    };
}
