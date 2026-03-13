// V2 workflow validation

import {
    isContainerNode,
    type ScrapingWorkflowV2,
    type TimelineNode,
    type TimelineScopeNode,
    type TimelineRepeaterNode,
    type TimelineDataExtractNode,
    type TimelinePaginationNode,
} from './crawler-types';

function flattenNodes(nodes: TimelineNode[]): TimelineNode[] {
    const result: TimelineNode[] = [];
    const walk = (items: TimelineNode[]) => {
        for (const node of items) {
            result.push(node);
            if (isContainerNode(node)) {
                walk(node.children);
            }
        }
    };
    walk(nodes);
    return result;
}

function validatePhaseNodes(
    phaseName: string,
    nodes: TimelineNode[],
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- reserved for future per-node warnings
    warnings: string[],
): string | null {
    const allNodes = flattenNodes(nodes);

    for (const node of allNodes) {
        switch (node.type) {
            case 'scope': {
                const scope = node as TimelineScopeNode;
                if (!scope.selector.trim()) {
                    return `${phaseName}: Scope musí mít CSS selektor.`;
                }
                break;
            }
            case 'repeater': {
                const rep = node as TimelineRepeaterNode;
                if (!rep.selector.trim()) {
                    return `${phaseName}: Repeater musí mít CSS selektor.`;
                }
                break;
            }
            case 'source_url':
                if (!node.selector.trim()) {
                    return `${phaseName}: Source URL krok vyžaduje selektor.`;
                }
                break;
            case 'document_url':
                if (!node.selector.trim()) {
                    return `${phaseName}: Document URL krok vyžaduje selektor.`;
                }
                break;
            case 'data_extract': {
                const extract = node as TimelineDataExtractNode;
                if (extract.fields.length === 0) {
                    return `${phaseName}: Data Extract musí mít alespoň jedno pole.`;
                }
                for (const field of extract.fields) {
                    if (!field.key.trim()) {
                        return `${phaseName}: Data Extract pole musí mít klíč.`;
                    }
                    if (!field.selector.trim()) {
                        return `${phaseName}: Data Extract pole "${field.key}" musí mít selektor.`;
                    }
                    if (field.extractType !== 'text' && field.extractType !== 'href') {
                        return `${phaseName}: Data Extract podporuje jen typ text nebo href.`;
                    }
                }
                break;
            }
            case 'pagination': {
                const pag = node as TimelinePaginationNode;
                if (!pag.selector.trim()) {
                    return `${phaseName}: Pagination musí mít CSS selektor.`;
                }
                if (!Number.isFinite(pag.maxPages) || pag.maxPages < 0) {
                    return `${phaseName}: Pagination max_pages musí být číslo >= 0.`;
                }
                if (pag.url) {
                    if (pag.url.mode !== 'hybrid' && pag.url.mode !== 'pattern') {
                        return `${phaseName}: Pagination URL mode musí být hybrid nebo pattern.`;
                    }
                    if (!pag.url.pattern.trim()) {
                        return `${phaseName}: Pagination URL regex pattern je povinný.`;
                    }
                    try {
                        new RegExp(pag.url.pattern);
                    } catch {
                        return `${phaseName}: Pagination URL regex pattern je neplatný.`;
                    }
                    if (!pag.url.template.trim()) {
                        return `${phaseName}: Pagination URL template je povinná.`;
                    }
                    if (!pag.url.template.includes('{page}')) {
                        return `${phaseName}: Pagination URL template musí obsahovat {page}.`;
                    }
                    if (!Number.isFinite(pag.url.start_page) || pag.url.start_page < 1) {
                        return `${phaseName}: Pagination start_page musí být číslo >= 1.`;
                    }
                    if (!Number.isFinite(pag.url.step) || pag.url.step < 1) {
                        return `${phaseName}: Pagination step musí být číslo >= 1.`;
                    }
                }
                break;
            }
            case 'click':
                if (!node.selector.trim()) {
                    return `${phaseName}: Click krok vyžaduje CSS selektor.`;
                }
                break;
            case 'timeout':
                if (!Number.isFinite(node.ms) || node.ms < 0) {
                    return `${phaseName}: Timeout musí být číslo >= 0.`;
                }
                break;
            case 'javascript':
                if (!node.script.trim()) {
                    return `${phaseName}: JavaScript krok vyžaduje skript.`;
                }
                break;
        }
    }

    return null;
}

export function validateWorkflowV2(workflow: ScrapingWorkflowV2): {
    error: string | null;
    warnings: string[];
} {
    const warnings: string[] = [];

    // Discovery must have nodes
    if (workflow.discovery.length === 0) {
        return { error: 'Discovery musí obsahovat alespoň jeden krok.', warnings };
    }

    // Check discovery has at least one source_url or document_url (possibly nested)
    const allDiscovery = flattenNodes(workflow.discovery);
    const hasSourceUrl = allDiscovery.some((n) => n.type === 'source_url');
    const hasDocumentUrl = allDiscovery.some((n) => n.type === 'document_url');
    if (!hasSourceUrl && !hasDocumentUrl) {
        return {
            error: 'Discovery musí obsahovat alespoň jeden Source URL nebo Document URL krok.',
            warnings,
        };
    }

    // Validate discovery nodes
    const discoveryError = validatePhaseNodes('Discovery', workflow.discovery, warnings);
    if (discoveryError) {
        return { error: discoveryError, warnings };
    }

    // If not singlePage, process should exist
    if (!workflow.singlePage) {
        if (!workflow.process || workflow.process.length === 0) {
            // Not an error, just a warning — processing is optional
            if (hasSourceUrl) {
                warnings.push('Process fáze je prázdná, ale Discovery obsahuje Source URL. Processing se neprovede.');
            }
        } else {
            const processError = validatePhaseNodes('Process', workflow.process, warnings);
            if (processError) {
                return { error: processError, warnings };
            }
        }
    }

    return { error: null, warnings };
}
