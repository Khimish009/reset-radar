# Cloudflare limits — локальный Stage 6 preflight

Проверено **2026-10-22** по official Cloudflare documentation. Cloudflare account,
plan, остаток общих квот и допустимая стоимость владельца **не проверены и не
предполагаются**. Ни account API, ни upstream feeds не вызывались.

## Условное сравнение планов

| Ограничение | Workers Free | Workers Paid | Primary reference |
|---|---|---|---|
| D1 queries / Worker invocation | 50 | 1,000 | [D1 limits](https://developers.cloudflare.com/d1/platform/limits/) |
| D1 database / account storage | 500 MB / 5 GB | 10 GB / 1 TB | [D1 limits](https://developers.cloudflare.com/d1/platform/limits/) |
| D1 daily rows read / written | 5,000,000 / 100,000 | Monthly allowances and usage billing | [D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/) |
| CPU / Cron invocation, five-minute cadence | 10 ms | 30 seconds | [Workers limits](https://developers.cloudflare.com/workers/platform/limits/#cpu-time) |
| Cron wall duration | 15 minutes | 15 minutes | [Workers limits](https://developers.cloudflare.com/workers/platform/limits/#duration) |
| External subrequests / invocation | 50 | Default 10,000, configurable | [Workers limits](https://developers.cloudflare.com/workers/platform/limits/#subrequests) |
| Internal service subrequests / invocation | 1,000 | Matches configured limit, default 10,000 | [Workers limits](https://developers.cloudflare.com/workers/platform/limits/#subrequests) |

Это опубликованные лимиты, не выбранный тариф и не разрешение расходов. Free
daily row limits enforced: после превышения D1 запросы могут отказывать до
сброса квоты. Индексы тоже увеличивают rows written; rows returned не равны
rows scanned. Paid не включался и не предлагается как исправление.
[Источник billing semantics](https://developers.cloudflare.com/d1/platform/pricing/).

## SQL statements, binding calls и неопределённость enforcement

D1 limits называет 50/1,000 именно queries/invocation и отсылает к subrequest
limits. Workers limits одновременно описывает другие internal-service caps.
`batch()` передаёт несколько statements в одном запросе, выполняет их
последовательно в транзакции и возвращает отдельный result для каждого.
Один binding batch поэтому **не считается одним SQL statement** в нашем harness.
Правила длины SQL и параметров применяются к каждому statement; 30-second D1
request limit относится и ко всему batch.
[D1 limits](https://developers.cloudflare.com/d1/platform/limits/),
[D1 batch API](https://developers.cloudflare.com/d1/worker-api/d1-database/#batch).

Эти страницы не позволяют однозначно приравнять наш счётчик SQL statements к
enforced subrequest count batch. В отчёте нужно сравнивать обе величины и
считать SQL>50 консервативным сигналом риска для Free, а не доказанным remote
отказом. Нельзя объявить Free-ready только потому, что binding calls<50.
Разрешённое remote наблюдение должно установить действующий лимит конкретного
account/plan, query/subrequest accounting, retries и фактическое потребление.

## Что означает локальная metadata

D1 result сообщает `meta.rows_read`, `rows_written`, `duration`, `size_after`;
duration описывает SQL execution, а не network wait или Worker CPU. `first()`
возвращает row/column/null без result metadata. Локальные суммы должны явно
указывать покрытие: отсутствие metadata не означает нулевую стоимость запроса.
`size_after` — размер всего DB после statement, не прирост размера события.
[D1 return objects](https://developers.cloudflare.com/d1/worker-api/return-object/),
[Prepared statements](https://developers.cloudflare.com/d1/worker-api/prepared-statements/).

CPU исключает ожидание I/O. Elapsed time Node + Miniflare, сумма local SQL
duration и время миграций не заменяют billed Worker CPU, remote latency,
account usage или remote storage growth.
[Workers CPU semantics](https://developers.cloudflare.com/workers/platform/limits/#cpu-time).

## Cron и pinned Wrangler

Запуск каждые пять минут означает плановые 288 invocations/day, 8,640/30 days.
Это арифметическая модель, без overlap/retry/прочих приложений account. Cron
выключен во всех supplied configs. Для удаления удалённых триггеров требуется
явное `triggers.crons: []`: omission оставляет существующие триггеры.
[Official Cron configuration](https://developers.cloudflare.com/workers/configuration/cron-triggers/#via-the-wrangler-configuration-file).

Закреплён и установлен Wrangler **4.151.3**; локально прочитаны `--version`,
`d1 create --help`, `d1 migrations apply --help`, `deploy --help`.
`create` — remote resource operation; migration имеет отдельные `--local` и
`--remote`; `deploy --strict` не проверяет безопасность выбранного target.
Команды с этими remote действиями не выполнялись. При `--version` получен
нефатальный sandbox warning о default log directory; остальные help-команды
завершились успешно. Dependencies/lockfile не менялись.

## Решение до remote

Без account/plan, target, свободных общих квот, written stop budget, query
accounting и CPU evidence — **NO-GO для активного staging/Cron**. Нужны отдельные
owner decisions; шаблон и порядок находятся в [runbook](../../07_DEPLOYMENT_RUNBOOK.md).
Локальные метрики служат preflight evidence, не stable-staging acceptance.
