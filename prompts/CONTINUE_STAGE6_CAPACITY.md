# Новая сессия — Stage 6: capacity decision перед remote staging

Ты работаешь в `/Users/salman/pet_projects/reset-radar`, проект **Reset Radar | AI Limits**.
Прочитай `AGENTS.md`, `README.md`, [current handoff](../docs/37_STAGE6_PREFLIGHT_HANDOFF.md),
[preflight report](../docs/36_STAGE6_PREFLIGHT_REPORT.md), ADR-042 в
[decisions](../docs/09_DECISIONS.md), [runbook](../docs/07_DEPLOYMENT_RUNBOOK.md)
и [workload evidence](../docs/evidence/stage6-2026-10-22/workload.md).

**Явно поручая выполнить этот файл, я принимаю локальный preflight результат
`7a9eedf` из merged PR #7 как базу и разрешаю только следующую локальную фазу
Stage 6: анализ и проектирование capacity/budget решения, подготовку конкретного
change set и test plan для выбора владельцем, независимое review и отчёт.**
Это **design/decision assignment**, не реализация нового bootstrap protocol,
не remote staging и не Stage 7. Сохранение/чтение этого файла само по себе не
назначает работу. Full stable-staging acceptance остаётся pending.

## Что известно на момент подготовки

Снимок **2026-10-22**, обязательно перепроверить read-only в новой сессии:

- Preflight implementation commit:
  **`7a9eedf21942f22aa4e671542d59b6778ffa7bac`**. Владелец отдельно разрешил
  агенту commit/push; отправка в `feat/stage6-staging-preflight` прошла успешно.
- [PR #7](https://github.com/Khimish009/reset-radar/pull/7) merged
  **2026-10-22T10:23:42Z**, merge/remote main:
  **`1bfbe98aa7574b77f18ffebfe9ee77ced150c4ff`**. PR/merge выполнены
  владельцем/внешним процессом, не агентом. Remote head ref позже вернул404;
  агент ветки не удалял.
- [PR CI #19](https://github.com/Khimish009/reset-radar/actions/runs/39762425082)
  на `7a9eedf` и [merge CI #20](https://github.com/Khimish009/reset-radar/actions/runs/39762767428)
  на `1bfbe98` — **completed/success**. Job steps install/typecheck/lint/tests/
  offline verify success. [Read-only evidence](../docs/evidence/stage6-2026-10-22/pr7-ci.md).
  Historical CI #18 failure сохранён; не выдавать его за текущий failed main.
- При подготовке: local HEAD/ветка/`origin/feat/stage6-staging-preflight` —
  `7a9eedf`, local `main`/`origin/main` — `22ebefe`. Локальные refs отстают от
  проверенного remote main. Fetch/switch/reset/merge в подготовке не выполнялись.
  После подготовки остаются local docs/prompt edits — сохранить.
- Финальные local code checks: typecheck/lint PASS, **322 tests PASS /5 opt-in
  skipped**, **73 D1 PASS**, local migrations PASS, offline verify **139 PASS**.
  Workload8 PASS,17 sample records; reviewer28 PASS, без substantial findings.
  HTTP simulation1 PASS,15 receipts; сервер остановлен, порт4904 был свободен.
  Это historical evidence проверенного code, не результаты новой сессии.

## Начало работы и допустимые операции

1. Проверь staged/unstaged/untracked, refs/history и актуальные PR/main/CI.
   Read-only GitHub и `git fetch origin` разрешены при явном назначении этого
   файла. Не prune/delete/reset/clean, не rebase/merge/stash pop; recovery
   artifacts не трогать. Старый stash уже учтён раньше, повторно не применять.
2. После подтверждения, что актуальный main содержит PR #7, можно создать новую
   локальную `feat/stage6-capacity-decision` от проверенного `origin/main`, сохранив
   документацию. Существующую конфликтующую ветку не перезаписывать. Если перенос
   pending edits конфликтует — сообщить факты и продолжить независимое чтение.
   Не нужно обновлять local main через merge ради этой задачи.
3. Relevant docs02/03/05/06/08/10 и owner checklist читать по затронутой области.
   Исследование feed заново не начинать: Claude Resets + выбранный codexreset.ai,
   без fallback/union с codex-resets.com.
4. Разрешены чтение code/tests/evidence, локальные Markdown/diagram/table edits,
   арифметические проверки и при необходимости rerun existing synthetic/local
   tests. Runtime, SQL migrations, configs, dependency files и tests не менять.
   Не создавать исполняемый prototype нового protocol под видом документации.
5. Разрешены read-only GitHub и актуальные official Cloudflare docs для проверки
   лимитов. Cloudflare account/API/login, реальные upstream/Telegram requests,
   remote mutations, secrets, Cron, deploy и production не разрешены.

## Зачем нужна эта фаза

Current runtime: `scheduled()` → independent provider ingestion → D1, только
explicit local/staging `INGEST_MODE=dry_run`, `PUBLISH_MODE=dry_run`, DB. Checked-in
targets inactive, Cron[], remote bindings/routes отсутствуют. Publication blocked
(`no_real_publisher`), оба synthetic send journals пусты, approvals NULL.
HTTP остаётся inert501/404/405 с существующими HEAD/OPTIONS guards.

Caps: Claude25×4pages, accepted100/provider,5Claude+1Codex requests, prior-read101.
Полные sliding snapshots IDs1..100 → IDs2..101 сохраняют union101/provider;
следующий invocation делает0fetch и `stored_record_limit`, сохраняя events,
versions, observations, sources и завершённые baselines. Полный feed>100 или
partial pages не завершает новый baseline. Простое повышение cap или Paid plan
не доказательство исправления, удаление/усечение истории запрещено.

Existing real-D1 harness: `tests/helpers/d1-metrics.ts`,
`tests/stage6-workload.test.ts`, `npm run test:workload`.

| Synthetic workload | SQL statements / invocation | D1 execution calls | Local rows written |
|---|---:|---:|---:|
| C12/X62 cold | 249 | 12 | 1,134 |
| C12/X62 cached/restart304 | 175 | 12 | 315 |
| C100/X100 cold | 630 | 12 | 3,030 |
| C100/X100 cached | 430 | 12 | 822 |
| Stored101/provider | 28 | 10 | 22 |

C12/X62 — synthetic sizes по dated observations2026-10-21, не current live volume.
288 identical invocations/day дают90,720 и236,736 local rows written/day для
двух cached workloads. Это conditional model без других apps/changes/overlap.
Four SELECT-first/invocation без metadata; rows read — lower bound. Batch
считается по каждому SQL, prepare/bind отдельно от execution. Local elapsed не
billed Worker CPU. D1 query caps и Workers internal-subrequest wording расходятся;
точное enforced account batch accounting не доказано. Сохранять **обе** величины.

## Результат: конкретный выбор, который владелец сможет принять

1. Подготовь decision record следующего свободного docs-номера (при подготовке
   свободен38). Сопоставь ADR-042 A/B/C: что решает capacity, что SQL/rows budget,
   что остаётся unresolved. Дай обоснованную рекомендацию, не объявляя её owner
   approval. Не выбирать платный план и не менять за владельца cost budget.
2. Для A опиши точный bounded observation proposal: prerequisites, какие current
   sizes/union проверяются только после разрешения live reads, допустимые
   invocation/window bounds, measurable stop conditions и rollback. При
   неизвестных account/plan/budget сохранить conditional NO-GO, не ставить
   выдуманные числовые spending thresholds.
3. Для B подготовь reviewable design минимального repository change: какие
   операции можно сгруппировать/избежать, что остаётся атомарным с generation CAS,
   как сохраняются immutable observations/versions и replay/rollback. Укажи
   затронутые interfaces/files, схему SQL и expected effect как **оценку**, не
   measured improvement. Не маскировать проблему feed/history>100 уменьшением
   числа statements. Код не реализовывать по этому prompt.
4. Для C опиши конкретный manifest/chunk/finalization protocol: provider-scoped
   snapshot identity, generation/CAS, states incomplete/complete/aborted, restart,
   overlap, source revision consistency, backoff/cache, atomic visibility of
   canonical baseline, preservation of old snapshot, retention/cleanup и forward
   schema plan. Никаких partial baselines или удаления прежней truth истории.
   Отдельно назвать допущения Claude pagination и unpaginated Codex completeness.
   Схему/миграции не реализовывать до отдельного выбора и assignment владельца.
5. Собери test/measurement matrix для рекомендованного пути: cold/replay/304,
   material update, stable and shifted windows near/over100, growing preserved
   history, errors429/503/backoff, overlap/restart/CAS rollback, partial baseline,
   independent providers, NULL approvals, zero journal writes/Telegram traffic,
   прежние HTTP/config/truth/ambiguous-send safeguards. Existing retention case
   с103 real commits/generation103/retained4–103/100sync runs и timeout20s сохранить.
6. Составь таблицу owner inputs: account/profile label, Workers plan/effective
   limits, quota headroom, staging target/region, desired history growth/cadence,
   maximum spend и numeric stop budgets. Используй уже известное из сессии;
   недостающее спроси кратко, продолжая независимый design. Токены не просить,
   реальные account/database IDs не записывать в docs/configs. Если ответов нет,
   явно оставить unknown и выдать законченный conditional decision document.
7. Подготовь **ровно следующий** reviewable permission/implementation gate.
   Если выбран design B/C — новый отдельный local implementation assignment с
   acceptance/tests, ещё без remote действий. Если владелец принимает A и все
   prerequisites — следующий remote gate только создание isolated staging D1.
   Выбор A не означает разрешения создать DB. Не требовать повторного approval
   для конкретного scope/target, если владелец уже явно дал его в новой сессии;
   не переносить старое commit/push permission на новые изменения.

## Проверки, review и остановка

Для docs-only результата: `git diff --check`, проверка local links и
`python3 docs/evidence/stage0-2026-10-21/verify.py`; подтвердить отсутствие edits
runtime/config/migrations/tests/deps/CI/Postman. Не повторять full suite без
изменений code или конкретной необходимости. Если rerun существующих tests
понадобился — записать настоящие команды/results; local Miniflare loopback
требует разрешённого sandbox режима. Никаких feed diagnostics через internet.

После готового decision document — независимый reviewer по AGENTS, устранить
существенные findings, повторить затронутые проверки. Обновить ADR/status по
факту **proposed/owner-decided**, README/roadmap/checklist и handoff следующего
свободного номера (при подготовке39). Не переписывать историческое evidence
новыми непроверенными результатами.

Итог по-русски: выполнено/не выполнено, изменённые файлы, actual checks/review,
facts/assumptions, recommendation/options, unresolved inputs, conditional
go/no-go и точный следующий owner gate. Затем STOP.

**Commit/push/PR/merge, remote D1 create/migrations, deploy/bindings/secrets,
Cron/live upstream/Telegram, новый bootstrap implementation и Stage7–11 этим
файлом не разрешены. Не развёрнуто / не опубликовано. Real staging E2E pending.**
