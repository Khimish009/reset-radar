# 36 — Stage 6: локальный CI fix и D1 staging preflight

**2026-10-22.** Владелец явно поручил выполнить CONTINUE_STAGE6, принял локальную
реализацию PR #6 как базу и разрешил только local fixes/tests/review/preflight.
**Активный remote staging — NO-GO. Stable-staging acceptance не достигнут.**
Account/plan/target/бюджет владельца, remote query accounting и Worker CPU
неизвестны; рост сохранённой истории ограничен существующим cap. Новый
bootstrap protocol не реализован. **Не развёрнуто / не опубликовано. Реальный
staging E2E не выполнен.**

## Выполнено и границы

- Сохранена исходная незакоммиченная docs/prompt подготовка. Staged diff был
  пуст; HEAD/main/origin/main `22ebefe1e1a6243df4a0e769417dbbe184f1c5a4`.
  Read-only GitHub подтвердил тот же remote main и merged PR #6 с implementation
  `7b4e1294761e60288a829aa4b4f8d377d7b3b455`. Fetch не понадобился: refs совпали.
  Создана только локальная ветка `feat/stage6-staging-preflight`.
- Read-only заново прочитаны CI #18 job log/steps: merge run остаётся failure,
  typecheck/lint success, offline verify skipped. CI #17 implementation SHA —
  success. Workflow rerun не выполнялся; локальные PASS не меняют GitHub CI.
- Cache-validation test разделён на corrupt/expired/missing cases и empty-D1
  unsolicited 304. Все real D1 migrations/queries/assertions и cleanup сохранены;
  empty case дополнительно подтверждает отсутствие complete baseline.
  Global timeout, parallelism и retention regression не менялись.
- Создан воспроизводимый harness `scheduled()` → adapters/ingestion → настоящий
  Miniflare D1; считает SQL statements, binding executions, prepare/bind и
  доступную result metadata отдельно. Batch members считаются по одному SQL,
  подготовка и inspection исключены из sample. Никаких успешных SQL mocks.
- Повторена existing combined Postman loopback HTTP simulation; receipts и
  shutdown подтверждены. Проверены official Cloudflare docs и pinned Wrangler.
  Подготовлены inactive staging template, gates и capacity ADR-042.

Не выполнялись commit/push/PR/merge, remote migrations/ресурсы/deploy, Cron,
реальные upstream/Telegram requests, secrets или Stage 7–11. Рабочие Wrangler
configs и migrations сохранены. Website build неприменим: website отсутствует.

## CI #18: факты вместо предположения о причине

Исторический case занял 5,018ms при budget 5,000ms. Локально исходный targeted
case **PASS за 1.96s** (весь Vitest), исходный обычный full parallel run —
**311 PASS / 5 skipped за 11.35s**. Timeout не воспроизведён; утверждать
performance regression или только проблему runner оснований нет.

Временная instrumentation показала по сценарию: Miniflare/binding/migrations
153–201ms; seed 34–44ms; cache mutation 3.6–4.6ms; 304 path/assertions 24.6–27.1ms.
Четыре самостоятельных сценария теперь имеют отдельные стандартные lifecycle
и 5s budget. После fix targeted **4 PASS**, полный обычный run **314 PASS /
5 skipped**, lint PASS. Эти промежуточные результаты относятся к CI fix до
окончательной проверки workload harness. Временные таймеры удалены.
Подробные команды: [CI diagnosis evidence](evidence/stage6-2026-10-22/ci18-local.md).

## Workload evidence и воспроизведение

Все provider fixtures **synthetic**. Размеры C12/X62 отражают только датированные
observations от 2026-10-21: Claude status `stats.total=12`, выбранный Codex feed
62 events. Это не replay реальных raw payloads и не оценка текущего live объёма.
Другой Codex tracker не используется и не объединяется с выбранным.

`npm run test:workload` выполняет harness без записи artifacts. Для нового
machine-readable sample задаётся `STAGE6_WORKLOAD_OUTPUT` (путь к локальному
JSON). JSON следует сохранять только после PASS всех сценариев, проверив
synthetic label, scenario inventory и coverage; его elapsed значения зависят
от машины и не используются как строгие regression thresholds.

`first()` возвращает row/column без D1 metadata, поэтому missing metadata
показана отдельным счётчиком. Измеренные rows read — нижняя граница; не считать
отсутствующую metadata нулевой стоимостью. Prepare/bind не являются execution
calls. Handler elapsed и сумма elapsed binding calls могут различаться из-за
параллельной обработки providers; ни то ни другое не billed Worker CPU.

Финальный [JSON sample](evidence/stage6-2026-10-22/workload.json) и
[методика/таблица](evidence/stage6-2026-10-22/workload.md) содержат17 records
(calibration и16 invocation samples), полученных8 standalone tests.

| Scenario | C / X | SQL statements | D1 execution calls | Local rows written |
|---|---|---:|---:|---:|
| Cold baseline | 12 / 62 | 249 | 12 | 1,134 |
| Cache / restart304 | 12 / 62 | 175 | 12 | 315 |
| Material update Claude | 12 / 62 | 176 | 12 | 324 |
| Partial Claude walk | 100 / 62 | 215 | 11 | 960 |
| Claude429 / subsequent backoff | 12 / 62 | 153 | 11 | 270 |
| Cold cap | 100 / 100 | 630 | 12 | 3,030 |
| Cached cap | 100 / 100 | 430 | 12 | 822 |
| Stored101/provider, no fetch | 0 / 0 | 28 | 10 | 22 |

При условных288 одинаковых invocations/day C12/X62 cache даёт90,720 local rows
written/day, близко к published Free allowance100,000; C100/X100 cache —236,736,
выше allowance. Это не remote bill/cost forecast; baseline, changes, другие
apps и owner budget ещё нужно учесть. Все modifying statements в этих samples
имеют metadata, но four SELECT-first results/invocation не дают read metadata.
Консервативное сравнение249/630SQL с published query caps50/1000 не доказывает
enforcement batch: execution calls12, точное remote accounting unresolved.
[Official limits и caveats](evidence/stage6-2026-10-22/cloudflare-preflight.md).

Baseline100 + полный sliding feed100 (IDs2..101) сохраняет101 events/provider.
Следующий handler делает0 fixture fetches и сохраняет202 events/versions/
observations, source rows и completed baselines. В одном bounded101-event
SELECT metadata сообщает202 rows read из-за join с101 versions. Предел100
защищает историю, но останавливает её дальнейшее обновление; это capacity
ограничение, требующее решения ADR-042, а не повод повысить cap/удалить историю.
Local DB sample вырос с802,816 bytes дляC12/X62 до2,297,856 bytes при union101;
это не remote storage growth forecast.

## Финальные команды и фактические результаты

| Команда | Результат на финальном коде |
|---|---|
| `npm run typecheck` | PASS; worker agent выполнил strict source/test checks после окончания harness |
| `npm run lint` | PASS, zero warnings; после окончания harness |
| `npm test` | **322 PASS /5 opt-in skipped**,19 files PASS,13.02s, обычный параллельный run |
| `npm run test:d1` | **73 PASS**,6 files,12.27s; включает8 workload cases |
| `npm run d1:migrate:local` | PASS, `--local`, no migrations to apply |
| `python3 docs/evidence/stage0-2026-10-21/verify.py` | **139 PASS**, offline |
| `git diff --check` | PASS |
| `STAGE6_WORKLOAD_OUTPUT=/tmp/reset-radar-stage6-workload.json npx vitest run tests/stage6-workload.test.ts` | **8 PASS**,8.43s; JSON sample сохранён после PASS |
| `env STAGE6_SIMULATION_URL=http://127.0.0.1:4904 npm test -- --run tests/stage6-runtime-simulation.test.ts` | **1 PASS**,15 HTTP receipts; отдельно от full-run skips |

Five skipped cases — Claude, Codex, Stage4 ingestion HTTP, Stage5 Telegram
simulation, Stage6 HTTP; последний отдельно PASS выше. Остальные4 opt-in не
повторялись. Retention test остался в обычных full/D1 runs:103 real commits,
generation103, retained4–103, ровно100 sync runs и cleanup, timeout20s.

`git diff --exit-code HEAD -- src migrations wrangler.json wrangler.d1.local.json
vitest.config.ts tests/stage4-storage.test.ts postman .github package-lock.json`
— PASS: runtime/router/publisher, migrations, deploy config, retention, CI,
Postman substitutes и dependencies не изменены. Сохранены existing regression
checks обоих provider failures, partial baseline, overlap/restart, config/HTTP
guards, event truth, claims и ambiguous-send safeguards.

## Изменённые файлы

- Test code: `tests/stage4-ingest.test.ts`, новые
  `tests/helpers/d1-metrics.ts`, `tests/stage6-workload.test.ts`.
- `package.json`: `test:workload`, включение workload в `test:d1`; dependencies
  и lockfile не изменены.
- Документация: README, docs07/08/09, historical handoff35,
  `manual/OWNER_CHECKLIST.md`, новые docs36/37 и evidence
  `ci18-local.md`, `cloudflare-preflight.md`, `workload.md`, `workload.json`,
  `preflight-simulation.md`.
- Исходная docs/prompt подготовка в README/docs08/34/35/checklist, `ci18.md`
  и CONTINUE_STAGE6 сохранена. Это уже существовавшие edits, не новый code scope.

## Независимое review

`stage6_preflight_review` | reviewer | **gpt-6.1-sol** | reasoning **high** —
завершён после финальных checks. **Существенных critical/high/medium findings
не обнаружено.** Проверены originating prompt и все staged/unstaged/untracked
изменения относительно22ebefe, CI scenarios, SQL/binding/meta counters,
JSON/table arithmetic, preservation при union101, truth/config/HTTP safeguards,
NO-GO, ADR и отдельные gates. Reviewer заново сверил official D1/Workers limits,
migration hashes и protected-path diff.

Самостоятельная команда reviewer:
`npx vitest run tests/stage6-workload.test.ts tests/stage4-ingest.test.ts` —
**28 PASS**,2 files,10.01s. Также `git diff --check` PASS. Full suite,
typecheck/lint и Postman reviewer повторно не запускал; файлы не менял.
После review изменены только итоговые report/handoff; application code не
менялся. Local link audit перед review:102 targets,0 broken.

**Локальный scope завершён, работа остановлена.** Для дальнейшего scope
требуется новое явное задание. Новых commit/PR нет; **не развёрнуто /
не опубликовано. Реальный staging E2E не выполнен.**

После завершения отчёта владелец отдельно разрешил commit и push подготовленного
результата в `feat/stage6-staging-preflight`. Это последующее разрешение относится
только к этой ветке и проверенному change set; PR/merge, remote/live действия
Cloudflare/upstream/Telegram и следующие этапы им не разрешены. Реализация после
проверок/review не менялась; добавлена только запись о разрешении. SHA и результат
push проверяются отдельно по Git после выполнения операции.

## Локальная HTTP-проверка

Existing combined simulation → настоящий runtime + D1: **1 PASS**, Vitest
**1.77s**, **15 GET receipts** (6×200, 5×304, 1×429, 3×503). Проверены
restart/ETag, failures/backoff и independent provider success; approvals NULL,
оба send journals пусты. Сервер остановлен SIGINT, exit 0; `lsof` подтвердил
отсутствие listener 4904. [Команды и агрегаты](evidence/stage6-2026-10-22/preflight-simulation.md).
Это local synthetic integration, не real staging E2E или live evidence truth.

## Следующий reviewable gate и риски

**GO только для рассмотрения локального результата; NO-GO для активного staging.**
Владелец должен подтвердить account/profile, Workers plan/effective D1 limits,
свободные общие квоты, staging target/region и written budget/stop thresholds,
а также принять ограниченный scope A или отдельно поручить capacity design
из [ADR-042](09_DECISIONS.md). Никакой тариф не выбран и Paid не включался.

После этих решений следующий remote gate — **отдельное явное разрешение создать
только изолированную `reset-radar-staging-db`** в подтверждённом account.
Реальный ID затем требует отдельного review resolved target/binding и списка
миграций; remote apply и inactive deploy разрешаются раздельно. Локальный
шаблон в [runbook](07_DEPLOYMENT_RUNBOOK.md) намеренно содержит невалидные IDs
и находится только в Markdown, не в deploy config.

Migrations не менялись, текущие SHA-256:

```text
0001_stage4.sql  1f1f5054a69c0bfc8129ff448a189f268c517a0a15f43853d710abbd15b0f3fd
0002_stage5.sql  964009d912e51479222ee01dd71134381ba554cca34243a1d00a8d2253a83f90
```

Только после inactive verification можно отдельно обсуждать ограниченное
upstream/Cron observation с измерениями фактических SQL/subrequests/rows/CPU/
storage, независимыми complete baselines и последующим выключением. Public
HTTP trigger не добавлен. Real Telegram design/setup/API interactions остаются
отдельными gates. Локальные tests не доказывают remote quotas, current source
volume, production truth/eligibility или completeness официальной истории.

Историческая failed CI #18 остаётся evidence: новый зелёный GitHub CI потребует
отдельно разрешённых Git/workflow действий. Новый PR не создавался. Recovery
stash/worktrees/backups не изменялись. Нефатальный dependency warning
`DEP0040 punycode` не устранялся обновлением dependencies вне scope.

## После отчёта: commit/push и внешний merge PR#7

Отдельное разрешение владельца на commit/push выполнено агентом:
**`7a9eedf21942f22aa4e671542d59b6778ffa7bac`**,20files, ветка
`feat/stage6-staging-preflight`. Push успешен; реализации после review не меняли.
PR#7 создал/merged владелец или внешний процесс, не агент.

Read-only GitHub подтвердил [PR#7](https://github.com/Khimish009/reset-radar/pull/7)
merged2026-10-22T10:23:42Z, merge/main
**`1bfbe98aa7574b77f18ffebfe9ee77ced150c4ff`**;
[CI#19](https://github.com/Khimish009/reset-radar/actions/runs/39762425082) на7a9eedf
и [merge CI#20](https://github.com/Khimish009/reset-radar/actions/runs/39762767428)
на1bfbe98 — **success**. [Evidence](evidence/stage6-2026-10-22/pr7-ci.md).
Таким образом, failed CI18 остаётся историческим фактом, но не состоянием
текущего remote main. Зелёные CI не закрывают stable-staging acceptance.

Следующее задание — только сохранить контекст и подготовить
[CONTINUE_STAGE6_CAPACITY](../prompts/CONTINUE_STAGE6_CAPACITY.md). Он при будущем
явном назначении открывает local design/decision фазу Stage6, не implementation
нового protocol/remote действия/Stage7. Эта подготовка не коммитилась и не
пушилась; старое разрешение не переносится. Current local/remote refs и
проверки подготовки — в [handoff](37_STAGE6_PREFLIGHT_HANDOFF.md).
