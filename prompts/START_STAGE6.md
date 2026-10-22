# Новая сессия — Stage 6: локальная подготовка Cloudflare staging

Ты работаешь в `/Users/salman/pet_projects/reset-radar`, проект **Reset Radar | AI Limits**.
Прочитай `AGENTS.md`, `README.md`, [текущий handoff](../docs/33_STAGE5_HANDOFF.md),
[Stage 5 report](../docs/32_STAGE5_REPORT.md) и выполни это задание в его границах.

**Отправляя этот промпт или явно поручая выполнить этот файл, я принимаю локальный
результат Stage 5 из merged PR #5, включая review fixes и CI timeout fix, и разрешаю
только локальную часть Stage 6: dry-run runtime integration, локальные проверки
и подготовку конкретного плана Cloudflare staging.**

Подготовка, сохранение, чтение или review этого файла не начинают Stage 6.
Это задание не разрешает remote resources/migrations/secrets/deployment, включение
Cron, реальные upstream/Telegram requests, настоящие токены или публикацию.
Commit/push/PR/merge требуют отдельного нового разрешения; старое разрешение для
доработки PR #5 не действует на Stage 6. Не начинать Stage 7–11.

## База и начало работы

1. Проверь `git status --short --branch`, staged/unstaged/untracked, refs и историю.
   Сохрани подготовительные docs/prompt. Не выполняй reset/clean/stash pop,
   не перезаписывай существующие ветки и не меняй recovery artifacts.
2. Перепроверь read-only [PR #5](https://github.com/Khimish009/reset-radar/pull/5),
   текущий main и CI. Снимок на 2026-10-22:
   - PR merged=true, merged_at=`2026-10-22T08:06:57Z`;
   - merge SHA **`ba8bd58d959e1716ab41ff1339c7ddf44877ff22`**;
   - последний PR head **`bb2cd25de54175f2c8518529862f8d1ce308c51a`**;
   - [CI #15](https://github.com/Khimish009/reset-radar/actions/runs/39744232678)
     на PR head и [CI #16](https://github.com/Khimish009/reset-radar/actions/runs/39745365708)
     на merge — completed/success.
   Merge выполнил владелец/внешний процесс, не агент подготовки prompt.
3. После явного назначения этого файла разрешены read-only GitHub, fetch и
   безопасное создание локальной ветки **`feat/stage6-staging-dry-run`** от
   актуального main, содержащего все Stage 5 fixes. Сохрани текущие docs-правки.
   Не rebase/merge/reset конфликтующую существующую ветку самовольно; при проблеме
   с базой сообщи конкретные факты, продолжая независимое чтение.
4. Прочитай релевантные [архитектуру](../docs/02_ARCHITECTURE.md),
   [данные](../docs/03_DATA_AND_STATE.md), [безопасность](../docs/05_SECURITY_AND_PRIVACY.md),
   [test strategy](../docs/06_TEST_STRATEGY.md), [runbook](../docs/07_DEPLOYMENT_RUNBOOK.md),
   [roadmap](../docs/08_DEVELOPMENT_PLAN.md), [ADR](../docs/09_DECISIONS.md),
   [operations](../docs/10_OPERATIONS.md) и нужные пункты owner checklist.
   Не повторяй исследование/выбор upstream: Claude Resets и **codexreset.ai**;
   никакого fallback/union с codex-resets.com.
5. Изучи `src/index.ts`, `src/env.ts`, runtime/logger, ingestion/publisher services,
   storage, обе migrations, Wrangler configs и существующие tests.
   Применяй релевантные skills и роли по AGENTS.md. Для работы с HTTP контрактами
   используй `postman:api-engineer` и подходящие simulation/testing skills.

## Исходное состояние и обязательные ограничения

- Worker `scheduled()` пока no-op. `fetch()` — безопасный skeleton: reserved API
  reads 501, остальные reads 404, writes 405; HTTP не запускает ingestion/publish.
- `Env` не имеет DB binding; `readConfig()` допускает только dry_run.
  Основной Wrangler config не содержит D1/routes; Cron пуст, workers_dev и
  preview_urls отключены. Отдельный `wrangler.d1.local.json` — только local D1.
- Stage 4 ingestion/repository работают при прямом вызове, сохраняют immutable
  history, scoped cache/backoff и независимые baselines Claude/Codex.
  Assessment — доверенный local seam, production approval workflow отсутствует.
- Stage 5 client/policy/journal — **simulation-only**. Client ограничен loopback,
  synthetic token/chat; `telegram_simulation_deliveries` не означает реальные
  deliveries. Не снимай ограничения и не используй synthetic approvals для
  реального staging/production. Real Telegram client/journal здесь не реализуй.
- `dry_run` не вызывает Telegram client, не делает send claim, не пишет sent
  и не расходует возможность будущей публикации. Production approvals остаются
  NULL/неактивными; production entrypoint остаётся инертным в этой локальной фазе.

## Разрешённая работа

### 1. Локальная dry-run runtime integration

Подготовь минимальную типизированную связь scheduled orchestration с существующим
ingestion и D1, проверяемую локально через Worker entrypoint. Используй injected
clock/fetch/logger и настоящий local Miniflare D1; новая общая архитектура не нужна.

- Выполнение ingestion допускается только при явной безопасной local/staging
  конфигурации; default/missing/invalid config не должен незаметно активировать
  polling. Отсутствующий DB binding — безопасный отказ с фиксированным safe code.
  Production не активируется новым флагом этой фазы. `PUBLISH_MODE=publish` запрещён.
- Сохрани независимость providers, существующий timeout/cache/ETag/backoff,
  полные baselines до eligibility, immutable versions и CAS. Ошибка одного feed
  не отменяет независимый успешный результат другого и не скрывает failed state.
- Ограничь работу одного invocation и обработку страниц явным бюджетом; документируй
  поведение при исчерпании/неполной истории. Не считай partial import baseline.
  Overlap/restart не должны терять canonical state, обходить CAS или создавать
  дубликаты переходов. Не обещай межпроцессную блокировку из in-memory флага.
- Подготовь безопасный dry-run результат/preview там, где имеющиеся интерфейсы
  позволяют это без simulated sending и production approval. Если без assessments
  или policy событие blocked/needs_review, сохраняй причину и history; не создавай
  автоматических approvals ради положительного preview. Явно опиши остающийся
  разрыв до real publisher; не выдавай simulation service за него.
- Не добавляй HTTP sync/admin/assessment/publish endpoints. Read-only public data
  API, CORS/dashboard, website и bot webhook/private commands — следующие этапы.

Все исполнения в этой сессии — только synthetic/offline либо loopback HTTP.
Сам факт использования upstream URL в коде не разрешает обращаться к нему тестом
или diagnostic command: injected fetch/local substitutes должны это исключать.

### 2. Конфигурация, наблюдаемость и reviewable staging plan

Локальные binding types/test configuration и документированные templates разрешены.
Реальные D1 IDs/accounts/routes/secrets не добавляй; placeholders не выдавай за
валидный deploy target. Не переписывай применённые migrations 0001/0002; если новая
миграция необходима именно для этого scope, обоснуй и проверь её только локально.

Default, staging и production configs остаются dry_run/Cron off; не добавляй
автодеплой workflow или publication activation. Сохрани public surface закрытой.
Логи — фиксированные codes и безопасные scalars; без токенов, raw payload,
editorial rationale, Telegram text, чувствительных URL или stack dumps.

Обнови runbook с конкретным будущим порядком: изолированный staging D1, проверка
target/migrations, owner-controlled credentials при необходимости, dry-run deploy,
два независимых baselines, owner-approved Cron observation, metrics/quotas,
rollback/disable. Команды только документируй, **не выполняй** remote операции.
Проверяй нужный синтаксис/лимиты по установленному Wrangler и текущим официальным
Cloudflare docs, не копируй неподтверждённые квоты из старого runbook.

Раздели будущие разрешения: remote D1 creation/migration; staging deploy/bindings;
Cron enablement; отдельный дизайн real Telegram publisher и token/channel setup;
любые реальные Telegram requests/sends. Не запрашивай настоящий токен в чате.
Production release и publication per provider остаются за Stage 7/8 и своими gates.

## Регрессии, которые обязательно сохранить

- `delivered_at` — source-reported delivery/confirmation time, не точное время
  изменения квоты каждого аккаунта; Claude unknown time явно unknown. Не подменять
  effective/announced/delivered/detected друг другом.
- Event recency source-aware: maxEventAgeMs отдельно от candidate age; поздний
  historical import не уведомление. Offers требуют source current_offer proof;
  без надёжного времени действия нужен отдельный current relevance proof.
  Свежие evidence-backed future announcements exact/date/unknown не блокировать
  только из-за неизвестного action time. History сохраняется в D1.
- Hanging response-body cancellation не удерживает timeout; late rejection
  обработан, ambiguous send остаётся uncertain_manual_review без слепого retry.
- Synthetic-only gates, atomic claim, baseline-bound/rawKey-bound reviews,
  bounded keyset cursor и retries, no lease recovery для claimed/uncertain.
- Retention test `tests/stage4-storage.test.ts` сохраняет свой **20s** timeout,
  103 real D1 commits, поколения 4–103, ровно 100 sync runs и cleanup assertions.
  Не увеличивай global Vitest timeout, не отключай параллелизм/tests.

## Проверки, отчёт и остановка

Добавь необходимые meaningful tests для изменённого пути: handler → ingestion →
local D1, повтор/overlap/restart, partial history, независимые failures/backoff,
missing/invalid config/binding, production/default inactivity, zero Telegram
network/zero новых записей в обоих send journals, неизменность HTTP guards.
Пройди local HTTP substitute → adapters → runtime → настоящий D1 с receipt/log
проверкой, без pass-through. Переиспользуй Postman mocks, не push/deploy simulation
и не связывай shared workspace. После проверки останови поднятые процессы.

Выполни на финальном коде:

```sh
npm run typecheck
npm run lint
npm test
npm run test:d1
npm run d1:migrate:local
python3 docs/evidence/stage0-2026-10-21/verify.py
git diff --check
```

Website build неприменим. Не выдавай прежние **299 PASS / 4 skipped**, D1 **55 PASS**,
verify **139 PASS** за результаты нового кода; opt-in tests отмечай отдельно.
Новых зависимостей без необходимости не добавляй.

Проведи независимое финальное review, устрани существенные findings и повтори
затронутые проверки. Обнови README/roadmap/runbook/checklist и нужные ADR;
создай фактические Stage 6 local report/handoff следующими свободными номерами
docs (при подготовке свободны 34/35), сохрани контекст и команды воспроизведения.
Не отмечай полный Stage 6 acceptance «stable staging» выполненным без remote
наблюдения: здесь завершается только локальная подготовка.

Итоговый отчёт на русском: что сделано/не сделано, файлы, реальные команды и
результаты, independent review, факты/assumptions, риски, concrete remote plan
для отдельного будущего решения владельца. Затем **остановись**.
**Не развёрнуто / не опубликовано. Реальный staging E2E не выполнен.**
Commit/push/PR/merge, remote операции и переход к следующему этапу не разрешены.
