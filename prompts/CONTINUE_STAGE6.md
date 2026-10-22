# Новая сессия — продолжение Stage 6: CI #18, staging preflight и D1 budget

Ты работаешь в `/Users/salman/pet_projects/reset-radar`, проект **Reset Radar | AI Limits**.
Прочитай `AGENTS.md`, `README.md`, [current handoff](../docs/35_STAGE6_LOCAL_HANDOFF.md),
[local report](../docs/34_STAGE6_LOCAL_REPORT.md), [runbook](../docs/07_DEPLOYMENT_RUNBOOK.md)
и выполни только указанное ниже продолжение **Stage 6**.

**Явно поручая выполнить этот файл, я принимаю локальный результат Stage 6 из
merged PR #6 как базу и разрешаю локально исправить известный отказ CI #18,
затем выполнить staging preflight: измерение D1 workload,
необходимые локальные исправления в существующей архитектуре, synthetic/loopback
проверки и подготовку конкретного решения о remote staging.**

Сохранение/чтение/review этого файла не начинают работу. Это не назначение Stage 7
и не принятие полного Stage 6 acceptance «stable staging». Remote D1 creation,
migrations, deployment/bindings, Cron, реальные upstream requests, secrets,
Telegram requests/sends, commit/push/PR/merge **не разрешены этим файлом**.
Каждый следующий remote gate требует отдельного явного разрешения на конкретный
подготовленный результат. Не проси повторное разрешение, если в новой сессии
владелец уже явно разрешил именно этот gate и его target.

## База и сохранённый контекст

Снимок подготовки 2026-10-22, перепроверить read-only в новой сессии:

- Stage 6 implementation/local commit:
  **`7b4e1294761e60288a829aa4b4f8d377d7b3b455`**.
- [PR #6](https://github.com/Khimish009/reset-radar/pull/6) merged
  `2026-10-22T09:43:24Z`, merge/main:
  **`22ebefe1e1a6243df4a0e769417dbbe184f1c5a4`**.
- [CI #17](https://github.com/Khimish009/reset-radar/actions/runs/39757187598)
  на implementation SHA — completed/success. Merge
  [CI #18](https://github.com/Khimish009/reset-radar/actions/runs/39757621399)
  — **completed/failure**, job `119753530873`, timeout cache-validation test
  `tests/stage4-ingest.test.ts:313:3`: **5018ms** при budget 5000ms; 310 passed,
  1 failed, 5 skipped. Typecheck/lint success, offline verify skipped.
  Подробности: [CI evidence](../docs/evidence/stage6-2026-10-22/ci18.md).
- Владелец отдельно разрешил агенту только local commit; push/PR/merge выполнены
  владельцем/внешним процессом. Разрешение на commit Stage 6 не продолжается.
- При подготовке этой сессии `main`/`origin/main` совпали с `22ebefe`, дерево
  было чистым. После подготовки остаются новые docs/prompt edits; сохранить их.

1. Проверь `git status --short --branch`, staged/unstaged/untracked, refs/history,
   актуальные PR/main/CI. Read-only GitHub и `git fetch origin` разрешены после
   явного назначения этого файла. Не reset/clean/stash pop и не трогай recovery
   artifacts; старый stash уже учтён в Stage 4.
2. Разрешено безопасно создать локальную `feat/stage6-staging-preflight` от
   актуального main, содержащего PR #6, сохранив документацию. Существующую
   конфликтующую ветку не перезаписывай/не rebase/не merge самовольно. При проблеме
   с базой сообщи факты, продолжая независимое чтение.
3. Прочитай relevant docs02/03/05/06/07/08/09/10 и owner checklist. Исследование
   upstream заново не начинать: Claude Resets и выбранный **codexreset.ai**,
   без fallback/union с codex-resets.com.
4. Проверь текущий runtime/config/repository/migrations/tests. Применяй нужные
   skills/роли по AGENTS.md. Для HTTP verification — `postman:api-engineer` и
   simulation/testing skills; local mocks уже существуют, workspace не связывать.
   Для CI failure используй `diagnosing-bugs`.

## Сначала: локальное исправление CI #18

Прочитай job log и упавший cache-validation case. Сначала установи, где уходит
время, сравни targeted и обычный полный параллельный run. Факт timeout в CI есть,
но его причина ещё не доказана; не объявляй performance regression или проблему
только runner без evidence. Если локально не воспроизводится, так и запиши.

Сохрани corrupt/expired/missing cache и empty-D1 unsolicited 304 сценарии,
проверку отсутствия validators и запрет complete baseline без representation,
реальные D1 migrations/queries и cleanup. Исправь минимально: если обоснован
именно per-test budget, допустим локальный timeout этого case или осмысленное
разделение самостоятельных сценариев. Не увеличивай global timeout, не отключай
parallelism/tests, не заменяй настоящую D1 mocks и не ослабляй assertions.
Retention case с 103 commits и 20s — другой test, его не менять.

Сначала подтвердить fix затронутыми tests и обычным full run; затем продолжить
budget preflight. Remote workflow rerun и push не разрешены: passing local
results не выдавать за новый зелёный GitHub CI. После локальных правок старый
failed run остаётся historical evidence, новый CI потребует отдельного Git scope.

## Что уже реализовано и нельзя потерять

- `createWorker(dependencies).scheduled(controller, env)` — async. Ingestion
  только при explicit `APP_ENV=local|staging`, `PUBLISH_MODE=dry_run`,
  `INGEST_MODE=dry_run`, `DB`. Default/off — no-op без DB/network; invalid
  config/production opt-in reject, active missing DB — fixed safe code.
- `runScheduledIngestion` независимо settles providers и возвращает summary
  с `publication:{available:false,state:'blocked',reason:'no_real_publisher'}`.
  Нет real publisher/journal/approval workflow. Synthetic Stage 5 service не
  импортируется runtime, approvals не создаются, оба send journals не пополняются.
- Текущие caps: Claude limit=25/maxPages=4, ≤100 accepted records/provider,
  5 Claude +1 Codex network request; prior canonical read до 101/provider.
  `stored_record_limit` при history >100 сохраняет events/versions/baseline,
  фиксирует incomplete invocation и не вызывает upstream. Partial/page/record
  budget не завершают новый baseline; complete baseline не стирается.
- Existing transport timeout 10s, body 2MiB, scoped ETag/304/cache/backoff и
  Retry-After. Immutable observations/material versions, per-provider bootstrap,
  generation CAS/rollback и replay safety. In-memory flag не global mutex.
- Worker `fetch()` не менялся: reserved reads501, other reads404, writes405,
  HEAD/OPTIONS inert, no permissive CORS, admin/sync/assessment/publish routes.
  Website/public data API, bot webhook/commands, production — не этот scope.
- Все checked-in targets dry_run, INGEST_MODE absent/off, Cron[], no remote
  D1/routes; `wrangler.d1.local.json` содержит только local-only DB ID.
- Migrations0001/0002 применённые, не переписывать. Новая forward migration
  допустима только если доказана необходимость в этом локальном scope, с
  обоснованием и local verification; remote apply всё равно отдельный gate.

## Задача: доказать готовность бюджета до remote staging

Локальные Miniflare tests не проверяют Cloudflare account plan, per-invocation
query/CPU limits или текущий upstream объём. Нельзя считать бюджеты готовыми
лишь из-за лимита HTTP requests или 100 records.

1. Подготовь воспроизводимое **локальное** измерение handler → ingestion →
   настоящий Miniflare D1. Можно инструментировать D1 binding в test harness:
   выполняй реальные prepared statements/batches, считай SQL statements и
   binding calls отдельно; собирай доступные meta.rows_read/rows_written/duration.
   Не подменяй SQL успешными mocks, не считай целый batch одним SQL statement.
   Отдельно объясни, что локальные counters доказывают и что ещё требует remote
   измерения; Miniflare elapsed time не равен billed Worker CPU.
2. Сравни хотя бы cold baseline, повтор из cache, restart/304, material update,
   partial history/429/backoff и near-capacity/full preserved history. Fixtures
   явно synthetic, раздельные provider sizes и суммарная нагрузка invocation;
   archived dated snapshots не выдавать за текущий live объём. Включи объёмы,
   релевантные сохранённым source observations, и границы текущего runtime cap.
3. Сверь pinned Wrangler и актуальные **official Cloudflare docs** по queries,
   storage, CPU/subrequests, Cron и D1 metadata. Не предполагай Free/Paid plan,
   тариф или допустимый расход владельца и не включай платный план. Если plan/
   target/budget неизвестны, отчёт должен явно содержать unresolved go/no-go,
   conditional comparison и конкретные сведения, нужные для owner decision.
4. Если обнаружен доказанный локальный blocker, исправь минимально в текущих
   interfaces/architecture с meaningful regressions. Не удаляй историю,
   versions/evidence, не ослабляй CAS, не считай partial baseline полным и не
   уменьшай coverage ради прохождения лимита. Простое повышение cap или платный
   план не являются доказательством исправления. Если нужен новый bootstrap
   protocol/существенная архитектура, сначала подготовь ADR/конкретные варианты
   и остановись перед такой реализацией для отдельного owner decision.
5. Подготовь конкретный staging change set/шаблон в документации: Worker/env,
   bindingDB, migrations, inactive dry_run/Cron off config, plan/limits,
   наблюдаемые критерии baselines/health и rollback. Не добавляй реальные
   account/database IDs, routes или secrets в рабочие deploy configs; placeholders
   должны быть явно невалидным шаблоном, не deploy target.

## Remote-порядок после preflight: только отдельные решения

Сначала заверши локальный результат, проверки и независимое review. В отчёте
представь конкретный go/no-go и следующий reviewable gate; сам его не выполняй.
Применяй [runbook](../docs/07_DEPLOYMENT_RUNBOOK.md), уточнив при необходимости:

1. Owner подтверждает account/plan, budget и target; отдельно разрешает создание
   изолированной staging D1. Не создавать production DB.
2. После получения реального ID — review resolved binding/target/migration list
   и отдельное разрешение на remote staging migrations.
3. Отдельно разрешаются staging binding и inactive deploy проверенного кода:
   APP_ENV=staging, PUBLISH_MODE=dry_run, INGEST_MODE=off, Cron[], no public routes.
4. Только после inactive target verification — отдельное разрешение на реальные
   upstream reads и ограниченное Cron observation, его длительность/stop budget
   и последующее выключение. Два независимых полных provider baselines, health,
   actual query/CPU/rows measurements и rollback evidence обязательны. Публичный
   HTTP-trigger не добавлять. Cron off/INGEST_MODE=off после согласованного окна.
5. Real Telegram client/journal/eligibility design и token/channel setup — своё
   отдельное решение; любые реальные Telegram API requests/sends — ещё один
   gate. Для текущего dry-run Telegram token/channel не нужны, в чат не просить.

Если отдельный remote scope будет действительно разрешён позднее, не смешивай
его с текущими local доказательствами и не объявляй stable staging по merge/CI.
Production release/publication и Stage 7–11 этим промптом не назначаются.

## Обязательные регрессии и проверки

- Announcement/effective/source-reported delivery/detection/ingestion clocks
  раздельны; null delivery не confirmed, unknown Claude time не выдумывается,
  date-only expiry не countdown. Source-aware event recency и current_offer proof
  сохранены; imports/review age не делают историческое событие свежим.
- Synthetic-only gates, baseline/rawKey-bound review, CAS/atomic claims,
  bounded keyset/retries, ambiguous send/manual review без lease recovery и
  hanging response-body cancellation safeguards не ослаблять.
- Retention test `tests/stage4-storage.test.ts` сохраняет 20s timeout, 103 real
  commits, generation 103, retained generations 4–103, exactly 100 sync runs и
  cleanup assertions. Global timeout/parallelism/tests не отключать.
- Tests для изменённого пути, обеих provider failures, partial baseline,
  overlap/restart, default/production/missing binding, unchanged HTTP guards,
  zero Telegram network/new journal rows и publish approvalsNULL.
- HTTP substitute → adapters → runtime → real local D1 через existing combined
  Postman simulation. Только loopback mapping без proxy/pass-through/shared push;
  подтвердить receipts/logs и остановить процессы. Никаких live diagnostics к feeds.

На финальном коде выполнить:

```sh
npm run typecheck
npm run lint
npm test
npm run test:d1
npm run d1:migrate:local
python3 docs/evidence/stage0-2026-10-21/verify.py
git diff --check
```

Opt-in HTTP test запускать отдельно по [evidence](../docs/evidence/stage6-2026-10-22/simulation.md).
Прежние 311 PASS / 5 skipped, 62 D1 PASS, 139 verify PASS и 15 HTTP receipts — historical
baseline, не результаты новой реализации. Website build неприменим.

После проверок — независимый reviewer, устранить существенные findings,
повторить затронутые проверки. Сохрани фактические budget evidence, report и
handoff следующими свободными docs-номерами (при подготовке свободны 36/37),
обнови README/roadmap/checklist/runbook/ADR по фактическим изменениям.
Отчёт по-русски: выполнено/не выполнено, файлы, реальные команды/результаты,
review, facts/assumptions, go/no-go/risks и точный следующий permission gate.
Затем остановись. **Не развёрнуто / не опубликовано. Реальный staging E2E не выполнен**,
если отдельного разрешённого remote выполнения не было. Этот файл не разрешает
commit/push/PR/merge, remote/live действия и переход к следующему этапу.
