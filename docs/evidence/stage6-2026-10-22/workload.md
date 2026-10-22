# D1 workload — synthetic local Stage 6

**2026-10-22**, base `22ebefe`, незакоммиченный preflight change set.
Node22.22.2 / Wrangler4.151.3 / Miniflare5.20261019.1-beta / Vitest5.0.5.
[Machine-readable sample](workload.json) сохранён после **8/8 PASS**, Vitest
8.43s. Setup/migrations, calibration и assertions не входят в handler samples.
Формат fixtures synthetic; archived counts C12/X62 — только dated observations
2026-10-21, **current live volume not measured**.

Воспроизведение из repository root:

```sh
STAGE6_WORKLOAD_OUTPUT=/tmp/reset-radar-stage6-workload.json npm run test:workload
```

Фактически агент выполнил эквивалентную команду до добавления npm shortcut:

```sh
STAGE6_WORKLOAD_OUTPUT=/tmp/reset-radar-stage6-workload.json npx vitest run tests/stage6-workload.test.ts
npm run typecheck
npm run lint
```

Все три завершились exit0 на финальном harness. Первая sandbox попытка не
смогла открыть Miniflare loopback (`EPERM`); разрешённый повтор прошёл.
Промежуточные ошибки assertions при разработке: сравнение volatile D1 result
metadata вместо `.results`, затем неверное ожидание rows scanned=101 при join,
который фактически сканирует также версии. Сами SQL/mock transport не менялись.
Финальные assertions сравнивают rows и учитывают обе стороны join.

## Сумма за один scheduled invocation, оба providers

Execution calls — сумма `batch + all + first + run + raw + exec`, без
`prepare/bind`. Каждый batch member считается отдельным SQL. Network ниже —
вызовы injected fixture fetch; настоящих upstream HTTP requests нет.

| Scenario | C / X incoming | SQL | D1 exec calls | Fixture fetches | Rows read* | Rows written* |
|---|---|---:|---:|---:|---:|---:|
| Cold baseline | 12 / 62 | 249 | 12 | 3 | 395 | 1,134 |
| Cached repeat, +30s | 12 / 62 | 175 | 12 | 0 | 641 | 315 |
| Restart D1, +301s, 304 | 12 / 62 | 175 | 12 | 3 | 641 | 315 |
| Material update Claude | 12 / 62 | 176 | 12 | 3 | 644 | 324 |
| Partial four-page walk | 100 / 62 | 215 | 11 | 6 | 458 | 960 |
| Claude429, Codex success | 12 / 62 | 153 | 11 | 3 | 610 | 270 |
| Retry-After/cache, +30s | 12 / 62 | 153 | 11 | 0 | 616 | 270 |
| Cold near-capacity | 99 / 99 | 624 | 12 | 6 | 1,021 | 3,000 |
| Cached near-capacity | 99 / 99 | 426 | 12 | 0 | 1,642 | 814 |
| Cold full-capacity | 100 / 100 | 630 | 12 | 6 | 1,031 | 3,030 |
| Cached full-capacity | 100 / 100 | 430 | 12 | 0 | 1,658 | 822 |
| Shift window IDs2..101 | 100 / 100 | 432 | 12 | 6 | 1,660 | 844 |
| Stored101/provider | 0 / 0 (blocked before fetch) | 28 | 10 | 0 | 466 | 22 |

*Metadata доступна не для всех SQL. В каждом invocation четыре `first()` SELECT
без metadata; rows read — нижняя граница. В этом пути все modifying SQL находятся
в batch и дают metadata, поэтому таблица включает все observed modifying
statements. Это всё равно **локальная** metadata, не фактический remote bill.
Пример cold: 245 metadata results +4 unavailable из249 SQL; cached:171+4 из175.
Calibration отдельно подтвердила batch2SQL+first1SQL =3SQL и2 execution calls.
В JSON сохранены также prepare/bind, batch SQL/input byte estimates, успешные
и failed execution counts (в финальных samples failures отсутствуют).

Полный C100/X100 cold batch содержит 620 SQL members; cached —420; outer D1
execution count остаётся12. Это два отдельных provider commits, не одна
транзакция обоих providers. Approximate bytes — сумма UTF-8 SQL и bind values,
не размер wire request и не memory/CPU estimate.

## Capacity, сохранённые факты и локальный storage

Baseline IDs1..100 → полный feed IDs2..101 сохраняет union101/provider.
Следующий scheduled invocation не вызывает fixture fetch, отмечает incomplete
health и сохраняет **202 events, 202 versions, 202 observations**, source rows
и времена completed baselines. Approvals NULL, оба send journals пусты.
Ни missing record, ни limit не создают withdrawal и не удаляют историю.

На этом stored-limit invocation максимальный один `rows_read` result =202:
bounded SELECT возвращает101 canonical records, но join читает также101
matching versions. Общий read counter не равен числу возвращённых events.
Размер DB по `size_after` в sample: cold C12/X62 **802,816 bytes**,
C100/X100 **2,277,376 bytes**, после union101 **2,297,856 bytes**; это локальный
DB вместе с schema/indexes/cache, не remote size или долгосрочный growth forecast.

Partial history не завершает Claude baseline; Codex продолжает независимо.
429/backoff не создают baseline и не вызывают лишний fixture fetch. Cache/304
сохраняют immutable version counts, но **не обнуляют writes**: существующие
canonical/source/health rows всё ещё обновляются.

## Условная дневная модель, не прогноз стоимости

При 288 одинаковых invocations/day без других apps/account usage:

- C12/X62 steady cache/304: **315×288=90,720 local rows written/day**, всего
  9,280 до опубликованной Free daily allowance100,000, ещё без bootstrap,
  material updates, миграций и прочей нагрузки. GO из этого не следует.
- C100/X100 cached: **822×288=236,736 local rows written/day** — выше той
  allowance. Даже сохранение такого количества записей не доказывает Free-fit.
- Cold baseline нельзя умножать на288 как steady workload. Отдельно сохраняются
  cold, replay, errors/backoff и capacity samples; дневная модель должна
  учитывать выбранный cadence, перемены payloads, overlap и реальные метрики.

Published Free D1 query cap50/Paid1000 сопоставляем с249/630SQL и12calls **условно**:
batch request accounting не доказывается SQL счётчиком. Workers internal
subrequest docs отдельно описывают иные caps. [Official comparison и caveats](cloudflare-preflight.md).
Paid не выбран и не включался; CPU, effective query accounting и owner cost
budget остаются unresolved. Handler wall time и сумма SQL duration не billed
Worker CPU. Локальная metadata duration имела миллисекундную гранулярность.

**NO-GO для активного remote staging.** Capacity варианты — ADR-042; отдельный
owner scope нужен до нового bootstrap protocol. **Не развёрнуто / не опубликовано.**
