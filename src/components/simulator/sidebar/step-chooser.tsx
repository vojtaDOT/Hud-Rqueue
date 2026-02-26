'use client';

import { Bot, Clock3, FolderTree, Plus, X } from 'lucide-react';

import type { RepeaterRef, ScopeRef } from '@/lib/workflow-tree';
import { Button } from '@/components/ui/button';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';

interface StepChooserProps {
    armedTargetLabel: string | null;
    onCancelArmed: () => void;
    beforeOptions: Array<{ value: string; label: string }>;
    beforeToAdd: string;
    onBeforeToAddChange: (value: string) => void;
    onAddBasicBeforeAction: () => void;
    playwrightEnabled: boolean;
    playwrightOptions: Array<{ value: string; label: string }>;
    playwrightToAdd: string;
    onPlaywrightToAddChange: (value: string) => void;
    onAddPlaywrightAction: () => void;
    onAddScope: () => void;
    onAddRepeater: () => void;
    onAddSourceUrl: () => void;
    onAddDocumentUrl: () => void;
    onAddDownloadFile: () => void;
    onAddDataExtract: () => void;
    onAddPagination: () => void;
    isDiscoveryTab: boolean;
    effectiveSelectedScopeId: string | null;
    effectiveSelectedRepeaterId: string | null;
    repeaterRefs: RepeaterRef[];
    scopeRefs: ScopeRef[];
    onSelectedRepeaterChange: (value: string) => void;
}

export function StepChooser({
    armedTargetLabel,
    onCancelArmed,
    beforeOptions,
    beforeToAdd,
    onBeforeToAddChange,
    onAddBasicBeforeAction,
    playwrightEnabled,
    playwrightOptions,
    playwrightToAdd,
    onPlaywrightToAddChange,
    onAddPlaywrightAction,
    onAddScope,
    onAddRepeater,
    onAddSourceUrl,
    onAddDocumentUrl,
    onAddDownloadFile,
    onAddDataExtract,
    onAddPagination,
    isDiscoveryTab,
    effectiveSelectedScopeId,
    effectiveSelectedRepeaterId,
    repeaterRefs,
    scopeRefs,
    onSelectedRepeaterChange,
}: StepChooserProps) {
    return (
        <>
            {armedTargetLabel && (
                <section className="rounded-lg border border-cyan-500/40 bg-cyan-500/10 p-3">
                    <div className="flex items-center justify-between gap-2 text-xs text-cyan-100">
                        <span className="font-semibold">Armed: {armedTargetLabel}</span>
                        <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            className="h-7 text-cyan-100 hover:bg-cyan-500/20"
                            onClick={onCancelArmed}
                        >
                            <X className="mr-1 h-3.5 w-3.5" />
                            Cancel (Esc)
                        </Button>
                    </div>
                </section>
            )}

            <section className="rounded-lg border border-white/10 bg-white/5 p-3">
                <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-white/60">Step Chooser</div>
                <div className="space-y-3">
                    <div className="rounded-lg border border-white/10 bg-black/30 p-2">
                        <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-white/70">
                            <Clock3 className="h-3.5 w-3.5" />
                            Before
                        </div>
                        <div className="flex gap-2">
                            <Select value={beforeToAdd} onValueChange={onBeforeToAddChange}>
                                <SelectTrigger className="h-8 border-white/10 bg-black/30 text-xs text-white">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {beforeOptions.map((item) => (
                                        <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <Button type="button" size="sm" onClick={onAddBasicBeforeAction} className="h-8">
                                <Plus className="mr-1 h-3.5 w-3.5" />
                                Add
                            </Button>
                        </div>
                    </div>

                    {playwrightEnabled && (
                        <div className="rounded-lg border border-purple-500/30 bg-purple-500/5 p-2">
                            <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-purple-200">
                                <Bot className="h-3.5 w-3.5" />
                                Playwright
                            </div>
                            <div className="flex gap-2">
                                <Select value={playwrightToAdd} onValueChange={onPlaywrightToAddChange}>
                                    <SelectTrigger className="h-8 border-purple-500/20 bg-black/30 text-xs text-white">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {playwrightOptions.map((item) => (
                                            <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                <Button type="button" size="sm" onClick={onAddPlaywrightAction} className="h-8">
                                    <Plus className="mr-1 h-3.5 w-3.5" />
                                    Add
                                </Button>
                            </div>
                        </div>
                    )}

                    <div className="rounded-lg border border-cyan-500/30 bg-cyan-500/5 p-2">
                        <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-cyan-200">
                            <FolderTree className="h-3.5 w-3.5" />
                            Core
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                            <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                className="h-8 border-cyan-500/40 bg-transparent text-cyan-100"
                                onClick={onAddScope}
                            >
                                + Scope
                            </Button>
                            <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                className="h-8 border-amber-500/40 bg-transparent text-amber-100"
                                disabled={!effectiveSelectedScopeId}
                                onClick={onAddRepeater}
                            >
                                + Repeater
                            </Button>

                            <Select value={effectiveSelectedRepeaterId ?? ''} onValueChange={onSelectedRepeaterChange}>
                                <SelectTrigger className="h-8 border-green-500/40 bg-black/30 text-xs text-white">
                                    <SelectValue placeholder="Step target repeater" />
                                </SelectTrigger>
                                <SelectContent>
                                    {repeaterRefs.map((item) => (
                                        <SelectItem key={item.repeaterId} value={item.repeaterId}>
                                            {item.scopeLabel} {'->'} {item.repeaterLabel}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>

                            {isDiscoveryTab ? (
                                <>
                                    <Button
                                        type="button"
                                        size="sm"
                                        variant="outline"
                                        className="h-8 border-cyan-500/40 bg-transparent text-cyan-100"
                                        disabled={!effectiveSelectedRepeaterId}
                                        onClick={onAddSourceUrl}
                                    >
                                        + Source URL
                                    </Button>
                                    <Button
                                        type="button"
                                        size="sm"
                                        variant="outline"
                                        className="h-8 border-sky-500/40 bg-transparent text-sky-100"
                                        disabled={!effectiveSelectedRepeaterId}
                                        onClick={onAddDocumentUrl}
                                    >
                                        + Document URL
                                    </Button>
                                </>
                            ) : (
                                <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    className="h-8 border-emerald-500/40 bg-transparent text-emerald-100"
                                    disabled={!effectiveSelectedRepeaterId}
                                    onClick={onAddDownloadFile}
                                >
                                    + Download File
                                </Button>
                            )}

                            <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                className="h-8 border-green-500/40 bg-transparent text-green-100"
                                disabled={!effectiveSelectedRepeaterId}
                                onClick={onAddDataExtract}
                            >
                                + Data Extract
                            </Button>
                            <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                className="h-8 border-red-500/40 bg-transparent text-red-100"
                                disabled={!effectiveSelectedScopeId}
                                onClick={onAddPagination}
                            >
                                + Pagination
                            </Button>
                        </div>
                        <div className="mt-2 text-[11px] text-white/50">
                            Scope target: {scopeRefs.find((scope) => scope.scopeId === effectiveSelectedScopeId)?.scopeLabel ?? 'none'}
                            {' | '}
                            Repeater target: {repeaterRefs.find((item) => item.repeaterId === effectiveSelectedRepeaterId)?.repeaterLabel ?? 'none'}
                        </div>
                    </div>
                </div>
            </section>
        </>
    );
}
