# 16 — Reset Radar public read-only API (design contract v1)

**Purpose:** power the GitHub Pages static dashboard and, eventually, permitted third-party integrations. **Implementation not present in starter archive.** Implement Stage 9 only after D1/Telegram are validated. Not the Claude Resets/CodexReset upstream API.

## Principles

- Served by same Cloudflare Worker as `scheduled()` ingestion; HTTP `fetch()` reads our D1 only, never calls upstream sites synchronously.
- Public version prefix `/api/v1`; consistent JSON, UTC ISO timestamps; no authentication required for public read operations, no mutation endpoints.
- Canonical event claims come from source verification + D1. CORS for approved Pages origin, not an auth boundary; any HTTP client may call GET.
- Default **limit=20, max 50**; stable cursor pagination preferred over offset for consistent results; support filter validation and indexes.
- Cache responses with `Cache-Control: public, max-age=60` (status/events) or `300` (stats) as suggested; `ETag`/`If-None-Match` and 304 optional but desirable. Source sync stays independent of client traffic.

## Endpoints

### `GET /api/v1/events`

Query params: `provider=claude|codex|all` (default all); `type=confirmed_applied|announced_future|banked_offer|correction|withdrawal|all`; `from=YYYY-MM-DD`, `to=YYYY-MM-DD`; `limit=1..50`, `cursor=<opaque token>`.

- newest-first by a documented canonical public event time then stable internal ID; opaque cursor includes filter+sort checkpoint and validates; do not leak raw DB IDs if not required.
- Include provenance and whether event is `historicalSeed`; do not show unreviewed/ambiguous data as confirmed events.
- Each item includes at least public `id`, `provider`, `type`, `title`, `summary` (sanitized, authored from facts), `announcedAt`, `effectiveAt`, `deliveredAt`, `dateOnly`, `audience`, `expiresOn`, `sourceUrl`, `upstreamUrl`, `historicalSeed`, `updatedAt` and `timePrecision` where known. These are *our* fields, not upstream promises.

**Illustrative synthetic response, not live data:**

```json
{
  "apiVersion": "1",
  "data": [
    {
      "id": "claude:clauderesets:synthetic-event-1",
      "provider": "claude",
      "type": "announced_future",
      "title": "Сброс лимитов объявлен",
      "summary": "Срок и аудитория указаны в первоисточнике",
      "announcedAt": "2026-10-21T12:00:00Z",
      "effectiveAt": null,
      "deliveredAt": null,
      "dateOnly": null,
      "timePrecision": "exact",
      "audience": "Только те тарифы, которые указаны в анонсе",
      "expiresOn": null,
      "sourceUrl": "https://example.com/announcement",
      "upstreamUrl": "https://clauderesets.com/",
      "historicalSeed": false,
      "updatedAt": "2026-10-21T12:05:00Z"
    }
  ],
  "meta": { "nextCursor": null, "count": 1, "generatedAt": "2026-10-21T12:06:00Z", "dataStatus": "sample_only" }
}
```

Example uses fake event and sample URL — never publish as real. Do not copy this exact `dataStatus` into production unless backed by actual code contract.

### `GET /api/v1/status`

Response groups per-provider `claude` and `codex`: `monitoringEnabled`, `baselineComplete`, `lastAttemptAt`, `lastSuccessfulSyncAt`, `stale`, `staleReason` (public safe), `latestVerifiedEvent` (nullable) and `activeOffers` (only verifiably active). Also top-level `generatedAt` and `overallStatus` (`ok|degraded|unavailable`).

**Important:** monitoring health is NOT the current user's Claude/Codex quota state, and upstream source availability is NOT proof that new events exist.

### `GET /api/v1/stats`

Query: `provider=all|claude|codex`, `from`/`to` bounded by actual historical coverage. Response:

- `observedConfirmedResets` with sample size, time window and inclusion policy;
- `observedBankedOffers`, `observedAnnouncements` counted separately (never sum overlapping statuses as unique resets);
- `monthlyEventCounts[]` with month, provider and eligible confirmed count;
- `lastObservedConfirmedAt` per provider (nullable);
- optional `intervalDays` only when eligibility/coverage justify, with N intervals, mean/median as separate fields and qualification.
- `methodologyVersion`, `coverageStart`, `coverageEnd`, `historicalSeedIncluded` and `sourceLimitations`.

Metrics are observations from our D1/community trackers, **not complete official totals** and not personal remaining quotas. See `18_ANALYTICS_METHODOLOGY.md`.

## HTTP behavior

- `OPTIONS` preflight only as required; `HEAD` same safe headers as GET, no body.
- 400 invalid query, 404 unknown path, 405 wrong verb, 429 enforced rate cap if introduced, 503 unavailable D1; `Content-Type: application/json; charset=utf-8`.
- Errors include machine-readable `code`, human-safe `message`, `requestId`, never stack/internal SQL or secrets.
- Validate `Origin` against exact configured domain(s): production Pages `https://<owner>.github.io`, custom domain only when configured. Allow request without Origin for server clients. Add `Vary: Origin` when applicable. Allow necessary headers and caching.
- No unsafe reflection of query/origin into HTML or JSON.

## API delivery acceptance tests

See `docs/06_TEST_STRATEGY.md`. HTTP handlers must not reach Telegram publisher/scheduled ingestion; tests simulate repeated GETs proving no writes. Validate no secret fields in any JSON. Validate bounded D1 row scans via indexes, caching, CORS from actual Pages URL and graceful response when source sync becomes stale.
