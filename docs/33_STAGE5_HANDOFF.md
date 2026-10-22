# 33 — Handoff после локального Stage 5

Дата: **2026-10-22**. Владелец принял local Stage 4 из PR #4 и явно назначил
только `prompts/START_STAGE5.md`. После локального commit владелец отдельно
назначил три исправления внешнего review существующего PR #5, tests,
независимое review и commit/push только в его ветку. Дальнейшая фаза требует
нового задания владельца.

## Рабочая база и сохранённая подготовка

Папка `/Users/salman/pet_projects/reset-radar`, локальная ветка
`feat/stage5-telegram-publisher`, база Stage 5 и main/origin/main после fetch:
`2a0a958941220dd1f9e8daf65e6ff666bcf52aed`. PR #4 merged, CI implementation SHA
`7121756` — run #11 success, перепроверено read-only в этой задаче.
Первоначальный Stage 5 commit: `b9ab639918ad64b6cf92a28c32772aa2ec5ff591`.
Он уже находится в открытом [PR #5](https://github.com/Khimish009/reset-radar/pull/5),
head/remote branch `feat/stage5-telegram-publisher` перепроверены перед доработкой.
Новый commit/push разрешён только для этой существующей ветки, без force/merge.
SHA review follow-up следует брать из Git history; исходная база указана выше.

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
выполнены **42 PASS** client/templates и diff-check. Изменения готовы к разрешённым
commit/push только в существующую ветку PR #5; итоговый SHA — в Git history.
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

Miniflare/workerd требует loopback-доступа. Не запускать два полных D1 набора
одновременно: при конкуренции существующий retention test может превысить 5s.
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

Реальный Telegram E2E (включая один staging post) **не проводился**. Для review
follow-up разрешены commit/push только в существующую ветку PR #5. Новый PR, merge,
remote migration/resources/secrets, deploy, runtime wiring,
real Telegram requests и Stage 6 требуют отдельного нового разрешения.
**Не развёрнуто / не опубликовано.**
