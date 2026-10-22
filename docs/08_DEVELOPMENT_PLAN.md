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
Владелец принял локальный результат Stage 4 из PR #4 и отдельным заданием
разрешил только локальный Stage 5. Runtime wiring, remote migrations,
публикация, deployment и новые Git operations этим не разрешены.

**Проверка handoff, 2026-10-22:** commit `7121756` сохранён и уже входит в main
через [PR #4](https://github.com/Khimish009/reset-radar/pull/4), merge `2a0a958`;
CI implementation SHA — successful run #11. Push/PR/merge выполнил владелец или
внешний процесс, не агент этой подготовки. Это не production policy signoff.

## Stage 5 — локальный Telegram publisher

Локальный scope включает typed Telegram `sendMessage` client для loopback
substitute, truth-preserving templates/previews и direct publisher service с
отдельной simulation-only D1 journal. Тестовый transport фиксирован на
synthetic token/chat и loopback URL; общего или production client endpoint нет.
`dry_run` возвращает preview/skip без сетевого вызова и без journal claim.
Worker handlers не импортируют publisher, `readConfig()` и окружения остаются в
`dry_run`, Cron остаётся выключен.

Локальная eligibility проверяет provider baseline-bound synthetic approval и
переходную отметку review, привязанную к `transitionId` + `rawKey`; stale
candidate/current revision, generation/observation race и три независимых
freshness слоя закрывают публикацию. В локальной policy все значения freshness
явно передаются, максимум 24 часа, HTTP checks — максимум 10 минут. Эти значения
и все approvals относятся только к локальным тестам; production пороги, workflow
и включение публикации остаются pending. Date-only target/offer, наступившие в
текущий UTC день, консервативно подавляются. Retry ограничен валидированным 429,
`retryAt` не более часа и максимум тремя попытками; ambiguous/claimed outcomes
требуют ручной проверки без lease recovery.

**Acceptance:** финальные проверки, local HTTP simulation и independent review
записаны в [Stage 5 report](32_STAGE5_REPORT.md); текущий контекст —
[Stage 5 handoff](33_STAGE5_HANDOFF.md). Не подменять результаты отчёта планом
проверок в [test matrix](06_TEST_STRATEGY.md).

Owner accepted local Stage 4 and assigned only this local Stage 5. Real Telegram
requests/sends, runtime wiring, production approvals, commit/push/PR/merge,
remote migrations, deployment and Stage 6 remain outside this authorization.
Subsequent PR #5 review/CI fixes received separate commit/push authorization and
are merged as `ba8bd58`; CI #15 (PR head `bb2cd25`) and #16 (merge) passed.
Details and exact SHAs: [current handoff](33_STAGE5_HANDOFF.md).

## Stage 6 — Staging Cloudflare

**Локальная часть назначена владельцем 2026-10-22** через
[START_STAGE6](../prompts/START_STAGE6.md), с принятием Stage 5 из merged PR #5.
Scope: dry-run runtime integration, настоящий local D1, offline/loopback HTTP
tests, независимое review и конкретный remote plan. Фактические результаты:
[original local report](34_STAGE6_LOCAL_REPORT.md), [current handoff](39_STAGE6_CAPACITY_HANDOFF.md).
Полный acceptance ниже остаётся pending до отдельно разрешённого remote наблюдения.

Scheduled подключает ingestion только при явных local/staging настройках и DB.
Default/missing config и production не начинают polling; supplied configs
сохраняют dry_run/Cron off. Invocation ограничен страницами/записями/requests;
partial history не завершает baseline. HTTP guards и оба synthetic send journals
сохранены, real publisher отсутствует. Remote deploy/migrations/secrets, Cron,
реальные upstream/Telegram requests, новые commit/push/PR/merge и Stage 7–11 не разрешены.

**Подготовка следующей сессии:** local commit `7b4e129` вошёл в merged
[PR #6](https://github.com/Khimish009/reset-radar/pull/6), main `22ebefe`.
PR CI #17 success, merge CI #18 failure: cache-validation D1 test timeout 5s,
310 passed/1 failed/5 skipped; [historical evidence](evidence/stage6-2026-10-22/ci18.md)
сохранено. Затем владелец явно назначил [CONTINUE_STAGE6](../prompts/CONTINUE_STAGE6.md).
В локальном продолжении cache-validation cases разделены без изменения global
timeout/parallelism, добавлен real-D1 workload harness и подготовлен staging
change set. Фактические проверки и review — [preflight report](36_STAGE6_PREFLIGHT_REPORT.md).
Активный staging **NO-GO**: account/plan/target/budget, query accounting и CPU
не подтверждены, capacity>100 требует отдельного решения (ADR-042).
После отчёта владелец разрешил commit/push:7a9eedf отправлен агентом и вошёл в
[PR#7](https://github.com/Khimish009/reset-radar/pull/7), merged внешним процессом
как1bfbe98. PR CI19 и merge CI20 success; CI18 остаётся historical failure.
[Evidence](evidence/stage6-2026-10-22/pr7-ci.md). Stable-staging acceptance pending.
**Capacity design назначен владельцем 2026-10-22** через
[CONTINUE_STAGE6_CAPACITY](../prompts/CONTINUE_STAGE6_CAPACITY.md): только local
design/decision, checks/review и STOP. [Decision proposal](38_STAGE6_CAPACITY_DECISION.md)
сравнивает A/B/C; рекомендован C с grouped writes, owner choice pending.
Новый bootstrap protocol не реализован. Следующий предлагаемый gate — отдельное
local C implementation assignment; remote account/plan/budget/accounting остаются
unknown и active staging NO-GO. [Текущий handoff](39_STAGE6_CAPACITY_HANDOFF.md).
Stage7 — только после завершения Stage6 и отдельного назначения. Новые Git
publication/remote действия не разрешены.

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
