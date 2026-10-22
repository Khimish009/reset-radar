# 38 — Stage 6: capacity/budget decision перед remote staging

Дата: **2026-10-22**. Статус: **proposed, owner choice pending**. Назначение:
[CONTINUE_STAGE6_CAPACITY](../prompts/CONTINUE_STAGE6_CAPACITY.md). Владелец
принял preflight PR #7 как базу и разрешил только локальный design/decision,
проверки, независимое review и отчёт. Этот документ — конкретное предложение,
не разрешение реализовывать protocol, выбирать тариф или выполнять remote.

**Рекомендация: C с групповыми prepared writes из B внутри chunks.** C нужен
для роста сохранённой истории и full feeds >100; B отдельно уменьшает SQL,
но сохраняет capacity stop. A — только короткое ограниченное наблюдение,
не путь к принятию stable staging. Следующий предлагаемый gate — **отдельное
локальное implementation assignment C**, точно ограниченное разделом 9.
Owner decision и account/plan/budget отсутствуют: **active staging NO-GO**.
Stage 6 не завершён; Stage 7 начинается только после его завершения и отдельного
назначения. **Не развёрнуто / не опубликовано. Real staging E2E pending.**

## 1. Проверенная база и границы доказательств

В этой сессии `git fetch origin` и read-only GitHub API подтвердили:
[PR #7](https://github.com/Khimish009/reset-radar/pull/7) merged
2026-10-22T10:23:42Z; remote main/origin/main —
`1bfbe98aa7574b77f18ffebfe9ee77ced150c4ff`, содержит
`7a9eedf21942f22aa4e671542d59b6778ffa7bac` без разницы tracked content.
[CI #19](https://github.com/Khimish009/reset-radar/actions/runs/39762425082) и
[CI #20](https://github.com/Khimish009/reset-radar/actions/runs/39762767428) —
completed/success. Исторический CI #18 failure не является текущим состоянием
main. Создана только local `feat/stage6-capacity-decision` от origin/main;
исходные pending docs/prompt/evidence сохранены, local main не обновлялся.
`gh` отсутствует; GitHub проверен через `curl`, без авторизации/изменений GitHub.

Existing code: [ingestion](../src/services/ingest.ts),
[scheduled](../src/services/scheduled.ts), [repository](../src/storage/d1.ts),
[interfaces](../src/storage/types.ts), [schema](../migrations/0001_stage4.sql).
Runtime/config/migrations/tests/deps/CI/Postman в этой фазе не меняются.

[Preflight workload](evidence/stage6-2026-10-22/workload.md) и
[JSON](evidence/stage6-2026-10-22/workload.json) — **исторические synthetic local
измерения**, не rerun этой сессии и не current live sizes:

| Workload, оба provider | SQL / invocation | D1 execution calls | Local rows written |
|---|---:|---:|---:|
| C12/X62 cold | 249 | 12 | 1,134 |
| C12/X62 cached или restart304 | 175 | 12 | 315 |
| C100/X100 cold | 630 | 12 | 3,030 |
| C100/X100 cached | 430 | 12 | 822 |
| Stored101/provider, 0 fetch | 28 | 10 | 22 |

Две полные выдачи IDs1..100 → IDs2..101 сохраняют union101/provider. Следующий
invocation безопасно останавливается с `stored_record_limit`; остаются202
canonical events/versions/observations, источники и completed baseline times.
Полный feed>100 или partial pagination не завершает baseline. Простое увеличение
cap, Paid или удаление истории не являются исправлением.

Все batch members считаются SQL отдельно; prepare/bind не execution.
Четыре first-SELECT/invocation не дают metadata: read totals — lower bound.
Local elapsed не billed CPU, local DB size не remote storage. Два provider
commits независимы: SQL totals относятся ко всему Worker invocation.

## 2. Official limits и условный budget model

Official Cloudflare pages повторно прочитаны 2026-10-22; account не открывался.
Это опубликованные условия, **не effective limits конкретного account**.

| Параметр | Free | Paid | Primary source |
|---|---|---|---|
| D1 queries / Worker invocation | 50 | 1,000 | [D1 limits](https://developers.cloudflare.com/d1/platform/limits/) |
| D1 database / account storage | 500 MB / 5 GB | 10 GB / 1 TB | [D1 limits](https://developers.cloudflare.com/d1/platform/limits/) |
| D1 rows read / written allowance | 5M / 100k в день | 25B / 50M в месяц включено | [D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/) |
| D1 usage сверх Paid allowance | — | $0.001/M read, $1/M write; storage сверх 5 GB $0.75/GB-month | [D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/) |
| CPU Cron с интервалом 5 минут | 10 ms | 30 s | [Workers limits](https://developers.cloudflare.com/workers/platform/limits/#cpu-time) |
| Cron wall duration | 15 min | 15 min | [Workers limits](https://developers.cloudflare.com/workers/platform/limits/#duration) |
| External / internal subrequests | 50 / 1,000 | default 10,000 / 10,000 | [Workers limits](https://developers.cloudflare.com/workers/platform/limits/#subrequests) |
| Workers subscription | $0 | minimum $5/month; usage extra | [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/) |

D1 table говорит queries50/1000, Workers table — иные internal subrequest caps.
Batch — transactional sequence SQL, не один SQL; enforced batch accounting
конкретного account остаётся неизвестным. Сохранять **SQL и execution calls**,
сравнивать SQL с D1 cap консервативно; 12calls не доказывают Free-fit.
[D1 batch](https://developers.cloudflare.com/d1/worker-api/d1-database/#batch).

Условная арифметика для 288 одинаковых invocations/day, без других apps:
315×288=90,720writes/day (9,280 до Free100k); 822×288=236,736, выше100k.
За30дней это2,721,600 и7,102,080 соответственно — **не billed forecast**,
не означает нулевой incremental cost на Paid с общими account allowances.
Cold +287 cached =91,539 и238,944writes в первый условный день.
Bootstrap, material changes, индексы, retry/overlap, retention cleanup и другие
apps нужно учитывать отдельно; read lower bound нельзя использовать как upper
budget. Public API traffic относится к будущему Stage9.

Для окна: `usage = cold + n_cache*cache + n_update*update + n_error*error +
chunk/preparation/finalization/cleanup + other_account_usage`. Daily/monthly
cost рассчитывать по фактическим account totals, включённым остаткам и тарифу,
с учётом Workers CPU/requests, storage и согласованной telemetry. Ни B, ни C
не обещают бесконечный Free hosting. При неизвестных spending/stop numbers
нельзя выводить GO из опубликованных allowances.

## 3. Сравнение ADR-042 A/B/C

| Вариант | Capacity | SQL/rows budget | Что не закрывает |
|---|---|---|---|
| A, текущий runtime | Только нынешние caps100, Claude4×25, 5+1requests, prior-read101 | Ничего не оптимизирует; короткое окно лишь ограничивает суммарный расход | История/union>100, CPU/реальное accounting, stable staging |
| B, atomic repository | Те же caps и full import | Группирует writes, уменьшает statements; исключает доказуемо лишние writes | Feed/history>100, completeness protocol; rows не пропорциональны SQL |
| C, durable manifests/chunks | Полный snapshot через несколько bounded invocations; history сохраняется | Распределяет работу; B внутри chunks снижает SQL overhead | Полнота upstream остаётся допущением, суммарные rows/storage могут вырасти, remote fit не доказан |

Предлагается C: known union101 stop неизбежен при росте даже sliding feed100.
Риск C — новый schema/read protocol и больше промежуточного storage; ради
одного короткого эксперимента владелец может выбрать A, если принимает его
ограничения. B — полезная меньшая альтернатива для измерения repository cost,
но результат B не следует называть capacity-ready.

## 4. A — точный bounded observation proposal, условный

Сейчас **NO-GO**. Prerequisites: owner принимает caps A; известны label/plan/
effective limits/headroom/target/region, approved numeric budgets и оператор;
разрешены отдельные D1-create/migrate/inactive-deploy gates, имеется telemetry
query/rows/CPU/storage и возможность выключения. До ingestion нужно разрешённое
**read-only feed-size probe**: Claude counted history/status/union всех surface
IDs, Codex events+scheduled, preserved D1 union, ревизии/total/cursor endings.
Нынешние12/62 не использовать как current. Probe требует отдельного разрешения
на live reads и входит в observation request/usage budget; не выполнять сейчас.

Предлагаемое начальное окно: максимум **3 scheduled invocations за15минут**, с
шагом не чаще5минут, без parallel/manual retries и без других активных триггеров.
Это operational bounds предложения, **не spending thresholds**. Из них на
планирование не более18 adapter GET (15Claude+3Codex); probe и platform
повторы считаются отдельно. Разрешение на непрерывные288/day этим не даётся.
Два provider обязаны каждый получить полный baseline; 304 засчитывается только
с валидным scoped body, пустая D1+304 baseline не даёт. Если текущие feed>100,
Claude history>4pages, status union>100 либо saved union>100 — A отклоняется
до активного ingestion. Выдача100 при union100 всё ещё может стать101 в окне:
это риск fail-closed stop, не запас capacity.

После каждого invocation оператор проверяет SQL/calls, фактические CPU/rows/
storage, health/completeness и union. Stop при первом partial/limit/revision
mismatch/429/503/timeout, overlapping run, unavailable telemetry, нарушении
numeric owner budget, неожиданном journal write/approval/Telegram traffic;
также stop при достижении3invocations или15минут, даже если всё успешно.
Backoff не обходить, чтобы успеть завершить baseline. Платформа может повторять
Cron и доставлять metrics с задержкой: нынешний runtime не имеет hard durable
счётчика3invocations или kill-switch расходов. Поэтому это **операторское окно
с запасом бюджета на in-flight/retries и остановку**, не гарантия жёсткого cap.
Если владелец требует hard invocation/spend ceiling, A неприменим без нового
local implementation assignment. D1 текущие запросы не hard-cancelled по wall time.

Shutdown/rollback заранее входят в будущее permission окна: deploy reviewed
`crons: []`, `INGEST_MODE=off`, `PUBLISH_MODE=dry_run`, проверить отсутствие
triggers/in-flight; сохранить D1 и метрики. Worker rollback не откатывает D1;
не удалять DB/историю, не reverse migrations. Возобновление требует разбора.
A не утверждает stable-staging acceptance. Если A принят и prerequisites
закрыты, **следующий remote gate только создание isolated staging D1**,
не миграции/deploy/live probe. Выбор A сам по себе DB не создаёт.

## 5. B — минимальный repository change set, без implementation

Область: `src/storage/d1.ts`, при необходимости только внутренние read types
в `src/storage/types.ts`; existing `D1Repository.commitSnapshot` semantics,
ingestion caps, runtime и migrations0001/0002 сохранить. Tests:
`tests/stage4-storage.test.ts`, `tests/stage4-ingest.test.ts`,
`tests/stage6-workload.test.ts` и existing metrics helper; это будущие edits.

1. Вместо per-event statements сгруппировать prepared multi-row UPSERT events,
INSERT observations, INSERT versions и candidates по operation type. Порядок:
guard → activation → events → observations → versions → candidates → sources
→ cleanup → sync_run/retention → remove guard, **в одном provider D1.batch**.
CHECK guard по expected generation остаётся первым, duplicate/namespace
validation до batch; stale CAS или любая SQL ошибка откатывает весь batch.
2. Bound chunk size по100binds, SQL100KB и2MB row; точный размер учитывает общие
params, UTF-8 payload bytes и запас. Events15bind/row → до6rows, observations6
→16, versions12→8, candidates4→25, sources9→11. Payload>row/body bounds
отклонять целиком, не обрезать. Один batch всё ещё обязан уложиться в remote
query-duration/CPU limits; не объявлять B unbounded.
3. Сохранить immutable `(event_id,observation_key)` и material sequence. Replay
не создаёт version; A→B→A создаёт next sequence; baseline создаёт ноль candidates.
Не использовать INSERT OR REPLACE для immutable tables. Старый payload/evidence
не обновляется даже при совпадении observation key. Конфликт ключа с другим
содержимым должен проверяться и отклоняться.
4. Возможное исключение лишних writes — только после точного сравнения durable
projection. У canonical `last_observed_at` меняется каждый successful poll:
пропустить UPSERT только по materialHash нельзя. То же касается source
checked_at/ETag/expiry/backoff и health. Без отдельного решения об иной модели
freshness сохранить эти writes. `INSERT ... ON CONFLICT DO NOTHING` для уже
известных observations можно не отправлять после indexed key lookup с CAS;
lookup overhead измерить. Новая raw observation при том же materialHash
обязана сохраниться. Ограничить currentRows read нужными incoming IDs через
bound IN chunks вместо полного provider scan; query текущего sequence остаётся
из immutable versions. Это не отменяет current ingress prior-read/cap.

SQL shape (псевдосхема, не runnable migration): `INSERT INTO events(cols)
VALUES (bound row1),… ON CONFLICT(id) DO UPDATE SET …`; затем grouped
`INSERT INTO observations … ON CONFLICT(event_id,observation_key) DO NOTHING`,
`INSERT INTO event_versions …`, `INSERT INTO publication_candidates …`.
Существующие CHECK guard и FK сохраняют transaction boundary; independent
providers не объединяются в одну транзакцию.

**Оценка, не measurement:** только grouping event statements для200cold records
снижает600 per-event SQL до `2*(ceil(100/6)+ceil(100/16)+ceil(100/8))=74`,
то есть общий630 → ориентировочно104 при прежних30other SQL. Для C12/X62:
222 →28, общий249 →55. Cached C100/X100:400 →48, общий430 →78;
C12/X62:148 →18, общий175 →45. Counts без extra key lookups/byte splits,
source grouping и candidates; итог может отличаться. Все четыре execution
patterns остаются примерно12calls, пока reads не меняются. **Rows written
может не снизиться вообще** от одного grouping; budget acceptance требует
измерений того же harness, metadata coverage и remote CPU/accounting позднее.

Replay после process crash безопасен через CAS/unique keys; lost response
проверяется по generation и durable run state, не повтором вслепую. Code
rollback B использует прежнюю schema; immutable audit и semantic snapshots
должны совпадать до/после, historical evidence не перезаписывать.

## 6. C — manifest/chunk/finalization protocol proposal

Это новый **внутренний D1 protocol**, не public HTTP API. Здесь нет нового
endpoint, direct upstream из браузера, Cron activation или real publisher.

### 6.1 Identity, states и fencing

Provider-scoped `snapshot_id = digest(provider, upstream, protocol_version,
content_revision или frozen_body_digest, filter_scope, import_nonce)`.
Claude revision — только идентификатор содержимого внутри выбранного upstream,
не checksum всего feed; ordered chunk/body digests и manifest root обязательны.
Codex generation time не считается revision: identity привязана к digest полного
schema-validated frozen body. Nonce отличает две попытки одинакового контента.
Уникальные ключи включают provider; идентичные IDs других providers не сливаются.

Manifest: `incomplete → complete` либо `incomplete → aborted`; terminal state
не возвращается обратно. Внутренние фазы incomplete: collecting, validating,
building. Поля: expected active root/canonical_generation, owner_fence,
chunk progress/digest root, total counts/bytes, source revision/scope, fixed
started_at/deadline, last_attempt/backoff, protocol/schema version.
Один active incomplete manifest/provider; acquisition/resume/abort через CAS
provider control row. Fence увеличивается при takeover; lease expiry само по
себе не даёт права stale writer продолжить. Каждый chunk write сверяет snapshot,
state, fence и progress CAS внутри transaction. Параллельный владелец либо
возобновляет тот же manifest, либо abort/new snapshot после fencing.

Canonical generation и attempt/fence counter **разные**: попытки/429/health не
меняют expected active root. Нынешний v2 generation нельзя незаметно переопределить;
v3 repository явно адаптирует `loadProvider`, а старый writer отключён. Все
записи обеих моделей одновременно запрещены.

### 6.2 Collect, consistency, restart и backoff

Claude: bounded pages25records, cursor/revision/total фиксируются durable.
Каждая страница проверяет content_revision, revision_changed, repeated cursor,
unique IDs, filters; status берётся с audience=all/window=any, совпадающим
revision/total и равными duplicate bodies. Status-only offers/announcements
включаются в union, count history отдельно от union. Предлагаемый cap — **одна
page fetch и один chunk commit/provider/invocation**, status fetch только вместо
page, итого до2upstream requests/invocation для двух providers. Не импортировать
всю историю заново в каждом invocation. Сбор может занять больше исходных5минут;
truth time не приравнивается к времени финализации.

В конце нужен повторный status/revision check. Если upstream cursor не
позволяет продолжать ту же revision, total меняется, revision regresses,
cursor пропал или TTL истёк — abort/restart с backoff и прежним active root.
**Допущение:** pagination с одинаковой revision действительно согласованна
между requests; локальные проверки не доказывают upstream snapshot isolation.
Если это не подтверждается в будущем разрешённом live scope, C не может
честно завершить full Claude baseline. Нет partial baseline ради progress.

Codex: единственный unpaginated response сначала полностью schema-validate,
проверить bytes≤2MiB и digest, затем заморозить manifest representation и
читать local chunks. Frozen body хранить byte-shards≤256KiB, не одним D1row
у предела2MB: все shards одного validated response и receipt/digest sealed
атомарно в одном bounded batch до обработки records. Raw byte-shards — не
normalized record chunks25; overhead receipt/JSON учитывается в row budget.
При недостаточном SQL/bytes budget whole receipt не коммитится; после restart
повтор fetch не смешивается с незавершённым body. **Допущение:** этот feed contract представляет полную
выдачу, а не скрытую усечённую историю; включить scheduled отдельной namespaced
surface. Missing ID не withdrawal. Если body больше2MiB или полная валидация
не помещается в CPU, stop; chunking D1 сам не делает upstream paginated или
streaming. Новый endpoint/stream parser требует отдельного design.

Cache validators только рядом с валидным provider/endpoint/query-scoped body,
digest/schema/retention; 304 без body не продвигает manifest. Сохранить Claude
cache≥60s, Codex≥1minute; 429/Retry-After,503,timeout и durable throttle/backoff
относятся к provider, не снимаются рестартом или новым manifest. Transport
attempt/cache state хранить отдельно от frozen source proof и canonical
last_success. При restart читать progress из D1; повтор committed chunk с тем
же digest — no-op, с иным digest — abort. Утрата response после commit требует
read-back progress/root. После expiry нельзя заново запросить страницу иной
revision и притвориться тем же snapshot.

### 6.3 Bounded preparation и atomic visibility

Предложение additive v3 schema, окончательные DDL/constraints — в отдельном
implementation review. Existing0001/0002 и immutable triggers не переписывать:

| Proposed table / interface | Назначение и ключи |
|---|---|
| `snapshot_provider_control` | provider PK; active_snapshot_id, canonical_generation, owner_fence, incomplete_id, transport health/backoff; отдельный schema/writer marker |
| `snapshot_manifests` | (provider,snapshot_id) PK; base root/generation, state/phase, fence, revision/digest/scope, counts, deadlines |
| `snapshot_chunks` | (provider,snapshot_id,phase,ordinal) unique; cursor/progress, digest, counts/bytes, staged validated input |
| `snapshot_event_identities` | stable namespaced event ID, immutable provider/upstream/external ID; v2 identity import сохраняется |
| `snapshot_observations`, `snapshot_versions` | append-only evidence и material versions с immutable triggers; подготовка помечена origin manifest; visible только через committed roots |
| `snapshot_entries` | (provider,snapshot_id,event_id) PK; current version/observation refs и first_detected/last_observed; полный preserved union |
| `snapshot_source_proofs`, `snapshot_candidate_refs` | frozen source checks и подготовленные transition refs; доступны только после complete; baseline candidates отсутствуют |

Shadow root строится **по bounded keyset chunks** из предыдущего active root:
копируются все сохранённые event identities/current refs, затем incoming rows
применяются как overrides. Пропавшие upstream IDs остаются с прежней truth,
last_observed не обновляется у отсутствующих. Для растущей истории не должно
быть `loadEvents(all)` или одного финального INSERT SELECT всей history.
Нормализация использует frozen raw/source timestamps и явный assessment clock;
временные future→review проверки повторяются перед sealing в bounded pass при
смене relevant date/assessment inputs, не выдают delivery и не меняют old evidence.
Если sealed derived projection устарела к finalize, abort/rebuild, не применять
старыe eligibility выводы. Material comparison и prior-version lookup только для текущего chunk по
indexed IDs; A→B→A получает новый sequence, replay не создаёт version. Временные
повторы подготовленных chunks не создают observations/candidates повторно.

Для конкурирующих drafts version identity включает snapshot ID, а sequence
считается от accepted predecessor; это предотвращает коллизию двух drafts с
одинаковым next sequence. Legacy transition IDs сохраняются при импорте, новые
v3 IDs — versioned opaque tuple(eventId,snapshotId,sequence); consumers обязаны
считать ID opaque. Observation `(event_id,observation_key)` dedup сохраняется,
коллизия key с разным payload отклоняется. Не менять semantic material hash,
raw evidence, assessed linkage или detection clocks из-за нового storage.

Сформированный root проверяется incremental: expected/copied/overridden/union
counts, unique keys, end cursors, total, digest chain и validated flags на каждом
CAS chunk. **Без O(history) final scan**: финальный batch проверяет accumulated
proof и sealed manifest, source revision check, expected base root/generation,
owner fence; затем state=complete, active pointer=new root, canonical_generation+1,
last_success/baseline и sync record обновляются **атомарно в одной transaction**.
Guard CHECK/CAS должен бросать ошибку и откатывать batch при lost race; no-op
UPDATE недостаточен. Переключение только одного provider, другой независим.

Первый baseline выставляется только здесь; publish approvals остаются NULL,
первый root создаёт0candidates; ни claim, ни оба send journals не записываются.
В будущем approval должна быть привязана к конкретному baseline; v3 migration
никогда не переносит synthetic approval как production decision.

Все readers pin active root в начале операции и читают только roots со
state=complete. Repository/publisher read joins должны учитывать root;
подготовленные/aborted records не доступны через старые direct-table queries.
После terminal complete root entries/source proofs/candidate refs становятся
неизменяемыми через SQL guards/triggers; build/cleanup не может изменить
старый complete root. Старый root и его immutable audit остаются доступными весь collect/build и
после complete для истории/rollback. Запись shadow entries не является
canonical baseline до pointer CAS. Если процесс падает до commit — active root
старый; после commit/lost acknowledgement — read-back определяет новый root.

### 6.4 Forward migration, cleanup и rollback

Новая forward migration (например0003 после повторной проверки свободного
номера) добавляет v3 tables/indexes/guards и schema marker. В inactive local
режиме bounded keyset backfill из legacy events/observations/versions/source
state; imported root получает complete только после полной проверки counts,
identity, hashes, lineage и исходного baseline. Без исходного baseline его не
выдумывать. Импорт включает всю prior observation/version lineage и existing candidate
references с исходными transition IDs; не подавлять/терять старые pending
candidates под видом bootstrap. Legacy immutable tables остаются целы. Backfill может потребовать
несколько шагов и имеет свой budget; никакой remote migration сейчас.

v3 активация только явным local/staging opt-in в будущем assignment; supplied
configs остаются inactive. Writer marker/fail-closed check блокирует v2 writer
после switch; forward migration также добавляет guards на legacy write tables,
чтобы **старый binary, не знающий marker**, не смог коммитить v2 snapshots.
Проверить реальный v2 repository на v3 DB: batch целиком откатывается. SQL
guard не запрещает старому binary делать SELECT или upstream GET, поэтому
операционный rollback только inactive до проверки совместимого reader/writer. Future synthetic publisher repository адаптируется к pinned
root или явно отказывает; обход через legacy rows запрещён. Public HTTP/API
остаётся инертным, publish mode и runtime production guards сохраняются.

TTL/deadline или count/byte/cost budget abort оставляет active root, approvals,
canonical audit без изменений. Default proposal: 1incomplete/provider,
max1,000incoming identities и max10,000preserved identities/provider для первой
**локальной** реализации, chunks≤25records, ≤100binds/statement и body≤2MiB;
внешние plan budgets всё равно неизвестны. Local-only draft bounds: snapshot
deadline6h, максимум1,024chunks/manifest и2,048chunk attempts, ≤256KiB staged
input/chunk (single oversized record безопасно отклоняется), ≤64MiB aggregate
staged input/provider; SQL/serialized bind bytes проверяются отдельно. Эти
цифры — proposed synthetic test caps, не owner spending budget. Один chunk
commit/provider/invocation означает до400copy steps для10,000preserved: при
5min cadence deadline6h недостаточен. Такое remote сочетание **NO-GO**:
нужны owner-selected меньший envelope/иная cadence либо отдельно измеренные
несколько bounded local D1chunks/invocation. Не продлевать TTL бесконечно
ради завершения; time-to-complete — acceptance metric. Это конечный test envelope, не
обещание remote capacity или hard total cost. Local planner резервирует итоговый guard/progress/health overhead и проверяет
≤48SQL members и≤16D1execution calls на **весь invocation обоих providers**;
при нехватке budget не начинает следующий phase step. Одна SQL failure может
потребовать read-back из оставленного резерва; unlimited recovery queries
запрещены. Эти caps проверяются harness, не hard CPU/spend cancellation.
Owner numeric remote budgets и запас на retries нужны до активации; без них stop.
На10,000preserved snapshot map копируется снова: O(history) суммарных rows на
accepted root остаётся. C распределяет work, но не делает его бесплатным.

Cleanup допускает bounded удаление только временного raw/cache/staging chunk
payload после terminal state и проверенных ссылок; metadata/digests и audit
сохраняются. Immutable observations/versions, включая подготовленные aborted
attempts с явной меткой неканоничности, не удалять; complete roots/entries,
нужные для истории и rollback, не GC. Storage может расти от aborted attempts;
budget/deadline/fencing ограничивают новые попытки, capacity reached → stop,
не усечение truth. Сроки хранения/права на editorial raw отдельно pending;
не превращать cache в бессрочное зеркало текстов.

Rollback: прекратить v3 progress, оставить DB; old root read доступен. При
необходимости pointer rollback к предыдущему complete root — отдельная
контролируемая операция с новым generation/fence и audit, не стирание нового
root. Старый binary после v3 switch нельзя просто включить на frozen v2 tables:
writer marker должен fail closed. Без проверенного обратного reader/writer
пути rollback означает inactive service и сохранение D1, не ложное обещание
автоматического downgrade. Схема только forward, data recovery отдельный gate.

## 7. Test/measurement matrix рекомендованного C

Это **будущие acceptance tests**, не результаты текущей docs-only сессии.
Existing harness расширяется реальным local Miniflare D1, injected deterministic
clock/fetch; HTTP paths при необходимости existing loopback Postman, pass-through
запрещён. Synthetic labels обязательны. Setup/migration/assertions вне workload.

| Cases | Acceptance / что измерять |
|---|---|
| Cold12/62,100/100,1,000incoming; no baseline | Старый/пустой root до finalize; полные independent roots после;0baseline candidates, approvalsNULL |
| Replay/cache/restart304, empty304/corrupt/expired cache | Нет новых material versions; valid scoped validators; invalid304 не даёт baseline; first detection сохраняется |
| Material update, same hash/new raw observation, A→B→A | Сохранены immutable evidence, next sequence и correction linkage; отсутствие extra version на replay |
| Stable99/100/101 и sliding1..100→2..101→3..102 | В C рост union101/102 не останавливается legacy stored cap, история/отсутствующие IDs сохранены; B/A legacy stop тест остаётся |
| Full Claude>4pages/100; status offers вне history; Codex101+scheduled | Полный C snapshot через chunks, правильные count/surface identity; no partial baseline |
| Preserved history1,000→10,000, history>10,000 | Keyset bounded reads/chunks; measurable rows/bytes/SQL; envelope overflow safe stop, old truth intact |
| Claude pagination changed revision/total/repeated cursor/expired cursor | Abort, old root и baseline unchanged; no fabricated completeness |
| Codex digest/generation variation/body>2MiB | Frozen single body only; oversize stops; no invented pagination/completeness |
| 429/Retry-After,503,timeout,invalid schema/unknown enums | Durable backoff после restart/takeover, no early fetch; unknown→review; other provider progresses |
| Overlap, lease takeover, stale fence, failure середины chunk | Один владелец; rolled-back chunk не двигает progress; idempotent retry; no duplicate audit/candidates |
| Crash before/after chunk и finalize, lost commit response, CAS loser | Atomic old/new visibility; read-back; no partial root, no mixed generation/read |
| Independent provider success/failure | Ни shared baseline, ни transaction обоих providers; NULL approvals, empty journals, zeroTelegram |
| Forward import/v3 activation/rollback/cleanup | Legacy rows/triggers intact; imported identity/hash/sequence preserved; v2 writer blocked после switch; abort audit preserved |
| Legacy retention | Сохранить existing103 real commits, generation103, retained4–103,100sync_runs,20s timeout; не ослаблять assertions |
| HTTP/config/logging/truth/ambiguous-send | Старые501/404/405, HEAD/OPTIONS, production/inactive guards, safe logs, no admin route; existing uncertain_manual_review и no lease retry сохраняются |

Каждый sample: scenario/data sizes, provider/phase, invocations до complete,
SQL members и D1execution calls, prepare/bind отдельно, failed/retry counts,
upstream requests, rows read/write с metadata coverage, body/SQL/bind bytes,
local elapsed/DBsize с оговоркой неCPU/remote. Суммировать **все invocations
manifest**, backfill и cleanup: не сравнивать один маленький chunk C с полным
cold B. Publish/candidate/approval/journal inspection — вне measurement.

Для B сравнить указанные четыре workloads до/после и semantic rows. Для C
измерить и worst single invocation, и total по полному snapshot при росте
истории, time-to-complete и aborted overhead. Не фиксировать выдуманный процент
ускорения или допустимый billedCPU из Miniflare. В будущем remote proof нужен
для batch accounting, actual CPU, rows, quotas и storage до выбора cadence.

## 8. Owner inputs и условное решение

Вопрос отправлен владельцу во время design; значений пока нет. Безопасные labels
вместо account/database IDs. Не запрашивать токены или Cloudflare login сейчас.

| Input | Известно / unknown | Для чего требуется |
|---|---|---|
| Account/profile label | unknown | Точный future target, исключить production |
| Workers plan/usage model/effective query/CPU/subrequest limits | unknown | Fit, accounting и стоимость; Paid не выбран |
| Shared quota headroom read/write/storage/requests/CPU | unknown | Учитывать другие apps и migration/telemetry |
| Staging name / region или jurisdiction | Предлагается reset-radar-staging-db, owner target/region unknown | Future isolated create gate; ID остаётся приватным |
| History growth / required retained horizon | Историю не удалять; объём/горизонт unknown | Выбрать C envelope/storage budget |
| Cadence/window | Product target5min; owner-approved remote scope unknown | Не считать288/day разрешением |
| Maximum spend / currency / period / plan-change permission | unknown | Нет числового cost budget; plan-change permission отсутствует |
| Stop SQL/calls, CPU, rows read/write, storage, retries/attempts, window/invocations | unknown | Hard/operational stops и запас на metrics delay/in-flight |
| Responsible operator / telemetry availability / shutdown latency reserve | unknown | Проверяемая остановка и quota headroom |

Design docs — готовы после checks/review. Local implementation — **не назначена**.
Remote active staging — **NO-GO**. Заполнение таблицы не является разрешением
remote operations. Owner выбирает A/B/C; рекомендация C не owner approval.

## 9. Ровно следующий предлагаемый gate: local C implementation

Ниже reviewable текст будущего assignment; **не исполнять по этому документу**:

> Принимаю вариант C из docs/38, включая необходимые групповые prepared writes
> внутри chunks, и отдельно разрешаю только локальную реализацию Stage6:
> additive v3 schema/read protocol, manifests, bounded collect/build chunks,
> fencing/CAS/finalization, local backfill и guards rollback по разделу6;
> regression и measurement matrix раздела7, независимое review, отчёт и STOP.
> Первая local test capacity: incoming≤1,000, preserved≤10,000/provider;
> larger/oversize/expired/over-budget остаётся safe stop, история не удаляется.
> Runtime opt-in только local/staging; supplied configs inactive, production
> и HTTP guards, dry_run, NULL approvals, empty journals сохраняются.
> Новые files/interfaces: src/storage/types.ts и d1.ts (либо отдельный
> snapshot repository), src/services/ingest.ts, src/services/scheduled.ts,
> provider adapters для resumable Claude и frozen Codex, tests/helpers/d1.ts,
> tests/helpers/d1-metrics.ts, stage4/6 tests и отдельные manifest tests,
> forward migration0003 после schema review, relevant docs.
> Сохранить legacy retention103/generation103/4–103/100/20s и все прежние
> truth/cache/backoff/ambiguous-send safeguards. Выполнить typecheck, lint,
> full unit/integration, test:d1, test:workload, local migrations и offline
> verify; opt-in HTTP simulation только loopback при затронутом transport.
> Приложить SQL/calls/rows/metadata и total-manifest measurement, migration/
> rollback evidence. Не обещать remoteCPU/cost. Config/dependency/CI/Postman
> изменения вне необходимости не входят; уточнение schema bounds должно
> оставаться reviewable локально, без remote. Commit/push/PR/merge, live reads,
> Cloudflare account/API/login, DB creation/migrations/deploy/bindings/secrets,
> Cron, Telegram, production и Stage7–11 не разрешены.

Это **один следующий local gate**, не просьба одновременно разрешить remote
цепочку. Если владелец вместо C выбирает B — отдельное local assignment только
раздела5+его tests, capacity NO-GO остаётся. Если выбирает A с выполненными
prerequisites — ближайший remote запрос только на isolated staging D1 create,
с безопасным target label/region и конкретным scope; migrations/deploy/reads
не включать. В текущем задании никакого из этих approvals не получено.

## 10. Фактические проверки и независимое review

Текущая сессия: diff-check PASS, Stage0 offline verify139PASS,111local links /
0broken, protected paths unchanged, arithmetic PASS. Application tests не
повторялись (docs-only); historical workload/preflight evidence сохранено.
Независимый `stage6_capacity_review` (reviewer, gpt-6.1-sol, high) завершён:
critical/high/medium findings нет, включая финальные complete-root/legacy
writer guards. Reviewer самостоятельно подтвердил те же checks и official
Cloudflare sources, файлов не менял. Итог и точный список файлов — в
[handoff](39_STAGE6_CAPACITY_HANDOFF.md). После review добавлены только эти
итоговые записи; docs checks повторены. Работа остановлена, не развёрнуто /
не опубликовано, implementation/remote/Stage7 не начаты.
