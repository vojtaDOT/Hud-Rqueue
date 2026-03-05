import { useCallback, useEffect, useMemo, useState } from 'react';
import type {
    PhaseConfig,
    PlaywrightAction,
    ScrapingWorkflow,
} from '@/lib/crawler-types';
import {
    collectRepeaters,
    collectScopes,
    createDataExtractStep,
    createDefaultBeforeAction,
    createDocumentUrlStep,
    createDownloadFileStep,
    createEmptyPhase,
    createId,
    createPaginationConfig,
    createRepeaterNode,
    createScopeModule,
    createSourceUrlStep,
    appendChildScope,
    findScopeInTree,
    updateRepeaterInTree,
    updateScopeInTree,
    withPaginationDefaults,
} from '@/lib/workflow-tree';

/* ------------------------------------------------------------------ */
/*  Types & constants                                                  */
/* ------------------------------------------------------------------ */

export type PhaseTab = 'discovery' | 'processing';
export type BasicBeforeStepType = 'remove_element' | 'wait_timeout';
export type PlaywrightBeforeStepType = PlaywrightAction['type'];

export const BASIC_BEFORE_STEP_TYPES: Array<{ value: BasicBeforeStepType; label: string }> = [
    { value: 'remove_element', label: 'Remove Element' },
    { value: 'wait_timeout', label: 'Wait Timeout' },
];

export const PLAYWRIGHT_BEFORE_STEP_TYPES: Array<{ value: PlaywrightBeforeStepType; label: string }> = [
    { value: 'wait_selector', label: 'Wait for Selector' },
    { value: 'wait_network', label: 'Wait for Network' },
    { value: 'click', label: 'Click' },
    { value: 'scroll', label: 'Scroll' },
    { value: 'fill', label: 'Fill Input' },
    { value: 'select_option', label: 'Select Dropdown' },
    { value: 'evaluate', label: 'Run JavaScript' },
    { value: 'screenshot', label: 'Screenshot' },
];

/* ------------------------------------------------------------------ */
/*  Factory                                                            */
/* ------------------------------------------------------------------ */

export function createDefaultWorkflow(playwrightEnabled: boolean): ScrapingWorkflow {
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

/* ------------------------------------------------------------------ */
/*  Hook options & return type                                         */
/* ------------------------------------------------------------------ */

export interface UseWorkflowStateOptions {
    playwrightEnabled: boolean;
    onChange?: (workflow: ScrapingWorkflow) => void;
}

export type PhaseKey =
    | { phase: 'discovery' }
    | { phase: 'processing'; urlTypeId: string };

/* ------------------------------------------------------------------ */
/*  Hook                                                               */
/* ------------------------------------------------------------------ */

export function useWorkflowState(options: UseWorkflowStateOptions) {
    const { playwrightEnabled, onChange } = options;

    /* --- core state --- */
    const [activeTab, setActiveTab] = useState<PhaseTab>('discovery');
    const [workflow, setWorkflow] = useState<ScrapingWorkflow>(() => createDefaultWorkflow(playwrightEnabled));
    const [selectedScopeId, setSelectedScopeId] = useState<string | null>(null);
    const [selectedRepeaterId, setSelectedRepeaterId] = useState<string | null>(null);
    const [beforeToAdd, setBeforeToAdd] = useState<BasicBeforeStepType>('remove_element');
    const [playwrightToAdd, setPlaywrightToAdd] = useState<PlaywrightBeforeStepType>('wait_selector');

    /* --- derived (needs activeUrlTypeId from useUrlTypeManager, but we compute
           currentPhase etc. using a passed-in activeUrlType) --- */

    /* We need activeUrlType to compute currentPhase. Since useUrlTypeManager will
       own activeUrlTypeId, we provide a helper that the sidebar can call with the
       resolved activeUrlType. But to keep the migration incremental, we duplicate
       activeUrlTypeId here temporarily — Task 2.3 will remove it. */

    const [activeUrlTypeId, setActiveUrlTypeId] = useState<string>(() => workflow.url_types[0].id);

    const activeUrlType = useMemo(
        () => workflow.url_types.find((item) => item.id === activeUrlTypeId) ?? workflow.url_types[0],
        [workflow.url_types, activeUrlTypeId],
    );

    const currentPhase = useMemo<PhaseConfig>(
        () => (activeTab === 'discovery' ? workflow.discovery : activeUrlType.processing),
        [activeTab, workflow.discovery, activeUrlType],
    );

    const currentPhaseKey = useMemo<PhaseKey>(
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

    /* --- onChange callback --- */
    useEffect(() => {
        onChange?.({
            ...workflow,
            playwright_enabled: playwrightEnabled,
        });
    }, [workflow, playwrightEnabled, onChange]);

    /* --- phase updater --- */
    const updateWorkflowPhase = useCallback((
        target: PhaseKey,
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
    }, []);

    /* --- step creation functions --- */

    const addBasicBeforeAction = useCallback(() => {
        updateWorkflowPhase(currentPhaseKey, (phase) => ({
            ...phase,
            before: [...phase.before, createDefaultBeforeAction(beforeToAdd)],
        }));
    }, [currentPhaseKey, beforeToAdd, updateWorkflowPhase]);

    const addPlaywrightAction = useCallback(() => {
        updateWorkflowPhase(currentPhaseKey, (phase) => ({
            ...phase,
            before: [...phase.before, createDefaultBeforeAction(playwrightToAdd)],
        }));
    }, [currentPhaseKey, playwrightToAdd, updateWorkflowPhase]);

    const addScopeStep = useCallback(() => {
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
    }, [currentPhaseKey, effectiveSelectedScopeId, updateWorkflowPhase]);

    const addRepeaterStep = useCallback(() => {
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
    }, [currentPhaseKey, effectiveSelectedScopeId, updateWorkflowPhase]);

    const addSourceUrlStep = useCallback(() => {
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
    }, [currentPhaseKey, effectiveSelectedRepeaterId, workflow.url_types, updateWorkflowPhase]);

    const addDocumentUrlStep = useCallback(() => {
        if (!effectiveSelectedRepeaterId || currentPhaseKey.phase !== 'discovery') return;
        const documentUrlStep = createDocumentUrlStep();
        updateWorkflowPhase(currentPhaseKey, (phase) => {
            const [chain] = updateRepeaterInTree(phase.chain, effectiveSelectedRepeaterId, (repeater) => ({
                ...repeater,
                steps: [...repeater.steps, documentUrlStep],
            }));
            return { ...phase, chain };
        });
    }, [currentPhaseKey, effectiveSelectedRepeaterId, updateWorkflowPhase]);

    const addDownloadFileStep = useCallback(() => {
        if (!effectiveSelectedRepeaterId) return;
        const downloadStep = createDownloadFileStep();
        updateWorkflowPhase(currentPhaseKey, (phase) => {
            const [chain] = updateRepeaterInTree(phase.chain, effectiveSelectedRepeaterId, (repeater) => ({
                ...repeater,
                steps: [...repeater.steps, downloadStep],
            }));
            return { ...phase, chain };
        });
    }, [currentPhaseKey, effectiveSelectedRepeaterId, updateWorkflowPhase]);

    const addDataExtractStep = useCallback(() => {
        if (!effectiveSelectedRepeaterId) return;
        const dataStep = createDataExtractStep();
        updateWorkflowPhase(currentPhaseKey, (phase) => {
            const [chain] = updateRepeaterInTree(phase.chain, effectiveSelectedRepeaterId, (repeater) => ({
                ...repeater,
                steps: [...repeater.steps, dataStep],
            }));
            return { ...phase, chain };
        });
    }, [currentPhaseKey, effectiveSelectedRepeaterId, updateWorkflowPhase]);

    const addPaginationStep = useCallback(() => {
        if (!effectiveSelectedScopeId) return;
        updateWorkflowPhase(currentPhaseKey, (phase) => {
            const [chain] = updateScopeInTree(phase.chain, effectiveSelectedScopeId, (scope) => ({
                ...scope,
                pagination: withPaginationDefaults(scope.pagination),
            }));
            return { ...phase, chain };
        });
    }, [currentPhaseKey, effectiveSelectedScopeId, updateWorkflowPhase]);

    return {
        /* core state */
        workflow,
        setWorkflow,
        activeTab,
        setActiveTab,

        /* temporary — will move to useUrlTypeManager in Task 2.3 */
        activeUrlTypeId,
        setActiveUrlTypeId,
        activeUrlType,

        /* derived */
        currentPhase,
        currentPhaseKey,
        scopeRefs,
        repeaterRefs,
        effectiveSelectedScopeId,
        effectiveSelectedRepeaterId,

        /* selection */
        selectedScopeId,
        setSelectedScopeId,
        selectedRepeaterId,
        setSelectedRepeaterId,

        /* before-add dropdowns */
        beforeToAdd,
        setBeforeToAdd,
        playwrightToAdd,
        setPlaywrightToAdd,

        /* phase updater */
        updateWorkflowPhase,

        /* step creation */
        addBasicBeforeAction,
        addPlaywrightAction,
        addScopeStep,
        addRepeaterStep,
        addSourceUrlStep,
        addDocumentUrlStep,
        addDownloadFileStep,
        addDataExtractStep,
        addPaginationStep,
    };
}
