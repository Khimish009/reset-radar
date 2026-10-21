# Новая сессия — только Stage 3: локальный Codex adapter

Ты работаешь в `/Users/salman/pet_projects/reset-radar`, проект **Reset Radar | AI Limits**. Прочитай `AGENTS.md`, `README.md`, [актуальный handoff](../docs/27_STAGE2_HANDOFF.md), [отчёт Stage 2](../docs/26_STAGE2_REPORT.md) и выполни это задание в указанных границах.

**Отправляя этот промпт или явно поручая выполнить этот файл, я принимаю локальный результат Stage 2 с исправлениями PR #2 и разрешаю только Stage 3 — локальный Codex adapter.** Подготовка, сохранение, чтение или редактирование файла сами по себе не запускают этап. Если поручено только подготовить промпт, реализацию не начинай.

## Обязательный выбор источника

**Codex feed ещё не выбран.** В стартовом сообщении владелец должен явно указать ровно один источник:

- `codexreset.ai` — docs `https://codexreset.ai/developers/`, feed `https://codexreset.ai/api/v1/resets.json`;
- либо `codex-resets.com` — отдельный контракт, docs `https://codex-resets.com/api/docs`, OpenAPI `https://codex-resets.com/api/openapi.json`, API `https://codex-resets.com/api/v1/`.

Если явного выбора нет, сначала изучи сохранённые различия и запроси выбор владельца. До ответа допускается только read-only подготовка; адаптер не реализовывать. Кандидат, предложенный Stage 0, не является утверждённым источником. Не выбирай автоматически по названию, свежести или наличию похожих ID. Не добавляй второй feed, union или fallback. Не считай операторов этих доменов одним лицом.

Это разрешение касается только source-specific parsing/mapping выбранного feed. Оно не утверждает production truth/publication policy, не закрывает ADR-015/019/020 целиком и не разрешает Stage 4, публикацию или инфраструктурные операции.

## Начало и ветка

1. Сначала выполни `git status --short --branch`, осмотри staged/unstaged/untracked изменения и Git history. Сохрани существующую работу, включая локальную подготовку handoff и этого промпта. Не выполняй reset/clean, не удаляй и не прячь изменения автоматически.
2. Сверь состояние [PR #2](https://github.com/Khimish009/reset-radar/pull/2) и `main`. Финальный SHA исправлений Stage 2 — `ae89017594854b28495542fa25141628d4378f98`; CI этого SHA успешно завершился. При последней проверке PR уже merged, локальный `main` и `origin/main` указывают на merge commit `0268056c98ec73b19c15202ddfb56666f8c6edd7`. Эти сведения исторические: текущее состояние перепроверь.
3. Рабочая ветка Stage 3 — `feat/stage3-codex-adapter`, на основе актуального `main`, содержащего итоговый Stage 2 и все три исправления review. Для проверки разрешены read-only GitHub-запросы, `git fetch origin` и обновление локального `main` только fast-forward из `origin/main`, если рабочие изменения сохранены и это безопасно. Создай или используй отдельную локальную ветку Stage 3. При squash/rebase проверяй merge result и содержание исправлений, а не только ancestry старого SHA.
4. Если PR #2 ещё открыт или нужного кода нет в `main`, не выполняй merge самостоятельно и не начинай Stage 3 от незавершённой PR-ветки. Сообщи конкретное состояние; попроси владельца завершить merge либо отдельно разрешить другую Git-базу. Подготовительные чтения можно продолжать. Не перезаписывай уже существующую ветку Stage 3 при несовпадении базы.
5. Прочитай [roadmap](../docs/08_DEVELOPMENT_PLAN.md), [ADR](../docs/09_DECISIONS.md), релевантную выбранному Codex feed часть [контрактов](../docs/04_EXTERNAL_APIS.md), [HTTP journal](../docs/11_SOURCES.md), [truth table](../docs/22_STAGE0_TRUTH_TABLE.md), [test strategy](../docs/06_TEST_STRATEGY.md) и [архив Stage 0](../docs/evidence/stage0-2026-10-21/README.md). Не перечитывай все docs без необходимости. Запусти `python3 docs/evidence/stage0-2026-10-21/verify.py`.
6. Изучи `src/domain/event.ts`, `src/providers/types.ts`, `src/runtime.ts`, `src/utils/logging.ts`, Claude adapter и его тесты. Сохрани существующий strict TypeScript/npm/Vitest toolchain и lockfile. Применяй подходящие навыки; делегируй достаточно сложные независимые подзадачи и проведи независимое финальное review по глобальным инструкциям.

## Разрешённая реализация

- Добавь только adapter выбранного Codex feed, необходимые source-specific types/runtime validation, transport/cache state и содержательные тесты. Минимальные изменения общих типов или helper допускаются лишь при реальной необходимости и с регрессиями Claude. Не строй общий normalization/publication engine и не фиксируй D1 schema.
- Сохраняй raw kind/status, upstream ID, precise source/evidence URLs, scope/audience, timestamps и их precision, source attribution, seeded/archive provenance и доступные metadata. Полный raw payload может храниться только во внутреннем review result, без публичного вывода и логирования. Не изобретай отсутствующие поля/revisions/detail endpoints.
- Неизвестная schema version, поля, enum или несовместимая форма дают безопасный review/rejection с provenance и причиной. Не подменяй сбой пустым набором. Последний валидный snapshot должен сохраняться.
- Используй управляемые clock/fetch. Cache, validators, backoff и in-flight requests изолированы по provider/endpoint/query; сбой Codex не влияет на Claude и наоборот. Описательный User-Agent без вымышленного контакта. Кэш минимум 60 секунд и с учётом актуальных условий/headers выбранного источника; целевой Cron в будущем — пять минут.
- `304` без тела допустим только при наличии snapshot; отсутствие нового ETag сохраняет прежний. Обрабатывай `429`/`Retry-After` seconds/date, `503`, non-JSON, invalid JSON/schema, overflow headers и ограниченное response body; без бесконечных retries. `200`, новый generated_at или ETag сами по себе не означают material event/revision.
- Timeout должен отменять fetch и активный body reader, освобождать lock/listeners, обрабатывать rejected/hanging cancellation и не допускать позднего cache update или unhandled rejection. Сохрани исправления PR #2; одного `Promise.race()` с возвратом timeout недостаточно.
- Если выбранный контракт имеет cursor pagination, обходи её до подтверждённого конца, ограничивай страницы и выявляй несовместимый/частичный snapshot. Если feed непагинируемый, не изобретай pagination. Исчезновение записи или scheduled не означает withdrawal.
- `scheduled()` и публичный `fetch()` остаются инертными и не вызывают адаптеры/upstream/D1/Telegram. Cron выключен, environments `dry_run`. Никаких новых публичных routes, публикаций, пользовательских токенов или личных квот.

## Семантика Codex

Общие правила: announcement не равен delivery, истечение времени не доказывает применение, banked не равен использованию кредита. `confirmed_applied` требует достаточного явно проверенного evidence, а не только статуса или заполненного timestamp. Без него — `needs_review`. Сохраняй проверенный future target отдельно от `effective`/`delivered`, с исходной precision. Date-only не превращай в UTC midnight или countdown. Для сопоставимой date-only логики используй документированную локальную политику Claude: календарная дата строго после текущей даты UTC; это база сравнения, не timezone события и не production signoff.

**Если выбран `codexreset.ai`:**

- В историческом снимке 2026-10-21: 62 строки, 53 seeded, 56 без delivered_at; 6 с delivery timestamp, включая banked. Это архивные числа, не требования к текущему feed и не гарантия completeness.
- `announced_at`, `ts`, `date` и `delivered_at` сохраняй по их смыслу. Null delivery не заменяй announced_at/ts/полночью. Отсутствующий timestamp старого seeded не восстанавливай из даты. `delivery_reported_delay=false` не является подтверждением выполнения.
- `regular` без достаточного delivery evidence — review. Наличие delivered_at и ссылки на главную трекера недостаточно; precise URL тоже не заменяет проверку смысла evidence. Старый непроверенный анонс не становится будущим.
- `banked` остаётся offer/credit независимо от delivered_at; это не consumed reset. Не придумывай срок, механику или текущую активность.
- `scheduled.certainty=hinted` — review, не announced_future. `announced` требует явного актуального анонса, source/evidence и будущего target. `scheduled_for=null` не повышай до точного времени из day/when_text; просроченный target не повышай до applied.
- Сохраняй `seeded`, `attribution.seed_archive` и архивный credit, неоднородный scope и признаки отсутствующего summary. Не расширяй неизвестную аудиторию до all. Не выдумывай собственный upstream revision counter при отсутствии такого поля.

**Если выбран `codex-resets.com`:**

- Используй только его собственные status/resets/OpenAPI. В историческом снимке: 64 строки, лишь 52 общих ID с другим feed; announcement и delivery posts могут иметь разные ID.
- В этом контракте нет отдельных delivered_at/audience/revision/seeded. `announced_at` может быть первым наблюдением, поэтому не подставляй его в delivered/effective и не приписывай архивную provenance из другого feed. Source `observed` не доказывает официальный reset.
- `regular`/`banked` трактуй консервативно по evidence; future/scheduled — только в пределах реально документированной формы. Active watch/AI forecast не входит в MVP.
- Исторически TTL resets у 200 и 304 различался (60 против 14400 секунд). Не предполагай минутную свежесть и не подменяй max-age значением s-maxage без обоснования.

Correction/withdrawal требуют явного evidence и связи с действительно наблюдавшейся записью/предыдущим состоянием. При отсутствии такого контракта оставь review, не фабрикуй журнал. Baseline и history не публикуются; provider baseline persistence и публикационные transitions относятся к Stage 4+.

## Evidence и HTTP-проверки

Stage 0 JSON — сокращённые **captured projections**, не полные parser fixtures. Не дописывай удалённые поля и не называй результат captured. Используй явно synthetic полные contract-shaped fixtures либо отдельно обоснованно полученные полные captures с датой/provenance и соблюдением прав. Исходный архив, manifest и historical captured evidence не переписывай.

Разрешены точечные read-only GET к docs/API/OpenAPI **выбранного** источника для актуального контракта и fair use. Не повторяй весь Stage 0, не подключай альтернативу и не провоцируй 429/503. Не сохраняй длинные чужие тексты без необходимости; новое evidence — в отдельном каталоге. Live upstream не включай в автоматические тесты; используй контролируемые local substitutes по навыкам. Не создавай и не подключай внешние workspace/services без необходимости.

При существенном расхождении текущего контракта с архивом запиши факты и выбери review/failure; не меняй источник или production truth policy молча. История community trackers неполная; не обещай official completeness, personal quota или next reset.

## Проверки и результат

Покрой schema drift, известные/неизвестные kinds, null delivery и слабое evidence, seeded/attribution/scope (если есть в выбранном контракте), banked, future announced/hinted/expired/date-only, сохранение проверенного target, ETag/304 с/без snapshot/validator, независимость Claude/Codex cache/backoff, min cache и актуальный TTL, timeout и фактическую отмену потока/cleanup, invalid payload, Retry-After/503, сохранение последнего snapshot и отсутствие inferred withdrawal. Для пагинируемого источника — полные/частичные/несогласованные страницы; не тестируй выдуманные поля другого feed. Ненаблюдавшиеся live варианты пометь synthetic/contract-based.

Выполни и честно запиши результаты:

```sh
npm run typecheck
npm run lint
npm test
python3 docs/evidence/stage0-2026-10-21/verify.py
git diff --check
```

Проверь полный diff, включая новые файлы, отсутствие секретов и неизменность Worker no-op/dry_run/logger. Website build пока неприменим. Проведи независимое review, устрани существенные findings и повтори затронутые проверки. Обнови документацию/checklist и создай фактический Stage 3 report + handoff с verified vs assumptions, реальными командами, ограничениями источника и pending owner decisions.

Commit, push, создание PR, merge, force-push, удаление веток, Cloudflare login/resources/secrets/deploy, D1 migrations и Telegram sends этим промптом **не разрешены**. Предыдущее разрешение commit/push касалось только исправлений PR #2 и не переносится на Stage 3.

Заверши отчётом на русском по `AGENTS.md`, явно **не развёрнуто / не опубликовано**, и остановись. **Stage 4 без нового отдельного разрешения не начинай.**
