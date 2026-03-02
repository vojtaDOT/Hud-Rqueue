'use client';

import type { ReactNode } from 'react';

interface BeforeActionCardProps {
    title: string;
    actions: ReactNode;
    children: ReactNode;
}

export function BeforeActionCard({ title, actions, children }: BeforeActionCardProps) {
    return (
        <div className="rounded-lg border border-border bg-card/50 p-2">
            <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
                <span>{title}</span>
                <div className="flex gap-1">{actions}</div>
            </div>
            {children}
        </div>
    );
}
