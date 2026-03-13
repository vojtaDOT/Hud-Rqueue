// V2 workflow → worker crawl_params export

import {
    isContainerNode,
    type ScrapingWorkflowV2,
    type TimelineNode,
    type TimelineClickNode,
    type TimelineTimeoutNode,
    type TimelineJavascriptNode,
    type TimelineRepeaterNode,
    type TimelinePaginationNode,
    type UnifiedWorkerBeforeAction,
    type UnifiedWorkerCrawlParams,
    type UnifiedWorkerPhaseV2,
    type UnifiedWorkerScopeNodeV2,
    type UnifiedWorkerRepeaterStepV2,
    type UnifiedWorkerPaginationV2,
    type UnifiedWorkerRepeaterNodeV2,
} from './crawler-types';

// ── Before-action nodes (click, timeout, javascript) ───────────────────

type BeforeActionNode = TimelineClickNode | TimelineTimeoutNode | TimelineJavascriptNode;

const BEFORE_ACTION_TYPES = new Set(['click', 'timeout', 'javascript']);

function isBeforeActionNode(node: TimelineNode): node is BeforeActionNode {
    return BEFORE_ACTION_TYPES.has(node.type);
}

function toWorkerBeforeAction(node: BeforeActionNode): UnifiedWorkerBeforeAction {
    switch (node.type) {
        case 'click':
            return { action: 'click', selector: node.selector, wait_after: node.waitAfterMs };
        case 'timeout':
            return { action: 'wait_timeout', ms: node.ms };
        case 'javascript':
            return { action: 'evaluate', script: node.script };
    }
}

// ── Chain nodes (scope, repeater, source_url, document_url, data_extract, pagination) ──

function buildRepeaterSteps(children: TimelineNode[]): UnifiedWorkerRepeaterStepV2[] {
    const steps: UnifiedWorkerRepeaterStepV2[] = [];
    for (const child of children) {
        switch (child.type) {
            case 'source_url':
                steps.push({
                    type: 'source_url',
                    selector: child.selector,
                    url_type: child.urlType || 'default',
                });
                break;
            case 'document_url':
                steps.push({
                    type: 'document_url',
                    selector: child.selector,
                    filename_selector: child.filenameSelector?.trim() || 'self',
                });
                break;
            case 'data_extract': {
                for (const field of child.fields) {
                    steps.push({
                        type: 'data_extract',
                        key: field.key,
                        extract: field.extractType,
                        selector: field.selector,
                    });
                }
                break;
            }
            // Other types inside repeater are ignored (pagination, click, timeout, javascript)
        }
    }
    return steps;
}

function findPagination(children: TimelineNode[]): UnifiedWorkerPaginationV2 | null {
    const pag = children.find((n): n is TimelinePaginationNode => n.type === 'pagination');
    if (!pag) return null;
    return {
        selector: pag.selector,
        max_pages: pag.maxPages,
        url: pag.url
            ? {
                mode: pag.url.mode,
                pattern: pag.url.pattern,
                template: pag.url.template,
                start_page: pag.url.start_page,
                step: pag.url.step,
            }
            : null,
    };
}

function buildScopeChain(nodes: TimelineNode[]): UnifiedWorkerScopeNodeV2[] {
    const scopes: UnifiedWorkerScopeNodeV2[] = [];

    for (const node of nodes) {
        if (node.type === 'scope') {
            // Find repeater child, pagination child, and nested scopes
            const repeaterChild = node.children.find(
                (n): n is TimelineRepeaterNode => n.type === 'repeater',
            );
            const pagination = findPagination(node.children);

            let repeater: UnifiedWorkerRepeaterNodeV2 | null = null;
            if (repeaterChild) {
                repeater = {
                    selector: repeaterChild.selector,
                    label: repeaterChild.label,
                    steps: buildRepeaterSteps(repeaterChild.children),
                };
            }

            scopes.push({
                selector: node.selector,
                label: node.label,
                repeater,
                pagination,
                children: buildScopeChain(node.children.filter((n) => n.type === 'scope')),
            });
        } else if (node.type === 'repeater') {
            // Top-level repeater without a scope wrapper — create an implicit scope
            scopes.push({
                selector: 'html',
                label: 'Automatický scope',
                repeater: {
                    selector: node.selector,
                    label: node.label,
                    steps: buildRepeaterSteps(node.children),
                },
                pagination: findPagination(node.children),
                children: [],
            });
        }
    }

    return scopes;
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

// ── Public export ──────────────────────────────────────────────────────

export function generateCrawlParamsV2(workflow: ScrapingWorkflowV2): UnifiedWorkerCrawlParams {
    const discovery = toWorkerPhaseV2(workflow.discovery);

    // Determine if playwright is needed (click/timeout/javascript in discovery or process)
    const hasPlaywrightActions = (nodes: TimelineNode[]): boolean => {
        for (const node of nodes) {
            if (node.type === 'click' || node.type === 'javascript') return true;
            if (isContainerNode(node)) {
                if (hasPlaywrightActions(node.children)) return true;
            }
        }
        return false;
    };

    const playwright = hasPlaywrightActions(workflow.discovery)
        || (workflow.process ? hasPlaywrightActions(workflow.process) : false);

    // Process phase → single "default" processing entry
    const processing = workflow.process && workflow.process.length > 0
        ? [{ url_type: 'default', ...toWorkerPhaseV2(workflow.process) }]
        : [];

    return {
        schema_version: 2,
        playwright,
        discovery,
        processing,
    };
}
