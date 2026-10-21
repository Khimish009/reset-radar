# 13 — Risk register

| Risk | Severity | Mitigation |
|---|---|---|
| Third-party API delayed/changed/discontinued | high | Stage 0 verification, isolated adapters, runtime validation, per-source last successful sync and stale UI, optional independently researched alternative |
| False “reset applied” message | high | Separate announce/deliver evidence gates, unknown review, specific scoped copy, seeded provenance |
| Historic data published as new | high | complete first baseline for each provider + explicit publish gate |
| Duplicate Telegram sends on Cron overlap | high | D1 atomic claims, persistent delivery journal and manual ambiguous outcome review |
| Source permissions/licensing confusion | medium-high | attribution, link originals, read permitted public endpoints, avoid copying text/assets, Stage 0 legal check |
| Unwanted traffic to public Worker / D1 quota | medium | strict filters and capped pagination, caching/ETag, prepared indexed SQL, usage telemetry |
| GitHub Pages misconfigured base path | medium | production build and reload checks for `/reset-radar/`, Pages workflow tests |
| SEO overpromises or search crawl misses JS events | medium | crawlable static copy, good metadata, truthful historic summaries, accept JS content discovery limitations |
| Brand confusion with official vendors | medium | independent logo and disclaimer, no official product endorsement claims |
| Unauthorized channel post from stolen bot token | high | Secrets, least privilege admin rights, rotation runbook, no tokens in browser or repo |
| Visitor privacy or tracking creep | medium | no personal accounts, no visitor tracking until separate privacy decision |
| Overbuilding before launch | medium | staged plan: Telegram first; public API then website/analytics; one approved stage at a time |
| Metric errors from incomplete archive | high | observed-data methodology, sample sizes/date ranges, seeded exclusion choices, no guaranteed next-reset clock |
| Unexpected hosting bill / blocked quota | medium | free-tier monitoring, indexed D1, cache, documented thresholds and rollback |
