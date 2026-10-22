# Новая сессия — только локальный Stage 5: Telegram publisher

Ты работаешь в `/Users/salman/pet_projects/reset-radar`, проект **Reset Radar | AI Limits**.
Прочитай `AGENTS.md`, `README.md`, [текущий handoff](../docs/31_STAGE4_HANDOFF.md),
[отчёт Stage 4](../docs/30_STAGE4_REPORT.md) и выполни это задание в его границах.

**Отправляя этот промпт или явно поручая выполнить этот файл, я принимаю локальный
результат Stage 4 из PR #4 и разрешаю только локальный Stage 5: Telegram client,
truth-preserving templates, publisher orchestration и необходимые D1 journal
interfaces/migrations, проверенные на synthetic данных и локальных HTTP substitutes.**

Подготовка, сохранение, чтение или review файла не начинают Stage 5. Если поручено
лишь подготовить следующий prompt/handoff, production-код не меняй. Это не
production policy signoff и не разрешение реальной отправки, даже в test channel.
Commit/push/PR/merge, remote resources/migrations/secrets/deployment, Stage 6,
runtime wiring и включение публикации требуют отдельных разрешений.

## Git-база и начало

1. Проверь `git status --short --branch`, staged/unstaged/untracked, refs и историю.
   Сохрани подготовительные docs/prompt, не выполняй reset/clean/stash/pop и не
   перезаписывай существующие ветки. Старый stash уже учтён; не применяй его снова.
2. Перепроверь read-only [PR #4](https://github.com/Khimish009/reset-radar/pull/4),
   CI и main. При подготовке 2026-10-22: PR merged=true,
   merged_at=`2026-10-21T21:53:45Z`, merge SHA
   **`2a0a958941220dd1f9e8daf65e6ff666bcf52aed`**. Implementation SHA
   **`712175673485360479a0141a771d7f0519781b23`**, CI
   [run #11](https://github.com/Khimish009/reset-radar/actions/runs/39681931234)
   completed/success. Local main/origin/main тогда совпадали с merge SHA.
   Это historical verification, не гарантия актуального remote. Merge/push PR #4
   выполнил владелец/внешний процесс, не агент этой сессии.
3. Работай в новой локальной ветке **`feat/stage5-telegram-publisher`** от актуального
   main с полным Stage 4 и его review fixes. После явного назначения этого файла
   разрешены read-only GitHub, `git fetch origin`, безопасный fast-forward local
   main и создание ветки с сохранением текущих правок; commit не разрешён.
   При squash/rebase проверяй содержание. Если база не содержит Stage 4, PR снова
   открыт или существующая Stage 5 ветка имеет другую базу, не сливай/не rebase/не
   reset самовольно: сообщи факты и запроси решение по базе, продолжая чтение.
4. Прочитай релевантные docs [02](../docs/02_ARCHITECTURE.md),
   [03](../docs/03_DATA_AND_STATE.md), [05](../docs/05_SECURITY_AND_PRIVACY.md),
   [06](../docs/06_TEST_STRATEGY.md), [08](../docs/08_DEVELOPMENT_PLAN.md),
   [09](../docs/09_DECISIONS.md), [10](../docs/10_OPERATIONS.md),
   [12](../docs/12_MESSAGE_TEMPLATES.md), [22](../docs/22_STAGE0_TRUTH_TABLE.md)
   и нужные пункты owner checklist. Не перечитывай весь архив и не повторяй
   исследование upstream trackers; источники Claude Resets/codexreset.ai фиксированы.
5. Изучи `src/domain/normalization.ts`, `src/services/ingest.ts`, `src/storage/`,
   `migrations/0001_stage4.sql`, env/runtime/handlers/logger и существующие tests.
   Применяй релевантные навыки и роли по AGENTS.md; обязательно независимое
   финальное review. Рутинные локальные решения принимай самостоятельно, запиши
   conservative choices в docs/ADR; не выдавай их за утверждённую production policy.

## Что уже есть и чего пока нет

- D1 хранит events, immutable observations/versions, publication candidates,
  source state, independent provider baselines и activation metadata.
- Repository умеет читать provider/events/version/sources, но **не имеет** bounded
  candidate enumeration, общего Telegram journal или publisher orchestration.
- `claimSynthetic/completeSynthetic/getDelivery` работают только с таблицей
  `synthetic_deliveries` и destination `synthetic:`. Это не готовый production
  Telegram journal; mock outcome нельзя записывать как реальную отправку.
- `publishApprovedAt` по умолчанию NULL, setter/approval workflow отсутствует.
  `readConfig()` принимает только `PUBLISH_MODE=dry_run`; handlers инертны.
- Stage 4 tests: 226 PASS / 3 opt-in skipped, test:d1 24 PASS, verify139 PASS,
  local migration и opt-in HTTP+D1 simulation PASS; independent review завершён.
  Это предыдущие результаты, а не уже пройденные проверки Stage 5.

## Разрешённая локальная реализация

### 1. Типизированный Telegram client

Реализуй отдельный HTTP client с injected fetch/clock, timeout/cancellation,
bounded response parsing и безопасным результатом. Перед реализацией проверь
текущий первичный контракт [Bot API](https://core.telegram.org/bots/api#making-requests),
[sendMessage](https://core.telegram.org/bots/api#sendmessage),
[ResponseParameters](https://core.telegram.org/bots/api#responseparameters) и
[formatting](https://core.telegram.org/bots/api#formatting-options).

Используй минимальный `sendMessage` contract, без SDK/webhook/getUpdates/getMe,
личных команд, edit/delete, paid broadcast или новых bot capabilities. Контрактные
лимиты, `ok/result/error_code/parameters`, message identity и retry delay проверяй
runtime validation; HTTP 200 сам по себе не означает успешный Telegram outcome.

Не запрашивай и не читай реальные bot tokens. Для tests только явно synthetic
credentials и loopback substitute; ни одного запроса к `api.telegram.org`, даже
диагностического. Не перенаправляй секретный URL по redirect и не выводи URL с
token, body, description, stack, message text или assessment rationale в logger.
Logger можно минимально расширить фиксированными safe codes/scalars и тестами.

### 2. Отдельные правдивые шаблоны и preview

Создай deterministic renderer для обоих providers и действий `announced_future`,
`confirmed_applied`, `banked_offer`, `correction`, `withdrawal`.
`needs_review`/hinted/seeded history не получают публикуемого сообщения.

- Сохрани ранний проверенный анонс до delivery с expectedTime exact/date/unknown.
  Unknown явно описывается словами, date не становится midnight/countdown.
- Codex `delivered_at=null` не подтверждает delivery; renderer использует
  **verifiedDelivery/action/evidence**, а не только `record.delivered` или
  `upstreamReportedDelivery`. Claude applied может не иметь отдельного времени
  delivery: обозначь точность честно, announcement не называй временем применения.
- Offer — не consumed reset и не обещание текущей доступности. Date-only expiry
  без придуманного часа/timezone/механики активации; неизвестное действие обозначь.
- Scope/audience/windows бери из принятых фактов; rejected/stale assessment не
  переносит свои URLs/audience. Не публикуй internal IDs/hash/raw audit/rationale.
- Для каждого сообщения primary evidence + tracker attribution и краткое
  указание независимости. Website/GitHub/channel links только проверенные;
  не публикуй placeholders или выдуманную live-ссылку.
- HTML или plain text выбирай обоснованно. При HTML экранируй текст и атрибуты,
  допускай только безопасные URL. Длина, Unicode, malicious input и сохранение
  смысла при сокращении должны быть проверены; при невозможности — safe rejection.
- Correction/withdrawal требуют evidence и фактический lineage, а не missing row.
  Ссылка на предыдущий Telegram post допустима только из достоверного journal
  того же destination; при её отсутствии не выдумывай прошлую публикацию.

Сохрани читаемые **synthetic** previews всех truth cases в docs/evidence или
документированном локальном artifact, чтобы владелец мог оценить тексты без sends.
Никакого LLM rewriting или копирования полного upstream editorial summary.

### 3. D1 publisher orchestration и journal seam

Реализуй прямо вызываемый service поверх D1, immutable version и client interface;
Worker handlers его не импортируют. Нужные repository interfaces, bounded indexed
queries и **новые forward local migrations** разрешены. Применённую `0001` не
переписывай. Не ослабляй synthetic destination CHECK ради настоящих chat IDs:
обоснуй совместимый journal adapter/отдельную схему и границу simulation/real.

Кандидат не равен publish approval. Проверяй provider baseline, явную локальную
test policy/approval, destination, текущую допустимость immutable transition и
freshness. Production approval workflow и threshold остаются pending; при
отсутствующих настройках fail closed. Для positive tests допустимы только
явно synthetic approvals/config в отдельном local/test D1. Не выставляй реальные
provider approvals и не добавляй HTTP/admin/assessment endpoint или prod setter.

Просроченный future target/новая review-версия/устаревший candidate не должны
публиковать прежний анонс как актуальный. Разделяй successful ingestion cached
data, HTTP checked time и upstream generation/review. Локальную conservative
eligibility/freshness policy документируй; не утверждай официальную полноту.

Atomic claim уникален по event + material transition + destination (и явной
границе simulation/environment). Подтверждённая delivery после announcement —
отдельный переход; replay/noise не создают повторных intents. Codex event и
scheduled namespaces сохраняй; не объединяй разные IDs по времени/тексту.

`dry_run` возвращает preview/причину skip **до client/network**, не создаёт send
claim, не ставит `sent`, не расходует возможность будущего одобренного перехода.
Отдельный test-only simulation path может обращаться только к local mock и
помечает outcomes как simulated. Он не включает runtime `PUBLISH_MODE=publish`.

Различай definitive rejection, подтверждённый retryable rate limit и ambiguous
outcome. Валидный отказ может дать rejected/retryable с bounded persisted retryAt;
timeout/network disconnect/malformed success/неоднозначный 5xx после попытки
не разрешают слепой resend: `uncertain_manual_review` либо durable blocked claim.
Повреждённый ответ не превращается в успешную отправку. Не меняй destination
автоматически по внешней подсказке и не retry бесконечно.

Crash/restart, overlapping calls и ошибка записи D1 **после** возможного send
не должны привести к автоматической повторной отправке. Сохраняй ownership
token/attempt boundaries; abandoned claimed не считай безопасным retry по lease.
D1 и Telegram не транзакционны; exactly-once delivery не обещай.

## Неизменные границы

`src/index.ts` scheduled/fetch остаются no-op; Cron off, все окружения dry_run.
`readConfig()` не начинает принимать publish. Нет public data/admin/sync/publish
routes, webhook, `/start`, website, Stage 6 инфраструктуры или production policy
signoff. Нет реальных Telegram requests/sends, включая один staging post:
roadmap разрешает его **только после отдельного будущего согласия владельца**.
Локальное выполнение этого задания не требует токенов, каналов или Cloudflare login.

## Проверки, документация и остановка

Tests детерминированные: injected clock/fetch, synthetic fixtures, real local
Miniflare D1. Сохрани все Stage 4 регрессии, включая две review fixes и ADR-031.
Проверь renderer exact/date/unknown/offer/correction/withdrawal, escaping/URL/length,
no-evidence и unknown audience; dry_run zero HTTP/zero send journal; independent
baseline/approval/freshness gates; concurrent claims; replay/restart; bounded
retry/rate-limit; definitive rejection; malformed/timeout/5xx ambiguity; failure
to persist after successful mock response; blocked/uncertain не auto retry.

Используй `postman:api-engineer` и релевантные simulation/testing skills. Добавь
локальный contract-shaped Telegram mock, переиспользуй существующие upstream
mocks только если нужно для полного пути. Реальный HTTP к loopback substitute
должен пройти через изменённый client/publisher + настоящий local D1, с проверкой
request log, без pass-through в интернет. Новую simulation не push/deploy и не
привязывай shared workspace без разрешения; после теста останови процессы.

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

Дополнительно — документированный local HTTP simulation и opt-in integration
test. Website build неприменим. Обнови docs/ADR/checklists/README и создай
фактические Stage 5 report/handoff (следующие свободные номера docs).

Проведи независимое review, устрани существенные findings и повтори затронутые
проверки. Проверь полный tracked/untracked diff, секреты и сохранение guards.
В отчёте на русском раздели выполненное, tests/mocked/live evidence, assumptions,
pending production decisions и будущий live E2E, который **не проводился**.
После отчёта остановись: **не развёрнуто / не опубликовано**.
Commit/push/PR/merge и Stage 6 требуют отдельного нового разрешения.
