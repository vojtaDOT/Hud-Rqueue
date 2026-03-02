'use client';

import { Globe, Loader2, Zap } from 'lucide-react';

import { cn } from '@/lib/utils';
import type { FramePageType, RenderMode } from '@/components/simulator/frame/types';

interface FrameOverlaysProps {
    isValidUrl: boolean;
    iframeLoaded: boolean;
    renderMode: RenderMode;
    pageType: FramePageType | null;
    loading: boolean;
    loadError: string | null;
    onSwitchToPlaywright: () => void;
}

export function FrameOverlays({
    isValidUrl,
    iframeLoaded,
    renderMode,
    pageType,
    loading,
    loadError,
    onSwitchToPlaywright,
}: FrameOverlaysProps) {
    return (
        <>
            {isValidUrl && iframeLoaded && (
                <div className="absolute left-4 top-4 z-20">
                    <div className={cn(
                        'flex items-center gap-1 rounded-full border px-2 py-1 text-[10px] font-medium',
                        renderMode === 'playwright'
                            ? 'border-green-500/30 bg-green-500/20 text-green-400'
                            : 'border-primary/30 bg-primary/20 text-primary',
                    )}>
                        {renderMode === 'playwright' ? (
                            <>
                                <Zap className="h-3 w-3" />
                                Playwright
                            </>
                        ) : (
                            <>
                                <Globe className="h-3 w-3" />
                                Proxy
                            </>
                        )}
                    </div>
                </div>
            )}

            {pageType && (
                <div className="absolute right-4 top-4 z-20 rounded-lg border border-border bg-card/95 px-3 py-2 text-xs backdrop-blur-md">
                    <div className="flex items-center gap-2">
                        <span className="text-muted-foreground">Crawler:</span>
                        <span className={cn('font-medium', pageType.requiresPlaywright ? 'text-orange-400' : 'text-green-400')}>
                            {pageType.requiresPlaywright ? 'Playwright' : 'Scrapy'}
                        </span>
                        <span className="text-muted-foreground/60">-</span>
                        <span className="capitalize text-muted-foreground">{pageType.framework}</span>
                    </div>
                </div>
            )}

            {(loading || !iframeLoaded) && (
                <div className="absolute inset-0 z-10 flex items-center justify-center bg-card transition-opacity duration-500">
                    <div className="flex flex-col items-center gap-3">
                        <Loader2 className="h-8 w-8 animate-spin text-primary" />
                        <span className="text-sm text-muted-foreground">
                            {loading ? 'Inicializace...' : renderMode === 'playwright' ? 'Renderovani pomoci Playwright...' : 'Nacitani stranky...'}
                        </span>
                        {renderMode === 'proxy' && !iframeLoaded && (
                            <button
                                onClick={onSwitchToPlaywright}
                                className="mt-2 text-xs text-primary underline hover:text-primary/80"
                            >
                                Stranka se nenacita? Zkusit Playwright
                            </button>
                        )}
                    </div>
                </div>
            )}

            {loadError && (
                <div className="absolute bottom-4 left-1/2 z-20 -translate-x-1/2 rounded-lg border border-red-500/50 bg-red-500/20 px-4 py-2 text-xs text-red-300">
                    {loadError}
                </div>
            )}
        </>
    );
}
