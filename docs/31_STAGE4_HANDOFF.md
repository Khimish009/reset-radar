# 31 — Передача контекста после локального Stage 4

Сохранено **2026-10-22, Europe/Moscow**. Текущая просьба владельца — подготовить
prompt следующей фазы и сохранить контекст, **не реализовывать Stage 5**.
[START_STAGE5.md](../prompts/START_STAGE5.md) подготовлен для отдельного явного
назначения: только локальный client/templates/publisher и HTTP substitutes,
без настоящих Telegram requests, deployment или Stage 6. Его отправка/явное
поручение выполнить файл принимает локальный Stage 4; подготовка сама по себе
не является таким поручением и не утверждает production policy.

## Проверенная Git-база и PR #4

Рабочая папка: **`/Users/salman/pet_projects/reset-radar`**. При подготовке
основная копия была чистой, ветка `main`, HEAD/local main/origin/main:
**`2a0a958941220dd1f9e8daf65e6ff666bcf52aed`**.

Stage 4 сохранён в **`712175673485360479a0141a771d7f0519781b23`**:
`feat: add local D1 ingestion and policy storage`, 24 файла. Владелец отдельно
разрешил только этот локальный commit, и агент его создал; старое разрешение
не распространяется на подготовку нового prompt/handoff или будущую реализацию.

Read-only GitHub connector подтвердил:

- [PR #4](https://github.com/Khimish009/reset-radar/pull/4) closed/merged,
  `merged_at=2026-10-21T21:53:45Z`, merge SHA `2a0a958941220dd1f9e8daf65e6ff666bcf52aed`.
- Head PR — `712175673485360479a0141a771d7f0519781b23`; его
  [CI run #11](https://github.com/Khimish009/reset-radar/actions/runs/39681931234)
  completed/success. Это CI implementation SHA, а не утверждение о новом запуске
  тестов при подготовке handoff или о всех workflow для merge SHA.
- Локально `7121756` — ancestor текущего main. PR #3 merge `2190622` и оба Stage 3
  P2 также входят в базу. Push/PR/merge PR #4 выполнил владелец/внешний процесс;
  агент в этой подготовке их не выполнял.

Remote main не обновлялся командой fetch в этой подготовке; приведённые
local refs и подтверждённый GitHub merge не заменяют следующую проверку.
В новой сессии сначала проверить status/staged/unstaged/untracked и актуальное
состояние PR/main. В папке останутся незакоммиченные docs/prompt этой подготовки:
не терять их при создании `feat/stage5-telegram-publisher`. Если использовать
новый clone до сохранения этих правок отдельным разрешённым commit, новых
prompt/handoff в нём не будет.

## История восстановления рабочей копии — больше не blocker

Ранее Stage 3 stash применили к старому main `0268056`, возник unmerged index.
После отдельного разрешения владельца создан verified backup, конфликты сняты,
local main fast-forward-нут до `2190622`, ветка Stage 4 открыта в основной папке.
Все 24 changed/new файла перенесены; проверено полное дерево из 153 файлов,
после чего обновлены только recovery docs. Stage 4 затем закоммичен и уже merged.

Старый `stash@{0}` сохранён: **`909e0e63c399e5b7f1e0dc42c7c1631df2cb34e1`**.
Он содержит четыре подготовительных документа Stage 3; они уже учтены в Stage 4.
**Не выполнять повторный stash pop/apply поверх main/Stage 5.**

Дополнительные локальные копии на этой машине сохранены:

- `/private/tmp/reset-radar-stage4` — detached HEAD `2190622` со старыми
  незакоммиченными файлами Stage 4. Это fallback, не актуальная рабочая база.
- `/private/tmp/reset-radar-git-recovery-20261022-3quhwgym` — SHA-256 verified
  backup файлов обеих копий и полного `.git`, including indexes/stash/reflogs.
  Внутри `manifest.json`, `transfer-verification.json`, `consolidation-result.json`.

При продолжении не редактировать эти копии и не удалять stash/worktree/backup
без отдельного разрешения. Нормальная работа идёт из основной папки с main,
который уже содержит Stage 4. История и проверки: [report](30_STAGE4_REPORT.md).

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

## Ограничения, важные для Stage 5

`D1Repository` пока не умеет читать очередь candidates или вести общий Telegram
journal: имеются только `claimSynthetic/completeSynthetic/getDelivery` и SQL
`synthetic_deliveries` с CHECK destination=`synthetic:`. Publication candidate
не означает production eligibility. `publishApprovedAt` изначально NULL,
activation setter отсутствует. Нельзя просто передать настоящий chat ID в
synthetic API или считать successful mock outcome реальной публикацией.

Для Stage 5 нужны явные bounded candidate queries, client/templates/publisher
interfaces и обоснованный journal seam. Только forward local migration, без
переписывания применённой `0001` и без ослабления её synthetic guards. В positive
integration tests — явная simulation и test-only policy/approvals; отсутствие
baseline/approval/freshness policy блокирует send. `dry_run` не вызывает client,
не создаёт send claims и не ставит sent. Worker config продолжает принимать
только dry_run, runtime wiring и real Telegram E2E не разрешены.

Renderer должен различать `upstreamReportedDelivery`, `record.delivered` и
`verifiedDelivery/action/reviewedEvidence`: ненулевой reported timestamp сам по
себе не даёт текст «подтверждена доставка». Claude applied может иметь неизвестное
время применения. Expected exact/date/unknown и date-only offer expiry не
превращаются в fake timestamps/countdown. Internal audit/rationale не публичны.
Production threshold, correlation, activation workflow и live send policy pending.

## Ранее выполненные проверки Stage 4

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

Stage 4 commit и PR #4 уже существуют; не создавать их повторно. Текущая
подготовка не разрешает новый commit/push/PR/merge или реализацию Stage 5.
Для начала новой фазы владелец должен явно поручить выполнить START_STAGE5.md.
Тогда разрешается только его локальный scope; remote D1/deploy/Telegram sends
и **Stage 6 всё равно требуют отдельного нового разрешения**.
**Не развёрнуто / не опубликовано.**
