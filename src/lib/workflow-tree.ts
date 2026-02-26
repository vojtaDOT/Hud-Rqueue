import type {
    BeforeAction,
    DataExtractStep,
    DocumentUrlStep,
    DownloadFileStep,
    PhaseConfig,
    PlaywrightAction,
    RepeaterNode,
    RepeaterStep,
    ScopeModule,
    SourceUrlStep,
} from '@/lib/crawler-types';

export type SelectorKey = 'selector' | 'url_selector' | 'filename_selector';

export type FocusTarget =
    | { phase: 'discovery'; section: 'before'; index: number }
    | { phase: 'discovery'; section: 'scope'; scopeId: string }
    | { phase: 'discovery'; section: 'repeater'; repeaterId: string }
    | { phase: 'discovery'; section: 'step'; stepId: string; selectorKey: SelectorKey }
    | { phase: 'discovery'; section: 'pagination'; scopeId: string }
    | { phase: 'processing'; urlTypeId: string; section: 'before'; index: number }
    | { phase: 'processing'; urlTypeId: string; section: 'scope'; scopeId: string }
    | { phase: 'processing'; urlTypeId: string; section: 'repeater'; repeaterId: string }
    | { phase: 'processing'; urlTypeId: string; section: 'step'; stepId: string; selectorKey: SelectorKey }
    | { phase: 'processing'; urlTypeId: string; section: 'pagination'; scopeId: string };

export interface RepeaterRef {
    scopeId: string;
    scopeLabel: string;
    repeaterId: string;
    repeaterLabel: string;
}

export interface ScopeRef {
    scopeId: string;
    scopeLabel: string;
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

export function createId(prefix: string): string {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return `${prefix}-${crypto.randomUUID()}`;
    }
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function moveItem<T>(items: T[], fromIndex: number, toIndex: number): T[] {
    if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0 || fromIndex >= items.length || toIndex >= items.length) {
        return items;
    }
    const next = [...items];
    const [moved] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, moved);
    return next;
}

export function isPlaywrightBeforeAction(action: BeforeAction): action is PlaywrightAction {
    return PLAYWRIGHT_ACTION_TYPES.has(action.type);
}

export function actionHasSelector(action: BeforeAction): action is
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

export function createDefaultBeforeAction(type: BeforeAction['type']): BeforeAction {
    switch (type) {
        case 'remove_element':
            return { type: 'remove_element', css_selector: '' };
        case 'wait_timeout':
            return { type: 'wait_timeout', ms: 1000 };
        case 'wait_selector':
            return { type: 'wait_selector', css_selector: '', timeout_ms: 10000 };
        case 'wait_network':
            return { type: 'wait_network', state: 'networkidle' };
        case 'click':
            return { type: 'click', css_selector: '', wait_after_ms: 500 };
        case 'scroll':
            return { type: 'scroll', count: 3, delay_ms: 500 };
        case 'fill':
            return { type: 'fill', css_selector: '', value: '', press_enter: false };
        case 'select_option':
            return { type: 'select_option', css_selector: '', value: '' };
        case 'evaluate':
            return { type: 'evaluate', script: '' };
        case 'screenshot':
            return { type: 'screenshot', filename: 'debug.png' };
        default:
            return { type: 'wait_timeout', ms: 1000 };
    }
}

export function createScopeModule(): ScopeModule {
    return {
        id: createId('scope'),
        css_selector: '',
        label: '',
        repeater: null,
        pagination: null,
        children: [],
    };
}

export function createRepeaterNode(): RepeaterNode {
    return {
        id: createId('repeater'),
        css_selector: '',
        label: '',
        steps: [],
    };
}

export function createSourceUrlStep(defaultUrlTypeId?: string): SourceUrlStep {
    return {
        id: createId('step'),
        type: 'source_url',
        selector: '',
        extract_type: 'href',
        url_type_id: defaultUrlTypeId,
    };
}

export function createDocumentUrlStep(): DocumentUrlStep {
    return {
        id: createId('step'),
        type: 'document_url',
        selector: '',
        filename_selector: '',
    };
}

export function createDownloadFileStep(): DownloadFileStep {
    return {
        id: createId('step'),
        type: 'download_file',
        url_selector: '',
        filename_selector: '',
        file_type_hint: '',
    };
}

export function createDataExtractStep(defaultKey = ''): DataExtractStep {
    return {
        id: createId('step'),
        type: 'data_extract',
        key: defaultKey,
        selector: '',
        extract_type: 'text',
    };
}

export function createEmptyPhase(): PhaseConfig {
    return {
        before: [],
        chain: [],
    };
}

export function updateScopeInTree(
    scopes: ScopeModule[],
    scopeId: string,
    updater: (scope: ScopeModule) => ScopeModule,
): [ScopeModule[], boolean] {
    let changed = false;
    const next = scopes.map((scope) => {
        if (scope.id === scopeId) {
            changed = true;
            return updater(scope);
        }
        const [children, childChanged] = updateScopeInTree(scope.children, scopeId, updater);
        if (!childChanged) return scope;
        changed = true;
        return { ...scope, children };
    });
    return [next, changed];
}

export function updateRepeaterInTree(
    scopes: ScopeModule[],
    repeaterId: string,
    updater: (repeater: RepeaterNode) => RepeaterNode,
): [ScopeModule[], boolean] {
    let changed = false;
    const next = scopes.map((scope) => {
        if (scope.repeater?.id === repeaterId) {
            changed = true;
            return { ...scope, repeater: updater(scope.repeater) };
        }
        const [children, childChanged] = updateRepeaterInTree(scope.children, repeaterId, updater);
        if (!childChanged) return scope;
        changed = true;
        return { ...scope, children };
    });
    return [next, changed];
}

export function updateStepInTree(
    scopes: ScopeModule[],
    stepId: string,
    updater: (step: RepeaterStep) => RepeaterStep,
): [ScopeModule[], boolean] {
    let changed = false;
    const next = scopes.map((scope) => {
        if (scope.repeater) {
            const stepIndex = scope.repeater.steps.findIndex((step) => step.id === stepId);
            if (stepIndex >= 0) {
                changed = true;
                return {
                    ...scope,
                    repeater: {
                        ...scope.repeater,
                        steps: scope.repeater.steps.map((step) => (
                            step.id === stepId ? updater(step) : step
                        )),
                    },
                };
            }
        }
        const [children, childChanged] = updateStepInTree(scope.children, stepId, updater);
        if (!childChanged) return scope;
        changed = true;
        return { ...scope, children };
    });
    return [next, changed];
}

export function removeStepFromTree(scopes: ScopeModule[], stepId: string): [ScopeModule[], boolean] {
    let changed = false;
    const next = scopes.map((scope) => {
        if (scope.repeater?.steps.some((step) => step.id === stepId)) {
            changed = true;
            return {
                ...scope,
                repeater: {
                    ...scope.repeater,
                    steps: scope.repeater.steps.filter((step) => step.id !== stepId),
                },
            };
        }
        const [children, childChanged] = removeStepFromTree(scope.children, stepId);
        if (!childChanged) return scope;
        changed = true;
        return { ...scope, children };
    });
    return [next, changed];
}

export function removeScopeFromTree(scopes: ScopeModule[], scopeId: string): [ScopeModule[], boolean] {
    let removed = false;
    const filtered = scopes
        .filter((scope) => {
            if (scope.id === scopeId) {
                removed = true;
                return false;
            }
            return true;
        })
        .map((scope) => {
            const [children, childRemoved] = removeScopeFromTree(scope.children, scopeId);
            if (!childRemoved) return scope;
            removed = true;
            return { ...scope, children };
        });
    return [filtered, removed];
}

export function appendChildScope(scopes: ScopeModule[], parentScopeId: string, child: ScopeModule): [ScopeModule[], boolean] {
    return updateScopeInTree(scopes, parentScopeId, (scope) => ({
        ...scope,
        children: [...scope.children, child],
    }));
}

export function findScopeInTree(scopes: ScopeModule[], scopeId: string): ScopeModule | null {
    for (const scope of scopes) {
        if (scope.id === scopeId) {
            return scope;
        }
        const child = findScopeInTree(scope.children, scopeId);
        if (child) {
            return child;
        }
    }
    return null;
}

export function findScopeForRepeater(scopes: ScopeModule[], repeaterId: string): ScopeModule | null {
    for (const scope of scopes) {
        if (scope.repeater?.id === repeaterId) {
            return scope;
        }
        const child = findScopeForRepeater(scope.children, repeaterId);
        if (child) {
            return child;
        }
    }
    return null;
}

export function findScopeForStep(scopes: ScopeModule[], stepId: string): ScopeModule | null {
    for (const scope of scopes) {
        if (scope.repeater?.steps.some((step) => step.id === stepId)) {
            return scope;
        }
        const child = findScopeForStep(scope.children, stepId);
        if (child) {
            return child;
        }
    }
    return null;
}

export function mapStepsInTree(
    scopes: ScopeModule[],
    mapper: (step: RepeaterStep) => RepeaterStep,
): ScopeModule[] {
    return scopes.map((scope) => ({
        ...scope,
        repeater: scope.repeater
            ? {
                ...scope.repeater,
                steps: scope.repeater.steps.map(mapper),
            }
            : null,
        children: mapStepsInTree(scope.children, mapper),
    }));
}

export function collectRepeaters(scopes: ScopeModule[]): RepeaterRef[] {
    const result: RepeaterRef[] = [];
    const walk = (nodes: ScopeModule[], parentPath: string[]) => {
        nodes.forEach((scope, index) => {
            const scopeLabel = scope.label.trim() || `Scope ${parentPath.concat(String(index + 1)).join('.')}`;
            if (scope.repeater) {
                result.push({
                    scopeId: scope.id,
                    scopeLabel,
                    repeaterId: scope.repeater.id,
                    repeaterLabel: scope.repeater.label.trim() || `Repeater (${scopeLabel})`,
                });
            }
            walk(scope.children, parentPath.concat(String(index + 1)));
        });
    };
    walk(scopes, []);
    return result;
}

export function collectScopes(scopes: ScopeModule[]): ScopeRef[] {
    const result: ScopeRef[] = [];
    const walk = (nodes: ScopeModule[], parentPath: string[]) => {
        nodes.forEach((scope, index) => {
            const scopeLabel = scope.label.trim() || `Scope ${parentPath.concat(String(index + 1)).join('.')}`;
            result.push({ scopeId: scope.id, scopeLabel });
            walk(scope.children, parentPath.concat(String(index + 1)));
        });
    };
    walk(scopes, []);
    return result;
}

export function normalizeSelectorWithinScope(selector: string, scopeSelector?: string): string {
    if (!scopeSelector?.trim()) {
        return selector.trim();
    }

    const full = selector.trim();
    const scope = scopeSelector.trim();
    if (!full || !scope) return full;
    if (full === scope) return full;
    if (full.startsWith(`${scope} > `)) return full.slice(scope.length + 3).trim();
    if (full.startsWith(`${scope} `)) return full.slice(scope.length + 1).trim();
    return full;
}

export function describeTarget(target: FocusTarget): string {
    const phase = target.phase === 'discovery' ? 'Discovery' : 'Processing';
    if (target.section === 'before') return `${phase} > Before #${target.index + 1}`;
    if (target.section === 'scope') return `${phase} > Scope`;
    if (target.section === 'repeater') return `${phase} > Repeater`;
    if (target.section === 'pagination') return `${phase} > Pagination`;
    const selectorLabel = target.selectorKey === 'filename_selector'
        ? 'Filename selector'
        : target.selectorKey === 'url_selector'
            ? 'URL selector'
            : 'Selector';
    return `${phase} > Step > ${selectorLabel}`;
}

export function ensureScopeAndRepeater(
    phase: PhaseConfig,
    preferredScopeId: string | null,
    preferredRepeaterId: string | null,
): { phase: PhaseConfig; scopeId: string; repeaterId: string } {
    let nextPhase = phase;
    let scopeId = preferredScopeId;
    let repeaterId = preferredRepeaterId;

    if (!scopeId || !findScopeInTree(nextPhase.chain, scopeId)) {
        const scope = createScopeModule();
        nextPhase = { ...nextPhase, chain: [...nextPhase.chain, scope] };
        scopeId = scope.id;
        repeaterId = null;
    }

    const existingScope = findScopeInTree(nextPhase.chain, scopeId);
    if (!existingScope) {
        const scope = createScopeModule();
        nextPhase = { ...nextPhase, chain: [...nextPhase.chain, scope] };
        scopeId = scope.id;
        repeaterId = null;
    } else if (existingScope.repeater) {
        repeaterId = existingScope.repeater.id;
    }

    if (!repeaterId || !findScopeForRepeater(nextPhase.chain, repeaterId)) {
        const repeater = createRepeaterNode();
        const [chain] = updateScopeInTree(nextPhase.chain, scopeId, (scope) => ({
            ...scope,
            repeater,
        }));
        nextPhase = { ...nextPhase, chain };
        repeaterId = repeater.id;
    }

    return { phase: nextPhase, scopeId, repeaterId };
}

export function isSameTarget(a: FocusTarget | null, b: FocusTarget | null): boolean {
    return JSON.stringify(a) === JSON.stringify(b);
}

export function firstStepTarget(
    scopes: ScopeModule[],
    phaseKey: { phase: 'discovery' } | { phase: 'processing'; urlTypeId: string },
): FocusTarget | null {
    for (const scope of scopes) {
        const repeater = scope.repeater;
        if (repeater) {
            for (const step of repeater.steps) {
                if (step.type === 'source_url' || step.type === 'data_extract') {
                    return phaseKey.phase === 'discovery'
                        ? { phase: 'discovery', section: 'step', stepId: step.id, selectorKey: 'selector' }
                        : { phase: 'processing', urlTypeId: phaseKey.urlTypeId, section: 'step', stepId: step.id, selectorKey: 'selector' };
                }
                if (step.type === 'document_url') {
                    return phaseKey.phase === 'discovery'
                        ? { phase: 'discovery', section: 'step', stepId: step.id, selectorKey: 'selector' }
                        : { phase: 'processing', urlTypeId: phaseKey.urlTypeId, section: 'step', stepId: step.id, selectorKey: 'selector' };
                }
                if (step.type === 'download_file') {
                    return phaseKey.phase === 'discovery'
                        ? { phase: 'discovery', section: 'step', stepId: step.id, selectorKey: 'url_selector' }
                        : { phase: 'processing', urlTypeId: phaseKey.urlTypeId, section: 'step', stepId: step.id, selectorKey: 'url_selector' };
                }
            }
        }
        const child = firstStepTarget(scope.children, phaseKey);
        if (child) return child;
    }
    return null;
}
