# Измерение repository B — synthetic local evidence

База `25b6851`; незакоммиченный local change set. Pinned версии и SHA-256 файлов — [context.json](context.json). [Before](before.json), [after](after.json), [первый запуск исходного harness](before-original.json). Исторические artifacts не перезаписаны.

Baseline original: 8/8 PASS, 9.56s. Расширенный одинаковый harness с C100 restart, future bootstrap/partial и durable digest: before 10/10 PASS, 14.70s; after 10/10 PASS, 8.49s. Это один sample каждого сценария, не benchmark percentile/SLA. Setup/migrations/inspections исключены; четыре first()-SELECT без metadata в каждом invocation.

| Сценарий | SQL до→после | D1 execution calls до→после | Rows read* до→после | Rows written до→после | Handler ms до→после |
|---|---:|---:|---:|---:|---:|
| cold-small-C12-X62 | 249→52 | 12→12 | 395→198 | 1134→1001 | 432.1→185.1 |
| cached-repeat-same-instance-C12-X62 | 175→42 | 12→12 | 641→572 | 315→246 | 224.5→118.5 |
| restart-seed-C12-X62 | 249→52 | 12→12 | 395→198 | 1134→1001 | 331.9→162.5 |
| persistent-restart-304-C12-X62 | 175→42 | 12→12 | 641→572 | 315→246 | 302.8→176.0 |
| restart-seed-C100-X100 | 630→98 | 12→12 | 1031→497 | 3030→2670 | 784.6→340.4 |
| persistent-restart-304-C100-X100 | 430→72 | 12→12 | 1658→1472 | 822→636 | 910.8→269.7 |
| fresh-future-complete-bootstrap | 249→52 | 12→12 | 395→198 | 1134→1001 | 443.6→147.4 |
| fresh-future-partial-history-gap | 215→46 | 11→11 | 458→180 | 960→848 | 438.1→144.3 |
| material-update-seed-C12-X62 | 249→52 | 12→12 | 395→198 | 1134→1001 | 432.9→151.3 |
| material-update-C12-X62 | 176→43 | 12→12 | 644→575 | 324→255 | 357.5→114.3 |
| partial-four-page-C100-X62 | 215→46 | 11→11 | 458→180 | 960→848 | 370.3→142.0 |
| 429-C12-X62 | 153→38 | 11→11 | 610→494 | 270→212 | 257.7→125.9 |
| retry-after-backoff-C12-X62 | 153→38 | 11→11 | 616→500 | 270→212 | 214.8→134.7 |
| near-capacity-C99-X99 | 624→98 | 12→12 | 1021→493 | 3000→2644 | 939.1→309.0 |
| near-capacity-cached-C99-X99 | 426→72 | 12→12 | 1642→1458 | 814→630 | 583.5→257.5 |
| near-capacity-C100-X100 | 630→98 | 12→12 | 1031→497 | 3030→2670 | 997.4→318.7 |
| near-capacity-cached-C100-X100 | 430→72 | 12→12 | 1658→1472 | 822→636 | 541.4→209.9 |
| capacity-100-each-baseline | 630→98 | 12→12 | 1031→497 | 3030→2670 | 856.1→249.2 |
| capacity-shifted-window-stores-union101-each | 432→74 | 12→12 | 1660→1474 | 844→658 | 830.4→204.1 |
| stored-history-101-each-preserved-no-network | 28→22 | 10→10 | 466→466 | 22→22 | 48.5→57.5 |

*Rows read — lower bound, не upper quota budget. Prepare/bind отдельно в JSON. Каждый batch member — SQL; execution calls — batch+all+first+run+raw+exec. Provider batch не объединяет providers в одну транзакцию.

Все 20 durableStateSha256 совпали до/после. Digest включает event facts/payload/clocks, observations/versions, candidates, source state, provider activation, sync runs, guards и оба journals. Исключены только surrogate observation_id/version_id/run_id; order нормализован по domain identity. Проверка через original binding после снятия counters/elapsed не входит в measurement.

SQL/bind/input bytes и per-statement maxima доступны в JSON. `batchEstimatedInputBytes` = UTF-8 SQL + bind value sizes без transport framing; runtime guard дополнительно считает 16 bytes/bind и ограничивает 2,000,000 bytes. Это консервативная локальная граница statement/row, не доказательство remote wire/request size для всего batch. Max SQL guard 100,000 bytes, max binds100. Grouping source UPSERT объясняет результат ниже прежних оценок55/104 SQL.

Local rows_written действительно снизились, хотя durable semantic rows совпали: SQLite/D1 counters включают работу индексов/служебных записей; grouping меняет local accounting overhead (включая AUTOINCREMENT). Это не гарантия такого же remote снижения или Free-fit. Canonical/source freshness writes сохранены.

Local wall time не billed Worker CPU; comparison использует отдельный temporary baseline root и основной checkout, оба через тот же pinned node_modules и loopback Miniflare. Один прогон, порядок/нагрузка не контролируются как benchmark. Local size_after включает schema/index/cache; это не remote storage или forecast.

Полный C100 feed1..100→2..101 сохраняет union101/provider; следующий fetch блокируется stored_record_limit, все202events/versions/observations сохранены. C не реализован. Partial history не сохраняет canonical fresh announcement и не завершает baseline: known product gap. В scheduled без assessment сохраняется needs_review. Injected source-visible time не доказывает p95; source coverage и source-relative latency для реального API unknown.

## Команды

В repository и временной baseline копии выполнено:

```sh
env STAGE6_WORKLOAD_OUTPUT=/tmp/stage6-b-before.json npm run test:workload
# expanded baseline, cwd=/tmp/reset-radar-b-before-ag02qraa:
env STAGE6_WORKLOAD_OUTPUT=/tmp/stage6-b-before-semantic.json npm run test:workload
# after, cwd=repository:
env STAGE6_WORKLOAD_OUTPUT=/tmp/stage6-b-after-semantic.json npm run test:workload
python3 docs/evidence/stage6-repository-b-2026-10-22/verify.py
```

Baseline root создан без изменения рабочего дерева: tracked HEAD src/migrations извлечены через git ls-tree/git show; tests, fixtures, config/package files скопированы локально; node_modules — symlink на установленные pinned dependencies. Перед финальным before-run скопирован окончательный stage6-workload.test.ts; metrics helper одинаковый. context.json закрепляет digest измеряемого repository/harness/fixtures/config. Storage regression tests в temp не запускались.

Initial sandbox original workload и Postman start получили EPERM на loopback; разрешённые повторы прошли. Ни mocks вместо D1 SQL, ни live HTTP fallback не использовались.

**Не развёрнуто / не опубликовано. Remote staging E2E pending.**

## Подробные binding/byte/size counters

| Scenario | Prepare/bind до→после | SQL bytes до→после | Bind bytes до→после | Input bytes до→после | Local size_after до→после |
|---|---:|---:|---:|---:|---:|
| cold-small-C12-X62 | 249/249→52/52 | 105921→28432 | 463147→463147 | 569068→491579 | 802816→802816 |
| cached-repeat-same-instance-C12-X62 | 175/175→42/42 | 84757→22054 | 322484→322484 | 407241→344538 | 802816→802816 |
| near-capacity-C100-X100 | 630/630→98/98 | 278844→69864 | 1326566→1326566 | 1605410→1396430 | 2277376→2277376 |
| near-capacity-cached-C100-X100 | 430/430→72/72 | 221644→52810 | 932670→932670 | 1154314→985480 | 2277376→2277376 |

Bytes относятся к batch; bind payload повторяется для event/observation/version, grouping не удаляет значения. Calibration2SQL+first1SQL даёт3SQL/2execution calls. Полные per-statement maxima, metadata coverage, failed execution counts и elapsed binding intervals — в JSON.
