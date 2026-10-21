# 01 — Requirements and product scope

## Personas and surface map

| Actor | Need | Surface |
|---|---|---|
| Telegram subscriber | reliable public announcements, no spam | channel |
| Website visitor | history, sources, filters, observed analytics | GitHub Pages SPA-lite |
| Project owner | safe publishing, review, rollback | repo/Cloudflare/Telegram |
| Engineering agent | explicit staged tasks, tests, evidence | AGENTS.md and docs |

## Ingestion and Telegram requirements (FR-01—FR-14)

- **FR-01:** Scheduled Worker attempts independent Claude/Codex polling every ~5 minutes; separate health records and fault isolation.
- **FR-02:** Independent runtime-validated source adapters. Codex primary chosen only after Stage 0 evidence.
- **FR-03:** Distinguish `confirmed_applied`, `announced_future`, `banked_offer`, `correction`, `withdrawal`, `needs_review`; require source evidence and scope.
- **FR-04:** Never convert `delivered_at=null`, a hinted schedule, or an elapsed timestamp into a confirmed reset.
- **FR-05:** Claude `reset_offers` are not normal applied resets; distinguish activation deadline and banked reset from consumption.
- **FR-06:** Bootstrap each provider’s *complete verified snapshot* independently, no historical Telegram sends.
- **FR-07:** Idempotent event journal and atomic publish claims; ambiguous send outcomes are manual-review.
- **FR-08:** Each Telegram post shows `[CLAUDE]` or `[CODEX]`, event claim (announced/delivered/offer), scoped audience, time precision, direct source + tracker attribution.
- **FR-09:** `dry_run` is default; staging vs production isolated; owner explicitly approves production posting per provider.
- **FR-10:** Handle HTTP 304, 429, Retry-After, 503, schema changes, D1 errors and Telegram failures without false posts.
- **FR-11:** Record revisions, source health, delivery statuses and failed/ambiguous notifications.
- **FR-12:** Corrections/retractions require evidence, clear labeling and link to original Telegram post when available.
- **FR-13:** Private chat `/start` optional separate approved phase. Until then, bot is technical publisher only.
- **FR-14:** If source stale, no notification suggesting current state; reports in system logs and status API.

### Codex early-announcement priority (owner confirmed, 2026-10-21)

For the selected Codex source, the product priority is to surface a trustworthy announcement of an extra future reset as soon as it is detected and its evidence is reviewed. An announcement is useful before limits are provided: `announced_future` remains distinct from `confirmed_applied`, and `delivered_at=null` never proves delivery. A future announcement may have an exact instant, a calendar date, or no stated target time. Preserve the primary-source URL, detection time, `announced_at`, source-backed audience, and expected-time precision. `hinted`, forecast, rumor, stale, or otherwise unverified claims stay in review.

This is a product priority, not a claim of instant live notification. The Stage 3 adapter is local and is not connected to a scheduler, persistent event journal, or publisher. Polling cadence, evidence review, baseline handling, eligibility, deduplication, and production publication remain gated decisions.

### Proposed future announcement publication policy (pending owner decision)

- After a separate publication-stage approval and provider baseline, consider a first notice eligible when a newly detected future announcement has passed primary-source review, even while delivery is unverified. Do not wait for `confirmed_applied` to inform users of the announcement.
- If the source makes no date or time known, use explicit unknown-time wording; do not invent a date, countdown, or delivery claim. Date-only targets remain date-only.
- Treat a later, independently evidenced `confirmed_applied` transition as a separate candidate notice only after the future publication stage defines material-change, deduplication, and correction rules. This proposal promises neither exactly-once delivery nor a live response-time target.
- Seeded history and the initial provider baseline remain ineligible for publication. `codex-resets.com` is an investigated alternative and archive attribution only; do not merge its history or use it as fallback for the selected `codexreset.ai` feed.

## Public API requirements (FR-15—FR-22)

- **FR-15:** Worker `fetch()` exposes only GET/HEAD/OPTIONS of `/api/v1/status`, `/api/v1/events`, `/api/v1/stats` and non-sensitive health if approved.
- **FR-16:** D1 is sole source of accepted event facts; request handler **never** polls external feeds synchronously.
- **FR-17:** `/events` offers `provider`, `type`, date range, bounded pagination; results newest-first with stable ordering and evidence links.
- **FR-18:** `/status` offers per-source latest accepted event, ingestion freshness/staleness and active offers that are genuinely evidenced; no claim that a subscriber's limits have reset.
- **FR-19:** `/stats` offers observed event counts, monthly series, median/mean intervals only where methodologically defensible, observation period and sample sizes.
- **FR-20:** API response fields must be stable and versioned; public JSON contains no raw personal data, database keys, debug stacks, secrets or private moderation notes.
- **FR-21:** Strict query validation and bounded result size; clear 400/404/405/429/5xx error shape; caching, ETag, CORS origin allowlist; tests.
- **FR-22:** Client can show last D1 snapshot and true data age if all upstreams are down; `stale` flag and per-source update time are explicit.

## Website requirements (FR-23—FR-33)

- **FR-23:** Site is static Vite+TypeScript+CSS at GitHub Pages `/<repo>/`, no server-side render, no runtime secret.
- **FR-24:** Landing shows product benefits, Claude/Codex coverage and prominent Telegram subscribe button.
- **FR-25:** Latest event/history list with provider/type controls, date range, pagination and details/external sources.
- **FR-26:** Show three starter metrics: count of observed reset events, last observed event per provider, observed events by month. Optional median interval only after well-defined completeness threshold.
- **FR-27:** One lightweight accessible chart; avoid heavy charting dependencies if simple SVG/Canvas feasible.
- **FR-28:** Every metric names observation window, sample size and definition. Historic seeded events and uncertain types visibly labeled or excluded as appropriate.
- **FR-29:** RU/EN content/localization (language switch; URLs optional), UTC API times displayed in user-local time with UTC tooltip; date-only stays date-only.
- **FR-30:** Mobile-first, dark radar brand, keyboard and screen-reader access, reduced-motion support, contrast and semantic structure.
- **FR-31:** Loading, empty, stale, offline and API error states; never invent fallback data as factual.
- **FR-32:** Outbound links to Telegram, GitHub, source trackers and original announcements; disclaimers + methodology link.
- **FR-33:** Static SEO pages/meta/social previews/sitemap/robots; note JS-loaded history may be less indexable without pre-rendering (not MVP).

## Nonfunctional requirements

- Small bundle and dependencies; security against untrusted HTML/URLs; no third-party trackers/analytics without explicit consent/decision.
- Network load: initial 5-minute upstream polling and website API cache (e.g. 60–300 seconds); public traffic rate guards according to actual quotas.
- Stage gates: stage acceptance, CI, dry-run, staging, separate prod API launch and separate Telegram publishing approval.
