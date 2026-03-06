# Source Contract v1

This document defines the baseline source contract for HUD Queue.

## Strategy: list

```json
{
  "crawl_strategy": "list",
  "crawl_params": {
    "schema_version": 2,
    "template_version": "1.1",
    "worker_contract": "scrapy-worker.instructions.v1",
    "orchestration_contract": "scrapy-worker.controller-layer.v1",
    "runtime_contract": "scrapy-worker.runtime.minimal.v1",
    "flow": ["source", "source_urls"],
    "runtime_rules": {
      "accepted_queue_tasks": ["discover", "download"],
      "effective_crawl_params_precedence": "sources.crawl_params -> sources.extraction_data -> {}",
      "download_snapshot_override": "When source_urls.crawl_params_snapshot is present, download uses it as crawl_params for that source_url.",
      "spider_selection": "If effective crawl_params is unified config (contains discovery and schema_version=2), use GenericSpider; otherwise use sources.crawl_strategy (list|api|rss)."
    },
    "playwright": false,
    "discovery": { "before": [], "chain": [] },
    "processing": []
  },
  "extraction_data": {
    "config_version": 1,
    "strategy": "list",
    "dedupe": {
      "url_norm_version": "v2",
      "rss_identity": "link_then_guid",
      "ignored_query_params": [
        "utm_source",
        "utm_medium",
        "utm_campaign",
        "utm_term",
        "utm_content",
        "gclid",
        "fbclid",
        "mc_cid",
        "mc_eid"
      ]
    },
    "pagination_defaults": {
      "mode": "hybrid",
      "max_pages": 0
    }
  }
}
```

## Strategy: rss

### crawl_params (RssCrawlParamsV1)

```json
{
  "crawl_strategy": "rss",
  "crawl_params": {
    "schema_version": 1,
    "template_version": "1.1",
    "worker_contract": "scrapy-worker.instructions.v1",
    "orchestration_contract": "scrapy-worker.controller-layer.v1",
    "runtime_contract": "scrapy-worker.runtime.minimal.v1",
    "flow": ["source", "source_urls"],
    "runtime_rules": {
      "accepted_queue_tasks": ["discover", "download"],
      "effective_crawl_params_precedence": "sources.crawl_params -> sources.extraction_data -> {}",
      "download_snapshot_override": "When source_urls.crawl_params_snapshot is present, download uses it as crawl_params for that source_url.",
      "spider_selection": "If effective crawl_params is unified config (contains discovery and schema_version=2), use GenericSpider; otherwise use sources.crawl_strategy (list|api|rss)."
    },
    "strategy": "rss",
    "feed_url": "https://example.com/feed.xml",
    "item_identity": "link_then_guid",
    "route": { "emit_to": "source_urls" },
    "fetch": { "timeout_ms": 8000 },
    "allow_html_documents": false,
    "use_playwright": false,
    "entry_link_selector": "article a.detail-link"
  }
}
```

| Field | Type | Required | Default | Description |
|---|---|---|---|---|
| `schema_version` | `1` | yes | — | Fixed version for RSS strategy |
| `strategy` | `"rss"` | yes | — | Discriminator |
| `feed_url` | `string (URL)` | yes | — | RSS/Atom feed URL to crawl |
| `item_identity` | `"link_then_guid"` | yes | — | Dedupe key: prefer link, fallback to guid |
| `route.emit_to` | `"source_urls"` | yes | — | Destination table |
| `fetch.timeout_ms` | `number` | yes | `8000` | HTTP fetch timeout |
| `allow_html_documents` | `boolean` | no | `false` | Store fetched HTML pages alongside feed data |
| `use_playwright` | `boolean` | no | `false` | Use Playwright for rendering entry pages |
| `entry_link_selector` | `string` | no | — | CSS selector to follow on entry pages (detail page link) |

### extraction_data (SourceRssExtractionDataV1)

```json
{
  "extraction_data": {
    "config_version": 1,
    "strategy": "rss",
    "selected_feed_url": "https://example.com/feed.xml",
    "detected_feed_candidates": ["https://example.com/feed.xml"],
    "warnings": [],
    "probe_result": {
      "canonical_url": "https://example.com",
      "page_kind": "html",
      "selected_candidate": {
        "feed_url": "https://example.com/feed.xml",
        "feed_type": "rss2",
        "confidence": 0.95,
        "discovery_method": "link_alternate",
        "content_type": "application/rss+xml",
        "title": "Example Feed",
        "same_origin": true
      },
      "candidates": [],
      "warnings": []
    },
    "authoring_summary": "Detect feed → Use RSS strategy → Discover per entry → Do not store HTML pages",
    "authoring_version": 1,
    "selected_preset": "rss_v1"
  }
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `config_version` | `1` | yes | Fixed version |
| `strategy` | `"rss"` | yes | Discriminator |
| `selected_feed_url` | `string (URL)` | yes | Active feed URL |
| `detected_feed_candidates` | `string[]` | yes | All detected feed URLs |
| `warnings` | `RssDetectionWarning[]` | yes | Detection warnings |
| `probe_result` | `RssProbeResult` | no | Full detection probe output with candidates and confidence |
| `authoring_summary` | `string` | no | Human-readable scraper behavior summary |
| `authoring_version` | `number` | no | Authoring model version (currently 1) |
| `selected_preset` | `string` | no | Authoring preset identifier |

### Probe result shape (RssProbeResult)

| Field | Type | Description |
|---|---|---|
| `canonical_url` | `string` | Final URL after redirects |
| `page_kind` | `"html" \| "feed" \| "error"` | What the initial URL resolved to |
| `selected_candidate` | `RssProbeCandidate \| null` | Best candidate (highest confidence) |
| `candidates` | `RssProbeCandidate[]` | All valid feed candidates sorted by confidence desc |
| `warnings` | `RssDetectionWarning[]` | Rejected candidates with reasons |

### Probe candidate shape (RssProbeCandidate)

| Field | Type | Description |
|---|---|---|
| `feed_url` | `string` | Resolved feed URL |
| `feed_type` | `"rss2" \| "atom" \| "rdf" \| "unknown"` | Detected feed format |
| `confidence` | `number (0-1)` | Detection confidence score |
| `discovery_method` | `"direct_feed" \| "link_alternate" \| "anchor_href" \| "common_path"` | How the feed was found |
| `content_type` | `string` | HTTP Content-Type header |
| `title` | `string \| null` | Feed title extracted from XML |
| `same_origin` | `boolean` | Whether feed URL shares origin with input URL |

### Confidence scoring

| Discovery method | Base score | Cross-origin penalty |
|---|---|---|
| `direct_feed` | 0.98 | -0.10 |
| `link_alternate` | 0.95 | -0.10 |
| `anchor_href` | 0.80 | -0.10 |
| `common_path` | 0.70 | -0.10 |

Auto-select threshold: confidence >= 0.90 triggers automatic feed selection in the UI.

## Pagination URL-first (hybrid)

```json
{
  "pagination": {
    "selector": "a.next",
    "max_pages": 0,
    "url": {
      "mode": "hybrid",
      "pattern": "[?&]page=(?<page>\\d+)",
      "template": "https://example.com/list?page={page}",
      "start_page": 1,
      "step": 1
    }
  }
}
```

## Dedupe policy

- URL normalization strips fragment and trailing slash.
- Tracking query params are ignored (`utm_*`, `gclid`, `fbclid`, `mc_*`).
- DB unique indexes remain the source of truth for conflict prevention.
