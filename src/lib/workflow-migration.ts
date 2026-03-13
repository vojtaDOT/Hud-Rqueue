import type {
    BeforeAction,
    DataExtractStep,
    DownloadFileStep,
    DocumentUrlStep,
    RepeaterStep,
    ScrapingWorkflow,
    ScrapingWorkflowV2,
    ScopeModule,
    SourceUrlStep,
    TimelineClickNode,
    TimelineDataExtractNode,
    TimelineDocumentUrlNode,
    TimelineJavascriptNode,
    TimelineNode,
    TimelineRepeaterNode,
    TimelineScopeNode,
    TimelineSourceUrlNode,
    TimelineTimeoutNode,
} from '@/lib/crawler-types';
import { createId } from '@/lib/workflow-tree';

/** V1 before action types that are still unsupported in V2 timeline */
const DROPPED_BEFORE_TYPES = new Set<string>();

interface MigrationResult {
    workflow: ScrapingWorkflowV2;
    droppedSteps: string[];
}

function migrateBeforeAction(action: BeforeAction, warnings: string[]): TimelineNode | null {
    switch (action.type) {
        case 'remove_element':
            return {
                id: createId('step'),
                type: 'remove_element',
                selector: action.css_selector,
            };

        case 'wait_selector':
            return {
                id: createId('step'),
                type: 'wait_selector',
                selector: action.css_selector,
                timeoutMs: action.timeout_ms,
            };

        case 'wait_network':
            return {
                id: createId('step'),
                type: 'wait_network',
                state: action.state,
            };

        case 'click':
            return {
                id: createId('step'),
                type: 'click',
                selector: action.css_selector,
                waitAfterMs: action.wait_after_ms ?? 500,
            } satisfies TimelineClickNode;

        case 'scroll':
            return {
                id: createId('step'),
                type: 'scroll',
                count: action.count,
                delayMs: action.delay_ms,
            };

        case 'fill':
            return {
                id: createId('step'),
                type: 'fill',
                selector: action.css_selector,
                value: action.value,
                pressEnter: action.press_enter,
            };

        case 'select_option':
            return {
                id: createId('step'),
                type: 'select_option',
                selector: action.css_selector,
                value: action.value,
            };

        case 'wait_timeout':
            return {
                id: createId('step'),
                type: 'timeout',
                ms: action.ms,
            } satisfies TimelineTimeoutNode;

        case 'evaluate':
            return {
                id: createId('step'),
                type: 'javascript',
                script: action.script,
            } satisfies TimelineJavascriptNode;

        case 'screenshot':
            return {
                id: createId('step'),
                type: 'screenshot',
                filename: action.filename,
            };

        default:
            if (DROPPED_BEFORE_TYPES.has(action.type)) {
                warnings.push(`Akce "${action.type}" byla odebrána (nepodporována ve v2).`);
            }
            return null;
    }
}

function migrateRepeaterStep(
    step: RepeaterStep,
    urlTypeNamesById: Map<string, string>,
    warnings: string[],
): TimelineNode | null {
    switch (step.type) {
        case 'source_url':
            return {
                id: createId('step'),
                type: 'source_url',
                selector: (step as SourceUrlStep).selector,
                urlType: urlTypeNamesById.get((step as SourceUrlStep).url_type_id ?? '') ?? 'detail',
                emitParentUrl: (step as SourceUrlStep).emit_parent_url ?? false,
            } satisfies TimelineSourceUrlNode;

        case 'document_url':
            return {
                id: createId('step'),
                type: 'document_url',
                selector: (step as DocumentUrlStep).selector,
                filenameSelector: (step as DocumentUrlStep).filename_selector ?? '',
            } satisfies TimelineDocumentUrlNode;

        case 'download_file':
            return {
                id: createId('step'),
                type: 'download_file',
                urlSelector: (step as DownloadFileStep).url_selector,
                filenameSelector: (step as DownloadFileStep).filename_selector ?? '',
            };

        case 'data_extract': {
            const de = step as DataExtractStep;
            return {
                id: createId('step'),
                type: 'data_extract',
                groupLabel: de.key || 'Imported',
                fields: [{
                    key: de.key,
                    selector: de.selector,
                    extractType: de.extract_type,
                }],
            } satisfies TimelineDataExtractNode;
        }

        default:
            return null;
    }
}

function migrateScopeModule(
    scope: ScopeModule,
    urlTypeNamesById: Map<string, string>,
    warnings: string[],
): TimelineScopeNode {
    const children: TimelineNode[] = [];

    // Migrate repeater if present
    if (scope.repeater) {
        const repeaterChildren: TimelineNode[] = [];
        for (const step of scope.repeater.steps) {
            const migrated = migrateRepeaterStep(step, urlTypeNamesById, warnings);
            if (migrated) repeaterChildren.push(migrated);
        }

        const repeaterNode: TimelineRepeaterNode = {
            id: createId('repeater'),
            type: 'repeater',
            selector: scope.repeater.css_selector,
            label: scope.repeater.label,
            routeKeySelector: scope.repeater.route_key_selector ?? '',
            routeKeyExtract: scope.repeater.route_key_extract ?? 'text',
            children: repeaterChildren,
        };
        children.push(repeaterNode);
    }

    // Migrate pagination if present
    if (scope.pagination && scope.pagination.css_selector) {
        children.push({
            id: createId('step'),
            type: 'pagination',
            selector: scope.pagination.css_selector,
            maxPages: scope.pagination.max_pages,
            url: scope.pagination.url,
        });
    }

    // Migrate child scopes recursively
    for (const child of scope.children) {
        children.push(migrateScopeModule(child, urlTypeNamesById, warnings));
    }

    return {
        id: createId('scope'),
        type: 'scope',
        selector: scope.css_selector,
        label: scope.label,
        children,
    };
}

function migratePhaseToTimeline(
    before: BeforeAction[],
    chain: ScopeModule[],
    urlTypeNamesById: Map<string, string>,
    warnings: string[],
): TimelineNode[] {
    const nodes: TimelineNode[] = [];

    // Migrate before actions
    for (const action of before) {
        const migrated = migrateBeforeAction(action, warnings);
        if (migrated) nodes.push(migrated);
    }

    // Migrate scope chain
    for (const scope of chain) {
        nodes.push(migrateScopeModule(scope, urlTypeNamesById, warnings));
    }

    return nodes;
}

/**
 * Migrate a V1 ScrapingWorkflow to V2 ScrapingWorkflowV2.
 * Returns the migrated workflow + array of user-facing warning messages
 * for any dropped/unsupported step types.
 */
export function migrateV1toV2(v1: ScrapingWorkflow): MigrationResult {
    const warnings: string[] = [];
    const urlTypeNamesById = new Map(v1.url_types.map((urlType) => [urlType.id, urlType.name]));

    // Migrate discovery phase
    const discovery = migratePhaseToTimeline(
        v1.discovery.before,
        v1.discovery.chain,
        urlTypeNamesById,
        warnings,
    );

    // Migrate first url_type's processing phase (if any)
    let process: TimelineNode[] | null = null;
    if (v1.url_types.length > 0) {
        if (v1.url_types.length > 1) {
            warnings.push(
                `V1 měl ${v1.url_types.length} url_types — v2 podporuje pouze jeden Process. Importován pouze první typ "${v1.url_types[0].name}".`,
            );
        }
        const firstType = v1.url_types[0];
        process = migratePhaseToTimeline(
            firstType.processing.before,
            firstType.processing.chain,
            urlTypeNamesById,
            warnings,
        );
    }

    const workflow: ScrapingWorkflowV2 = {
        version: 2,
        strategy: 'path',
        singlePage: process === null || process.length === 0,
        discovery,
        process: process && process.length > 0 ? process : null,
    };

    return { workflow, droppedSteps: warnings };
}

/**
 * Detect whether unknown data is a V1 ScrapingWorkflow shape.
 */
export function isV1Workflow(data: unknown): data is ScrapingWorkflow {
    if (!data || typeof data !== 'object') return false;
    const obj = data as Record<string, unknown>;
    return (
        'discovery' in obj
        && 'url_types' in obj
        && !('version' in obj)
    );
}
