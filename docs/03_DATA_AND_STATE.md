# 03 — D1 schema, journal and status lifecycle

## Tables (design blueprint, not executed SQL)

| Table | Minimum purpose / important keys |
|---|---|
| `source_state` | `(provider, endpoint_key)` PK; ETag, sync last_attempt/last_success, status/error summary, upstream content revision, cursor/full_snapshot flag |
| `provider_activation` | `provider` PK; independent `baseline_completed_at`, `publish_approved_at`, reviewer reference; no implicit activation on deploy |
| `events` | namespaced `(provider, upstream, external_id)` unique; canonical action/precision/scope/source URLs, revision/hash, observedAt and historical_seed flag |
| `event_versions` | immutable versions or material transitions, event FK, effective payload and provenance; supports historic “what changed?” and correction audit |
| `deliveries` | unique `(event_id, material_transition_hash, destination)`; claim/send state, message_id/error/attempts/uncertain review |
| `sync_runs` | bounded operational log; provider, started/finished, status, fetched/accepted/rejected counts, sanitized reason |

The exact schema/indexes are decided in Stage 4 after payload research; migration SQL must include indexes `(provider, event_date DESC, id DESC)`, action/date, versions event+time, appropriate pagination keys and unique constraints. Use D1 prepared statements; test transactions/batch/atomic UPDATE semantics against real local D1 behavior.

## Core lifecycles

**Provider:** `uninitialized → snapshot_validated → baseline_complete → publishing_approved` (manual signoff). The baseline of one provider does not activate another.

**Event:** ingest JSON → validated/normalized → accepted (`historical` | `active`) or `needs_review`; newer revision → event_versions material diff, optional eligible correction. A source missing a row in a paginated response is NOT evidence of retraction.

**Delivery:** `not_claimed → claimed → sent(message_id)` OR `rejected/retryable` OR `uncertain_manual_review`. Retries after unconfirmed Telegram timeouts are withheld for manual investigation; no impossible exactly-once guarantee.

## Historical data and analytics correctness

- At first sync, **complete** source snapshot, persist baseline and optionally import documented historic records as history with source attribution; send **zero** historic Telegram alerts.
- Keep the original observed event timestamp separate from `first_seen_at`, `last_seen_at`, announcement time and delivery evidence. Source migration cannot silently rewrite these meanings.
- Archive/seeded events must be marked for visualization; do not treat coverage before tracker launch as complete.
- For status/stats, compute from *accepted/verified* data by default; manual review records should not appear as confirmed events or inflate counts.
- No arbitrary 100-year history assumptions; event intervals require a defined observation window, eligible type and `n>=2` observations; hide/qualify insufficient samples. See `18_ANALYTICS_METHODOLOGY.md`.

## Ingestion pipeline and data freshness

1. 304 → unchanged success with `last_success_at` refreshed; a 200 valid full snapshot may update events. Errors/partial pages **never** equal zero events.
2. Independently bootstrap both providers; page through complete history as allowed; source-specific updated timestamps.
3. Persist events and versions/revisions, compute stable content hash of **material fields** (not JSON key order/noise), evaluate publication transitions.
4. Public API uses D1 only, `last_success_at` per provider and `stale` based on a documented threshold (suggest first version 30 minutes vs 5-minute polling).
5. Event detail/lineage allows UI to show source, historic seed, correction and timestamps without claiming precision that upstream does not have.

## Operational constraints

No secret/user credentials in D1. Retain enough provenance to audit claims; sanitize logs and restrict public API projection. Periodically prune operational runs (not authoritative event history). Make source staleness visible, but do not delete old records on upstream outages.
