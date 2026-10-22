# 10 — Operations, monitoring and rollback

## Stage 6 runtime boundary

The scheduled Worker now has a local dry-run ingestion path backed by D1. It is active only when `INGEST_MODE=dry_run`, `APP_ENV` is explicitly `local` or `staging`, `PUBLISH_MODE=dry_run` is explicit, and binding `DB` exists. Missing or `off` `INGEST_MODE` means inactive. Invalid configuration and missing DB fail closed with fixed safe codes. Production cannot enable this path. Checked-in base, local, staging and production Wrangler configs leave the flag absent and keep Cron at `[]`.

The runtime invokes ingestion only from `scheduled()`; public `fetch()` remains the read-only/skeleton HTTP surface and does not sync, assess, publish or change admin state. Stage 5 publisher, Telegram client and simulation journal are not imported by the runtime. Dry-run preserves `needs_review` reasons and returns the publication summary `{available:false,state:'blocked',reason:'no_real_publisher'}`; it does not create approvals, call a Telegram client, claim a send, or write either existing journal (`synthetic_deliveries` and `telegram_simulation_deliveries`). No real-send journal exists in this stage.

Local per-invocation limits are: up to four Claude pages of 25 records (100 maximum), one Codex request, five Claude plus one Codex request total, 10-second HTTP timeout and 2 MiB response body. The runtime reads at most 101 prior canonical rows per provider to check the 100-record capacity. If stored history is larger, it commits the fixed incomplete reason `stored_record_limit`, leaves canonical events and source rows unchanged, and makes no upstream requests. This invocation remains incomplete and cannot complete a new baseline; an already completed baseline is preserved. A capacity change needs a later owner-approved design before retry. A snapshot exceeding the accepted full-import cap is rejected without partial events or a completed baseline. One provider failure must not suppress independent work or success from the other provider. D1 work has bounded operation counts, but elapsed D1 work is not hard-cancelled by a wall-clock timeout; measure actual CPU, rows and duration in authorized staging before making a cost or latency claim.

Local tests substitute both fixed source URLs with loopback fixtures and prohibit pass-through. Real staging invocation contacts the configured upstreams; it requires explicit owner authorization even with publisher disabled. No runtime setting in this stage authorizes Telegram traffic.

## Safe telemetry

The fixed event codes currently emitted by the scheduled path are `scheduled_noop`, `scheduled_missing_database`, `scheduled_run_failure`, `configuration_rejected`, `provider_sync_success`, `provider_sync_incomplete`, `provider_sync_failure`, `provider_sync_concurrent`, `scheduled_run_complete` and `publish_unavailable`. Current fields are limited to the allowlisted `environment`, `publishMode`, `provider` and `durationMs`; `status` is accepted by the logger sanitizer but the scheduled path does not currently emit it. The structured logger drops unrecognized event codes and fields. Do not add URLs, query strings, payloads, event summaries, editorial rationale, Telegram text, tokens, account IDs, raw exception messages, stack traces, request/page/record counts or D1 operation counts unless a reviewed code change adds bounded fields to the logger contract. Review emitted logs in the Stage 6 report before enabling staging observation; never infer health from a missing log line.

For each provider, the operator should establish whether a complete baseline exists, latest successful sync time, most recent request result, stale/error state, and whether the newest accepted revision changed. Keep `announced_at`, source-reported `delivered_at`, detection time, and ingestion time distinct. A partial/oversized/failed import is not a baseline. A successful poll with no new events is not the same as a failed poll.

## Staging observation (future, separately authorized)

The first staging deploy remains inactive (`INGEST_MODE` absent or `off`) and has `triggers.crons: []`. Before making real provider requests, obtain explicit authorization for a bounded observation. Then the owner may separately approve a staging-only config setting `INGEST_MODE=dry_run` and enabling Cron at the five-minute target. Monitor both provider outcomes and D1 usage through at least two complete independent baselines. Record the deployed SHA, environment, observation interval, success/failure/partial result per provider, D1 rows read/written, CPU/duration and the owner's budget comparison. Stop and keep the system disabled if either source is partial or repeatedly fails, D1 usage is unmeasured, or the budget is not accepted. No history blast or Telegram publication is allowed.

The operator may inspect Cloudflare Workers logs, invocation metrics and D1 dashboard/query metadata. Report counts by provider and fixed event code outside the application logs; avoid high-cardinality labels such as IDs, URLs or arbitrary upstream values. D1 query metadata includes rows read/written and duration; compare those values over a recorded window with account-level D1 metrics. Worker invocation count alone is not a D1 cost estimate.

## Cost and quota monitoring

Track measured daily D1 rows read/written, storage, Worker invocations and CPU/duration against a written owner budget with a stop threshold below plan limits. D1 Free plan limits currently listed by Cloudflare are 5 million rows read/day, 100,000 rows written/day and 5 GB total account storage. Cloudflare states that Free daily row-limit excess causes D1 queries to fail until the limit resets. The current per-database storage maximum is 500 MB on Free and 10 GB on Paid; the maximum D1 queries per Worker invocation is 50 on Free and 1,000 on Paid. These provider limits may change and do not prove this workload fits within Free usage or will remain free. Before remote staging, count and measure actual D1 queries per scheduled invocation against the selected plan; do not assume batching hides multiple statements. Record the account plan and measurement window; recheck [current D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/) and [limits](https://developers.cloudflare.com/d1/platform/limits/) before any cost decision. The September 2026 [limit enforcement notice](https://developers.cloudflare.com/changelog/post/2026-09-01-d1-free-tier-limit-enforcement/) documents query failures after daily Free limits.

At five-minute cadence the theoretical count is 288 invocations/day (8,640 over 30 days) if every trigger runs. This is a planning figure only. Derive actual reads/writes and runtime duration from the observed invocation data; do not extrapolate from event totals alone. Public API/dashboard traffic is a later Stage 9 cost dimension.

## Incident response

| Signal | Response |
|---|---|
| Missing/invalid runtime config or DB binding | Keep ingestion inactive; inspect only sanitized fixed error code and reviewed config keys. Do not put config values into logs. |
| One upstream fails, times out, returns 429/503, or changes schema | Preserve its last D1 snapshot and mark that provider failed/stale; allow the independent provider outcome to remain visible. Respect existing cache/backoff; do not infer withdrawal from absence. |
| Partial/oversized history | Do not mark provider baseline complete or persist a partial import as a full baseline. Keep observation disabled until the issue is understood. |
| D1 query failure or budget threshold reached | Disable Cron and runtime gate using the reviewed staging config; retain data. Inspect D1 metrics/indexed query paths and current account limits before resuming. |
| Unexpected runtime behavior or high CPU/duration | Disable Cron first, then set `INGEST_MODE` absent/`off`; redeploy only under owner authorization. Preserve logs with fixed codes and review the exact SHA. |
| Telegram token leak or unexpected message | Stage 6 should have no real token or sender. If a later approved integration exists, owner revokes/rotates the token, pauses its publication path, audits the channel, and follows that integration's separate incident procedure. |
| Ambiguous Telegram send | Not applicable to Stage 6 runtime. Any future real publisher must preserve `uncertain_manual_review` and require manual verification; never blind-retry. |

## Disable and rollback

1. Remove scheduled execution first by deploying the reviewed staging config with `triggers.crons: []`; Cloudflare documents that an explicit empty array removes deployed Cron triggers, while omitting the property may leave them in place. Verify the trigger list in Cloudflare. If Wrangler access is unavailable, the owner can remove it through the dashboard and verify removal.
2. Set `INGEST_MODE` absent or `off`, keep `PUBLISH_MODE=dry_run`, and redeploy the reviewed staging config. Confirm the exact Worker environment and SHA.
3. If code rollback is needed, owner selects a known reviewed Worker version or deploys the last reviewed SHA/config. Do not assume Worker rollback reverts D1 writes.
4. Preserve D1 records and migration history. Do not delete the database or reverse migrations as an incident shortcut. Review backup/Time Travel options and prepare a separate owner-approved restoration action if needed.
5. Resume only after the cause is understood, safe config is reviewed, D1 budget is measured, and the owner authorizes another observation.

Production remains inactive and Cron-off. Production D1, runtime activation, publication, public API and deployment require later, separate owner gates. The Stage 6 local result is not stable-staging acceptance.

## Operational truth and references

The dashboard/API should distinguish **source unavailable** from **no new event** and show last successful ingestion per source. “Latest confirmed event” does not mean a user's quota is available. Preserve source-reported event semantics and event provenance; don't convert a date-only offer expiry into a precise countdown.

Cloudflare documentation checked 2026-10-22: [Cron Triggers](https://developers.cloudflare.com/workers/configuration/cron-triggers/) (Cron runs in UTC; explicit empty `crons` removes triggers), [D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/), [D1 limits](https://developers.cloudflare.com/d1/platform/limits/), and [D1 Free-tier limit enforcement](https://developers.cloudflare.com/changelog/post/2026-09-01-d1-free-tier-limit-enforcement/). See [deployment runbook](07_DEPLOYMENT_RUNBOOK.md) for owner gates and documented Wrangler commands.

## Launch / observation record template

Record date, reviewed SHA, exact separately authorized action, Wrangler version, environment, staging DB name and private ID reference, migration state, Worker version, Cron state, runtime flag state, `PUBLISH_MODE`, each provider's complete-baseline status, observation interval, sanitized fixed-code outcomes, D1 rows read/written/storage, CPU/duration, owner budget/stop threshold, reviewer and disable/rollback action. Never record credentials, raw environment dumps, raw upstream payloads, full source URLs or Telegram message contents. No remote observation record is created by local Stage 6.
