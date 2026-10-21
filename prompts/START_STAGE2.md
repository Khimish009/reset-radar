# Новая сессия — только Stage 2: Claude adapter

Ты работаешь в репозитории **Reset Radar | AI Limits** после локально завершённого Stage 1.

**Отправляя этот промпт или явно поручая выполнить этот файл, я принимаю локальный результат Stage 1 и разрешаю только Stage 2 — Claude adapter из roadmap.** Разрешаю локальную реализацию Claude Resets adapter и консервативного source-specific mapping по сохранённым контрактам/evidence. Это не утверждает production truth policy, не выбирает Codex feed и не разрешает публикацию. Pending ADR не отмечать целиком как agreed. Stage 3 и последующие этапы, commit/push/PR/merge, Cloudflare resources/secrets/login/deploy, D1 migrations и Telegram sends не разрешены.

Подготовка и сохранение этого файла сами по себе не запускают Stage 2. Если владелец просит только прочитать/отредактировать промпт, оставайся в границах этой просьбы.

## С чего начать

1. Выполни `git status --short --branch`, осмотри staged и unstaged changes. Прочитай `AGENTS.md`, `README.md`, все `docs/*.md`, `manual/OWNER_CHECKLIST.md`. Не перезаписывай чужие изменения и не считай подготовленные staged files уже закоммиченными.
2. Актуальная передача — [25_STAGE1_HANDOFF.md](../docs/25_STAGE1_HANDOFF.md), результат и проверки — [24_STAGE1_REPORT.md](../docs/24_STAGE1_REPORT.md). [23_SESSION_HANDOFF.md](../docs/23_SESSION_HANDOFF.md) описывает исторический переход Stage 0 → Stage 1; старые START_CODEX/START_STAGE1 повторно не выполнять.
3. Сверь [roadmap](../docs/08_DEVELOPMENT_PLAN.md), [ADR](../docs/09_DECISIONS.md), [Claude contract](../docs/04_EXTERNAL_APIS.md), [HTTP journal](../docs/11_SOURCES.md), [truth table](../docs/22_STAGE0_TRUTH_TABLE.md), [test strategy](../docs/06_TEST_STRATEGY.md), [evidence archive](../docs/evidence/stage0-2026-10-21/README.md). Запусти `python3 docs/evidence/stage0-2026-10-21/verify.py`.
4. Изучи текущие `src/domain/event.ts`, `src/providers/types.ts`, `src/runtime.ts`, `src/utils/logging.ts`, `src/index.ts` и тесты. Переиспользуй clock/fetch/logger seam и установленный npm toolchain с lockfile; не создавай второй каркас.
5. Применяй доступные навыки и глобальные инструкции, делегируй только достаточно сложные независимые подзадачи. Кратко обозначь границы Stage 2 и приступай без расширения этапа.

## Разрешённая реализация

- Добавь только Claude Resets adapter, необходимые source-specific runtime types/validation, HTTP transport/cache state interface и тесты. Предпочитай минимальные зависимости; не фиксируй будущую D1 schema. Разрешены минимальные изменения общих интерфейсов, если они действительно нужны этому адаптеру и сохраняют смысл Stage 1.
- Контракт — Claude Resets status/resets/sources и OpenAPI, не официальное API личных аккаунтов Anthropic. Не добавляй Codex adapter, альтернативные feeds или providers.
- Используй управляемый fetch и clock. ETag/cache state независимы по endpoint/варианту запроса. `304` без body сохраняет валидный snapshot и прежний validator, если новый header отсутствует; без предыдущего snapshot это не успешный пустой набор. HTTP 200 сам по себе не означает material event/revision.
- Соблюдай описательный User-Agent и Claude cache минимум 60 секунд. Не используй выдуманный GitHub owner/контакт. Проверки cache/backoff — с детерминированными часами, без реального ожидания в тестах.
- Обрабатывай timeout/abort, non-JSON/invalid JSON, ошибки схемы, `429`/`Retry-After`, `503`. Не делай бесконечные retries. Сохраняй последний валидный результат и безопасную диагностику; сетевой сбой не означает пустую историю или отзыв события.
- Обходи resets cursor pagination до подтверждённого конца, учитывай `content_revision`/`revision_changed`. Частичный или несогласованный набор страниц не выдавай за полный snapshot. Из исчезновения записи не выводи withdrawal; известные ограничения поиска отозванных событий документируй, не изобретай недокументированный detail endpoint.
- Runtime validation должна безопасно обрабатывать неизвестные поля/enum/несовместимую схему через review/rejection. Неизвестный input не получает confirmed автоматически; не теряй его provenance и причину review. Не логируй сырые payload, headers, URL с секретами или Error.message.
- Выполни только Claude-specific mapping в существующий внутренний event vocabulary. Shared normalization/policy engine, provider baseline persistence, D1/revisions journal и publication eligibility engine остаются Stage 4+. Не превращай каждый HTTP ответ в уведомление.
- `scheduled()` и публичный `fetch()` оставь инертными: они не вызывают адаптер, upstream, D1 или Telegram. Cron triggers остаются выключенными, environments — `dry_run`. Адаптер пока вызывается только локальными тестами/явно описанной проверкой. Реальные read-only endpoints — Stage 9, сайт — Stage 10.

## Семантика, которую необходимо сохранить

- В снимке Stage 0 было **12 counted usage_reset/confirmed**; у всех `effective_at=null`. `time_precision=exact` описывает **announcement**, а не момент применения. `announced_at` нельзя переносить в effective/delivered. Наличие action `confirmed_applied` не даёт права придумать отсутствующий timestamp.
- `confirmed_applied` допускается только при достаточном явном evidence выполнения; одно название upstream status/kind не заменяет проверку смысла. При нехватке evidence — `needs_review`. Локальный mapping не является production signoff.
- Будущий явный анонс — `announced_future`; истёкшая дата без подтверждения не становится применением. Date-only сохраняется отдельной датой, не `T00:00:00Z` и не вымышленным UTC day.
- Отдельный **credit offer revision=2**, expiry `2026-10-22` в историческом снимке — `banked_offer`, не использованный reset. Срок date-only, timezone/час не установлены. Не объявляй исторический offer активным на текущую дату без проверки фактов.
- Сохраняй raw kind/status, revision, исходный ID и precise source URLs/evidence, audience/scope/plans/exclusions/windows. `audience.plans` встречалось массивом, `all`, `subscribers`; неизвестную аудиторию нельзя расширить до всех.
- `correction`/`withdrawal` требуют явного evidence и связи с исходной записью. Offer revision=2 не доказывает, что предыдущая версия была реально получена; не фабрикуй историю изменений. `limit_increase`, `policy_change`, `incident` и неизвестные варианты пока безопасно направляй на review.
- Claude `304`, ненулевые future announcement/correction, date-only и реальные withdrawals в Stage 0 **не наблюдались**. Их тесты должны быть честно помечены synthetic/contract-based. Ошибки 429/503 намеренно не провоцировать.
- Codex feed/truth ADR остаются pending. Не объединяй архивы и не добавляй fallback. История community trackers неполная; никаких personal quota/official completeness/next reset guarantees.

## Fixtures и разрешённые HTTP-проверки

Сохранённые JSON Stage 0 — **сокращённые captured projections**, а не полные parser fixtures. Не подавай их полному parser как оригинальный ответ и не называй восстановленные/дописанные поля captured.

Для тестов используй явно synthetic полные contract-shaped inputs либо обоснованно полученные полные captured fixtures с provenance/датой и соблюдением условий источника. Отдельные targeted read-only GET к публичным Claude docs/OpenAPI/API разрешены, если нужны для текущего контракта/фикстур; не повторяй всё исследование Stage 0 и не опрашивай Codex. Выдерживай актуальный fair use/cache, не собирай длинные чужие тексты без необходимости. Новое evidence сохраняй отдельно; исходный архив и manifest не переписывай. Живые запросы не включай в автоматические тесты.

Если текущий контракт существенно расходится с архивом, запиши проверенные различия и выбери безопасный review/failure; не расширяй production truth policy молча. Внешние workspace/services не подключай без необходимости.

## Проверки и завершение

Добавь содержательные unit/integration проверки адаптера: known Claude states/offers/audience/precision, неизвестные fields/enums, conditional requests и 304 с/без snapshot/ETag, изолированный endpoint cache, минимум 60s cache, полная/частичная/сменившая revision pagination, timeout/invalid payload/429 с Retry-After/503, сохранение последнего валидного snapshot и отсутствие inferred withdrawal.

Сохрани регрессии Stage 1: HTTP и scheduled остаются no-op, dry_run/изоляция и logger не ослаблены. Прогони реальные `npm run typecheck`, `npm run lint`, `npm test` и evidence verify; сайт отсутствует, website build неприменим. Сетевые вызовы тестов — только контролируемые локальные substitutes по применимым навыкам, без реальных upstream/Telegram. Не ставь PASS непроведённым проверкам.

Проведи независимое review существенных изменений по глобальным инструкциям; устрани существенные findings и повтори затронутые проверки. Обнови docs/checklist и создай фактический отчёт Stage 2. Не отмечай provider baseline/publishing approval выполненными.

Заверши отчётом на русском по `AGENTS.md`: сделано/не сделано, изменённые файлы, реальные команды/результаты, verified vs assumptions, риски и решения владельца. Явно **не развёрнуто / не опубликовано**. **После Stage 2 остановись; Stage 3 без нового подтверждения не начинай.**
