'use client';

import type { ReactNode } from 'react';
import { Trash2 } from 'lucide-react';

import { cn } from '@/lib/utils';
import type { PhaseConfig, ScopeModule, SourceUrlType } from '@/lib/crawler-types';
import {
    type FocusTarget,
    removeScopeFromTree,
    updateRepeaterInTree,
    updateScopeInTree,
    withPaginationDefaults,
} from '@/lib/workflow-tree';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { ScopeNodeCard } from '@/components/simulator/sidebar/scope-node-card';
import { RepeaterStepRenderer } from '@/components/simulator/sidebar/repeater-step-renderer';

import type { PhaseKey } from '@/components/simulator/sidebar/hooks/use-workflow-state';

/* ------------------------------------------------------------------ */
/*  Props                                                              */
/* ------------------------------------------------------------------ */

export interface ScopeNodeRendererProps {
    scope: ScopeModule;
    depth: number;
    isDiscovery: boolean;
    urlTypes: SourceUrlType[];
    phaseKey: PhaseKey;
    effectiveSelectedScopeId: string | null;
    effectiveSelectedRepeaterId: string | null;
    setSelectedScopeId: (id: string) => void;
    setSelectedRepeaterId: (id: string) => void;
    updatePhase: (phaseKey: PhaseKey, updater: (phase: PhaseConfig) => PhaseConfig) => void;
    setSelectorFocus: (target: FocusTarget, currentValue: string) => void;
    syncPreviewOnChange: (target: FocusTarget, value: string) => void;
    renderPickButton: (target: FocusTarget, currentValue: string) => ReactNode;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function ScopeNodeRenderer({
    scope,
    depth,
    isDiscovery,
    urlTypes,
    phaseKey,
    effectiveSelectedScopeId,
    effectiveSelectedRepeaterId,
    setSelectedScopeId,
    setSelectedRepeaterId,
    updatePhase,
    setSelectorFocus,
    syncPreviewOnChange,
    renderPickButton,
}: ScopeNodeRendererProps) {
    const scopeTarget: FocusTarget = phaseKey.phase === 'discovery'
        ? { phase: 'discovery', section: 'scope', scopeId: scope.id }
        : { phase: 'processing', urlTypeId: phaseKey.urlTypeId, section: 'scope', scopeId: scope.id };

    const paginationTarget: FocusTarget = phaseKey.phase === 'discovery'
        ? { phase: 'discovery', section: 'pagination', scopeId: scope.id }
        : { phase: 'processing', urlTypeId: phaseKey.urlTypeId, section: 'pagination', scopeId: scope.id };

    return (
        <ScopeNodeCard
            depth={depth}
            title="Scope"
            actions={(
                <>
                    <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className={cn('h-7 text-xs', effectiveSelectedScopeId === scope.id ? 'bg-muted text-foreground' : 'text-muted-foreground')}
                        onClick={() => setSelectedScopeId(scope.id)}
                    >
                        Target
                    </Button>
                    <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-red-300"
                        onClick={() => {
                            updatePhase(phaseKey, (phase) => {
                                const [chain] = removeScopeFromTree(phase.chain, scope.id);
                                return { ...phase, chain };
                            });
                        }}
                    >
                        <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                </>
            )}
        >

            <div className="grid grid-cols-2 gap-2">
                <div className="col-span-2 flex items-center gap-1">
                    <Input
                        value={scope.css_selector}
                        placeholder="Scope selector"
                        className="h-8 border-border bg-card/50 text-xs text-foreground"
                        onFocus={() => setSelectorFocus(scopeTarget, scope.css_selector)}
                        onChange={(event) => {
                            const value = event.target.value;
                            updatePhase(phaseKey, (phase) => {
                                const [chain] = updateScopeInTree(phase.chain, scope.id, (current) => ({ ...current, css_selector: value }));
                                return { ...phase, chain };
                            });
                            syncPreviewOnChange(scopeTarget, value);
                        }}
                    />
                    {renderPickButton(scopeTarget, scope.css_selector)}
                </div>
                <Input
                    value={scope.label}
                    placeholder="Scope label"
                    className="h-8 border-border bg-card/50 text-xs text-foreground"
                    onChange={(event) => {
                        const value = event.target.value;
                        updatePhase(phaseKey, (phase) => {
                            const [chain] = updateScopeInTree(phase.chain, scope.id, (current) => ({ ...current, label: value }));
                            return { ...phase, chain };
                        });
                    }}
                />
            </div>

            {scope.repeater && (() => {
                const repeater = scope.repeater;
                const repeaterTarget: FocusTarget = phaseKey.phase === 'discovery'
                    ? { phase: 'discovery', section: 'repeater', repeaterId: repeater.id }
                    : { phase: 'processing', urlTypeId: phaseKey.urlTypeId, section: 'repeater', repeaterId: repeater.id };

                return (
                    <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-2">
                        <div className="mb-2 flex items-center justify-between">
                            <div className="text-xs font-semibold uppercase tracking-wider text-amber-200">Repeater</div>
                            <div className="flex gap-1">
                                <Button
                                    type="button"
                                    size="sm"
                                    variant="ghost"
                                    className={cn('h-7 text-xs', effectiveSelectedRepeaterId === repeater.id ? 'bg-muted text-foreground' : 'text-muted-foreground')}
                                    onClick={() => {
                                        setSelectedScopeId(scope.id);
                                        setSelectedRepeaterId(repeater.id);
                                    }}
                                >
                                    Target
                                </Button>
                                <Button
                                    type="button"
                                    size="icon"
                                    variant="ghost"
                                    className="h-7 w-7 text-red-300"
                                    onClick={() => {
                                        updatePhase(phaseKey, (phase) => {
                                            const [chain] = updateScopeInTree(phase.chain, scope.id, (current) => ({
                                                ...current,
                                                repeater: null,
                                            }));
                                            return { ...phase, chain };
                                        });
                                    }}
                                >
                                    <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                            <div className="col-span-2 flex items-center gap-1">
                                <Input
                                    value={repeater.css_selector}
                                    placeholder="Repeater selector"
                                    className="h-8 border-border bg-card/50 text-xs text-foreground"
                                    onFocus={() => setSelectorFocus(repeaterTarget, repeater.css_selector)}
                                    onChange={(event) => {
                                        const value = event.target.value;
                                        updatePhase(phaseKey, (phase) => {
                                            const [chain] = updateRepeaterInTree(phase.chain, repeater.id, (current) => ({
                                                ...current,
                                                css_selector: value,
                                            }));
                                            return { ...phase, chain };
                                        });
                                        syncPreviewOnChange(repeaterTarget, value);
                                    }}
                                />
                                {renderPickButton(repeaterTarget, repeater.css_selector)}
                            </div>
                            <Input
                                value={repeater.label}
                                placeholder="Repeater label"
                                className="h-8 border-border bg-card/50 text-xs text-foreground"
                                onChange={(event) => {
                                    const value = event.target.value;
                                    updatePhase(phaseKey, (phase) => {
                                        const [chain] = updateRepeaterInTree(phase.chain, repeater.id, (current) => ({
                                            ...current,
                                            label: value,
                                        }));
                                        return { ...phase, chain };
                                    });
                                }}
                            />
                        </div>

                        <div className="mt-2 space-y-2">
                            {repeater.steps.map((step, index) => (
                                <RepeaterStepRenderer
                                    key={step.id}
                                    step={step}
                                    repeater={repeater}
                                    stepIndex={index}
                                    isDiscovery={isDiscovery}
                                    urlTypes={urlTypes}
                                    phaseKey={phaseKey}
                                    updatePhase={updatePhase}
                                    setSelectorFocus={setSelectorFocus}
                                    syncPreviewOnChange={syncPreviewOnChange}
                                    renderPickButton={renderPickButton}
                                />
                            ))}
                        </div>
                    </div>
                );
            })()}

            {scope.pagination && (
                <div className="rounded-lg border border-dashed border-red-500/40 bg-red-500/5 p-2">
                    <div className="mb-2 flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-red-200">
                        <span>Pagination</span>
                        <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            className="h-6 w-6 text-red-300"
                            onClick={() => {
                                updatePhase(phaseKey, (phase) => {
                                    const [chain] = updateScopeInTree(phase.chain, scope.id, (current) => ({
                                        ...current,
                                        pagination: null,
                                    }));
                                    return { ...phase, chain };
                                });
                            }}
                        >
                            <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                        <div className="col-span-2 flex items-center gap-1">
                            <Input
                                value={scope.pagination.css_selector}
                                placeholder="Next selector"
                                className="h-8 border-border bg-card/50 text-xs text-foreground"
                                onFocus={() => setSelectorFocus(paginationTarget, scope.pagination?.css_selector ?? '')}
                                onChange={(event) => {
                                    const value = event.target.value;
                                    updatePhase(phaseKey, (phase) => {
                                        const [chain] = updateScopeInTree(phase.chain, scope.id, (current) => ({
                                            ...current,
                                            pagination: {
                                                ...withPaginationDefaults(current.pagination),
                                                css_selector: value,
                                            },
                                        }));
                                        return { ...phase, chain };
                                    });
                                    syncPreviewOnChange(paginationTarget, value);
                                }}
                            />
                            {renderPickButton(paginationTarget, scope.pagination.css_selector)}
                        </div>
                        <Input
                            type="number"
                            value={scope.pagination.max_pages}
                            placeholder="0 = all"
                            className="h-8 border-border bg-card/50 text-xs text-foreground"
                            onChange={(event) => {
                                const value = Number(event.target.value) || 0;
                                updatePhase(phaseKey, (phase) => {
                                    const [chain] = updateScopeInTree(phase.chain, scope.id, (current) => ({
                                        ...current,
                                        pagination: {
                                            ...withPaginationDefaults(current.pagination),
                                            max_pages: value,
                                        },
                                    }));
                                    return { ...phase, chain };
                                });
                            }}
                        />
                        <Select
                            value={scope.pagination.url?.mode ?? 'hybrid'}
                            onValueChange={(value) => {
                                updatePhase(phaseKey, (phase) => {
                                    const [chain] = updateScopeInTree(phase.chain, scope.id, (current) => {
                                        const pagination = withPaginationDefaults(current.pagination);
                                        const currentUrl = pagination.url!;
                                        return {
                                            ...current,
                                            pagination: {
                                                ...pagination,
                                                url: {
                                                    ...currentUrl,
                                                    mode: value as 'hybrid' | 'url',
                                                },
                                            },
                                        };
                                    });
                                    return { ...phase, chain };
                                });
                            }}
                        >
                            <SelectTrigger className="h-8 border-border bg-card/50 text-xs text-foreground">
                                <SelectValue placeholder="Mode" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="hybrid">Hybrid URL + CSS</SelectItem>
                                <SelectItem value="url">URL only</SelectItem>
                            </SelectContent>
                        </Select>
                        <Input
                            value={scope.pagination.url?.pattern ?? ''}
                            placeholder="URL regex pattern"
                            className="h-8 border-border bg-card/50 text-xs text-foreground"
                            onChange={(event) => {
                                const value = event.target.value;
                                updatePhase(phaseKey, (phase) => {
                                    const [chain] = updateScopeInTree(phase.chain, scope.id, (current) => {
                                        const pagination = withPaginationDefaults(current.pagination);
                                        const currentUrl = pagination.url!;
                                        return {
                                            ...current,
                                            pagination: {
                                                ...pagination,
                                                url: {
                                                    ...currentUrl,
                                                    pattern: value,
                                                },
                                            },
                                        };
                                    });
                                    return { ...phase, chain };
                                });
                            }}
                        />
                        <div className="col-span-2">
                            <Input
                                value={scope.pagination.url?.template ?? ''}
                                placeholder="URL template (must include {page})"
                                className="h-8 border-border bg-card/50 text-xs text-foreground"
                                onChange={(event) => {
                                    const value = event.target.value;
                                    updatePhase(phaseKey, (phase) => {
                                        const [chain] = updateScopeInTree(phase.chain, scope.id, (current) => {
                                            const pagination = withPaginationDefaults(current.pagination);
                                            const currentUrl = pagination.url!;
                                            return {
                                                ...current,
                                                pagination: {
                                                    ...pagination,
                                                    url: {
                                                        ...currentUrl,
                                                        template: value,
                                                    },
                                                },
                                            };
                                        });
                                        return { ...phase, chain };
                                    });
                                }}
                            />
                        </div>
                        <Input
                            type="number"
                            value={scope.pagination.url?.start_page ?? 1}
                            placeholder="Start page"
                            className="h-8 border-border bg-card/50 text-xs text-foreground"
                            onChange={(event) => {
                                const value = Number(event.target.value) || 1;
                                updatePhase(phaseKey, (phase) => {
                                    const [chain] = updateScopeInTree(phase.chain, scope.id, (current) => {
                                        const pagination = withPaginationDefaults(current.pagination);
                                        const currentUrl = pagination.url!;
                                        return {
                                            ...current,
                                            pagination: {
                                                ...pagination,
                                                url: {
                                                    ...currentUrl,
                                                    start_page: value,
                                                },
                                            },
                                        };
                                    });
                                    return { ...phase, chain };
                                });
                            }}
                        />
                        <Input
                            type="number"
                            value={scope.pagination.url?.step ?? 1}
                            placeholder="Step"
                            className="h-8 border-border bg-card/50 text-xs text-foreground"
                            onChange={(event) => {
                                const value = Number(event.target.value) || 1;
                                updatePhase(phaseKey, (phase) => {
                                    const [chain] = updateScopeInTree(phase.chain, scope.id, (current) => {
                                        const pagination = withPaginationDefaults(current.pagination);
                                        const currentUrl = pagination.url!;
                                        return {
                                            ...current,
                                            pagination: {
                                                ...pagination,
                                                url: {
                                                    ...currentUrl,
                                                    step: value,
                                                },
                                            },
                                        };
                                    });
                                    return { ...phase, chain };
                                });
                            }}
                        />
                    </div>
                </div>
            )}

            {scope.children.length > 0 && (
                <div className="space-y-2">
                    {scope.children.map((child) => (
                        <ScopeNodeRenderer
                            key={child.id}
                            scope={child}
                            depth={depth + 1}
                            isDiscovery={isDiscovery}
                            urlTypes={urlTypes}
                            phaseKey={phaseKey}
                            effectiveSelectedScopeId={effectiveSelectedScopeId}
                            effectiveSelectedRepeaterId={effectiveSelectedRepeaterId}
                            setSelectedScopeId={setSelectedScopeId}
                            setSelectedRepeaterId={setSelectedRepeaterId}
                            updatePhase={updatePhase}
                            setSelectorFocus={setSelectorFocus}
                            syncPreviewOnChange={syncPreviewOnChange}
                            renderPickButton={renderPickButton}
                        />
                    ))}
                </div>
            )}
        </ScopeNodeCard>
    );
}
