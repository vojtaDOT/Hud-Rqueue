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

            <section className="space-y-2 rounded-lg border border-border bg-muted/30 p-3">
                <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Before Pipeline</div>
                {hasBeforeActions ? (
                    beforeActions
                ) : (
                    <div className="rounded-lg border border-dashed border-border py-4 text-center text-xs text-muted-foreground/60">
                        No before actions
                    </div>
                )}
            </section>

            <section className="space-y-2 rounded-lg border border-cyan-500/30 bg-cyan-500/5 p-3">
                <div className="text-xs font-semibold uppercase tracking-wider text-primary">Core Chain</div>
                {hasCoreChain ? (
                    coreChain
                ) : (
                    <div className="rounded-lg border border-dashed border-border py-8 text-center text-sm text-muted-foreground/60">
                        Add Scope in Step Chooser to start chain
                    </div>
                )}
            </section>
        </div>
    );
}
