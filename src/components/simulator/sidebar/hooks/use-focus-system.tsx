import type { ReactNode } from 'react';
import { useCallback, useEffect, useState } from 'react';
import { Crosshair } from 'lucide-react';

import { cn } from '@/lib/utils';
import type { ElementSelector, PhaseConfig } from '@/lib/crawler-types';
import {
    actionHasSelector,
    findScopeForRepeater,
    findScopeForStep,
    findScopeInTree,
    firstStepTarget,
    FocusTarget,
    isSameTarget,
    normalizeSelectorWithinScope,
} from '@/lib/workflow-tree';
import { Button } from '@/components/ui/button';

import type { PhaseKey } from './use-workflow-state';

/* ------------------------------------------------------------------ */
/*  Hook options                                                       */
/* ------------------------------------------------------------------ */

export interface UseFocusSystemOptions {
    onSelectorPreviewChange?: (selector: string | null) => void;
    currentPhaseKey: PhaseKey;
    currentPhase: PhaseConfig;
    effectiveSelectedRepeaterId: string | null;
    effectiveSelectedScopeId: string | null;
}

/* ------------------------------------------------------------------ */
/*  Hook                                                               */
/* ------------------------------------------------------------------ */

export function useFocusSystem(options: UseFocusSystemOptions) {
    const {
        onSelectorPreviewChange,
        currentPhaseKey,
        currentPhase,
        effectiveSelectedRepeaterId,
        effectiveSelectedScopeId,
    } = options;

    const [focusedTarget, setFocusedTarget] = useState<FocusTarget | null>(null);
    const [armedTarget, setArmedTarget] = useState<FocusTarget | null>(null);

    /* --- setSelectorFocus --- */
    const setSelectorFocus = useCallback((target: FocusTarget, selector: string) => {
        setFocusedTarget(target);
        onSelectorPreviewChange?.(selector.trim() ? selector : null);
    }, [onSelectorPreviewChange]);

    /* --- armSelectorTarget --- */
    const armSelectorTarget = useCallback((target: FocusTarget, selector: string) => {
        setFocusedTarget(target);
        setArmedTarget(target);
        onSelectorPreviewChange?.(selector.trim() ? selector : null);
    }, [onSelectorPreviewChange]);

    /* --- cancelArmedTarget --- */
    const cancelArmedTarget = useCallback(() => {
        setArmedTarget(null);
    }, []);

    /* --- Escape key handler --- */
    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key !== 'Escape') return;
            if (!armedTarget) return;
            event.preventDefault();
            setArmedTarget(null);
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [armedTarget]);

    /* --- syncPreviewOnChange --- */
    const syncPreviewOnChange = useCallback((target: FocusTarget, value: string) => {
        if (isSameTarget(target, focusedTarget)) {
            onSelectorPreviewChange?.(value.trim() ? value : null);
        }
    }, [focusedTarget, onSelectorPreviewChange]);

    /* --- getFallbackTarget --- */
    const getFallbackTarget = useCallback((): FocusTarget | null => {
        if (effectiveSelectedRepeaterId) {
            return currentPhaseKey.phase === 'discovery'
                ? { phase: 'discovery', section: 'repeater', repeaterId: effectiveSelectedRepeaterId }
                : { phase: 'processing', urlTypeId: currentPhaseKey.urlTypeId, section: 'repeater', repeaterId: effectiveSelectedRepeaterId };
        }

        if (effectiveSelectedScopeId) {
            return currentPhaseKey.phase === 'discovery'
                ? { phase: 'discovery', section: 'scope', scopeId: effectiveSelectedScopeId }
                : { phase: 'processing', urlTypeId: currentPhaseKey.urlTypeId, section: 'scope', scopeId: effectiveSelectedScopeId };
        }

        const firstActionIndex = currentPhase.before.findIndex((action) => actionHasSelector(action));
        if (firstActionIndex >= 0) {
            return currentPhaseKey.phase === 'discovery'
                ? { phase: 'discovery', section: 'before', index: firstActionIndex }
                : { phase: 'processing', urlTypeId: currentPhaseKey.urlTypeId, section: 'before', index: firstActionIndex };
        }

        return firstStepTarget(currentPhase.chain, currentPhaseKey);
    }, [
        currentPhase.before,
        currentPhase.chain,
        currentPhaseKey,
        effectiveSelectedRepeaterId,
        effectiveSelectedScopeId,
    ]);

    /* --- resolveSelectorForTarget --- */
    const resolveSelectorForTarget = useCallback((
        phase: PhaseConfig,
        target: FocusTarget,
        selector: string,
        elementInfo?: ElementSelector,
    ): string => {
        const baseSelector = (elementInfo?.localSelector ?? selector).trim();
        if (!baseSelector) return '';

        if (target.section === 'repeater') {
            const scope = findScopeForRepeater(phase.chain, target.repeaterId);
            return normalizeSelectorWithinScope(baseSelector, scope?.css_selector);
        }

        if (target.section === 'step') {
            const scope = findScopeForStep(phase.chain, target.stepId);
            return normalizeSelectorWithinScope(baseSelector, scope?.css_selector);
        }

        if (target.section === 'pagination') {
            const scope = findScopeInTree(phase.chain, target.scopeId);
            return normalizeSelectorWithinScope(baseSelector, scope?.css_selector);
        }

        return baseSelector;
    }, []);

    /* --- renderPickButton --- */
    const renderPickButton = useCallback((target: FocusTarget, selector: string): ReactNode => (
        <Button
            type="button"
            size="icon"
            variant="ghost"
            className={cn(
                'h-8 w-8 border border-border',
                isSameTarget(target, armedTarget) ? 'bg-primary/30 text-primary' : 'text-muted-foreground',
            )}
            title="Pick target selector"
            onClick={() => armSelectorTarget(target, selector)}
        >
            <Crosshair className="h-3.5 w-3.5" />
        </Button>
    ), [armedTarget, armSelectorTarget]);

    return {
        focusedTarget,
        setFocusedTarget,
        armedTarget,
        setArmedTarget,
        setSelectorFocus,
        armSelectorTarget,
        cancelArmedTarget,
        syncPreviewOnChange,
        getFallbackTarget,
        resolveSelectorForTarget,
        renderPickButton,
    };
}
