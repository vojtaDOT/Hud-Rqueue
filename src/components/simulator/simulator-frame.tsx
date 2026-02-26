'use client';

import { useState, useRef, useEffect, useCallback, useMemo, type ReactNode } from 'react';
import { ChevronDown, ChevronRight, Globe } from 'lucide-react';

import { cn } from '@/lib/utils';
import { PageType, ElementSelector } from '@/lib/crawler-types';
import { toPreviewBridgeMessage } from '@/lib/preview-bridge';
import { FrameToolbar } from '@/components/simulator/frame/frame-toolbar';
import { SelectedElementCard } from '@/components/simulator/frame/selected-element-card';
import { DomInspectorPanel } from '@/components/simulator/frame/dom-inspector-panel';
import { FrameOverlays } from '@/components/simulator/frame/frame-overlays';
import type {
    InspectorNode,
    RenderMode,
    SelectorSuggestion,
    SimulatorElementInfo,
    InteractionMode,
} from '@/components/simulator/frame/types';
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

function isElementInfoPayload(value: unknown): value is SimulatorElementInfo {
    if (!value || typeof value !== 'object') return false;
    const payload = value as Partial<SimulatorElementInfo>;
    return typeof payload.selector === 'string' && typeof payload.tagName === 'string' && typeof payload.isList === 'boolean';
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
    const [bridgeReady, setBridgeReady] = useState(false);
    const [interactionMode, setInteractionMode] = useState<InteractionMode>(null);
    const [selectedElement, setSelectedElement] = useState<SimulatorElementInfo | null>(null);
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
    const loadTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const bridgeFallbackRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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

    const getIframeSrc = useCallback(() => {
        if (!isValidUrl) return '';
        if (renderMode === 'playwright') {
            return `/api/render?url=${encodeURIComponent(url)}&depth=0`;
        }
        return `/api/proxy?url=${encodeURIComponent(url)}`;
    }, [isValidUrl, renderMode, url]);

    const handleLoad = useCallback(() => {
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
        setRenderMode('playwright');
        setIframeLoaded(false);
        setBridgeReady(false);
        setLoadError(null);
    }, [onPlaywrightToggleRequest]);

    const retryWithProxy = useCallback(() => {
        const accepted = onPlaywrightToggleRequest ? onPlaywrightToggleRequest(false) : true;
        if (!accepted) return;
        setRenderMode('proxy');
        setIframeLoaded(false);
        setBridgeReady(false);
        setLoadError(null);
        setRetryCount((prev) => prev + 1);
    }, [onPlaywrightToggleRequest]);

    const handleReload = useCallback(() => {
        setReloadKey((prev) => prev + 1);
        setIframeLoaded(false);
        setBridgeReady(false);
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
        if (!bridgeReady) return;
        iframeRef.current?.contentWindow?.postMessage({ type: 'inspector:init' }, '*');
    }, [bridgeReady]);

    const requestInspectorChildren = useCallback((nodeId: string) => {
        if (!bridgeReady) return;
        iframeRef.current?.contentWindow?.postMessage({ type: 'inspector:request-children', nodeId }, '*');
    }, [bridgeReady]);

    const requestSelectorSuggestions = useCallback((nodeId: string) => {
        if (!bridgeReady) return;
        iframeRef.current?.contentWindow?.postMessage({ type: 'selector:suggestions', nodeId }, '*');
    }, [bridgeReady]);

    const requestInspectorHover = useCallback((selector: string | null) => {
        if (!bridgeReady || !iframeRef.current?.contentWindow) return;
        iframeRef.current.contentWindow.postMessage({ type: 'inspector:hover', selector }, '*');
    }, [bridgeReady]);

    const requestInspectorSelect = useCallback((nodeId: string) => {
        if (!bridgeReady) return;
        iframeRef.current?.contentWindow?.postMessage({ type: 'inspector:select', nodeId }, '*');
    }, [bridgeReady]);

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

    useEffect(() => {
        const handleMessage = (event: MessageEvent) => {
            const message = toPreviewBridgeMessage(event.data);
            if (!message) return;

            if (message.type === 'bridge-ready') {
                setBridgeReady(true);
                return;
            }

            if (message.type === 'element-select') {
                if (!isElementInfoPayload((message as { elementInfo?: unknown }).elementInfo)) {
                    return;
                }
                const elementInfo = (message as { elementInfo: SimulatorElementInfo }).elementInfo;

                if (interactionMode === 'remove') {
                    iframeRef.current?.contentWindow?.postMessage({
                        type: 'remove-element',
                        selector: elementInfo.selector,
                        localSelector: elementInfo.localSelector,
                        framePath: elementInfo.framePath,
                    }, '*');
                    onElementRemove?.(elementInfo.localSelector ?? elementInfo.selector);
                    setInteractionMode(null);
                    return;
                }

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
                setInteractionMode(null);
                return;
            }

            if (message.type === 'page-type-detected') {
                const detectedPageType = (message as { pageType?: PageType }).pageType;
                if (!detectedPageType) return;
                setPageType(detectedPageType);
                onPageTypeDetected?.(detectedPageType);
                return;
            }

            if (message.type === 'proxy-loaded' || message.type === 'playwright-loaded') {
                setLoadError(null);
                return;
            }

            if (message.type === 'playwright-error') {
                setLoadError(String((message as { message?: unknown }).message ?? 'Playwright render selhal.'));
                setIframeLoaded(true);
                onLoad?.();
                return;
            }

            if (message.type === 'proxy-error') {
                setLoadError(String((message as { message?: unknown }).message ?? 'Proxy nacteni selhalo.'));
                return;
            }

            if (message.type === 'inspector:children') {
                const messageWithNodes = message as unknown as { nodes?: unknown[] };
                const nodes = Array.isArray(messageWithNodes.nodes)
                    ? (messageWithNodes.nodes as InspectorNode[])
                    : [];
                mergeInspectorNodes(nodes);
                return;
            }

            if (message.type === 'selector:suggestions') {
                const messageWithSuggestions = message as unknown as { suggestions?: unknown[] };
                const nextSuggestions = Array.isArray(messageWithSuggestions.suggestions)
                    ? (messageWithSuggestions.suggestions as SelectorSuggestion[])
                    : [];
                setSelectorSuggestions(nextSuggestions);
                return;
            }

            if (message.type === 'inspector:select') {
                if (!isElementInfoPayload((message as { elementInfo?: unknown }).elementInfo)) {
                    return;
                }
                const elementInfo = (message as { elementInfo: SimulatorElementInfo }).elementInfo;
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

    useEffect(() => {
        if (!iframeLoaded) return;

        if (bridgeFallbackRef.current) {
            clearTimeout(bridgeFallbackRef.current);
            bridgeFallbackRef.current = null;
        }

        if (!bridgeReady) {
            bridgeFallbackRef.current = setTimeout(() => {
                setBridgeReady(true);
            }, 1500);
        }

        return () => {
            if (bridgeFallbackRef.current) {
                clearTimeout(bridgeFallbackRef.current);
                bridgeFallbackRef.current = null;
            }
        };
    }, [iframeLoaded, bridgeReady]);

    useEffect(() => {
        const iframe = iframeRef.current;
        if (!iframe || !iframe.contentWindow || !iframeLoaded || !bridgeReady) return;

        const timeout = setTimeout(() => {
            iframe.contentWindow?.postMessage(
                interactionMode !== null
                    ? { type: 'enable-selection', mode: interactionMode }
                    : { type: 'disable-selection' },
                '*',
            );
        }, 100);

        return () => clearTimeout(timeout);
    }, [bridgeReady, iframeLoaded, interactionMode]);

    const resetFrameState = useCallback(() => {
        setSelectedElement(null);
        setPageType(null);
        setIframeLoaded(false);
        setBridgeReady(false);
        setLoadError(null);
        setRenderMode(playwrightEnabled ? 'playwright' : 'proxy');
        setRetryCount(0);
        setInspectorNodes([]);
        setExpandedNodeIds(new Set());
        setSelectedInspectorNodeId(null);
        setSelectorSuggestions([]);
    }, [playwrightEnabled]);

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        resetFrameState();

        if (loadTimeoutRef.current) {
            clearTimeout(loadTimeoutRef.current);
            loadTimeoutRef.current = null;
        }
    }, [url, resetFrameState]);

    useEffect(() => {
        if (loadTimeoutRef.current) {
            clearTimeout(loadTimeoutRef.current);
            loadTimeoutRef.current = null;
        }

        if (isValidUrl) {
            loadTimeoutRef.current = setTimeout(() => {
                if (iframeLoadedRef.current) return;

                if (renderMode === 'playwright') {
                    setLoadError('Playwright render timeout (20s). Zkuste Nacist znovu nebo Zkusit proxy.');
                } else {
                    setLoadError('Proxy load timeout (20s). Zkuste Playwright nebo Nacist znovu.');
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
        if (!iframeLoaded || !bridgeReady || !iframeRef.current?.contentWindow) return;
        if (highlightSelector && highlightSelector.trim()) {
            iframeRef.current.contentWindow.postMessage({
                type: 'highlight-selector',
                selector: highlightSelector,
            }, '*');
            return;
        }
        iframeRef.current.contentWindow.postMessage({ type: 'clear-highlight-selector' }, '*');
    }, [bridgeReady, highlightSelector, iframeLoaded]);

    useEffect(() => {
        if (!inspectorOpen || !iframeLoaded || !bridgeReady) return;
        requestInspectorInit();
    }, [bridgeReady, iframeLoaded, inspectorOpen, requestInspectorInit]);

    const handleClearSelection = () => {
        setSelectedElement(null);
    };

    const handleRemoveElement = () => {
        if (!selectedElement || !iframeRef.current?.contentWindow || !bridgeReady) return;

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
        <div className={cn('relative flex flex-1 flex-col bg-zinc-950', className)}>
            <FrameToolbar
                interactionMode={interactionMode}
                inspectorOpen={inspectorOpen}
                isValidUrl={isValidUrl}
                renderMode={renderMode}
                onToggleInteractionMode={(mode) => setInteractionMode((prev) => (prev === mode ? null : mode))}
                onToggleInspector={() => {
                    setInspectorOpen((prev) => !prev);
                    if (!inspectorOpen) {
                        requestInspectorInit();
                    }
                }}
                onReload={handleReload}
                onToggleRenderMode={renderMode === 'proxy' ? switchToPlaywright : retryWithProxy}
            />

            {selectedElement && (
                <SelectedElementCard
                    selectedElement={selectedElement}
                    onRemoveElement={handleRemoveElement}
                    onClearSelection={handleClearSelection}
                    onQuickAction={handleQuickActionClick}
                />
            )}

            {isValidUrl ? (
                <div className="relative h-full w-full">
                    <DomInspectorPanel
                        open={inspectorOpen}
                        width={inspectorWidth}
                        search={inspectorSearch}
                        onSearchChange={setInspectorSearch}
                        onClose={() => setInspectorOpen(false)}
                        onResizeStart={handleInspectorResizeStart}
                        treeContent={renderInspectorTree(null)}
                        selectedNode={selectedInspectorNode}
                        suggestions={selectorSuggestions}
                        onSuggestionHover={requestInspectorHover}
                        onSuggestionClick={(selector) => {
                            requestInspectorHover(selector);
                            if (!selectedInspectorNode) return;
                            onElementSelect?.(selector, {
                                selector,
                                localSelector: selector,
                                framePath: selectedInspectorNode.framePath,
                                inIframe: Boolean(selectedInspectorNode.framePath?.length),
                                tagName: selectedInspectorNode.tag,
                                textContent: selectedInspectorNode.text,
                                isList: selectedInspectorNode.badges.includes('list-item'),
                            });
                        }}
                        onAutoScaffold={() => handleQuickActionClick('auto_scaffold')}
                        autoScaffoldDisabled={!selectedElement}
                    />

                    <FrameOverlays
                        isValidUrl={isValidUrl}
                        iframeLoaded={iframeLoaded}
                        renderMode={renderMode}
                        pageType={pageType}
                        loading={loading}
                        loadError={loadError}
                        onSwitchToPlaywright={switchToPlaywright}
                    />

                    <iframe
                        key={`${url}-${renderMode}-${retryCount}-${reloadKey}`}
                        ref={iframeRef}
                        src={iframeSrc}
                        className="h-full w-full border-0 bg-white"
                        onLoad={handleLoad}
                        sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox"
                        title="Page Simulator"
                    />
                </div>
            ) : (
                <div className="flex h-full items-center justify-center">
                    <div className="text-center text-white/30">
                        <Globe className="mx-auto mb-4 h-16 w-16 opacity-30" />
                        <p className="text-lg">Zadejte Base URL pro zobrazeni simulatoru stranky</p>
                        <p className="mt-2 text-sm">URL musi zacinat na http:// nebo https://</p>
                    </div>
                </div>
            )}
        </div>
    );
}
