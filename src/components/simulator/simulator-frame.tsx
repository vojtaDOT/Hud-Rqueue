'use client';

import { useState, useRef, useEffect, useCallback, useMemo, type ReactNode } from 'react';
import { Loader2, Globe, MousePointer2, X, RefreshCw, Zap, Eraser, Search, ChevronRight, ChevronDown, Sparkles } from 'lucide-react';

import { cn } from '@/lib/utils';
import { PageType, ElementSelector } from '@/lib/crawler-types';
import type { SidebarQuickAction } from '@/components/simulator/simulator-sidebar';

interface SimulatorFrameProps {
    url: string;
    onLoad?: () => void;
    loading?: boolean;
    className?: string;
    onElementSelect?: (selector: string, elementInfo?: ElementSelector) => void;
    onPageTypeDetected?: (pageType: PageType) => void;
    onElementRemove?: (selector: string) => void;
    onQuickAction?: (action: SidebarQuickAction, selector: string, elementInfo?: ElementSelector) => void;
    playwrightEnabled?: boolean;
    onPlaywrightToggleRequest?: (nextEnabled: boolean) => boolean;
    highlightSelector?: string | null;
}


interface ElementInfo {
    selector: string;
    localSelector?: string;
    framePath?: string[];
    inIframe?: boolean;
    tagName: string;
    textContent: string;
    isList: boolean;
    listItemCount?: number;
    parentSelector?: string;
}

type RenderMode = 'proxy' | 'playwright' | 'loading';

interface InspectorNode {
    nodeId: string;
    parentId: string | null;
    tag: string;
    text: string;
    selector: string;
    hasChildren: boolean;
    badges: string[];
    framePath?: string[];
    attrs?: {
        id?: string;
        className?: string;
    };
}

interface SelectorSuggestion {
    kind: 'stable' | 'scoped' | 'strict';
    selector: string;
    score: number;
    matches: number;
}

export function SimulatorFrame({
    url,
    onLoad,
    loading = false,
    className,
    onElementSelect,
    onPageTypeDetected,
    onElementRemove,
    onQuickAction,
    playwrightEnabled = false,
    onPlaywrightToggleRequest,
    highlightSelector = null,
}: SimulatorFrameProps) {

    const [iframeLoaded, setIframeLoaded] = useState(false);
    const [interactionMode, setInteractionMode] = useState<'select' | 'remove' | null>(null);
    const [selectedElement, setSelectedElement] = useState<ElementInfo | null>(null);
    const [pageType, setPageType] = useState<PageType | null>(null);
    const [renderMode, setRenderMode] = useState<RenderMode>(playwrightEnabled ? 'playwright' : 'proxy');
    const [loadError, setLoadError] = useState<string | null>(null);
    const [retryCount, setRetryCount] = useState(0);
    const [reloadKey, setReloadKey] = useState(0);
    const [inspectorOpen, setInspectorOpen] = useState(false);
    const [inspectorWidth, setInspectorWidth] = useState(340);
    const [inspectorSearch, setInspectorSearch] = useState('');
    const [inspectorNodes, setInspectorNodes] = useState<InspectorNode[]>([]);
    const [expandedNodeIds, setExpandedNodeIds] = useState<Set<string>>(() => new Set());
    const [selectedInspectorNodeId, setSelectedInspectorNodeId] = useState<string | null>(null);
    const [selectorSuggestions, setSelectorSuggestions] = useState<SelectorSuggestion[]>([]);

    const iframeRef = useRef<HTMLIFrameElement>(null);
    const loadTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const iframeLoadedRef = useRef(false);
    const resizeStateRef = useRef<{ active: boolean; startX: number; startWidth: number }>({
        active: false,
        startX: 0,
        startWidth: 340,
    });

    const isValidUrl = url.startsWith('http://') || url.startsWith('https://');
    const iframeAttemptKey = `${url}|${renderMode}|${retryCount}|${reloadKey}`;

    useEffect(() => {
        iframeLoadedRef.current = iframeLoaded;
    }, [iframeLoaded]);

    // Generate URL based on render mode
    const getIframeSrc = useCallback(() => {
        if (!isValidUrl) return '';
        if (renderMode === 'playwright') {
            return `/api/render?url=${encodeURIComponent(url)}`;
        }
        return `/api/proxy?url=${encodeURIComponent(url)}`;
    }, [isValidUrl, url, renderMode]);

    const handleLoad = useCallback(() => {
        // Clear any pending timeout
        if (loadTimeoutRef.current) {
            clearTimeout(loadTimeoutRef.current);
            loadTimeoutRef.current = null;
        }
        setIframeLoaded(true);
        onLoad?.();
    }, [onLoad]);

    const switchToPlaywright = useCallback(() => {
        const accepted = onPlaywrightToggleRequest ? onPlaywrightToggleRequest(true) : true;
        if (!accepted) return;
        console.log('[SimulatorFrame] Switching to Playwright mode');
        setRenderMode('playwright');
        setIframeLoaded(false);
        setLoadError(null);
    }, [onPlaywrightToggleRequest]);

    const retryWithProxy = useCallback(() => {
        const accepted = onPlaywrightToggleRequest ? onPlaywrightToggleRequest(false) : true;
        if (!accepted) return;
        console.log('[SimulatorFrame] Retrying with proxy');
        setRenderMode('proxy');
        setIframeLoaded(false);
        setLoadError(null);
        setRetryCount(prev => prev + 1);
    }, [onPlaywrightToggleRequest]);

    const handleReload = useCallback(() => {
        setReloadKey(prev => prev + 1);
        setIframeLoaded(false);
        setLoadError(null);
        setInspectorNodes([]);
        setExpandedNodeIds(new Set());
        setSelectedInspectorNodeId(null);
        setSelectorSuggestions([]);
    }, []);

    const mergeInspectorNodes = useCallback((nextNodes: InspectorNode[]) => {
        if (!nextNodes || nextNodes.length < 1) return;
        setInspectorNodes((prev) => {
            const map = new Map(prev.map((node) => [node.nodeId, node]));
            nextNodes.forEach((node) => {
                map.set(node.nodeId, node);
            });
            return Array.from(map.values());
        });
    }, []);

    const requestInspectorInit = useCallback(() => {
        iframeRef.current?.contentWindow?.postMessage({ type: 'inspector:init' }, '*');
    }, []);

    const requestInspectorChildren = useCallback((nodeId: string) => {
        iframeRef.current?.contentWindow?.postMessage({ type: 'inspector:request-children', nodeId }, '*');
    }, []);

    const requestSelectorSuggestions = useCallback((nodeId: string) => {
        iframeRef.current?.contentWindow?.postMessage({ type: 'selector:suggestions', nodeId }, '*');
    }, []);

    const requestInspectorHover = useCallback((selector: string | null) => {
        if (!iframeRef.current?.contentWindow) return;
        if (!selector) {
            iframeRef.current.contentWindow.postMessage({ type: 'inspector:hover', selector: null }, '*');
            return;
        }
        iframeRef.current.contentWindow.postMessage({ type: 'inspector:hover', selector }, '*');
    }, []);

    const requestInspectorSelect = useCallback((nodeId: string) => {
        iframeRef.current?.contentWindow?.postMessage({ type: 'inspector:select', nodeId }, '*');
    }, []);

    const handleQuickActionClick = useCallback((action: SidebarQuickAction) => {
        if (!selectedElement) return;
        const selectorInfo: ElementSelector = {
            selector: selectedElement.selector,
            localSelector: selectedElement.localSelector,
            framePath: selectedElement.framePath,
            inIframe: selectedElement.inIframe,
            tagName: selectedElement.tagName,
            textContent: selectedElement.textContent,
            isList: selectedElement.isList,
            listItemCount: selectedElement.listItemCount,
            parentSelector: selectedElement.parentSelector,
        };
        onQuickAction?.(action, selectedElement.localSelector ?? selectedElement.selector, selectorInfo);
    }, [onQuickAction, selectedElement]);

    const handleInspectorResizeStart = useCallback((event: { clientX: number }) => {
        resizeStateRef.current = {
            active: true,
            startX: event.clientX,
            startWidth: inspectorWidth,
        };
    }, [inspectorWidth]);

    useEffect(() => {
        const onMove = (event: MouseEvent) => {
            if (!resizeStateRef.current.active) return;
            const delta = event.clientX - resizeStateRef.current.startX;
            const nextWidth = Math.max(260, Math.min(600, resizeStateRef.current.startWidth + delta));
            setInspectorWidth(nextWidth);
        };
        const onUp = () => {
            if (!resizeStateRef.current.active) return;
            resizeStateRef.current.active = false;
        };
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
        return () => {
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('mouseup', onUp);
        };
    }, []);


    // Handle messages from iframe
    useEffect(() => {
        const handleMessage = (event: MessageEvent) => {
            // Handle element selection
            if (event.data.type === 'element-select') {
                const elementInfo = event.data.elementInfo as ElementInfo;

                if (interactionMode === 'remove') {
                    // Immediate removal mode
                    iframeRef.current?.contentWindow?.postMessage({
                        type: 'remove-element',
                        selector: elementInfo.selector,
                        localSelector: elementInfo.localSelector,
                        framePath: elementInfo.framePath,
                    }, '*');
                    onElementRemove?.(elementInfo.localSelector ?? elementInfo.selector);
                    setInteractionMode(null);
                    // Don't select it
                    return;
                }

                // Default selection mode
                setSelectedElement(elementInfo);

                const selectorInfo: ElementSelector = {
                    selector: elementInfo.selector,
                    localSelector: elementInfo.localSelector,
                    framePath: elementInfo.framePath,
                    inIframe: elementInfo.inIframe,
                    tagName: elementInfo.tagName,
                    textContent: elementInfo.textContent,
                    isList: elementInfo.isList,
                    listItemCount: elementInfo.listItemCount,
                    parentSelector: elementInfo.parentSelector
                };

                onElementSelect?.(elementInfo.selector, selectorInfo);
                setInteractionMode(null);
            }

            // Handle page type detection
            else if (event.data.type === 'page-type-detected') {
                const detectedPageType = event.data.pageType as PageType;
                setPageType(detectedPageType);
                onPageTypeDetected?.(detectedPageType);
            }
            // Handle proxy success
            else if (event.data.type === 'proxy-loaded') {
                console.log('[SimulatorFrame] Proxy loaded successfully:', event.data.url);
                setLoadError(null);
            }
            // Handle Playwright success
            else if (event.data.type === 'playwright-loaded') {
                console.log('[SimulatorFrame] Playwright loaded successfully:', event.data.url);
                setLoadError(null);
            }
            else if (event.data.type === 'playwright-error') {
                console.warn('[SimulatorFrame] Playwright render error:', event.data.message);
                setLoadError(event.data.message ?? 'Playwright render selhal.');
                setIframeLoaded(true);
                onLoad?.();
            }
            // Handle proxy error without automatic mode switching
            else if (event.data.type === 'proxy-error') {
                console.log('[SimulatorFrame] Proxy error:', event.data.message);
                setLoadError(event.data.message ?? 'Proxy načtení selhalo.');
            }
            else if (event.data.type === 'inspector:children') {
                const nodes = Array.isArray(event.data.nodes) ? event.data.nodes as InspectorNode[] : [];
                mergeInspectorNodes(nodes);
            }
            else if (event.data.type === 'selector:suggestions') {
                const nextSuggestions = Array.isArray(event.data.suggestions) ? event.data.suggestions as SelectorSuggestion[] : [];
                setSelectorSuggestions(nextSuggestions);
            }
            else if (event.data.type === 'inspector:select') {
                const elementInfo = event.data.elementInfo as ElementInfo | undefined;
                if (!elementInfo) return;
                setSelectedElement(elementInfo);
                const selectorInfo: ElementSelector = {
                    selector: elementInfo.selector,
                    localSelector: elementInfo.localSelector,
                    framePath: elementInfo.framePath,
                    inIframe: elementInfo.inIframe,
                    tagName: elementInfo.tagName,
                    textContent: elementInfo.textContent,
                    isList: elementInfo.isList,
                    listItemCount: elementInfo.listItemCount,
                    parentSelector: elementInfo.parentSelector,
                };
                onElementSelect?.(elementInfo.selector, selectorInfo);
            }
        };

        window.addEventListener('message', handleMessage);
        return () => window.removeEventListener('message', handleMessage);
    }, [interactionMode, mergeInspectorNodes, onElementRemove, onElementSelect, onLoad, onPageTypeDetected]);

    // Enable/disable selection mode in iframe
    useEffect(() => {
        const iframe = iframeRef.current;
        if (!iframe || !iframe.contentWindow || !iframeLoaded) return;

        setTimeout(() => {
            try {
                // Ensure selection mode is synced
                // We enable selection for both modes, but handle the result differently

                iframe.contentWindow?.postMessage(
                    interactionMode !== null
                        ? { type: 'enable-selection', mode: interactionMode }
                        : { type: 'disable-selection' },
                    '*'
                );
            } catch (error) {
                console.warn('Could not communicate with iframe:', error);
            }
        }, 100);
    }, [interactionMode, iframeLoaded]);

    const resetFrameState = useCallback(() => {
        setSelectedElement(null);
        setPageType(null);
        setIframeLoaded(false);
        setLoadError(null);
        setRenderMode(playwrightEnabled ? 'playwright' : 'proxy');
        setRetryCount(0);
        setInspectorNodes([]);
        setExpandedNodeIds(new Set());
        setSelectedInspectorNodeId(null);
        setSelectorSuggestions([]);
    }, [playwrightEnabled]);

    // Reset state when URL changes
    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        resetFrameState();

        if (loadTimeoutRef.current) {
            clearTimeout(loadTimeoutRef.current);
            loadTimeoutRef.current = null;
        }
    }, [url, resetFrameState]);

    // Load watchdog for each iframe attempt (url/mode/retry/reload)
    useEffect(() => {
        if (loadTimeoutRef.current) {
            clearTimeout(loadTimeoutRef.current);
            loadTimeoutRef.current = null;
        }
        if (isValidUrl) {
            loadTimeoutRef.current = setTimeout(() => {
                if (iframeLoadedRef.current) return;

                if (renderMode === 'playwright') {
                    console.warn('[SimulatorFrame] Playwright load timeout');
                    setLoadError('Playwright render timeout (20s). Zkuste Načíst znovu nebo Zkusit proxy.');
                } else {
                    console.warn('[SimulatorFrame] Proxy load timeout');
                    setLoadError('Proxy load timeout (20s). Zkuste Playwright nebo Načíst znovu.');
                }
                setIframeLoaded(true);
                onLoad?.();
            }, 20000);
        }

        return () => {
            if (loadTimeoutRef.current) {
                clearTimeout(loadTimeoutRef.current);
                loadTimeoutRef.current = null;
            }
        };
    }, [iframeAttemptKey, isValidUrl, onLoad, renderMode]);

    useEffect(() => {
        if (!iframeLoaded || !iframeRef.current?.contentWindow) return;
        if (highlightSelector && highlightSelector.trim()) {
            iframeRef.current.contentWindow.postMessage({
                type: 'highlight-selector',
                selector: highlightSelector,
            }, '*');
            return;
        }
        iframeRef.current.contentWindow.postMessage({ type: 'clear-highlight-selector' }, '*');
    }, [highlightSelector, iframeLoaded]);

    useEffect(() => {
        if (!inspectorOpen || !iframeLoaded) return;
        requestInspectorInit();
    }, [iframeLoaded, inspectorOpen, requestInspectorInit]);

    const handleClearSelection = () => {
        setSelectedElement(null);
    };

    const handleRemoveElement = () => {
        if (!selectedElement || !iframeRef.current?.contentWindow) return;

        iframeRef.current.contentWindow.postMessage({
            type: 'remove-element',
            selector: selectedElement.selector,
            localSelector: selectedElement.localSelector,
            framePath: selectedElement.framePath,
        }, '*');

        onElementRemove?.(selectedElement.localSelector ?? selectedElement.selector);

        setSelectedElement(null);
    };

    const iframeSrc = getIframeSrc();
    const nodesById = useMemo(() => new Map(inspectorNodes.map((node) => [node.nodeId, node])), [inspectorNodes]);
    const childrenByParent = useMemo(() => {
        const map = new Map<string | null, InspectorNode[]>();
        inspectorNodes.forEach((node) => {
            const current = map.get(node.parentId) ?? [];
            current.push(node);
            map.set(node.parentId, current);
        });
        return map;
    }, [inspectorNodes]);
    const selectedInspectorNode = selectedInspectorNodeId ? nodesById.get(selectedInspectorNodeId) ?? null : null;
    const normalizedSearch = inspectorSearch.trim().toLowerCase();

    const renderInspectorTree = (parentId: string | null, depth = 0): ReactNode[] => {
        const children = childrenByParent.get(parentId) ?? [];
        return children.flatMap((node) => {
            const isExpanded = expandedNodeIds.has(node.nodeId);
            const descendants = isExpanded ? renderInspectorTree(node.nodeId, depth + 1) : [];
            const searchable = `${node.tag} ${node.attrs?.id ?? ''} ${node.attrs?.className ?? ''} ${node.text} ${node.selector}`.toLowerCase();
            const matchesSearch = normalizedSearch.length < 1 || searchable.includes(normalizedSearch);
            const hasVisibleDescendants = descendants.length > 0;
            if (!matchesSearch && normalizedSearch.length > 0 && !hasVisibleDescendants) {
                return [];
            }

            return [
                <button
                    key={node.nodeId}
                    type="button"
                    className={cn(
                        'w-full rounded-md px-2 py-1 text-left text-[11px] hover:bg-white/10',
                        selectedInspectorNodeId === node.nodeId ? 'bg-cyan-500/20 text-cyan-100' : 'text-white/80',
                    )}
                    style={{ paddingLeft: `${depth * 12 + 8}px` }}
                    onMouseEnter={() => requestInspectorHover(node.selector)}
                    onMouseLeave={() => requestInspectorHover(null)}
                    onClick={() => {
                        setSelectedInspectorNodeId(node.nodeId);
                        requestInspectorSelect(node.nodeId);
                        requestSelectorSuggestions(node.nodeId);
                    }}
                >
                    <span className="mr-1 inline-flex items-center align-middle">
                        {node.hasChildren ? (
                            <span
                                className="inline-flex h-4 w-4 items-center justify-center rounded hover:bg-white/10"
                                onClick={(event) => {
                                    event.preventDefault();
                                    event.stopPropagation();
                                    setExpandedNodeIds((prev) => {
                                        const next = new Set(prev);
                                        if (next.has(node.nodeId)) {
                                            next.delete(node.nodeId);
                                        } else {
                                            next.add(node.nodeId);
                                            requestInspectorChildren(node.nodeId);
                                        }
                                        return next;
                                    });
                                }}
                            >
                                {isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                            </span>
                        ) : (
                            <span className="inline-block h-4 w-4" />
                        )}
                    </span>
                    <span className="font-mono text-cyan-200">{node.tag}</span>
                    {node.attrs?.id && <span className="ml-1 text-purple-200">#{node.attrs.id}</span>}
                    {node.attrs?.className && <span className="ml-1 text-white/50">.{node.attrs.className}</span>}
                    {node.text && <span className="ml-2 text-white/60">{node.text}</span>}
                    {node.badges.length > 0 && (
                        <span className="ml-2 inline-flex gap-1">
                            {node.badges.slice(0, 3).map((badge) => (
                                <span key={`${node.nodeId}-${badge}`} className="rounded bg-white/10 px-1 py-0.5 text-[10px] uppercase tracking-wide">
                                    {badge}
                                </span>
                            ))}
                        </span>
                    )}
                </button>,
                ...descendants,
            ];
        });
    };


    return (
        <div className={cn("relative flex-1 bg-zinc-950 flex flex-col", className)}>
            {/* Toolbar Overlay */}
            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 flex gap-2">
                {/* Select Element Button */}
                <div className={cn(
                    "px-3 py-1.5 rounded-full bg-black/50 backdrop-blur-md border border-white/10 flex items-center gap-1 transition-all",
                    interactionMode === 'select' ? "bg-purple-500/20 border-purple-500/50" : "hover:bg-black/70"
                )}>
                    <button
                        onClick={() => setInteractionMode(interactionMode === 'select' ? null : 'select')}
                        className={cn("text-xs font-medium flex items-center gap-1.5", interactionMode === 'select' ? "text-purple-300" : "text-white/70")}
                    >
                        <MousePointer2 className="w-3.5 h-3.5" />
                        {interactionMode === 'select' ? 'Vybrat element' : 'Vybrat'}
                    </button>
                </div>

                {/* Remove Element Button */}
                <div className={cn(
                    "px-3 py-1.5 rounded-full bg-black/50 backdrop-blur-md border border-white/10 flex items-center gap-1 transition-all",
                    interactionMode === 'remove' ? "bg-red-500/20 border-red-500/50" : "hover:bg-black/70"
                )}>
                    <button
                        onClick={() => setInteractionMode(interactionMode === 'remove' ? null : 'remove')}
                        className={cn("text-xs font-medium flex items-center gap-1.5", interactionMode === 'remove' ? "text-red-300" : "text-white/70")}
                    >
                        <Eraser className="w-3.5 h-3.5" />
                        {interactionMode === 'remove' ? 'Odebrat element' : 'Odebrat'}
                    </button>
                </div>

                <div className={cn(
                    "px-3 py-1.5 rounded-full bg-black/50 backdrop-blur-md border border-white/10 flex items-center gap-1 transition-all",
                    inspectorOpen ? "bg-cyan-500/20 border-cyan-500/50" : "hover:bg-black/70",
                )}>
                    <button
                        onClick={() => {
                            setInspectorOpen((prev) => !prev);
                            if (!inspectorOpen) {
                                requestInspectorInit();
                            }
                        }}
                        className={cn("text-xs font-medium flex items-center gap-1.5", inspectorOpen ? "text-cyan-200" : "text-white/70")}
                    >
                        <Search className="w-3.5 h-3.5" />
                        Lupa
                    </button>
                </div>

                {/* Reload Button */}
                <div className="px-2 py-1.5 rounded-full bg-black/50 backdrop-blur-md border border-white/10 flex items-center transition-all hover:bg-black/70">
                    <button
                        onClick={handleReload}
                        className="text-white/70 hover:text-white transition-colors"
                        title="Načíst znovu"
                    >
                        <RefreshCw className="w-3.5 h-3.5" />
                    </button>
                </div>


                {/* Render Mode Switcher */}
                {isValidUrl && (
                    <div className="px-3 py-1.5 rounded-full bg-black/50 backdrop-blur-md border border-white/10 flex items-center gap-2">
                        <button
                            onClick={renderMode === 'proxy' ? switchToPlaywright : retryWithProxy}
                            className="text-xs font-medium flex items-center gap-1.5 text-white/70 hover:text-white transition-colors"
                            title={renderMode === 'proxy' ? 'Použít Playwright (pro složité stránky)' : 'Použít proxy (rychlejší)'}
                        >
                            {renderMode === 'playwright' ? (
                                <>
                                    <RefreshCw className="w-3.5 h-3.5" />
                                    Zkusit proxy
                                </>
                            ) : (
                                <>
                                    <Zap className="w-3.5 h-3.5" />
                                    Playwright
                                </>
                            )}
                        </button>
                    </div>
                )}
            </div>

            {/* Render Mode Badge */}
            {isValidUrl && iframeLoaded && (
                <div className="absolute top-4 left-4 z-20">
                    <div className={cn(
                        "px-2 py-1 rounded-full text-[10px] font-medium flex items-center gap-1",
                        renderMode === 'playwright'
                            ? "bg-green-500/20 text-green-400 border border-green-500/30"
                            : "bg-blue-500/20 text-blue-400 border border-blue-500/30"
                    )}>
                        {renderMode === 'playwright' ? (
                            <>
                                <Zap className="w-3 h-3" />
                                Playwright
                            </>
                        ) : (
                            <>
                                <Globe className="w-3 h-3" />
                                Proxy
                            </>
                        )}
                    </div>
                </div>
            )}

            {/* Selected Element Info Panel */}
            {selectedElement && (
                <div className="absolute top-16 left-1/2 -translate-x-1/2 z-20 bg-black/90 backdrop-blur-md border border-purple-500/50 rounded-lg p-4 max-w-md shadow-xl">
                    <div className="flex items-start justify-between gap-4 mb-2">
                        <div className="flex-1">
                            <div className="text-xs text-purple-300 mb-1">Vybraný element</div>
                            <div className="text-sm font-mono text-white/90 break-all mb-2">
                                {selectedElement.selector}
                            </div>
                            {selectedElement.isList && (
                                <div className="text-xs text-purple-200 bg-purple-500/20 px-2 py-1 rounded inline-block">
                                    Seznam ({selectedElement.listItemCount} položek)
                                </div>
                            )}
                        </div>
                        <button
                            onClick={handleRemoveElement}
                            className="text-white/50 hover:text-red-400 transition-colors mr-2"
                            title="Odstranit element z DOM"
                        >
                            <Eraser className="w-4 h-4" />
                        </button>
                        <button
                            onClick={handleClearSelection}
                            className="text-white/50 hover:text-white transition-colors"
                        >
                            <X className="w-4 h-4" />
                        </button>


                    </div>
                    <div className="text-xs text-white/60 mt-2 pt-2 border-t border-white/10">
                        <div>Tag: <span className="text-white/80">{selectedElement.tagName}</span></div>
                        {selectedElement.textContent && (
                            <div className="mt-1 truncate">
                                Text: <span className="text-white/80">{selectedElement.textContent}</span>
                            </div>
                        )}
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-1">
                        <button className="rounded bg-white/10 px-2 py-1 text-[11px] text-white/80 hover:bg-white/20" onClick={() => handleQuickActionClick('scope')}>Pouzit jako Scope</button>
                        <button className="rounded bg-white/10 px-2 py-1 text-[11px] text-white/80 hover:bg-white/20" onClick={() => handleQuickActionClick('repeater')}>Pouzit jako Repeater</button>
                        <button className="rounded bg-cyan-500/20 px-2 py-1 text-[11px] text-cyan-100 hover:bg-cyan-500/30" onClick={() => handleQuickActionClick('source_url')}>Pouzit jako Source URL</button>
                        <button className="rounded bg-sky-500/20 px-2 py-1 text-[11px] text-sky-100 hover:bg-sky-500/30" onClick={() => handleQuickActionClick('document_url')}>Pouzit jako Document URL</button>
                        <button className="rounded bg-emerald-500/20 px-2 py-1 text-[11px] text-emerald-100 hover:bg-emerald-500/30" onClick={() => handleQuickActionClick('download_url')}>Pouzit jako Download URL</button>
                        <button className="rounded bg-emerald-500/20 px-2 py-1 text-[11px] text-emerald-100 hover:bg-emerald-500/30" onClick={() => handleQuickActionClick('filename_selector')}>Pouzit jako Filename</button>
                        <button className="rounded bg-red-500/20 px-2 py-1 text-[11px] text-red-100 hover:bg-red-500/30" onClick={() => handleQuickActionClick('pagination')}>Pouzit jako Pagination</button>
                        <button className="rounded bg-purple-500/20 px-2 py-1 text-[11px] text-purple-100 hover:bg-purple-500/30" onClick={() => handleQuickActionClick('auto_scaffold')}>Auto Scaffold</button>
                    </div>
                </div>
            )}

            {isValidUrl ? (
                <div className="relative w-full h-full">
                    {inspectorOpen && (
                        <div
                            className="absolute left-0 top-0 bottom-0 z-20 border-r border-white/10 bg-black/85 backdrop-blur-md"
                            style={{ width: inspectorWidth }}
                        >
                            <div className="border-b border-white/10 p-2">
                                <div className="mb-2 flex items-center justify-between">
                                    <div className="text-xs font-semibold uppercase tracking-wide text-cyan-200">DOM Inspector</div>
                                    <button
                                        className="text-white/50 hover:text-white"
                                        onClick={() => setInspectorOpen(false)}
                                    >
                                        <X className="h-3.5 w-3.5" />
                                    </button>
                                </div>
                                <div className="relative">
                                    <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/40" />
                                    <input
                                        value={inspectorSearch}
                                        onChange={(event) => setInspectorSearch(event.target.value)}
                                        placeholder="Hledat tag/text/selector..."
                                        className="h-8 w-full rounded border border-white/10 bg-black/40 pl-7 pr-2 text-xs text-white placeholder:text-white/40"
                                    />
                                </div>
                            </div>

                            <div className="flex h-[calc(100%-48px)] flex-col">
                                <div className="min-h-0 flex-1 overflow-auto p-2">
                                    {renderInspectorTree(null)}
                                </div>
                                <div className="border-t border-white/10 p-2">
                                    <div className="mb-1 text-[10px] uppercase tracking-wide text-white/50">Selector Suggestions</div>
                                    {selectedInspectorNode ? (
                                        <div className="space-y-1">
                                            {(selectorSuggestions.length > 0 ? selectorSuggestions : [{ kind: 'stable', selector: selectedInspectorNode.selector, score: 1, matches: 1 }]).map((item) => (
                                                <button
                                                    key={`${item.kind}-${item.selector}`}
                                                    type="button"
                                                    className="w-full rounded border border-white/10 bg-black/30 px-2 py-1 text-left hover:bg-white/10"
                                                    onMouseEnter={() => requestInspectorHover(item.selector)}
                                                    onMouseLeave={() => requestInspectorHover(null)}
                                                    onClick={() => {
                                                        requestInspectorHover(item.selector);
                                                        onElementSelect?.(item.selector, {
                                                            selector: item.selector,
                                                            localSelector: item.selector,
                                                            framePath: selectedInspectorNode.framePath,
                                                            inIframe: Boolean(selectedInspectorNode.framePath?.length),
                                                            tagName: selectedInspectorNode.tag,
                                                            textContent: selectedInspectorNode.text,
                                                            isList: selectedInspectorNode.badges.includes('list-item'),
                                                        });
                                                    }}
                                                >
                                                    <div className="flex items-center justify-between gap-2 text-[11px]">
                                                        <span className="font-medium text-cyan-200">{item.kind}</span>
                                                        <span className="text-white/50">{Math.round(item.score * 100)}% / {item.matches}x</span>
                                                    </div>
                                                    <div className="truncate font-mono text-[11px] text-white/80">{item.selector}</div>
                                                </button>
                                            ))}
                                        </div>
                                    ) : (
                                        <div className="text-xs text-white/40">Vyber element ve stromu.</div>
                                    )}
                                    <button
                                        type="button"
                                        className="mt-2 inline-flex items-center gap-1 rounded bg-purple-500/20 px-2 py-1 text-[11px] text-purple-100 hover:bg-purple-500/30"
                                        onClick={() => handleQuickActionClick('auto_scaffold')}
                                        disabled={!selectedElement}
                                    >
                                        <Sparkles className="h-3 w-3" />
                                        Auto Scaffold
                                    </button>
                                </div>
                            </div>

                            <div
                                className="absolute right-0 top-0 h-full w-1 cursor-col-resize bg-white/10 hover:bg-cyan-500/60"
                                onMouseDown={handleInspectorResizeStart}
                            />
                        </div>
                    )}

                    {/* Page Type Indicator */}
                    {pageType && (
                        <div className="absolute top-4 right-4 z-20 bg-black/90 backdrop-blur-md border border-white/20 rounded-lg px-3 py-2 text-xs">
                            <div className="flex items-center gap-2">
                                <span className="text-white/60">Crawler:</span>
                                <span className={cn(
                                    "font-medium",
                                    pageType.requiresPlaywright ? "text-orange-400" : "text-green-400"
                                )}>
                                    {pageType.requiresPlaywright ? 'Playwright' : 'Scrapy'}
                                </span>
                                <span className="text-white/40">•</span>
                                <span className="text-white/60 capitalize">{pageType.framework}</span>
                            </div>
                        </div>
                    )}

                    {/* Loading Overlay */}
                    {(loading || !iframeLoaded) && (
                        <div className="absolute inset-0 flex items-center justify-center bg-zinc-950 z-10 transition-opacity duration-500">
                            <div className="flex flex-col items-center gap-3">
                                <Loader2 className="w-8 h-8 text-purple-500 animate-spin" />
                                <span className="text-sm text-white/50">
                                    {loading ? 'Inicializace...' : renderMode === 'playwright' ? 'Renderování pomocí Playwright...' : 'Načítání stránky...'}
                                </span>
                                {renderMode === 'proxy' && !iframeLoaded && (
                                    <button
                                        onClick={switchToPlaywright}
                                        className="mt-2 text-xs text-purple-400 hover:text-purple-300 underline"
                                    >
                                        Stránka se nenačítá? Zkusit Playwright
                                    </button>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Error Message */}
                    {loadError && (
                        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 bg-red-500/20 border border-red-500/50 rounded-lg px-4 py-2 text-xs text-red-300">
                            {loadError}
                        </div>
                    )}

                    <iframe
                        key={`${url}-${renderMode}-${retryCount}-${reloadKey}`}
                        ref={iframeRef}

                        src={iframeSrc}
                        className="w-full h-full border-0 bg-white"
                        onLoad={handleLoad}
                        sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox"
                        title="Page Simulator"
                    />
                </div>
            ) : (
                <div className="flex items-center justify-center h-full">
                    <div className="text-center text-white/30">
                        <Globe className="w-16 h-16 mx-auto mb-4 opacity-30" />
                        <p className="text-lg">Zadejte Base URL pro zobrazení simulátoru stránky</p>
                        <p className="text-sm mt-2">URL musí začínat na http:// nebo https://</p>
                    </div>
                </div>
            )}
        </div>
    );
}
