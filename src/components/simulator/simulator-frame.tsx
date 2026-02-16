'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Loader2, Globe, MousePointer2, X, RefreshCw, Zap, Eraser } from 'lucide-react';

import { cn } from '@/lib/utils';
import { PageType, ElementSelector } from '@/lib/crawler-types';

interface SimulatorFrameProps {
    url: string;
    onLoad?: () => void;
    loading?: boolean;
    className?: string;
    onElementSelect?: (selector: string, elementInfo?: ElementSelector) => void;
    onPageTypeDetected?: (pageType: PageType) => void;
    onElementRemove?: (selector: string) => void;
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

export function SimulatorFrame({
    url,
    onLoad,
    loading = false,
    className,
    onElementSelect,
    onPageTypeDetected,
    onElementRemove,
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

    const iframeRef = useRef<HTMLIFrameElement>(null);
    const loadTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const iframeLoadedRef = useRef(false);
    const renderModeRef = useRef<RenderMode>(renderMode);

    const isValidUrl = url.startsWith('http://') || url.startsWith('https://');

    useEffect(() => {
        iframeLoadedRef.current = iframeLoaded;
    }, [iframeLoaded]);

    useEffect(() => {
        renderModeRef.current = renderMode;
    }, [renderMode]);

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
            }
            // Handle proxy error - switch to Playwright
            else if (event.data.type === 'proxy-error') {
                console.log('[SimulatorFrame] Proxy error, switching to Playwright:', event.data.message);
                setLoadError(event.data.message);
                if (renderMode === 'proxy') {
                    switchToPlaywright();
                }
            }
        };

        window.addEventListener('message', handleMessage);
        return () => window.removeEventListener('message', handleMessage);
    }, [onElementSelect, onPageTypeDetected, renderMode, switchToPlaywright, interactionMode, onElementRemove]);

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
    }, [playwrightEnabled]);

    // Reset state when URL changes
    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        resetFrameState();

        // Set a timeout to detect if the page doesn't load
        if (loadTimeoutRef.current) {
            clearTimeout(loadTimeoutRef.current);
        }

        if (isValidUrl) {
            loadTimeoutRef.current = setTimeout(() => {
                if (!iframeLoadedRef.current && renderModeRef.current === 'proxy') {
                    console.log('[SimulatorFrame] Load timeout, considering Playwright fallback');
                    // Don't auto-switch, let user decide
                }
            }, 15000);
        }

        return () => {
            if (loadTimeoutRef.current) {
                clearTimeout(loadTimeoutRef.current);
            }
        };
    }, [url, isValidUrl, resetFrameState]);

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
                </div>
            )}

            {isValidUrl ? (
                <div className="relative w-full h-full">
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
                        sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-top-navigation-by-user-activation"
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
