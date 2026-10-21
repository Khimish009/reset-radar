# 27 — Передача контекста после Stage 2: локальный Claude adapter

Сохранено **2026-10-21** в `/Users/salman/pet_projects/reset-radar`. Перед следующей работой проверь `git status --short --branch`, staged и unstaged изменения и прочитай актуальное задание владельца. Текущая ветка должна сверяться фактически; Stage 3 не разрешён этим handoff.

## Текущий результат

Владелец разрешил только Stage 2 через `prompts/START_STAGE2.md`. Claude Resets adapter реализован в `src/providers/claude/`: runtime schema/parser, source-specific mapping, HTTP transport/cache и ограниченный cursor reader. Он вызывается локально, но не подключён к `scheduled()` или `fetch()`. D1, Telegram, shared event transition/publishing engine, Codex и публичный API не входят в результат. [Фактический отчёт](26_STAGE2_REPORT.md) перечисляет проверенные команды и ограничения.

Используй для источников текущую [внешнюю API спецификацию](04_EXTERNAL_APIS.md), Stage 0 [truth table](22_STAGE0_TRUTH_TABLE.md), [test strategy](06_TEST_STRATEGY.md), локальный [contract evidence](evidence/stage2-claude-2026-10-21/README.md) и исторический [Stage 1 handoff](25_STAGE1_HANDOFF.md) только как контекст. OpenAPI evidence — структурная проекция без описаний/examples; `observations.json` хранит только URL, статусы, counts и hashes, не исходные тела.

## Проверенное поведение и важные границы

- Полная строгая валидация для status/resets/sources; несовместимый или неизвестный контракт отвергается, последний валидный cache value сохраняется.
- Conditional GET и cache имеют endpoint + canonical query scope; минимум 60 секунд. `304` требует существующий snapshot и сохраняет прежний validator при отсутствии нового заголовка.
- История ограничена page limit и max pages, проверяет `content_revision`, повтор cursor, пустой прогресс и revision regression. Не полный обход не заменяет предыдущий complete snapshot; исчезновение строки не означает отзыв.
- `announced_at` не переносится в applied/delivered. Confirmed applied/future announcement требуют явной assessment с тем же ID/revision и original URLs; correction/withdrawal дополнительно требуют ссылки на предыдущую наблюдавшуюся revision. Это вход локального mapper, не signoff production policy.
- `confirmed + credit + reset_offer` с source mapping даёт `banked_offer`; факт потребления или текущей доступности не выводится. `sources.last_reviewed_at` может быть date-only.
- Cache/history state передаётся через in-memory объект; сохранение между процессами отсутствует.

## Последние проверки

На момент передачи: `npm run typecheck` PASS, `npm run lint` PASS, `npm test` PASS (74 passed, 1 skipped), отдельный loopback simulation test PASS (1 passed), Stage 0 evidence verification PASS (139 assertions), `git diff --check HEAD` PASS. Независимое review `stage2_review` завершено: оставшихся critical/high/medium findings нет; reviewer независимо выполнил 50 targeted tests и diff check. Два transport findings (overflow HTTP delay headers и backoff конкурентных failures) исправлены и покрыты regression tests; подробности в [отчёте Stage 2](26_STAGE2_REPORT.md). Успешный локальный Postman simulation не является live upstream E2E.

## Открытые решения

ADR production truth policy остаются pending. Codex feed не выбран. Для будущего Codex adapter необходимы новый явный Stage 3 assignment и подтверждённый выбор feed по решению владельца. Не выводи разрешение Stage 3 из roadmap, checklist, handoff или успешных checks Stage 2.

После локального завершения Stage 2 владелец отдельно поручил commit и push ветки `feat/stage2-claude-adapter`. Фактический результат Git-операций проверять по истории и remote; это поручение не разрешает PR, merge, инфраструктурные операции или Stage 3. **Не развёрнуто / не опубликовано.**
