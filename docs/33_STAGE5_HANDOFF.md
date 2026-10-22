# 33 — Handoff после локального Stage 5

Дата: **2026-10-22**. Владелец принял local Stage 4 из PR #4 и явно назначил
только `prompts/START_STAGE5.md`. После локального commit владелец отдельно
назначил три исправления внешнего review существующего PR #5, tests,
независимое review и commit/push только в его ветку. Дальнейшая фаза требует
нового задания владельца.

Последнее назначение: **сохранить контекст и подготовить промпт следующей фазы
для новой сессии**, без её реализации. Предыдущая доработка retention timeout
завершена, новый CI зелёный. Три предыдущих Stage 5 fixes повторно приняты;
архитектура не пересматривается. Подготовлен
[START_STAGE6](../prompts/START_STAGE6.md): только локальная подготовка staging
и dry-run runtime integration после отдельного явного назначения этого файла.
Подготовка/чтение промпта не разрешают runtime wiring или remote операции сейчас.

## Рабочая база и сохранённая подготовка

Папка `/Users/salman/pet_projects/reset-radar`. Перед подготовкой этого handoff
дерево чистое, ветка **main**, local main/origin/main:
**`ba8bd58d959e1716ab41ff1339c7ddf44877ff22`**. После подготовки остаются локальные
изменения документации и новый prompt; сохранить их при переходе в новую ветку.

Read-only GitHub verification 2026-10-22:
[PR #5](https://github.com/Khimish009/reset-radar/pull/5) **merged=true**, merged_at
`2026-10-22T08:06:57Z`, merge SHA `ba8bd58d959e1716ab41ff1339c7ddf44877ff22`.
Merge выполнил владелец/внешний процесс (`Khimish009`), не агент подготовки.

- Первоначальная реализация: `b9ab639918ad64b6cf92a28c32772aa2ec5ff591`.
- Три review fixes: `f8cb4ec854dd6a90f00a84ff6670c86103d9ab84`.
- CI timeout fix и последний PR head: `bb2cd25de54175f2c8518529862f8d1ce308c51a`.
- CI [run #15](https://github.com/Khimish009/reset-radar/actions/runs/39744232678)
  на `bb2cd25` — **completed/success**.
- CI [run #16](https://github.com/Khimish009/reset-radar/actions/runs/39745365708)
  на merge `ba8bd58` — **completed/success**, все steps job `119712350869` зелёные.

Предыдущая база Stage 4 — `2a0a958941220dd1f9e8daf65e6ff666bcf52aed` (PR #4),
implementation `7121756`, CI #11 success. Эти сведения — снимок проверки,
актуальные refs/CI нужно перепроверить в новой сессии. Старое разрешение commit/push
касалось завершённой доработки PR #5; на подготовку или Stage 6 не переносится.

Начальные подготовительные docs30/docs31/prompt сохранены. Старый stash,
detached worktree и recovery backup не применялись, не менялись и не удалялись;
их пути/SHA и история сохранены в [historical handoff](31_STAGE4_HANDOFF.md).
Не применять stash снова: его содержание уже учтено в Stage 4.

## Текущие интерфейсы

- `createLocalTelegramClient({baseUrl,fetch,clock,timeoutMs})` — только
  `http://127.0.0.1:<port>/…/telegram`, fixed synthetic token; POST sendMessage.
  Outcome: simulated_sent/retryable/rejected/uncertain_manual_review.
- `renderTelegramMessage(payload, {previousVersion}?)` — plain text preview;
  output либо `{ok:true,text}`, либо safe rejection reason. Correction/withdrawal
  требуют same-event lineage; publisher связывает previousTransitionId с prior
  immutable sequence в D1. Предыдущая Telegram URL не выдумывается.
- `createPublisherRepository(db)` — bounded keyset listCandidates/loadPrevious,
  getDelivery/claim/complete для отдельного `telegram_simulation_deliveries`.
  Forward migration `0002_stage5.sql`, immutable `0001` без изменений.
- `createPublisherService(repository,facts,{clock,client?,newToken?}).runPage()`
  принимает provider/limit/after/mode (`dry_run` или `simulate`) и explicit
  `SyntheticPublishPolicy`. Без policy/freshness/baseline/review → fail closed.
  `nextCursor` нужен для продолжения ограниченной страницы, в том числе если
  первые кандидаты уже blocked/устарели. Нельзя всегда читать только page 1.

Policy только `synthetic_stage5`/`local_test`, destination `synthetic:…`,
fixed synthetic chat ID `-1000000000005`. Provider approval baseline-bound;
transition approval rawKey-bound с reviewedAt. Production `publishApprovedAt`
не выставляется, setter отсутствует. Fact/assessment input остаётся доверенным
локальным seam, не HTTP/admin endpoint. Renderer не читает первичные посты и
не доказывает их содержание самостоятельно.

После внешнего review требуется пятый обязательный freshness limit
`maxEventAgeMs`: candidate/import/review age не заменяет возраст события.
Codex uses verified source delivery time; Claude uses canonical effective time
only when matching raw. Known historic exact time is never refreshed by a new
approval. Without trustworthy exact action time, a separate `currentRelevance`
assertion is required; every offer requires `current_offer` confirmation.
The proof is transition/rawKey-bound, its `confirmedAt` is the source's current
confirmation time and its URL must be in accepted evidence. Review time alone
does not confirm current availability. Future exact/date/unknown announcements
retain their evidence gates, and skipped historical events stay in D1.

Templates label verified timestamps as source-reported delivery/confirmation,
never precise per-account application time. Unknown Claude time stays unknown.
HTTP body cancellation starts once without awaiting its possibly hanging hook;
late rejections are caught and reader lock release is attempted in `finally`.

Freshness раздельна: candidate creation, review/approval age, successful ingest,
HTTP checkedAt, current sourceGeneratedAt/sourceReviewedAt. Проверяются retained
snapshots и отсутствие backoff/failures. Claude требует status и history;
Codex — выбранный feed. Missing configuration не заменяется default approval.
Current transition/rawKey/current review сверяются с immutable version;
atomic claim дополнительно сверяет provider generation/current observation.
Generation включён в сам candidate SELECT snapshot, поэтому обновление metadata
между SELECT и evaluation/claim также подавляет stale snapshot. Cursor range
проверен D1 EXPLAIN, без optional-OR, вызывающего prefix scan поздних страниц.

`dry_run` не касается клиента/claims/journal. Retry возможен только после
validated bounded 429, persisted retryAt и максимум 3 attempts. Abandoned
claimed, uncertain, rejected и simulated_sent автоматически не повторяются.
После возможного send ошибка D1 completion оставляет blocked claim; exactly-once
гарантии нет. Environment simulation нельзя переиспользовать как real delivery.

## Проверки и evidence

См. [Stage 5 report](32_STAGE5_REPORT.md) для первоначальных команд/результатов:
typecheck/lint PASS; full **282 passed / 4 opt-in skipped**; local D1 **43 PASS**;
local migrations PASS, повтор без pending migrations; offline verify **139 PASS**.
Stage 5 HTTP+D1 test отдельно **1 PASS**, 11 synthetic sends received by mock;
stand-in остановлен. Unit regression закрывает найденный AbortError cancellation
rejection. Независимое `stage5_review` завершено: существенных оставшихся findings
нет, все три medium закрыты. Reviewer independently client/templates **37 PASS**
и publisher/storage на local D1 **19 PASS**; детали fixes в report.

PR #5 follow-up: typecheck/lint PASS, полный Vitest **299 passed / 4 opt-in skipped**,
`test:d1` **55 PASS**, verify **139 PASS**, diff-check PASS. Повторная local
HTTP+D1 simulation **1 PASS**, 11 synthetic send receipts, процесс остановлен.
Проверка hanging cancellation hook — unit stream regression; loopback HTTP
дополнительно проверяет реальный client/publisher/D1 путь и обычный body timeout.
Независимое `pr5_followup_review` завершено без существенных замечаний; отдельно
выполнены **42 PASS** client/templates и diff-check. Исправления закоммичены и
отправлены в существующую ветку PR #5 в рамках отдельного прежнего разрешения.
Code, source state и production guards не deploy-ились.

Повторные команды:

```sh
npm run typecheck
npm run lint
npm test
npm run test:d1
npm run d1:migrate:local
python3 docs/evidence/stage0-2026-10-21/verify.py
git diff --check
```

Miniflare/workerd требует loopback-доступа. Обычный параллельный Vitest сохранён.
Retention test с 103 реальными D1 commits имеет собственный timeout 20s после
failure run #14 на старом лимите 5s. Глобальный timeout не менялся. Loop проверяет
каждый successful commit, итоговый generation 103, последние 100 generations
4–103, очистку source/commit guards и сохранность исходного event. Начальный CAS
generation цикла исправлен: прежний fixture молча пропускал один stale attempt.
CI-fix local verification: три обычных параллельных Vitest прогона **299 PASS /
4 skipped** каждый, `test:d1` **55 PASS**, typecheck/lint PASS, verify139/diff-check
PASS. `pr5_ci_timeout_review` завершён без существенных замечаний. Новый remote
CI #15 прошёл: **299 passed / 4 skipped**, retention test **5346ms**, verify139
PASS. Тест действительно превысил прежний лимит 5s и завершил все assertions
в новом локальном бюджете 20s. После merge также прошёл CI #16.
При подготовке следующего промпта production-код не менялся; прежние тесты
не выдаются за новые локальные прогоны этой подготовки.
Opt-in simulation и shutdown команды: [evidence](evidence/stage5-2026-10-22/simulation.md).
Previews всех truth cases: [previews](evidence/stage5-2026-10-22/previews.md).

## Разрешения и pending решения

`src/index.ts`/env/runtime handlers инертны, configs dry_run/Cron off, public API
не добавлен, website отсутствует. Источники/Stage 4 truth safeguards сохранены.
Текущий Codex normalizer не производит correction/withdrawal; их previews
являются synthetic renderer cases, не доказательством нового upstream capability.
Существующий Claude credit/offer correction guard также остаётся fail closed в
needs_review. Renderer умеет показать supported исправленные expiry/effective
facts, но не расширяет upstream normalization eligibility.
Production evidence/eligibility/freshness, manual operations, real journal
adapter и publication activation остаются отдельными решениями.

## Следующая фаза: пробелы и точка продолжения

Полный Stage 6 roadmap требует работающего Cloudflare staging. Подготовленный
prompt разрешает при отдельном назначении **только локальную часть**: безопасное
dry-run runtime wiring, local D1/HTTP integration и reviewable staging plan.
Это не выполнение acceptance «stable staging» и не разрешение remote E2E.

- `Env` пока содержит только APP_ENV/PUBLISH_MODE, без DB binding; `readConfig()`
  принимает только dry_run. `scheduled()` — no-op, публичные reserved paths — 501,
  остальные reads — 404, writes — 405. Public data API относится к Stage 9.
- В `wrangler.json` нет D1 bindings/routes, Cron пуст во всех окружениях,
  workers_dev/preview_urls отключены. `wrangler.d1.local.json` отдельно задаёт
  local-only D1; не подставлять выдуманный remote UUID.
- Ingestion вызывается напрямую; manual assessments — доверенный локальный seam.
  Нет автоматической проверки первичных постов или production approval workflow.
  Без assessment событие может остаться needs_review: это ожидаемая защита.
- Client/policy/journal реализованы **только для simulation**. Их нельзя выдать
  за готовый real Telegram publisher, снять synthetic CHECK или передать настоящие
  credentials/destination. Локальный dry-run должен работать без Telegram client
  и оставлять оба send journals без новых записей.
- Production freshness/activation, real journal/client и живые staging sends
  требуют дальнейшего отдельного решения. Merge не является policy signoff.

Реальный Telegram E2E (включая один staging post) **не проводился**. Текущая
подготовка не разрешает commit/push/PR/merge, remote migration/resources/secrets,
deploy, runtime wiring или начало Stage 6. Новая сессия получает локальный scope
только после явного поручения выполнить START_STAGE6; remote действия и реальные
Telegram requests остаются за отдельным новым разрешением.
**Не развёрнуто / не опубликовано.**

## Проверки подготовки новой сессии

Изменены только README, docs08/32/33, owner checklist и новый START_STAGE6.
`git diff --check` PASS; проверка шести документов — **47 local link targets PASS**;
Stage 0 offline verification — **139 PASS**. Typecheck/lint/Vitest/D1 заново не
запускались: production/test/config code не менялся. Независимый
`stage6_prompt_review` (reviewer, gpt-6.1-sol, high) завершён без существенных
замечаний: проверены полнота контекста, соответствие runtime и границы разрешений.
Подготовка сохранена локально без commit/push, Stage 6 не начат.
