# 04 — Внешние API: проверенные контракты Stage 0

Проверка **2026-10-21, UTC**. Все три трекера — независимые community sources, не официальные API аккаунтов Anthropic/OpenAI. Публичное чтение не требует ключей или cookies пользователей.

Исследование Stage 0 выполнено; принятие результатов владельцем **ожидается**. GO здесь означает техническую пригодность с оговорками, а не разрешение реализации или публикации. Журнал HTTP: [11_SOURCES.md](11_SOURCES.md). Правила и примеры: [22_STAGE0_TRUTH_TABLE.md](22_STAGE0_TRUTH_TABLE.md).

## A. Claude — clauderesets.com

Первичные [API docs](https://clauderesets.com/api/docs) и [OpenAPI](https://clauderesets.com/api/openapi.json), а также обязательные [status](https://clauderesets.com/api/v1/status), [resets](https://clauderesets.com/api/v1/resets), [sources](https://clauderesets.com/api/v1/sources) реально вернули **HTTP 200**.

### Наблюдалось через HTTP

- OpenAPI 3.1.0; status/sources имеют `{data, meta}`, resets — `{data, pagination, meta}`.
- `data` статуса: `latest_reset`, `latest_ambiguous`, `announced_reset`, `active_watch`, `reset_offers`, `stats`, `filters`. Анонс и watch сейчас null.
- История: **12 уникальных событий**, все `usage_reset + confirmed`, `allocation=subscription_usage`, `time_precision=exact`, `revision=1`. Даты объявлений **2026-04-23 — 2026-09-04**. У всех `effective_at=null`: exact относится к `announced_at`, не к применению. Нельзя переносить это время в `deliveredAt/effectiveAt`.
- `audience.plans` реально бывает массивом, строкой `all` или `subscribers`. Сохранять scope, statement, exclusions, windows; часть сбросов относится лишь к отдельным планам/пострадавшим пользователям.
- Отдельный offer `2026-09-22-opus-5-5-reset`: `credit + confirmed`, **revision=2**, `effective_at=null`, `reset_offer.expires_on=2026-10-22`, планы Pro/Max/Team. Это предложение ручного redeem, не потреблённый сброс. Точное время и timezone дедлайна не установлены. [Страница Anthropic](https://www.anthropic.com/claude-opus-5-5), прочитанная web-инструментом, также подтверждает возможность сохранить сброс для последующего использования; точный дедлайн из неё не следует.
- `sources[]` события содержит URL, original/relay, автора, время, excerpt. `/sources` вернул **7** записей с классификацией, приоритетом и evidence URLs. Аффилиация авторов здесь — утверждение трекера; каждый профиль независимо не проверен.
- `meta.content_revision=371643df80cca0ae`, `coverage_start=2026-04-16`, `editorial_reviewed_at=2026-10-17T05:59:18Z`. Свежий `generated_at` означает формирование ответа, не новый редакционный просмотр.
- Полный resets: `has_more=false`, `next_cursor=null`, `revision_changed=false`. Дополнительно реально пройдены две страницы `limit=2` через выданный cursor: без пересечений, с одинаковой content_revision. Это полный текущий counted feed, не архив всех отозванных событий.
- Слабые ETag присутствуют. Условный status GET через 100 секунд вернул **200 с новым ETag**. Claude 304 не наблюдался, причина смены validator не установлена. HTTP 200 сам по себе не доказывает материальную редакцию.

### Только документировано / не встретилось в снимке

| Поле | Контракт OpenAPI |
|---|---|
| kind | usage_reset, limit_increase, credit, policy_change, incident |
| event_status | announced, confirmed, cancelled, retracted |
| time_precision | exact или date; date-only использует announced_on, announced_at=null; utc_day может быть null |
| correction | null либо `{kind, reason, at}`, где kind — correction или retraction |
| Редакция | ID/slug сохраняется, revision и revised_at меняются |
| Пагинация | limit 1..100 (default 20), cursor, from/to, order, audience, window; revision_changed сигнализирует перепубликацию |

Ненулевые будущий анонс/correction, date-only, cancelled/retracted не наблюдались. Offer revision=2 подтверждает наличие ревизии, но предыдущая версия не получена. По [docs](https://clauderesets.com/api/docs) отозванные/отменённые события остаются на event page и уходят из counted history; исчезновение строки не доказывает withdrawal. Проверка известных event pages/feeds потребует решения в адаптере. Недокументированный JSON detail endpoint не предполагается.

### Опрос и права

[Fair use](https://clauderesets.com/api/docs) разрешает публичное чтение, требует описательный User-Agent, кэш **минимум 60 секунд**, ссылку на Claude Resets везде, где показываются данные. Status/resets реально имеют `public, max-age=60, stale-while-revalidate=120`; sources — max-age=300. 304, 429 с Retry-After, 503 и problem+json документированы; ошибки намеренно не провоцировались.

**GO с оговорками:** чтение, хранение необходимых фактов/provenance в D1, ограниченная публичная история с атрибуцией. **NO-GO:** полная официальная история, персональные квоты, точное время применения из announced_at, credit как использованный reset. Прочие kind требуют review перед классификацией существенного policy change.

## B. Codex — кандидат codexreset.ai

[Developer docs](https://codexreset.ai/developers/) и [JSON](https://codexreset.ai/api/v1/resets.json) вернули **HTTP 200**. Forecast/signals/MCP не входят в MVP.

### Наблюдалось через HTTP

- Один JSON-снимок без пагинации: `schema_version=1`, `generated_at=2026-10-21T16:03:45Z`, source, attribution, events[], `scheduled=null`.
- **62 уникальных строковых ID**, даты **2025-09-17 — 2026-10-17**: regular=54, banked=8; seeded=true у 53, false у 9. Все ID текущей выборки — ID постов X; устойчивость при будущих редакциях не доказана контрактом.
- У всех 62 непустые ts и announced_at, в снимке равны. Docs допускают null для старых seeded, таких здесь нет. Из date нельзя восстанавливать отсутствующий timestamp.
- delivered_at заполнен у **6**, пуст у **56**. Один из шести — banked: доставка кредита не равна его использованию. Пять delivery URLs ведут на конкретный X-пост, один — только на главную codex-resets.com: слабое evidence, review.
- Реальные scope: all, paid, Plus+Pro+Business, Plus+Pro, affected. Это неоднородная строка, не наш enum; неизвестную аудиторию не расширять до all.
- Также есть summary, summary_unavailable, url, delivered_source_url, delivery_reported_delay, delivery_note_en. Все delay flags сейчас false; реальные true не проверены.
- Реальные headers: `public, max-age=300`, ETag `"811a700fd9a6acc18e737b6e3cec7b81"`, CORS `*`, X-Robots-Tag=noindex. Через 88 секунд условный GET вернул **304** с пустым телом. ETag в 304 отсутствовал — прежний validator нужно сохранить.
- revision/явного статуса отзыва/журнала изменений нет. Изменение материальных полей требует аудита; исчезновение события или scheduled не доказывает отзыв.

### Только документировано / ограничения evidence

[Docs](https://codexreset.ai/developers/) описывают scheduled.certainty=announced|hinted, day, nullable scheduled_for, when_text, url, source, announced_at. Ненулевого scheduled сейчас нет. Производный when_text не повышает точность исходного дня. Только явный актуальный будущий анонс может стать announced_future. Старый regular без delivery — needs_review, а не фиктивное будущее событие.

Например, `2109812216212099456` объявлен `2026-10-13T01:03:25Z`, доставка указана `2026-10-13T05:06:06Z`, со ссылкой на другой пост. Полный оригинальный текст X независимо не прочитан: web-инструмент сообщил 403. Это пока утверждение трекера со ссылкой; confirmed_applied условен до проверки достаточного доказательства. Главная трекера вместо конкретного подтверждения недостаточна.

### Опрос, права и выбор

[Fair use](https://codexreset.ai/developers/) разрешает API use без ключа, просит обратную ссылку, кэширование и частоту ниже примерно 1 запроса/минуту. Наш 5-минутный Cron укладывается в ориентир. Для seeded истории до 2026-09-10 сохранять seeded, attribution.seed_archive и ссылку на [codex-resets.com](https://codex-resets.com/), даже если публичная модель использует historicalSeed.

**Предложенный Stage 0 основной источник — CodexReset:** отдельные announcement/delivery поля и явная архивная provenance. Владелец впоследствии **выбрал `codexreset.ai` только для локального Stage 3**; это не production signoff. Оговорка исторического снимка: альтернатива содержит запись 20 октября, которой здесь нет. Свежий generated_at не доказывает актуальный охват.

**Условный GO:** чтение и история с точными evidence/seeded метками. **NO-GO:** автоматическое подтверждение по kind=regular, истечению времени, scope=all или слабому delivery URL; hinted-прогнозы; полная официальная статистика; публикация baseline в Telegram.

## C. Отдельная альтернатива — codex-resets.com

На [главной](https://codex-resets.com/) найдены [API docs](https://codex-resets.com/api/docs) и через Swagger — [OpenAPI 3.1.0](https://codex-resets.com/api/openapi.json). Это **другой контракт**; общий оператор с codexreset.ai не установлен.

- Реальные [status](https://codex-resets.com/api/v1/status) и [resets?limit=100](https://codex-resets.com/api/v1/resets?limit=100): HTTP 200, envelopes data/meta и data/pagination/meta.
- **64 уникальных ID**, regular=58, banked=6, has_more=false, next_cursor=null. Диапазон announced_at **2025-09-17T04:02:52.000Z — 2026-10-20T06:33:48.000Z**. source.type=x_post у 61, observed у 3; наблюдение не всегда имеет оригинальный пост.
- Reset содержит id, reset_type, announced_at, text, source. По контракту announced_at может означать первое наблюдение. Нет отдельных delivered_at, audience, revision, seeded. Status содержит latest_reset, scheduled_reset, active_watch, stats; scheduled/watch сейчас null. Watch — AI forecast, исключён.
- Status cache: `max-age=30, s-maxage=60, stale-while-revalidate=300`; resets HTTP 200: `max-age=60, s-maxage=300, stale-while-revalidate=300`. Условный GET реально дал **304**, но max-age вырос до **14400** при прежнем s-maxage=300. TTL 200/304 различается; минутную свежесть не предполагать. OpenAPI описывает cursor, limit 1..100, 429/503; многостраничный обход альтернативы не проверялся, 64 строки поместились в одну страницу.
- [API docs](https://codex-resets.com/api/docs) разрешает использование без ключа с обязательной ссылкой при показе. Числовой rate limit в изученных документах не найден; 5 минут — наш осторожный план, не обещанная провайдером квота.

Совпадают **52 ID** двух снимков; 12 только у альтернативы, 10 только у CodexReset. Например, ID объявления `2109812216212099456` в CodexReset ссылается на delivery post `2109873287853707513`; альтернатива использует **второй ID** как свою запись. Простое объединение строк или автоматическая смена источника создадут дубли/неверные counts.

**GO как исследованная альтернатива, подключение не утверждено.** Более свежие записи — плюс; отсутствие раздельной delivery-модели — минус. Fallback, слияние архивов и announced_at как delivery **NO-GO** без отдельного решения.

## D. Показ через D1, права и полнота

Все три изученные API docs разрешают API use/показ с условиями credit. Путь «серверный GET → необходимые структурированные факты и provenance в D1 → собственные краткие формулировки и ссылки» соответствует описанному использованию. Специальная лицензия на полный D1 mirror, длинные редакционные тексты, активы или исходные посты не установлена. Расширение до массового зеркала требует уточнения **до публикации**. Авторы не контактировались.

Все три robots.txt доступны и разрешают публичные пути; Claude запрещает /admin/. Robots и CORS не дают контентную лицензию; noindex JSON не отменяет API use. Не копировать оформление/иллюстрации/длинные summaries. Наша политика требует primary URL и tracker credit; seeded Codex — также archive credit.

Полный снимок feed не доказывает полную историю: Claude coverage с 16 апреля, первый полученный event 23 апреля; CodexReset импортировал 53 записи и отстаёт от альтернативы. Нельзя переносить upstream average в наш stats или предсказывать следующий reset. **Интервалы применения не вычислять по времени объявления.** Date-only без установленного UTC day не помещать в UTC-месяц путём подстановки полуночи. lastSuccessfulSyncAt, generated_at, editorial review и дата события — разные часы.

## E. Telegram — последующие этапы

[Bot API](https://core.telegram.org/bots/api) относится к будущему publisher (sendMessage/getMe/getChat, message_id, retry_after). Stage 0 **не проверял Telegram**, токены, handles, Cloudflare, D1 или будущий Worker API. /start остаётся отдельным согласованием; публичного HTTP publish-trigger не будет.

## F. Claude adapter — локальное состояние Stage 2, 2026-10-21

В Stage 2 реализован отдельный TypeScript adapter для трёх проверенных read endpoints Claude Resets: `status`, `resets` и `sources`. Сохранённая [проекция OpenAPI](evidence/stage2-claude-2026-10-21/contract.json) содержит структуру схемы без описаний и examples и hash исходного OpenAPI; это **не** полный ответ API и не parser fixture. Stage 0 captures не переписывались.

Парсер требует все поля текущей схемы и отклоняет неизвестные поля и enum. При schema rejection транспорт возвращает внутренний review result с исходным payload, URL запроса и фиксированной причиной; сырые данные не выдаются Worker/API или логгером. `sources.last_reviewed_at` может остаться date-only. Transport использует описательный User-Agent, независимые ETag/cache entries на endpoint и канонический query, cache минимум 60 секунд, ограничение response body 2 MiB, timeout, `Retry-After` и bounded backoff. Состояние transport передаётся через локальный in-memory объект и не переживает перезапуск.

История проходит cursor pages с лимитами страницы и общего обхода до подтверждённого конца. Все страницы должны иметь согласованный `content_revision`; неполный или меняющийся обход сохраняет последний complete snapshot. Ранее известные строки, отсутствующие в новом counted feed, сохраняются отдельно; исчезновение не классифицируется как withdrawal. Endpoint status/sources можно читать отдельно.

Mapper сохраняет raw kind/status, upstream ID/revision, URL и evidence, audience/plans/exclusions/windows и временную точность. Без проверенной assessment привязки к тому же ID/revision и original-source URL confirmed reset, future announcement, correction и withdrawal остаются `needs_review`; correction/withdrawal дополнительно требуют наблюдавшейся предыдущей ревизии. Подтверждённый `credit` с `reset_offer` и источником получает `banked_offer`, что не означает использованный сброс или текущую доступность. `effective_at=null` остаётся unknown, а delivery не создаётся. Caller-supplied assessment — технический вход локального маппера, не утверждение владельцем production truth policy.

Адаптер не включён в Worker `scheduled()`/`fetch()`, не записывает D1, не запускает transitions/publisher и не создаёт Telegram-сообщения. Текущие проверки и ограничения перечислены в [Stage 2 report](26_STAGE2_REPORT.md); итоговое независимое review и принятие владельцем остаются отдельными gates.

## G. Codex adapter — локальное состояние Stage 3, 2026-10-21

После явного выбора владельцем `codexreset.ai` реализован standalone adapter
только для `GET /api/v1/resets.json`. Targeted live GET принят строгим parser:
schema v1, 62 строки, 53 seeded, 56 null delivery; scheduled=null. Отдельные
[contract/HTTP metadata](evidence/stage3-codex-2026-10-21/README.md) не являются
полными fixtures. Первичные delivery posts независимо не подтверждались.

Source-specific result сохраняет `detectedAt`, raw timestamps/scope,
`expectedTime` (exact/date/unknown), attribution и valid reviewed primary
evidence. Достоверный future announcement может быть представлен до доставки,
включая regular announcement без известной даты; это требует отдельного
content-bound semantic assessment с явным `primarySourceUrl`. Ненулевой
scheduled по документированному контракту требует day; неизвестная форма не
принимается как будто это nullable day. Hinted остаётся review. `effective`
не заполняется из ts/date; delivered timestamp сам по себе не confirmation.

HTTP/cache/backoff изолированы от Claude; 300s default TTL, минимум 60s и
valid max-age/Age, bounded response/timeout/cleanup. Нет альтернативного feed,
pagination, persistence или публикации. In-memory reader сохраняет пропавшие
строки и scheduled с provenance без inferred withdrawal. [Stage 3 report](28_STAGE3_REPORT.md)
содержит тесты, независимое review и незакрытые production gates.

## Checklist Stage 0 (исторический результат)

- [x] Реальные обязательные endpoints и API-ссылка альтернативы.
- [x] Headers, conditional GET, JSON/IDs/offers/revisions, проверка границ пагинации; пробелы отмечены.
- [x] Fair use/credit, robots, ограниченный показ через D1, неполнота истории.
- [x] Отдельные go/no-go и captured/synthetic примеры.
- [ ] Принятие владельцем источника Codex и truth policy.
- [ ] Отдельное разрешение Stage 1. Следующий этап не начат.
