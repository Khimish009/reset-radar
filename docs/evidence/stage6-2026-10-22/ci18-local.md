# CI #18 cache-validation test — local diagnosis

Дата проверки: **2026-10-22**. Node `v22.22.2`, npm `10.9.7`, Vitest `5.0.5`.
Все D1 сценарии используют настоящий Miniflare/workerd D1 и локальные migrations;
upstream заменён синтетическим fetch plan. Сеть к upstream/Telegram и remote
Cloudflare не использовались.

## До изменения

Историческое наблюдение CI #18: единый cache-validation test превысил свой
5,000ms budget на 18ms (5,018ms); общий test run занял 40.80s. Это подтверждает
узкое превышение в том CI запуске. Причина по сохранённому CI log не установлена.

Команды локальной исходной проверки:

```sh
npx vitest run tests/stage4-ingest.test.ts -t 'does not send validators for corrupt, expired, or representation-free cache; unsolicited 304 cannot complete baseline'
npm test
```

После разрешения локального loopback targeted test прошёл: 1 passed, Vitest
duration **1.96s**. Обычный параллельный полный запуск прошёл: **311 passed,
5 skipped**, Vitest duration **11.35s**. Следовательно, timeout локально не
воспроизведён; это не доказывает отсутствие runner/resource contention в CI.

## Временные измерения этапов

Для отделения D1 setup от ingestion временно добавлялись таймеры с префиксом
`[DEBUG-ci18]` только в `tests/stage4-ingest.test.ts`; затем instrumentation
удалена. Реальные prepared statements, ingestion и migrations не заменялись.
Команда:

```sh
npx vitest run tests/stage4-ingest.test.ts -t 'does not send validators for corrupt, expired, or representation-free cache; unsolicited 304 cannot complete baseline' --disableConsoleIntercept
```

| Сценарий | Miniflare + binding + migrations | Seed ingestion | Повреждение cache | 304 ingestion + assertions | Сумма этапов |
|---|---:|---:|---:|---:|---:|
| corrupt | 200.8ms | 43.6ms | 4.6ms | 26.9ms | 276.4ms |
| expired | 153.5ms | 36.5ms | 3.6ms | 24.6ms | 218.3ms |
| missing snapshot | 160.9ms | 34.2ms | 3.7ms | 27.1ms | 226.1ms |
| empty D1 / unsolicited 304 | 160.2ms | — | — | 27.4ms | 187.6ms |

Сумма стадий измеряется от создания отдельного Miniflare runtime до завершения
каждого самостоятельного сценария. Эти локальные измерения показывают, что
измеренный D1 setup и операции в этой среде составили примерно 0.19–0.28s на
сценарий. Они не воспроизводят условия CI runner и не позволяют приписать
исторические 5,018ms только Miniflare, тестовому коду или runner.

## Локальное изменение и повторная проверка

Три самостоятельных случая (`corrupt`, `expired`, `missing snapshot`) стали
параметризованными test cases с отдельными Vitest lifecycle/timeout budget; D1
создаётся и мигрируется заново для каждого случая, после каждого выполняется
cleanup через существующий `afterEach`. Сохранены seeded completed baseline,
реальные cache mutations, отсутствие `If-None-Match`, unsolicited `304`,
`not_modified_without_snapshot` и сохранение ранее завершённого baseline.
Пустой D1 вынесен в отдельный case; он дополнительно проверяет
`baselineCompletedAt: null` после unsolicited `304`. Timeout/parallelism и
retention test не менялись.

Финальные команды и результаты:

```sh
npx vitest run tests/stage4-ingest.test.ts -t 'does not send validators for|does not complete a baseline from an unsolicited 304'
npm test
npm run lint
```

- Targeted cases: **4 passed**, 16 skipped, Vitest duration **1.85s**.
- Полный параллельный набор: **314 passed, 5 skipped**, Vitest duration **11.18s**.
- ESLint: PASS.

Временные таймеры удалены (`rg 'DEBUG-ci18' tests/stage4-ingest.test.ts` не
находит совпадений). Полный локальный запуск и targeted проверка прошли после
разделения сценариев. Локальный результат повышает изоляцию отказа: каждый
сценарий получает отдельный стандартный Vitest budget. Он не устанавливает
причину CI #18 и не заменяет workflow rerun; удалённый CI не запускался.

**Не развёрнуто / не опубликовано.**
