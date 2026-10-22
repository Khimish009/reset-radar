# 34 — Отчёт Stage 6: локальная подготовка staging

Дата: **2026-10-22**. Владелец принял локальный Stage 5 из merged PR #5 и явно
поручил выполнить [START_STAGE6](../prompts/START_STAGE6.md), только локальную
часть, tests, независимое review, отчёт и остановку. Полный acceptance
«stable staging» **не выполнен**: remote observation не разрешён и не проводился.

## Выполнено

- Worker `scheduled()` асинхронно ожидает ingestion двух независимых providers
  через существующие adapters, D1 repository и injected clock/fetch/logger.
  Результаты отдельно отражают success/incomplete/failure/concurrent sync.
- Требуются явные `APP_ENV=local|staging`, `PUBLISH_MODE=dry_run`,
  `INGEST_MODE=dry_run` и DB. Default/off не читают DB и не делают polling.
  Invalid config и production opt-in отклоняются фиксированной безопасной
  ошибкой, missing binding логируется как `scheduled_missing_database` без сети.
- Бюджет: Claude — максимум 4 history pages по 25 записей и status, Codex —
  один feed; максимум 5+1 network requests, 100 accepted records/provider,
  чтение до 101 сохранённой canonical строки/provider. Существующие timeout
  10s, body limit 2MiB, scoped cache/ETag/backoff сохранены.
- `history_page_budget_exceeded`, `record_budget_exceeded` и
  `stored_record_limit` не дают частичного event commit или нового baseline.
  Уже завершённый baseline и immutable history сохраняются. Для stored limit
  upstream не вызывается; health фиксирует неполный запуск. Прямой local
  ingestion без `maxRecords` сохраняет прежний контракт.
- Overlap защищает существующий transactional generation CAS. Проигравший
  snapshot не создаёт дублированные observations/versions. In-memory lock не
  выдаётся за межпроцессную блокировку; после потери CAS нет скрытого retry.
- Dry-run summary явно сообщает
  `publication:{available:false,state:'blocked',reason:'no_real_publisher'}`.
  Runtime не импортирует Stage 5 publisher/client, не создаёт assessments,
  approvals или claims и не пишет в оба send journals. Unreviewed facts остаются
  `needs_review` с причинами в D1; preview с придуманным approval не генерируется.
- Public `fetch()` guards сохранены: reserved reads 501, прочие reads 404,
  writes 405, HEAD bodyless, OPTIONS inert, CORS/data/admin routes не добавлены.
- Fixed safe log codes отражают исход каждого provider и run completion;
  logger пропускает только allowlisted scalars. URLs, raw payload, rationale,
  Telegram text, exception details и credentials в логи не передаются.
- Runbook/operations описывают конкретный будущий remote plan с отдельными
  permissions, target review, baselines, quotas, observation и disable/rollback.

## Файлы и сохранённая подготовка

Runtime: `src/env.ts`, `src/index.ts`, новый `src/services/scheduled.ts`,
`src/services/ingest.ts`, `src/storage/{d1,types}.ts`, `src/utils/logging.ts`.
В `src/providers/claude/adapter.ts` уточнён только устаревший комментарий.

Проверки: `tests/{env,worker,logging}.test.ts`, новые
`tests/stage6-runtime.test.ts`, `tests/stage6-runtime-simulation.test.ts`,
`package.json` (`test:d1` включает Stage 6). Новый
`postman/simulations/stage6-local.sim.yaml` переиспользует оба existing mocks;
Claude mock дополнительно принимает точный `limit=25`, сохраняя `limit=100`.

Документация: README, docs03/06/07/08/09/10, checklist, этот report,
[handoff](35_STAGE6_LOCAL_HANDOFF.md), [HTTP evidence](evidence/stage6-2026-10-22/simulation.md).

На старте уже были modified README/docs08/docs32/docs33/checklist и untracked
START_STAGE6. Подготовка сохранена. docs32/docs33/prompt в этой реализации не
переписывались; полный diff относительно main включает прежнюю подготовку.
Migrations 0001/0002, оба Wrangler configs, dependencies/lockfile, CI workflow,
retention test и HTTP router не менялись. Новый migration не понадобился.

## Реальные проверки

| Команда | Фактический результат на Stage 6 коде |
|---|---|
| `npm run typecheck` | PASS, strict source/test TypeScript, runtime types generated locally |
| `npm run lint` | PASS, zero warnings |
| `npm test` | **311 passed / 5 opt-in skipped**, 18 passed files |
| `npm run test:d1` | **62 PASS**, 5 files, настоящий local workerd D1 |
| `npm run d1:migrate:local` | PASS, только `--local`, existing migrations already applied; no migrations to apply |
| `python3 docs/evidence/stage0-2026-10-21/verify.py` | **139 PASS**, offline evidence assertions |
| `git diff --check` | PASS |
| `env STAGE6_SIMULATION_URL=http://127.0.0.1:4904 npm test -- --run tests/stage6-runtime-simulation.test.ts` | **1 PASS**, 15 GET receipts в Postman NDJSON |

Пять opt-in skipped: Claude, Codex, Stage 4 HTTP, Stage 5 Telegram simulation,
Stage 6 HTTP. Последний отдельно выполнен выше; остальные opt-in в этой сессии
повторно не запускались. Website build неприменим. Stage 4 retention case
остался в обычном параллельном наборе с собственным timeout 20s, 103 real commits,
generation 103 и точными retained generations 4–103.

Новые 7 offline D1 cases проверяют runtime baseline/replay/persisted restart,
ETag restore, incomplete pagination, oversized feed, stored history capacity,
429/backoff, независимый успех второго provider, post-baseline outage без потери
history и CAS overlap двух отдельных Worker instances. Все проверяют отсутствие
новых send journal rows и production approvals; HTTP test также проверяет safe
provider logs, 304 после restart, 503/429 и отсутствие network retry в backoff.

Первый Postman server/HTTP test запуск столкнулся с sandbox loopback `EPERM`;
после разрешённого повтора проверка прошла. В разработке исправлено сравнение
нестабильных D1 result metadata в новом тесте: сравниваются сохранённые rows.
Нефатальный dependency warning `DEP0040 punycode` остаётся. Postman CLI **1.75.0**.
Server остановлен SIGINT, exit 0; `lsof` не обнаружил listener 4904. Raw NDJSON
остаётся в `/private/tmp/`, в evidence сохранены только безопасные агрегаты.
Дополнительный structural audit: **67 local link targets PASS**; staged diff
пуст; защищённые migrations/configs/router/publisher/Telegram/retention/CI и
lockfile побайтно совпадают с HEAD по `git diff --exit-code HEAD -- …`.

## База, факты и допущения

Read-only GitHub заново подтвердил PR #5 merged в `2026-10-22T08:06:57Z`,
head `bb2cd25de54175f2c8518529862f8d1ce308c51a`, merge/main
`ba8bd58d959e1716ab41ff1339c7ddf44877ff22`. CI #15/#16 — completed/success.
Local main и origin/main уже совпадали с подтверждённым remote main; fetch не
понадобился. Создана только локальная ветка `feat/stage6-staging-dry-run`.
Commit/push/PR/merge и recovery artifacts не выполнялись/не менялись.

Проверка HTTP доказывает путь настоящего кода с local D1 против synthetic
stand-ins, а не доступность/семантическую достоверность upstream. No pass-through:
тест переводит только точные разрешённые source paths в `http://127.0.0.1:4904`.
Primary evidence автоматически не читается. Production truth/eligibility и
freshness thresholds не утверждены. Codex completeness остаётся локальным
допущением о непагинируемом feed; Claude revision/count consistency не доказывает
официальную полноту. `delivered_at` не становится per-account application time.

Wrangler **4.151.3**, его local `--help` и текущие official Cloudflare docs
проверены для staging plan. Плановые команды не выполнялись. Лимиты D1 зависят
от плана (в частности Free/Paid query caps и database size), поэтому remote
acceptance требует измерений; точные references и gates — в [runbook](07_DEPLOYMENT_RUNBOOK.md).

## Независимое review

`stage6_review` | reviewer | **gpt-6.1-sol** | reasoning **high** — завершено
после обязательных проверок. **Существенных critical/high/medium findings нет.**
Проверены config gates, scheduled → ingestion → D1, budgets, partial baseline,
CAS/overlap/restart, независимость providers, truth/history, safe logs, отсутствие
Telegram client/claims/approvals, HTTP guards и тестовое покрытие.

Небольшая неточность docs07/10 исправлена: `stored_record_limit` оставляет
invocation неполным и не завершает новый baseline, но сохраняет уже completed
baseline. Reviewer проверил исправление и `git diff --check` PASS. Source/test
code после полных прогонов не менялся; повторные runtime tests не требовались.
Reviewer изучил тесты и предоставленные результаты, сам тесты не перезапускал.
Ограничения remote quotas/CPU и capacity >100 остаются явно документированными.

## Риски и следующие решения владельца

Operation caps не являются жёстким wall-clock deadline для D1. Локальный runtime
сохраняет history, но при превышении 100 stored records/provider останавливает
новый import до отдельно проверенного решения о capacity. Если Claude не
укладывается в 4 pages или feed больше 100 records, baseline не завершится;
следующий запуск повторяет полный согласованный walk со scoped cache, не
продолжает partial baseline. History не удаляется и не усечена ради успеха.

Local Miniflare не доказывает соблюдение remote query/CPU/row limits. До remote
observation нужно подтвердить account/plan и измерить реальный query/row/CPU
budget. При persistence failure provider логируется как failure; D1 outage
может не позволить записать health в саму D1. CAS loser ждёт следующего запуска.

Отдельные будущие решения: (1) remote staging D1 creation; (2) reviewed remote
migrations; (3) staging binding/inactive dry-run deploy; (4) upstream/Cron
observation и два полных provider baselines; (5) real Telegram publisher/journal
design, eligibility и token/channel setup; (6) любые реальные Telegram requests/
sends. Production и Stage 7–11 не начаты. Токен в чате не требуется.

Нового commit или PR нет. **Не развёрнуто / не опубликовано. Реальный staging
E2E не выполнен.** Локальный scope завершён; остановка без перехода дальше.

После этого отчёта владелец отдельно поручил создать только локальный commit
Stage 6 с сохранённой подготовкой документации. Это разрешение не распространяется
на push/PR/merge, remote/live операции или следующие этапы. Проверенная реализация
при сохранении не менялась; SHA локального commit доступен в Git history.

## Подготовка следующей сессии после merge PR #6

Local commit **`7b4e1294761e60288a829aa4b4f8d377d7b3b455`** включил реализацию
и сохранённую подготовку: 30 files, 1538 insertions / 172 deletions. Push/PR/merge
выполнил владелец/внешний процесс. Read-only GitHub подтвердил PR #6 merged
`2026-10-22T09:43:24Z`, merge/main **`22ebefe1e1a6243df4a0e769417dbbe184f1c5a4`**.
Local main/origin/main совпали с этим SHA, дерево при начале подготовки чистое.

[CI #17](https://github.com/Khimish009/reset-radar/actions/runs/39757187598)
на PR head — success; merge
[CI #18](https://github.com/Khimish009/reset-radar/actions/runs/39757621399)
— failure. Job `119753530873`: install/typecheck/lint success; tests 310 passed,
1 failed, 5 skipped; offline verify skipped. Test `tests/stage4-ingest.test.ts:313:3`
cache validators/unsolicited 304 превысил 5000ms budget (5018ms), full run 40.80s.
Stage 4 retention с 20s budget прошёл за 11022ms; это другой test.
Факты и ограничения диагноза: [CI evidence](evidence/stage6-2026-10-22/ci18.md).
Historical local checks выше не заменяют failed CI; в этой подготовке tests
не воспроизводились и code/test/config не менялись.

Последнее назначение — только сохранить контекст и подготовить
[CONTINUE_STAGE6](../prompts/CONTINUE_STAGE6.md), не реализовывать его. Он при
отдельном назначении разрешит local CI diagnosis/fix, затем D1 workload/capacity
preflight перед отдельно разрешаемыми remote gates. Stage 7 не назначен,
полный stable-staging acceptance остаётся pending. Нового commit/push/PR/merge,
remote/live действий в этой подготовке нет. **Не развёрнуто / не опубликовано.**

Проверки docs-only подготовки: diff-check PASS,61 local links PASS, Stage 0
offline verify139 PASS. Application tests/typecheck/lint заново не запускались;
runtime/config/tests/CI/dependencies без изменений. Независимый
`stage6_continuation_prompt_review` (reviewer,gpt-6.1-sol,high) завершён без
существенных findings; reviewer сделал diff-check, tests не перезапускал.
