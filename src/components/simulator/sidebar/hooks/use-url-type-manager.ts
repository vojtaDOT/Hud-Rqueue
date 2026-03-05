import { useMemo, useState } from 'react';
import type { ScrapingWorkflow, SourceUrlType } from '@/lib/crawler-types';
import {
    createEmptyPhase,
    createId,
    mapStepsInTree,
} from '@/lib/workflow-tree';

import type { PhaseTab } from './use-workflow-state';

/* ------------------------------------------------------------------ */
/*  Hook                                                               */
/* ------------------------------------------------------------------ */

export function useUrlTypeManager(
    workflow: ScrapingWorkflow,
    setWorkflow: React.Dispatch<React.SetStateAction<ScrapingWorkflow>>,
    setActiveTab: (tab: PhaseTab) => void,
) {
    const [activeUrlTypeId, setActiveUrlTypeId] = useState<string>(() => workflow.url_types[0].id);

    const activeUrlType = useMemo(
        () => workflow.url_types.find((item) => item.id === activeUrlTypeId) ?? workflow.url_types[0],
        [workflow.url_types, activeUrlTypeId],
    );

    const handleUrlTypeAdd = () => {
        const newUrlType: SourceUrlType = {
            id: createId('url-type'),
            name: `URL Type ${workflow.url_types.length + 1}`,
            processing: createEmptyPhase(),
        };
        setWorkflow((prev) => ({ ...prev, url_types: [...prev.url_types, newUrlType] }));
        setActiveUrlTypeId(newUrlType.id);
        setActiveTab('processing');
    };

    const handleUrlTypeRename = (urlType: SourceUrlType) => {
        const nextName = window.prompt('URL Type name', urlType.name)?.trim();
        if (!nextName) return;
        setWorkflow((prev) => ({
            ...prev,
            url_types: prev.url_types.map((item) => (
                item.id === urlType.id ? { ...item, name: nextName } : item
            )),
        }));
    };

    const handleUrlTypeDelete = (id: string) => {
        if (workflow.url_types.length <= 1) return;
        const nextUrlTypes = workflow.url_types.filter((item) => item.id !== id);
        const fallbackId = nextUrlTypes[0].id;
        setWorkflow((prev) => ({
            ...prev,
            url_types: nextUrlTypes,
            discovery: {
                ...prev.discovery,
                chain: mapStepsInTree(prev.discovery.chain, (step) => (
                    step.type === 'source_url' && step.url_type_id === id
                        ? { ...step, url_type_id: fallbackId }
                        : step
                )),
            },
        }));
        if (activeUrlTypeId === id) {
            setActiveUrlTypeId(fallbackId);
        }
    };

    return {
        activeUrlTypeId,
        setActiveUrlTypeId,
        activeUrlType,
        handleUrlTypeAdd,
        handleUrlTypeRename,
        handleUrlTypeDelete,
    };
}
