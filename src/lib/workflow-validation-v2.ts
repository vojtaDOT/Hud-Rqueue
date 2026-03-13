import type {
    ScrapingWorkflowV2,
    TimelineNode,
    TimelineRepeaterNode,
    TimelineScopeNode,
} from './crawler-types';
import { buildListSourceConfig } from './list-source-contract';
import { generateCrawlParamsV2 } from './crawler-export-v2';

function validateScopeNode(scope: TimelineScopeNode, phaseName: string): string | null {
    if (!scope.selector.trim()) {
        return `${phaseName}: Scope musí mít CSS selektor.`;
    }

    let repeaterCount = 0;
    let paginationCount = 0;

    for (const child of scope.children) {
        if (child.type === 'repeater') repeaterCount += 1;
        if (child.type === 'pagination') paginationCount += 1;
        if (child.type !== 'scope' && child.type !== 'repeater' && child.type !== 'pagination') {
            return `${phaseName}: Scope může obsahovat jen Scope, Repeater nebo Pagination.`;
        }
    }

    if (repeaterCount > 1) {
        return `${phaseName}: Scope může obsahovat jen jeden Repeater.`;
    }

    if (paginationCount > 1) {
        return `${phaseName}: Scope může obsahovat jen jednu Pagination.`;
    }

    return null;
}

function validateRepeaterNode(repeater: TimelineRepeaterNode, phaseName: string): string | null {
    if (!repeater.selector.trim()) {
        return `${phaseName}: Repeater musí mít CSS selektor.`;
    }

    for (const child of repeater.children) {
        if (
            child.type !== 'source_url'
            && child.type !== 'document_url'
            && child.type !== 'download_file'
            && child.type !== 'data_extract'
        ) {
            return `${phaseName}: Repeater může obsahovat jen Source URL, Document URL, Download File nebo Data Extract.`;
        }
    }

    return null;
}

function validateNodeTree(phaseName: string, nodes: TimelineNode[], atRoot = true): string | null {
    for (const node of nodes) {
        if (atRoot && node.type !== 'scope' && ![
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
        ].includes(node.type)) {
            return `${phaseName}: Root fáze může obsahovat jen before akce a Scope.`;
        }

        switch (node.type) {
            case 'scope': {
                const error = validateScopeNode(node, phaseName);
                if (error) return error;
                const childError = validateNodeTree(phaseName, node.children, false);
                if (childError) return childError;
                break;
            }
            case 'repeater': {
                const error = validateRepeaterNode(node, phaseName);
                if (error) return error;
                const childError = validateNodeTree(phaseName, node.children, false);
                if (childError) return childError;
                break;
            }
            case 'source_url':
                if (!node.selector.trim() && node.emitParentUrl !== true) {
                    return `${phaseName}: Source URL krok vyžaduje selektor.`;
                }
                if (!node.urlType.trim()) {
                    return `${phaseName}: Source URL krok vyžaduje url_type.`;
                }
                break;
            case 'document_url':
                if (!node.selector.trim()) {
                    return `${phaseName}: Document URL krok vyžaduje selektor.`;
                }
                break;
            case 'download_file':
                if (!node.urlSelector.trim()) {
                    return `${phaseName}: Download File krok vyžaduje url selector.`;
                }
                break;
            case 'data_extract':
                if (node.fields.length === 0) {
                    return `${phaseName}: Data Extract musí mít alespoň jedno pole.`;
                }
                for (const field of node.fields) {
                    if (!field.key.trim()) {
                        return `${phaseName}: Data Extract pole musí mít klíč.`;
                    }
                    if (!field.selector.trim()) {
                        return `${phaseName}: Data Extract pole "${field.key}" musí mít selektor.`;
                    }
                }
                break;
            case 'pagination':
                if (!node.selector.trim()) {
                    return `${phaseName}: Pagination musí mít CSS selektor.`;
                }
                if (!Number.isFinite(node.maxPages) || node.maxPages < 0) {
                    return `${phaseName}: Pagination max_pages musí být číslo >= 0.`;
                }
                if (node.url) {
                    if (node.url.mode !== 'hybrid' && node.url.mode !== 'pattern') {
                        return `${phaseName}: Pagination URL mode musí být hybrid nebo pattern.`;
                    }
                    if (!node.url.pattern.trim()) {
                        return `${phaseName}: Pagination URL regex pattern je povinný.`;
                    }
                    if (!node.url.template.trim() || !node.url.template.includes('{page}')) {
                        return `${phaseName}: Pagination URL template musí obsahovat {page}.`;
                    }
                    if (!Number.isFinite(node.url.start_page) || node.url.start_page < 1) {
                        return `${phaseName}: Pagination start_page musí být číslo >= 1.`;
                    }
                    if (!Number.isFinite(node.url.step) || node.url.step < 1) {
                        return `${phaseName}: Pagination step musí být číslo >= 1.`;
                    }
                }
                break;
            case 'remove_element':
            case 'wait_selector':
            case 'click':
            case 'fill':
            case 'select_option':
                if (!node.selector.trim()) {
                    return `${phaseName}: Akce "${node.type}" vyžaduje CSS selektor.`;
                }
                break;
            case 'wait_network':
                break;
            case 'scroll':
                if (!Number.isFinite(node.count) || node.count < 1) {
                    return `${phaseName}: Scroll count musí být číslo >= 1.`;
                }
                if (!Number.isFinite(node.delayMs) || node.delayMs < 0) {
                    return `${phaseName}: Scroll delay musí být číslo >= 0.`;
                }
                break;
            case 'timeout':
                if (!Number.isFinite(node.ms) || node.ms < 0) {
                    return `${phaseName}: Timeout musí být číslo >= 0.`;
                }
                break;
            case 'javascript':
                if (!node.script.trim()) {
                    return `${phaseName}: Evaluate krok vyžaduje skript.`;
                }
                break;
            case 'screenshot':
                if (!node.filename.trim()) {
                    return `${phaseName}: Screenshot krok vyžaduje filename.`;
                }
                break;
        }
    }

    return null;
}

export function validateWorkflowV2(
    workflow: ScrapingWorkflowV2,
    options?: { playwrightEnabled?: boolean },
): {
    error: string | null;
    warnings: string[];
} {
    const warnings: string[] = [];

    const discoveryError = validateNodeTree('Discovery', workflow.discovery, true);
    if (discoveryError) {
        return { error: discoveryError, warnings };
    }

    if (!workflow.singlePage && workflow.process) {
        const processError = validateNodeTree('Process', workflow.process, true);
        if (processError) {
            return { error: processError, warnings };
        }
    }

    try {
        buildListSourceConfig({
            ...generateCrawlParamsV2(workflow),
            playwright: options?.playwrightEnabled ?? false,
        });
    } catch (error) {
        const issueMessage = (
            typeof error === 'object'
            && error !== null
            && 'issues' in error
            && Array.isArray((error as { issues?: Array<{ message?: string }> }).issues)
            && (error as { issues?: Array<{ message?: string }> }).issues?.[0]?.message
        )
            ? (error as { issues: Array<{ message: string }> }).issues[0].message
            : null;

        return {
            error: issueMessage ?? (error instanceof Error ? error.message : 'Konfigurace zdroje neni kompletni.'),
            warnings,
        };
    }

    return { error: null, warnings };
}
