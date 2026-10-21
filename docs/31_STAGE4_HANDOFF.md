# 31 — Передача контекста после локального Stage 4

Дата: **2026-10-22, Europe/Moscow**. Текущая разрешённая задача — только
`prompts/START_STAGE4.md`: owner принял Stage 3 с PR #3 fixes и разрешил локальные
D1/normalization/policy/baseline/journal. Stage 5 не разрешён.

**Работать с результатом в `/Users/salman/pet_projects/reset-radar`**, ветка
`feat/stage4-d1-policy`, база `2190622c0ace8f539b3eed788e33a9d68bbcdd91`.
После проверок и консолидации владелец отдельно разрешил локальный commit всего
результата Stage 4 вместе с подготовительными документами и Git handoff.
Фактический SHA смотреть в `git log -1`; перед продолжением проверить
status/staged/unstaged/untracked и актуальное поручение. Push/PR не разрешены.

После Stage 4 владелец отдельно разрешил локальную консолидацию Git. Конфликты
после применения Stage 3 stash на старый main сняты после проверенного backup;
local `main` fast-forward-нут с `0268056` до `2190622`, без нового commit.
Временный `/private/tmp/reset-radar-stage4` переключён на detached HEAD того же
SHA, ветка Stage 4 открыта в основной папке. Все 24 changed/new файла перенесены;
перед обновлением этих трёх документов проверено побайтовое совпадение полного
дерева из 153 файлов с подготовленной копией Stage 4. Код, tests, migration и
конфигурация не изменялись при переносе.

`stash@{0}` сохранён: `909e0e63c399e5b7f1e0dc42c7c1631df2cb34e1`.
Проверенный backup файлов обеих копий и полного `.git` (включая оба index и stash):
`/private/tmp/reset-radar-git-recovery-20261022-3quhwgym`.
SHA-256 manifest и `transfer-verification.json` находятся внутри backup.
Временный worktree тоже сохранён с исходными незакоммиченными файлами Stage 4;
новые правки теперь делать только в основной папке, чтобы копии не расходились.
Не применять этот stash повторно поверх Stage 4: его четыре документа уже учтены.
Details: [фактический report](30_STAGE4_REPORT.md).

PR #3 повторно проверен merged; CI P2 SHA successful; разрешённый fetch получил
remote main `2190622`. Оба P2 присутствуют по ancestry. Исторические docs28/29
и START_STAGE4 перенесены из подготовительных правок исходной копии. До нового
поручения на локальный commit результат был незакоммиченным; merge Stage 4,
push и PR не выполнялись.

## Реализованные интерфейсы

- `createD1Repository(db)` — `loadProvider/loadEvents/loadSources/loadVersion`,
  atomic `commitSnapshot`, `claimSynthetic/completeSynthetic/getDelivery`.
  Migration `migrations/0001_stage4.sql`, design/ADR docs03/09.
- `normalizeClaude/normalizeCodexEvent/normalizeCodexScheduled` — payload с
  factual raw/provenance, expected/verified time, raw digest/accepted assessment.
  `LocalAssessment.recordKey = await rawAssessmentKey(provider, raw)`; он задаётся
  только после доверенного semantic review. Код не читает primary posts.
- `createIngestionService(repository, dependencies).ingestProvider(provider, options)`
  или `.ingestAll(options)` — только прямой локальный вызов. Options принимает
  assessments и bounded Claude history options. Handler’ы service не импортируют.
- Codex storage `externalId` — JSON tuple `[event|scheduled, raw ID|URL]`; точный
  upstream ID/URL остаётся в `record.provenance.externalId`. Нельзя искать события
  обоих типов по ненеймспейсированному raw key.
- Provider generation CAS проигравший возвращает `concurrent_sync`; повтор можно
  вызвать отдельно. Нельзя автоматически считать такой результат успешным sync.
- First complete baseline каждого provider suppresses все candidates независимо
  от дат строк. Approval `NULL`, synthetic journal не production publisher.
- Полный snapshot — Claude full history + consistent status union; Codex один
  strict unpaginated feed. Partial/error не заменяет complete canonical history.
- Scoped HTTP representation+validator сохраняются вместе; restore заново
  проверяет version/scope/digest/parser. Restore TTL 24h, до 128 representations,
  backoff persisted; garbage cleanup при следующем вызове. Missing rows/scheduled
  не удаляются. Detection metadata переживает restart и partial→complete.
- Claude correction/withdrawal assessment указывает `previousTransitionId`;
  `loadVersion` читает настоящий прежний payload, поэтому replay сохраняет
  lineage. Codex IDs не связывать по времени/тексту.

## Проверки и ограничения

Typecheck/lint PASS, полный Vitest **226 passed / 3 opt-in skipped**, Stage 0
verify **139 PASS**, local migration PASS. Stage 4 opt-in HTTP simulation с
существующими Postman mocks — **1 PASS**, 18 requests финального прогона; это synthetic substitutes, не live
upstream. Два успешных прогона дали 36 logged requests; simulation остановлена
SIGINT, exit 0. `test:d1` 24 PASS, повтор migration без новых pending migrations.
Независимый `stage4_review` (reviewer, gpt-6.1-sol, high) завершён: существенных
оставшихся findings нет; независимо выполнены full226/3, typecheck/lint,
verify139/diff-check. Два medium findings исправлены: Claude explicit correction
не повышается unknown future override; Codex event/scheduled tuple namespaces
не коллидируют при равных raw ID/URL. Точные результаты и пределы — в report.

```sh
npm run typecheck
npm run lint
npm test
npm run test:d1
npm run d1:migrate:local
python3 docs/evidence/stage0-2026-10-21/verify.py
git diff --check
```

Loopback для Miniflare/workerd может требовать sandbox escalation. Миграционный
script содержит `--local` и отдельную local-only конфигурацию; не заменять его
remote командой. Для HTTP substitute использовать existing
`postman/simulations/codex-local.sim.yaml` на 4902 и
`STAGE4_SIMULATION_URL=http://127.0.0.1:4902` с
`tests/stage4-ingest-simulation.test.ts`; останавливать simulation после проверки.
Full cache representations — transient internal data, не публичная проекция.
Logger/public API не получают внутренние audit payloads.

Production completeness/truth/eligibility, stale threshold, correlation,
activation и реальные sends всё ещё pending. No-op Worker, Cron off, dry_run
сохранены. Website/public data endpoints/Telegram publisher не добавлены.

Разрешён только отдельный локальный commit текущего результата. После него
остановиться. Push/PR/слияние Stage 4 в main, remote D1/deploy/Telegram sends
и **Stage 5 требуют отдельного нового разрешения**.
**Не развёрнуто / не опубликовано.**
