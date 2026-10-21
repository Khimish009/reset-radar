# Новая сессия — только Stage 1

Ты работаешь в репозитории **Reset Radar | AI Limits**. Продолжи проект после завершённого исследования Stage 0.

**Отправляя этот промпт в новой сессии, я разрешаю только Stage 1 — локальный каркас Repository/Worker foundation.** Результаты Stage 0 используй с зафиксированными ограничениями. Для этого каркаса разрешаю продолжить без окончательного выбора Codex feed: конкретный источник и production truth policy остаются pending; их нужно согласовать до соответствующих адаптеров/публикаций. Не отмечай pending ADR как одобренные. Это разрешение не распространяется на Stage 2 и последующие этапы, удалённые ресурсы или публикацию.

## С чего начать

1. Выполни `git status --short`, осмотри файлы, прочитай `AGENTS.md`, `README.md`, `START_HERE_RU.md`, все `docs/*.md`, `manual/OWNER_CHECKLIST.md`.
2. Особое внимание: [контекст передачи](../docs/23_SESSION_HANDOFF.md), [roadmap](../docs/08_DEVELOPMENT_PLAN.md), [решения](../docs/09_DECISIONS.md), [HTTP journal](../docs/11_SOURCES.md), [truth table](../docs/22_STAGE0_TRUTH_TABLE.md), [архив доказательств](../docs/evidence/stage0-2026-10-21/README.md). Выполни локальный `verify.py` из архива. Не повторяй всё исследование upstream для создания каркаса; сохранённые данные исторические, не обещание текущей доступности.
3. Исходная `.gitignore` исключает docs/, manual/, prompts/; пустой git status **не означает**, что документов или прошлых правок нет. Не удаляй/не перезаписывай сохранённые данные. В рамках Stage 1 приведи `.gitignore` к требованиям проекта: документация/промпты должны быть видимы Git, секреты, зависимости и локальные runtime artifacts — игнорироваться. Не коммить автоматически.
4. В tracked `LICENSE` уже MIT с copyright 2026 Salman, хотя часть стартовых документов говорит pending. Сохрани лицензию; не приписывай владельцу новое лицензионное решение. Это известное расхождение, не повод заново выбирать лицензию.
5. Кратко обозначь границы Stage 1 и приступай. Применяй доступные навыки и глобальные инструкции к задаче; не подключай внешние workspace/services без необходимости.

## Реализуй только Stage 1 из roadmap

- Минимальный TypeScript strict проект Cloudflare Worker; npm scripts для typecheck/lint/test; Vitest, линтер, воспроизводимая установка с lockfile. Используй актуальные официальные сведения о версиях/конфигурации инструментов при необходимости.
- Entry point с `scheduled()` и безопасным no-op `fetch()`/routing skeleton. В этом этапе ни один handler не вызывает upstream, Telegram или D1. Зарезервируй границу будущего read-only API; реальные events/status/stats — Stage 9.
- Минимальные typed event/provider interfaces с учётом docs/02 и результатов Stage 0: provider, raw provenance, отдельные announcement/effective/delivery времена и precision, состояния announced_future/confirmed_applied/banked_offer/correction/withdrawal/needs_review. Не реализуй нормализацию/адаптеры/SQL раньше их этапов и не фиксируй лишнюю схему будущей БД.
- Отдельные staging/production конфигурации без реальных токенов, D1 UUID или притворно настроенных binding. `PUBLISH_MODE=dry_run` по умолчанию, никакого fallback из staging в production.
- Безопасный logger и необходимые проверки, что секреты не оказываются в сообщениях. Детерминированный clock и управляемый fetch для будущих тестов; тесты каркаса не должны обращаться к сети.
- Локальные файлы CI checks для typecheck/lint/tests. Без deploy job, удалённого запуска Actions, секретов, Wrangler login, D1 resources/migrations и любых production side effects.
- Сохрани архитектуру: Worker scheduled + read-only HTTP, D1 canonical state позже, Telegram publisher позже; сайт позже — Vite + TS + CSS на GitHub Pages `/reset-radar/`. React/Next/SSR и другие providers не добавлять.

## Факты, которые нельзя потерять

- Claude: 12 записей counted history, отдельный credit offer revision=2. exact — точность объявления, все effective_at в истории null. Не выдавать announced_at за применение; expiry offer date-only. Claude 304 не наблюдался.
- CodexReset — рекомендованный, **ещё не утверждённый** основной кандидат. В снимке 62 записи, 53 seeded, 56 без delivered_at. regular сам по себе не доказывает применение; banked с delivery остаётся предложением кредита. hinted — не будущий подтверждённый анонс.
- codex-resets.com — отдельная альтернатива: 64 записи, последнее событие 20 октября против 17 октября у CodexReset; совпадают лишь 52 ID. Иногда announcement/delivery одного reset имеют разные ID. Не объединять и не делать fallback автоматически.
- Отсутствие строки или исчезновение scheduled не доказывает отзыв. Неизвестная схема/enum/field — безопасный review. UTC нельзя придумывать для date-only. История неполная, личные квоты не проверяются.
- Отдельный полный baseline для каждого provider; исторические данные не публикуются. D1/Telegram не транзакционны; exactly-once delivery не обещать. Сейчас нет реализации publisher и нет разрешения публикации.
- Архивные JSON — сокращённые captured projections, не полные parser fixtures. 55 + 3 проверки прошлого сеанса относились к исследованию, не к приложению. Проверки текущего кода нужно реально выполнить заново.

## Проверки и завершение

Запусти typecheck, lint и релевантные unit/integration проверки Stage 1. Добавляй содержательные тесты поведения: no-op scheduled без внешних действий, безопасные HTTP handlers, default dry_run/изоляция конфигураций и redaction logger. Не имитируй реализацию адаптеров или будущую БД ради числа тестов. Website build пока неприменим — сайта нет.

Проведи независимое review существенных изменений, если доступные инструкции/роли это предусматривают; исправь существенные findings и повтори затронутые проверки. Обнови документацию и checklist Stage 1 по фактическому результату.

Заверши отчётом на русском по `AGENTS.md`: сделано/не сделано, файлы, реальные команды/результаты, факты/допущения, риски, решения владельца. Укажи **не развёрнуто / не опубликовано**. Не push, не PR, не merge, не меняй remote secrets, не создавай Cloudflare resources. **После Stage 1 остановись; Stage 2 без нового подтверждения не начинай.**
