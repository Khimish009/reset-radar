# 08 — Development roadmap for Codex CLI: Stages 0–11

**Method:** one stage at a time; strict owner approval between stages, branch+PR by authorization, tests and documentation updates. The active scope is the latest explicitly owner-approved task; a prepared prompt does not authorize implementation. This plan extends v2 to include public API + static website + analytics. Backend and Telegram functionality comes FIRST, but architecture must support the site from Stage 1.

## Stage 0 — API feasibility, provenance, terms (START HERE)

**Goal:** empirically inspect **both** Claude and Codex upstream sources, not invent fields.

- Claude: docs/OpenAPI/status/resets/sources and live headers/pagination/schema/revisions/offers.
- Codex: `codexreset.ai/developers/` + actual `api/v1/resets.json`, announced vs delivered, scheduled/banked/seeded/attribution; assess `codex-resets.com` alternative API if public.
- Evidence table: verified request status, headers, sample JSON (redacted), shape, rate limits, allowable reuse/credit, source freshness, field-to-truth mapping, unsupported events.
- Update `docs/04_EXTERNAL_APIS.md`, `11_SOURCES.md`, `09_DECISIONS.md`. Fixtures `captured`/`synthetic`; no production code, deploy, Git push or bot messages.

**Acceptance:** separate go/no-go for each provider; owner chooses Codex feed and publish truth policy.

## Stage 1 — Repository/Worker foundation

Initialize TypeScript strict Worker `scheduled` and no-op `fetch` routing skeleton, npm scripts, Vitest, lint, CI checks, typed event/provider interfaces, separate configs, safe logger, mocked timers/fetch. Reserve read-only API module boundaries. No publishing.

**Acceptance:** typecheck/lint/test green; clean `.gitignore`, no tokens; owner review.

**Stage 1 status, 2026-10-21:** локальный каркас реализован по отдельному разрешению владельца через `prompts/START_STAGE1.md`; typecheck/lint/24 Vitest tests прошли. Codex feed/truth policy остаются pending. Checklist и review: [24_STAGE1_REPORT.md](24_STAGE1_REPORT.md). Принятие этапа владельцем и переход к Stage 2 требуют отдельных подтверждений.

## Stage 2 — Claude adapter

HTTP conditional GET + runtime parsing/ETag/304/429/retry, history paging as Stage 0 allows, observed statuses/offers/revisions mapped to safe normalized events. Unknown -> review. Fixtures and regression tests.

**Implementation status, 2026-10-21:** локальный Claude adapter реализован в границах отдельного разрешения владельца. Он читает только status/resets/sources Claude Resets, строго проверяет контракт, сохраняет последний валидный снимок в переданном in-memory state и не подключён к Worker handlers, D1 или Telegram. Владелец принял архитектуру и основную реализацию и разрешил три исправления PR #2. Исправления находятся в `ae89017`, независимое review завершено без существенных оставшихся findings; локальные проверки и CI этого SHA успешны. Подробности: [отчёт Stage 2](26_STAGE2_REPORT.md), [актуальный handoff](27_STAGE2_HANDOFF.md). Production truth policy не утверждена.

**Acceptance:** source truth table in tests, failure isolation. Архитектура/основная реализация приняты; исправления внешнего review выполнены и проверены. PR #2 merged в `main` как `0268056`; в рамках подготовки следующего промпта агент merge не выполнял. Stage 3 требует нового явного задания владельца и выбора Codex feed.

## Stage 3 — Codex adapter

Implement approved Codex feed and semantics (`announced_at != delivered_at`, future scheduled hint vs announced, seeded attribution, banked), stable IDs and safe fallback. Fixtures.

**Acceptance:** verified delivery never inferred from timing; tests green.

**Local implementation, 2026-10-21:** владелец отдельно разрешил [START_STAGE3.md](../prompts/START_STAGE3.md) и выбрал `codexreset.ai`. Реализованы строгая схема, source-specific mapping и независимый HTTP/cache reader. Достоверный будущий анонс может иметь exact/date/unknown ожидаемое время; доставка требует отдельного достаточного evidence и непустого `delivered_at`. Scope, detection/announcement/delivery clocks и seeded attribution сохранены. Worker остаётся инертным, D1/publisher не добавлены. Проверки и review: [28_STAGE3_REPORT.md](28_STAGE3_REPORT.md); текущий контекст: [29_STAGE3_HANDOFF.md](29_STAGE3_HANDOFF.md). Production truth/publication policy остаётся pending. После отчёта владелец отдельно разрешил локальный commit; актуальное разрешение на доработку PR #3 указано ниже. Deployment и Stage 4 не разрешены.

**PR #3 follow-up:** владелец отдельно разрешил только два P2 исправления,
тесты, независимое review и commit/push в существующую Stage 3 ветку. Banked
требует отдельного проверенного offer evidence; явный scheduled futureTarget
должен совпадать с raw по точности/значению. Merge, deployment и Stage 4 не разрешены.

**Verified handoff update, 2026-10-22 Europe/Moscow:** оба P2 исправлены в
`06a90a97629704fce04a1e272ff9e75a89acb446` и отправлены в ветку PR #3.
Локальные проверки и независимое review успешны: 186 tests passed, 2 opt-in
skipped, Stage 0 verify139 PASS; CI run #9 completed/success. GitHub подтвердил
PR #3 merged `2026-10-21T20:56:29Z` в `2190622c0ace8f539b3eed788e33a9d68bbcdd91`,
remote main тот же. Агент merge не выполнял. Текущий handoff сохраняет отличие
от устаревших local main/origin/main refs; новая сессия обязана проверить базу.

## Stage 4 — D1 schema and shared normalization/policy

D1 migrations, indexes, per-provider baseline, immutable revisions, source health, idempotent event policy and atomic Telegram delivery journal. Stale threshold/freshness contract needed for future API. Simulated overlapping Cron.

**Acceptance:** local D1 tests and complete baseline without sending old events.

**Локальная реализация, 2026-10-22:** владелец принял Stage 3 с исправлениями
PR #3 и явно назначил [START_STAGE4.md](../prompts/START_STAGE4.md). Реализованы
локальная migration, canonical D1 repository, immutable observations/material
versions, независимые baseline и HTTP snapshot restore, typed normalization,
прямой ingestion service и synthetic journal. Worker handlers и Cron инертны;
publish approvals отсутствуют. Фактические проверки и ограничения:
[Stage 4 report](30_STAGE4_REPORT.md), [current handoff](31_STAGE4_HANDOFF.md).
Приёмка Stage 4 владельцем остаётся отдельным решением. Stage 5, runtime wiring,
remote migrations, публикация, deployment и push/PR не разрешены. После проверок
и консолидации владелец отдельно разрешил только локальный commit Stage 4.

## Stage 5 — Telegram publisher

Format distinct announcement/confirmed/offer/correction messages, source+upstream attribution, accurate audience/times; `dry_run`; Telegram failure behavior. After explicit approval, ONE staging channel E2E publication.

**Acceptance:** staged message looks correct and no prod channel touched.

## Stage 6 — Staging Cloudflare

Owner-controlled D1/Secrets/Wrangler setup, staging Cron observation, dedup and upstream staleness monitoring; staging channel tests only after approval. Review quotas/logs.

**Acceptance:** stable staging and verified safety flags.

## Stage 7 — Resilience and production readiness

Review failures, source changes, audit/methodology, backoff, corrections, attribution, legal/trademarks, rollback. Regression suite and manual prod checklist.

**Acceptance:** release candidate and owner green light.

## Stage 8 — Production Telegram release (two approvals)

Owner-authorized prod D1 migration/deploy **dry_run**, two independent baselines, explicit owner authorization to enable production publication per source. Monitor first actual eligible event; no artificial production post.

**Acceptance:** stable production channel publisher, documented limitations.

## Stage 9 — Public read-only Worker API

Implement `GET/HEAD/OPTIONS /api/v1/events`, `/api/v1/status`, `/api/v1/stats` from D1; bounded query filters and stable pagination, safe projection, CORS allowlist, cache/ETag, error mapping; factual per-source freshness, schema version. Add API contract tests and OpenAPI/JSON examples **derived from our code**. Run in staging first, then owner-approved prod deploy.

**Acceptance:** three real endpoints from D1, no publish side-effect under any HTTP request; CORS test from intended GitHub Pages origin, privacy/cost test.

## Stage 10 — Static website (GitHub Pages)

Vite + TypeScript + CSS (no React by default), responsive RU/EN landing/dashboard, current status cards, history filtering/pagination and details with evidence links, subscribe CTA, GitHub link, methodologies, accessibility/SEO, error/stale states. Lightweight factual chart. Deploy with GitHub Actions; project `base=/reset-radar/`; build env points at public Worker API. Owner checks live site/cross-origin requests on device.

**Acceptance:** working Pages URL, correctly loaded JS/CSS and real D1 data, valid links, no secrets, mobile/a11y checks, deployment approval.

## Stage 11 — Analytics polish and operations

Improve observed monthly counts, per-provider observed interval stats only if eligible, coverage/seed caveats, safe chart, performance/loading, error monitoring, privacy-friendly traffic measurement if approved, crosslink GitHub↔site↔channel, README and runbooks. Add freshness/trust notes and introductory pinned post after release.

**Acceptance:** metrics formula tests, UX review, budget monitoring, explicit source attributions, launch checklist complete.

## Out-of-scope backlog (separate project decisions)

Bot `/start` directing to channel, then provider-specific subscriptions; more providers (Cursor/Gemini/Copilot) only with reliable feeds; custom domain; advanced admin UI; paid subscriptions; personal usage tracking **only after distinct security/API feasibility research**, never by collecting passwords/tokens. No scraped/forecast probabilities misrepresented as public resets.

## Stage report checklist

- Changed files, run commands and tests, verified vs assumed, permissions needed, risk/rollback, docs updated, recommended PR summary, exact next stage request. **STOP until owner approves.**
