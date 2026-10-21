# 23 — Передача контекста: Stage 0 → новая сессия Stage 1

Сохранено **2026-10-21**. Рабочая папка: `/Users/salman/pet_projects/reset-radar`. Открыть новую сессию в **этой же папке**. Этот документ сохраняет состояние исследования, не является работающим backend/сайтом.

**Актуальная передача после завершения Stage 1:** [25_STAGE1_HANDOFF.md](25_STAGE1_HANDOFF.md); следующий подготовленный промпт — [START_STAGE2.md](../prompts/START_STAGE2.md). Они сохраняют контекст, но не разрешают и не запускают Stage 2 до отдельного поручения владельца. Ниже — историческая передача Stage 0.

**Последующее обновление Stage 1:** владелец отправил `prompts/START_STAGE1.md` и разрешил только локальный каркас. Исходная передача ниже описывает состояние до этого разрешения; актуальная реализация/проверки — [24_STAGE1_REPORT.md](24_STAGE1_REPORT.md). `.gitignore` теперь показывает docs/manual/prompts как untracked до отдельного решения о коммите; архив сохранён, pending ADR не приняты.

## Текущее состояние и разрешения

- Stage 0 исследован и отрецензирован; Stage 1 **не начат**. В текущей сессии владелец попросил подготовить промпт и сохранить контекст, а не реализовать следующий этап.
- Готовый [промпт START_STAGE1](../prompts/START_STAGE1.md) предназначен для отправки владельцем в новой сессии. Его текст явно разрешает только локальный каркас Stage 1 без подключения источников и сохраняет pending статус выбора Codex/production truth policy. Это предлагаемая граница новой задачи; до отправки промпта текущие ADR/approval gates не меняются.
- Stage 0 findings — в [контрактах](04_EXTERNAL_APIS.md), [журнале HTTP](11_SOURCES.md), [ADR](09_DECISIONS.md), [truth table](22_STAGE0_TRUTH_TABLE.md). Не запускать снова `prompts/START_CODEX.md`: он описывает уже выполненное исследование Stage 0.
- Реализации/package.json/lockfile/workflows ещё нет; src/, migrations/, tests/, website/ содержат placeholders. Прежде чем редактировать, новый агент должен проверить фактическое состояние заново.
- Никаких push/PR/merge, Cloudflare/D1 resources/migrations/deploy, Telegram-сообщений или изменений секретов не выполнялось и разрешение на них не выдавалось.

## Что установлено

| Источник | Проверенный результат на 2026-10-21 | Что нельзя заключать |
|---|---|---|
| Claude Resets | Пять обязательных endpoints 200; 12 counted usage_reset/confirmed, offer credit revision=2; sources=7; две cursor-страницы согласованы | Exact относится к announced_at, effective_at у истории null; нет точного времени применения. Offer не использованный reset. Claude 304/реальные отзывы не наблюдались |
| CodexReset | JSON 200, conditional 304; 62 записи, regular=54, banked=8, seeded=53, delivered_at не null у 6; scheduled=null | 56 без delivery не подтверждены; banked delivery не потребление. Некоторые evidence links слабые; оригинальные X-посты не прочитаны независимо |
| Codex Resets, альтернатива | Отдельная OpenAPI и status/resets API; 64 записи, latest 2026-10-20; conditional 304 | Не тот же оператор/API по умолчанию; нет отдельных delivery/audience/revision/seeded полей. 304 max-age=14400 против 60 у исходного 200 |

CodexReset рекомендуется из-за раздельных announcement/delivery и seeded provenance, но отстаёт от альтернативы: latest 17 октября. Только 52 ID общие; delivery post может стать ID альтернативы вместо announcement ID. Автоматический fallback/union не согласован. Общий вывод — технический GO с оговорками для ограниченных фактов и атрибутированной истории; публикация сейчас NO-GO.

Fair use поддерживает необходимое API чтение и показ фактов с credit. Claude: User-Agent, кэш >=60s, обязательная обратная ссылка. CodexReset: кэш, около <1 запроса/минуту, tracker credit; для seeded сохранять archive attribution. Альтернатива: ссылка при показе, числовая квота в изученных docs не найдена. Полная официальная история, полное зеркало текстов/активов и точный прогноз следующего reset не обоснованы. Авторы не контактировались.

## Постоянно сохранённые данные

[Архив Stage 0](evidence/stage0-2026-10-21/README.md) содержит structural captures, headers, schemas, robots, исходные версии трёх документов и исторический review diff. Manifest различает hashes исходных тел и сокращённых сохранённых данных. Длинные чужие тексты/HTML не перенесены; данные не зависят от /tmp. Captured projections неполные — не передавать их полному parser как оригинальный upstream payload.

Офлайн-проверка из корня:

```sh
python3 docs/evidence/stage0-2026-10-21/verify.py
```

В Stage 0 выполнено 55 локальных assertions; после исправления записи A6 — ещё 3 targeted assertions. Независимый reviewer существенных проблем не нашёл; low finding о времени/TTL A6 исправлен. Typecheck/lint/Vitest/build тогда **не запускались**: приложения нет. Новая проверка архива валидирует сохранённые структуры и hashes, не приложение, полную JSON Schema или текущую сеть.

При подготовке передачи команда выше реально выполнена: **136 offline assertions PASS**. Сохранённые доказательства и ссылки доступны без /tmp и без сети.

## Известные расхождения

1. `.gitignore` исключает docs/, manual/, prompts/. Поэтому git status/diff не отображают эти файлы. Всё сохранено локально, но новый clone не получит документы/архив автоматически. `.gitignore` и index этой сессией не менялись. Исправление Git hygiene относится к отдельно разрешённому Stage 1.
2. Tracked LICENSE уже MIT, copyright 2026 Salman; starter docs всё ещё говорят pending. Файл не менять и одобрение владельца не выдумывать.
3. GitHub owner/URL, Pages URL и Telegram handles не подтверждены. Cloudflare resources не настроены; не выводить реальные URL/UUID из placeholders.
4. Принятие источника Codex и publication evidence policy остаётся отдельным решением владельца. Подготовленный промпт разрешает только нейтральный каркас Stage 1, не адаптеры/нормализацию/публикации.

## Следующий конкретный результат

Только Stage 1 из [roadmap](08_DEVELOPMENT_PLAN.md): TS strict Worker skeleton с scheduled/no-op fetch, typed interfaces, dry_run/изолированные конфигурации, безопасный logger, детерминированные тестовые зависимости, Vitest/lint/typecheck и CI checks без deployment. Адаптеры — Stage 2/3, D1 schema — Stage 4, Telegram — Stage 5+, публичный API — Stage 9, сайт — Stage 10. После отчёта Stage 1 остановиться.
