export type JobType = 'scrapy' | 'ocr';

export type ScrapyMethod = 'discover' | 'redownload' | 'discover_source_url';

/** Which table to pick from */
export type ScrapyTarget = 'sources' | 'source_urls';
export type OcrTarget = 'source_urls' | 'documents';

export interface WizardData {
    jobType: JobType | null;
    // Target table
    scrapyTarget: ScrapyTarget;
    ocrTarget: OcrTarget;
    // Sources table selection
    sourceId: string;
    sourceName: string;
    sourceUrl: string;
    // Source URLs table selection
    sourceUrlId: string;
    sourceUrlLabel: string;
    sourceUrlUrl: string;
    // Documents table selection
    documentId: string;
    documentName: string;
    documentUrl: string;
    // Common
    maxAttempts: number;
    cronTime: string;
    // Scrapy-specific
    method: ScrapyMethod;
    bulkCount: number;
    // OCR-specific
    ocrLanguage: string;
    ocrPsm: number;
    ocrOem: number;
}

export const defaultWizardData: WizardData = {
    jobType: null,
    scrapyTarget: 'sources',
    ocrTarget: 'source_urls',
    sourceId: '',
    sourceName: '',
    sourceUrl: '',
    sourceUrlId: '',
    sourceUrlLabel: '',
    sourceUrlUrl: '',
    documentId: '',
    documentName: '',
    documentUrl: '',
    maxAttempts: 3,
    cronTime: '',
    method: 'discover',
    bulkCount: 1,
    ocrLanguage: 'eng',
    ocrPsm: 3,
    ocrOem: 3,
};
