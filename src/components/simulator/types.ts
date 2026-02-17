export type BlockType = 'select' | 'extract' | 'source' | 'click' | 'pagination' | 'mainloop' | 'remove_element';

export interface BlockData {
    id: string;
    type: BlockType;
    label: string;
    config?: Record<string, string | number | undefined>;
}

export interface SourceData {
    id: string;
    url: string;
    label: string;
    steps: BlockData[];
    loopConfig?: {
        enabled: boolean;
        maxIterations?: number;
        waitBetweenIterations?: number;
    };
}

export interface WorkflowData {
    mainLoop: BlockData[];
    sources: SourceData[];
}

export type {
    ScrapingWorkflow,
    PhaseConfig,
    SourceUrlType,
    RepeaterStep,
    DataExtractStep,
    DownloadFileStep,
    SourceUrlStep,
    BeforeAction,
    PlaywrightAction,
    ScopeModule,
    RepeaterNode,
    PaginationConfig,
} from '@/lib/crawler-types';
