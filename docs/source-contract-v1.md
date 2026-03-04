# Source Contract v1

This document defines the baseline source contract for HUD Queue.

## Strategy: list

```json
{
  "crawl_strategy": "list",
  "crawl_params": {
    "schema_version": 2,
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

```json
{
  "crawl_strategy": "rss",
  "crawl_params": {
    "schema_version": 1,
    "strategy": "rss",
    "feed_url": "https://example.com/feed.xml",
    "item_identity": "link_then_guid",
    "route": { "emit_to": "source_urls" },
    "fetch": { "timeout_ms": 8000 }
  },
  "extraction_data": {
    "config_version": 1,
    "strategy": "rss",
    "selected_feed_url": "https://example.com/feed.xml",
    "detected_feed_candidates": [],
    "warnings": []
  }
}
```

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
