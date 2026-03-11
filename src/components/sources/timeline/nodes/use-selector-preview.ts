import { useCallback, useRef } from 'react';

/**
 * Hook for node cards to drive selector preview highlighting in the iframe.
 * - onSelectorFocus: call when the card or its selector input is focused
 * - onSelectorBlur: call when focus leaves the card entirely
 * - onSelectorChange: call on every keystroke in the selector input (debounced 300ms)
 */
export function useSelectorPreview(
    onSelectorPreviewChange?: (selector: string | null) => void,
) {
    const debounceRef = useRef<ReturnType<typeof setTimeout>>();

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

    return { preview, previewDebounced, clearPreview };
}
