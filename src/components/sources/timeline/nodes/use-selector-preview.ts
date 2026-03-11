import { useCallback, useRef } from 'react';

export interface SelectorTarget {
    nodeId: string;
    field?: string;
}

interface UseSelectorPreviewOptions {
    onSelectorPreviewChange?: (selector: string | null) => void;
    onSelectorTargetChange?: (target: SelectorTarget | null) => void;
    nodeId: string;
    matchCounts?: Record<string, number>;
}

/**
 * Hook for node cards to drive selector preview highlighting in the iframe
 * and to participate in the pick-from-preview flow.
 */
export function useSelectorPreview(options: UseSelectorPreviewOptions) {
    const { onSelectorPreviewChange, onSelectorTargetChange, nodeId, matchCounts } = options;
    const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

    const preview = useCallback((selector: string | null) => {
        clearTimeout(debounceRef.current);
        onSelectorPreviewChange?.(selector?.trim() || null);
    }, [onSelectorPreviewChange]);

    const previewDebounced = useCallback((selector: string | null) => {
        clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => {
            onSelectorPreviewChange?.(selector?.trim() || null);
        }, 300);
    }, [onSelectorPreviewChange]);

    const clearPreview = useCallback(() => {
        clearTimeout(debounceRef.current);
        onSelectorPreviewChange?.(null);
    }, [onSelectorPreviewChange]);

    /** Mark this node (and optionally a sub-field) as the pick target */
    const setPickTarget = useCallback((field?: string) => {
        onSelectorTargetChange?.({ nodeId, field });
    }, [onSelectorTargetChange, nodeId]);

    /** Clear pick target when focus leaves */
    const clearPickTarget = useCallback(() => {
        onSelectorTargetChange?.(null);
    }, [onSelectorTargetChange]);

    /** Get the cached match count for a selector string */
    const getMatchCount = useCallback((selector: string): number | undefined => {
        if (!selector.trim()) return undefined;
        return matchCounts?.[selector.trim()];
    }, [matchCounts]);

    return { preview, previewDebounced, clearPreview, setPickTarget, clearPickTarget, getMatchCount };
}
