# 26 — Отчёт Stage 2: локальный Claude adapter

Дата: **2026-10-21**. Stage 2 отдельно разрешён владельцем через `prompts/START_STAGE2.md`. Работа выполнена в ветке `feat/stage2-claude-adapter`, основанной на `main`. В задании по [PR #2](https://github.com/Khimish009/reset-radar/pull/2) владелец принял архитектуру и основную реализацию и разрешил исправления трёх замечаний с commit/push в ту же ветку. Codex feed и production truth policy остаются pending. **Не развёрнуто / не опубликовано.**

## Доработка PR #2

- **Date-only future:** проверенная календарная дата должна быть строго позже текущей даты UTC. Завтра принимается, сегодня и вчера остаются `needs_review`. UTC служит единой базой сравнения, независимо от часового пояса процесса; это не timezone события и не вымышленное время `00:00:00Z`. Политика консервативно не принимает оставшуюся часть сегодняшнего дня и не утверждает, что завтрашняя UTC дата ещё не наступила ни в одном часовом поясе. Это локальная классификация, не production signoff.
- **Проверенный target:** результат mapping содержит `verifiedFutureTarget: ClaudeFutureTarget | null`, где тип допускает только `exact` или `date`. Копируется только валидный будущий target после проверки ID/revision/original evidence и статуса анонса. У неподтверждённых, просроченных и иных событий поле равно `null`; `effective` и `delivered` не подменяются. Persistence не добавлен.
- **HTTP body:** timeout отменяет fetch и активный reader; отмена reader не ожидает потенциально зависший underlying `cancel()`. Abort-обработчик удаляется, lock освобождается; ошибки отмены обработаны. Поздний ответ не парсится и не обновляет cache. ETag/304/Retry-After/backoff сохранены.

Добавлены 23 synthetic regression cases: 18 mapping (завтра/сегодня/вчера, несколько дней, UTC/year/leap-day boundaries, offsets, invalid dates и сохранение target) и 5 transport (фактическая отмена, зависший/rejected cancel, cleanup success/error, поздний response). До исправлений точечные команды воспроизвели неверный отказ для завтра, отсутствие target и отсутствие вызова `cancel()` у зависшего потока. Исторические captures не менялись; новых live upstream запросов в этой доработке не было.

## 1. Выполнено / не выполнено

Добавлен отдельный Claude Resets adapter для публичных `status`, `resets` и `sources`. Runtime schema строго проверяет полный контракт; неизвестное поле, enum или несовместимая форма отклоняет ответ. При schema rejection сохраняется внутренний review result с payload, URL запроса и безопасным кодом причины. Mapper бережно сохраняет upstream provenance, revision, audience, окна и временную точность; неподтверждённое остаётся `needs_review`. Для confirmed application/future announcement требуется caller-supplied evidence assessment с теми же ID/revision и ссылками на исходные источники. Correction/withdrawal дополнительно требуют привязки к наблюдавшейся более ранней revision. Подтверждённый credit offer классифицируется как `banked_offer`, без утверждения о потреблении.

Transport имеет endpoint/query-specific in-memory cache и ETag, conditional GET, минимум 60 секунд cache, timeout, ограничение тела 2 MiB, `429`/`Retry-After`, `503` и bounded backoff. История проходит cursor pagination до полного конца и проверяет неизменность `content_revision`; неудачный обход сохраняет последний полный snapshot, а исчезновение записи не создаёт withdrawal. Источники status и sources можно запрашивать независимо. Адаптер не подключён к Worker handlers, D1 или Telegram и не вызывает публикацию.

Остались вне этапа: Codex adapter, shared transition/publication policy, provider baseline persistence, D1, Telegram, публичный Worker API, сайт и deployment. Stage 3 не начинался.

## 2. Изменённые файлы

Stage 2 implementation и тесты: `src/providers/claude/schema.ts`, `src/providers/claude/mapping.ts`, `src/providers/claude/transport.ts`, `src/providers/claude/adapter.ts`, `tests/claude-mapping.test.ts`, `tests/claude-transport.test.ts`, `tests/claude-adapter.test.ts`, `tests/claude-simulation.test.ts`, `tests/fixtures/claude.ts`, `postman/mocks/claude/default.js`, `postman/simulations/claude-local.sim.yaml`.

Evidence: `docs/evidence/stage2-claude-2026-10-21/contract.json` — структурная, annotation-free проекция OpenAPI и hash исходника; `observations.json` — метаданные targeted live validation без тел ответов. Файл [README evidence](evidence/stage2-claude-2026-10-21/README.md) объясняет их границы.

Документация: `README.md`, `docs/04_EXTERNAL_APIS.md`, `docs/06_TEST_STRATEGY.md`, `docs/08_DEVELOPMENT_PLAN.md`, `manual/OWNER_CHECKLIST.md`, `docs/26_STAGE2_REPORT.md`, `docs/27_STAGE2_HANDOFF.md`, `docs/evidence/stage2-claude-2026-10-21/README.md`. Stage 0 snapshots/manifest и historical handoff не переписывались. На старте ветка `main` и index/worktree были чистыми. Исходный commit этапа — `d41d66143a8a63994686678e26bcb390310111e0`. Локальный результат сначала сохранён без коммита; затем владелец отдельно поручил commit и push ветки Stage 2.

## 3. Реальные команды и результаты

| Команда / проверка | Результат |
|---|---|
| `npm run typecheck` | PASS на финальном исходнике доработки PR #2. |
| `npm run lint` | PASS на финальном исходнике доработки PR #2. |
| `npm test` | PASS: **97 passed, 1 skipped**. Пропущенный тест — opt-in loopback simulation, запускается отдельной командой. |
| `env CLAUDE_SIMULATION_URL=http://127.0.0.1:4901/claude npm test -- --run tests/claude-simulation.test.ts` | PASS: **1 passed** против локального mock. |
| `postman simulation run postman/simulations/claude-local.sim.yaml --port 4901 --output ndjson --no-history` | Завершено локально: 9 loopback вызовов, 8 ответов и один намеренно задержанный вызов, завершённый timeout; mock остановлен. Первые прогоны выявили фикстуру и loopback permissions, исправления затем проверены; они не записаны как успешные первые попытки. |
| Отдельные read-only `curl` GET к `https://clauderesets.com/api/openapi.json`, `/api/docs`, `/api/v1/status`, `/api/v1/resets?limit=100` и `/api/v1/sources` | Все проверенные текущие endpoints ответили HTTP 200; parser принял status, resets (12 строк) и sources (7 строк) с `content_revision=371643df80cca0ae`. В `observations.json` сохранены URL, status и SHA-256 тел, сами тела не сохранены. Codex не опрашивался. |
| `python3 docs/evidence/stage0-2026-10-21/verify.py` | PASS: 139 offline assertions на последнем запуске; архивные captures/manifest не изменялись. |
| `git diff --check HEAD` | PASS: whitespace check чистый на последнем запуске. |
| Independent review | Завершено: `stage2_review` (reviewer, gpt-6.1-sol, reasoning high). Исправлены и покрыты регрессиями overflow HTTP delay headers и разный backoff concurrent failures. Оставшихся critical/high/medium findings нет. Reviewer независимо выполнил 34 mapping/adapter и 16 transport tests (50 PASS), diff check PASS; live upstream/simulation им не запускались. |
| Independent review доработки PR #2 | Завершено: `pr2_review` (reviewer, gpt-6.1-sol, reasoning high). Оставшихся critical/high/medium findings нет; все три замечания закрыты. Независимо выполнены **59 mapping/transport tests PASS** и `git diff --check HEAD` PASS; scope, cleanup и guards проверены. |
| Website build / удалённый CI / D1 / Worker runtime / Telegram E2E | Неприменимо или не запускалось; website пока placeholder, remote и инфраструктурные проверки не разрешены. |

Исторические провайдерские тела для parser tests не использовались как будто это полные ответы: Stage 0 архив содержит сокращённые projections; тесты используют помеченные synthetic contract-shaped fixtures. Live upstream вызовы не входят в автоматические тесты. Postman simulation обращалась только к локальному loopback mock.

## 4. Подтверждённые факты и допущения

Подтверждены: текущие целевые Claude endpoints отдали HTTP 200 и были приняты parser; полный запрос `resets?limit=100` вернул 12 строк; `sources` — 7. Наблюдался `sources.last_reviewed_at` в date-only форме, поэтому schema сохраняет эту точность. Локальный тестовый контракт/фикстуры покрывают варианты, не наблюдавшиеся в live snapshot, и помечены как synthetic/contract-based. Единственный opt-in simulation использует Postman mock, он не является доказательством live API 304/429/503 поведения.

Код является консервативным source-specific mapping, а не принятым production truth policy. Assessment передаётся вызывающим кодом; Stage 2 не реализует независимую проверку evidence, устойчивый журнал revisions или право публикации. In-memory snapshots существуют только пока живёт переданное состояние процесса.

## 5. Риски и ограничения

- Нет автоматического обнаружения withdrawal из исчезновения записи; provider feed не является полным архивом снятых публикаций.
- Claude `304` и реальные correction/withdrawal/future announcements не наблюдались. Соответствующие ветви проверены synthetic/contract tests; живые 429/503 намеренно не провоцировались.
- После перезапуска in-memory cache/history теряются; durable baseline и revision journal относятся к будущему отдельному этапу.
- Любое расширение upstream схемы сначала отвергается. Это сохраняет fail-closed поведение, но потребует обновления контракта/parser при реальном изменении источника.
- Reviewed future target сохраняется в `verifiedFutureTarget` отдельно от `effective`/`delivered`. Его durable хранение вместе с evidence потребует решения в shared policy этапе; состояние процесса не является persistence.

## 6. Действия владельца и разрешения

Владелец принял архитектуру и основную реализацию и разрешил только перечисленную доработку PR #2 с commit/push. Это не выбирает Codex feed и не утверждает production truth policy. Provider baseline, D1, публикация и production остаются закрытыми gates. Merge и Stage 3 требуют отдельных разрешений.

## 7. PR

Существующий [PR #2](https://github.com/Khimish009/reset-radar/pull/2) обновляется через push в `feat/stage2-claude-adapter`; новый PR не создаётся.

## 8. Внешние действия

Владелец отдельно разрешил commit и push исправлений PR #2 в `feat/stage2-claude-adapter`; фактический SHA и результат push сообщаются отдельно. Перед commit проверены diff, scope из шести файлов и типичные credential patterns: совпадений нет. Merge, D1, Cloudflare login/resources/migrations, deploy и Telegram sends не выполнялись и этим поручением не разрешены. **Не развёрнуто / не опубликовано. Stage 3 без нового задания не начинать.**
