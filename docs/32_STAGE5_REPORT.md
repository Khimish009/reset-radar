# 32 — Отчёт локального Stage 5

Дата: **2026-10-22**. Владелец явно принял локальный Stage 4 из PR #4 и поручил
выполнить `prompts/START_STAGE5.md`, затем tests, независимое review и остановку.
Production truth/publication policy этим не утверждена.

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
