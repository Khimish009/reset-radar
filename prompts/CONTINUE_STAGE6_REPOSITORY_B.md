# Новая сессия — Stage 6: локальная оптимизация repository B

Ты работаешь в `/Users/salman/pet_projects/reset-radar`, **Reset Radar | AI Limits**.
Прочитай `AGENTS.md`, `README.md`, [current handoff](../docs/39_STAGE6_CAPACITY_HANDOFF.md),
[capacity decision](../docs/38_STAGE6_CAPACITY_DECISION.md) (§§3,5,6.5–6.6,7,9),
ADR-042 в [decisions](../docs/09_DECISIONS.md),
[workload methodology](../docs/evidence/stage6-2026-10-22/workload.md) и
[original JSON](../docs/evidence/stage6-2026-10-22/workload.json).
Relevant [data/state](../docs/03_DATA_AND_STATE.md),
[test strategy](../docs/06_TEST_STRATEGY.md),
[runbook](../docs/07_DEPLOYMENT_RUNBOOK.md) и
[owner checklist](../manual/OWNER_CHECKLIST.md) читать по затронутой области.

**Только явно поручая выполнить этот файл в новой сессии, я выбираю B-first
как следующий локальный шаг Stage 6 и разрешаю repository optimization B,
необходимые локальные tests/measurement, independent review, docs/report и STOP.**
Принимаю `b283ccf` и документационный follow-up PR #8 как основу этого scope,
включая приоритет свежих достоверных future-reset announcements. Сохранение
или чтение prompt само по себе не назначает реализацию. Подготовка prompt не
является выбором владельцем B, C, тарифа, SLA или нового baseline policy.

Это **не реализация C**, priority inbox/overlay, нового bootstrap protocol,
Telegram publisher, remote staging или Stage7. Новый отдельный local assignment
B не переносит старое commit/push permission. После проверок/review/report STOP.

## 1. Контекст на момент подготовки — перепроверить

- Local HEAD/ветка: `feat/stage6-capacity-decision`,
  **`b283ccf02f3973c080b6c23cea5811a866a34ec5`**,
  `docs: prioritize fresh announcements during historical imports`.
  Агент выполнил разрешённые commit/push именно в эту ветку; push успешен,
  remote PR head подтверждён. Перед текущей prompt-подготовкой дерево чистое.
- [PR #8](https://github.com/Khimish009/reset-radar/pull/8) — **open/unmerged**
  при подготовке, head=b283ccf, base SHA
  `1bfbe98aa7574b77f18ffebfe9ee77ced150c4ff`. Его `merge_commit_sha` при
  `merged=false` — не доказательство merge; не использовать synthetic merge
  commit как принятую базу. Предыдущий docs commit —
  `08fab9d4f79961dc79f844f1b6ea1c25fd5ba650`.
- [CI #21](https://github.com/Khimish009/reset-radar/actions/runs/39795699521)
  на08fab9d — completed/success. [CI #22](https://github.com/Khimish009/reset-radar/actions/runs/39799318210)
  наb283ccf при первом чтении был in_progress; повторная read-only проверка
  перед завершением подготовки подтвердила **completed/success**. В новой
  сессии всё равно перечитать actual PR/CI read-only. Это не real staging,
  remote quota evidence или результаты будущей реализации B.
- Local `main=22ebefe1e1a6243df4a0e769417dbbe184f1c5a4`,
  `origin/main=1bfbe98aa7574b77f18ffebfe9ee77ced150c4ff`; текущая local feature
  отслеживает origin/main, поэтому ahead2 — не доказательство отсутствия push.
- Runtime preflight `7a9eedf21942f22aa4e671542d59b6778ffa7bac` уже merged
  в1bfbe98 через PR #7. Runtime/code этого merge не менялись docs commits08fab9d/
  b283ccf. Historical CI18 failure не является текущим failed main.
- Docs follow-up: только6Markdown files; diff-check PASS,82local links/0broken,
  offline139PASS. Независимый `pr8_latency_docs_review` (reviewer,
  gpt-6.1-sol, high) — без существенных critical/high/medium findings.
  Это historical evidence, не проверки новой реализации B.
- Ранее runtime preflight:322PASS/5opt-in skipped,73D1PASS,workload8PASS/
  17sample records; existing loopback Stage6 HTTP1PASS/15GET receipts.
  Эти counts нельзя выдавать за новый run. Website отсутствует.
- После сохранения prompt остаются локальные docs/prompt edits — сохранить.
  Старые stash/worktrees/recovery не трогать; stash повторно не применять.

## 2. Старт, база и Git boundaries

1. Проверь staged/unstaged/untracked, HEAD/history/refs, read-only PR #8 и CI.
   При явном назначении этого файла разрешён `git fetch origin` без prune.
   `gh` ранее отсутствовал; read-only GitHub API через curl допустим, без
   GitHub mutations. Ни fetch, ни зелёный CI не разрешают merge/новый stage.
2. Работай в **новой локальной `feat/stage6-repository-b`**, не добавляй runtime
   implementation в документационный PR #8. Если PR #8 уже merged и verified
   main содержит b283ccf, используй проверенный origin/main. Если он открыт,
   можно использовать verified feature base, содержащую08fab9d+b283ccf:
   это local acceptance этой базы, не merge PR. Не включать посторонние новые
   изменения вслепую. Существующую одноимённую ветку не перезаписывать.
3. Сохрани pending prep edits. Не делать reset/clean/rebase/merge/stash pop/
   branch deletion. При конфликтах переноса сообщи конкретные факты, продолжай
   независимое чтение; не теряй документацию ради checkout.
4. Новый commit/push/PR/merge **не разрешены** этим assignment. Прошлое
   permission на отправку b283ccf использовано. Remote refs/CI читать можно.

## 3. Реализовать только B

Минимальная область: `src/storage/d1.ts`; при необходимости внутренние storage
helpers/types в `src/storage/`, не меняющие публичный `D1Repository` contract.
Relevant tests: `tests/stage4-storage.test.ts`, `tests/stage4-ingest.test.ts`,
`tests/stage6-workload.test.ts`, existing D1 helpers и локальные fixtures.
Doc/report/evidence changes нужны по фактическому результату.

- Групповые **prepared multi-row** event UPSERT, observation INSERT,
  version INSERT, candidate INSERT и при пользе source UPSERT вместо SQL на
  каждую строку. Ограничить каждый statement bind count≤100, SQL length≤100KB
  и реальным D1 row/input byte bounds; учитывать UTF-8, overhead/общие params,
  empty groups, неполную последнюю группу. Не подставлять значения в SQL text.
  B grouping counts в docs38 — **оценки**, не заданный результат теста.
- Сохранить один **атомарный provider `D1.batch()`**: generation CHECK guard
  первым, затем activation/events/observations/versions/candidates/sources/
  sync audit/retention и cleanup guard. Не разбивать provider snapshot на
  независимые commits ради cap. Failed guard/SQL rollback всего snapshot;
  stale generation не оставляет частичных event/source/baseline/candidate writes.
- Сохранить текущие namespace identity, immutable observations/versions,
  materialHash/sequence/transition identity и clocks. Replay без новой версии,
  A→B→A с новой sequence, новая observation даже при том же materialHash,
  корректная связь correction и отсутствие baseline candidates/history blast.
  Не использовать INSERT OR REPLACE для immutable rows и не удалять историю.
- Не пропускать canonical update только по materialHash: last_observed_at,
  payload/source timestamps, checked_at/ETag/expiry/backoff и health могут
  меняться. Исключать только доказуемо избыточные writes без изменения truth/
  freshness/audit; дополнительные key lookups должны оправдываться measurement.
  Optional bounded read по incoming IDs вместо полного currentRows scan
  допустим внутри repository, но не снимает ingress prior-read/cap.
- Не менять runtime wiring/config flags, adapter/ingestion protocol и caps:
  max100records/provider, Claude25×4pages,5Claude+1Codexrequests, prior-read101,
  body2MiB/timeout10s. Полный feed>100/partial import не завершает baseline.
  Stored union101/provider всё ещё останавливает следующий fetch с
  `stored_record_limit`, сохраняя202events/versions/observations и old truth.
- Не менять `migrations/0001_stage4.sql`,0002, schema, synthetic journals,
  publisher, HTTP501/404/405/HEAD/OPTIONS, logger contract, runtime/config,
  Cron[], dependencies/lockfile, CI или Postman artifacts. Нужда в этих
  изменениях — граница нового scope, не повод реализовать C под видом B.

## 4. Product/latency boundary — не обещать лишнего

Главный продуктовый приоритет — новые достоверные анонсы будущих дополнительных
сбросов. B уменьшает repository work, **но оставляет coupled full-snapshot
processing и cap>100 stop**. Не выдавать B за priority inbox/overlay или решение
многочасового backfill. Всё C из docs38 §6, включая fast processing, — proposed
и не входит в эту реализацию. Тариф и новый baseline policy не утверждены.

Proposed targets из docs38 §6.6: при cadence5min/healthy source/budget p95
source-API-visible→durable detection≤6min; successful response→automatic durable
assessment≤30s. Это **не owner-approved SLA**, не human review/approval и не
Telegram delivery. Event announced_at/generated_at не доказанное API appearance.
В controlled tests source-visible time задаёт injected clock; если coverage/
source-visible timestamps неизвестны, честно показать unknown/интервал.

Добавь только соответствующие **B characterization/regression** сценарии:
новый future announcement при полном bootstrap; новая запись при partial
history; material update анонса; новый confirmed reset только с достаточным
evidence; restart/304; overlap/CAS. При partial history B ожидаемо не сохраняет
partial canonical events и не завершает baseline — зафиксировать это как
**известный продуктовый gap**, не «исправлять» отдельной вставкой без gates.
До первого полного baseline нет send candidates/approvals/history blast.
Для C-specific cases inbox/overlay/archive watermark тесты не реализовывать
без C assignment. Не объявлять freshness target достигнутым на основании
одного fixture, local elapsed или искусственно перемотанного clock.

## 5. Tests/measurement и acceptance

Сначала baseline existing harness, затем сопоставимый after на тех же pinned
versions/fixtures. Не перезаписывать исторические JSON/отчёты; новые artifacts
в следующем свободном `docs/evidence/stage6-repository-b-<date>/` с synthetic
label, reviewed base/change context, командами и metadata coverage.

Обязательные scenarios: C12/X62 и C100/X100 cold/cache/restart304, material
update/new observation, rollback ошибки середины grouped batch, lost/stale CAS,
independent provider failure,429/503/backoff, invalid304/expired cache,99/100 и
shifted100→union101→safe stop. Проверить bind/byte boundaries, empty group и
неполный последний chunk, без implementation-mirroring assertions вместо
проверки durable semantic rows/rollback. Не заменять real D1 SQL успешными mocks.

Сохранить existing retention case: **103real commits, generation103,
retained4–103,100sync_runs,20s timeout**. Не ослаблять его assertions, global
Vitest timeouts или parallelism ради green CI. ApprovalNULL/оба журнала пусты
проверяются на scheduled path; synthetic publisher tests сохраняют свои fixtures.

Report обе величины **SQL statements и D1 execution calls**, prepare/bind
отдельно; каждый batch member — SQL. Rows read/write, unavailable metadata,
input/SQL/bind bytes и local elapsed/size с прежними оговорками: four first()
SELECT без metadata в исходном harness; read totals lower bound; grouping
само по себе не обещает меньше rows. Если metadata coverage меняется — объясни.
Local elapsed не billed CPU, Miniflare не remote accounting/quotas/storage.
Показать before/after по одинаковым сценариям, а не только процент «ускорения».

Реальные команды итоговой проверки (после необходимых code changes):

```sh
npm run typecheck
npm run lint
npm test
npm run test:d1
npm run test:workload
npm run d1:migrate:local
python3 docs/evidence/stage0-2026-10-21/verify.py
git diff --check
```

Для JSON существующий `STAGE6_WORKLOAD_OUTPUT` направлять в /tmp/new evidence,
сохранять artifact после всех PASS. Existing combined loopback HTTP simulation
проверить по [методике](../docs/evidence/stage6-2026-10-22/preflight-simulation.md):
`postman simulation run postman/simulations/stage6-local.sim.yaml --port 4904`
с локальными NDJSON logs и
`env STAGE6_SIMULATION_URL=http://127.0.0.1:4904 npm test -- --run tests/stage6-runtime-simulation.test.ts`.
Прочитай применимые Postman skills, reuse existing substitute; без workspace
push/deploy/proxy/pass-through или реальных upstream. Проверить receipts и
shutdown/освобождение своего listener; чужой процесс/порт не останавливать.
Miniflare/workerd и substitute требуют loopback; sandbox EPERM исправлять
разрешённым escalation, не ослаблением mocks или переходом на реальные feeds.

Website build неприменим, пока website отсутствует. Отчёт не должен выдавать
skipped opt-in или historical checks за PASS. После final code/checks —
независимый reviewer по AGENTS; исправить substantial findings и повторить
затронутые checks. Субагенты получают ограниченные задачи, не повторяют весь
workflow; главный явно сообщает их роли/модели/status.

## 6. Итог, следующие gates и STOP

Обновить ADR/status, README/roadmap/checklist и report/handoff следующего
свободного docs-номера по фактическим результатам. B может быть завершён локально,
но **Stage6 stable-staging acceptance остаётся pending**. Сформулировать вывод:
что measured улучшилось, что осталось gap, нужен ли C по capacity/freshness.
Ни C, ни Paid, ни следующий stage автоматически не выбирать.

Account/profile label, effective plan/query accounting/CPU/headroom,
staging target/region, numeric maximum spend и stop budgets пока unknown;
токены и реальные account/database IDs в docs/chat не нужны. До заполнения
этих inputs и capacity/latency acceptance active staging **NO-GO**.
A не запускается автоматически после B: затем отдельное решение владельца,
а первый возможный remote gate — **только isolated staging D1 create**,
ещё без migration/deploy/bindings/Cron/live reads. Если caps/latency не подходят,
сначала отдельный local C design/implementation assignment, без remote.

Итог по-русски: выполнено/не выполнено, файлы, actual commands/results,
independent review, facts/assumptions, измеренный эффект и unresolved gaps,
conditional go/no-go и конкретный следующий owner gate. Затем STOP.

**Не разрешены commit/push/PR/merge, Cloudflare account/API/login/resources,
remote D1/migrations/deploy/bindings/secrets/Cron, реальные upstream/Telegram,
production, новый baseline/publish protocol, C/inbox/overlay и Stage7–11.
Не развёрнуто / не опубликовано. Real staging E2E pending.**
