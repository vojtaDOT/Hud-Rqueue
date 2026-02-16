'use client';

import { forwardRef, useEffect, useId, useImperativeHandle, useMemo, useState, type ReactNode } from 'react';
import {
    DndContext,
    DragEndEvent,
    KeyboardSensor,
    PointerSensor,
    closestCenter,
    useSensor,
    useSensors,
} from '@dnd-kit/core';
import {
    SortableContext,
    arrayMove,
    sortableKeyboardCoordinates,
    useSortable,
    verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
    ArrowDown,
    Eraser,
    GripVertical,
    MousePointerClick,
    Plus,
    RefreshCw,
    Settings,
    Trash2,
    Type,
    Workflow,
} from 'lucide-react';

import { cn } from '@/lib/utils';
import type { FieldConfig, PhaseConfig, PlaywrightAction, ScrapingWorkflow, SourceUrlType } from '@/lib/crawler-types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
    | { phase: 'discovery'; section: 'scope' | 'repeater' | 'pagination' }
    | { phase: 'discovery'; section: 'field'; index: number }
    | { phase: 'discovery'; section: 'pre_action'; index: number }
    | { phase: 'processing'; urlTypeId: string; section: 'scope' | 'repeater' | 'pagination' }
    | { phase: 'processing'; urlTypeId: string; section: 'field'; index: number }
    | { phase: 'processing'; urlTypeId: string; section: 'pre_action'; index: number };

interface SimulatorSidebarProps {
    onWorkflowChange?: (workflowData: ScrapingWorkflow) => void;
    playwrightEnabled: boolean;
    onSelectorPreviewChange?: (selector: string | null) => void;
}

export interface SimulatorSidebarRef {
    applySelectedSelector: (selector: string) => boolean;
    appendRemoveElementPreAction: (selector: string) => void;
    clearAllPreActions: () => void;
    hasAnyPreActions: () => boolean;
}

const EXTRACT_TYPES = [
    { value: 'text', label: 'Text' },
    { value: 'href', label: 'Href' },
    { value: 'src', label: 'Src' },
    { value: 'attribute', label: 'Attribute' },
    { value: 'html', label: 'HTML' },
] as const;

const PLAYWRIGHT_ACTION_TYPES = [
    { value: 'wait_selector', label: 'Wait for Selector' },
    { value: 'wait_network', label: 'Wait for Network' },
    { value: 'wait_timeout', label: 'Wait Timeout' },
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

function createEmptyPhase(): PhaseConfig {
    return {
        pre_actions: [],
        scope: null,
        repeater: null,
        fields: [],
        pagination: null,
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

function createDefaultPlaywrightAction(type: PlaywrightAction['type']): PlaywrightAction {
    switch (type) {
        case 'wait_selector':
            return { type: 'wait_selector', css_selector: '', timeout_ms: 10000 };
        case 'wait_network':
            return { type: 'wait_network', state: 'networkidle' };
        case 'wait_timeout':
            return { type: 'wait_timeout', ms: 1000 };
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

function focusTargetsEqual(a: FocusTarget | null, b: FocusTarget): boolean {
    if (!a) return false;
    if (a.phase !== b.phase || a.section !== b.section) return false;
    if ('index' in b) return 'index' in a && a.index === b.index;
    if (b.phase === 'processing') return 'urlTypeId' in a && a.urlTypeId === b.urlTypeId;
    return true;
}

interface SortableRowProps {
    id: string;
    children: ReactNode;
}

function SortableRow({ id, children }: SortableRowProps) {
    const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id });
    return (
        <div
            ref={setNodeRef}
            style={{ transform: CSS.Transform.toString(transform), transition }}
            className="rounded-lg border border-white/10 bg-zinc-900/50 p-3"
        >
            <div className="flex items-start gap-3">
                <button
                    className="mt-1 cursor-grab text-white/40 active:cursor-grabbing"
                    {...attributes}
                    {...listeners}
                    type="button"
                >
                    <GripVertical className="h-4 w-4" />
                </button>
                <div className="min-w-0 flex-1">{children}</div>
            </div>
        </div>
    );
}

export const SimulatorSidebar = forwardRef<SimulatorSidebarRef, SimulatorSidebarProps>(({
    onWorkflowChange,
    playwrightEnabled,
    onSelectorPreviewChange,
}, ref) => {
    const dndId = useId();
    const [activeTab, setActiveTab] = useState<PhaseTab>('discovery');
    const [focusedTarget, setFocusedTarget] = useState<FocusTarget | null>(null);
    const [workflow, setWorkflow] = useState<ScrapingWorkflow>(() => createDefaultWorkflow(playwrightEnabled));
    const [activeUrlTypeId, setActiveUrlTypeId] = useState<string>(() => workflow.url_types[0].id);

    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
    );

    const activeUrlType = useMemo(
        () => (workflow.url_types.find((item) => item.id === activeUrlTypeId) ?? workflow.url_types[0]) as SourceUrlType,
        [workflow.url_types, activeUrlTypeId],
    );

    useEffect(() => {
        onWorkflowChange?.({
            ...workflow,
            playwright_enabled: playwrightEnabled,
        });
    }, [workflow, onWorkflowChange, playwrightEnabled]);

    useImperativeHandle(ref, () => ({
        applySelectedSelector: (selector: string) => {
            const target = focusedTarget;
            if (!target) return false;

            const nextSelector = selector.trim();
            if (!nextSelector) return false;

            if (target.phase === 'discovery') {
                if (target.section === 'scope') {
                    setWorkflow((prev) => ({
                        ...prev,
                        discovery: {
                            ...prev.discovery,
                            scope: {
                                ...(prev.discovery.scope ?? { css_selector: '', label: '' }),
                                css_selector: nextSelector,
                            },
                        },
                    }));
                    onSelectorPreviewChange?.(nextSelector);
                    return true;
                }
                if (target.section === 'repeater') {
                    setWorkflow((prev) => ({
                        ...prev,
                        discovery: {
                            ...prev.discovery,
                            repeater: {
                                ...(prev.discovery.repeater ?? { css_selector: '', label: '' }),
                                css_selector: nextSelector,
                            },
                        },
                    }));
                    onSelectorPreviewChange?.(nextSelector);
                    return true;
                }
                if (target.section === 'pagination') {
                    setWorkflow((prev) => ({
                        ...prev,
                        discovery: {
                            ...prev.discovery,
                            pagination: {
                                ...(prev.discovery.pagination ?? { css_selector: '', max_pages: 0 }),
                                css_selector: nextSelector,
                            },
                        },
                    }));
                    onSelectorPreviewChange?.(nextSelector);
                    return true;
                }
                if (target.section === 'field') {
                    setWorkflow((prev) => ({
                        ...prev,
                        discovery: {
                            ...prev.discovery,
                            fields: prev.discovery.fields.map((field, index) => (
                                index === target.index ? { ...field, css_selector: nextSelector } : field
                            )),
                        },
                    }));
                    onSelectorPreviewChange?.(nextSelector);
                    return true;
                }
                if (target.section === 'pre_action') {
                    const action = workflow.discovery.pre_actions[target.index];
                    if (!action || !actionHasSelector(action)) return false;
                    setWorkflow((prev) => ({
                        ...prev,
                        discovery: {
                            ...prev.discovery,
                            pre_actions: prev.discovery.pre_actions.map((item, index) => {
                                if (index !== target.index || !actionHasSelector(item)) return item;
                                return { ...item, css_selector: nextSelector };
                            }),
                        },
                    }));
                    onSelectorPreviewChange?.(nextSelector);
                    return true;
                }
                return false;
            }

            const urlTypeId = target.urlTypeId;
            const selectedType = workflow.url_types.find((item) => item.id === urlTypeId);
            if (!selectedType) return false;

            setWorkflow((prev) => ({
                ...prev,
                url_types: prev.url_types.map((urlType) => {
                    if (urlType.id !== urlTypeId) return urlType;
                    if (target.section === 'scope') {
                        return {
                            ...urlType,
                            processing: {
                                ...urlType.processing,
                                scope: {
                                    ...(urlType.processing.scope ?? { css_selector: '', label: '' }),
                                    css_selector: nextSelector,
                                },
                            },
                        };
                    }
                    if (target.section === 'repeater') {
                        return {
                            ...urlType,
                            processing: {
                                ...urlType.processing,
                                repeater: {
                                    ...(urlType.processing.repeater ?? { css_selector: '', label: '' }),
                                    css_selector: nextSelector,
                                },
                            },
                        };
                    }
                    if (target.section === 'pagination') {
                        return {
                            ...urlType,
                            processing: {
                                ...urlType.processing,
                                pagination: {
                                    ...(urlType.processing.pagination ?? { css_selector: '', max_pages: 0 }),
                                    css_selector: nextSelector,
                                },
                            },
                        };
                    }
                    if (target.section === 'field') {
                        return {
                            ...urlType,
                            processing: {
                                ...urlType.processing,
                                fields: urlType.processing.fields.map((field, index) => (
                                    index === target.index ? { ...field, css_selector: nextSelector } : field
                                )),
                            },
                        };
                    }
                    if (target.section === 'pre_action') {
                        return {
                            ...urlType,
                            processing: {
                                ...urlType.processing,
                                pre_actions: urlType.processing.pre_actions.map((item, index) => {
                                    if (index !== target.index || !actionHasSelector(item)) return item;
                                    return { ...item, css_selector: nextSelector };
                                }),
                            },
                        };
                    }
                    return urlType;
                }),
            }));
            onSelectorPreviewChange?.(nextSelector);
            return true;
        },
        appendRemoveElementPreAction: (selector: string) => {
            const script = `document.querySelectorAll(${JSON.stringify(selector)}).forEach((el) => { (el as HTMLElement).style.display = 'none'; });`;
            const action: PlaywrightAction = { type: 'evaluate', script };
            if (activeTab === 'processing' && activeUrlType) {
                setWorkflow((prev) => ({
                    ...prev,
                    url_types: prev.url_types.map((urlType) => (
                        urlType.id === activeUrlType.id
                            ? {
                                ...urlType,
                                processing: {
                                    ...urlType.processing,
                                    pre_actions: [...urlType.processing.pre_actions, action],
                                },
                            }
                            : urlType
                    )),
                }));
                return;
            }
            setWorkflow((prev) => ({
                ...prev,
                discovery: {
                    ...prev.discovery,
                    pre_actions: [...prev.discovery.pre_actions, action],
                },
            }));
        },
        clearAllPreActions: () => {
            setWorkflow((prev) => ({
                ...prev,
                discovery: { ...prev.discovery, pre_actions: [] },
                url_types: prev.url_types.map((item) => ({
                    ...item,
                    processing: { ...item.processing, pre_actions: [] },
                })),
            }));
        },
        hasAnyPreActions: () => {
            if (workflow.discovery.pre_actions.length > 0) return true;
            return workflow.url_types.some((item) => item.processing.pre_actions.length > 0);
        },
    }), [activeTab, activeUrlType, focusedTarget, onSelectorPreviewChange, workflow]);

    const setSelectorFocus = (target: FocusTarget, value: string) => {
        setFocusedTarget(target);
        onSelectorPreviewChange?.(value.trim() ? value : null);
    };

    const setSelectorPreviewOnChange = (target: FocusTarget, value: string) => {
        if (focusTargetsEqual(focusedTarget, target)) {
            onSelectorPreviewChange?.(value.trim() ? value : null);
        }
    };

    const updateDiscovery = (updater: (phase: PhaseConfig) => PhaseConfig) => {
        setWorkflow((prev) => ({ ...prev, discovery: updater(prev.discovery) }));
    };

    const updateActiveProcessing = (updater: (phase: PhaseConfig) => PhaseConfig) => {
        if (!activeUrlType) return;
        setWorkflow((prev) => ({
            ...prev,
            url_types: prev.url_types.map((urlType) => (
                urlType.id === activeUrlType.id
                    ? { ...urlType, processing: updater(urlType.processing) }
                    : urlType
            )),
        }));
    };

    const currentPhase: PhaseConfig = activeTab === 'discovery'
        ? workflow.discovery
        : (activeUrlType?.processing ?? createEmptyPhase());

    const addField = () => {
        const nextField: FieldConfig = activeTab === 'discovery'
            ? {
                name: currentPhase.fields.length === 0 ? 'source_url' : '',
                css_selector: '',
                extract_type: 'href',
                is_source_url: currentPhase.fields.length === 0,
                url_type_id: activeUrlType?.id ?? workflow.url_types[0]?.id,
            }
            : {
                name: '',
                css_selector: '',
                extract_type: 'text',
            };

        if (activeTab === 'discovery') {
            updateDiscovery((phase) => ({ ...phase, fields: [...phase.fields, nextField] }));
            return;
        }
        updateActiveProcessing((phase) => ({ ...phase, fields: [...phase.fields, nextField] }));
    };

    const addPlaywrightAction = (type: PlaywrightAction['type']) => {
        const nextAction = createDefaultPlaywrightAction(type);
        if (activeTab === 'discovery') {
            updateDiscovery((phase) => ({ ...phase, pre_actions: [...phase.pre_actions, nextAction] }));
            return;
        }
        updateActiveProcessing((phase) => ({ ...phase, pre_actions: [...phase.pre_actions, nextAction] }));
    };

    const handleUrlTypeAdd = () => {
        const nextType: SourceUrlType = {
            id: createId('url-type'),
            name: `URL Type ${workflow.url_types.length + 1}`,
            processing: createEmptyPhase(),
        };
        setWorkflow((prev) => ({ ...prev, url_types: [...prev.url_types, nextType] }));
        setActiveUrlTypeId(nextType.id);
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
        const remaining = workflow.url_types.filter((item) => item.id !== id);
        const fallbackId = remaining[0].id;
        setWorkflow((prev) => ({
            ...prev,
            url_types: remaining,
            discovery: {
                ...prev.discovery,
                fields: prev.discovery.fields.map((field) => (
                    field.url_type_id === id ? { ...field, url_type_id: fallbackId } : field
                )),
            },
        }));
        if (activeUrlTypeId === id) {
            setActiveUrlTypeId(fallbackId);
        }
    };

    const actionIds = currentPhase.pre_actions.map((_, index) => `action-${index}`);
    const fieldIds = currentPhase.fields.map((_, index) => `field-${index}`);

    const onActionDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;
        if (!over || active.id === over.id) return;
        const oldIndex = Number(String(active.id).replace('action-', ''));
        const newIndex = Number(String(over.id).replace('action-', ''));
        if (Number.isNaN(oldIndex) || Number.isNaN(newIndex)) return;
        if (activeTab === 'discovery') {
            updateDiscovery((phase) => ({ ...phase, pre_actions: arrayMove(phase.pre_actions, oldIndex, newIndex) }));
            return;
        }
        updateActiveProcessing((phase) => ({ ...phase, pre_actions: arrayMove(phase.pre_actions, oldIndex, newIndex) }));
    };

    const onFieldDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;
        if (!over || active.id === over.id) return;
        const oldIndex = Number(String(active.id).replace('field-', ''));
        const newIndex = Number(String(over.id).replace('field-', ''));
        if (Number.isNaN(oldIndex) || Number.isNaN(newIndex)) return;
        if (activeTab === 'discovery') {
            updateDiscovery((phase) => ({ ...phase, fields: arrayMove(phase.fields, oldIndex, newIndex) }));
            return;
        }
        updateActiveProcessing((phase) => ({ ...phase, fields: arrayMove(phase.fields, oldIndex, newIndex) }));
    };

    const updateAction = (index: number, updater: (action: PlaywrightAction) => PlaywrightAction) => {
        if (activeTab === 'discovery') {
            updateDiscovery((phase) => ({
                ...phase,
                pre_actions: phase.pre_actions.map((action, i) => (i === index ? updater(action) : action)),
            }));
            return;
        }
        updateActiveProcessing((phase) => ({
            ...phase,
            pre_actions: phase.pre_actions.map((action, i) => (i === index ? updater(action) : action)),
        }));
    };

    const removeAction = (index: number) => {
        if (activeTab === 'discovery') {
            updateDiscovery((phase) => ({ ...phase, pre_actions: phase.pre_actions.filter((_, i) => i !== index) }));
            return;
        }
        updateActiveProcessing((phase) => ({ ...phase, pre_actions: phase.pre_actions.filter((_, i) => i !== index) }));
    };

    const updateField = (index: number, updater: (field: FieldConfig) => FieldConfig) => {
        if (activeTab === 'discovery') {
            updateDiscovery((phase) => ({ ...phase, fields: phase.fields.map((field, i) => (i === index ? updater(field) : field)) }));
            return;
        }
        updateActiveProcessing((phase) => ({ ...phase, fields: phase.fields.map((field, i) => (i === index ? updater(field) : field)) }));
    };

    const removeField = (index: number) => {
        if (activeTab === 'discovery') {
            updateDiscovery((phase) => ({ ...phase, fields: phase.fields.filter((_, i) => i !== index) }));
            return;
        }
        updateActiveProcessing((phase) => ({ ...phase, fields: phase.fields.filter((_, i) => i !== index) }));
    };

    const setScope = (next: { css_selector?: string; label?: string }) => {
        if (activeTab === 'discovery') {
            updateDiscovery((phase) => ({
                ...phase,
                scope: {
                    ...(phase.scope ?? { css_selector: '', label: '' }),
                    ...next,
                },
            }));
            return;
        }
        updateActiveProcessing((phase) => ({
            ...phase,
            scope: {
                ...(phase.scope ?? { css_selector: '', label: '' }),
                ...next,
            },
        }));
    };

    const setRepeater = (next: { css_selector?: string; label?: string }) => {
        if (activeTab === 'discovery') {
            updateDiscovery((phase) => ({
                ...phase,
                repeater: {
                    ...(phase.repeater ?? { css_selector: '', label: '' }),
                    ...next,
                },
            }));
            return;
        }
        updateActiveProcessing((phase) => ({
            ...phase,
            repeater: {
                ...(phase.repeater ?? { css_selector: '', label: '' }),
                ...next,
            },
        }));
    };

    const setPagination = (next: { css_selector?: string; max_pages?: number }) => {
        if (activeTab === 'discovery') {
            updateDiscovery((phase) => ({
                ...phase,
                pagination: {
                    ...(phase.pagination ?? { css_selector: '', max_pages: 0 }),
                    ...next,
                },
            }));
            return;
        }
        updateActiveProcessing((phase) => ({
            ...phase,
            pagination: {
                ...(phase.pagination ?? { css_selector: '', max_pages: 0 }),
                ...next,
            },
        }));
    };

    const renderActionEditor = (action: PlaywrightAction, index: number) => {
        const selectorFocusTarget: FocusTarget = activeTab === 'discovery'
            ? { phase: 'discovery', section: 'pre_action', index }
            : { phase: 'processing', urlTypeId: activeUrlType.id, section: 'pre_action', index };

        return (
            <SortableRow id={`action-${index}`} key={`action-${index}`}>
                <div className="space-y-3">
                    <div className="flex items-center gap-2">
                        <div className="min-w-0 flex-1">
                            <Select
                                value={action.type}
                                onValueChange={(value) => {
                                    updateAction(index, () => createDefaultPlaywrightAction(value as PlaywrightAction['type']));
                                }}
                            >
                                <SelectTrigger className="h-8 bg-black/30 border-white/10 text-xs text-white">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {PLAYWRIGHT_ACTION_TYPES.map((type) => (
                                        <SelectItem key={type.value} value={type.value} className="text-xs">
                                            {type.label}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7 text-white/40 hover:text-red-300"
                            onClick={() => removeAction(index)}
                        >
                            <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                    </div>

                    {action.type === 'wait_selector' && (
                        <div className="grid grid-cols-2 gap-2">
                            <Input
                                placeholder="CSS selector"
                                value={action.css_selector}
                                onFocus={() => setSelectorFocus(selectorFocusTarget, action.css_selector)}
                                onChange={(e) => {
                                    updateAction(index, (current) => (
                                        current.type === 'wait_selector'
                                            ? { ...current, css_selector: e.target.value }
                                            : current
                                    ));
                                    setSelectorPreviewOnChange(selectorFocusTarget, e.target.value);
                                }}
                                className="h-8 bg-black/30 border-white/10 text-xs text-white"
                            />
                            <Input
                                type="number"
                                placeholder="Timeout ms"
                                value={action.timeout_ms}
                                onChange={(e) => {
                                    updateAction(index, (current) => (
                                        current.type === 'wait_selector'
                                            ? { ...current, timeout_ms: Number(e.target.value) || 0 }
                                            : current
                                    ));
                                }}
                                className="h-8 bg-black/30 border-white/10 text-xs text-white"
                            />
                        </div>
                    )}

                    {action.type === 'wait_network' && (
                        <Select
                            value={action.state}
                            onValueChange={(value) => {
                                updateAction(index, (current) => (
                                    current.type === 'wait_network'
                                        ? { ...current, state: value as 'networkidle' | 'domcontentloaded' | 'load' }
                                        : current
                                ));
                            }}
                        >
                            <SelectTrigger className="h-8 bg-black/30 border-white/10 text-xs text-white">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="networkidle">networkidle</SelectItem>
                                <SelectItem value="domcontentloaded">domcontentloaded</SelectItem>
                                <SelectItem value="load">load</SelectItem>
                            </SelectContent>
                        </Select>
                    )}

                    {action.type === 'wait_timeout' && (
                        <Input
                            type="number"
                            placeholder="Wait ms"
                            value={action.ms}
                            onChange={(e) => {
                                updateAction(index, (current) => (
                                    current.type === 'wait_timeout'
                                        ? { ...current, ms: Number(e.target.value) || 0 }
                                        : current
                                ));
                            }}
                            className="h-8 bg-black/30 border-white/10 text-xs text-white"
                        />
                    )}

                    {action.type === 'click' && (
                        <div className="grid grid-cols-2 gap-2">
                            <Input
                                placeholder="CSS selector"
                                value={action.css_selector}
                                onFocus={() => setSelectorFocus(selectorFocusTarget, action.css_selector)}
                                onChange={(e) => {
                                    updateAction(index, (current) => (
                                        current.type === 'click'
                                            ? { ...current, css_selector: e.target.value }
                                            : current
                                    ));
                                    setSelectorPreviewOnChange(selectorFocusTarget, e.target.value);
                                }}
                                className="h-8 bg-black/30 border-white/10 text-xs text-white"
                            />
                            <Input
                                type="number"
                                placeholder="Wait after ms"
                                value={action.wait_after_ms ?? 0}
                                onChange={(e) => {
                                    updateAction(index, (current) => (
                                        current.type === 'click'
                                            ? { ...current, wait_after_ms: Number(e.target.value) || 0 }
                                            : current
                                    ));
                                }}
                                className="h-8 bg-black/30 border-white/10 text-xs text-white"
                            />
                        </div>
                    )}

                    {action.type === 'scroll' && (
                        <div className="grid grid-cols-2 gap-2">
                            <Input
                                type="number"
                                placeholder="Scroll count"
                                value={action.count}
                                onChange={(e) => {
                                    updateAction(index, (current) => (
                                        current.type === 'scroll'
                                            ? { ...current, count: Number(e.target.value) || 0 }
                                            : current
                                    ));
                                }}
                                className="h-8 bg-black/30 border-white/10 text-xs text-white"
                            />
                            <Input
                                type="number"
                                placeholder="Delay ms"
                                value={action.delay_ms}
                                onChange={(e) => {
                                    updateAction(index, (current) => (
                                        current.type === 'scroll'
                                            ? { ...current, delay_ms: Number(e.target.value) || 0 }
                                            : current
                                    ));
                                }}
                                className="h-8 bg-black/30 border-white/10 text-xs text-white"
                            />
                        </div>
                    )}

                    {action.type === 'fill' && (
                        <div className="space-y-2">
                            <Input
                                placeholder="CSS selector"
                                value={action.css_selector}
                                onFocus={() => setSelectorFocus(selectorFocusTarget, action.css_selector)}
                                onChange={(e) => {
                                    updateAction(index, (current) => (
                                        current.type === 'fill'
                                            ? { ...current, css_selector: e.target.value }
                                            : current
                                    ));
                                    setSelectorPreviewOnChange(selectorFocusTarget, e.target.value);
                                }}
                                className="h-8 bg-black/30 border-white/10 text-xs text-white"
                            />
                            <Input
                                placeholder="Value"
                                value={action.value}
                                onChange={(e) => {
                                    updateAction(index, (current) => (
                                        current.type === 'fill'
                                            ? { ...current, value: e.target.value }
                                            : current
                                    ));
                                }}
                                className="h-8 bg-black/30 border-white/10 text-xs text-white"
                            />
                            <label className="flex items-center gap-2 text-xs text-white/70">
                                <input
                                    type="checkbox"
                                    checked={action.press_enter}
                                    onChange={(e) => {
                                        updateAction(index, (current) => (
                                            current.type === 'fill'
                                                ? { ...current, press_enter: e.target.checked }
                                                : current
                                        ));
                                    }}
                                />
                                Press Enter
                            </label>
                        </div>
                    )}

                    {action.type === 'select_option' && (
                        <div className="grid grid-cols-2 gap-2">
                            <Input
                                placeholder="CSS selector"
                                value={action.css_selector}
                                onFocus={() => setSelectorFocus(selectorFocusTarget, action.css_selector)}
                                onChange={(e) => {
                                    updateAction(index, (current) => (
                                        current.type === 'select_option'
                                            ? { ...current, css_selector: e.target.value }
                                            : current
                                    ));
                                    setSelectorPreviewOnChange(selectorFocusTarget, e.target.value);
                                }}
                                className="h-8 bg-black/30 border-white/10 text-xs text-white"
                            />
                            <Input
                                placeholder="Option value"
                                value={action.value}
                                onChange={(e) => {
                                    updateAction(index, (current) => (
                                        current.type === 'select_option'
                                            ? { ...current, value: e.target.value }
                                            : current
                                    ));
                                }}
                                className="h-8 bg-black/30 border-white/10 text-xs text-white"
                            />
                        </div>
                    )}

                    {action.type === 'evaluate' && (
                        <Input
                            placeholder="JavaScript code"
                            value={action.script}
                            onChange={(e) => {
                                updateAction(index, (current) => (
                                    current.type === 'evaluate'
                                        ? { ...current, script: e.target.value }
                                        : current
                                ));
                            }}
                            className="h-8 bg-black/30 border-white/10 text-xs text-white"
                        />
                    )}

                    {action.type === 'screenshot' && (
                        <Input
                            placeholder="Filename"
                            value={action.filename}
                            onChange={(e) => {
                                updateAction(index, (current) => (
                                    current.type === 'screenshot'
                                        ? { ...current, filename: e.target.value }
                                        : current
                                ));
                            }}
                            className="h-8 bg-black/30 border-white/10 text-xs text-white"
                        />
                    )}
                </div>
            </SortableRow>
        );
    };

    const renderFieldEditor = (field: FieldConfig, index: number) => {
        const selectorFocusTarget: FocusTarget = activeTab === 'discovery'
            ? { phase: 'discovery', section: 'field', index }
            : { phase: 'processing', urlTypeId: activeUrlType.id, section: 'field', index };

        return (
            <SortableRow id={`field-${index}`} key={`field-${index}`}>
                <div className="space-y-3">
                    <div className="flex items-center gap-2">
                        <Input
                            placeholder="Field name"
                            value={field.name}
                            onChange={(e) => updateField(index, (current) => ({ ...current, name: e.target.value }))}
                            className="h-8 bg-black/30 border-white/10 text-xs text-white"
                        />
                        <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7 text-white/40 hover:text-red-300"
                            onClick={() => removeField(index)}
                        >
                            <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                        <Input
                            placeholder="CSS selector"
                            value={field.css_selector}
                            onFocus={() => setSelectorFocus(selectorFocusTarget, field.css_selector)}
                            onChange={(e) => {
                                updateField(index, (current) => ({ ...current, css_selector: e.target.value }));
                                setSelectorPreviewOnChange(selectorFocusTarget, e.target.value);
                            }}
                            className="h-8 bg-black/30 border-white/10 text-xs text-white"
                        />
                        <Select
                            value={field.extract_type}
                            onValueChange={(value) => updateField(index, (current) => ({
                                ...current,
                                extract_type: value as FieldConfig['extract_type'],
                                attribute_name: value === 'attribute' ? current.attribute_name ?? '' : undefined,
                            }))}
                        >
                            <SelectTrigger className="h-8 bg-black/30 border-white/10 text-xs text-white">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {EXTRACT_TYPES.map((type) => (
                                    <SelectItem key={type.value} value={type.value} className="text-xs">
                                        {type.label}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    {field.extract_type === 'attribute' && (
                        <Input
                            placeholder="Attribute name"
                            value={field.attribute_name ?? ''}
                            onChange={(e) => updateField(index, (current) => ({ ...current, attribute_name: e.target.value }))}
                            className="h-8 bg-black/30 border-white/10 text-xs text-white"
                        />
                    )}

                    {activeTab === 'discovery' && (
                        <div className="grid grid-cols-2 gap-2">
                            <label className="flex items-center gap-2 text-xs text-white/70">
                                <input
                                    type="checkbox"
                                    checked={field.is_source_url ?? false}
                                    onChange={(e) => updateField(index, (current) => ({
                                        ...current,
                                        is_source_url: e.target.checked,
                                        url_type_id: e.target.checked ? (current.url_type_id ?? workflow.url_types[0]?.id) : undefined,
                                    }))}
                                />
                                source_url field
                            </label>
                            <Select
                                value={field.url_type_id ?? workflow.url_types[0]?.id}
                                disabled={!field.is_source_url}
                                onValueChange={(value) => updateField(index, (current) => ({ ...current, url_type_id: value }))}
                            >
                                <SelectTrigger className="h-8 bg-black/30 border-white/10 text-xs text-white">
                                    <SelectValue placeholder="URL type" />
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
                    )}
                </div>
            </SortableRow>
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
                                {workflow.playwright_enabled && (
                                    <section className="rounded-lg border border-dashed border-purple-500/40 bg-purple-500/5 p-3">
                                        <div className="mb-2 flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-purple-200">
                                            <span>Playwright Pre-actions</span>
                                            <Select onValueChange={(value) => addPlaywrightAction(value as PlaywrightAction['type'])}>
                                                <SelectTrigger className="h-7 w-40 border-purple-500/30 bg-black/30 text-[11px] text-purple-100">
                                                    <SelectValue placeholder="+ Add Action" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {PLAYWRIGHT_ACTION_TYPES.map((type) => (
                                                        <SelectItem key={type.value} value={type.value}>
                                                            {type.label}
                                                        </SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </div>
                                        <DndContext id={`${dndId}-discovery-actions`} sensors={sensors} collisionDetection={closestCenter} onDragEnd={onActionDragEnd}>
                                            <SortableContext items={actionIds} strategy={verticalListSortingStrategy}>
                                                <div className="space-y-2">
                                                    {workflow.discovery.pre_actions.map((action, index) => renderActionEditor(action, index))}
                                                </div>
                                            </SortableContext>
                                        </DndContext>
                                    </section>
                                )}

                                <section className="rounded-lg border border-cyan-500/40 bg-cyan-500/5 p-3">
                                    <div className="mb-3 text-xs font-semibold uppercase tracking-wider text-cyan-200">Scope</div>
                                    <div className="grid grid-cols-2 gap-2">
                                        <div className="space-y-1">
                                            <Label className="text-[11px] text-white/60">CSS Selector</Label>
                                            <Input
                                                value={workflow.discovery.scope?.css_selector ?? ''}
                                                onFocus={() => setSelectorFocus({ phase: 'discovery', section: 'scope' }, workflow.discovery.scope?.css_selector ?? '')}
                                                onChange={(e) => {
                                                    setScope({ css_selector: e.target.value });
                                                    setSelectorPreviewOnChange({ phase: 'discovery', section: 'scope' }, e.target.value);
                                                }}
                                                className="h-8 border-white/10 bg-black/30 text-xs text-white"
                                            />
                                        </div>
                                        <div className="space-y-1">
                                            <Label className="text-[11px] text-white/60">Label</Label>
                                            <Input
                                                value={workflow.discovery.scope?.label ?? ''}
                                                onChange={(e) => setScope({ label: e.target.value })}
                                                className="h-8 border-white/10 bg-black/30 text-xs text-white"
                                            />
                                        </div>
                                    </div>

                                    <div className="ml-3 mt-3 rounded-lg border border-amber-500/40 bg-amber-500/5 p-3">
                                        <div className="mb-3 text-xs font-semibold uppercase tracking-wider text-amber-200">Repeater</div>
                                        <div className="grid grid-cols-2 gap-2">
                                            <div className="space-y-1">
                                                <Label className="text-[11px] text-white/60">CSS Selector</Label>
                                                <Input
                                                    value={workflow.discovery.repeater?.css_selector ?? ''}
                                                    onFocus={() => setSelectorFocus({ phase: 'discovery', section: 'repeater' }, workflow.discovery.repeater?.css_selector ?? '')}
                                                    onChange={(e) => {
                                                        setRepeater({ css_selector: e.target.value });
                                                        setSelectorPreviewOnChange({ phase: 'discovery', section: 'repeater' }, e.target.value);
                                                    }}
                                                    className="h-8 border-white/10 bg-black/30 text-xs text-white"
                                                />
                                            </div>
                                            <div className="space-y-1">
                                                <Label className="text-[11px] text-white/60">Label</Label>
                                                <Input
                                                    value={workflow.discovery.repeater?.label ?? ''}
                                                    onChange={(e) => setRepeater({ label: e.target.value })}
                                                    className="h-8 border-white/10 bg-black/30 text-xs text-white"
                                                />
                                            </div>
                                        </div>

                                        <div className="ml-3 mt-3 rounded-lg border border-green-500/40 bg-green-500/5 p-3">
                                            <div className="mb-2 flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-green-200">
                                                <span>Fields</span>
                                                <Button type="button" size="sm" variant="ghost" className="h-7 text-green-100 hover:bg-green-500/20" onClick={addField}>
                                                    <Plus className="mr-1 h-3 w-3" />
                                                    Add Field
                                                </Button>
                                            </div>
                                            <DndContext id={`${dndId}-discovery-fields`} sensors={sensors} collisionDetection={closestCenter} onDragEnd={onFieldDragEnd}>
                                                <SortableContext items={fieldIds} strategy={verticalListSortingStrategy}>
                                                    <div className="space-y-2">
                                                        {workflow.discovery.fields.map((field, index) => renderFieldEditor(field, index))}
                                                    </div>
                                                </SortableContext>
                                            </DndContext>
                                        </div>
                                    </div>
                                </section>

                                <section className="rounded-lg border border-dashed border-red-500/40 bg-red-500/5 p-3">
                                    <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-red-200">
                                        <ArrowDown className="h-3.5 w-3.5" />
                                        Pagination
                                    </div>
                                    <div className="grid grid-cols-2 gap-2">
                                        <div className="space-y-1">
                                            <Label className="text-[11px] text-white/60">Next Selector</Label>
                                            <Input
                                                value={workflow.discovery.pagination?.css_selector ?? ''}
                                                onFocus={() => setSelectorFocus({ phase: 'discovery', section: 'pagination' }, workflow.discovery.pagination?.css_selector ?? '')}
                                                onChange={(e) => {
                                                    setPagination({ css_selector: e.target.value });
                                                    setSelectorPreviewOnChange({ phase: 'discovery', section: 'pagination' }, e.target.value);
                                                }}
                                                className="h-8 border-white/10 bg-black/30 text-xs text-white"
                                            />
                                        </div>
                                        <div className="space-y-1">
                                            <Label className="text-[11px] text-white/60">Max Pages</Label>
                                            <Input
                                                type="number"
                                                value={workflow.discovery.pagination?.max_pages ?? 0}
                                                onChange={(e) => setPagination({ max_pages: Number(e.target.value) || 0 })}
                                                className="h-8 border-white/10 bg-black/30 text-xs text-white"
                                            />
                                        </div>
                                    </div>
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
                                            <div className="truncate text-sm text-white">{urlType.name}</div>
                                            <div className="flex items-center gap-1">
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
                                                    <Settings className="h-3.5 w-3.5" />
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
                                            </div>
                                        </div>
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="min-h-0 flex-1 overflow-auto p-4">
                            <div className="space-y-4">
                                {workflow.playwright_enabled && (
                                    <section className="rounded-lg border border-dashed border-purple-500/40 bg-purple-500/5 p-3">
                                        <div className="mb-2 flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-purple-200">
                                            <span>Playwright Pre-actions</span>
                                            <Select onValueChange={(value) => addPlaywrightAction(value as PlaywrightAction['type'])}>
                                                <SelectTrigger className="h-7 w-40 border-purple-500/30 bg-black/30 text-[11px] text-purple-100">
                                                    <SelectValue placeholder="+ Add Action" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {PLAYWRIGHT_ACTION_TYPES.map((type) => (
                                                        <SelectItem key={type.value} value={type.value}>
                                                            {type.label}
                                                        </SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </div>
                                        <DndContext id={`${dndId}-processing-actions`} sensors={sensors} collisionDetection={closestCenter} onDragEnd={onActionDragEnd}>
                                            <SortableContext items={actionIds} strategy={verticalListSortingStrategy}>
                                                <div className="space-y-2">
                                                    {currentPhase.pre_actions.map((action, index) => renderActionEditor(action, index))}
                                                </div>
                                            </SortableContext>
                                        </DndContext>
                                    </section>
                                )}

                                <section className="rounded-lg border border-cyan-500/40 bg-cyan-500/5 p-3">
                                    <div className="mb-3 text-xs font-semibold uppercase tracking-wider text-cyan-200">Scope</div>
                                    <div className="grid grid-cols-2 gap-2">
                                        <div className="space-y-1">
                                            <Label className="text-[11px] text-white/60">CSS Selector</Label>
                                            <Input
                                                value={currentPhase.scope?.css_selector ?? ''}
                                                onFocus={() => setSelectorFocus({ phase: 'processing', urlTypeId: activeUrlType.id, section: 'scope' }, currentPhase.scope?.css_selector ?? '')}
                                                onChange={(e) => {
                                                    setScope({ css_selector: e.target.value });
                                                    setSelectorPreviewOnChange({ phase: 'processing', urlTypeId: activeUrlType.id, section: 'scope' }, e.target.value);
                                                }}
                                                className="h-8 border-white/10 bg-black/30 text-xs text-white"
                                            />
                                        </div>
                                        <div className="space-y-1">
                                            <Label className="text-[11px] text-white/60">Label</Label>
                                            <Input
                                                value={currentPhase.scope?.label ?? ''}
                                                onChange={(e) => setScope({ label: e.target.value })}
                                                className="h-8 border-white/10 bg-black/30 text-xs text-white"
                                            />
                                        </div>
                                    </div>

                                    <div className="ml-3 mt-3 rounded-lg border border-amber-500/40 bg-amber-500/5 p-3">
                                        <div className="mb-3 text-xs font-semibold uppercase tracking-wider text-amber-200">Repeater</div>
                                        <div className="grid grid-cols-2 gap-2">
                                            <div className="space-y-1">
                                                <Label className="text-[11px] text-white/60">CSS Selector</Label>
                                                <Input
                                                    value={currentPhase.repeater?.css_selector ?? ''}
                                                    onFocus={() => setSelectorFocus({ phase: 'processing', urlTypeId: activeUrlType.id, section: 'repeater' }, currentPhase.repeater?.css_selector ?? '')}
                                                    onChange={(e) => {
                                                        setRepeater({ css_selector: e.target.value });
                                                        setSelectorPreviewOnChange({ phase: 'processing', urlTypeId: activeUrlType.id, section: 'repeater' }, e.target.value);
                                                    }}
                                                    className="h-8 border-white/10 bg-black/30 text-xs text-white"
                                                />
                                            </div>
                                            <div className="space-y-1">
                                                <Label className="text-[11px] text-white/60">Label</Label>
                                                <Input
                                                    value={currentPhase.repeater?.label ?? ''}
                                                    onChange={(e) => setRepeater({ label: e.target.value })}
                                                    className="h-8 border-white/10 bg-black/30 text-xs text-white"
                                                />
                                            </div>
                                        </div>

                                        <div className="ml-3 mt-3 rounded-lg border border-green-500/40 bg-green-500/5 p-3">
                                            <div className="mb-2 flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-green-200">
                                                <span>Fields</span>
                                                <Button type="button" size="sm" variant="ghost" className="h-7 text-green-100 hover:bg-green-500/20" onClick={addField}>
                                                    <Plus className="mr-1 h-3 w-3" />
                                                    Add Field
                                                </Button>
                                            </div>
                                            <DndContext id={`${dndId}-processing-fields`} sensors={sensors} collisionDetection={closestCenter} onDragEnd={onFieldDragEnd}>
                                                <SortableContext items={fieldIds} strategy={verticalListSortingStrategy}>
                                                    <div className="space-y-2">
                                                        {currentPhase.fields.map((field, index) => renderFieldEditor(field, index))}
                                                    </div>
                                                </SortableContext>
                                            </DndContext>
                                        </div>
                                    </div>
                                </section>

                                <section className="rounded-lg border border-dashed border-red-500/40 bg-red-500/5 p-3">
                                    <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-red-200">
                                        <ArrowDown className="h-3.5 w-3.5" />
                                        Pagination
                                    </div>
                                    <div className="grid grid-cols-2 gap-2">
                                        <div className="space-y-1">
                                            <Label className="text-[11px] text-white/60">Next Selector</Label>
                                            <Input
                                                value={currentPhase.pagination?.css_selector ?? ''}
                                                onFocus={() => setSelectorFocus({ phase: 'processing', urlTypeId: activeUrlType.id, section: 'pagination' }, currentPhase.pagination?.css_selector ?? '')}
                                                onChange={(e) => {
                                                    setPagination({ css_selector: e.target.value });
                                                    setSelectorPreviewOnChange({ phase: 'processing', urlTypeId: activeUrlType.id, section: 'pagination' }, e.target.value);
                                                }}
                                                className="h-8 border-white/10 bg-black/30 text-xs text-white"
                                            />
                                        </div>
                                        <div className="space-y-1">
                                            <Label className="text-[11px] text-white/60">Max Pages</Label>
                                            <Input
                                                type="number"
                                                value={currentPhase.pagination?.max_pages ?? 0}
                                                onChange={(e) => setPagination({ max_pages: Number(e.target.value) || 0 })}
                                                className="h-8 border-white/10 bg-black/30 text-xs text-white"
                                            />
                                        </div>
                                    </div>
                                </section>
                            </div>
                        </div>
                    </TabsContent>
                </Tabs>
            </div>
            <div className="border-t border-white/10 p-3 text-[11px] text-white/40">
                <div className="flex items-center gap-2">
                    <RefreshCw className="h-3.5 w-3.5" />
                    <span>
                        Fixed hierarchy: Scope - Repeater - Fields - Pagination
                    </span>
                </div>
                <div className="mt-1 flex items-center gap-2">
                    <MousePointerClick className="h-3.5 w-3.5" />
                    <span>Focus a selector input, then use Vybrat in iframe.</span>
                </div>
                <div className="mt-1 flex items-center gap-2">
                    <Type className="h-3.5 w-3.5" />
                    <span>Mark at least one Discovery field as source_url.</span>
                </div>
                <div className="mt-1 flex items-center gap-2">
                    <Eraser className="h-3.5 w-3.5" />
                    <span>Odebrat persists only as Playwright evaluate action.</span>
                </div>
            </div>
        </aside>
    );
});

SimulatorSidebar.displayName = 'SimulatorSidebar';
