# 29 — Передача контекста после локального Stage 3

Сохранено **2026-10-22, Europe/Moscow**; GitHub timestamps ниже — UTC.
Проект: `/Users/salman/pet_projects/reset-radar`.
Текущая локальная ветка при подготовке handoff: `feat/stage3-codex-adapter` на
`06a90a97629704fce04a1e272ff9e75a89acb446`; рабочая копия была чистой. Перед
новой работой перепроверь staged/unstaged/untracked, Git history, состояние PR
и базу. См. также [подготовленный prompt Stage 4](../prompts/START_STAGE4.md):
сам файл — только handoff и не разрешение начинать реализацию.

## Последнее проверенное состояние PR #3 и границы следующей сессии

GitHub connector подтвердил, что [PR #3](https://github.com/Khimish009/reset-radar/pull/3)
закрыт и merged **2026-10-21 20:56:29 UTC**. Merge SHA и подтверждённый remote
`main`: `2190622c0ace8f539b3eed788e33a9d68bbcdd91`. CI run #9 для P2 исправлений
успешен: [GitHub Actions](https://github.com/Khimish009/reset-radar/actions/runs/39674152811).
Merge выполнил владелец/внешний процесс; агент merge не выполнял.

Локальная проверка refs показала, что и локальный
`main`, и локальный `origin/main` всё ещё на `0268056c98ec73b19c15202ddfb56666f8c6edd7`,
то есть отстают от подтверждённого remote merge SHA. Fetch не выполнялся:
не смешивай последнее подтверждённое состояние GitHub с устаревшими локальными
refs. Подготовительные изменения handoff/prompt/README/roadmap без commit не
появятся в новом клоне; для продолжения используй эту же папку и сохрани эти
изменения.

Текущая просьба подготовить контекст не авторизует Stage 4. Предыдущее разрешение
на commit/push относилось только к двум P2 исправлениям PR #3 и исчерпано.
После нового явного assignment для Stage 4 сначала проверь рабочую копию,
историю, актуальное состояние PR и базу. Только если assignment это прямо
разрешает, выполни `git fetch` и безопасный fast-forward локального `main`;
создай новую `feat/stage4-d1-policy` от обновлённого `main`, содержащего оба P2
исправления. Если после проверки выяснится, что PR #3 gate не завершён или нужных
исправлений нет в базе, остановись и сообщи владельцу; самостоятельно не сливай.
Не продолжай на неподтверждённой или неожиданной базе.

Только после отдельного assignment разрешена локальная работа Stage 4, включая
локальную схему D1 и локальные миграции в его принятом scope. Не подключай Cron
или runtime handlers, Telegram publisher Stage 5, public API Stage 9,
production/remote D1 и deployment. Production publication policy и связанные
ADR остаются pending. После явного Stage 4 assignment допустимы документированные
консервативные локальные policy/transition/claim решения в scope промпта;
они не утверждают production eligibility, publish activation или реальные sends.
Не выполняй Stage 4 в сессии, где просят только подготовить prompt/handoff.

## Разрешение и результат

Владелец ранее явно разрешил только START_STAGE3.md и затем выбрал **codexreset.ai**.
`codex-resets.com` остаётся исследованной альтернативой и archive credit;
автоматического fallback, дополнительных API-вызовов или слияния историй нет.
Дополнительное требование владельца — приоритет достоверного будущего анонса
до доставки, включая анонс без даты. [Фактический отчёт](28_STAGE3_REPORT.md).

В `src/providers/codex/` реализованы strict schema, source-specific mapping,
transport и unpaginated reader. Handler’ы Worker не создают адаптеры;
scheduled/fetch инертны, Cron выключен, environments dry_run. Нет D1,
Telegram publisher, публичных endpoints или website implementation.

Исходный Stage 3 сохранён в `dbf5e3cce1047a3188d710b37456136f3d6313db`; затем
P2-фиксы сохранены в `06a90a97629704fce04a1e272ff9e75a89acb446` и отправлены
в существующую ветку PR #3. На завершении первоначальной реализации новые
код/тесты/evidence были untracked.
Существовавшие до Stage 3 README, docs 08/27 и START_STAGE3 сохранены и входят
в отдельно разрешённый локальный commit вместе с результатом Stage 3.
При старте P2 доработки PR #3 remote/local совпадали на `dbf5e3c`, CI этого SHA
был successful. P2 SHA и CI/merge факты указаны выше; локальные `main` refs
не обновлялись и не отражают merge.

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
- Banked без отдельного достаточного assessment assertion=`banked_offer`
  остаётся `needs_review` с `banked_offer_unverified`. Проверка связывает raw
  URL, полный record key, rationale и primary URL. Принятый assessment сохраняется
  в reviewedEvidence/provenance; `delivered_at` не заменяет evidence оффера.
- Для scheduled явный `assessment.futureTarget` должен совпасть с raw target
  по precision и значению. Exact сравнивается как UTC instant, date — буквально;
  отсутствующий target сохраняет прежний raw-derived путь. Explicit unknown,
  cross-precision, conflict и malformed target — review с отдельной причиной.
  `scheduled_for` при наличии определяет target; raw.day не превращается в UTC-день.
- `announced_at`, delivered и local detection сохранены раздельно; `ts`/`date`
  остаются raw и никогда не заполняют effective. Date-only future строго после
  сегодняшней UTC-даты, без придуманной полуночи/timezone события.
- Scope сохраняется буквально. Scheduled audience неизвестен, если assessment
  не содержит явно проверенного audience. Seeded/archive attribution сохранены.

## Проверки и продолжение

Последние локальные результаты P2 доработки PR #3: typecheck/lint PASS, полный
offline Vitest 186 passed / 2 opt-in skipped, Stage 0 verify139 PASS, diff
whitespace PASS. Независимое review двух P2 `pr3_p2_review` (reviewer,
gpt-6.1-sol, reasoning high) завершено без оставшихся critical/high/medium
findings; reviewer независимо выполнил те же пять обязательных проверок,
включая полный набор 186 PASS / 2 skipped. Эти результаты относятся к локальному
P2 SHA `06a90a9`.
Первоначальная HTTP simulation1 PASS относится к `dbf5e3c`; после чистых
mapping исправлений simulation не повторялась. Mock остановлен, exit0/SIGINT.
Первоначальное review `stage3_review` (reviewer, gpt-6.1-sol, reasoning high)
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
