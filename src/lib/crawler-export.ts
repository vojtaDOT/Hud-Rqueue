// Functions for exporting crawler configuration

import {
    BeforeAction,
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
import { renderTemplate, CRAWL_PARAMS_LIST_TEMPLATE } from './templates';

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
                url: scope.pagination.url
                    ? {
                        mode: scope.pagination.url.mode,
                        pattern: scope.pagination.url.pattern,
                        template: scope.pagination.url.template,
                        start_page: scope.pagination.url.start_page,
                        step: scope.pagination.url.step,
                    }
                    : null,
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

    return renderTemplate<UnifiedWorkerCrawlParams>(
        CRAWL_PARAMS_LIST_TEMPLATE as unknown as Record<string, unknown>,
        {
            contract_metadata: {},
            playwright: workflowData.playwright_enabled,
            discovery: toWorkerPhase(workflowData.discovery, resolveUrlTypeName),
            processing: workflowData.url_types.map((urlType) => ({
                url_type: urlType.name.trim() || urlType.id,
                ...toWorkerPhase(urlType.processing, resolveUrlTypeName),
            })),
        },
    );
}
