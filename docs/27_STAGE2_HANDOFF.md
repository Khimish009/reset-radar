# 27 — Передача контекста после Stage 2: локальный Claude adapter

Сохранено **2026-10-21** в `/Users/salman/pet_projects/reset-radar`. Перед следующей работой проверь `git status --short --branch`, staged и unstaged изменения и прочитай актуальное задание владельца. Текущая ветка должна сверяться фактически; Stage 3 не разрешён этим handoff.

## Текущий результат

Владелец разрешил только Stage 2 через `prompts/START_STAGE2.md`. Claude Resets adapter реализован в `src/providers/claude/`: runtime schema/parser, source-specific mapping, HTTP transport/cache и ограниченный cursor reader. Он вызывается локально, но не подключён к `scheduled()` или `fetch()`. D1, Telegram, shared event transition/publishing engine, Codex и публичный API не входят в результат. [Фактический отчёт](26_STAGE2_REPORT.md) перечисляет проверенные команды и ограничения.

После первоначального commit `af750c9` был открыт [PR #2](https://github.com/Khimish009/reset-radar/pull/2). Владелец принял архитектуру и основную реализацию и отдельно разрешил только исправления date-only future, HTTP body cancellation и сохранения future target с commit/push в существующую ветку. При последней проверке PR уже merged и итоговый Stage 2 находится в `main`; в рамках подготовки этой передачи агент merge не выполнял. Stage 3 не разрешён.

## Git, CI и подготовка следующей сессии

- Итоговый commit исправлений: **`ae89017594854b28495542fa25141628d4378f98`** — `fix: correct Claude future targets and cancel stalled bodies`. Он успешно отправлен в `origin/feat/stage2-claude-adapter`; предыдущий implementation commit — `af750c98fcc81ea08f5b07a7bdbc9688a644c55a`.
- При последней сверке GitHub подтвердил: [PR #2](https://github.com/Khimish009/reset-radar/pull/2) **closed, merged=true**, merged_at=`2026-10-21T18:55:10Z`, merge commit **`0268056c98ec73b19c15202ddfb56666f8c6edd7`**. Локальный `main` и `origin/main` содержат этот merge и итоговые исправления `ae89017`. Ранее замеченный `merge_commit_sha` у ещё открытого PR не считался доказательством merge; окончательное состояние проверено по `merged=true` и Git history.
- [CI checks, run #6](https://github.com/Khimish009/reset-radar/actions/runs/39656762062) для `ae89017`: **completed / success**, проверено через GitHub connector 2026-10-21. Прежнее сообщение «CI в очереди» было состоянием сразу после push и теперь устарело. При возобновлении перепроверить PR/CI: они могут измениться.
- Локальная ветка на начало подготовки была `feat/stage2-claude-adapter`, tracking соответствующий origin, без staged/unstaged изменений. Во время подготовки внешнее обновление перевело проект на `main` с merge commit `0268056`; это подтверждено повторным Git status/history. Агент не переключал ветку, не выполнял merge, commit или push в этом задании. Prompt/handoff/README/roadmap остаются локальными изменениями на `main`, index пуст. Открывай ту же папку проекта; новый clone не получит эти четыре документационных изменения до отдельно разрешённого сохранения в Git.
- Подготовлен [START_STAGE3.md](../prompts/START_STAGE3.md). Это не разрешение этапа. Его отдельная отправка/поручение запустить принимает локальный Stage 2 и разрешает только локальный Stage 3 при явном выборе Codex feed и корректной Git-базе. Пока источник не выбран; нельзя молча выбрать рекомендованный исторический кандидат.
- Git-база для обычного Stage 3 уже подготовлена: PR #2 merged, итоговый Stage 2 включён в `main`. В новой сессии всё равно перепроверь это состояние; не создавай реализацию от устаревшей базы и не складывай её автоматически поверх открытого PR. Новая ветка после проверки — `feat/stage3-codex-adapter`; при будущем squash/rebase проверяй также содержание исправлений.

Это задание владельца — сохранение контекста и подготовка промпта. **Stage 3 не начат; merge, новый commit/push и инфраструктурные действия в рамках подготовки не выполняются.**

Используй для источников текущую [внешнюю API спецификацию](04_EXTERNAL_APIS.md), Stage 0 [truth table](22_STAGE0_TRUTH_TABLE.md), [test strategy](06_TEST_STRATEGY.md), локальный [contract evidence](evidence/stage2-claude-2026-10-21/README.md) и исторический [Stage 1 handoff](25_STAGE1_HANDOFF.md) только как контекст. OpenAPI evidence — структурная проекция без описаний/examples; `observations.json` хранит только URL, статусы, counts и hashes, не исходные тела.

## Проверенное поведение и важные границы

- Полная строгая валидация для status/resets/sources; несовместимый или неизвестный контракт отвергается, последний валидный cache value сохраняется.
- Conditional GET и cache имеют endpoint + canonical query scope; минимум 60 секунд. `304` требует существующий snapshot и сохраняет прежний validator при отсутствии нового заголовка.
- История ограничена page limit и max pages, проверяет `content_revision`, повтор cursor, пустой прогресс и revision regression. Не полный обход не заменяет предыдущий complete snapshot; исчезновение строки не означает отзыв.
- `announced_at` не переносится в applied/delivered. Confirmed applied/future announcement требуют явной assessment с тем же ID/revision и original URLs; correction/withdrawal дополнительно требуют ссылки на предыдущую наблюдавшуюся revision. Это вход локального mapper, не signoff production policy.
- Date-only future сравнивается строго с текущей календарной датой UTC: завтра принимается, сегодня/вчера — review. UTC — только фиксированная база сравнения, не timezone события и не момент полуночи; нет утверждения о будущем во всех часовых поясах.
- `verifiedFutureTarget: ClaudeFutureTarget | null` сохраняет проверенный будущий target отдельно от `effective`/`delivered` с precision `exact` или `date`; у непринятых анонсов и других событий — `null`. Durable хранения нет.
- Timeout отменяет активный body reader даже при fetch substitute, игнорирующем AbortSignal. Cancel rejection обработан, зависший cancel не блокирует возврат, abort listener снимается и lock освобождается. Поздний response не заменяет cache.
- `confirmed + credit + reset_offer` с source mapping даёт `banked_offer`; факт потребления или текущей доступности не выводится. `sources.last_reviewed_at` может быть date-only.
- Cache/history state передаётся через in-memory объект; сохранение между процессами отсутствует.

## Последние проверки

На момент доработки PR #2: `npm run typecheck` PASS, `npm run lint` PASS, `npm test` PASS (97 passed, 1 skipped), отдельный loopback simulation test PASS (1 passed), Stage 0 evidence verification PASS (139 assertions), `git diff --check HEAD` PASS. Новые regression cases явно synthetic; captured evidence не менялись. Первоначальное review `stage2_review` завершено без оставшихся critical/high/medium findings (50 independently run targeted tests). Независимое review доработки `pr2_review` (reviewer, gpt-6.1-sol, reasoning high) завершено: все три замечания закрыты, оставшихся critical/high/medium findings нет; **59 mapping/transport tests PASS** и diff check PASS выполнены reviewer. Успешный локальный Postman simulation не является live upstream E2E.

## Открытые решения

ADR production truth policy остаются pending. Codex feed не выбран. Для будущего Codex adapter необходимы новый явный Stage 3 assignment и подтверждённый выбор feed по решению владельца. Не выводи разрешение Stage 3 из roadmap, checklist, handoff или успешных checks Stage 2.

Для следующих локальных запусков достаточно сохранённого lockfile и Node из `.nvmrc`: `npm ci`, затем перечисленные выше проверки. Runtime types генерируются автоматически в ignored `.wrangler/`; generator и loopback simulation могут потребовать отдельного sandbox-разрешения. Это не Cloudflare login/deploy. Opt-in HTTP-проверка: запустить `postman simulation run postman/simulations/claude-local.sim.yaml --port 4901 --output ndjson --no-history`, затем `env CLAUDE_SIMULATION_URL=http://127.0.0.1:4901/claude npm test -- --run tests/claude-simulation.test.ts`, после проверки остановить именно этот локальный процесс. Workspace не привязан, upstream в simulation не опрашивается; логи и полные временные тела из `/tmp` не нужны для восстановления кода или synthetic tests.

Разрешение на commit/push исправлений PR #2 уже исполнено и не переносится автоматически на подготовку документации или Stage 3. **Не развёрнуто / не опубликовано.**
