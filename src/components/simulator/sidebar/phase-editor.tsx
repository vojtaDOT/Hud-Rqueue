'use client';

import type { ReactNode } from 'react';

interface PhaseEditorProps {
    stepChooser: ReactNode;
    beforeActions: ReactNode;
    hasBeforeActions: boolean;
    coreChain: ReactNode;
    hasCoreChain: boolean;
}

export function PhaseEditor({
    stepChooser,
    beforeActions,
    hasBeforeActions,
    coreChain,
    hasCoreChain,
}: PhaseEditorProps) {
    return (
        <div className="space-y-4">
            {stepChooser}

            <section className="space-y-2 rounded-lg border border-white/10 bg-white/5 p-3">
                <div className="text-xs font-semibold uppercase tracking-wider text-white/60">Before Pipeline</div>
                {hasBeforeActions ? (
                    beforeActions
                ) : (
                    <div className="rounded-lg border border-dashed border-white/20 py-4 text-center text-xs text-white/40">
                        No before actions
                    </div>
                )}
            </section>

            <section className="space-y-2 rounded-lg border border-cyan-500/30 bg-cyan-500/5 p-3">
                <div className="text-xs font-semibold uppercase tracking-wider text-cyan-200">Core Chain</div>
                {hasCoreChain ? (
                    coreChain
                ) : (
                    <div className="rounded-lg border border-dashed border-white/20 py-8 text-center text-sm text-white/40">
                        Add Scope in Step Chooser to start chain
                    </div>
                )}
            </section>
        </div>
    );
}
