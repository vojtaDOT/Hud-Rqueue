'use client';

import { Route, Rss, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

type ToolboxTab = 'path' | 'rss';

interface ToolboxTabsProps {
    activeTab: ToolboxTab;
    onTabChange: (tab: ToolboxTab) => void;
    rightSlot?: ReactNode;
}

const TABS: { id: ToolboxTab; label: string; icon: LucideIcon }[] = [
    { id: 'path', label: 'Path', icon: Route },
    { id: 'rss', label: 'RSS', icon: Rss },
];

export type { ToolboxTab };

export function ToolboxTabs({ activeTab, onTabChange, rightSlot }: ToolboxTabsProps) {
    return (
        <div className="flex items-center justify-between gap-2 border-b border-border bg-card/80 px-1">
            <div className="flex items-center">
                {TABS.map((tab) => {
                    const isActive = activeTab === tab.id;
                    const Icon = tab.icon;
                    return (
                        <button
                            key={tab.id}
                            type="button"
                            onClick={() => onTabChange(tab.id)}
                            className={cn(
                                'relative flex items-center gap-1.5 px-3 py-2 text-xs font-medium transition-colors',
                                'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
                                isActive
                                    ? 'text-primary'
                                    : 'text-muted-foreground hover:text-foreground',
                            )}
                        >
                            <Icon className="h-3.5 w-3.5" />
                            {tab.label}
                            <span
                                className={cn(
                                    'absolute bottom-0 left-2 right-2 h-0.5 rounded-full bg-primary transition-all duration-200',
                                    isActive
                                        ? 'scale-x-100 opacity-100'
                                        : 'scale-x-0 opacity-0',
                                )}
                            />
                        </button>
                    );
                })}
            </div>

            {rightSlot ? (
                <div className="flex items-center pr-1">
                    {rightSlot}
                </div>
            ) : null}
        </div>
    );
}
