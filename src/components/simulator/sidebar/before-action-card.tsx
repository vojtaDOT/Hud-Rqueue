'use client';

import type { ReactNode } from 'react';

interface BeforeActionCardProps {
    title: string;
    actions: ReactNode;
    children: ReactNode;
}

export function BeforeActionCard({ title, actions, children }: BeforeActionCardProps) {
    return (
        <div className="rounded-lg border border-white/10 bg-black/30 p-2">
            <div className="mb-2 flex items-center justify-between text-xs text-white/70">
                <span>{title}</span>
                <div className="flex gap-1">{actions}</div>
            </div>
            {children}
        </div>
    );
}
