'use client';

import type { ReactNode } from 'react';

interface RepeaterStepCardProps {
    header: ReactNode;
    actions: ReactNode;
    children: ReactNode;
}

export function RepeaterStepCard({ header, actions, children }: RepeaterStepCardProps) {
    return (
        <div className="rounded-lg border border-white/10 bg-black/20 p-2">
            <div className="mb-2 flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-white/70">
                    {header}
                </div>
                <div className="flex gap-1">{actions}</div>
            </div>
            {children}
        </div>
    );
}
