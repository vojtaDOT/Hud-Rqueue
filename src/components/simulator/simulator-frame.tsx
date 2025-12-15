'use client';

import { useState, useRef, useEffect } from 'react';
import { Loader2, Globe, MousePointer2, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { PageType, ElementSelector } from '@/lib/crawler-types';

interface SimulatorFrameProps {
    url: string;
    onLoad?: () => void;
    loading?: boolean;
    className?: string;
    onElementSelect?: (selector: string, elementInfo?: ElementSelector) => void;
    onPageTypeDetected?: (pageType: PageType) => void;
}

interface ElementInfo {
    selector: string;
    tagName: string;
    textContent: string;
    isList: boolean;
    listItemCount?: number;
    parentSelector?: string;
}

export function SimulatorFrame({
    url,
    onLoad,
    loading = false,
    className,
    onElementSelect,
    onPageTypeDetected
}: SimulatorFrameProps) {
    const [iframeLoaded, setIframeLoaded] = useState(false);
    const [selectionMode, setSelectionMode] = useState(false);
    const [selectedElement, setSelectedElement] = useState<ElementInfo | null>(null);
    const [hoveredElement, setHoveredElement] = useState<{ selector: string; bounds: DOMRect } | null>(null);
    const [pageType, setPageType] = useState<PageType | null>(null);
    const iframeRef = useRef<HTMLIFrameElement>(null);

    const handleLoad = () => {
        setIframeLoaded(true);
        onLoad?.();
    };

    const isValidUrl = url.startsWith('http://') || url.startsWith('https://');
    
    // Generate proxy URL for same-origin access
    const proxyUrl = isValidUrl ? `/api/proxy?url=${encodeURIComponent(url)}` : '';


    // Handle messages from iframe
    useEffect(() => {
        const handleMessage = (event: MessageEvent) => {
            if (event.data.type === 'element-hover') {
                setHoveredElement({
                    selector: event.data.selector,
                    bounds: {
                        left: event.data.bounds.left,
                        top: event.data.bounds.top,
                        width: event.data.bounds.width,
                        height: event.data.bounds.height
                    } as DOMRect
                });
            } else if (event.data.type === 'element-select') {
                const elementInfo = event.data.elementInfo as ElementInfo;
                setSelectedElement(elementInfo);
                
                // Convert to ElementSelector format
                const selectorInfo: ElementSelector = {
                    selector: elementInfo.selector,
                    tagName: elementInfo.tagName,
                    textContent: elementInfo.textContent,
                    isList: elementInfo.isList,
                    listItemCount: elementInfo.listItemCount,
                    parentSelector: elementInfo.parentSelector
                };
                
                onElementSelect?.(elementInfo.selector, selectorInfo);
            } else if (event.data.type === 'page-type-detected') {
                const detectedPageType = event.data.pageType as PageType;
                setPageType(detectedPageType);
                onPageTypeDetected?.(detectedPageType);
            }
        };

        window.addEventListener('message', handleMessage);
        return () => window.removeEventListener('message', handleMessage);
    }, [onElementSelect, onPageTypeDetected]);

    // Enable/disable selection mode in iframe
    useEffect(() => {
        const iframe = iframeRef.current;
        if (!iframe || !iframe.contentWindow || !iframeLoaded) return;

        // Wait a bit for the script to be ready
        setTimeout(() => {
            try {
                iframe.contentWindow?.postMessage(
                    { type: selectionMode ? 'enable-selection' : 'disable-selection' },
                    '*'
                );
            } catch (error) {
                console.warn('Could not communicate with iframe:', error);
            }
        }, 100);
    }, [selectionMode, iframeLoaded]);

    // Reset selection when URL changes
    useEffect(() => {
        setSelectedElement(null);
        setHoveredElement(null);
        setPageType(null);
    }, [url]);

    const handleClearSelection = () => {
        setSelectedElement(null);
        setHoveredElement(null);
    };

    return (
        <div className={cn("relative flex-1 bg-zinc-950 flex flex-col", className)}>
            {/* Toolbar Overlay */}
            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 flex gap-2">
                <div className={cn(
                    "px-3 py-1.5 rounded-full bg-black/50 backdrop-blur-md border border-white/10 flex items-center gap-2 transition-all",
                    selectionMode ? "bg-purple-500/20 border-purple-500/50" : "hover:bg-black/70"
                )}>
                    <button
                        onClick={() => setSelectionMode(!selectionMode)}
                        className={cn("text-xs font-medium flex items-center gap-1.5", selectionMode ? "text-purple-900" : "text-white/70")}
                    >
                        <MousePointer2 className="w-3.5 h-3.5" />
                        {selectionMode ? 'Klikněte na element pro výběr' : 'Vybrat element'}
                    </button>
                </div>
            </div>

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
                                    {loading ? 'Inicializace...' : 'Načítání stránky...'}
                                </span>
                            </div>
                        </div>
                    )}


                    <iframe
                        ref={iframeRef}
                        src={proxyUrl}
                        className="w-full h-full border-0 bg-white"
                        onLoad={handleLoad}
                        sandbox="allow-scripts allow-same-origin allow-forms"
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
