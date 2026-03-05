export interface WorkerContractMetadataV11 {
    template_version: '1.1';
    worker_contract: 'scrapy-worker.instructions.v1';
    orchestration_contract: 'scrapy-worker.controller-layer.v1';
    runtime_contract: 'scrapy-worker.runtime.minimal.v1';
    flow: ['source', 'source_urls'];
    runtime_rules: {
        accepted_queue_tasks: ['discover', 'download'];
        effective_crawl_params_precedence: 'sources.crawl_params -> sources.extraction_data -> {}';
        download_snapshot_override: 'When source_urls.crawl_params_snapshot is present, download uses it as crawl_params for that source_url.';
        spider_selection: 'If effective crawl_params is unified config (contains discovery and schema_version=2), use GenericSpider; otherwise use sources.crawl_strategy (list|api|rss).';
    };
}

export const WORKER_CONTRACT_METADATA_V11: WorkerContractMetadataV11 = {
    template_version: '1.1',
    worker_contract: 'scrapy-worker.instructions.v1',
    orchestration_contract: 'scrapy-worker.controller-layer.v1',
    runtime_contract: 'scrapy-worker.runtime.minimal.v1',
    flow: ['source', 'source_urls'],
    runtime_rules: {
        accepted_queue_tasks: ['discover', 'download'],
        effective_crawl_params_precedence: 'sources.crawl_params -> sources.extraction_data -> {}',
        download_snapshot_override: 'When source_urls.crawl_params_snapshot is present, download uses it as crawl_params for that source_url.',
        spider_selection: 'If effective crawl_params is unified config (contains discovery and schema_version=2), use GenericSpider; otherwise use sources.crawl_strategy (list|api|rss).',
    },
};
