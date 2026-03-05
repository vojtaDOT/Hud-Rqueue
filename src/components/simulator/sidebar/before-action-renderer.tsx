'use client';

import type { ReactNode } from 'react';
import { ArrowDown, ArrowUp, Trash2 } from 'lucide-react';

import type { BeforeAction, PhaseConfig } from '@/lib/crawler-types';
import { type FocusTarget, moveItem } from '@/lib/workflow-tree';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { BeforeActionCard } from '@/components/simulator/sidebar/before-action-card';
import {
    PLAYWRIGHT_BEFORE_STEP_TYPES,
} from '@/components/simulator/sidebar/hooks/use-workflow-state';

import type { PhaseKey } from '@/components/simulator/sidebar/hooks/use-workflow-state';

/* ------------------------------------------------------------------ */
/*  getActionLabel (moved from simulator-sidebar.tsx)                   */
/* ------------------------------------------------------------------ */

export function getActionLabel(action: BeforeAction): string {
    if (action.type === 'remove_element') return 'Remove Element';
    if (action.type === 'wait_timeout') return 'Wait Timeout';
    return PLAYWRIGHT_BEFORE_STEP_TYPES.find((item) => item.value === action.type)?.label ?? action.type;
}

/* ------------------------------------------------------------------ */
/*  Props                                                              */
/* ------------------------------------------------------------------ */

export interface BeforeActionRendererProps {
    action: BeforeAction;
    index: number;
    phaseKey: PhaseKey;
    updatePhase: (phaseKey: PhaseKey, updater: (phase: PhaseConfig) => PhaseConfig) => void;
    setSelectorFocus: (target: FocusTarget, currentValue: string) => void;
    syncPreviewOnChange: (target: FocusTarget, value: string) => void;
    renderPickButton: (target: FocusTarget, currentValue: string) => ReactNode;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function BeforeActionRenderer({
    action,
    index,
    phaseKey,
    updatePhase,
    setSelectorFocus,
    syncPreviewOnChange,
    renderPickButton,
}: BeforeActionRendererProps) {
    const target: FocusTarget = phaseKey.phase === 'discovery'
        ? { phase: 'discovery', section: 'before', index }
        : { phase: 'processing', urlTypeId: phaseKey.urlTypeId, section: 'before', index };

    return (
        <BeforeActionCard
            title={getActionLabel(action)}
            actions={(
                <>
                    <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="h-6 w-6"
                        onClick={() => updatePhase(phaseKey, (phase) => ({
                            ...phase,
                            before: moveItem(phase.before, index, index - 1),
                        }))}
                    >
                        <ArrowUp className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="h-6 w-6"
                        onClick={() => updatePhase(phaseKey, (phase) => ({
                            ...phase,
                            before: moveItem(phase.before, index, index + 1),
                        }))}
                    >
                        <ArrowDown className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="h-6 w-6 text-red-300"
                        onClick={() => updatePhase(phaseKey, (phase) => ({
                            ...phase,
                            before: phase.before.filter((_, i) => i !== index),
                        }))}
                    >
                        <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                </>
            )}
        >

            {action.type === 'remove_element' && (
                <div className="flex items-center gap-1">
                    <Input
                        value={action.css_selector}
                        placeholder="CSS selector"
                        className="h-8 border-border bg-card/50 text-xs text-foreground"
                        onFocus={() => setSelectorFocus(target, action.css_selector)}
                        onChange={(event) => {
                            const value = event.target.value;
                            updatePhase(phaseKey, (phase) => ({
                                ...phase,
                                before: phase.before.map((item, i) => (
                                    i === index && item.type === 'remove_element' ? { ...item, css_selector: value } : item
                                )),
                            }));
                            syncPreviewOnChange(target, value);
                        }}
                    />
                    {renderPickButton(target, action.css_selector)}
                </div>
            )}

            {action.type === 'wait_timeout' && (
                <Input
                    type="number"
                    value={action.ms}
                    placeholder="Timeout ms"
                    className="h-8 border-border bg-card/50 text-xs text-foreground"
                    onChange={(event) => {
                        const value = Number(event.target.value) || 0;
                        updatePhase(phaseKey, (phase) => ({
                            ...phase,
                            before: phase.before.map((item, i) => (
                                i === index && item.type === 'wait_timeout' ? { ...item, ms: value } : item
                            )),
                        }));
                    }}
                />
            )}

            {action.type === 'wait_selector' && (
                <div className="grid grid-cols-2 gap-2">
                    <div className="col-span-2 flex items-center gap-1">
                        <Input
                            value={action.css_selector}
                            placeholder="CSS selector"
                            className="h-8 border-border bg-card/50 text-xs text-foreground"
                            onFocus={() => setSelectorFocus(target, action.css_selector)}
                            onChange={(event) => {
                                const value = event.target.value;
                                updatePhase(phaseKey, (phase) => ({
                                    ...phase,
                                    before: phase.before.map((item, i) => (
                                        i === index && item.type === 'wait_selector' ? { ...item, css_selector: value } : item
                                    )),
                                }));
                                syncPreviewOnChange(target, value);
                            }}
                        />
                        {renderPickButton(target, action.css_selector)}
                    </div>
                    <Input
                        type="number"
                        value={action.timeout_ms}
                        placeholder="Timeout ms"
                        className="h-8 border-border bg-card/50 text-xs text-foreground"
                        onChange={(event) => {
                            const value = Number(event.target.value) || 0;
                            updatePhase(phaseKey, (phase) => ({
                                ...phase,
                                before: phase.before.map((item, i) => (
                                    i === index && item.type === 'wait_selector' ? { ...item, timeout_ms: value } : item
                                )),
                            }));
                        }}
                    />
                </div>
            )}

            {action.type === 'wait_network' && (
                <Select
                    value={action.state}
                    onValueChange={(value) => {
                        updatePhase(phaseKey, (phase) => ({
                            ...phase,
                            before: phase.before.map((item, i) => (
                                i === index && item.type === 'wait_network'
                                    ? { ...item, state: value as 'networkidle' | 'domcontentloaded' | 'load' }
                                    : item
                            )),
                        }));
                    }}
                >
                    <SelectTrigger className="h-8 border-border bg-card/50 text-xs text-foreground">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="networkidle">networkidle</SelectItem>
                        <SelectItem value="domcontentloaded">domcontentloaded</SelectItem>
                        <SelectItem value="load">load</SelectItem>
                    </SelectContent>
                </Select>
            )}

            {action.type === 'click' && (
                <div className="grid grid-cols-2 gap-2">
                    <div className="col-span-2 flex items-center gap-1">
                        <Input
                            value={action.css_selector}
                            placeholder="CSS selector"
                            className="h-8 border-border bg-card/50 text-xs text-foreground"
                            onFocus={() => setSelectorFocus(target, action.css_selector)}
                            onChange={(event) => {
                                const value = event.target.value;
                                updatePhase(phaseKey, (phase) => ({
                                    ...phase,
                                    before: phase.before.map((item, i) => (
                                        i === index && item.type === 'click' ? { ...item, css_selector: value } : item
                                    )),
                                }));
                                syncPreviewOnChange(target, value);
                            }}
                        />
                        {renderPickButton(target, action.css_selector)}
                    </div>
                    <Input
                        type="number"
                        value={action.wait_after_ms ?? 0}
                        placeholder="Wait ms"
                        className="h-8 border-border bg-card/50 text-xs text-foreground"
                        onChange={(event) => {
                            const value = Number(event.target.value) || 0;
                            updatePhase(phaseKey, (phase) => ({
                                ...phase,
                                before: phase.before.map((item, i) => (
                                    i === index && item.type === 'click' ? { ...item, wait_after_ms: value } : item
                                )),
                            }));
                        }}
                    />
                </div>
            )}

            {action.type === 'scroll' && (
                <div className="grid grid-cols-2 gap-2">
                    <Input
                        type="number"
                        value={action.count}
                        placeholder="Count"
                        className="h-8 border-border bg-card/50 text-xs text-foreground"
                        onChange={(event) => {
                            const value = Number(event.target.value) || 0;
                            updatePhase(phaseKey, (phase) => ({
                                ...phase,
                                before: phase.before.map((item, i) => (
                                    i === index && item.type === 'scroll' ? { ...item, count: value } : item
                                )),
                            }));
                        }}
                    />
                    <Input
                        type="number"
                        value={action.delay_ms}
                        placeholder="Delay ms"
                        className="h-8 border-border bg-card/50 text-xs text-foreground"
                        onChange={(event) => {
                            const value = Number(event.target.value) || 0;
                            updatePhase(phaseKey, (phase) => ({
                                ...phase,
                                before: phase.before.map((item, i) => (
                                    i === index && item.type === 'scroll' ? { ...item, delay_ms: value } : item
                                )),
                            }));
                        }}
                    />
                </div>
            )}

            {action.type === 'fill' && (
                <div className="space-y-2">
                    <div className="flex items-center gap-1">
                        <Input
                            value={action.css_selector}
                            placeholder="CSS selector"
                            className="h-8 border-border bg-card/50 text-xs text-foreground"
                            onFocus={() => setSelectorFocus(target, action.css_selector)}
                            onChange={(event) => {
                                const value = event.target.value;
                                updatePhase(phaseKey, (phase) => ({
                                    ...phase,
                                    before: phase.before.map((item, i) => (
                                        i === index && item.type === 'fill' ? { ...item, css_selector: value } : item
                                    )),
                                }));
                                syncPreviewOnChange(target, value);
                            }}
                        />
                        {renderPickButton(target, action.css_selector)}
                    </div>
                    <Input
                        value={action.value}
                        placeholder="Value"
                        className="h-8 border-border bg-card/50 text-xs text-foreground"
                        onChange={(event) => {
                            const value = event.target.value;
                            updatePhase(phaseKey, (phase) => ({
                                ...phase,
                                before: phase.before.map((item, i) => (
                                    i === index && item.type === 'fill' ? { ...item, value } : item
                                )),
                            }));
                        }}
                    />
                    <label className="flex items-center gap-2 text-xs text-muted-foreground">
                        <input
                            type="checkbox"
                            checked={action.press_enter}
                            onChange={(event) => {
                                updatePhase(phaseKey, (phase) => ({
                                    ...phase,
                                    before: phase.before.map((item, i) => (
                                        i === index && item.type === 'fill' ? { ...item, press_enter: event.target.checked } : item
                                    )),
                                }));
                            }}
                        />
                        Press enter
                    </label>
                </div>
            )}

            {action.type === 'select_option' && (
                <div className="grid grid-cols-2 gap-2">
                    <div className="col-span-2 flex items-center gap-1">
                        <Input
                            value={action.css_selector}
                            placeholder="CSS selector"
                            className="h-8 border-border bg-card/50 text-xs text-foreground"
                            onFocus={() => setSelectorFocus(target, action.css_selector)}
                            onChange={(event) => {
                                const value = event.target.value;
                                updatePhase(phaseKey, (phase) => ({
                                    ...phase,
                                    before: phase.before.map((item, i) => (
                                        i === index && item.type === 'select_option' ? { ...item, css_selector: value } : item
                                    )),
                                }));
                                syncPreviewOnChange(target, value);
                            }}
                        />
                        {renderPickButton(target, action.css_selector)}
                    </div>
                    <Input
                        value={action.value}
                        placeholder="Value"
                        className="h-8 border-border bg-card/50 text-xs text-foreground"
                        onChange={(event) => {
                            const value = event.target.value;
                            updatePhase(phaseKey, (phase) => ({
                                ...phase,
                                before: phase.before.map((item, i) => (
                                    i === index && item.type === 'select_option' ? { ...item, value } : item
                                )),
                            }));
                        }}
                    />
                </div>
            )}

            {action.type === 'evaluate' && (
                <Input
                    value={action.script}
                    placeholder="JavaScript"
                    className="h-8 border-border bg-card/50 text-xs text-foreground"
                    onChange={(event) => {
                        const value = event.target.value;
                        updatePhase(phaseKey, (phase) => ({
                            ...phase,
                            before: phase.before.map((item, i) => (
                                i === index && item.type === 'evaluate' ? { ...item, script: value } : item
                            )),
                        }));
                    }}
                />
            )}

            {action.type === 'screenshot' && (
                <Input
                    value={action.filename}
                    placeholder="Filename"
                    className="h-8 border-border bg-card/50 text-xs text-foreground"
                    onChange={(event) => {
                        const value = event.target.value;
                        updatePhase(phaseKey, (phase) => ({
                            ...phase,
                            before: phase.before.map((item, i) => (
                                i === index && item.type === 'screenshot' ? { ...item, filename: value } : item
                            )),
                        }));
                    }}
                />
            )}
        </BeforeActionCard>
    );
}
