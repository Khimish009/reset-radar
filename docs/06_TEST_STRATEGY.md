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
- [x] Independent Stage 2 review completed; owner accepted local result with fixes by separately assigning Stage 3; see [Stage 2 handoff](27_STAGE2_HANDOFF.md).

### Stage 3 — Codex adapter (local, codexreset.ai only)

- [x] Full synthetic schema fixtures reject drift/unknown fields, kinds, certainty, missing fields, bad precision, duplicate IDs and bounded payload violations. Actual live feed separately accepted by parser; no historical projection is treated as a complete fixture.
- [x] Announcement, detection and upstream-reported delivery clocks remain separate; `ts`/`date` never fill `effective`. Null delivery and weak/stale evidence never confirm application; banked requires an explicit content-bound `banked_offer` assessment and never implies consumption.
- [x] Future announcements with exact/date/unknown expected time require explicit content-bound primary-evidence assessment. Hinted, past/invalid targets and unreviewed rows stay review. Date-only compares strictly with the current UTC calendar date.
- [x] A provided scheduled `futureTarget` must match raw precision and value; conflicting, malformed and cross-precision targets stay review without retaining rejected assessment URLs/audience. Omission preserves the existing raw-target path; date-only never becomes an exact time.
- [x] Preserve scope/unknown audience and seeded/archive attribution. Detection of new/changed contents is retained in memory separately from HTTP check time; missing rows/scheduled retain provenance without inferred withdrawal.
- [x] Conditional GET/304/cache, 60s floor/current 300s default, Retry-After/429/503, body limits, cancellation/lock/listener cleanup, late responses and independent Claude/Codex state covered offline.
- [x] Opt-in real HTTP against our local synthetic Postman simulation exercises both providers and failure isolation. It does not verify live primary evidence or production behavior.
- [x] Owner accepted local Stage 3 with PR #3 fixes when assigning Stage 4.
- [ ] Separate production truth/publication policy approval; see [Stage 3 report](28_STAGE3_REPORT.md).

### Stage 4 — локальная D1, normalization и ingestion

Stage 4 tests должны использовать локальный workerd D1, а не SQL mock. Harness
создаёт binding через pinned `miniflare@5.20261019.1-beta` и
`convertV4MiniflareOptions`, затем применяет SQL, разбитый
`unstable_splitSqlQuery` из установленного Wrangler. Это проверяет локальную
совместимость D1 API и миграции; remote D1 поведение и production runtime этим не
подтверждаются.

- [x] Миграция создаёт таблицы, constraints, foreign keys, индексы и immutable triggers.
- [x] Ошибка одного statement в snapshot `D1.batch()` откатывает всю операцию; конкурирующий provider generation проигрывает CAS без частичного commit.
- [x] Version/observation неизменяемы; шум ключей JSON, ETag, check time и revision-only изменения не создают material transition; A→B→A создаёт три последовательные версии.
- [x] Baseline каждого provider независим, идемпотентен и создаёт ноль publication candidates, даже для свежих строк; approval остаётся `NULL`.
- [x] Повторное чтение/restart с тем же D1 сохраняет `detectedAt` и `first_detected_at`; новые material observations не переписывают первое обнаружение.
- [x] `304` восстанавливает schema-valid snapshot только для того же provider/endpoint/query; повреждённый, истёкший или неверной версии cache не использует validator. Проверяются лимит 128 endpoints и retention 24 часа.
- [x] Claude baseline требует counted history + status union, matching content revision, total и пересечение ID; partial/outage не завершает baseline. Codex unpaginated completeness явно тестируется как локальное допущение.
- [x] Ошибка одного provider не блокирует другой; сбои сохраняют последний valid snapshot и события; missing records не превращаются в withdrawal.
- [x] Assessment привязан к digest raw content; stale/rejected evidence не переносит ссылки/audience. Claude correction указывает на сохранённую earlier version; Codex ambiguous correlation не объединяется эвристически.
- [x] Future announcement, позднее подтверждённая доставка и неизвестное expected time остаются отдельными truth cases; `delivered_at=null` не становится confirmation, banked offer не считается использованным.
- [x] Параллельный synthetic claim даёт только один committed initial claim для уникального destination; retry разрешён лишь после явного `retryable`; ambiguous outcome остаётся `uncertain_manual_review` после restart без lease recovery.
- [x] Ни один тест не вызывает live upstream API, Telegram или production endpoint; Worker handlers остаются инертными.

**Финальные команды Stage 4 и результаты: [Stage 4 report](30_STAGE4_REPORT.md).**

```sh
npm run typecheck
npm run lint
npm test
npm run d1:migrate:local
npm run test:d1
python3 docs/evidence/stage0-2026-10-21/verify.py
git diff --check
```

Финальный результат: typecheck/lint PASS; полный Vitest **226 passed / 3 opt-in
skipped**; `test:d1` **24 PASS**; normalization **16 PASS**; migration **23 commands
PASS**, повтор без новых migrations; Stage 0 verify **139 PASS**. Opt-in Stage 4
HTTP+D1 simulation — **1 PASS**, финальные 18 HTTP requests (36 за два успешных
прогона), runtime restart/304/errors. Simulation остановлена SIGINT, exit 0.
Независимый reviewer повторил полный Vitest 226/3, typecheck/lint/verify/diff-check.
Оба medium finding исправлены: explicit Claude correction/retraction не обходит
truth gate через unknown future, Codex event/scheduled identities не коллидируют.
Website build к Stage 4 не относится.

Revision-only metadata не меняет hash при неизменном принятом evidence. Если
полная raw запись изменилась, assessment становится stale; потеря принятого
assertion сама является значимым изменением и ведёт в review. Наступивший
future target без delivery evidence также консервативно переводится в review,
с сохранением прежней immutable версии (ADR-031).

### Stage 5 — локальный Telegram renderer, publisher и simulation

Stage 5 tests use synthetic event/policy data, local workerd D1 and a loopback
HTTP substitute. They do not call `api.telegram.org`, use real credentials, or
establish production eligibility. The direct publisher service is not imported
by Worker handlers; `readConfig()` remains `dry_run`.

- [ ] Renderer tests cover both providers and announcement, applied, offer,
  correction and withdrawal truth cases; review/hinted/seeded events, invalid or
  missing evidence, unknown audience, date/unknown precision, unsafe URL/text,
  Unicode and length rejection are covered.
- [ ] `dry_run` returns truthful preview/skip results without a client call or
  row in `telegram_simulation_deliveries`; local simulation uses only the fixed
  synthetic chat/token and loopback substitute.
- [ ] Eligibility checks bind local approval to provider baseline and each
  transition to its `rawKey`; tests distinguish current generation/editorial
  truth, HTTP freshness and successful cached-ingestion freshness. Explicit
  freshness settings are bounded to 24 hours, with HTTP at most 10 minutes.
- [ ] Candidate paging is bounded to 50 and uses a stable keyset. Stale/current
  transition races, generation/observation CAS, concurrent claims, replay and
  restart do not create duplicate automatic sends.
- [ ] Same-day date-only future targets and offer expiry are conservatively
  suppressed. Only validated 429 retry timing (no more than one hour) is
  retryable, with at most three attempts; timeout, malformed response, ambiguous
  5xx and completion-write failure remain blocked for manual review without
  lease recovery.
- [ ] The local HTTP simulation exercises client + publisher + D1 and records
  the mock request; no internet pass-through or real Telegram request occurs.
- [ ] Independent review and final local verification are recorded in the
  [Stage 5 report](32_STAGE5_REPORT.md); exact results belong there, not in this
  planned acceptance matrix. The current handoff is [33_STAGE5_HANDOFF.md](33_STAGE5_HANDOFF.md).

Run the Stage 5 suite with the normal checks and local migration:

```sh
npm run typecheck
npm run lint
npm test
npm run test:d1
npm run d1:migrate:local
python3 docs/evidence/stage0-2026-10-21/verify.py
git diff --check
```

The `test:d1` script includes the Stage 5 storage tests. Record only commands
actually run and their observed outputs in the Stage 5 report. Website build
does not apply to this stage.

- [ ] Claude: confirmed reset, future announcement, active/redeemable banked offer, expired offer, revision and explicit withdrawal, unexpected enum.
- [ ] Codex: announcement with `delivered_at=null` **never** labeled complete; delivered later creates correct state change; `scheduled.certainty=hinted` not auto-published.
- [ ] `304` preserves cached snapshot; bad JSON, partial pagination and 429/503 do not delete records or trigger retractions.
- [ ] Mixed-source outage: Claude failing doesn't prevent Codex; independent staleness timestamps.
- [ ] Source switch and historical `seeded` records don't replay old Telegram posts.
- [ ] Concurrent local publisher calls create at most one simulation claim; ambiguous loopback outcome remains for manual review without lease recovery.
- [ ] `dry_run` makes no client call and creates no simulation journal row; local simulation uses only the fixed synthetic chat ID/token. Live staging/production destinations remain untested and require separate authorization.
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
