'use client';

import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

interface ScopeNodeCardProps {
    depth: number;
    title: ReactNode;
    actions: ReactNode;
    children: ReactNode;
}

export function ScopeNodeCard({ depth, title, actions, children }: ScopeNodeCardProps) {
    return (
        <div className={cn('space-y-2 rounded-lg border border-cyan-500/40 bg-cyan-500/5 p-3', depth > 0 && 'ml-4')}>
            <div className="flex items-center justify-between">
                <div className="text-xs font-semibold uppercase tracking-wider text-cyan-200">{title}</div>
                <div className="flex gap-1">{actions}</div>
            </div>
            {children}
        </div>
    );
}
