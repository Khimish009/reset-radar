# Stage 5 — local HTTP simulation evidence

Дата: 2026-10-22. Только synthetic fixtures и настоящий локальный Miniflare D1.
Client/publisher — исполняемый код проекта; Telegram stand-in — отдельный
Postman process. Внешний Telegram и upstream не вызывались.

В первом терминале из корня репозитория:

```sh
postman simulation run postman/simulations/telegram-local.sim.yaml --port 4903 --output ndjson --no-history > /tmp/reset-radar-stage5-simulation.ndjson 2> /tmp/reset-radar-stage5-simulation.err
```

Дождаться `listening` на 4903. Во втором терминале:

```sh
env TELEGRAM_SIMULATION_URL=http://127.0.0.1:4903/telegram npm test -- --run tests/stage5-telegram-simulation.test.ts
```

После проверки:

```sh
pkill -INT -f 'simulation run postman/simulations/telegram-local.sim.yaml'
```

Финальный opt-in test: **1 PASS**, exit 0, без unhandled errors. Процесс
simulation остановлен SIGINT, session exit 0. Sandbox сначала запретил loopback
listen (`EPERM`); повтор выполнен с разрешённым локальным доступом.

Тест проверил минимальный POST JSON, фиксированный synthetic token/chat ID,
отсутствие parse mode/новых capabilities, source attribution, redirect refusal,
`dry_run` zero HTTP/zero journal, replay suppression и сохранение результата D1.

| Synthetic сценарий | HTTP попыток | Сохранённое состояние |
|---|---:|---|
| success + replay | 1 | `simulated_sent`, replay blocked |
| 429, вызов до retryAt, затем success | 2 | persisted retryAt, затем `simulated_sent` |
| 403 refusal | 1 | `rejected` |
| migration hint | 1 | `rejected`, destination не меняется |
| JSON 500 | 1 | `uncertain_manual_review` |
| HTML 500 | 1 | `uncertain_manual_review` |
| malformed HTTP 200 success | 1 | `uncertain_manual_review` |
| hanging response body | 1 | `uncertain_manual_review` |
| socket disconnect | 1 | `uncertain_manual_review` |
| success, затем ошибка completion D1 | 1 | durable `claimed`, `persistence_uncertain`, повтор blocked |

Итого **11 sendMessage attempts**, подтверждённых одновременно caller assertions
и серверным receipt-журналом mock (`/__synthetic_requests`). Этот diagnostic GET
существует только в локальном mock, не в Worker или Telegram client. Receipt
журнал содержит method/mode, без текста сообщения; ограничен 1000 записями.
Сделаны два diagnostic GET для сравнения receipt до/после теста.

Финальный Postman NDJSON: `listening=1`, `request=11`: 9 завершённых sendMessage
и 2 diagnostic GET. Статусы: 200×6, 429×1, 403×1, 400×1, 500×2. Две из 11 попыток
sendMessage (hang/disconnect) не имеют завершённого Postman request event;
их получение отдельно подтверждено mock receipt и проверками теста.
Raw log не добавлен в Git; временные logs по путям выше содержат только
synthetic traffic. Это не доказательство live delivery.

Первый HTTP прогон обнаружил unhandled rejection у `reader.cancel()` на abort.
Исправление перехватывает asynchronous cancellation errors; добавлен отдельный
unit regression. Повтор HTTP test завершился exit 0. После добавления receipt
instrumentation simulation была перезапущена; таблица и счётчики выше относятся
к последнему прогону, а не сумме всех предварительных запусков.

Mock основан на первичном Telegram контракте, см.
[contract reference](telegram-contract.md). Proxy/pass-through отсутствует;
неописанные операции дают 501. Postman workspace не создавался/не привязывался,
mock/simulation не push/deploy. Owner-mock discovery пропущен из-за отсутствия
CLI sign-in; новый login или credential не требовались.

PR #5 review follow-up, 2026-10-22: тот же opt-in HTTP+D1 сценарий повторён с
исправленными client/templates/publisher и новым explicit event-age policy.
Результат **1 PASS**, прежние 11 send receipts и 11 completed Postman events
(9 sends + 2 diagnostic GET). Процесс остановлен. Зависший именно underlying
cancel hook дополнительно проверен unit ReadableStream fixtures: настоящий
HTTP hang не доказывает поведение произвольного stream cancel implementation.
