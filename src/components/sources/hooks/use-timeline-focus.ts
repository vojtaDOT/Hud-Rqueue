'use client';

import { useCallback, useState } from 'react';

import type { TimelineFocusTarget } from '@/lib/workflow-tree';
import { isSameTimelineTarget } from '@/lib/workflow-tree';

export function useTimelineFocus() {
    const [focusTarget, setFocusTarget] = useState<TimelineFocusTarget | null>(null);

    const focus = useCallback((target: TimelineFocusTarget) => {
        setFocusTarget((prev) => {
            if (isSameTimelineTarget(prev, target)) return prev;
            return target;
        });
    }, []);

    const clearFocus = useCallback(() => {
        setFocusTarget(null);
    }, []);

    const isFocused = useCallback((target: TimelineFocusTarget) => {
        return isSameTimelineTarget(focusTarget, target);
    }, [focusTarget]);

    return {
        focusTarget,
        focus,
        clearFocus,
        isFocused,
    };
}
