'use client';

import { useState, useId, useEffect, forwardRef, useImperativeHandle } from 'react';
import {
    DndContext,
    // ... (omitting unchanged imports, but I need to make sure I don't break them)

    DragOverlay,
    closestCorners,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
    DragStartEvent,
    DragEndEvent,
    UniqueIdentifier,
} from '@dnd-kit/core';
import {
    arrayMove,
    SortableContext,
    sortableKeyboardCoordinates,
    verticalListSortingStrategy,
    useSortable,
} from '@dnd-kit/sortable';
import { restrictToVerticalAxis } from '@dnd-kit/modifiers';
import { CSS } from '@dnd-kit/utilities';
import {
    Workflow,
    MousePointer2,
    Type,
    CloudDownload,
    ArrowDown,
    GripVertical,
    Trash2,
    Plus,
    Settings,
    RefreshCw,
    Globe,
    Eraser,
} from 'lucide-react';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

// shared types
import { BlockType, BlockData, SourceData, WorkflowData } from './types';
// config components
import { SelectConfig } from './steps/select-config';
import { ExtractConfig } from './steps/extract-config';
import { SourceConfig } from './steps/source-config';
import { ClickConfig } from './steps/click-config';
import { PaginationConfig } from './steps/pagination-config';
import { RemoveElementConfig } from './steps/remove-element-config';


// --- Icons & Primitives ---

const BLOCK_ICONS: Record<BlockType, React.ElementType> = {
    click: MousePointer2,
    select: MousePointer2,
    extract: Type,
    pagination: ArrowDown,
    source: CloudDownload,
    mainloop: RefreshCw,
    remove_element: Eraser,
};


const PRIMITIVES: { type: BlockType; label: string }[] = [
    { type: 'select', label: 'Select' },
    { type: 'extract', label: 'Extract' },
    { type: 'click', label: 'Click' },
    { type: 'pagination', label: 'Paginate' },
    { type: 'remove_element', label: 'Remove El.' },
];


const MAIN_PRIMITIVES: { type: 'mainloop' | 'source'; label: string; icon: React.ElementType }[] = [
    { type: 'mainloop', label: 'Main Loop', icon: RefreshCw },
    { type: 'source', label: 'Source', icon: Globe },
];

// --- Sortable Block Component ---

interface SortableBlockProps {
    block: BlockData;
    onRemove: (id: string) => void;
    onConfigure: (id: string) => void;
}

function SortableBlock({ block, onRemove, onConfigure }: SortableBlockProps) {
    const {
        attributes,
        listeners,
        setNodeRef,
        setActivatorNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({ id: block.id });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
    };

    const Icon = BLOCK_ICONS[block.type] || MousePointer2; // fallback

    return (
        <div
            ref={setNodeRef}
            style={style}
            className={cn(
                'flex items-center gap-3 p-3 rounded-lg border bg-zinc-900/80 group transition-all select-none relative z-10',
                isDragging
                    ? 'opacity-30'
                    : 'border-white/10 hover:border-white/20'
            )}
            onClick={() => onConfigure(block.id)}
        >
            {/* Drag Handle */}
            <button
                ref={setActivatorNodeRef}
                {...attributes}
                {...listeners}
                className="cursor-grab active:cursor-grabbing text-white/30 hover:text-white/60 touch-none p-1"
                aria-label="Drag to reorder"
                onClick={(e) => e.stopPropagation()} // Prevent triggering configure
            >
                <GripVertical className="w-4 h-4" />
            </button>

            {/* Icon */}
            <div className={cn(
                "p-2 rounded-md",
                block.type === 'source'
                    ? "bg-lime-500/10 text-lime-400"
                    : "bg-purple-500/10 text-purple-400"
            )}>
                <Icon className="w-4 h-4" />
            </div>

            {/* Label */}
            <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-white truncate">
                    {block.label}
                </div>
                <div className="text-xs text-white/40 truncate font-mono">
                    {block.type}
                </div>
            </div>

            {/* Configure Button (Visible on hover or can click entire card) */}
            <Settings className="w-4 h-4 text-white/20 opacity-0 group-hover:opacity-100 transition-opacity mr-2" />

            {/* Remove Button */}
            <Button
                variant="ghost"
                size="icon"
                onClick={(e) => {
                    e.stopPropagation();
                    onRemove(block.id);
                }}
                className="h-7 w-7 text-white/20 hover:text-red-400 hover:bg-red-500/10 opacity-0 group-hover:opacity-100 transition-opacity"
            >
                <Trash2 className="w-3.5 h-3.5" />
            </Button>
        </div>
    );
}

// --- Sidebar Component ---

export interface SimulatorSidebarRef {
    addBlock: (type: BlockType, config?: any) => void;
}

interface SimulatorSidebarProps {
    onWorkflowChange?: (workflowData: WorkflowData) => void;
    pageType?: { requiresPlaywright: boolean; framework: string } | null;
}

export const SimulatorSidebar = forwardRef<SimulatorSidebarRef, SimulatorSidebarProps>(({ onWorkflowChange, pageType }, ref) => {
    const dndContextId = useId();

    // Workflow state - Main loop and Sources
    const [mainLoopBlocks, setMainLoopBlocks] = useState<BlockData[]>([]);

    const [sources, setSources] = useState<SourceData[]>([
        {
            id: 'source-1',
            url: '',
            label: 'Source 1',
            steps: [],
            loopConfig: {
                enabled: false,
                maxIterations: 10,
                waitBetweenIterations: 1000,
            },
        },
    ]);
    const [activeTab, setActiveTab] = useState<'mainloop' | 'sources'>('mainloop');
    const [activeId, setActiveId] = useState<UniqueIdentifier | null>(null);
    const [activeSourceId, setActiveSourceId] = useState<string>('source-1');

    // Configuration Dialog State
    const [configuringBlockId, setConfiguringBlockId] = useState<string | null>(null);
    const [configuringSourceId, setConfiguringSourceId] = useState<string | null>(null);

    const sensors = useSensors(
        useSensor(PointerSensor, {
            activationConstraint: {
                distance: 8,
            },
        }),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        })
    );

    const handleDragStart = (event: DragStartEvent) => {
        setActiveId(event.active.id);
    };

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;

        if (over && active.id !== over.id) {
            if (activeTab === 'mainloop') {
                setMainLoopBlocks((items) => {
                    const oldIndex = items.findIndex((item) => item.id === active.id);
                    const newIndex = items.findIndex((item) => item.id === over.id);

                    if (oldIndex !== -1 && newIndex !== -1) {
                        return arrayMove(items, oldIndex, newIndex);
                    }
                    return items;
                });
            } else {
                // Drag within source steps
                setSources((prevSources) => {
                    return prevSources.map((source) => {
                        if (source.id === activeSourceId) {
                            const oldIndex = source.steps.findIndex((item) => item.id === active.id);
                            const newIndex = source.steps.findIndex((item) => item.id === over.id);

                            if (oldIndex !== -1 && newIndex !== -1) {
                                return {
                                    ...source,
                                    steps: arrayMove(source.steps, oldIndex, newIndex),
                                };
                            }
                        }
                        return source;
                    });
                });
            }
        }

        setActiveId(null);
    };

    const handleDragCancel = () => {
        setActiveId(null);
    };

    const handleRemoveBlock = (id: string) => {
        if (activeTab === 'mainloop') {
            setMainLoopBlocks((prev) => prev.filter((b) => b.id !== id));
        } else {
            setSources((prevSources) => {
                return prevSources.map((source) => {
                    if (source.id === activeSourceId) {
                        return {
                            ...source,
                            steps: source.steps.filter((b) => b.id !== id),
                        };
                    }
                    return source;
                });
            });
        }
        if (configuringBlockId === id) setConfiguringBlockId(null);
    };

    const handleAddBlock = (type: BlockType, label: string, initialConfig: any = {}) => {
        const newBlock: BlockData = {
            id: `step-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            type,
            label,
            config: initialConfig,
        };

        if (activeTab === 'mainloop') {
            setMainLoopBlocks((prev) => [...prev, newBlock]);
        } else {
            setSources((prevSources) => {
                return prevSources.map((source) => {
                    if (source.id === activeSourceId) {
                        return {
                            ...source,
                            steps: [...source.steps, newBlock],
                        };
                    }
                    return source;
                });
            });
        }
    };

    useImperativeHandle(ref, () => ({
        addBlock: (type: BlockType, config: any = {}) => {
            const label = PRIMITIVES.find(p => p.type === type)?.label || 'Unknown Step';
            handleAddBlock(type, label, config);
        }
    }));


    const handleAddSource = () => {
        const newSource: SourceData = {
            id: `source-${Date.now()}`,
            url: '',
            label: `Source ${sources.length + 1}`,
            steps: [],
            loopConfig: {
                enabled: false,
                maxIterations: 10,
                waitBetweenIterations: 1000,
            },
        };
        setSources((prev) => [...prev, newSource]);
        setActiveSourceId(newSource.id);
        setActiveTab('sources');
    };

    const handleRemoveSource = (id: string) => {
        if (sources.length <= 1) {
            // Don't allow removing the last source
            return;
        }
        setSources((prev) => {
            const filtered = prev.filter((s) => s.id !== id);
            if (activeSourceId === id && filtered.length > 0) {
                setActiveSourceId(filtered[0].id);
            }
            return filtered;
        });
    };

    // Configuration Handler
    const handleConfigChange = (id: string, newConfig: any) => {
        if (activeTab === 'mainloop') {
            setMainLoopBlocks((prev) =>
                prev.map((block) =>
                    block.id === id ? { ...block, config: newConfig } : block
                )
            );
        } else {
            setSources((prevSources) =>
                prevSources.map((source) => {
                    if (source.id === activeSourceId) {
                        return {
                            ...source,
                            steps: source.steps.map((block) =>
                                block.id === id ? { ...block, config: newConfig } : block
                            ),
                        };
                    }
                    return source;
                })
            );
        }
    };

    const handleSourceConfigChange = (sourceId: string, updates: Partial<SourceData>) => {
        setSources((prevSources) =>
            prevSources.map((source) =>
                source.id === sourceId ? { ...source, ...updates } : source
            )
        );
    };

    const notifyWorkflowChange = (mainLoop: BlockData[], sourcesList: SourceData[]) => {
        if (onWorkflowChange) {
            // Pass the full hierarchical workflow data
            const workflowData: WorkflowData = {
                mainLoop: mainLoop.map(b => ({
                    id: b.id,
                    type: b.type,
                    label: b.label,
                    config: b.config,
                })),
                sources: sourcesList.map(source => ({
                    id: source.id,
                    url: source.url,
                    label: source.label,
                    steps: source.steps.map(s => ({
                        id: s.id,
                        type: s.type,
                        label: s.label,
                        config: s.config,
                    })),
                    loopConfig: source.loopConfig,
                })),
            };
            onWorkflowChange(workflowData);
        }
    };

    // Notify parent when workflow changes
    useEffect(() => {
        notifyWorkflowChange(mainLoopBlocks, sources);
    }, [mainLoopBlocks, sources]);

    const currentBlocks = activeTab === 'mainloop' ? mainLoopBlocks :
        sources.find(s => s.id === activeSourceId)?.steps || [];

    const activeBlock = activeId ? currentBlocks.find((b) => b.id === activeId) : null;
    const configuringBlock = configuringBlockId ? currentBlocks.find(b => b.id === configuringBlockId) : null;
    const configuringSource = configuringSourceId ? sources.find(s => s.id === configuringSourceId) : null;

    const renderConfigContent = (block: BlockData) => {
        switch (block.type) {
            case 'select': return <SelectConfig block={block} onChange={handleConfigChange} />;
            case 'extract': return <ExtractConfig block={block} onChange={handleConfigChange} />;
            case 'source': return <SourceConfig block={block} onChange={handleConfigChange} />;
            case 'click': return <ClickConfig block={block} onChange={handleConfigChange} />;
            case 'pagination': return <PaginationConfig block={block} onChange={handleConfigChange} />;
            case 'remove_element': return <RemoveElementConfig block={block} onChange={handleConfigChange} />;
            case 'mainloop': return <div className="p-4 text-white/50">Main loop configuration will be available here.</div>;
            default: return <div className="p-4 text-white/50">No configuration available for this step type.</div>;

        }
    };

    const renderSourceConfig = (source: SourceData) => {
        return (
            <div className="space-y-4 pt-4">
                <div className="space-y-2">
                    <Label htmlFor="source-url">Source URL</Label>
                    <Input
                        id="source-url"
                        placeholder="e.g. https://example.com/page"
                        value={source.url}
                        onChange={(e) => handleSourceConfigChange(source.id, { url: e.target.value })}
                    />
                </div>
                <div className="space-y-2">
                    <Label htmlFor="source-label">Label</Label>
                    <Input
                        id="source-label"
                        placeholder="e.g. Source 1"
                        value={source.label}
                        onChange={(e) => handleSourceConfigChange(source.id, { label: e.target.value })}
                    />
                </div>
                <div className="space-y-3 pt-2 border-t border-white/10">
                    <div className="flex items-center justify-between">
                        <Label htmlFor="loop-enabled">Enable Loop</Label>
                        <Switch
                            id="loop-enabled"
                            checked={source.loopConfig?.enabled || false}
                            onCheckedChange={(checked) => handleSourceConfigChange(source.id, {
                                loopConfig: { ...source.loopConfig, enabled: checked }
                            })}
                        />
                    </div>
                    {source.loopConfig?.enabled && (
                        <>
                            <div className="space-y-2">
                                <Label htmlFor="max-iterations">Max Iterations</Label>
                                <Input
                                    id="max-iterations"
                                    type="number"
                                    placeholder="10"
                                    value={source.loopConfig?.maxIterations || 10}
                                    onChange={(e) => handleSourceConfigChange(source.id, {
                                        loopConfig: {
                                            enabled: source.loopConfig?.enabled || false,
                                            maxIterations: parseInt(e.target.value) || 10,
                                            waitBetweenIterations: source.loopConfig?.waitBetweenIterations || 1000
                                        }
                                    })}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="wait-between">Wait Between Iterations (ms)</Label>
                                <Input
                                    id="wait-between"
                                    type="number"
                                    placeholder="1000"
                                    value={source.loopConfig?.waitBetweenIterations || 1000}
                                    onChange={(e) => handleSourceConfigChange(source.id, {
                                        loopConfig: {
                                            enabled: source.loopConfig?.enabled || false,
                                            maxIterations: source.loopConfig?.maxIterations || 10,
                                            waitBetweenIterations: parseInt(e.target.value) || 1000
                                        }
                                    })}
                                />
                            </div>
                        </>
                    )}
                </div>
            </div>
        );
    };

    return (
        <DndContext
            id={dndContextId}
            sensors={sensors}
            collisionDetection={closestCorners}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            onDragCancel={handleDragCancel}
            modifiers={[restrictToVerticalAxis]}
        >
            <aside className="w-full h-full flex flex-col border-l border-white/10 bg-black/30 backdrop-blur-sm overflow-hidden">
                {/* Header */}
                <div className="p-4 border-b border-white/10 shrink-0">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 text-sm font-medium text-white/70">
                            <Workflow className="w-4 h-4" />
                            <span>Scraping Workflow</span>
                        </div>
                        {pageType && (
                            <div className="text-xs px-2 py-1 rounded bg-white/10 text-white/60">
                                {pageType.requiresPlaywright ? 'Playwright' : 'Scrapy'}
                            </div>
                        )}
                    </div>
                </div>



                {/* Tabs for Main Loop and Sources */}
                <div className="flex-1 flex flex-col overflow-hidden min-h-0">
                    <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'mainloop' | 'sources')} className="flex-1 flex flex-col min-h-0 overflow-hidden">
                        <div className="px-4 pt-4 border-b border-white/10">
                            <TabsList className="bg-transparent border-0 p-0 h-auto">
                                <TabsTrigger
                                    value="mainloop"
                                    className="data-[state=active]:bg-white/10 data-[state=active]:text-white text-white/60"
                                >
                                    Main Loop
                                </TabsTrigger>
                                <TabsTrigger
                                    value="sources"
                                    className="data-[state=active]:bg-white/10 data-[state=active]:text-white text-white/60"
                                >
                                    Sources
                                </TabsTrigger>
                            </TabsList>
                        </div>

                        {/* Primitives Palette for Steps */}
                        <div className="p-4 border-b border-white/10 bg-white/5 shrink-0">
                            <h3 className="text-xs font-semibold text-white/50 uppercase tracking-wider mb-3">
                                Add Step
                            </h3>
                            <div className="flex flex-wrap gap-2">
                                {PRIMITIVES.map((prim) => {
                                    const Icon = BLOCK_ICONS[prim.type] || MousePointer2;
                                    return (
                                        <button
                                            key={prim.type}
                                            onClick={() => handleAddBlock(prim.type, prim.label)}
                                            className="flex items-center gap-2 px-3 py-2 rounded-lg border border-white/10 bg-zinc-900/50 hover:bg-zinc-800 hover:border-purple-500/50 transition-all group"
                                        >
                                            <Icon className="w-4 h-4 text-zinc-400 group-hover:text-purple-400" />
                                            <span className="text-xs text-zinc-400 group-hover:text-white font-medium">
                                                {prim.label}
                                            </span>
                                            <Plus className="w-3 h-3 text-zinc-500 group-hover:text-purple-400" />
                                        </button>
                                    );
                                })}
                                {activeTab === 'mainloop' && (
                                    <button
                                        onClick={() => handleAddBlock('source', 'Source')}
                                        className="flex items-center gap-2 px-3 py-2 rounded-lg border border-white/10 bg-zinc-900/50 hover:bg-zinc-800 hover:border-purple-500/50 transition-all group"
                                    >
                                        <Globe className="w-4 h-4 text-zinc-400 group-hover:text-purple-400" />
                                        <span className="text-xs text-zinc-400 group-hover:text-white font-medium">
                                            Source
                                        </span>
                                        <Plus className="w-3 h-3 text-zinc-500 group-hover:text-purple-400" />
                                    </button>
                                )}
                            </div>
                        </div>

                        {/* Main Loop Content */}
                        <TabsContent value="mainloop" className="flex-1 flex flex-col overflow-hidden m-0 min-h-0">
                            <div className="p-4 border-b border-white/10 shrink-0">
                                <h3 className="text-xs font-semibold text-white/50 uppercase tracking-wider flex items-center justify-between">
                                    <span>Main Loop Steps</span>
                                    <span className="text-[10px] bg-white/10 px-1.5 py-0.5 rounded text-white/40">
                                        {mainLoopBlocks.length}
                                    </span>
                                </h3>
                            </div>

                            <div className="flex-1 overflow-auto p-4 min-h-0">
                                <SortableContext
                                    items={mainLoopBlocks}
                                    strategy={verticalListSortingStrategy}
                                >
                                    <div className="space-y-2 relative pb-2">
                                        {mainLoopBlocks.length > 1 && (
                                            <div
                                                className="absolute left-16 top-7 bottom-7 w-0.5 bg-gradient-to-b from-purple-500/50 via-purple-500/20 to-purple-500/5 -z-10"
                                            />
                                        )}

                                        {mainLoopBlocks.map((block) => (
                                            <SortableBlock
                                                key={block.id}
                                                block={block}
                                                onRemove={handleRemoveBlock}
                                                onConfigure={setConfiguringBlockId}
                                            />
                                        ))}

                                        {mainLoopBlocks.length === 0 && (
                                            <div className="text-center py-12 border-2 border-dashed border-white/10 rounded-lg">
                                                <p className="text-sm text-white/30">
                                                    Add steps to main loop
                                                </p>
                                            </div>
                                        )}
                                    </div>
                                </SortableContext>
                            </div>
                        </TabsContent>

                        {/* Sources Content */}
                        <TabsContent value="sources" className="flex-1 flex flex-col overflow-hidden m-0 min-h-0">
                            {/* Source List */}
                            <div className="p-4 border-b border-white/10 shrink-0">
                                <div className="flex items-center justify-between mb-3">
                                    <h3 className="text-xs font-semibold text-white/50 uppercase tracking-wider">
                                        Sources ({sources.length})
                                    </h3>
                                    <button
                                        onClick={handleAddSource}
                                        className="text-xs px-2 py-1 rounded bg-purple-500/20 text-purple-300 hover:bg-purple-500/30 transition-colors flex items-center gap-1"
                                    >
                                        <Plus className="w-3 h-3" />
                                        Add Source
                                    </button>
                                </div>
                                <div className="space-y-2">
                                    {sources.map((source) => (
                                        <div
                                            key={source.id}
                                            onClick={() => {
                                                setActiveSourceId(source.id);
                                            }}
                                            className={cn(
                                                "w-full text-left px-3 py-2 rounded-lg border transition-all cursor-pointer",
                                                activeSourceId === source.id
                                                    ? "bg-purple-500/20 border-purple-500/50"
                                                    : "bg-zinc-900/50 border-white/10 hover:border-white/20"
                                            )}
                                        >
                                            <div className="flex items-center justify-between">
                                                <div className="flex-1 min-w-0">
                                                    <div className="text-sm font-medium text-white truncate">
                                                        {source.label}
                                                    </div>
                                                    <div className="text-xs text-white/40 truncate font-mono">
                                                        {source.url || 'No URL'}
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-1">
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            setConfiguringSourceId(source.id);
                                                        }}
                                                        className="p-1 text-white/20 hover:text-purple-400 transition-colors"
                                                        aria-label="Configure source"
                                                    >
                                                        <Settings className="w-3.5 h-3.5" />
                                                    </button>
                                                    {sources.length > 1 && (
                                                        <button
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                handleRemoveSource(source.id);
                                                            }}
                                                            className="p-1 text-white/20 hover:text-red-400 transition-colors"
                                                            aria-label="Remove source"
                                                        >
                                                            <Trash2 className="w-3.5 h-3.5" />
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Selected Source Steps */}
                            <div className="flex-1 overflow-auto p-4 min-h-0">
                                <h3 className="text-xs font-semibold text-white/50 uppercase tracking-wider mb-3 flex items-center justify-between">
                                    <span>{sources.find(s => s.id === activeSourceId)?.label || 'Source'} Steps</span>
                                    <span className="text-[10px] bg-white/10 px-1.5 py-0.5 rounded text-white/40">
                                        {sources.find(s => s.id === activeSourceId)?.steps.length || 0}
                                    </span>
                                </h3>

                                <SortableContext
                                    items={currentBlocks.map(b => b.id)}
                                    strategy={verticalListSortingStrategy}
                                >
                                    <div className="space-y-2 relative pb-2">
                                        {currentBlocks.length > 1 && (
                                            <div
                                                className="absolute left-16 top-7 bottom-7 w-0.5 bg-gradient-to-b from-purple-500/50 via-purple-500/20 to-purple-500/5 -z-10"
                                            />
                                        )}

                                        {currentBlocks.map((block) => (
                                            <SortableBlock
                                                key={block.id}
                                                block={block}
                                                onRemove={handleRemoveBlock}
                                                onConfigure={setConfiguringBlockId}
                                            />
                                        ))}

                                        {currentBlocks.length === 0 && (
                                            <div className="text-center py-12 border-2 border-dashed border-white/10 rounded-lg">
                                                <p className="text-sm text-white/30">
                                                    Add steps to this source
                                                </p>
                                            </div>
                                        )}
                                    </div>
                                </SortableContext>
                            </div>
                        </TabsContent>
                    </Tabs>
                </div>
            </aside>

            {/* Drag Overlay */}
            <DragOverlay dropAnimation={null}>
                {activeBlock ? (
                    <div className={cn(
                        "flex items-center gap-3 p-3 rounded-lg border bg-zinc-900 shadow-2xl",
                        activeBlock.type === 'source'
                            ? "border-lime-500"
                            : "border-purple-500"
                    )}>
                        <GripVertical className="w-4 h-4 text-white/30" />
                        <div className={cn(
                            "p-2 rounded-md",
                            activeBlock.type === 'source'
                                ? "bg-lime-500/10 text-lime-400"
                                : "bg-purple-500/10 text-purple-400"
                        )}>
                            {(() => {
                                const Icon = BLOCK_ICONS[activeBlock.type] || MousePointer2;
                                return <Icon className="w-4 h-4" />;
                            })()}
                        </div>
                        <div className="text-sm font-medium text-white">{activeBlock.label}</div>
                    </div>
                ) : null}
            </DragOverlay>

            {/* Block Configuration Dialog */}
            <Dialog open={!!configuringBlockId} onOpenChange={(open) => !open && setConfiguringBlockId(null)}>
                <DialogContent className="sm:max-w-md bg-zinc-950 border-white/10 text-white">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            {configuringBlock && (() => {
                                const Icon = BLOCK_ICONS[configuringBlock.type] || MousePointer2;
                                return <Icon className="w-5 h-5 text-purple-400" />;
                            })()}
                            Configure {configuringBlock?.label}
                        </DialogTitle>
                        <DialogDescription>
                            Configure the parameters for this scraping step.
                        </DialogDescription>
                    </DialogHeader>

                    {configuringBlock && renderConfigContent(configuringBlock)}

                </DialogContent>
            </Dialog>

            {/* Source Configuration Dialog */}
            <Dialog open={!!configuringSourceId} onOpenChange={(open) => !open && setConfiguringSourceId(null)}>
                <DialogContent className="sm:max-w-md bg-zinc-950 border-white/10 text-white">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <Globe className="w-5 h-5 text-purple-400" />
                            Configure {configuringSource?.label || 'Source'}
                        </DialogTitle>
                        <DialogDescription>
                            Configure the source URL and loop settings.
                        </DialogDescription>
                    </DialogHeader>

                    {configuringSource && renderSourceConfig(configuringSource)}

                </DialogContent>
            </Dialog>

        </DndContext>
    );
});

SimulatorSidebar.displayName = 'SimulatorSidebar';

