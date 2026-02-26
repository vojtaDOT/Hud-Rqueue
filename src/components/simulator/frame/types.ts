import { ElementSelector, PageType } from '@/lib/crawler-types';

export interface SimulatorElementInfo {
    selector: string;
    localSelector?: string;
    framePath?: string[];
    inIframe?: boolean;
    tagName: string;
    textContent: string;
    isList: boolean;
    listItemCount?: number;
    parentSelector?: string;
}

export interface InspectorNode {
    nodeId: string;
    parentId: string | null;
    tag: string;
    text: string;
    selector: string;
    hasChildren: boolean;
    badges: string[];
    framePath?: string[];
    attrs?: {
        id?: string;
        className?: string;
    };
}

export interface SelectorSuggestion {
    kind: 'stable' | 'scoped' | 'strict';
    selector: string;
    score: number;
    matches: number;
}

export type InteractionMode = 'select' | 'remove' | null;

export type RenderMode = 'proxy' | 'playwright' | 'loading';

export interface FrameSelectionPayload {
    selector: string;
    elementInfo: ElementSelector;
}

export type FramePageType = PageType;
