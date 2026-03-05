'use client';

import type { ReactNode } from 'react';
import { ArrowDown, ArrowUp, Download, FileText, FolderTree, Link2, Trash2 } from 'lucide-react';

import type { PhaseConfig, RepeaterNode, RepeaterStep, SourceUrlType } from '@/lib/crawler-types';
import {
    type FocusTarget,
    moveItem,
    removeStepFromTree,
    type SelectorKey,
    updateRepeaterInTree,
    updateStepInTree,
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
import { RepeaterStepCard } from '@/components/simulator/sidebar/repeater-step-card';

import type { PhaseKey } from '@/components/simulator/sidebar/hooks/use-workflow-state';

/* ------------------------------------------------------------------ */
/*  Props                                                              */
/* ------------------------------------------------------------------ */

export interface RepeaterStepRendererProps {
    step: RepeaterStep;
    repeater: RepeaterNode;
    stepIndex: number;
    isDiscovery: boolean;
    urlTypes: SourceUrlType[];
    phaseKey: PhaseKey;
    updatePhase: (phaseKey: PhaseKey, updater: (phase: PhaseConfig) => PhaseConfig) => void;
    setSelectorFocus: (target: FocusTarget, currentValue: string) => void;
    syncPreviewOnChange: (target: FocusTarget, value: string) => void;
    renderPickButton: (target: FocusTarget, currentValue: string) => ReactNode;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function RepeaterStepRenderer({
    step,
    repeater,
    stepIndex,
    isDiscovery,
    urlTypes,
    phaseKey,
    updatePhase,
    setSelectorFocus,
    syncPreviewOnChange,
    renderPickButton,
}: RepeaterStepRendererProps) {
    const stepTarget = (selectorKey: SelectorKey): FocusTarget => (
        phaseKey.phase === 'discovery'
            ? { phase: 'discovery', section: 'step', stepId: step.id, selectorKey }
            : { phase: 'processing', urlTypeId: phaseKey.urlTypeId, section: 'step', stepId: step.id, selectorKey }
    );

    const stepTitle = step.type === 'source_url'
        ? 'Source URL'
        : step.type === 'document_url'
            ? 'Document URL'
        : step.type === 'download_file'
            ? 'Download File'
            : 'Data Extract';

    return (
        <RepeaterStepCard
            header={(
                <>
                    {step.type === 'source_url' && <Link2 className="h-3.5 w-3.5 text-cyan-300" />}
                    {step.type === 'document_url' && <FileText className="h-3.5 w-3.5 text-sky-300" />}
                    {step.type === 'download_file' && <Download className="h-3.5 w-3.5 text-emerald-300" />}
                    {step.type === 'data_extract' && <FolderTree className="h-3.5 w-3.5 text-green-300" />}
                    <span>{stepTitle}</span>
                </>
            )}
            actions={(
                <>
                    <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="h-6 w-6"
                        onClick={() => updatePhase(phaseKey, (phase) => {
                            const [chain] = updateRepeaterInTree(phase.chain, repeater.id, (current) => ({
                                ...current,
                                steps: moveItem(current.steps, stepIndex, stepIndex - 1),
                            }));
                            return { ...phase, chain };
                        })}
                    >
                        <ArrowUp className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="h-6 w-6"
                        onClick={() => updatePhase(phaseKey, (phase) => {
                            const [chain] = updateRepeaterInTree(phase.chain, repeater.id, (current) => ({
                                ...current,
                                steps: moveItem(current.steps, stepIndex, stepIndex + 1),
                            }));
                            return { ...phase, chain };
                        })}
                    >
                        <ArrowDown className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="h-6 w-6 text-red-300"
                        onClick={() => updatePhase(phaseKey, (phase) => {
                            const [chain] = removeStepFromTree(phase.chain, step.id);
                            return { ...phase, chain };
                        })}
                    >
                        <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                </>
            )}
        >

            {step.type === 'source_url' && (
                <div className="space-y-2">
                    <div className="flex items-center gap-1">
                        <Input
                            value={step.selector}
                            placeholder="Selector for source URL"
                            className="h-8 border-border bg-card/50 text-xs text-foreground"
                            onFocus={() => setSelectorFocus(stepTarget('selector'), step.selector)}
                            onChange={(event) => {
                                const value = event.target.value;
                                updatePhase(phaseKey, (phase) => {
                                    const [chain] = updateStepInTree(phase.chain, step.id, (current) => (
                                        current.type === 'source_url' ? { ...current, selector: value } : current
                                    ));
                                    return { ...phase, chain };
                                });
                                syncPreviewOnChange(stepTarget('selector'), value);
                            }}
                        />
                        {renderPickButton(stepTarget('selector'), step.selector)}
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                        <Input
                            value="href"
                            disabled
                            className="h-8 border-border bg-card/50 text-xs text-muted-foreground"
                        />
                        <Select
                            value={step.url_type_id ?? urlTypes[0]?.id}
                            disabled={!isDiscovery}
                            onValueChange={(value) => {
                                updatePhase(phaseKey, (phase) => {
                                    const [chain] = updateStepInTree(phase.chain, step.id, (current) => (
                                        current.type === 'source_url' ? { ...current, url_type_id: value } : current
                                    ));
                                    return { ...phase, chain };
                                });
                            }}
                        >
                            <SelectTrigger className="h-8 border-border bg-card/50 text-xs text-foreground">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {urlTypes.map((urlType) => (
                                    <SelectItem key={urlType.id} value={urlType.id}>
                                        {urlType.name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                </div>
            )}

            {step.type === 'document_url' && (
                <div className="space-y-2">
                    <div className="flex items-center gap-1">
                        <Input
                            value={step.selector}
                            placeholder="Selector for document URL"
                            className="h-8 border-border bg-card/50 text-xs text-foreground"
                            onFocus={() => setSelectorFocus(stepTarget('selector'), step.selector)}
                            onChange={(event) => {
                                const value = event.target.value;
                                updatePhase(phaseKey, (phase) => {
                                    const [chain] = updateStepInTree(phase.chain, step.id, (current) => (
                                        current.type === 'document_url' ? { ...current, selector: value } : current
                                    ));
                                    return { ...phase, chain };
                                });
                                syncPreviewOnChange(stepTarget('selector'), value);
                            }}
                        />
                        {renderPickButton(stepTarget('selector'), step.selector)}
                    </div>
                    <div className="flex items-center gap-1">
                        <Input
                            value={step.filename_selector ?? ''}
                            placeholder="Filename selector (optional)"
                            className="h-8 border-border bg-card/50 text-xs text-foreground"
                            onFocus={() => setSelectorFocus(stepTarget('filename_selector'), step.filename_selector ?? '')}
                            onChange={(event) => {
                                const value = event.target.value;
                                updatePhase(phaseKey, (phase) => {
                                    const [chain] = updateStepInTree(phase.chain, step.id, (current) => (
                                        current.type === 'document_url' ? { ...current, filename_selector: value } : current
                                    ));
                                    return { ...phase, chain };
                                });
                                syncPreviewOnChange(stepTarget('filename_selector'), value);
                            }}
                        />
                        {renderPickButton(stepTarget('filename_selector'), step.filename_selector ?? '')}
                    </div>
                </div>
            )}

            {step.type === 'download_file' && (
                <div className="space-y-2">
                    <div className="flex items-center gap-1">
                        <Input
                            value={step.url_selector}
                            placeholder="File URL selector"
                            className="h-8 border-border bg-card/50 text-xs text-foreground"
                            onFocus={() => setSelectorFocus(stepTarget('url_selector'), step.url_selector)}
                            onChange={(event) => {
                                const value = event.target.value;
                                updatePhase(phaseKey, (phase) => {
                                    const [chain] = updateStepInTree(phase.chain, step.id, (current) => (
                                        current.type === 'download_file' ? { ...current, url_selector: value } : current
                                    ));
                                    return { ...phase, chain };
                                });
                                syncPreviewOnChange(stepTarget('url_selector'), value);
                            }}
                        />
                        {renderPickButton(stepTarget('url_selector'), step.url_selector)}
                    </div>
                    <div className="flex items-center gap-1">
                        <Input
                            value={step.filename_selector ?? ''}
                            placeholder="Filename selector (optional)"
                            className="h-8 border-border bg-card/50 text-xs text-foreground"
                            onFocus={() => setSelectorFocus(stepTarget('filename_selector'), step.filename_selector ?? '')}
                            onChange={(event) => {
                                const value = event.target.value;
                                updatePhase(phaseKey, (phase) => {
                                    const [chain] = updateStepInTree(phase.chain, step.id, (current) => (
                                        current.type === 'download_file' ? { ...current, filename_selector: value } : current
                                    ));
                                    return { ...phase, chain };
                                });
                                syncPreviewOnChange(stepTarget('filename_selector'), value);
                            }}
                        />
                        {renderPickButton(stepTarget('filename_selector'), step.filename_selector ?? '')}
                    </div>
                    <Input
                        value={step.file_type_hint ?? ''}
                        placeholder="File type hint (optional)"
                        className="h-8 border-border bg-card/50 text-xs text-foreground"
                        onChange={(event) => {
                            const value = event.target.value;
                            updatePhase(phaseKey, (phase) => {
                                const [chain] = updateStepInTree(phase.chain, step.id, (current) => (
                                    current.type === 'download_file' ? { ...current, file_type_hint: value } : current
                                ));
                                return { ...phase, chain };
                            });
                        }}
                    />
                </div>
            )}

            {step.type === 'data_extract' && (
                <div className="space-y-2">
                    <div className="grid grid-cols-2 gap-2">
                        <Input
                            value={step.key}
                            placeholder="Output key"
                            className="h-8 border-border bg-card/50 text-xs text-foreground"
                            onChange={(event) => {
                                const value = event.target.value;
                                updatePhase(phaseKey, (phase) => {
                                    const [chain] = updateStepInTree(phase.chain, step.id, (current) => (
                                        current.type === 'data_extract' ? { ...current, key: value } : current
                                    ));
                                    return { ...phase, chain };
                                });
                            }}
                        />
                        <Select
                            value={step.extract_type}
                            onValueChange={(value) => {
                                updatePhase(phaseKey, (phase) => {
                                    const [chain] = updateStepInTree(phase.chain, step.id, (current) => (
                                        current.type === 'data_extract'
                                            ? { ...current, extract_type: value as 'text' | 'href' }
                                            : current
                                    ));
                                    return { ...phase, chain };
                                });
                            }}
                        >
                            <SelectTrigger className="h-8 border-border bg-card/50 text-xs text-foreground">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="text">Text</SelectItem>
                                <SelectItem value="href">Href</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="flex items-center gap-1">
                        <Input
                            value={step.selector}
                            placeholder="CSS selector"
                            className="h-8 border-border bg-card/50 text-xs text-foreground"
                            onFocus={() => setSelectorFocus(stepTarget('selector'), step.selector)}
                            onChange={(event) => {
                                const value = event.target.value;
                                updatePhase(phaseKey, (phase) => {
                                    const [chain] = updateStepInTree(phase.chain, step.id, (current) => (
                                        current.type === 'data_extract' ? { ...current, selector: value } : current
                                    ));
                                    return { ...phase, chain };
                                });
                                syncPreviewOnChange(stepTarget('selector'), value);
                            }}
                        />
                        {renderPickButton(stepTarget('selector'), step.selector)}
                    </div>
                </div>
            )}
        </RepeaterStepCard>
    );
}
