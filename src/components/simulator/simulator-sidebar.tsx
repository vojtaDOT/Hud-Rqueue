'use client';

import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useState } from 'react';
import {
    ArrowDown,
    ArrowUp,
    Crosshair,
    Download,
    FileText,
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
    ElementSelector,
    PhaseConfig,
    PlaywrightAction,
    RepeaterNode,
    RepeaterStep,
    ScrapingWorkflow,
    ScopeModule,
    SourceUrlType,
} from '@/lib/crawler-types';
import {
    actionHasSelector,
    appendChildScope,
    collectRepeaters,
    collectScopes,
    createDataExtractStep,
    createDefaultBeforeAction,
    createDocumentUrlStep,
    createDownloadFileStep,
    createEmptyPhase,
    createId,
    createRepeaterNode,
    createScopeModule,
    createSourceUrlStep,
    describeTarget,
    ensureScopeAndRepeater,
    findScopeForRepeater,
    findScopeForStep,
    findScopeInTree,
    firstStepTarget,
    FocusTarget,
    isPlaywrightBeforeAction,
    isSameTarget,
    mapStepsInTree,
    moveItem,
    normalizeSelectorWithinScope,
    removeScopeFromTree,
    removeStepFromTree,
    SelectorKey,
    updateRepeaterInTree,
    updateScopeInTree,
    updateStepInTree,
} from '@/lib/workflow-tree';
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
import { BeforeActionCard } from '@/components/simulator/sidebar/before-action-card';
import { RepeaterStepCard } from '@/components/simulator/sidebar/repeater-step-card';
import { ScopeNodeCard } from '@/components/simulator/sidebar/scope-node-card';
import { StepChooser } from '@/components/simulator/sidebar/step-chooser';
import { PhaseEditor } from '@/components/simulator/sidebar/phase-editor';

type PhaseTab = 'discovery' | 'processing';
type BasicBeforeStepType = 'remove_element' | 'wait_timeout';
type PlaywrightBeforeStepType = PlaywrightAction['type'];

export type SidebarQuickAction =
    | 'scope'
    | 'repeater'
    | 'source_url'
    | 'document_url'
    | 'download_url'
    | 'filename_selector'
    | 'pagination'
    | 'auto_scaffold';

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
    applyQuickAction: (action: SidebarQuickAction, selector: string, elementInfo?: ElementSelector) => void;
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
    const [armedTarget, setArmedTarget] = useState<FocusTarget | null>(null);
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

    const armSelectorTarget = (target: FocusTarget, selector: string) => {
        setFocusedTarget(target);
        setArmedTarget(target);
        onSelectorPreviewChange?.(selector.trim() ? selector : null);
    };

    const cancelArmedTarget = useCallback(() => {
        setArmedTarget(null);
    }, []);

    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key !== 'Escape') return;
            if (!armedTarget) return;
            event.preventDefault();
            setArmedTarget(null);
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [armedTarget]);

    const syncPreviewOnChange = (target: FocusTarget, value: string) => {
        if (isSameTarget(target, focusedTarget)) {
            onSelectorPreviewChange?.(value.trim() ? value : null);
        }
    };

    const renderPickButton = (target: FocusTarget, selector: string) => (
        <Button
            type="button"
            size="icon"
            variant="ghost"
            className={cn(
                'h-8 w-8 border border-white/10',
                isSameTarget(target, armedTarget) ? 'bg-cyan-500/30 text-cyan-100' : 'text-white/60',
            )}
            title="Pick target selector"
            onClick={() => armSelectorTarget(target, selector)}
        >
            <Crosshair className="h-3.5 w-3.5" />
        </Button>
    );

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

            const target = armedTarget ?? focusedTarget ?? getFallbackTarget();
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
                            if (step.type === 'document_url') {
                                if (target.selectorKey === 'selector') {
                                    return { ...step, selector: nextSelector };
                                }
                                if (target.selectorKey === 'filename_selector') {
                                    return { ...step, filename_selector: nextSelector };
                                }
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
            if (armedTarget) {
                setArmedTarget(null);
            }
            return true;
        },
        appendRemoveElementBeforeAction: (selector: string) => {
            updateWorkflowPhase(currentPhaseKey, (phase) => ({
                ...phase,
                before: [...phase.before, { type: 'remove_element', css_selector: selector }],
            }));
        },
        applyQuickAction: (action: SidebarQuickAction, selector: string, elementInfo?: ElementSelector) => {
            const nextSelectorRaw = (elementInfo?.localSelector ?? selector).trim();
            if (!nextSelectorRaw) return;

            if (action === 'scope') {
                let nextScopeId = effectiveSelectedScopeId;
                updateWorkflowPhase(currentPhaseKey, (phase) => {
                    if (!nextScopeId || !findScopeInTree(phase.chain, nextScopeId)) {
                        const scope = createScopeModule();
                        nextScopeId = scope.id;
                        return {
                            ...phase,
                            chain: [...phase.chain, { ...scope, css_selector: nextSelectorRaw }],
                        };
                    }
                    const [chain] = updateScopeInTree(phase.chain, nextScopeId, (scope) => ({
                        ...scope,
                        css_selector: nextSelectorRaw,
                    }));
                    return { ...phase, chain };
                });
                if (nextScopeId) {
                    setSelectedScopeId(nextScopeId);
                }
                return;
            }

            if (action === 'pagination') {
                let nextScopeId = effectiveSelectedScopeId;
                updateWorkflowPhase(currentPhaseKey, (phase) => {
                    if (!nextScopeId || !findScopeInTree(phase.chain, nextScopeId)) {
                        const scope = createScopeModule();
                        nextScopeId = scope.id;
                        return {
                            ...phase,
                            chain: [...phase.chain, { ...scope, pagination: { css_selector: nextSelectorRaw, max_pages: 0 } }],
                        };
                    }
                    const [chain] = updateScopeInTree(phase.chain, nextScopeId, (scope) => ({
                        ...scope,
                        pagination: {
                            ...(scope.pagination ?? { css_selector: '', max_pages: 0 }),
                            css_selector: nextSelectorRaw,
                        },
                    }));
                    return { ...phase, chain };
                });
                if (nextScopeId) {
                    setSelectedScopeId(nextScopeId);
                }
                return;
            }

            if (action === 'repeater' || action === 'auto_scaffold' || action === 'source_url' || action === 'document_url' || action === 'download_url' || action === 'filename_selector') {
                const phaseKey = (action === 'source_url' || action === 'document_url' || action === 'auto_scaffold')
                    ? ({ phase: 'discovery' } as const)
                    : currentPhaseKey;
                let nextScopeId: string | null = null;
                let nextRepeaterId: string | null = null;

                updateWorkflowPhase(phaseKey, (phase) => {
                    const ensured = ensureScopeAndRepeater(phase, effectiveSelectedScopeId, effectiveSelectedRepeaterId);
                    nextScopeId = ensured.scopeId;
                    nextRepeaterId = ensured.repeaterId;
                    let nextPhase = ensured.phase;

                    if (action === 'auto_scaffold') {
                        const scopeSelector = (elementInfo?.parentSelector ?? nextSelectorRaw).trim();
                        const [chain] = updateScopeInTree(nextPhase.chain, ensured.scopeId, (scope) => ({
                            ...scope,
                            css_selector: scope.css_selector.trim() || scopeSelector,
                        }));
                        nextPhase = { ...nextPhase, chain };
                    }

                    if (action === 'repeater' || action === 'auto_scaffold') {
                        const scope = findScopeInTree(nextPhase.chain, ensured.scopeId);
                        const normalizedSelector = normalizeSelectorWithinScope(nextSelectorRaw, scope?.css_selector);
                        const [chain] = updateRepeaterInTree(nextPhase.chain, ensured.repeaterId, (repeater) => ({
                            ...repeater,
                            css_selector: normalizedSelector,
                        }));
                        nextPhase = { ...nextPhase, chain };
                    }

                    if (action === 'source_url' || action === 'auto_scaffold') {
                        const defaultUrlTypeId = workflow.url_types[0]?.id;
                        const scope = findScopeInTree(nextPhase.chain, ensured.scopeId);
                        const normalizedSelector = normalizeSelectorWithinScope(nextSelectorRaw, scope?.css_selector);
                        const [chain] = updateRepeaterInTree(nextPhase.chain, ensured.repeaterId, (repeater) => {
                            const hasExisting = repeater.steps.some((step) => step.type === 'source_url' && step.selector.trim() === normalizedSelector);
                            if (hasExisting) return repeater;
                            return {
                                ...repeater,
                                steps: [
                                    ...repeater.steps,
                                    {
                                        ...createSourceUrlStep(defaultUrlTypeId),
                                        selector: normalizedSelector,
                                    },
                                ],
                            };
                        });
                        nextPhase = { ...nextPhase, chain };
                    }

                    if (action === 'document_url') {
                        const scope = findScopeInTree(nextPhase.chain, ensured.scopeId);
                        const normalizedSelector = normalizeSelectorWithinScope(nextSelectorRaw, scope?.css_selector);
                        const [chain] = updateRepeaterInTree(nextPhase.chain, ensured.repeaterId, (repeater) => ({
                            ...repeater,
                            steps: [
                                ...repeater.steps,
                                {
                                    ...createDocumentUrlStep(),
                                    selector: normalizedSelector,
                                },
                            ],
                        }));
                        nextPhase = { ...nextPhase, chain };
                    }

                    if (action === 'download_url' || action === 'filename_selector') {
                        const scope = findScopeInTree(nextPhase.chain, ensured.scopeId);
                        const normalizedSelector = normalizeSelectorWithinScope(nextSelectorRaw, scope?.css_selector);
                        const [chain] = updateRepeaterInTree(nextPhase.chain, ensured.repeaterId, (repeater) => {
                            const existingIndex = repeater.steps.findIndex((step) => step.type === 'download_file');
                            if (existingIndex < 0) {
                                return {
                                    ...repeater,
                                    steps: [
                                        ...repeater.steps,
                                        {
                                            ...createDownloadFileStep(),
                                            ...(action === 'download_url' ? { url_selector: normalizedSelector } : { filename_selector: normalizedSelector }),
                                        },
                                    ],
                                };
                            }
                            return {
                                ...repeater,
                                steps: repeater.steps.map((step, index) => {
                                    if (index !== existingIndex || step.type !== 'download_file') return step;
                                    return action === 'download_url'
                                        ? { ...step, url_selector: normalizedSelector }
                                        : { ...step, filename_selector: normalizedSelector };
                                }),
                            };
                        });
                        nextPhase = { ...nextPhase, chain };
                    }

                    return nextPhase;
                });

                if (phaseKey.phase === 'discovery') {
                    setActiveTab('discovery');
                }
                if (nextScopeId) {
                    setSelectedScopeId(nextScopeId);
                }
                if (nextRepeaterId) {
                    setSelectedRepeaterId(nextRepeaterId);
                }
            }
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
    }), [
        armedTarget,
        currentPhaseKey,
        effectiveSelectedRepeaterId,
        effectiveSelectedScopeId,
        focusedTarget,
        getFallbackTarget,
        onSelectorPreviewChange,
        resolveSelectorForTarget,
        workflow,
    ]);

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

    const addDocumentUrlStep = () => {
        if (!effectiveSelectedRepeaterId || currentPhaseKey.phase !== 'discovery') return;
        const documentUrlStep = createDocumentUrlStep();
        updateWorkflowPhase(currentPhaseKey, (phase) => {
            const [chain] = updateRepeaterInTree(phase.chain, effectiveSelectedRepeaterId, (repeater) => ({
                ...repeater,
                steps: [...repeater.steps, documentUrlStep],
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
            <BeforeActionCard
                key={`before-${index}`}
                title={getActionLabel(action)}
                actions={(
                    <>
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
                    </>
                )}
            >

                {action.type === 'remove_element' && (
                    <div className="flex items-center gap-1">
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
                        {renderPickButton(target, action.css_selector)}
                    </div>
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
                        <div className="col-span-2 flex items-center gap-1">
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
                            {renderPickButton(target, action.css_selector)}
                        </div>
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
                        <div className="col-span-2 flex items-center gap-1">
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
                            {renderPickButton(target, action.css_selector)}
                        </div>
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
                        <div className="flex items-center gap-1">
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
                            {renderPickButton(target, action.css_selector)}
                        </div>
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
                        <div className="col-span-2 flex items-center gap-1">
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
                            {renderPickButton(target, action.css_selector)}
                        </div>
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
            </BeforeActionCard>
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
            : step.type === 'document_url'
                ? 'Document URL'
            : step.type === 'download_file'
                ? 'Download File'
                : 'Data Extract';

        return (
            <RepeaterStepCard
                key={step.id}
                header={(
                    <>
                        {step.type === 'source_url' && <Link2 className="h-3.5 w-3.5 text-cyan-300" />}
                        {step.type === 'document_url' && <FileText className="h-3.5 w-3.5 text-sky-300" />}
                        {step.type === 'download_file' && <Download className="h-3.5 w-3.5 text-emerald-300" />}
                        {step.type === 'data_extract' && <FolderTree className="h-3.5 w-3.5 text-green-300" />}
                        <span>{stepTitle}</span>
                    </>
                )}
                actions={(
                    <>
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
                    </>
                )}
            >

                {step.type === 'source_url' && (
                    <div className="space-y-2">
                        <div className="flex items-center gap-1">
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
                            {renderPickButton(stepTarget('selector'), step.selector)}
                        </div>
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

                {step.type === 'document_url' && (
                    <div className="space-y-2">
                        <div className="flex items-center gap-1">
                            <Input
                                value={step.selector}
                                placeholder="Selector for document URL"
                                className="h-8 border-white/10 bg-black/30 text-xs text-white"
                                onFocus={() => setSelectorFocus(stepTarget('selector'), step.selector)}
                                onChange={(event) => {
                                    const value = event.target.value;
                                    updateWorkflowPhase(currentPhaseKey, (phase) => {
                                        const [chain] = updateStepInTree(phase.chain, step.id, (current) => (
                                            current.type === 'document_url' ? { ...current, selector: value } : current
                                        ));
                                        return { ...phase, chain };
                                    });
                                    syncPreviewOnChange(stepTarget('selector'), value);
                                }}
                            />
                            {renderPickButton(stepTarget('selector'), step.selector)}
                        </div>
                        <div className="flex items-center gap-1">
                            <Input
                                value={step.filename_selector ?? ''}
                                placeholder="Filename selector (optional)"
                                className="h-8 border-white/10 bg-black/30 text-xs text-white"
                                onFocus={() => setSelectorFocus(stepTarget('filename_selector'), step.filename_selector ?? '')}
                                onChange={(event) => {
                                    const value = event.target.value;
                                    updateWorkflowPhase(currentPhaseKey, (phase) => {
                                        const [chain] = updateStepInTree(phase.chain, step.id, (current) => (
                                            current.type === 'document_url' ? { ...current, filename_selector: value } : current
                                        ));
                                        return { ...phase, chain };
                                    });
                                    syncPreviewOnChange(stepTarget('filename_selector'), value);
                                }}
                            />
                            {renderPickButton(stepTarget('filename_selector'), step.filename_selector ?? '')}
                        </div>
                    </div>
                )}

                {step.type === 'download_file' && (
                    <div className="space-y-2">
                        <div className="flex items-center gap-1">
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
                            {renderPickButton(stepTarget('url_selector'), step.url_selector)}
                        </div>
                        <div className="flex items-center gap-1">
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
                            {renderPickButton(stepTarget('filename_selector'), step.filename_selector ?? '')}
                        </div>
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
                        <div className="flex items-center gap-1">
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
                            {renderPickButton(stepTarget('selector'), step.selector)}
                        </div>
                    </div>
                )}
            </RepeaterStepCard>
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
            <ScopeNodeCard
                key={scope.id}
                depth={depth}
                title="Scope"
                actions={(
                    <>
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
                    </>
                )}
            >

                <div className="grid grid-cols-2 gap-2">
                    <div className="col-span-2 flex items-center gap-1">
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
                        {renderPickButton(scopeTarget, scope.css_selector)}
                    </div>
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
                                <div className="col-span-2 flex items-center gap-1">
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
                                    {renderPickButton(repeaterTarget, repeater.css_selector)}
                                </div>
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
                            <div className="col-span-2 flex items-center gap-1">
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
                                {renderPickButton(paginationTarget, scope.pagination.css_selector)}
                            </div>
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
            </ScopeNodeCard>
        );
    };

    const renderPhaseEditor = () => (
        <PhaseEditor
            stepChooser={(
                <StepChooser
                    armedTargetLabel={armedTarget ? describeTarget(armedTarget) : null}
                    onCancelArmed={cancelArmedTarget}
                    beforeOptions={BASIC_BEFORE_STEP_TYPES}
                    beforeToAdd={beforeToAdd}
                    onBeforeToAddChange={(value) => setBeforeToAdd(value as BasicBeforeStepType)}
                    onAddBasicBeforeAction={addBasicBeforeAction}
                    playwrightEnabled={playwrightEnabled}
                    playwrightOptions={PLAYWRIGHT_BEFORE_STEP_TYPES}
                    playwrightToAdd={playwrightToAdd}
                    onPlaywrightToAddChange={(value) => setPlaywrightToAdd(value as PlaywrightBeforeStepType)}
                    onAddPlaywrightAction={addPlaywrightAction}
                    onAddScope={addScopeStep}
                    onAddRepeater={addRepeaterStep}
                    onAddSourceUrl={addSourceUrlStep}
                    onAddDocumentUrl={addDocumentUrlStep}
                    onAddDownloadFile={addDownloadFileStep}
                    onAddDataExtract={addDataExtractStep}
                    onAddPagination={addPaginationStep}
                    isDiscoveryTab={activeTab === 'discovery'}
                    effectiveSelectedScopeId={effectiveSelectedScopeId}
                    effectiveSelectedRepeaterId={effectiveSelectedRepeaterId}
                    repeaterRefs={repeaterRefs}
                    scopeRefs={scopeRefs}
                    onSelectedRepeaterChange={setSelectedRepeaterId}
                />
            )}
            hasBeforeActions={currentPhase.before.length > 0}
            beforeActions={currentPhase.before.map((action, index) => renderBeforeAction(action, index))}
            hasCoreChain={currentPhase.chain.length > 0}
            coreChain={currentPhase.chain.map((scope) => renderScopeNode(scope, 0))}
        />
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
