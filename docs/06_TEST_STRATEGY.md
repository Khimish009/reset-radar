# 06 — Test strategy and acceptance matrix

## Tools

Vitest with deterministic clock and fetch; Wrangler local D1 bindings for integration tests; test-channel smoke only after specific owner approval. Run TypeScript strict check, ESLint, tests, and website `vite build` for relevant stages. Browser smoke/accessibility tests can be Playwright only if practical and approved (avoid overengineering).

## Data ingestion / truth gates

### Stage 2 — Claude adapter (local)

Stage 2 checks exercise the standalone Claude adapter only. The `Worker scheduled()` and `fetch()` handlers remain inert; these tests do not establish D1 persistence, production source baselines, Telegram eligibility or production truth policy. Mark a check complete only when its current test or recorded local command covers it.

- [x] Strict Claude status/resets/sources contract parsing rejects unknown/missing fields and enum values; schema rejection retains the payload and source URL for internal review diagnostics.
- [x] Mapping preserves raw kind/status, revision, source/evidence URLs, audience, plans, exclusions, windows and date-only precision. Confirmed application and future announcement require an explicit evidence assessment matching the event revision and original source URLs; otherwise the record stays `needs_review`.
- [x] A confirmed `credit` with a `reset_offer` maps to `banked_offer`; it does not claim use, current activity or a precise expiry time. Applied/delivered times are never fabricated.
- [x] Conditional GET uses endpoint plus canonical query as its cache key; a valid `304` retains the previous snapshot and validator. Cache minimum is 60 seconds; `sources.last_reviewed_at` accepts date-only values.
- [x] Bounded cursor paging accepts only a complete, revision-consistent walk. Failed/partial walks keep the previous complete history; missing rows are retained without inferring withdrawal.
- [x] Deterministic transport/adapter tests cover cache/backoff, `304` with and without a snapshot, timeout, invalid responses, `429`/`Retry-After`, `503`, and pagination failures.
- [x] An opt-in Postman local simulation test calls a loopback mock; it does not call the real upstream. Live HTTP reads were separate targeted manual checks and are not automated tests.
- [ ] Independent Stage 2 review and owner acceptance; see [Stage 2 report](26_STAGE2_REPORT.md).

- [ ] Claude: confirmed reset, future announcement, active/redeemable banked offer, expired offer, revision and explicit withdrawal, unexpected enum.
- [ ] Codex: announcement with `delivered_at=null` **never** labeled complete; delivered later creates correct state change; `scheduled.certainty=hinted` not auto-published.
- [ ] `304` preserves cached snapshot; bad JSON, partial pagination and 429/503 do not delete records or trigger retractions.
- [ ] Mixed-source outage: Claude failing doesn't prevent Codex; independent staleness timestamps.
- [ ] Source switch and historical `seeded` records don't replay old Telegram posts.
- [ ] Concurrent Cron two runs create at most one committed publishing claim; ambiguous Telegram timeout marked for manual review.
- [ ] `dry_run` never makes Telegram network send; staging chat ID not equal to production.
- [ ] Timezone conversions and date-only expiry avoid invented clock precision.

## D1 and API

- [ ] Local migrations up/down or reversible documented practice; indices support sorted pagination efficiently.
- [ ] `/api/v1/events` returns only approved public projection and filters by `provider`, `type`, date window; deterministic sort stable when timestamps equal; limit capped.
- [ ] `/api/v1/status` reports last success **per upstream**, includes honest staleness with threshold and failed-source degraded status, not individual quota balances.
- [ ] `/api/v1/stats` counts observed events with correct classification/date windows; seeded/uncertain data handled per methodology, no misleading empty interval.
- [ ] Input rejection for unknown provider/action, bad date or cursor, `limit=100000`, SQL injection strings; errors are sanitized and use correct HTTP codes.
- [ ] GET/HEAD/OPTIONS allowed; POST/PATCH to any public API fail `405`; nonexistent API paths `404`; all routes cannot trigger Telegram.
- [ ] CORS allowlisted production GitHub Pages origin; untrusted origin cannot use CORS allow-header; preflight and caching verified.
- [ ] ETag, `If-None-Match`, 304, cache headers, rate/limit budget and validation of Date/last updated.
- [ ] No secret, D1 binding/internal id, BotFather token or error stack in public JSON.

## Website and UX

- [ ] Build deploys with `/reset-radar/` Vite `base` and correct relative assets, including browser reload / hash route if used.
- [ ] Every outbound Telegram, GitHub and tracker link points to the **owner-verified** destination and uses safe external attrs.
- [ ] RU/EN copy, screen reader labels, mobile 320px+, keyboard operation, reduced motion, sufficient contrast.
- [ ] Loading, no-events, API-timeout, partially stale, complete outage all have truthful UI and no fake placeholder dates/counts.
- [ ] Graphs: interval/method/sample size correct; incomplete historic coverage disclosed; no next reset promises.
- [ ] Browser calls our Worker API only; website assets contain **no secrets** or upstream API credentials.
- [ ] Basic public SEO title/description, canonical actual Pages URL (when deployed), OG image, robots/sitemap, language hints.

## Release gates

- Gate A: Stage 0 evidence matrix and source owner/data terms reviewed.
- Gate B: green local automated tests + staging D1 migrations.
- Gate C: dry-run ingestion + independent baseline + one approved test-channel send.
- Gate D: safe production deployment with notifications disabled, followed by separate explicit publish approval.
- Gate E: read-only Worker API validated before site public rollout; GitHub Pages link/cross-origin browser test; site error/staleness UX.
