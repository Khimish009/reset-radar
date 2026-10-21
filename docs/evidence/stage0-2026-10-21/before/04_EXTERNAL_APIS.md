# 04 — Public source APIs: contracts, semantics and verification gaps

Research date **2026-10-21**. All sources are **independent third-party community trackers**, not official Anthropic/OpenAI usage APIs. Do not request subscribers' credentials.

## A. Claude — clauderesets.com

Official tracker docs (not official Anthropic): https://clauderesets.com/api/docs  
OpenAPI schema: https://clauderesets.com/api/openapi.json

Public no-key read-only API. Attribution **required**; send descriptive `User-Agent`, cache **at least 60s**, support `ETag/If-None-Match`, `304`, `429 Retry-After`, `503` and problem+json. Manually curated; latency and completeness uncertain. `/api/v1/status` reportedly includes `latest_reset`, `announced_reset`, `reset_offers`, `meta.content_revision`; `/api/v1/resets` supplies paginated history with `revision`, `event_status`, `kind`, `time_precision`, sources, filters. `/api/v1/sources` provenance. The counted history counts `usage_reset + confirmed`, not the distinct banked offers. Corrections may disappear from the normal counted feed; **absence alone isn't retraction**.

**Stage 0 must fetch status/resets/sources, verify real top-level path (`data`, `meta`), offers, statuses, cursors, ETags and sample correction behavior.** In the preparation environment direct JSON responses were not accessible, so the documented shapes are hypotheses pending live validation.

## B. Codex — codexreset.ai

Developer docs: https://codexreset.ai/developers/  
Proposed read endpoint: **GET `https://codexreset.ai/api/v1/resets.json`** (no key). Other endpoints (forecasts, signals, status) are **not needed** for MVP. Page docs describe edge caching ~5 minutes; upstream asks clients to cache and poll **at most once per minute**; our five-minute cron is compliant.

Publicly documented fields (still require live payload verification):

- top-level `schema_version`, `generated_at`, `source`, `events[]`, `scheduled` (nullable), `attribution`.
- event `id`, `date`, `ts`, `kind` (e.g. `regular` / `banked`), `scope`, `summary`, `url`, `seeded`.
- **`announced_at`** timestamp of source post; **`delivered_at`** actual delivery only when confirmed, otherwise `null` — do not equate them.
- `delivered_source_url`, `delivery_reported_delay`, `delivery_note_en`.
- `scheduled.certainty` (`announced` or `hinted`), `day`, `scheduled_for`, `url`, `announced_at`. Only `announced` may be considered for future-event posts after eligibility/source checks; `hinted` -> no automatic publish.
- Historical records before 2026-09-10 may be `seeded: true` from `codex-resets.com`. They require attribution to that archive **if republished**; in our first baseline they are not sent at all.

**Critical mapping nuance:** A Codex `kind=regular` event with a linked announcement and `delivered_at=null` **does not prove actual reset completion**. Source wording may explicitly say “all reset/propagated”, but default classification should be *announced / needs review* unless explicit hard evidence supports confirmed delivery. Never auto-announce personal account availability.

`codex-resets.com` is the older archive and an existing Telegram example (https://codex-resets.com/). The user also noted an API link on that site; Stage 0 should inspect this endpoint/permission if available. Do **not** silently swap providers; decide one primary Codex source, record provenance, and treat fallback as future separate decision.

Attribution preferred by CodexReset (not necessarily a legal license grant): link to codexreset.ai; include original X announcement URL. Confirm terms and rate-limit expectations. 

## C. Telegram Bot API

https://core.telegram.org/bots/api : `sendMessage`, `getMe`, `getChat`, response `ok/result.message_id`, errors with `parameters.retry_after`. Channel bot needs only **Post Messages** admin permission. `TELEGRAM_BOT_TOKEN` is secret; reject token in logs. Public `@channel`/numeric ID must be verified by owner.

Potential `/start` personal interaction is not automatic: it needs a configured Telegram webhook or polling update receiver. Do not expose a public unauthenticated publish endpoint. Stage 8 optional private-chat welcome can be approved separately.

## Stage 0 checklist (must finish before coding)

1. HTTP status, headers, JSON shape, conditional requests from each API and actual examples.
2. Observed `kind/status/delivered/offer` permutations + unknown/new enum handling.
3. Stable event IDs, revisability, pagination, upstream timestamps, token-less request limits.
4. Source rights/credit and originality restrictions; don't copy site assets.
5. Truth-policy decision table for both providers with tests/fixtures; mark every fixture `captured` or `synthetic`.
6. Go/no-go: if no reliable distinction for a particular kind of Codex event, restrict public category rather than inventing evidence.
