'use client';

import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useState } from 'react';
import {
    ArrowDown,
    ArrowUp,
    Bot,
    Clock3,
    Download,
    FolderTree,
    Link2,
    Plus,
    Settings2,
    Trash2,
    Workflow,
} from 'lucide-react';

import { cn } from '@/lib/utils';
import type {
    BeforeAction,
    DataExtractStep,
    DownloadFileStep,
    ElementSelector,
    PhaseConfig,
    PlaywrightAction,
    RepeaterNode,
    RepeaterStep,
    ScopeModule,
    ScrapingWorkflow,
    SourceUrlStep,
    SourceUrlType,
} from '@/lib/crawler-types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

type PhaseTab = 'discovery' | 'processing';
type BasicBeforeStepType = 'remove_element' | 'wait_timeout';
type PlaywrightBeforeStepType = PlaywrightAction['type'];
type SelectorKey = 'selector' | 'url_selector' | 'filename_selector';

type FocusTarget =
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

interface RepeaterRef {
    scopeId: string;
    scopeLabel: string;
    repeaterId: string;
    repeaterLabel: string;
}

interface ScopeRef {
    scopeId: string;
    scopeLabel: string;
}

interface SimulatorSidebarProps {
    onWorkflowChange?: (workflowData: ScrapingWorkflow) => void;
    playwrightEnabled: boolean;
    onSelectorPreviewChange?: (selector: string | null) => void;
}

export interface SimulatorSidebarRef {
    applySelectedSelector: (selector: string, elementInfo?: ElementSelector) => boolean;
    appendRemoveElementBeforeAction: (selector: string) => void;
    clearAllPlaywrightActions: () => void;
    hasAnyPlaywrightActions: () => boolean;
}

const BASIC_BEFORE_STEP_TYPES: Array<{ value: BasicBeforeStepType; label: string }> = [
    { value: 'remove_element', label: 'Remove Element' },
    { value: 'wait_timeout', label: 'Wait Timeout' },
];

const PLAYWRIGHT_BEFORE_STEP_TYPES: Array<{ value: PlaywrightBeforeStepType; label: string }> = [
    { value: 'wait_selector', label: 'Wait for Selector' },
    { value: 'wait_network', label: 'Wait for Network' },
    { value: 'click', label: 'Click' },
    { value: 'scroll', label: 'Scroll' },
    { value: 'fill', label: 'Fill Input' },
    { value: 'select_option', label: 'Select Dropdown' },
    { value: 'evaluate', label: 'Run JavaScript' },
    { value: 'screenshot', label: 'Screenshot' },
];

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

function createId(prefix: string): string {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return `${prefix}-${crypto.randomUUID()}`;
    }
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function moveItem<T>(items: T[], fromIndex: number, toIndex: number): T[] {
    if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0 || fromIndex >= items.length || toIndex >= items.length) {
        return items;
    }
    const next = [...items];
    const [moved] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, moved);
    return next;
}

function isPlaywrightBeforeAction(action: BeforeAction): action is PlaywrightAction {
    return PLAYWRIGHT_ACTION_TYPES.has(action.type);
}

function actionHasSelector(action: BeforeAction): action is
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

function createDefaultBeforeAction(type: BeforeAction['type']): BeforeAction {
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

function createScopeModule(): ScopeModule {
    return {
        id: createId('scope'),
        css_selector: '',
        label: '',
        repeater: null,
        pagination: null,
        children: [],
    };
}

function createRepeaterNode(): RepeaterNode {
    return {
        id: createId('repeater'),
        css_selector: '',
        label: '',
        steps: [],
    };
}

function createSourceUrlStep(defaultUrlTypeId?: string): SourceUrlStep {
    return {
        id: createId('step'),
        type: 'source_url',
        selector: '',
        extract_type: 'href',
        url_type_id: defaultUrlTypeId,
    };
}

function createDownloadFileStep(): DownloadFileStep {
    return {
        id: createId('step'),
        type: 'download_file',
        url_selector: '',
        filename_selector: '',
        file_type_hint: '',
    };
}

function createDataExtractStep(defaultKey = ''): DataExtractStep {
    return {
        id: createId('step'),
        type: 'data_extract',
        key: defaultKey,
        selector: '',
        extract_type: 'text',
    };
}

function createEmptyPhase(): PhaseConfig {
    return {
        before: [],
        chain: [],
    };
}

function createDefaultWorkflow(playwrightEnabled: boolean): ScrapingWorkflow {
    return {
        playwright_enabled: playwrightEnabled,
        discovery: createEmptyPhase(),
        url_types: [
            {
                id: createId('url-type'),
                name: 'Default Documents',
                processing: createEmptyPhase(),
            },
        ],
    };
}

function getActionLabel(action: BeforeAction): string {
    if (action.type === 'remove_element') return 'Remove Element';
    if (action.type === 'wait_timeout') return 'Wait Timeout';
    return PLAYWRIGHT_BEFORE_STEP_TYPES.find((item) => item.value === action.type)?.label ?? action.type;
}

function updateScopeInTree(
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

function updateRepeaterInTree(
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

function updateStepInTree(
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

function removeStepFromTree(scopes: ScopeModule[], stepId: string): [ScopeModule[], boolean] {
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

function removeScopeFromTree(scopes: ScopeModule[], scopeId: string): [ScopeModule[], boolean] {
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

function appendChildScope(scopes: ScopeModule[], parentScopeId: string, child: ScopeModule): [ScopeModule[], boolean] {
    return updateScopeInTree(scopes, parentScopeId, (scope) => ({
        ...scope,
        children: [...scope.children, child],
    }));
}

function findScopeInTree(scopes: ScopeModule[], scopeId: string): ScopeModule | null {
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

function findScopeForRepeater(scopes: ScopeModule[], repeaterId: string): ScopeModule | null {
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

function findScopeForStep(scopes: ScopeModule[], stepId: string): ScopeModule | null {
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

function mapStepsInTree(
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

function collectRepeaters(scopes: ScopeModule[]): RepeaterRef[] {
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

function collectScopes(scopes: ScopeModule[]): ScopeRef[] {
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

function normalizeSelectorWithinScope(selector: string, scopeSelector?: string): string {
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

function isSameTarget(a: FocusTarget | null, b: FocusTarget | null): boolean {
    return JSON.stringify(a) === JSON.stringify(b);
}

function firstStepTarget(
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

export const SimulatorSidebar = forwardRef<SimulatorSidebarRef, SimulatorSidebarProps>(({
    onWorkflowChange,
    playwrightEnabled,
    onSelectorPreviewChange,
}, ref) => {
    const [activeTab, setActiveTab] = useState<PhaseTab>('discovery');
    const [workflow, setWorkflow] = useState<ScrapingWorkflow>(() => createDefaultWorkflow(playwrightEnabled));
    const [activeUrlTypeId, setActiveUrlTypeId] = useState<string>(() => workflow.url_types[0].id);
    const [selectedScopeId, setSelectedScopeId] = useState<string | null>(null);
    const [selectedRepeaterId, setSelectedRepeaterId] = useState<string | null>(null);
    const [focusedTarget, setFocusedTarget] = useState<FocusTarget | null>(null);
    const [beforeToAdd, setBeforeToAdd] = useState<BasicBeforeStepType>('remove_element');
    const [playwrightToAdd, setPlaywrightToAdd] = useState<PlaywrightBeforeStepType>('wait_selector');

    const activeUrlType = useMemo(
        () => workflow.url_types.find((item) => item.id === activeUrlTypeId) ?? workflow.url_types[0],
        [workflow.url_types, activeUrlTypeId],
    );

    const currentPhase = useMemo<PhaseConfig>(
        () => (activeTab === 'discovery' ? workflow.discovery : activeUrlType.processing),
        [activeTab, workflow.discovery, activeUrlType],
    );

    const currentPhaseKey = useMemo(
        () => (activeTab === 'discovery'
            ? ({ phase: 'discovery' } as const)
            : ({ phase: 'processing', urlTypeId: activeUrlType.id } as const)),
        [activeTab, activeUrlType.id],
    );

    const scopeRefs = useMemo(() => collectScopes(currentPhase.chain), [currentPhase.chain]);
    const repeaterRefs = useMemo(() => collectRepeaters(currentPhase.chain), [currentPhase.chain]);

    const effectiveSelectedScopeId = useMemo(
        () => (selectedScopeId && scopeRefs.some((scope) => scope.scopeId === selectedScopeId))
            ? selectedScopeId
            : (scopeRefs[0]?.scopeId ?? null),
        [selectedScopeId, scopeRefs],
    );

    const effectiveSelectedRepeaterId = useMemo(
        () => (selectedRepeaterId && repeaterRefs.some((item) => item.repeaterId === selectedRepeaterId))
            ? selectedRepeaterId
            : (repeaterRefs[0]?.repeaterId ?? null),
        [selectedRepeaterId, repeaterRefs],
    );

    useEffect(() => {
        onWorkflowChange?.({
            ...workflow,
            playwright_enabled: playwrightEnabled,
        });
    }, [workflow, playwrightEnabled, onWorkflowChange]);

    const updateWorkflowPhase = (
        target: { phase: 'discovery' } | { phase: 'processing'; urlTypeId: string },
        updater: (phase: PhaseConfig) => PhaseConfig,
    ) => {
        setWorkflow((prev) => {
            if (target.phase === 'discovery') {
                return {
                    ...prev,
                    discovery: updater(prev.discovery),
                };
            }
            return {
                ...prev,
                url_types: prev.url_types.map((item) => (
                    item.id === target.urlTypeId
                        ? { ...item, processing: updater(item.processing) }
                        : item
                )),
            };
        });
    };

    const setSelectorFocus = (target: FocusTarget, selector: string) => {
        setFocusedTarget(target);
        onSelectorPreviewChange?.(selector.trim() ? selector : null);
    };

    const syncPreviewOnChange = (target: FocusTarget, value: string) => {
        if (isSameTarget(target, focusedTarget)) {
            onSelectorPreviewChange?.(value.trim() ? value : null);
        }
    };

    const getFallbackTarget = useCallback((): FocusTarget | null => {
        if (effectiveSelectedRepeaterId) {
            return currentPhaseKey.phase === 'discovery'
                ? { phase: 'discovery', section: 'repeater', repeaterId: effectiveSelectedRepeaterId }
                : { phase: 'processing', urlTypeId: currentPhaseKey.urlTypeId, section: 'repeater', repeaterId: effectiveSelectedRepeaterId };
        }

        if (effectiveSelectedScopeId) {
            return currentPhaseKey.phase === 'discovery'
                ? { phase: 'discovery', section: 'scope', scopeId: effectiveSelectedScopeId }
                : { phase: 'processing', urlTypeId: currentPhaseKey.urlTypeId, section: 'scope', scopeId: effectiveSelectedScopeId };
        }

        const firstActionIndex = currentPhase.before.findIndex((action) => actionHasSelector(action));
        if (firstActionIndex >= 0) {
            return currentPhaseKey.phase === 'discovery'
                ? { phase: 'discovery', section: 'before', index: firstActionIndex }
                : { phase: 'processing', urlTypeId: currentPhaseKey.urlTypeId, section: 'before', index: firstActionIndex };
        }

        return firstStepTarget(currentPhase.chain, currentPhaseKey);
    }, [
        currentPhase.before,
        currentPhase.chain,
        currentPhaseKey,
        effectiveSelectedRepeaterId,
        effectiveSelectedScopeId,
    ]);

    const resolveSelectorForTarget = useCallback((
        phase: PhaseConfig,
        target: FocusTarget,
        selector: string,
        elementInfo?: ElementSelector,
    ): string => {
        const baseSelector = (elementInfo?.localSelector ?? selector).trim();
        if (!baseSelector) return '';

        if (target.section === 'repeater') {
            const scope = findScopeForRepeater(phase.chain, target.repeaterId);
            return normalizeSelectorWithinScope(baseSelector, scope?.css_selector);
        }

        if (target.section === 'step') {
            const scope = findScopeForStep(phase.chain, target.stepId);
            return normalizeSelectorWithinScope(baseSelector, scope?.css_selector);
        }

        if (target.section === 'pagination') {
            const scope = findScopeInTree(phase.chain, target.scopeId);
            return normalizeSelectorWithinScope(baseSelector, scope?.css_selector);
        }

        return baseSelector;
    }, []);

    useImperativeHandle(ref, () => ({
        applySelectedSelector: (selector: string, elementInfo?: ElementSelector) => {
            const nextSelectorRaw = (elementInfo?.localSelector ?? selector).trim();
            if (!nextSelectorRaw) return false;

            const target = focusedTarget ?? getFallbackTarget();
            if (!target) return false;
            if (!focusedTarget) {
                setFocusedTarget(target);
            }

            updateWorkflowPhase(
                target.phase === 'discovery'
                    ? { phase: 'discovery' }
                    : { phase: 'processing', urlTypeId: target.urlTypeId },
                (phase) => {
                    const nextSelector = resolveSelectorForTarget(phase, target, selector, elementInfo);
                    if (!nextSelector) return phase;

                    if (target.section === 'before') {
                        const action = phase.before[target.index];
                        if (!action || !actionHasSelector(action)) return phase;
                        return {
                            ...phase,
                            before: phase.before.map((item, index) => (
                                index === target.index && actionHasSelector(item)
                                    ? { ...item, css_selector: nextSelector }
                                    : item
                            )),
                        };
                    }

                    if (target.section === 'scope') {
                        const [chain] = updateScopeInTree(phase.chain, target.scopeId, (scope) => ({
                            ...scope,
                            css_selector: nextSelector,
                        }));
                        return { ...phase, chain };
                    }

                    if (target.section === 'repeater') {
                        const [chain] = updateRepeaterInTree(phase.chain, target.repeaterId, (repeater) => ({
                            ...repeater,
                            css_selector: nextSelector,
                        }));
                        return { ...phase, chain };
                    }

                    if (target.section === 'step') {
                        const [chain] = updateStepInTree(phase.chain, target.stepId, (step) => {
                            if (step.type === 'source_url' && target.selectorKey === 'selector') {
                                return { ...step, selector: nextSelector };
                            }
                            if (step.type === 'data_extract' && target.selectorKey === 'selector') {
                                return { ...step, selector: nextSelector };
                            }
                            if (step.type === 'download_file') {
                                if (target.selectorKey === 'url_selector') {
                                    return { ...step, url_selector: nextSelector };
                                }
                                if (target.selectorKey === 'filename_selector') {
                                    return { ...step, filename_selector: nextSelector };
                                }
                            }
                            return step;
                        });
                        return { ...phase, chain };
                    }

                    if (target.section === 'pagination') {
                        const [chain] = updateScopeInTree(phase.chain, target.scopeId, (scope) => ({
                            ...scope,
                            pagination: {
                                ...(scope.pagination ?? { css_selector: '', max_pages: 0 }),
                                css_selector: nextSelector,
                            },
                        }));
                        return { ...phase, chain };
                    }

                    return phase;
                },
            );

            onSelectorPreviewChange?.(nextSelectorRaw);
            return true;
        },
        appendRemoveElementBeforeAction: (selector: string) => {
            updateWorkflowPhase(currentPhaseKey, (phase) => ({
                ...phase,
                before: [...phase.before, { type: 'remove_element', css_selector: selector }],
            }));
        },
        clearAllPlaywrightActions: () => {
            setWorkflow((prev) => ({
                ...prev,
                discovery: {
                    ...prev.discovery,
                    before: prev.discovery.before.filter((action) => !isPlaywrightBeforeAction(action)),
                },
                url_types: prev.url_types.map((urlType) => ({
                    ...urlType,
                    processing: {
                        ...urlType.processing,
                        before: urlType.processing.before.filter((action) => !isPlaywrightBeforeAction(action)),
                    },
                })),
            }));
        },
        hasAnyPlaywrightActions: () => {
            if (workflow.discovery.before.some((action) => isPlaywrightBeforeAction(action))) {
                return true;
            }
            return workflow.url_types.some((item) => item.processing.before.some((action) => isPlaywrightBeforeAction(action)));
        },
    }), [currentPhaseKey, focusedTarget, getFallbackTarget, onSelectorPreviewChange, resolveSelectorForTarget, workflow]);

    const addBasicBeforeAction = () => {
        updateWorkflowPhase(currentPhaseKey, (phase) => ({
            ...phase,
            before: [...phase.before, createDefaultBeforeAction(beforeToAdd)],
        }));
    };

    const addPlaywrightAction = () => {
        updateWorkflowPhase(currentPhaseKey, (phase) => ({
            ...phase,
            before: [...phase.before, createDefaultBeforeAction(playwrightToAdd)],
        }));
    };

    const addScopeStep = () => {
        const newScope = createScopeModule();
        updateWorkflowPhase(currentPhaseKey, (phase) => {
            if (!effectiveSelectedScopeId) {
                return { ...phase, chain: [...phase.chain, newScope] };
            }
            const parent = findScopeInTree(phase.chain, effectiveSelectedScopeId);
            if (!parent || !parent.repeater) {
                return { ...phase, chain: [...phase.chain, newScope] };
            }
            const [chain, changed] = appendChildScope(phase.chain, parent.id, newScope);
            if (!changed) {
                return { ...phase, chain: [...phase.chain, newScope] };
            }
            return { ...phase, chain };
        });
        setSelectedScopeId(newScope.id);
    };

    const addRepeaterStep = () => {
        if (!effectiveSelectedScopeId) return;
        const repeater = createRepeaterNode();
        updateWorkflowPhase(currentPhaseKey, (phase) => {
            const [chain] = updateScopeInTree(phase.chain, effectiveSelectedScopeId, (scope) => ({
                ...scope,
                repeater,
            }));
            return { ...phase, chain };
        });
        setSelectedRepeaterId(repeater.id);
    };

    const addSourceUrlStep = () => {
        if (!effectiveSelectedRepeaterId || currentPhaseKey.phase !== 'discovery') return;
        const defaultUrlTypeId = workflow.url_types[0]?.id;
        const sourceUrlStep = createSourceUrlStep(defaultUrlTypeId);
        updateWorkflowPhase(currentPhaseKey, (phase) => {
            const [chain] = updateRepeaterInTree(phase.chain, effectiveSelectedRepeaterId, (repeater) => ({
                ...repeater,
                steps: [...repeater.steps, sourceUrlStep],
            }));
            return { ...phase, chain };
        });
    };

    const addDownloadFileStep = () => {
        if (!effectiveSelectedRepeaterId) return;
        const downloadStep = createDownloadFileStep();
        updateWorkflowPhase(currentPhaseKey, (phase) => {
            const [chain] = updateRepeaterInTree(phase.chain, effectiveSelectedRepeaterId, (repeater) => ({
                ...repeater,
                steps: [...repeater.steps, downloadStep],
            }));
            return { ...phase, chain };
        });
    };

    const addDataExtractStep = () => {
        if (!effectiveSelectedRepeaterId) return;
        const dataStep = createDataExtractStep();
        updateWorkflowPhase(currentPhaseKey, (phase) => {
            const [chain] = updateRepeaterInTree(phase.chain, effectiveSelectedRepeaterId, (repeater) => ({
                ...repeater,
                steps: [...repeater.steps, dataStep],
            }));
            return { ...phase, chain };
        });
    };

    const addPaginationStep = () => {
        if (!effectiveSelectedScopeId) return;
        updateWorkflowPhase(currentPhaseKey, (phase) => {
            const [chain] = updateScopeInTree(phase.chain, effectiveSelectedScopeId, (scope) => ({
                ...scope,
                pagination: scope.pagination ?? { css_selector: '', max_pages: 0 },
            }));
            return { ...phase, chain };
        });
    };

    const handleUrlTypeAdd = () => {
        const newUrlType: SourceUrlType = {
            id: createId('url-type'),
            name: `URL Type ${workflow.url_types.length + 1}`,
            processing: createEmptyPhase(),
        };
        setWorkflow((prev) => ({ ...prev, url_types: [...prev.url_types, newUrlType] }));
        setActiveUrlTypeId(newUrlType.id);
        setActiveTab('processing');
    };

    const handleUrlTypeRename = (urlType: SourceUrlType) => {
        const nextName = window.prompt('URL Type name', urlType.name)?.trim();
        if (!nextName) return;
        setWorkflow((prev) => ({
            ...prev,
            url_types: prev.url_types.map((item) => (
                item.id === urlType.id ? { ...item, name: nextName } : item
            )),
        }));
    };

    const handleUrlTypeDelete = (id: string) => {
        if (workflow.url_types.length <= 1) return;
        const nextUrlTypes = workflow.url_types.filter((item) => item.id !== id);
        const fallbackId = nextUrlTypes[0].id;
        setWorkflow((prev) => ({
            ...prev,
            url_types: nextUrlTypes,
            discovery: {
                ...prev.discovery,
                chain: mapStepsInTree(prev.discovery.chain, (step) => (
                    step.type === 'source_url' && step.url_type_id === id
                        ? { ...step, url_type_id: fallbackId }
                        : step
                )),
            },
        }));
        if (activeUrlTypeId === id) {
            setActiveUrlTypeId(fallbackId);
        }
    };

    const renderBeforeAction = (action: BeforeAction, index: number) => {
        const target: FocusTarget = currentPhaseKey.phase === 'discovery'
            ? { phase: 'discovery', section: 'before', index }
            : { phase: 'processing', urlTypeId: currentPhaseKey.urlTypeId, section: 'before', index };

        return (
            <div key={`before-${index}`} className="rounded-lg border border-white/10 bg-black/30 p-2">
                <div className="mb-2 flex items-center justify-between text-xs text-white/70">
                    <span>{getActionLabel(action)}</span>
                    <div className="flex gap-1">
                        <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            className="h-6 w-6"
                            onClick={() => updateWorkflowPhase(currentPhaseKey, (phase) => ({
                                ...phase,
                                before: moveItem(phase.before, index, index - 1),
                            }))}
                        >
                            <ArrowUp className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            className="h-6 w-6"
                            onClick={() => updateWorkflowPhase(currentPhaseKey, (phase) => ({
                                ...phase,
                                before: moveItem(phase.before, index, index + 1),
                            }))}
                        >
                            <ArrowDown className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            className="h-6 w-6 text-red-300"
                            onClick={() => updateWorkflowPhase(currentPhaseKey, (phase) => ({
                                ...phase,
                                before: phase.before.filter((_, i) => i !== index),
                            }))}
                        >
                            <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                    </div>
                </div>

                {action.type === 'remove_element' && (
                    <Input
                        value={action.css_selector}
                        placeholder="CSS selector"
                        className="h-8 border-white/10 bg-black/30 text-xs text-white"
                        onFocus={() => setSelectorFocus(target, action.css_selector)}
                        onChange={(event) => {
                            const value = event.target.value;
                            updateWorkflowPhase(currentPhaseKey, (phase) => ({
                                ...phase,
                                before: phase.before.map((item, i) => (
                                    i === index && item.type === 'remove_element' ? { ...item, css_selector: value } : item
                                )),
                            }));
                            syncPreviewOnChange(target, value);
                        }}
                    />
                )}

                {action.type === 'wait_timeout' && (
                    <Input
                        type="number"
                        value={action.ms}
                        placeholder="Timeout ms"
                        className="h-8 border-white/10 bg-black/30 text-xs text-white"
                        onChange={(event) => {
                            const value = Number(event.target.value) || 0;
                            updateWorkflowPhase(currentPhaseKey, (phase) => ({
                                ...phase,
                                before: phase.before.map((item, i) => (
                                    i === index && item.type === 'wait_timeout' ? { ...item, ms: value } : item
                                )),
                            }));
                        }}
                    />
                )}

                {action.type === 'wait_selector' && (
                    <div className="grid grid-cols-2 gap-2">
                        <Input
                            value={action.css_selector}
                            placeholder="CSS selector"
                            className="h-8 border-white/10 bg-black/30 text-xs text-white"
                            onFocus={() => setSelectorFocus(target, action.css_selector)}
                            onChange={(event) => {
                                const value = event.target.value;
                                updateWorkflowPhase(currentPhaseKey, (phase) => ({
                                    ...phase,
                                    before: phase.before.map((item, i) => (
                                        i === index && item.type === 'wait_selector' ? { ...item, css_selector: value } : item
                                    )),
                                }));
                                syncPreviewOnChange(target, value);
                            }}
                        />
                        <Input
                            type="number"
                            value={action.timeout_ms}
                            placeholder="Timeout ms"
                            className="h-8 border-white/10 bg-black/30 text-xs text-white"
                            onChange={(event) => {
                                const value = Number(event.target.value) || 0;
                                updateWorkflowPhase(currentPhaseKey, (phase) => ({
                                    ...phase,
                                    before: phase.before.map((item, i) => (
                                        i === index && item.type === 'wait_selector' ? { ...item, timeout_ms: value } : item
                                    )),
                                }));
                            }}
                        />
                    </div>
                )}

                {action.type === 'wait_network' && (
                    <Select
                        value={action.state}
                        onValueChange={(value) => {
                            updateWorkflowPhase(currentPhaseKey, (phase) => ({
                                ...phase,
                                before: phase.before.map((item, i) => (
                                    i === index && item.type === 'wait_network'
                                        ? { ...item, state: value as 'networkidle' | 'domcontentloaded' | 'load' }
                                        : item
                                )),
                            }));
                        }}
                    >
                        <SelectTrigger className="h-8 border-white/10 bg-black/30 text-xs text-white">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="networkidle">networkidle</SelectItem>
                            <SelectItem value="domcontentloaded">domcontentloaded</SelectItem>
                            <SelectItem value="load">load</SelectItem>
                        </SelectContent>
                    </Select>
                )}

                {action.type === 'click' && (
                    <div className="grid grid-cols-2 gap-2">
                        <Input
                            value={action.css_selector}
                            placeholder="CSS selector"
                            className="h-8 border-white/10 bg-black/30 text-xs text-white"
                            onFocus={() => setSelectorFocus(target, action.css_selector)}
                            onChange={(event) => {
                                const value = event.target.value;
                                updateWorkflowPhase(currentPhaseKey, (phase) => ({
                                    ...phase,
                                    before: phase.before.map((item, i) => (
                                        i === index && item.type === 'click' ? { ...item, css_selector: value } : item
                                    )),
                                }));
                                syncPreviewOnChange(target, value);
                            }}
                        />
                        <Input
                            type="number"
                            value={action.wait_after_ms ?? 0}
                            placeholder="Wait ms"
                            className="h-8 border-white/10 bg-black/30 text-xs text-white"
                            onChange={(event) => {
                                const value = Number(event.target.value) || 0;
                                updateWorkflowPhase(currentPhaseKey, (phase) => ({
                                    ...phase,
                                    before: phase.before.map((item, i) => (
                                        i === index && item.type === 'click' ? { ...item, wait_after_ms: value } : item
                                    )),
                                }));
                            }}
                        />
                    </div>
                )}

                {action.type === 'scroll' && (
                    <div className="grid grid-cols-2 gap-2">
                        <Input
                            type="number"
                            value={action.count}
                            placeholder="Count"
                            className="h-8 border-white/10 bg-black/30 text-xs text-white"
                            onChange={(event) => {
                                const value = Number(event.target.value) || 0;
                                updateWorkflowPhase(currentPhaseKey, (phase) => ({
                                    ...phase,
                                    before: phase.before.map((item, i) => (
                                        i === index && item.type === 'scroll' ? { ...item, count: value } : item
                                    )),
                                }));
                            }}
                        />
                        <Input
                            type="number"
                            value={action.delay_ms}
                            placeholder="Delay ms"
                            className="h-8 border-white/10 bg-black/30 text-xs text-white"
                            onChange={(event) => {
                                const value = Number(event.target.value) || 0;
                                updateWorkflowPhase(currentPhaseKey, (phase) => ({
                                    ...phase,
                                    before: phase.before.map((item, i) => (
                                        i === index && item.type === 'scroll' ? { ...item, delay_ms: value } : item
                                    )),
                                }));
                            }}
                        />
                    </div>
                )}

                {action.type === 'fill' && (
                    <div className="space-y-2">
                        <Input
                            value={action.css_selector}
                            placeholder="CSS selector"
                            className="h-8 border-white/10 bg-black/30 text-xs text-white"
                            onFocus={() => setSelectorFocus(target, action.css_selector)}
                            onChange={(event) => {
                                const value = event.target.value;
                                updateWorkflowPhase(currentPhaseKey, (phase) => ({
                                    ...phase,
                                    before: phase.before.map((item, i) => (
                                        i === index && item.type === 'fill' ? { ...item, css_selector: value } : item
                                    )),
                                }));
                                syncPreviewOnChange(target, value);
                            }}
                        />
                        <Input
                            value={action.value}
                            placeholder="Value"
                            className="h-8 border-white/10 bg-black/30 text-xs text-white"
                            onChange={(event) => {
                                const value = event.target.value;
                                updateWorkflowPhase(currentPhaseKey, (phase) => ({
                                    ...phase,
                                    before: phase.before.map((item, i) => (
                                        i === index && item.type === 'fill' ? { ...item, value } : item
                                    )),
                                }));
                            }}
                        />
                        <label className="flex items-center gap-2 text-xs text-white/70">
                            <input
                                type="checkbox"
                                checked={action.press_enter}
                                onChange={(event) => {
                                    updateWorkflowPhase(currentPhaseKey, (phase) => ({
                                        ...phase,
                                        before: phase.before.map((item, i) => (
                                            i === index && item.type === 'fill' ? { ...item, press_enter: event.target.checked } : item
                                        )),
                                    }));
                                }}
                            />
                            Press enter
                        </label>
                    </div>
                )}

                {action.type === 'select_option' && (
                    <div className="grid grid-cols-2 gap-2">
                        <Input
                            value={action.css_selector}
                            placeholder="CSS selector"
                            className="h-8 border-white/10 bg-black/30 text-xs text-white"
                            onFocus={() => setSelectorFocus(target, action.css_selector)}
                            onChange={(event) => {
                                const value = event.target.value;
                                updateWorkflowPhase(currentPhaseKey, (phase) => ({
                                    ...phase,
                                    before: phase.before.map((item, i) => (
                                        i === index && item.type === 'select_option' ? { ...item, css_selector: value } : item
                                    )),
                                }));
                                syncPreviewOnChange(target, value);
                            }}
                        />
                        <Input
                            value={action.value}
                            placeholder="Value"
                            className="h-8 border-white/10 bg-black/30 text-xs text-white"
                            onChange={(event) => {
                                const value = event.target.value;
                                updateWorkflowPhase(currentPhaseKey, (phase) => ({
                                    ...phase,
                                    before: phase.before.map((item, i) => (
                                        i === index && item.type === 'select_option' ? { ...item, value } : item
                                    )),
                                }));
                            }}
                        />
                    </div>
                )}

                {action.type === 'evaluate' && (
                    <Input
                        value={action.script}
                        placeholder="JavaScript"
                        className="h-8 border-white/10 bg-black/30 text-xs text-white"
                        onChange={(event) => {
                            const value = event.target.value;
                            updateWorkflowPhase(currentPhaseKey, (phase) => ({
                                ...phase,
                                before: phase.before.map((item, i) => (
                                    i === index && item.type === 'evaluate' ? { ...item, script: value } : item
                                )),
                            }));
                        }}
                    />
                )}

                {action.type === 'screenshot' && (
                    <Input
                        value={action.filename}
                        placeholder="Filename"
                        className="h-8 border-white/10 bg-black/30 text-xs text-white"
                        onChange={(event) => {
                            const value = event.target.value;
                            updateWorkflowPhase(currentPhaseKey, (phase) => ({
                                ...phase,
                                before: phase.before.map((item, i) => (
                                    i === index && item.type === 'screenshot' ? { ...item, filename: value } : item
                                )),
                            }));
                        }}
                    />
                )}
            </div>
        );
    };

    const renderRepeaterStep = (
        step: RepeaterStep,
        repeater: RepeaterNode,
        stepIndex: number,
        isDiscovery: boolean,
    ) => {
        const stepTarget = (selectorKey: SelectorKey): FocusTarget => (
            currentPhaseKey.phase === 'discovery'
                ? { phase: 'discovery', section: 'step', stepId: step.id, selectorKey }
                : { phase: 'processing', urlTypeId: currentPhaseKey.urlTypeId, section: 'step', stepId: step.id, selectorKey }
        );

        const stepTitle = step.type === 'source_url'
            ? 'Source URL'
            : step.type === 'download_file'
                ? 'Download File'
                : 'Data Extract';

        return (
            <div key={step.id} className="rounded-lg border border-white/10 bg-black/20 p-2">
                <div className="mb-2 flex items-center justify-between">
                    <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-white/70">
                        {step.type === 'source_url' && <Link2 className="h-3.5 w-3.5 text-cyan-300" />}
                        {step.type === 'download_file' && <Download className="h-3.5 w-3.5 text-emerald-300" />}
                        {step.type === 'data_extract' && <FolderTree className="h-3.5 w-3.5 text-green-300" />}
                        <span>{stepTitle}</span>
                    </div>
                    <div className="flex gap-1">
                        <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            className="h-6 w-6"
                            onClick={() => updateWorkflowPhase(currentPhaseKey, (phase) => {
                                const [chain] = updateRepeaterInTree(phase.chain, repeater.id, (current) => ({
                                    ...current,
                                    steps: moveItem(current.steps, stepIndex, stepIndex - 1),
                                }));
                                return { ...phase, chain };
                            })}
                        >
                            <ArrowUp className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            className="h-6 w-6"
                            onClick={() => updateWorkflowPhase(currentPhaseKey, (phase) => {
                                const [chain] = updateRepeaterInTree(phase.chain, repeater.id, (current) => ({
                                    ...current,
                                    steps: moveItem(current.steps, stepIndex, stepIndex + 1),
                                }));
                                return { ...phase, chain };
                            })}
                        >
                            <ArrowDown className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            className="h-6 w-6 text-red-300"
                            onClick={() => updateWorkflowPhase(currentPhaseKey, (phase) => {
                                const [chain] = removeStepFromTree(phase.chain, step.id);
                                return { ...phase, chain };
                            })}
                        >
                            <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                    </div>
                </div>

                {step.type === 'source_url' && (
                    <div className="space-y-2">
                        <Input
                            value={step.selector}
                            placeholder="Selector for source URL"
                            className="h-8 border-white/10 bg-black/30 text-xs text-white"
                            onFocus={() => setSelectorFocus(stepTarget('selector'), step.selector)}
                            onChange={(event) => {
                                const value = event.target.value;
                                updateWorkflowPhase(currentPhaseKey, (phase) => {
                                    const [chain] = updateStepInTree(phase.chain, step.id, (current) => (
                                        current.type === 'source_url' ? { ...current, selector: value } : current
                                    ));
                                    return { ...phase, chain };
                                });
                                syncPreviewOnChange(stepTarget('selector'), value);
                            }}
                        />
                        <div className="grid grid-cols-2 gap-2">
                            <Input
                                value="href"
                                disabled
                                className="h-8 border-white/10 bg-black/40 text-xs text-white/60"
                            />
                            <Select
                                value={step.url_type_id ?? workflow.url_types[0]?.id}
                                disabled={!isDiscovery}
                                onValueChange={(value) => {
                                    updateWorkflowPhase(currentPhaseKey, (phase) => {
                                        const [chain] = updateStepInTree(phase.chain, step.id, (current) => (
                                            current.type === 'source_url' ? { ...current, url_type_id: value } : current
                                        ));
                                        return { ...phase, chain };
                                    });
                                }}
                            >
                                <SelectTrigger className="h-8 border-white/10 bg-black/30 text-xs text-white">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {workflow.url_types.map((urlType) => (
                                        <SelectItem key={urlType.id} value={urlType.id}>
                                            {urlType.name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                )}

                {step.type === 'download_file' && (
                    <div className="space-y-2">
                        <Input
                            value={step.url_selector}
                            placeholder="File URL selector"
                            className="h-8 border-white/10 bg-black/30 text-xs text-white"
                            onFocus={() => setSelectorFocus(stepTarget('url_selector'), step.url_selector)}
                            onChange={(event) => {
                                const value = event.target.value;
                                updateWorkflowPhase(currentPhaseKey, (phase) => {
                                    const [chain] = updateStepInTree(phase.chain, step.id, (current) => (
                                        current.type === 'download_file' ? { ...current, url_selector: value } : current
                                    ));
                                    return { ...phase, chain };
                                });
                                syncPreviewOnChange(stepTarget('url_selector'), value);
                            }}
                        />
                        <Input
                            value={step.filename_selector ?? ''}
                            placeholder="Filename selector (optional)"
                            className="h-8 border-white/10 bg-black/30 text-xs text-white"
                            onFocus={() => setSelectorFocus(stepTarget('filename_selector'), step.filename_selector ?? '')}
                            onChange={(event) => {
                                const value = event.target.value;
                                updateWorkflowPhase(currentPhaseKey, (phase) => {
                                    const [chain] = updateStepInTree(phase.chain, step.id, (current) => (
                                        current.type === 'download_file' ? { ...current, filename_selector: value } : current
                                    ));
                                    return { ...phase, chain };
                                });
                                syncPreviewOnChange(stepTarget('filename_selector'), value);
                            }}
                        />
                        <Input
                            value={step.file_type_hint ?? ''}
                            placeholder="File type hint (optional)"
                            className="h-8 border-white/10 bg-black/30 text-xs text-white"
                            onChange={(event) => {
                                const value = event.target.value;
                                updateWorkflowPhase(currentPhaseKey, (phase) => {
                                    const [chain] = updateStepInTree(phase.chain, step.id, (current) => (
                                        current.type === 'download_file' ? { ...current, file_type_hint: value } : current
                                    ));
                                    return { ...phase, chain };
                                });
                            }}
                        />
                    </div>
                )}

                {step.type === 'data_extract' && (
                    <div className="space-y-2">
                        <div className="grid grid-cols-2 gap-2">
                            <Input
                                value={step.key}
                                placeholder="Output key"
                                className="h-8 border-white/10 bg-black/30 text-xs text-white"
                                onChange={(event) => {
                                    const value = event.target.value;
                                    updateWorkflowPhase(currentPhaseKey, (phase) => {
                                        const [chain] = updateStepInTree(phase.chain, step.id, (current) => (
                                            current.type === 'data_extract' ? { ...current, key: value } : current
                                        ));
                                        return { ...phase, chain };
                                    });
                                }}
                            />
                            <Select
                                value={step.extract_type}
                                onValueChange={(value) => {
                                    updateWorkflowPhase(currentPhaseKey, (phase) => {
                                        const [chain] = updateStepInTree(phase.chain, step.id, (current) => (
                                            current.type === 'data_extract'
                                                ? { ...current, extract_type: value as 'text' | 'href' }
                                                : current
                                        ));
                                        return { ...phase, chain };
                                    });
                                }}
                            >
                                <SelectTrigger className="h-8 border-white/10 bg-black/30 text-xs text-white">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="text">Text</SelectItem>
                                    <SelectItem value="href">Href</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <Input
                            value={step.selector}
                            placeholder="CSS selector"
                            className="h-8 border-white/10 bg-black/30 text-xs text-white"
                            onFocus={() => setSelectorFocus(stepTarget('selector'), step.selector)}
                            onChange={(event) => {
                                const value = event.target.value;
                                updateWorkflowPhase(currentPhaseKey, (phase) => {
                                    const [chain] = updateStepInTree(phase.chain, step.id, (current) => (
                                        current.type === 'data_extract' ? { ...current, selector: value } : current
                                    ));
                                    return { ...phase, chain };
                                });
                                syncPreviewOnChange(stepTarget('selector'), value);
                            }}
                        />
                    </div>
                )}
            </div>
        );
    };

    const renderScopeNode = (scope: ScopeModule, depth: number) => {
        const scopeTarget: FocusTarget = currentPhaseKey.phase === 'discovery'
            ? { phase: 'discovery', section: 'scope', scopeId: scope.id }
            : { phase: 'processing', urlTypeId: currentPhaseKey.urlTypeId, section: 'scope', scopeId: scope.id };

        const paginationTarget: FocusTarget = currentPhaseKey.phase === 'discovery'
            ? { phase: 'discovery', section: 'pagination', scopeId: scope.id }
            : { phase: 'processing', urlTypeId: currentPhaseKey.urlTypeId, section: 'pagination', scopeId: scope.id };

        return (
            <div key={scope.id} className={cn('space-y-2 rounded-lg border border-cyan-500/40 bg-cyan-500/5 p-3', depth > 0 && 'ml-4')}>
                <div className="flex items-center justify-between">
                    <div className="text-xs font-semibold uppercase tracking-wider text-cyan-200">Scope</div>
                    <div className="flex gap-1">
                        <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            className={cn('h-7 text-xs', effectiveSelectedScopeId === scope.id ? 'bg-white/20 text-white' : 'text-white/70')}
                            onClick={() => setSelectedScopeId(scope.id)}
                        >
                            Target
                        </Button>
                        <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7 text-red-300"
                            onClick={() => {
                                updateWorkflowPhase(currentPhaseKey, (phase) => {
                                    const [chain] = removeScopeFromTree(phase.chain, scope.id);
                                    return { ...phase, chain };
                                });
                            }}
                        >
                            <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                    <Input
                        value={scope.css_selector}
                        placeholder="Scope selector"
                        className="h-8 border-white/10 bg-black/30 text-xs text-white"
                        onFocus={() => setSelectorFocus(scopeTarget, scope.css_selector)}
                        onChange={(event) => {
                            const value = event.target.value;
                            updateWorkflowPhase(currentPhaseKey, (phase) => {
                                const [chain] = updateScopeInTree(phase.chain, scope.id, (current) => ({ ...current, css_selector: value }));
                                return { ...phase, chain };
                            });
                            syncPreviewOnChange(scopeTarget, value);
                        }}
                    />
                    <Input
                        value={scope.label}
                        placeholder="Scope label"
                        className="h-8 border-white/10 bg-black/30 text-xs text-white"
                        onChange={(event) => {
                            const value = event.target.value;
                            updateWorkflowPhase(currentPhaseKey, (phase) => {
                                const [chain] = updateScopeInTree(phase.chain, scope.id, (current) => ({ ...current, label: value }));
                                return { ...phase, chain };
                            });
                        }}
                    />
                </div>

                {scope.repeater && (() => {
                    const repeater = scope.repeater;
                    const repeaterTarget: FocusTarget = currentPhaseKey.phase === 'discovery'
                        ? { phase: 'discovery', section: 'repeater', repeaterId: repeater.id }
                        : { phase: 'processing', urlTypeId: currentPhaseKey.urlTypeId, section: 'repeater', repeaterId: repeater.id };

                    return (
                        <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-2">
                            <div className="mb-2 flex items-center justify-between">
                                <div className="text-xs font-semibold uppercase tracking-wider text-amber-200">Repeater</div>
                                <div className="flex gap-1">
                                    <Button
                                        type="button"
                                        size="sm"
                                        variant="ghost"
                                        className={cn('h-7 text-xs', effectiveSelectedRepeaterId === repeater.id ? 'bg-white/20 text-white' : 'text-white/70')}
                                        onClick={() => {
                                            setSelectedScopeId(scope.id);
                                            setSelectedRepeaterId(repeater.id);
                                        }}
                                    >
                                        Target
                                    </Button>
                                    <Button
                                        type="button"
                                        size="icon"
                                        variant="ghost"
                                        className="h-7 w-7 text-red-300"
                                        onClick={() => {
                                            updateWorkflowPhase(currentPhaseKey, (phase) => {
                                                const [chain] = updateScopeInTree(phase.chain, scope.id, (current) => ({
                                                    ...current,
                                                    repeater: null,
                                                }));
                                                return { ...phase, chain };
                                            });
                                        }}
                                    >
                                        <Trash2 className="h-3.5 w-3.5" />
                                    </Button>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-2">
                                <Input
                                    value={repeater.css_selector}
                                    placeholder="Repeater selector"
                                    className="h-8 border-white/10 bg-black/30 text-xs text-white"
                                    onFocus={() => setSelectorFocus(repeaterTarget, repeater.css_selector)}
                                    onChange={(event) => {
                                        const value = event.target.value;
                                        updateWorkflowPhase(currentPhaseKey, (phase) => {
                                            const [chain] = updateRepeaterInTree(phase.chain, repeater.id, (current) => ({
                                                ...current,
                                                css_selector: value,
                                            }));
                                            return { ...phase, chain };
                                        });
                                        syncPreviewOnChange(repeaterTarget, value);
                                    }}
                                />
                                <Input
                                    value={repeater.label}
                                    placeholder="Repeater label"
                                    className="h-8 border-white/10 bg-black/30 text-xs text-white"
                                    onChange={(event) => {
                                        const value = event.target.value;
                                        updateWorkflowPhase(currentPhaseKey, (phase) => {
                                            const [chain] = updateRepeaterInTree(phase.chain, repeater.id, (current) => ({
                                                ...current,
                                                label: value,
                                            }));
                                            return { ...phase, chain };
                                        });
                                    }}
                                />
                            </div>

                            <div className="mt-2 space-y-2">
                                {repeater.steps.map((step, index) => renderRepeaterStep(step, repeater, index, currentPhaseKey.phase === 'discovery'))}
                            </div>
                        </div>
                    );
                })()}

                {scope.pagination && (
                    <div className="rounded-lg border border-dashed border-red-500/40 bg-red-500/5 p-2">
                        <div className="mb-2 flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-red-200">
                            <span>Pagination</span>
                            <Button
                                type="button"
                                size="icon"
                                variant="ghost"
                                className="h-6 w-6 text-red-300"
                                onClick={() => {
                                    updateWorkflowPhase(currentPhaseKey, (phase) => {
                                        const [chain] = updateScopeInTree(phase.chain, scope.id, (current) => ({
                                            ...current,
                                            pagination: null,
                                        }));
                                        return { ...phase, chain };
                                    });
                                }}
                            >
                                <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                            <Input
                                value={scope.pagination.css_selector}
                                placeholder="Next selector"
                                className="h-8 border-white/10 bg-black/30 text-xs text-white"
                                onFocus={() => setSelectorFocus(paginationTarget, scope.pagination?.css_selector ?? '')}
                                onChange={(event) => {
                                    const value = event.target.value;
                                    updateWorkflowPhase(currentPhaseKey, (phase) => {
                                        const [chain] = updateScopeInTree(phase.chain, scope.id, (current) => ({
                                            ...current,
                                            pagination: {
                                                ...(current.pagination ?? { css_selector: '', max_pages: 0 }),
                                                css_selector: value,
                                            },
                                        }));
                                        return { ...phase, chain };
                                    });
                                    syncPreviewOnChange(paginationTarget, value);
                                }}
                            />
                            <Input
                                type="number"
                                value={scope.pagination.max_pages}
                                placeholder="0 = all"
                                className="h-8 border-white/10 bg-black/30 text-xs text-white"
                                onChange={(event) => {
                                    const value = Number(event.target.value) || 0;
                                    updateWorkflowPhase(currentPhaseKey, (phase) => {
                                        const [chain] = updateScopeInTree(phase.chain, scope.id, (current) => ({
                                            ...current,
                                            pagination: {
                                                ...(current.pagination ?? { css_selector: '', max_pages: 0 }),
                                                max_pages: value,
                                            },
                                        }));
                                        return { ...phase, chain };
                                    });
                                }}
                            />
                        </div>
                    </div>
                )}

                {scope.children.length > 0 && (
                    <div className="space-y-2">
                        {scope.children.map((child) => renderScopeNode(child, depth + 1))}
                    </div>
                )}
            </div>
        );
    };

    const renderPhaseEditor = () => (
        <div className="space-y-4">
            <section className="rounded-lg border border-white/10 bg-white/5 p-3">
                <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-white/60">Step Chooser</div>
                <div className="space-y-3">
                    <div className="rounded-lg border border-white/10 bg-black/30 p-2">
                        <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-white/70">
                            <Clock3 className="h-3.5 w-3.5" />
                            Before
                        </div>
                        <div className="flex gap-2">
                            <Select value={beforeToAdd} onValueChange={(value) => setBeforeToAdd(value as BasicBeforeStepType)}>
                                <SelectTrigger className="h-8 border-white/10 bg-black/30 text-xs text-white">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {BASIC_BEFORE_STEP_TYPES.map((item) => (
                                        <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <Button type="button" size="sm" onClick={addBasicBeforeAction} className="h-8">
                                <Plus className="mr-1 h-3.5 w-3.5" />
                                Add
                            </Button>
                        </div>
                    </div>

                    {playwrightEnabled && (
                        <div className="rounded-lg border border-purple-500/30 bg-purple-500/5 p-2">
                            <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-purple-200">
                                <Bot className="h-3.5 w-3.5" />
                                Playwright
                            </div>
                            <div className="flex gap-2">
                                <Select value={playwrightToAdd} onValueChange={(value) => setPlaywrightToAdd(value as PlaywrightBeforeStepType)}>
                                    <SelectTrigger className="h-8 border-purple-500/20 bg-black/30 text-xs text-white">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {PLAYWRIGHT_BEFORE_STEP_TYPES.map((item) => (
                                            <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                <Button type="button" size="sm" onClick={addPlaywrightAction} className="h-8">
                                    <Plus className="mr-1 h-3.5 w-3.5" />
                                    Add
                                </Button>
                            </div>
                        </div>
                    )}

                    <div className="rounded-lg border border-cyan-500/30 bg-cyan-500/5 p-2">
                        <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-cyan-200">
                            <FolderTree className="h-3.5 w-3.5" />
                            Core
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                            <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                className="h-8 border-cyan-500/40 bg-transparent text-cyan-100"
                                onClick={addScopeStep}
                            >
                                + Scope
                            </Button>
                            <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                className="h-8 border-amber-500/40 bg-transparent text-amber-100"
                                disabled={!effectiveSelectedScopeId}
                                onClick={addRepeaterStep}
                            >
                                + Repeater
                            </Button>
                            <Select value={effectiveSelectedRepeaterId ?? ''} onValueChange={setSelectedRepeaterId}>
                                <SelectTrigger className="h-8 border-green-500/40 bg-black/30 text-xs text-white">
                                    <SelectValue placeholder="Step target repeater" />
                                </SelectTrigger>
                                <SelectContent>
                                    {repeaterRefs.map((item) => (
                                        <SelectItem key={item.repeaterId} value={item.repeaterId}>
                                            {item.scopeLabel} {'->'} {item.repeaterLabel}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            {activeTab === 'discovery' ? (
                                <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    className="h-8 border-cyan-500/40 bg-transparent text-cyan-100"
                                    disabled={!effectiveSelectedRepeaterId}
                                    onClick={addSourceUrlStep}
                                >
                                    + Source URL
                                </Button>
                            ) : (
                                <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    className="h-8 border-emerald-500/40 bg-transparent text-emerald-100"
                                    disabled={!effectiveSelectedRepeaterId}
                                    onClick={addDownloadFileStep}
                                >
                                    + Download File
                                </Button>
                            )}
                            <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                className="h-8 border-green-500/40 bg-transparent text-green-100"
                                disabled={!effectiveSelectedRepeaterId}
                                onClick={addDataExtractStep}
                            >
                                + Data Extract
                            </Button>
                            <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                className="h-8 border-red-500/40 bg-transparent text-red-100"
                                disabled={!effectiveSelectedScopeId}
                                onClick={addPaginationStep}
                            >
                                + Pagination
                            </Button>
                        </div>
                        <div className="mt-2 text-[11px] text-white/50">
                            Scope target: {scopeRefs.find((scope) => scope.scopeId === effectiveSelectedScopeId)?.scopeLabel ?? 'none'}
                            {' | '}
                            Repeater target: {repeaterRefs.find((item) => item.repeaterId === effectiveSelectedRepeaterId)?.repeaterLabel ?? 'none'}
                        </div>
                    </div>
                </div>
            </section>

            <section className="space-y-2 rounded-lg border border-white/10 bg-white/5 p-3">
                <div className="text-xs font-semibold uppercase tracking-wider text-white/60">Before Pipeline</div>
                {currentPhase.before.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-white/20 py-4 text-center text-xs text-white/40">
                        No before actions
                    </div>
                ) : (
                    currentPhase.before.map((action, index) => renderBeforeAction(action, index))
                )}
            </section>

            <section className="space-y-2 rounded-lg border border-cyan-500/30 bg-cyan-500/5 p-3">
                <div className="text-xs font-semibold uppercase tracking-wider text-cyan-200">Core Chain</div>
                {currentPhase.chain.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-white/20 py-8 text-center text-sm text-white/40">
                        Add Scope in Step Chooser to start chain
                    </div>
                ) : (
                    currentPhase.chain.map((scope) => renderScopeNode(scope, 0))
                )}
            </section>
        </div>
    );

    return (
        <aside className="flex h-full w-full flex-col overflow-hidden border-l border-white/10 bg-black/30 backdrop-blur-sm">
            <div className="border-b border-white/10 p-4">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm font-medium text-white/70">
                        <Workflow className="h-4 w-4" />
                        <span>Scraping Workflow</span>
                    </div>
                    <div className="rounded bg-white/10 px-2 py-1 text-xs text-white/60">
                        {playwrightEnabled ? 'Playwright' : 'Scrapy'}
                    </div>
                </div>
            </div>

            <div className="flex min-h-0 flex-1 flex-col">
                <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as PhaseTab)} className="flex min-h-0 flex-1 flex-col">
                    <div className="border-b border-white/10 px-4 pt-4">
                        <TabsList className="h-auto border-0 bg-transparent p-0">
                            <TabsTrigger value="discovery" className="text-white/60 data-[state=active]:bg-white/10 data-[state=active]:text-white">
                                Phase 1: Discovery
                            </TabsTrigger>
                            <TabsTrigger value="processing" className="text-white/60 data-[state=active]:bg-white/10 data-[state=active]:text-white">
                                Phase 2: Processing
                            </TabsTrigger>
                        </TabsList>
                    </div>

                    <TabsContent value="discovery" className="m-0 flex min-h-0 flex-1 flex-col overflow-hidden">
                        <div className="min-h-0 flex-1 overflow-auto p-4">
                            {renderPhaseEditor()}
                        </div>
                    </TabsContent>

                    <TabsContent value="processing" className="m-0 flex min-h-0 flex-1 flex-col overflow-hidden">
                        <div className="border-b border-white/10 p-4">
                            <div className="mb-3 flex items-center justify-between">
                                <h3 className="text-xs font-semibold uppercase tracking-wider text-white/50">URL Types</h3>
                                <Button type="button" size="sm" variant="ghost" className="h-7 text-white/70 hover:bg-white/10" onClick={handleUrlTypeAdd}>
                                    <Plus className="mr-1 h-3 w-3" />
                                    Add URL Type
                                </Button>
                            </div>
                            <div className="space-y-2">
                                {workflow.url_types.map((urlType) => (
                                    <div
                                        key={urlType.id}
                                        role="button"
                                        tabIndex={0}
                                        aria-pressed={activeUrlType.id === urlType.id}
                                        onClick={() => setActiveUrlTypeId(urlType.id)}
                                        onKeyDown={(event) => {
                                            if (event.key === 'Enter' || event.key === ' ') {
                                                event.preventDefault();
                                                setActiveUrlTypeId(urlType.id);
                                            }
                                        }}
                                        className={cn(
                                            'w-full rounded-lg border px-3 py-2 text-left transition-colors',
                                            activeUrlType.id === urlType.id
                                                ? 'border-purple-500/50 bg-purple-500/20'
                                                : 'border-white/10 bg-zinc-900/50 hover:border-white/20',
                                        )}
                                    >
                                        <div className="flex items-center justify-between gap-2">
                                            <span className="truncate text-sm text-white">{urlType.name}</span>
                                            <span className="flex gap-1">
                                                <Button
                                                    type="button"
                                                    size="icon"
                                                    variant="ghost"
                                                    className="h-6 w-6 text-white/40 hover:text-white"
                                                    onClick={(event) => {
                                                        event.stopPropagation();
                                                        handleUrlTypeRename(urlType);
                                                    }}
                                                >
                                                    <Settings2 className="h-3.5 w-3.5" />
                                                </Button>
                                                {workflow.url_types.length > 1 && (
                                                    <Button
                                                        type="button"
                                                        size="icon"
                                                        variant="ghost"
                                                        className="h-6 w-6 text-white/40 hover:text-red-300"
                                                        onClick={(event) => {
                                                            event.stopPropagation();
                                                            handleUrlTypeDelete(urlType.id);
                                                        }}
                                                    >
                                                        <Trash2 className="h-3.5 w-3.5" />
                                                    </Button>
                                                )}
                                            </span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="min-h-0 flex-1 overflow-auto p-4">
                            {renderPhaseEditor()}
                        </div>
                    </TabsContent>
                </Tabs>
            </div>
        </aside>
    );
});

SimulatorSidebar.displayName = 'SimulatorSidebar';
