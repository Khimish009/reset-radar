# 03 — D1 schema, журнал и жизненный цикл состояния

**Stage 4: локальная реализация.** SQL в `migrations/0001_stage4.sql` и код `src/storage/` описывают текущую локальную схему. Это не production migration, публичная проекция или утверждение окончательной production policy.

## Таблицы и границы данных

| Таблица | Назначение и ограничения |
|---|---|
| `provider_activation` | Одна строка для `claude` и `codex`: поколение для compare-and-swap (CAS), время полного baseline, отдельное поле разрешения публикации (изначально `NULL`) и последняя попытка/успех/статус. Состояния provider независимы. |
| `events` | Текущее каноническое представление; `UNIQUE(provider, upstream, external_id)`, action и provider ограничены `CHECK`, payload проверяется через `json_valid`. Времена первого обнаружения, последнего наблюдения и текущего содержимого разделены. Идентичность upstream неизменяема. |
| `observations` | Неизменяемые наблюдения raw-записи и content-bound assessment; `UNIQUE(event_id, observation_key)`. Триггеры запрещают `UPDATE` и `DELETE`. |
| `event_versions` | Неизменяемые материальные версии с возрастающим sequence, transition ID, hash, raw/assessment revision и payload; уникальность версии для event и transition. Повтор A после B создаёт новую версию A с новым sequence. |
| `publication_candidates` | Локальные кандидаты для дальнейшей оценки, связанные с version. Первый baseline не создаёт кандидатов; наличие кандидата само по себе не разрешает публикацию. |
| `source_state` | HTTP representation/validator и backoff по паре `(provider, endpoint_key)`. Снимок хранится вместе с ETag и метаданными области; transport-wide backoff имеет отдельный `$transport` ключ. |
| `sync_runs` | Ограниченный журнал попыток: максимум 100 строк на provider; хранит поколение, результат, критерий полного snapshot и счётчики, но не заменяет canonical events. |
| `synthetic_deliveries` | Локальный журнал проверки claim/state machine с уникальностью `(event_id, transition_id, destination)`. Destination обязан начинаться с `synthetic:`; реального Telegram-клиента здесь нет. |
| `commit_guards` | Внутренняя таблица для CAS-проверки внутри атомарного D1 batch; это не event truth и не публичные данные. |

Индексы обслуживают provider/date и provider/action/date выборки, версии события, кандидатов и состояния доставки. Foreign keys связывают версии и synthetic claims с событием/transition. Внутренние payload и журнал не являются будущим публичным API-контрактом; публичная проекция потребует отдельного allowlist.

## Смысл идентичности, версии и времени

Ключ события namespaced: provider + upstream + source identity. Claude использует `Claude Resets` и raw event ID; Codex — только `codexreset.ai`, а внутренний `external_id` кодирует JSON tuple `[event|scheduled, raw ID|URL]`. Поэтому допустимое совпадение event ID и scheduled URL не смешивает события. Точный upstream ID/URL остаётся в `record.provenance.externalId` и raw facts. Другой Codex-архив не является fallback и не объединяется с выбранным feed.

Normalization отдельно сохраняет upstream revision (только там, где он есть), raw assessment key и наш material hash. Assessment привязан к digest всей raw записи. Material hash строится из канонической проекции значимых raw facts, действия, scope/audience, precision/expected time и принятого evidence. Порядок JSON-ключей и сама по себе смена ETag, `generated_at`, check time или display text не создают материальный переход. Upstream revision и текст причины correction сохраняются для аудита, но сами по себе не меняют hash. Новый hash получает неизменяемую версию и sequence; одинаковый текущий hash только обновляет наблюдение. Вернувшееся прежнее содержимое после другой версии — новый переход, а не возврат к старому sequence.

Хранятся отдельные first detection, last observation, announcement/expected time, upstream-reported delivery и verified delivery. Неизвестная дата/время остаётся `unknown`; дата не превращается в полночь, а `ts` Codex не становится временем доставки. `detectedAt` сохраняется при повторном чтении той же raw записи и том же D1. Изменение raw/assessment может добавить observation и, если меняется material projection, новую материальную версию; первоначальное обнаружение не переписывается.

Для Claude корректировки проходят через сохранённую более раннюю версию того же upstream ID и требуют assessment со ссылкой на конкретный предыдущий transition. Без наблюдаемой версии действие остаётся на review. Для Codex корреляция announcement/delivery и correction пока не определена: эвристическое объединение по времени или тексту запрещено, неоднозначные записи остаются отдельными.

Действия остаются `announced_future`, `confirmed_applied`, `banked_offer`, `correction`, `withdrawal`, `needs_review`. Достоверный ранний анонс — отдельный локальный candidate до фактической доставки; подтверждение доставки может стать следующей материальной версией. Candidate не означает production eligibility или разрешение публикации. `delivered_at=null`, `kind=regular`, прошедшее время либо сам факт HTTP-ответа не подтверждают применение. Для Claude и Codex требуется отдельный локальный assessment, привязанный к raw-content key, с rationale и primary evidence. Для offer проверяется текущая assertion и evidence offer. Неизвестные значения и конфликты остаются review. Seeded/archive credit сохраняется, но архивный факт не становится кандидатом публикации.

`src/providers/*/mapping.ts` остаются provider-specific mapping-слоем. Shared normalization применяет общую durable-модель, но сохраняет различия источников: Claude assessment, revision и correction link; Codex отсутствие выдуманной revision и отдельные event/scheduled записи.

Консервативное локальное правило времени: если проверенный exact/date future target
уже наступил без нового delivery evidence, повторный mapping оставляет текущее
состояние `needs_review`, не `confirmed_applied` или withdrawal. Это может создать
переход `announced_future → needs_review` без изменения raw; прежняя версия и её
evidence сохраняются в immutable истории, новый publication candidate не создаётся.
Production staleness/eligibility policy этим не утверждается.

## Источник и восстанавливаемый HTTP cache

Cache entry индексирован provider + endpoint/query. Перед использованием сохранённый representation сверяется по version, provider, canonical endpoint key, SHA-256 digest и повторно проходит provider schema parser. Для Claude endpoint key включает canonical query, для Codex — URL feed. Validator восстанавливается только вместе с валидным representation соответствующей области; повреждённый, неверной схемы или просроченный snapshot не даёт права использовать ETag для `304`.

Хранится не более 128 endpoint representations на provider, с TTL 24 часа от успешного получения. После TTL representation и validator непригодны для восстановления. Backoff и счётчики ошибок остаются provider/endpoint scoped; состояние transport throttle хранится отдельно. Ошибка источника не удаляет events и не мешает независимой обработке второго provider. Отсутствующая строка в новом snapshot не означает withdrawal и не удаляет ранее сохранённое событие. Это ограниченный технический cache, а не долговременное зеркало полных редакционных summary; durable история сохраняет необходимые факты, provenance, hash и audit transitions.

## Полнота и baseline

Codex `codexreset.ai` сейчас задаёт непагинируемый feed. Успешный parse этого контракта принимается как полный snapshot — локальное допущение о полноте непагинируемого feed, а не независимая гарантия upstream.

Для Claude одного успешного history недостаточно. Полным локально считается только сочетание полной пагинированной counted history и status с тем же `content_revision`, audience=`all`, window=`any`, одинаковыми записями при пересечении ID и `history.events.length === status.stats.total`. В status union включаются latest reset, latest ambiguous, объявленный reset и reset offers. Конфликтующая, устаревшая или неполная выборка не завершает baseline. Это реализованный критерий согласованности клиента, а не доказательство, что upstream не пропустил данные.

Первая успешная полная фиксация provider устанавливает его baseline атомарно с наблюдениями и source state и создаёт **ноль publication candidates**, даже для недавно датированных строк. Повторный baseline идемпотентен. Первый baseline Claude не завершает Codex и наоборот. `publish_approved_at` остаётся `NULL`; production approval не выводится из тестов или импорта.

## Атомарность D1 и compare-and-swap

`commitSnapshot` строит набор prepared statements и отправляет его одним `D1.batch()`. Перед записью service читает generation, а batch содержит CAS guard и условное обновление provider generation. Все statements D1 batch выполняет последовательно в транзакционной границе; ошибка statement откатывает batch. Поэтому события/версии, observations, источник, sync run, baseline и поколение не должны фиксироваться только частично. Если параллельный запуск уже изменил generation, guard/CAS блокирует проигравший snapshot; его результат не считается commit. Это не общий SQLite `BEGIN` в коде сервиса, а граница, документированная для D1 batch.

Пользовательские значения передаются только через `prepare(...).bind(...)`. Это сохраняет параметры отдельно от SQL и уменьшает риск SQL injection; имена таблиц/колонок остаются статическими. D1 `batch()` гарантирует последовательное исполнение и rollback всего списка при ошибке согласно [документации D1 Database](https://developers.cloudflare.com/d1/worker-api/d1-database/). Binding подготовленных запросов документирован в разделе [Prepared statements](https://developers.cloudflare.com/d1/worker-api/prepared-statements/).

Локальная интеграция использует закреплённый `miniflare@5.20261019.1-beta`, того же major/runtime поколения, что и установленный Wrangler, с `convertV4MiniflareOptions`. Harness загружает миграцию через `unstable_splitSqlQuery` из закреплённого Wrangler и выполняет её на настоящем локальном workerd D1 binding. SQL-вызовы не заменены mock-объектом. Тестовая конфигурация `wrangler.d1.local.json` содержит только local-only binding, выключенный Cron и `PUBLISH_MODE=dry_run`.

## Synthetic delivery journal

Уникальный claim ограничен event + immutable transition + synthetic destination. Атомарный insert допускает начальный claim; повтор допускается только после явного `retryable`. `sent` требует synthetic message ID, `rejected` сохраняет отказ, а `uncertain_manual_review` фиксирует неоднозначный исход. Неоднозначный исход терминален для автоматического пути: автоматического retry и восстановления claim по lease после падения нет; нужна ручная проверка. Повторный claim не означает exactly-once доставку. Реальные Telegram destinations, client, `sendMessage`, publish mode и send операции находятся за границами Stage 4.

## Текущие пределы и нерешённые решения

- В Worker `scheduled()`/`fetch()` ingestion не подключён; Stage 4 service вызывается локально с контролируемыми зависимостями.
- HTTP public API, website, production freshness threshold и production publication eligibility здесь не определены.
- Полнота Codex feed остаётся локальным контрактным допущением; Claude критерий проверяет согласованность поверхностей, а не официальную полноту истории.
- Production assessment workflow, корреляция Codex correction/delivery, retention policy за пределами ограниченного HTTP cache, publication activation и реальные delivery outcomes требуют отдельных решений владельца.

**Stage 4 локально; не развёрнуто / не опубликовано.**
