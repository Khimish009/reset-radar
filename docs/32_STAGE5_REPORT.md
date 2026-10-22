# 32 — Отчёт локального Stage 5

Дата: **2026-10-22**. Владелец явно принял локальный Stage 4 из PR #4 и поручил
выполнить `prompts/START_STAGE5.md`, затем tests, независимое review и остановку.
Production truth/publication policy этим не утверждена.

Ниже сохранён первоначальный отчёт Stage 5. Актуальная доработка внешнего review
PR #5 и её проверки описаны в последнем разделе этого документа.

## Выполнено и границы

- Отдельный типизированный `sendMessage` client: injected fetch/clock,
  timeout/cancellation, bounded UTF-8 JSON stream, проверка HTTP и Bot API
  envelope/Message identity. Только loopback substitute и фиксированный
  synthetic token. `ok`/HTTP 200 отдельно не считаются успехом.
- Plain-text deterministic renderer для двух providers и пяти действий:
  future announcement, applied, offer, correction, withdrawal. Exact/date/unknown
  разделены; Codex null delivery не подтверждается; Claude unknown application
  time не заменяется announcement timestamp. Audience из canonical record.
  Evidence/tracker/disclaimer сохраняются, unsafe/overlong текст отклоняется.
- Прямо вызываемый publisher поверх immutable версии и текущих facts. Explicit
  local/test approval привязан к provider baseline, transition/rawKey/reviewedAt.
  Отдельно проверены ingestion success, HTTP checks, upstream generation/review,
  candidate age, review age, текущий transition и expired target/offer.
- Forward migration `0002_stage5.sql`, bounded indexed keyset query (до 50),
  отдельный simulation-only journal. Atomic claim включает current observation
  и provider generation CAS; ownership token защищает completion. `dry_run`
  не обращается к client и не создаёт claim. Новый approved applied transition
  после announcement имеет отдельный intent; replay/noise не создают повтор.
- Valid bounded 429 → persisted retryAt, до трёх попыток. Refusal терминален;
  ambiguity и abandoned claim не auto retry. Failure completion D1 после
  возможного mock send оставляет durable blocked claim. Exactly-once не заявлено.
- Synthetic previews, unit/D1/HTTP tests, локальная документация и ADR-032–036.

Не выполнялись real Telegram requests/sends, runtime wiring, public API/website,
Stage 6, commit/push/PR/merge, remote migration/resources/secrets/deployment.
`src/index.ts`, `src/env.ts`, `src/runtime.ts`, оба Wrangler configs и
`migrations/0001_stage4.sql` сохранены без изменений относительно базы.

## Изменённые файлы

Новая реализация:

- `src/telegram/client.ts`, `src/telegram/templates.ts`;
- `src/services/publish.ts`, `src/storage/publisher.ts`;
- `migrations/0002_stage5.sql`;
- `postman/mocks/telegram/default.js`, `postman/simulations/telegram-local.sim.yaml`.

Проверки и fixtures:

- `tests/telegram-client.test.ts`, `tests/telegram-templates.test.ts`;
- `tests/stage5-storage.test.ts`, `tests/stage5-publish.test.ts`;
- `tests/stage5-telegram-simulation.test.ts`, `tests/helpers/stage5.ts`;
- `tests/helpers/d1.ts` теперь применяет forward migrations по порядку;
- `package.json`: `test:d1` включает Stage 4 и Stage 5.

Документация:

- `README.md`, docs `03`, `06`, `08`, `09`, `10`, `12`, `manual/OWNER_CHECKLIST.md`;
- этот report, `33_STAGE5_HANDOFF.md`, `docs/evidence/stage5-2026-10-22/`.

До начала задачи уже были modified README/docs08/docs30/docs31/checklist и
untracked `prompts/START_STAGE5.md`. Подготовительные правки сохранены;
docs30/docs31/prompt в текущей задаче не переписывались. Поэтому полный Git diff
включает и прежнюю подготовку, а не только новую реализацию.

## Реальные команды и результаты

| Команда | Фактический итог |
|---|---|
| `npm run typecheck` | PASS, strict source и test TypeScript |
| `npm run lint` | PASS, zero warnings |
| `npm test` | **282 passed / 4 opt-in skipped**, 17 passed test files |
| `npm run test:d1` | **43 PASS**, Stage 4 и Stage 5 на локальном Miniflare/workerd D1 |
| `npm run d1:migrate:local` | PASS, только `--local`: 0001 — 23 команды, 0002 — 4; повтор: no migrations to apply |
| `python3 docs/evidence/stage0-2026-10-21/verify.py` | **139 PASS**, offline structural evidence checks |
| `git diff --check` | PASS |
| opt-in `TELEGRAM_SIMULATION_URL=… npm test -- --run tests/stage5-telegram-simulation.test.ts` | **1 PASS**, exit 0; 11 send receipts, zero external traffic |

Website build неприменим: website не реализуется на Stage 5. Четыре skipped
tests — opt-in Claude, Codex, Stage 4 HTTP и Stage 5 HTTP; последний отдельно
выполнен выше. Live staging E2E не проводился. Existing Stage 4 regressions,
включая correction guard, tuple namespaces и ADR-031, входят в полный набор.

Первый общий запуск с одновременно исполняемыми тестами увидел промежуточный
незаконченный test fixture; после окончания edits он исправлен. Sandbox `EPERM`
на loopback потребовал разрешённого повторного запуска. Одновременные полные
D1-прогоны превысили стандартный timeout одного existing Stage 4 retention test;
последующие отдельные full/D1 прогоны прошли без изменения timeout или удаления
проверки. HTTP test обнаружил cancellation rejection в client; исправлено и
закрыто unit regression + успешным повтором настоящего local HTTP.
Нефатальный `DEP0040 punycode` исходит из test dependency stack.

## Подтверждённые факты и допущения

Read-only GitHub подтвердил PR #4 merged с merge SHA
`2a0a958941220dd1f9e8daf65e6ff666bcf52aed`; head
`712175673485360479a0141a771d7f0519781b23` имеет CI #11 success.
`git fetch origin` выполнен; main/origin/main/начальный HEAD совпали с merge SHA.
Создана только локальная `feat/stage5-telegram-publisher`, без commit. Новый CI
для незакоммиченных Stage 5 изменений не запускался.

Первичный [Telegram contract](https://core.telegram.org/bots/api#sendmessage)
проверен через документацию; Orbit discovery использован как вспомогательный
brief с partial fit. Details и ограничения: [contract](evidence/stage5-2026-10-22/telegram-contract.md).
Ни один запрос не направлялся в `api.telegram.org`. Только local HTTP substitute
подтверждает путь client→publisher→D1, а не реальную доставку Telegram.

Локальные freshness thresholds задаются явно: все до 24h, HTTP до 10min.
Tests используют 5min. Date-only target/expiry подавляются уже в тот же UTC-день
как conservative eligibility choice; это не утверждение об upstream timezone.
Unknown target не получает придуманного expiry. Источник не считается полным
или свежим только из-за successful cached ingestion/HTTP 200.
Codex correction/withdrawal previews являются renderer fixtures; текущий
Codex normalizer не поддерживает такие upstream transitions.
Существующий Stage 4 guard оставляет Claude credit/offer correction/withdrawal
в `needs_review`; он не ослаблен. Renderer поддерживает explicit expiry changes
в synthetic fixtures, а фактический accepted effective-only Claude correction
проверен через normalizeClaude и prior immutable payload. Неподдерживаемое
изменение отклоняется, а не заменяется общим текстом с потерей факта.

## Независимое review

`stage5_review` | reviewer | gpt-6.1-sol | high — **завершено**.
Существенных оставшихся findings нет; все три medium исправлены.

Три medium findings исправлены и проверены:

| Finding | Исправление / регрессия |
|---|---|
| Metadata-only ingestion между candidate SELECT и evaluation мог подменить generation и пропустить stale metadata | SELECT получает generation того же снимка; evaluation и claim используют его. Interleaving D1 test сохраняет raw/observation/transition и меняет только source metadata: zero client/claim |
| Correction могла терять изменённое effective/expiry время | Supported canonical facts выводятся с точностью и source-reported label; invalid/unsupported/no substantive diff → rejection. Normalized effective-only и rejected credit-correction regressions |
| Optional-OR cursor predicate сканировал уже пройденный prefix | Отдельная ветка SQL с прямым tuple range; D1 EXPLAIN проверяет range seek и отсутствие temp sort |

Reviewer самостоятельно выполнил client/templates: **37 PASS**, затем
publisher/storage на настоящем local D1: **19 PASS** после исправлений.
Root затем повторил весь обязательный набор на финальном коде; результаты выше.
Полный список tracked/untracked файлов просмотрен, staged diff пуст. Pattern scan
не выявил token/private-key patterns; защищённые runtime/config/0001/normalization
файлы побайтно совпали с HEAD. Substitute остановлен, слушателя 4903 нет.

## Риски, решения владельца и остановка

Production approval workflow, evidence/eligibility/freshness thresholds,
correlation Codex, реальные destinations/token setup, Telegram journal adapter
для настоящих исходов, live E2E, activation/runtime wiring и operations остаются
pending. Текущий synthetic journal нельзя превратить в real-send journal простой
подстановкой chat ID. D1 и сеть не транзакционны; blocked claim может нуждаться в
ручном разборе и намеренно не восстанавливается по lease.

Владельцу доступны [synthetic previews](evidence/stage5-2026-10-22/previews.md) и
[HTTP evidence/reproduction](evidence/stage5-2026-10-22/simulation.md).
Дальнейшие Git/remote/live действия требуют отдельного нового разрешения.
Нового PR нет. **Не развёрнуто / не опубликовано. Stage 6 не начат.**

После этого отчёта владелец отдельно поручил создать только локальный commit
Stage 5 с сохранённой подготовкой документации. Это последующее разрешение
не распространяется на push/PR/merge, remote/live операции или Stage 6.
SHA локального commit доступен в Git history; результаты проверок выше относятся
к проверенной реализации до commit, код при сохранении не менялся.

## Доработка внешнего review PR #5 — 2026-10-22

Владелец отдельно разрешил исправить два P2 и один P3, выполнить проверки и
независимое review, затем commit/push только в существующую ветку
`feat/stage5-telegram-publisher`. PR #5 открыт, не merged; локальный и remote head
при старте совпали с `b9ab639918ad64b6cf92a28c32772aa2ec5ff591`, дерево было чистым.
Новый PR, force push, merge, Stage 6, remote D1/Cloudflare и real Telegram
не входят в разрешение. Исходный PR создан владельцем/внешним процессом.

- P2 timestamp: `verifiedDelivery` в confirmed/correction подписан как время
  доставки/подтверждения по данным источника, не точное применение квоты аккаунта.
  Unknown Claude time остаётся неизвестным; announced/effective/detected его
  не заменяют. Обновлены templates, previews и message documentation.
- P2 late import: добавлен обязательный `maxEventAgeMs`, отдельно от возраста
  candidate. Codex проверяет verified delivery/raw deliveredAt; Claude —
  canonical effective/raw effectiveAt. Известное старое exact time не может
  быть «освежено» approval. При неизвестном времени нужна отдельная
  `current_reset_confirmation`; любое offer требует `current_offer` proof.
  Source confirmation time и evidence URL привязаны к accepted transition/rawKey.
  Future exact/date/unknown announcements сохраняют прежний путь. Пропуск
  отправки не изменяет D1 history, event versions или candidates.
- P3 cancellation: `reader.cancel()` запускается один раз без await;
  asynchronous rejection обработан, lock освобождается по возможности в finally.
  Deadline/caller abort/invalid response остаются uncertain, late cancellation
  не меняет уже возвращённый результат и не создаёт retry.

Регрессии сначала воспроизведены на старом коде: три timestamp expectations,
late imported reset/offer без current proof и locked response при hanging cancel.
Затем исправлены; source-aware late import дополнительно проверен через настоящий
Codex normalizer и локальный workerd D1. Для актуальных случаев synthetic current
proof задаётся явно; helper не выдаёт его всем событиям автоматически.

Изменены `src/services/publish.ts`, `src/telegram/{client,templates}.ts`, их три
test files, `tests/helpers/stage5.ts`, docs03/06/09/12, previews и Stage 5
report/handoff. Схема, journal/claim, runtime handlers, Cron/config и зависимости
не изменены. ADR-037/038 описывают local-only choices и не утверждают production.

Проверки follow-up на текущем коде:

| Команда | Результат |
|---|---|
| `npm run typecheck` | PASS |
| `npm run lint` | PASS |
| `npm test` | **299 passed / 4 opt-in skipped** |
| `npm run test:d1` | **55 PASS** |
| `python3 docs/evidence/stage0-2026-10-21/verify.py` | **139 PASS** |
| `git diff --check` | PASS |
| opt-in `TELEGRAM_SIMULATION_URL=… npm test -- --run tests/stage5-telegram-simulation.test.ts` | **1 PASS**, 11 synthetic send receipts |

Postman substitute повторно запущен локально на 4903 без proxy/pass-through,
проверен его NDJSON (9 completed sends + 2 receipt GET), затем SIGINT и exit 0.
Hang/disconnect получены mock и отдельно учтены тестом. Реальные Telegram и
Cloudflare не вызывались. Website build неприменим; migrations не менялись и
в этом follow-up не запускались. Нефатальный DEP0040 остаётся dependency warning.
Независимое `pr5_followup_review` (reviewer, gpt-6.1-sol, high) завершено:
существенных замечаний нет. Reviewer отдельно выполнил **42 PASS** client/templates
tests и diff-check. Root проверил полный tracked diff, отсутствие untracked
файлов/token-key patterns и сохранение 11 runtime/schema/dependency guards.
После проверок разрешены commit и обычный push только в существующую ветку
PR #5; SHA follow-up определяется Git history и итоговым сообщением владельцу.

Риски: current relevance — явный доверенный semantic assessment; код не читает
primary evidence сам и не гарантирует его достоверность. Пять локальных freshness
limits (в tests 5min, максимум 24h; HTTP максимум 10min) не являются production
policy. Historic records продолжают храниться; backward policy без нового limit
fail closed. Exactly-once и real live E2E не заявляются.
**Не развёрнуто / не опубликовано. Stage 6 не начат.**

## CI retention timeout — финальная доработка PR #5

Владелец отдельно поручил исправить CI run #14 failure после принятия трёх
предыдущих fixes. Стартовая база — `f8cb4ec854dd6a90f00a84ff6670c86103d9ab84`,
ветка `feat/stage5-telegram-publisher`, дерево чистое; remote/PR head совпали.

Прочитан job log `119697310819` из
[run #14](https://github.com/Khimish009/reset-radar/actions/runs/39740812693):
typecheck/lint success; 298 tests passed, один retention test прерван на **5034ms**
ошибкой `Test timed out in 5000ms`, 4 opt-in skipped. D1/SQLite error в логе нет;
остальные tests завершились, весь Vitest занял 30.22s. Это свидетельство
недостаточного test budget под нагрузкой, не бесконечного production retry.

Локально исходный test завершился за **1510ms** отдельно и **1709ms** в обычном
параллельном полном наборе. На этой машине исходный timeout не воспроизведён;
CI log — непосредственное evidence отказа на Ubuntu runner. Первый локальный
redirected запуск упёрся в sandbox loopback EPERM и повторён с разрешённым
доступом; это отдельная средовая ошибка, не D1 failure.

Только у `tests/stage4-storage.test.ts` retention case установлен **20_000ms**,
с комментарием о последовательных D1 commits. Все 103 настоящих repository
commitSnapshot вызова сохранены; SQL/D1 не заменялись fixtures/mock, чтобы
сохранить проверку всей retention границы. Глобальный Vitest timeout, worker
parallelism, production source и зависимости не менялись; test не отключён.

Новая проверка `result.committed` выявила отдельную ошибку старого fixture:
первая итерация после двух начальных commits передавала stale expectedGeneration
и игнорировала CAS refusal. Цикл исправлен на актуальный generation; теперь
доказаны все commits, generation **103**, точные последние generations **4–103**,
100 Claude/0 Codex sync rows, отсутствие source/commit guard остатков и наличие
исходного canonical event. Очистка transient cache проверяется до и после loop.
Таким образом увеличение timeout не подменяет проверки целостности данных.

Финальные команды на исправленном коде:

| Проверка | Результат |
|---|---|
| `npm run typecheck` | PASS |
| `npm run lint` | PASS |
| `npm test` / reporter-only verbose variant | **Три обычных параллельных прогона: 299 PASS / 4 skipped каждый** |
| `npm run test:d1` | **55 PASS** |
| `python3 docs/evidence/stage0-2026-10-21/verify.py` | **139 PASS** |
| `git diff --check` | PASS |

Измеренные retention durations после исправления: **3422ms** и **1680ms**;
третий полный прогон с обычным reporter занял 10.17s и также прошёл.
Независимый `pr5_ci_timeout_review` (reviewer, gpt-6.1-sol, high) завершён без
существенных замечаний. Reviewer проверил diff и реальный retention SQL;
дублирующий targeted run после трёх full и D1 не потребовался.

Проверка нового remote CI обязательна после commit/push и до итогового сообщения.
Его фактические SHA/run/result фиксируются в итоговом отчёте владельцу и GitHub;
их нельзя утверждать до запуска CI. Commit/push разрешены только в существующую
ветку PR #5, без merge, deployment, remote D1 и real Telegram.
