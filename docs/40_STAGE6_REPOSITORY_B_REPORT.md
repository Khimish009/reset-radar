# 40 — Stage 6: локальный результат repository B

**2026-10-22. B-first явно выбран владельцем**, назначен
[CONTINUE_STAGE6_REPOSITORY_B](../prompts/CONTINUE_STAGE6_REPOSITORY_B.md).
Локальная оптимизация B выполнена; полный Stage 6 stable-staging acceptance
остаётся pending. C, тариф, SLA и новая baseline/evidence policy не утверждены.
**Не развёрнуто / не опубликовано. Real staging E2E pending.**

## Изменения и сохранённые границы

В `src/storage/d1.ts` события, observations, versions, candidates и source state
записываются prepared multi-row statements вместо SQL на каждую строку.
Группы ограничены 100 binds, 100,000 UTF-8 bytes SQL и консервативной оценкой
2,000,000 bytes SQL+values+16 bytes/bind. Последняя неполная группа сохраняется,
пустая не создаёт SQL, oversized row отклоняется до выполнения batch. Это
локальная граница row/statement с запасом, не измерение remote wire size всего
provider batch. Все значения остаются bound; имена таблиц/колонок — внутренние
константы. Новых dependencies нет.

Один atomic provider `D1.batch()`: CHECK generation guard первым, activation,
events, observations, versions, candidates, sources, cleanup, sync audit,
retention, guard cleanup. Provider commits независимы. Guard/SQL failure
откатывает весь snapshot. CAS loser и потеря acknowledgement проверены через
durable generation/read-back, без повторной новой версии. Namespace identity,
material hash/sequence/transition IDs, A→B→A, correction linkage и clocks
сохранены. Canonical/source freshness обновляются и при том же materialHash;
дополнительных key lookups и hash-only skip нет, currentRows scan сохранён.

**Уточнение противоречия design38 §5.3 и существующего contract.** Фраза
«тот же observation key с другим содержимым отклонять» не применима к сравнению
всего входящего canonical payload: при том же key законно меняются top-level
`sourceGeneratedAt`/`sourceReviewedAt` (feed context вне raw key) и зависящие
от времени/prior state interpretation fields. Raw source timestamps входят
в rawAssessmentKey и обычно меняют observation key. B сохраняет первую immutable
observation через `ON CONFLICT(event_id, observation_key) DO NOTHING`, как
прежний `INSERT OR IGNORE`; свежий canonical payload обновляется. Immutable
triggers и прежние namespace checks сохранены. Нового conflict/evidence
protocol не вводили. Это ограничение исходного contract, не новая гарантия
выявления произвольной подмены payload при совпадающем key.

Не менялись ingestion/adapter protocol и caps: 100 records/provider,
Claude25×4 pages, 5+1 requests, prior-read101, body2MiB/timeout10s. Schema,
миграции0001/0002, оба synthetic journals/publisher, HTTP501/404/405/HEAD/OPTIONS,
logger, runtime/config/Cron[], CI, dependencies/lockfile и Postman artifacts
без изменений. Commit/push/PR/merge не выполнялись; ветка только локальная.

## Измеренный эффект

Одинаковые synthetic fixtures, pinned версии и расширенный workload harness.
База `25b6851bff772b02c08758c32bb9391d2ed5a1dd`, before runtime извлечён в `/tmp`
через read-only git show; after — незакоммиченный B. Исторические evidence не
перезаписаны. JSON, metadata, команды, bytes/prepare/bind/size/elapsed и все20
samples: [workload evidence](evidence/stage6-repository-b-2026-10-22/workload.md).

| Сценарий, оба providers | SQL до→после | D1 execution calls | Local rows_written до→после |
|---|---:|---:|---:|
| C12/X62 cold | 249→52 | 12→12 | 1,134→1,001 |
| C12/X62 cached/restart304 | 175→42 | 12→12 | 315→246 |
| C100/X100 cold | 630→98 | 12→12 | 3,030→2,670 |
| C100/X100 cached/restart304 | 430→72 | 12→12 | 822→636 |
| Stored101/provider safe stop | 28→22 | 10→10 | 22→22 |

Все20 digest durable-состояния совпали. SQL сокращены за счёт grouping, в том
числе sources; оценки55/104 из design были оценками, новый результат measured.
Local rows counters снизились при одинаковых domain rows; индексы и служебная
работа SQLite входят в accounting. Это не обещание remote экономии/Free-fit.
Четыре first()-SELECT без metadata остались: rows_read — lower bound. Каждый
batch member считается отдельным SQL, prepare/bind не execution. Single-run
Miniflare wall time и size_after не billed CPU/remote storage/квоты или p95.
При288 одинаковых cached invocations/day условная local write model теперь
246×288=70,848 (C12/X62) и636×288=183,168 (C100/X100); это не cost forecast,
вторая величина всё ещё выше historical comparison allowance100k/day из docs38.
Effective account limits/accounting и shared usage не проверялись.

## Проверки и продуктовые ограничения

Финальные code checks выполнены до независимого review:

| Реальная команда | Результат |
|---|---|
| `npm run typecheck` | PASS |
| `npm run lint` | PASS |
| `npm test` | 332 PASS / 5 opt-in skipped; 19 passed files, 14.37s |
| `npm run test:d1` | 83 PASS, 6 files, 12.92s |
| `env STAGE6_WORKLOAD_OUTPUT=/tmp/stage6-b-after-semantic.json npm run test:workload` | 10 PASS, 8.49s; before тот же harness10 PASS, 14.70s |
| `npm run d1:migrate:local` | PASS, local only, no migrations to apply |
| `python3 docs/evidence/stage0-2026-10-21/verify.py` | 139 offline assertions PASS |
| `python3 docs/evidence/stage6-repository-b-2026-10-22/verify.py` | 20 matching durable digests, hashes/coverage/bounds PASS |
| `git diff --check` | PASS |

После full/D1 suites только measurement harness дополнен unmeasured digest
inspection; targeted workload, typecheck и lint повторены и прошли. Runtime
после full suite не менялся. Website отсутствует: build неприменим. Нефатальный
dependency `punycode` warning; dependencies не обновлялись. Initial sandbox
loopback EPERM исправлен разрешённым escalation, не SQL mock/live fallback.

Existing Postman CLI1.75.0 simulation запущена локально без изменения artifacts:

```sh
postman simulation run postman/simulations/stage6-local.sim.yaml --port 4904 --output ndjson --no-history
env STAGE6_SIMULATION_URL=http://127.0.0.1:4904 npm test -- --run tests/stage6-runtime-simulation.test.ts
```

**1 PASS**,1.75s; проверены15GET receipts:5history+5status Claude,5Codex;
6×200,5×304,1×429,3×503; request errors0. Наш listener PID23956 остановлен
SIGINT, server exit0; lsof:4904 exit1, listener отсутствует. Raw synthetic
logs — `/tmp/stage6-b-simulation.ndjson`/`.err`; stdout теста —
`/tmp/stage6-b-http.log`. Workspace push/deploy/proxy/pass-through не было.
Применены навыки [api-engineer](</Users/salman/.codex/plugins/cache/postman/postman/1.1.0/skills/api-engineer/SKILL.md>)
и [api-simulation](</Users/salman/.codex/plugins/cache/postman/postman/1.1.0/skills/api-simulation/SKILL.md>).

Проверены grouped chunk rollback, bind/byte bounds и UTF-8 byte split,
stale-after-read/overlap/lost ack, empty/final group, immutable/new observation,
A→B→A, source freshness, independent failure,429/503/backoff, invalid/expired304,
99/100,100→union101→safe stop. Retention case неизменён:103real commits,
generation103, retained4–103,100sync_runs,20s; global timeouts/parallelism прежние.
Scheduled assertions сохраняют approvalsNULL и оба пустых send journals;
synthetic publisher fixtures не затронуты.

Новые characterization cases: свежий future announcement при полном bootstrap
сохраняется в том же poll, без assessment остаётся needs_review; accepted
assessment отдельно проверен через прежний ingestion seam. Material update
делает старое evidence stale; confirmed reset требует достаточного delivery
evidence. Baseline не создаёт candidates/approval/history blast. При partial
history B не сохраняет partial canonical events и не завершает baseline —
**known product gap**. Cache содержит scoped upstream representation, не
оперативный inbox. До первого полного baseline detection не разрешает send.
Stored union101/provider останавливает следующий fetch, сохраняя202events/
versions/observations, sources и baseline. B не решает многочасовой backfill.
Реальная source coverage/API appearance неизвестны; injected clock/local elapsed
не доказывают proposed p95≤6min/≤30s и не утверждают SLA или Telegram delivery.

## Независимое review

`repository_b_review` | reviewer | gpt-6.1-sol | reasoning high — завершён.
**Critical/high/medium/low findings нет.** Независимо выполнены storage14/14PASS,
artifact verifier, diff-check; сравнены baseline/expanded harness/fixtures byte
for byte,20durable digests, SQL/calls и unchanged retention. Final doc review:
118local link targets/0broken, balanced fences, status/gates consistent. Уточнена
неблокирующая формулировка: same-key feed context не путать с raw timestamps.
Reviewer файлов не менял, remote/full suite не запускал.

## Файлы, следующий gate и остановка

Runtime: `src/storage/d1.ts`. Tests/measurement: `tests/stage4-storage.test.ts`,
`tests/stage4-ingest.test.ts`, `tests/stage6-workload.test.ts`,
`tests/helpers/d1-metrics.ts`. Evidence: новая директория
`docs/evidence/stage6-repository-b-2026-10-22/`. Docs: README, docs08/09/38/39,
этот report40, handoff41, owner checklist. Существующий untracked continuation
prompt и исходные prep edits сохранены; staged diff пуст.

**Local B завершён; active remote staging NO-GO.**
Account/profile label, plan/effective limits/headroom, target/region, numeric
max spend/stop budgets, remote CPU/query accounting и latency acceptance unknown.
Если capacity100/coupled processing не подходят, нужно отдельное local C
assignment с priority design. C автоматически не выбран. A не запускается
после B: после закрытия prerequisites отдельное owner decision; первый возможный
remote gate только isolated staging D1 create, ещё без migrations/bindings/
deploy/Cron/live reads. Новое Git permission отдельно. Stage7 не назначен.

**Не развёрнуто / не опубликовано. Real staging E2E pending. После отчёта STOP.**
