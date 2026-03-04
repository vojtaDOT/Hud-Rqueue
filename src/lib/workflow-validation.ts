import { hasPlaywrightBeforeAction } from '@/lib/crawler-export';
import {
    BeforeAction,
    PhaseConfig,
    RepeaterStep,
    ScopeModule,
    ScrapingWorkflow,
} from '@/lib/crawler-types';

function flattenScopes(scopes: ScopeModule[]): ScopeModule[] {
    const output: ScopeModule[] = [];
    const walk = (items: ScopeModule[]) => {
        for (const scope of items) {
            output.push(scope);
            walk(scope.children);
        }
    };
    walk(scopes);
    return output;
}

function getPhaseSteps(phase: PhaseConfig): RepeaterStep[] {
    return flattenScopes(phase.chain).flatMap((scope) => scope.repeater?.steps ?? []);
}

function hasSelectorAction(action: BeforeAction): action is
    | { type: 'remove_element'; css_selector: string }
    | { type: 'wait_selector'; css_selector: string; timeout_ms: number }
    | { type: 'click'; css_selector: string; wait_after_ms?: number }
    | { type: 'fill'; css_selector: string; value: string; press_enter: boolean }
    | { type: 'select_option'; css_selector: string; value: string } {
    return (
        action.type === 'remove_element'
        || action.type === 'wait_selector'
        || action.type === 'click'
        || action.type === 'fill'
        || action.type === 'select_option'
    );
}

function isPositiveInteger(value: number): boolean {
    return Number.isInteger(value) && value > 0;
}

export function validateWorkflow(workflow: ScrapingWorkflow): { error: string | null; warnings: string[] } {
    if (workflow.url_types.length < 1) {
        return { error: 'Musi existovat alespon jeden URL Type.', warnings: [] };
    }

    const validUrlTypeIds = new Set(workflow.url_types.map((item) => item.id));

    const sourceUrlSteps = getPhaseSteps(workflow.discovery).filter(
        (step) => step.type === 'source_url' && step.selector.trim().length > 0,
    );
    const documentUrlSteps = getPhaseSteps(workflow.discovery).filter(
        (step) => step.type === 'document_url' && step.selector.trim().length > 0,
    );
    if (sourceUrlSteps.length < 1 && documentUrlSteps.length < 1) {
        return { error: 'Phase 1 musi obsahovat alespon jeden source_url nebo document_url krok s CSS selektorem.', warnings: [] };
    }

    const allPhases: Array<{ phaseName: string; phase: PhaseConfig }> = [
        { phaseName: 'Discovery', phase: workflow.discovery },
        ...workflow.url_types.map((item) => ({
            phaseName: `Processing (${item.name})`,
            phase: item.processing,
        })),
    ];
    const warnings: string[] = [];
    const hasDiscoverySourceUrls = sourceUrlSteps.length > 0;
    const hasProcessingSteps = workflow.url_types.some((item) => getPhaseSteps(item.processing).length > 0);

    for (const { phaseName, phase } of allPhases) {
        const scopes = flattenScopes(phase.chain);

        for (const scope of scopes) {
            if (!scope.css_selector.trim()) {
                return { error: 'Kazdy Scope musi mit CSS selector.', warnings };
            }
            if (scope.repeater && !scope.repeater.css_selector.trim()) {
                return { error: 'Kazdy Repeater musi mit CSS selector.', warnings };
            }
            if (scope.pagination) {
                if (!Number.isFinite(scope.pagination.max_pages) || scope.pagination.max_pages < 0) {
                    return { error: 'Pagination max_pages musi byt cislo >= 0.', warnings };
                }

                if (!scope.pagination.url) {
                    return { error: 'Pagination URL konfigurace je povinna.', warnings };
                }

                const urlConfig = scope.pagination.url;
                if (urlConfig.mode !== 'hybrid' && urlConfig.mode !== 'url') {
                    return { error: 'Pagination URL mode musi byt hybrid nebo url.', warnings };
                }
                if (urlConfig.mode === 'hybrid' && !scope.pagination.css_selector.trim()) {
                    return { error: 'Pagination v hybrid mode musi mit CSS selector.', warnings };
                }
                if (!urlConfig.pattern.trim()) {
                    return { error: 'Pagination URL regex pattern je povinny.', warnings };
                }
                try {
                    new RegExp(urlConfig.pattern);
                } catch {
                    return { error: 'Pagination URL regex pattern je neplatny.', warnings };
                }
                if (!urlConfig.template.trim()) {
                    return { error: 'Pagination URL template je povinna.', warnings };
                }
                if (!urlConfig.template.includes('{page}')) {
                    return { error: 'Pagination URL template musi obsahovat {page}.', warnings };
                }
                if (!isPositiveInteger(urlConfig.start_page)) {
                    return { error: 'Pagination start_page musi byt cele cislo >= 1.', warnings };
                }
                if (!isPositiveInteger(urlConfig.step)) {
                    return { error: 'Pagination step musi byt cele cislo >= 1.', warnings };
                }
            }
        }

        const phaseSteps = getPhaseSteps(phase);
        const isDiscovery = phaseName === 'Discovery';
        if (phaseSteps.length < 1 && (isDiscovery || hasDiscoverySourceUrls)) {
            return { error: `${phaseName} musi obsahovat alespon jeden krok uvnitr Repeateru.`, warnings };
        }

        for (const step of phaseSteps) {
            if (step.type === 'source_url') {
                if (!step.selector.trim()) {
                    return { error: 'source_url krok vyzaduje selector.', warnings };
                }
                if (step.extract_type !== 'href') {
                    return { error: 'source_url krok musi mit extract_type=href.', warnings };
                }
                if (step.url_type_id && !validUrlTypeIds.has(step.url_type_id)) {
                    return { error: 'source_url krok odkazuje na neexistujici URL Type.', warnings };
                }
            }

            if (step.type === 'document_url' && !step.selector.trim()) {
                return { error: 'document_url krok vyzaduje selector.', warnings };
            }

            if (step.type === 'download_file' && !step.url_selector.trim()) {
                return { error: 'download_file krok vyzaduje url_selector.', warnings };
            }

            if (step.type === 'data_extract') {
                if (!step.key.trim() || !step.selector.trim()) {
                    return { error: 'data_extract krok vyzaduje key a selector.', warnings };
                }
                if (step.extract_type !== 'text' && step.extract_type !== 'href') {
                    return { error: 'data_extract podporuje jen extract_type text nebo href.', warnings };
                }
            }
        }

        if (!workflow.playwright_enabled && hasPlaywrightBeforeAction(phase.before)) {
            return { error: `${phaseName} obsahuje Playwright akce, ale Playwright rezim je vypnuty.`, warnings };
        }

        for (const action of phase.before) {
            if (hasSelectorAction(action) && !action.css_selector.trim()) {
                return { error: `${phaseName}: akce ${action.type} vyzaduje CSS selector.`, warnings };
            }

            if (action.type === 'evaluate' && !action.script.trim()) {
                return { error: `${phaseName}: akce evaluate vyzaduje script.`, warnings };
            }
        }
    }

    if (!hasDiscoverySourceUrls && hasProcessingSteps) {
        warnings.push('Phase 2 je vyplnena, ale Discovery neobsahuje source_url. Processing se nepouzije.');
    }

    return { error: null, warnings };
}
