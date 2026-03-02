'use client';

import { Eraser, MousePointer2, RefreshCw, Search, Zap } from 'lucide-react';

import { cn } from '@/lib/utils';
import type { InteractionMode, RenderMode } from '@/components/simulator/frame/types';

interface FrameToolbarProps {
    interactionMode: InteractionMode;
    inspectorOpen: boolean;
    isValidUrl: boolean;
    renderMode: RenderMode;
    onToggleInteractionMode: (mode: Exclude<InteractionMode, null>) => void;
    onToggleInspector: () => void;
    onReload: () => void;
    onToggleRenderMode: () => void;
}

export function FrameToolbar({
    interactionMode,
    inspectorOpen,
    isValidUrl,
    renderMode,
    onToggleInteractionMode,
    onToggleInspector,
    onReload,
    onToggleRenderMode,
}: FrameToolbarProps) {
    return (
        <div className="absolute left-1/2 top-4 z-20 flex -translate-x-1/2 gap-2">
            <div className={cn(
                'flex items-center gap-1 rounded-full border border-border bg-card/80 px-3 py-1.5 backdrop-blur-md transition-all',
                interactionMode === 'select' ? 'border-primary/50 bg-primary/20' : 'hover:bg-card/90',
            )}>
                <button
                    onClick={() => onToggleInteractionMode('select')}
                    className={cn('flex items-center gap-1.5 text-xs font-medium', interactionMode === 'select' ? 'text-primary' : 'text-muted-foreground')}
                >
                    <MousePointer2 className="h-3.5 w-3.5" />
                    {interactionMode === 'select' ? 'Vybrat element' : 'Vybrat'}
                </button>
            </div>

            <div className={cn(
                'flex items-center gap-1 rounded-full border border-border bg-card/80 px-3 py-1.5 backdrop-blur-md transition-all',
                interactionMode === 'remove' ? 'border-red-500/50 bg-red-500/20' : 'hover:bg-card/90',
            )}>
                <button
                    onClick={() => onToggleInteractionMode('remove')}
                    className={cn('flex items-center gap-1.5 text-xs font-medium', interactionMode === 'remove' ? 'text-red-300' : 'text-muted-foreground')}
                >
                    <Eraser className="h-3.5 w-3.5" />
                    {interactionMode === 'remove' ? 'Odebrat element' : 'Odebrat'}
                </button>
            </div>

            <div className={cn(
                'flex items-center gap-1 rounded-full border border-border bg-card/80 px-3 py-1.5 backdrop-blur-md transition-all',
                inspectorOpen ? 'border-primary/50 bg-primary/20' : 'hover:bg-card/90',
            )}>
                <button
                    onClick={onToggleInspector}
                    className={cn('flex items-center gap-1.5 text-xs font-medium', inspectorOpen ? 'text-primary' : 'text-muted-foreground')}
                >
                    <Search className="h-3.5 w-3.5" />
                    Lupa
                </button>
            </div>

            <div className="flex items-center rounded-full border border-border bg-card/80 px-2 py-1.5 backdrop-blur-md transition-all hover:bg-card/90">
                <button
                    onClick={onReload}
                    className="text-muted-foreground transition-colors hover:text-foreground"
                    title="Nacist znovu"
                >
                    <RefreshCw className="h-3.5 w-3.5" />
                </button>
            </div>

            {isValidUrl && (
                <div className="flex items-center gap-2 rounded-full border border-border bg-card/80 px-3 py-1.5 backdrop-blur-md">
                    <button
                        onClick={onToggleRenderMode}
                        className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
                        title={renderMode === 'proxy' ? 'Pouzit Playwright (pro slozite stranky)' : 'Pouzit proxy (rychlejsi)'}
                    >
                        {renderMode === 'playwright' ? (
                            <>
                                <RefreshCw className="h-3.5 w-3.5" />
                                Zkusit proxy
                            </>
                        ) : (
                            <>
                                <Zap className="h-3.5 w-3.5" />
                                Playwright
                            </>
                        )}
                    </button>
                </div>
            )}
        </div>
    );
}
