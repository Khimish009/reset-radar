# 29 — Передача контекста после локального Stage 3

Сохранено **2026-10-21**. Проект: `/Users/salman/pet_projects/reset-radar`.
Актуальная ветка при реализации: `feat/stage3-codex-adapter`, от main
`0268056c98ec73b19c15202ddfb56666f8c6edd7` (merged PR #2 с fixes `ae89017`).
Перед новой работой проверь staged/unstaged/untracked и последние указания
владельца. После отчёта Stage 3 владелец отдельно разрешил локальный commit;
фактический SHA проверять по Git history. Push/PR не разрешены и не выполнялись.
**Stage 4 не разрешён.**

## Разрешение и результат

Владелец явно разрешил только START_STAGE3.md и затем выбрал **codexreset.ai**.
`codex-resets.com` остаётся исследованной альтернативой и archive credit;
автоматического fallback, дополнительных API-вызовов или слияния историй нет.
Дополнительное требование владельца — приоритет достоверного будущего анонса
до доставки, включая анонс без даты. [Фактический отчёт](28_STAGE3_REPORT.md).

В `src/providers/codex/` реализованы strict schema, source-specific mapping,
transport и unpaginated reader. Handler’ы Worker не создают адаптеры;
scheduled/fetch инертны, Cron выключен, environments dry_run. Нет D1,
Telegram publisher, публичных endpoints или website implementation.

На завершении реализации новые код/тесты/evidence были untracked.
Существовавшие до Stage 3 README, docs 08/27 и START_STAGE3 сохранены и входят
в отдельно разрешённый локальный commit вместе с результатом Stage 3.
Новая копия remote не содержит локальную работу до отдельного разрешения push.

## Семантика и interfaces

- `parseCodexFeed` отвергает missing/unknown/version/enum/shape drift. Full raw
  rejection доступен только во внутреннем result; logger/public API его не получают.
- `createCodexTransport(deps, state?, {timeoutMs?}?)` делает только GET
  `https://codexreset.ai/api/v1/resets.json`. Cache/ETag/backoff/in-flight
  отдельны от Claude. TTL default300s, floor60s, max-age/Age; 304 требует
  snapshot и сохраняет старый ETag, если новый не пришёл. Есть bounded body,
  timeout с actual fetch/reader cancellation и cleanup, finite backoff.
- `createCodexAdapter(...).readHistory()` сохраняет последний валидный feed,
  missing events/scheduled с их прежним context и detection time. Нет inferred
  withdrawals. `eventDetectedAt` и `scheduledDetectedAt` — первая локальная
  observation текущего содержимого, сохраняется при cache/304/новом generated_at;
  изменение содержимого получает новый local timestamp. State только in-memory.
- `mapCodexEvent`/`mapCodexScheduled` принимают только parsed source data и
  явный trusted `CodexEvidenceAssessment` после semantic review. Key связывает
  assessment с точным raw содержимым; это не upstream revision. Передавай
  `context.detectedAt` из snapshot event map/scheduled timestamp; иначе результат
  отражает момент mapping, а не более раннее обнаружение reader.
- Assessment обязательно содержит явный `primarySourceUrl` из reviewed evidence,
  URL и rationale. Принятый `reviewedEvidence` сохраняется только во внутреннем
  mapped result; provenance содержит union raw и valid reviewed URLs. Stale или
  invalid assessment не переносит свои URL, primary claims или audience.
- `announced_future` с `expectedTime=exact/date/unknown` не доставка. Для
  неизвестной даты нового общего enum нет; `verifiedFutureTarget=null`.
  Upstream scheduled всё ещё требует day; undated future возможен через
  отдельно reviewed regular announcement с null delivery, не через fake schema.
- Applied требует `kind=regular`, непустого прошедшего delivered_at и matching
  assessment с достаточным primary evidence. Homepage/URL/timestamp сами по себе
  недостаточны. Live originals в Stage 3 не подтверждались. Hinted/unreviewed
  regular остаются review. Banked не consumption/current-active reset.
- `announced_at`, delivered и local detection сохранены раздельно; `ts`/`date`
  остаются raw и никогда не заполняют effective. Date-only future строго после
  сегодняшней UTC-даты, без придуманной полуночи/timezone события.
- Scope сохраняется буквально. Scheduled audience неизвестен, если assessment
  не содержит явно проверенного audience. Seeded/archive attribution сохранены.

## Проверки и продолжение

Последние результаты: typecheck/lint PASS, полный offline Vitest 162 passed /
2 opt-in skipped, Stage 0 verify139 PASS, diff whitespace PASS. Local Postman
HTTP simulation1 PASS на финальном коде; mock остановлен, процесс exit0/SIGINT.
Независимое review `stage3_review` (reviewer, gpt-6.1-sol, reasoning high)
завершено без оставшихся critical/high/medium findings; 124 targeted Codex/Claude
tests и diff check PASS. Исправлена потеря дополнительных primary evidence URLs.

Opt-in HTTP: `postman simulation run postman/simulations/codex-local.sim.yaml
--port 4902 --output ndjson --no-history`, затем
`env CODEX_SIMULATION_URL=http://127.0.0.1:4902 npm test -- --run
tests/codex-simulation.test.ts`. Sandbox может потребовать разрешения на
loopback; это не remote deploy. Mock нужно остановить после проверки. Mocks
synthetic, workspace не привязан. Stage 0 projections не являются parser fixtures.

Предложения product/truth/будущей Telegram policy находятся в docs 01/12/22.
Владелец принял приоритет раннего информирования, но не production policy,
durable journal/correlation или publish eligibility. После отчёта остановиться;
не выводить разрешение Stage 4 из checklist, passing tests или handoff.

**Не развёрнуто / не опубликовано.**
