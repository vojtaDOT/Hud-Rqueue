'use client';

import { forwardRef, useImperativeHandle, useState } from 'react';
import {
    Workflow,
} from 'lucide-react';

import type {
    ElementSelector,
    ScrapingWorkflow,
} from '@/lib/crawler-types';
import {
    actionHasSelector,
    createPaginationConfig,
    createScopeModule,
    createSourceUrlStep,
    createDocumentUrlStep,
    createDownloadFileStep,
    describeTarget,
    ensureScopeAndRepeater,
    findScopeInTree,
    isPlaywrightBeforeAction,
    normalizeSelectorWithinScope,
    updateRepeaterInTree,
    updateScopeInTree,
    updateStepInTree,
    withPaginationDefaults,
} from '@/lib/workflow-tree';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { BeforeActionRenderer } from '@/components/simulator/sidebar/before-action-renderer';
import { ScopeNodeRenderer } from '@/components/simulator/sidebar/scope-node-renderer';
import { StepChooser } from '@/components/simulator/sidebar/step-chooser';
import { PhaseEditor } from '@/components/simulator/sidebar/phase-editor';
import {
    useWorkflowState,
    createDefaultWorkflow,
    BASIC_BEFORE_STEP_TYPES,
    PLAYWRIGHT_BEFORE_STEP_TYPES,
    type PhaseTab,
    type BasicBeforeStepType,
    type PlaywrightBeforeStepType,
} from '@/components/simulator/sidebar/hooks/use-workflow-state';
import { useFocusSystem } from '@/components/simulator/sidebar/hooks/use-focus-system';
import { useUrlTypeManager } from '@/components/simulator/sidebar/hooks/use-url-type-manager';
import { UrlTypePanel } from '@/components/simulator/sidebar/url-type-panel';

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

export const SimulatorSidebar = forwardRef<SimulatorSidebarRef, SimulatorSidebarProps>(({
    onWorkflowChange,
    playwrightEnabled,
    onSelectorPreviewChange,
}, ref) => {
    const [workflow, setWorkflow] = useState(() => createDefaultWorkflow(playwrightEnabled));
    const [activeTab, setActiveTab] = useState<PhaseTab>('discovery');

    const {
        activeUrlTypeId, setActiveUrlTypeId, activeUrlType,
        handleUrlTypeAdd, handleUrlTypeRename, handleUrlTypeDelete,
    } = useUrlTypeManager(workflow, setWorkflow, setActiveTab);

    const {
        currentPhase, currentPhaseKey,
        scopeRefs, repeaterRefs,
        effectiveSelectedScopeId, effectiveSelectedRepeaterId,
        selectedScopeId, setSelectedScopeId,
        selectedRepeaterId, setSelectedRepeaterId,
        beforeToAdd, setBeforeToAdd,
        playwrightToAdd, setPlaywrightToAdd,
        updateWorkflowPhase,
        addBasicBeforeAction, addPlaywrightAction,
        addScopeStep, addRepeaterStep,
        addSourceUrlStep, addDocumentUrlStep,
        addDownloadFileStep, addDataExtractStep,
        addPaginationStep,
    } = useWorkflowState({
        workflow,
        setWorkflow,
        activeTab,
        playwrightEnabled,
        activeUrlType,
        onChange: onWorkflowChange,
    });

    const {
        focusedTarget, setFocusedTarget,
        armedTarget, setArmedTarget,
        setSelectorFocus,
        cancelArmedTarget,
        syncPreviewOnChange,
        getFallbackTarget,
        resolveSelectorForTarget,
        renderPickButton,
    } = useFocusSystem({
        onSelectorPreviewChange,
        currentPhaseKey,
        currentPhase,
        effectiveSelectedRepeaterId,
        effectiveSelectedScopeId,
    });

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
                                ...withPaginationDefaults(scope.pagination),
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
                            chain: [...phase.chain, { ...scope, pagination: { ...createPaginationConfig(), css_selector: nextSelectorRaw } }],
                        };
                    }
                    const [chain] = updateScopeInTree(phase.chain, nextScopeId, (scope) => ({
                        ...scope,
                        pagination: {
                            ...withPaginationDefaults(scope.pagination),
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
            beforeActions={currentPhase.before.map((action, index) => (
                <BeforeActionRenderer
                    key={`before-${index}`}
                    action={action}
                    index={index}
                    phaseKey={currentPhaseKey}
                    updatePhase={updateWorkflowPhase}
                    setSelectorFocus={setSelectorFocus}
                    syncPreviewOnChange={syncPreviewOnChange}
                    renderPickButton={renderPickButton}
                />
            ))}
            hasCoreChain={currentPhase.chain.length > 0}
            coreChain={currentPhase.chain.map((scope) => (
                <ScopeNodeRenderer
                    key={scope.id}
                    scope={scope}
                    depth={0}
                    isDiscovery={currentPhaseKey.phase === 'discovery'}
                    urlTypes={workflow.url_types}
                    phaseKey={currentPhaseKey}
                    effectiveSelectedScopeId={effectiveSelectedScopeId}
                    effectiveSelectedRepeaterId={effectiveSelectedRepeaterId}
                    setSelectedScopeId={setSelectedScopeId}
                    setSelectedRepeaterId={setSelectedRepeaterId}
                    updatePhase={updateWorkflowPhase}
                    setSelectorFocus={setSelectorFocus}
                    syncPreviewOnChange={syncPreviewOnChange}
                    renderPickButton={renderPickButton}
                />
            ))}
        />
    );

    return (
        <aside className="flex h-full w-full flex-col overflow-hidden border-l border-border bg-card/50 backdrop-blur-sm">
            <div className="border-b border-border p-4">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                        <Workflow className="h-4 w-4" />
                        <span>Scraping Workflow</span>
                    </div>
                    <div className="rounded bg-muted/50 px-2 py-1 text-xs text-muted-foreground">
                        {playwrightEnabled ? 'Playwright' : 'Scrapy'}
                    </div>
                </div>
            </div>

            <div className="flex min-h-0 flex-1 flex-col">
                <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as PhaseTab)} className="flex min-h-0 flex-1 flex-col">
                    <div className="border-b border-border px-4 pt-4">
                        <TabsList className="h-auto border-0 bg-transparent p-0">
                            <TabsTrigger value="discovery" className="text-muted-foreground data-[state=active]:bg-muted/50 data-[state=active]:text-foreground">
                                Phase 1: Discovery
                            </TabsTrigger>
                            <TabsTrigger value="processing" className="text-muted-foreground data-[state=active]:bg-muted/50 data-[state=active]:text-foreground">
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
                        <UrlTypePanel
                            urlTypes={workflow.url_types}
                            activeUrlTypeId={activeUrlType.id}
                            onSelect={setActiveUrlTypeId}
                            onAdd={handleUrlTypeAdd}
                            onRename={handleUrlTypeRename}
                            onDelete={handleUrlTypeDelete}
                        />

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
