'use client';

import { forwardRef, useEffect, useImperativeHandle, useMemo, useState } from 'react';
import {
    ArrowDown,
    ArrowUp,
    Bot,
    Clock3,
    FolderTree,
    Plus,
    Settings2,
    Trash2,
    Workflow,
} from 'lucide-react';

import { cn } from '@/lib/utils';
import type {
    BeforeAction,
    FieldConfig,
    PhaseConfig,
    PlaywrightAction,
    RepeaterNode,
    ScopeModule,
    ScrapingWorkflow,
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

type FocusTarget =
    | { phase: 'discovery'; section: 'before'; index: number }
    | { phase: 'discovery'; section: 'playwright'; index: number }
    | { phase: 'discovery'; section: 'scope'; scopeId: string }
    | { phase: 'discovery'; section: 'repeater'; repeaterId: string }
    | { phase: 'discovery'; section: 'field'; fieldId: string }
    | { phase: 'discovery'; section: 'pagination'; scopeId: string }
    | { phase: 'processing'; urlTypeId: string; section: 'before'; index: number }
    | { phase: 'processing'; urlTypeId: string; section: 'playwright'; index: number }
    | { phase: 'processing'; urlTypeId: string; section: 'scope'; scopeId: string }
    | { phase: 'processing'; urlTypeId: string; section: 'repeater'; repeaterId: string }
    | { phase: 'processing'; urlTypeId: string; section: 'field'; fieldId: string }
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
    applySelectedSelector: (selector: string) => boolean;
    appendRemoveElementBeforeAction: (selector: string) => void;
    clearAllPlaywrightActions: () => void;
    hasAnyPlaywrightActions: () => boolean;
}

const BEFORE_STEP_TYPES = [
    { value: 'remove_element', label: 'Remove Element' },
    { value: 'wait_timeout', label: 'Wait Timeout' },
] as const;

const PLAYWRIGHT_STEP_TYPES = [
    { value: 'wait_selector', label: 'Wait for Selector' },
    { value: 'wait_network', label: 'Wait for Network' },
    { value: 'click', label: 'Click' },
    { value: 'scroll', label: 'Scroll' },
    { value: 'fill', label: 'Fill Input' },
    { value: 'select_option', label: 'Select Dropdown' },
    { value: 'evaluate', label: 'Run JavaScript' },
    { value: 'screenshot', label: 'Screenshot' },
] as const;

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

function createDefaultBeforeAction(type: BeforeAction['type']): BeforeAction {
    if (type === 'remove_element') {
        return { type: 'remove_element', css_selector: '' };
    }
    return { type: 'wait_timeout', ms: 1000 };
}

function createDefaultPlaywrightAction(type: PlaywrightAction['type']): PlaywrightAction {
    switch (type) {
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
            return { type: 'wait_network', state: 'networkidle' };
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
        fields: [],
    };
}

function createFieldConfig(defaultName = ''): FieldConfig {
    return {
        id: createId('field'),
        name: defaultName,
        css_selector: '',
        extract_type: 'text',
    };
}

function createEmptyPhase(): PhaseConfig {
    return {
        before_actions: [],
        playwright_actions: [],
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

function updateFieldInTree(
    scopes: ScopeModule[],
    fieldId: string,
    updater: (field: FieldConfig) => FieldConfig,
): [ScopeModule[], boolean] {
    let changed = false;
    const next = scopes.map((scope) => {
        if (scope.repeater) {
            const fieldIndex = scope.repeater.fields.findIndex((field) => field.id === fieldId);
            if (fieldIndex >= 0) {
                const fields = scope.repeater.fields.map((field) => (
                    field.id === fieldId ? updater(field) : field
                ));
                changed = true;
                return { ...scope, repeater: { ...scope.repeater, fields } };
            }
        }
        const [children, childChanged] = updateFieldInTree(scope.children, fieldId, updater);
        if (!childChanged) return scope;
        changed = true;
        return { ...scope, children };
    });
    return [next, changed];
}

function removeFieldFromTree(scopes: ScopeModule[], fieldId: string): [ScopeModule[], boolean] {
    let changed = false;
    const next = scopes.map((scope) => {
        if (scope.repeater?.fields.some((field) => field.id === fieldId)) {
            changed = true;
            return {
                ...scope,
                repeater: {
                    ...scope.repeater,
                    fields: scope.repeater.fields.filter((field) => field.id !== fieldId),
                },
            };
        }
        const [children, childChanged] = removeFieldFromTree(scope.children, fieldId);
        if (!childChanged) return scope;
        changed = true;
        return { ...scope, children };
    });
    return [next, changed];
}

function mapFieldsInTree(
    scopes: ScopeModule[],
    mapper: (field: FieldConfig) => FieldConfig,
): ScopeModule[] {
    return scopes.map((scope) => ({
        ...scope,
        repeater: scope.repeater
            ? {
                ...scope.repeater,
                fields: scope.repeater.fields.map(mapper),
            }
            : null,
        children: mapFieldsInTree(scope.children, mapper),
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
            result.push({
                scopeId: scope.id,
                scopeLabel,
            });
            walk(scope.children, parentPath.concat(String(index + 1)));
        });
    };
    walk(scopes, []);
    return result;
}

function hasSourceUrlField(scopes: ScopeModule[]): boolean {
    for (const scope of scopes) {
        if (scope.repeater?.fields.some((field) => field.is_source_url)) {
            return true;
        }
        if (hasSourceUrlField(scope.children)) {
            return true;
        }
    }
    return false;
}

function actionHasSelector(action: PlaywrightAction): action is
    | { type: 'wait_selector'; css_selector: string; timeout_ms: number }
    | { type: 'click'; css_selector: string; wait_after_ms?: number }
    | { type: 'fill'; css_selector: string; value: string; press_enter: boolean }
    | { type: 'select_option'; css_selector: string; value: string } {
    return (
        action.type === 'wait_selector'
        || action.type === 'click'
        || action.type === 'fill'
        || action.type === 'select_option'
    );
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
    const [beforeToAdd, setBeforeToAdd] = useState<BeforeAction['type']>('remove_element');
    const [playwrightToAdd, setPlaywrightToAdd] = useState<PlaywrightAction['type']>('wait_selector');

    const activeUrlType = useMemo(
        () => workflow.url_types.find((item) => item.id === activeUrlTypeId) ?? workflow.url_types[0],
        [workflow.url_types, activeUrlTypeId],
    );

    const currentPhase = useMemo<PhaseConfig>(
        () => (activeTab === 'discovery' ? workflow.discovery : activeUrlType.processing),
        [activeTab, workflow.discovery, activeUrlType],
    );

    const scopeRefs = useMemo(() => collectScopes(currentPhase.chain), [currentPhase.chain]);
    const repeaterRefs = useMemo(() => collectRepeaters(currentPhase.chain), [currentPhase.chain]);

    const currentPhaseKey = useMemo(() => (
        activeTab === 'discovery'
            ? { phase: 'discovery' as const }
            : { phase: 'processing' as const, urlTypeId: activeUrlType.id }
    ), [activeTab, activeUrlType.id]);

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
        const isSame =
            JSON.stringify(target) === JSON.stringify(focusedTarget);
        if (isSame) {
            onSelectorPreviewChange?.(value.trim() ? value : null);
        }
    };

    useImperativeHandle(ref, () => ({
        applySelectedSelector: (selector: string) => {
            const target = focusedTarget;
            const nextSelector = selector.trim();
            if (!target || !nextSelector) return false;

            updateWorkflowPhase(
                target.phase === 'discovery'
                    ? { phase: 'discovery' }
                    : { phase: 'processing', urlTypeId: target.urlTypeId },
                (phase) => {
                    if (target.section === 'before') {
                        const action = phase.before_actions[target.index];
                        if (!action || action.type !== 'remove_element') return phase;
                        return {
                            ...phase,
                            before_actions: phase.before_actions.map((item, index) => (
                                index === target.index && item.type === 'remove_element'
                                    ? { ...item, css_selector: nextSelector }
                                    : item
                            )),
                        };
                    }
                    if (target.section === 'playwright') {
                        const action = phase.playwright_actions[target.index];
                        if (!action || !actionHasSelector(action)) return phase;
                        return {
                            ...phase,
                            playwright_actions: phase.playwright_actions.map((item, index) => (
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
                    if (target.section === 'field') {
                        const [chain] = updateFieldInTree(phase.chain, target.fieldId, (field) => ({
                            ...field,
                            css_selector: nextSelector,
                        }));
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
            onSelectorPreviewChange?.(nextSelector);
            return true;
        },
        appendRemoveElementBeforeAction: (selector: string) => {
            updateWorkflowPhase(currentPhaseKey, (phase) => ({
                ...phase,
                before_actions: [
                    ...phase.before_actions,
                    { type: 'remove_element', css_selector: selector },
                ],
            }));
        },
        clearAllPlaywrightActions: () => {
            setWorkflow((prev) => ({
                ...prev,
                discovery: { ...prev.discovery, playwright_actions: [] },
                url_types: prev.url_types.map((item) => ({
                    ...item,
                    processing: { ...item.processing, playwright_actions: [] },
                })),
            }));
        },
        hasAnyPlaywrightActions: () => {
            if (workflow.discovery.playwright_actions.length > 0) {
                return true;
            }
            return workflow.url_types.some((item) => item.processing.playwright_actions.length > 0);
        },
    }), [focusedTarget, currentPhaseKey, onSelectorPreviewChange, workflow]);

    const addBeforeAction = () => {
        updateWorkflowPhase(currentPhaseKey, (phase) => ({
            ...phase,
            before_actions: [...phase.before_actions, createDefaultBeforeAction(beforeToAdd)],
        }));
    };

    const addPlaywrightAction = () => {
        updateWorkflowPhase(currentPhaseKey, (phase) => ({
            ...phase,
            playwright_actions: [...phase.playwright_actions, createDefaultPlaywrightAction(playwrightToAdd)],
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

    const addFieldStep = () => {
        if (!effectiveSelectedRepeaterId) return;
        const isDiscovery = currentPhaseKey.phase === 'discovery';
        const sourceUrlDefault = isDiscovery && !hasSourceUrlField(currentPhase.chain);
        const field = createFieldConfig(sourceUrlDefault ? 'source_url' : '');
        if (sourceUrlDefault) {
            field.extract_type = 'href';
            field.is_source_url = true;
            field.url_type_id = workflow.url_types[0]?.id;
        }

        updateWorkflowPhase(currentPhaseKey, (phase) => {
            const [chain] = updateRepeaterInTree(phase.chain, effectiveSelectedRepeaterId, (repeater) => ({
                ...repeater,
                fields: [...repeater.fields, field],
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
                chain: mapFieldsInTree(prev.discovery.chain, (field) => (
                    field.url_type_id === id ? { ...field, url_type_id: fallbackId } : field
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
                    <span>{action.type === 'remove_element' ? 'Remove Element' : 'Wait Timeout'}</span>
                    <div className="flex gap-1">
                        <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            className="h-6 w-6"
                            onClick={() => updateWorkflowPhase(currentPhaseKey, (phase) => ({
                                ...phase,
                                before_actions: moveItem(phase.before_actions, index, index - 1),
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
                                before_actions: moveItem(phase.before_actions, index, index + 1),
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
                                before_actions: phase.before_actions.filter((_, i) => i !== index),
                            }))}
                        >
                            <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                    </div>
                </div>
                {action.type === 'remove_element' ? (
                    <Input
                        value={action.css_selector}
                        placeholder="CSS selector"
                        className="h-8 border-white/10 bg-black/30 text-xs text-white"
                        onFocus={() => setSelectorFocus(target, action.css_selector)}
                        onChange={(event) => {
                            const value = event.target.value;
                            updateWorkflowPhase(currentPhaseKey, (phase) => ({
                                ...phase,
                                before_actions: phase.before_actions.map((item, i) => (
                                    i === index && item.type === 'remove_element' ? { ...item, css_selector: value } : item
                                )),
                            }));
                            syncPreviewOnChange(target, value);
                        }}
                    />
                ) : (
                    <Input
                        type="number"
                        value={action.ms}
                        placeholder="Timeout ms"
                        className="h-8 border-white/10 bg-black/30 text-xs text-white"
                        onChange={(event) => {
                            const value = Number(event.target.value) || 0;
                            updateWorkflowPhase(currentPhaseKey, (phase) => ({
                                ...phase,
                                before_actions: phase.before_actions.map((item, i) => (
                                    i === index && item.type === 'wait_timeout' ? { ...item, ms: value } : item
                                )),
                            }));
                        }}
                    />
                )}
            </div>
        );
    };

    const renderPlaywrightAction = (action: PlaywrightAction, index: number) => {
        const target: FocusTarget = currentPhaseKey.phase === 'discovery'
            ? { phase: 'discovery', section: 'playwright', index }
            : { phase: 'processing', urlTypeId: currentPhaseKey.urlTypeId, section: 'playwright', index };

        return (
            <div key={`playwright-${index}`} className="rounded-lg border border-white/10 bg-black/30 p-2">
                <div className="mb-2 flex items-center justify-between text-xs text-white/70">
                    <span>{PLAYWRIGHT_STEP_TYPES.find((item) => item.value === action.type)?.label ?? action.type}</span>
                    <div className="flex gap-1">
                        <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            className="h-6 w-6"
                            onClick={() => updateWorkflowPhase(currentPhaseKey, (phase) => ({
                                ...phase,
                                playwright_actions: moveItem(phase.playwright_actions, index, index - 1),
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
                                playwright_actions: moveItem(phase.playwright_actions, index, index + 1),
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
                                playwright_actions: phase.playwright_actions.filter((_, i) => i !== index),
                            }))}
                        >
                            <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                    </div>
                </div>

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
                                    playwright_actions: phase.playwright_actions.map((item, i) => (
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
                                    playwright_actions: phase.playwright_actions.map((item, i) => (
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
                                playwright_actions: phase.playwright_actions.map((item, i) => (
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
                                    playwright_actions: phase.playwright_actions.map((item, i) => (
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
                                    playwright_actions: phase.playwright_actions.map((item, i) => (
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
                                    playwright_actions: phase.playwright_actions.map((item, i) => (
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
                                    playwright_actions: phase.playwright_actions.map((item, i) => (
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
                                    playwright_actions: phase.playwright_actions.map((item, i) => (
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
                                    playwright_actions: phase.playwright_actions.map((item, i) => (
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
                                        playwright_actions: phase.playwright_actions.map((item, i) => (
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
                                    playwright_actions: phase.playwright_actions.map((item, i) => (
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
                                    playwright_actions: phase.playwright_actions.map((item, i) => (
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
                                playwright_actions: phase.playwright_actions.map((item, i) => (
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
                                playwright_actions: phase.playwright_actions.map((item, i) => (
                                    i === index && item.type === 'screenshot' ? { ...item, filename: value } : item
                                )),
                            }));
                        }}
                    />
                )}
            </div>
        );
    };

    const renderField = (field: FieldConfig, repeater: RepeaterNode, fieldIndex: number, isDiscovery: boolean) => {
        const target: FocusTarget = currentPhaseKey.phase === 'discovery'
            ? { phase: 'discovery', section: 'field', fieldId: field.id ?? '' }
            : { phase: 'processing', urlTypeId: currentPhaseKey.urlTypeId, section: 'field', fieldId: field.id ?? '' };
        const fieldId = field.id ?? '';

        return (
            <div key={fieldId} className="rounded-lg border border-white/10 bg-black/20 p-2">
                <div className="mb-2 flex items-center gap-2">
                    <Input
                        value={field.name}
                        placeholder="Field name"
                        className="h-8 border-white/10 bg-black/30 text-xs text-white"
                        onChange={(event) => {
                            const value = event.target.value;
                            updateWorkflowPhase(currentPhaseKey, (phase) => {
                                const [chain] = updateFieldInTree(phase.chain, fieldId, (current) => ({ ...current, name: value }));
                                return { ...phase, chain };
                            });
                        }}
                    />
                    <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="h-6 w-6"
                        onClick={() => updateWorkflowPhase(currentPhaseKey, (phase) => {
                            const [chain] = updateRepeaterInTree(phase.chain, repeater.id, (current) => ({
                                ...current,
                                fields: moveItem(current.fields, fieldIndex, fieldIndex - 1),
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
                                fields: moveItem(current.fields, fieldIndex, fieldIndex + 1),
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
                            const [chain] = removeFieldFromTree(phase.chain, fieldId);
                            return { ...phase, chain };
                        })}
                    >
                        <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                    <Input
                        value={field.css_selector}
                        placeholder="CSS selector"
                        className="h-8 border-white/10 bg-black/30 text-xs text-white"
                        onFocus={() => setSelectorFocus(target, field.css_selector)}
                        onChange={(event) => {
                            const value = event.target.value;
                            updateWorkflowPhase(currentPhaseKey, (phase) => {
                                const [chain] = updateFieldInTree(phase.chain, fieldId, (current) => ({ ...current, css_selector: value }));
                                return { ...phase, chain };
                            });
                            syncPreviewOnChange(target, value);
                        }}
                    />
                    <Select
                        value={field.extract_type}
                        onValueChange={(value) => {
                            updateWorkflowPhase(currentPhaseKey, (phase) => {
                                const [chain] = updateFieldInTree(phase.chain, fieldId, (current) => ({
                                    ...current,
                                    extract_type: value as FieldConfig['extract_type'],
                                    attribute_name: value === 'attribute' ? current.attribute_name ?? '' : undefined,
                                }));
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
                            <SelectItem value="src">Src</SelectItem>
                            <SelectItem value="attribute">Attribute</SelectItem>
                            <SelectItem value="html">HTML</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
                {field.extract_type === 'attribute' && (
                    <Input
                        value={field.attribute_name ?? ''}
                        placeholder="Attribute name"
                        className="mt-2 h-8 border-white/10 bg-black/30 text-xs text-white"
                        onChange={(event) => {
                            const value = event.target.value;
                            updateWorkflowPhase(currentPhaseKey, (phase) => {
                                const [chain] = updateFieldInTree(phase.chain, fieldId, (current) => ({ ...current, attribute_name: value }));
                                return { ...phase, chain };
                            });
                        }}
                    />
                )}
                {isDiscovery && (
                    <div className="mt-2 grid grid-cols-2 gap-2">
                        <label className="flex items-center gap-2 text-xs text-white/70">
                            <input
                                type="checkbox"
                                checked={field.is_source_url ?? false}
                                onChange={(event) => {
                                    const checked = event.target.checked;
                                    updateWorkflowPhase(currentPhaseKey, (phase) => {
                                        const [chain] = updateFieldInTree(phase.chain, fieldId, (current) => ({
                                            ...current,
                                            is_source_url: checked,
                                            url_type_id: checked ? current.url_type_id ?? workflow.url_types[0]?.id : undefined,
                                        }));
                                        return { ...phase, chain };
                                    });
                                }}
                            />
                            source_url
                        </label>
                        <Select
                            value={field.url_type_id ?? workflow.url_types[0]?.id}
                            disabled={!field.is_source_url}
                            onValueChange={(value) => {
                                updateWorkflowPhase(currentPhaseKey, (phase) => {
                                    const [chain] = updateFieldInTree(phase.chain, fieldId, (current) => ({ ...current, url_type_id: value }));
                                    return { ...phase, chain };
                                });
                            }}
                        >
                            <SelectTrigger className="h-8 border-white/10 bg-black/30 text-xs text-white">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {workflow.url_types.map((urlType) => (
                                    <SelectItem key={urlType.id} value={urlType.id}>{urlType.name}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                )}
            </div>
        );
    };

    const renderScopeNode = (scope: ScopeModule, depth: number) => {
        const scopeTarget: FocusTarget = currentPhaseKey.phase === 'discovery'
            ? { phase: 'discovery', section: 'scope', scopeId: scope.id }
            : { phase: 'processing', urlTypeId: currentPhaseKey.urlTypeId, section: 'scope', scopeId: scope.id };

        return (
            <div key={scope.id} className={cn('space-y-2 rounded-lg border border-cyan-500/40 bg-cyan-500/5 p-3', depth > 0 && 'ml-4')}>
                <div className="flex items-center justify-between">
                    <div className="text-xs font-semibold uppercase tracking-wider text-cyan-200">
                        Scope
                    </div>
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
                    return (
                    <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-2">
                        <div className="mb-2 flex items-center justify-between">
                            <div className="text-xs font-semibold uppercase tracking-wider text-amber-200">
                                Repeater
                            </div>
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
                                onFocus={() => {
                                    const target: FocusTarget = currentPhaseKey.phase === 'discovery'
                                        ? { phase: 'discovery', section: 'repeater', repeaterId: repeater.id }
                                        : { phase: 'processing', urlTypeId: currentPhaseKey.urlTypeId, section: 'repeater', repeaterId: repeater.id };
                                    setSelectorFocus(target, repeater.css_selector);
                                }}
                                onChange={(event) => {
                                    const value = event.target.value;
                                    const target: FocusTarget = currentPhaseKey.phase === 'discovery'
                                        ? { phase: 'discovery', section: 'repeater', repeaterId: repeater.id }
                                        : { phase: 'processing', urlTypeId: currentPhaseKey.urlTypeId, section: 'repeater', repeaterId: repeater.id };
                                    updateWorkflowPhase(currentPhaseKey, (phase) => {
                                        const [chain] = updateRepeaterInTree(phase.chain, repeater.id, (current) => ({
                                            ...current,
                                            css_selector: value,
                                        }));
                                        return { ...phase, chain };
                                    });
                                    syncPreviewOnChange(target, value);
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
                            {repeater.fields.map((field, index) => renderField(field, repeater as RepeaterNode, index, currentPhaseKey.phase === 'discovery'))}
                        </div>
                    </div>
                )})()}

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
                                onFocus={() => {
                                    const target: FocusTarget = currentPhaseKey.phase === 'discovery'
                                        ? { phase: 'discovery', section: 'pagination', scopeId: scope.id }
                                        : { phase: 'processing', urlTypeId: currentPhaseKey.urlTypeId, section: 'pagination', scopeId: scope.id };
                                    setSelectorFocus(target, scope.pagination?.css_selector ?? '');
                                }}
                                onChange={(event) => {
                                    const value = event.target.value;
                                    const target: FocusTarget = currentPhaseKey.phase === 'discovery'
                                        ? { phase: 'discovery', section: 'pagination', scopeId: scope.id }
                                        : { phase: 'processing', urlTypeId: currentPhaseKey.urlTypeId, section: 'pagination', scopeId: scope.id };
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
                                    syncPreviewOnChange(target, value);
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
                                                <Select value={beforeToAdd} onValueChange={(value) => setBeforeToAdd(value as BeforeAction['type'])}>
                                                    <SelectTrigger className="h-8 border-white/10 bg-black/30 text-xs text-white">
                                                        <SelectValue />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        {BEFORE_STEP_TYPES.map((item) => (
                                                            <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                                <Button type="button" size="sm" onClick={addBeforeAction} className="h-8">
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
                                                    <Select value={playwrightToAdd} onValueChange={(value) => setPlaywrightToAdd(value as PlaywrightAction['type'])}>
                                                        <SelectTrigger className="h-8 border-purple-500/20 bg-black/30 text-xs text-white">
                                                            <SelectValue />
                                                        </SelectTrigger>
                                                        <SelectContent>
                                                            {PLAYWRIGHT_STEP_TYPES.map((item) => (
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
                                                <Button type="button" size="sm" variant="outline" className="h-8 border-cyan-500/40 bg-transparent text-cyan-100" onClick={addScopeStep}>
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
                                                        <SelectValue placeholder="Field target repeater" />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        {repeaterRefs.map((item) => (
                                                            <SelectItem key={item.repeaterId} value={item.repeaterId}>
                                                                {item.scopeLabel} {'->'} {item.repeaterLabel}
                                                            </SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                                <Button
                                                    type="button"
                                                    size="sm"
                                                    variant="outline"
                                                    className="h-8 border-green-500/40 bg-transparent text-green-100"
                                                    disabled={!effectiveSelectedRepeaterId}
                                                    onClick={addFieldStep}
                                                >
                                                    + Field
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
                                                Scope target: {scopeRefs.find((scope) => scope.scopeId === effectiveSelectedScopeId)?.scopeLabel ?? 'none'} | Repeater target: {repeaterRefs.find((item) => item.repeaterId === effectiveSelectedRepeaterId)?.repeaterLabel ?? 'none'}
                                            </div>
                                        </div>
                                    </div>
                                </section>

                                <section className="space-y-2 rounded-lg border border-white/10 bg-white/5 p-3">
                                    <div className="text-xs font-semibold uppercase tracking-wider text-white/60">Before Steps</div>
                                    {currentPhase.before_actions.map((action, index) => renderBeforeAction(action, index))}
                                </section>

                                {playwrightEnabled && (
                                    <section className="space-y-2 rounded-lg border border-purple-500/30 bg-purple-500/5 p-3">
                                        <div className="text-xs font-semibold uppercase tracking-wider text-purple-200">Playwright Steps</div>
                                        {currentPhase.playwright_actions.map((action, index) => renderPlaywrightAction(action, index))}
                                    </section>
                                )}

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
                                    <button
                                        key={urlType.id}
                                        type="button"
                                        onClick={() => setActiveUrlTypeId(urlType.id)}
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
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="min-h-0 flex-1 overflow-auto p-4">
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
                                                <Select value={beforeToAdd} onValueChange={(value) => setBeforeToAdd(value as BeforeAction['type'])}>
                                                    <SelectTrigger className="h-8 border-white/10 bg-black/30 text-xs text-white">
                                                        <SelectValue />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        {BEFORE_STEP_TYPES.map((item) => (
                                                            <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                                <Button type="button" size="sm" onClick={addBeforeAction} className="h-8">
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
                                                    <Select value={playwrightToAdd} onValueChange={(value) => setPlaywrightToAdd(value as PlaywrightAction['type'])}>
                                                        <SelectTrigger className="h-8 border-purple-500/20 bg-black/30 text-xs text-white">
                                                            <SelectValue />
                                                        </SelectTrigger>
                                                        <SelectContent>
                                                            {PLAYWRIGHT_STEP_TYPES.map((item) => (
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
                                                <Button type="button" size="sm" variant="outline" className="h-8 border-cyan-500/40 bg-transparent text-cyan-100" onClick={addScopeStep}>
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
                                                        <SelectValue placeholder="Field target repeater" />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        {repeaterRefs.map((item) => (
                                                            <SelectItem key={item.repeaterId} value={item.repeaterId}>
                                                                {item.scopeLabel} {'->'} {item.repeaterLabel}
                                                            </SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                                <Button
                                                    type="button"
                                                    size="sm"
                                                    variant="outline"
                                                    className="h-8 border-green-500/40 bg-transparent text-green-100"
                                                    disabled={!effectiveSelectedRepeaterId}
                                                    onClick={addFieldStep}
                                                >
                                                    + Field
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
                                                Scope target: {scopeRefs.find((scope) => scope.scopeId === effectiveSelectedScopeId)?.scopeLabel ?? 'none'} | Repeater target: {repeaterRefs.find((item) => item.repeaterId === effectiveSelectedRepeaterId)?.repeaterLabel ?? 'none'}
                                            </div>
                                        </div>
                                    </div>
                                </section>

                                <section className="space-y-2 rounded-lg border border-white/10 bg-white/5 p-3">
                                    <div className="text-xs font-semibold uppercase tracking-wider text-white/60">Before Steps</div>
                                    {currentPhase.before_actions.map((action, index) => renderBeforeAction(action, index))}
                                </section>

                                {playwrightEnabled && (
                                    <section className="space-y-2 rounded-lg border border-purple-500/30 bg-purple-500/5 p-3">
                                        <div className="text-xs font-semibold uppercase tracking-wider text-purple-200">Playwright Steps</div>
                                        {currentPhase.playwright_actions.map((action, index) => renderPlaywrightAction(action, index))}
                                    </section>
                                )}

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
                        </div>
                    </TabsContent>
                </Tabs>
            </div>
        </aside>
    );
});

SimulatorSidebar.displayName = 'SimulatorSidebar';
