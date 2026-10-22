# 30 — Отчёт локального Stage 4

Дата: **2026-10-22, Europe/Moscow**. Владелец принял Stage 3 с обоими P2
исправлениями PR #3 и явно поручил только локальный `START_STAGE4.md`.
**Не развёрнуто / не опубликовано.**

## Выполнено и границы

Реализованы SQL migration, D1 repository, shared normalization/policy и прямо
вызываемый ingestion/bootstrap service с injected clock/fetch. D1 хранит canonical
events, immutable observations/material versions, provider/source health,
независимые baseline и synthetic delivery journal. Идентичность namespaced;
upstream revision, raw assessment binding и material hash разделены. Codex
revision не выдумывается. Внутренний Codex source key включает JSON tuple
`[event|scheduled, raw ID|URL]`; точный upstream ID остаётся в provenance. JSON key order, generated/check time, ETag и editorial
display text сами по себе не создают material version. Изменение scope, evidence,
action, precision и archive credit учитывается.

Полный Claude snapshot объединяет завершённую counted history и status surfaces
(включая offers/announcements/ambiguous), проверяя revision, total, фильтры и
совпадающие ID. Codex остаётся одним непагинируемым feed `codexreset.ai`.
Partial/error/schema failure не завершают baseline. Baseline фиксируется одним
batch с необходимыми events/observations/source state; первый import каждого
provider создаёт **ноль publication candidates**, в том числе для свежей строки.
Publication approval обоих provider остаётся `NULL`.

ETag хранится вместе с versioned, scope-bound, digest-checked representation,
которое повторно проходит parser при restart. Один validator не разрешает
`304`/baseline. HTTP cache ограничен 128 representations/provider; restore TTL
24 часа, очистка истёкших данных выполняется при следующем вызове service.
Последний валидный cache сохраняется при ошибке, backoff восстанавливается.
Durable факты не содержат полного summary/title/excerpts/when_text. Полные
представления нужны только для ограниченного внутреннего conditional cache;
это не разрешение долговременно зеркалить чужую редакционную историю.

Первое обнаружение события и текущей raw записи сохраняется независимо от
announcement, source generation/review, last observation и successful sync.
Валидная часть незавершённого snapshot сохраняет detection metadata для
последующего полного baseline. Missing records/scheduled не удаляются и не
становятся withdrawal или delivery. Primary evidence assessment — только
доверенный локальный ввод после semantic review; его нельзя получить через HTTP.
Сохранённый assessment повторно используется только для точной raw записи.
Claude shared policy дополнительно требует content binding и reviewed banked
assertion. Future exact/date/unknown и подтверждённая позднее доставка разделены.
Наступивший exact/date target без delivery evidence консервативно меняет текущее
состояние future announcement на review; прежняя версия/evidence сохраняются,
publication candidate не создаётся. Это локальный выбор (ADR-031), не
production staleness signoff. Claude correction/withdrawal ссылаются на фактически сохранённую предыдущую
версию; replay читает именно эту immutable version.

Generation CAS внутри D1 batch защищает от конкурирующего snapshot commit.
Failure statement откатывает batch; UNIQUE constraints и immutable triggers
проверены на локальном workerd D1. Synthetic claims имеют уникальность
event/transition/destination, compare-and-set completion по token и только
`synthetic:` destinations. Повтор разрешён лишь после `retryable`; `sent`,
`rejected`, `uncertain_manual_review` и незавершённый `claimed` автоматически
не отправляются повторно. Между D1 и реальной отправкой транзакции нет;
exactly-once delivery не утверждается.

Worker `scheduled()`/`fetch()`, runtime guards и `wrangler.json` не менялись.
Cron выключен, окружения `dry_run`. Telegram client/templates/send, admin/data
endpoints, website и Stage 5 не реализовывались.

## Git-база и сохранение существовавшей работы

GitHub connector повторно подтвердил PR #3 merged, merge SHA
`2190622c0ace8f539b3eed788e33a9d68bbcdd91`, head P2
`06a90a97629704fce04a1e272ff9e75a89acb446` и successful CI run #9
([исторический PR](https://github.com/Khimish009/reset-radar/pull/3),
[CI](https://github.com/Khimish009/reset-radar/actions/runs/39674152811)).
Разрешённый `git fetch origin` обновил `origin/main` с `0268056` до `2190622`;
ancestry P2 SHA проверена локально.

Исходная папка `/Users/salman/pet_projects/reset-radar` уже содержала unmerged
index: README/docs08 `UU`, docs28/docs29 `DU`, untracked START_STAGE4.
`MERGE_HEAD` отсутствовал; local main находился на Stage 2. Чтобы сохранить
всю работу без reset/clean/stash/merge/commit, создан отдельный worktree:

```text
/private/tmp/reset-radar-stage4
ветка feat/stage4-d1-policy
HEAD / база: 2190622c0ace8f539b3eed788e33a9d68bbcdd91
```

В него перенесены подготовительные четыре документа из сохранённой Stage 3
стороны index и START_STAGE4. Исходная рабочая копия и её конфликты не менялись;
local main не fast-forward-ился из-за unmerged index. Реализация находится
**в указанном worktree**, index там пуст, новые файлы остаются untracked.
Commit не создавался; новый PR не создавался.

## Изменённые файлы

- Код: `src/domain/normalization.ts`, `src/services/ingest.ts`,
  `src/storage/{types,d1}.ts`, `migrations/0001_stage4.sql`.
- Local/test: `wrangler.d1.local.json`, `tests/helpers/d1.ts`,
  `tests/stage4-{normalization,storage,ingest,ingest-simulation}.test.ts`.
- Зависимости/scripts: `package.json`, `package-lock.json`; прямой dev dependency
  `miniflare@5.20261019.1-beta` совпадает с версией установленного Wrangler.
- Docs: README, docs03/06/08/09, owner checklist, этот report и `31_STAGE4_HANDOFF.md`.
- Сохранённая подготовка владельца/предыдущей сессии: docs28/29 и
  `prompts/START_STAGE4.md`; исходные конфликты сохранены отдельно, не потеряны.

## Реальные проверки

Команды выполнялись в `/private/tmp/reset-radar-stage4`, Node `v22.22.2`.

| Команда | Результат |
|---|---|
| `npm run typecheck` | PASS: Wrangler runtime types и оба strict TS проекта |
| `npm run lint` | PASS: zero warnings |
| `npm test` | PASS: **226 passed / 3 opt-in skipped**, включая real local D1 |
| `npm run d1:migrate:local` | PASS: `0001_stage4.sql`, 23 commands, отдельная test D1, явно `--local`; финальный повтор: no migrations to apply |
| `npm run test:d1` | PASS: **24** real local D1 integration tests на финальном коде |
| `python3 docs/evidence/stage0-2026-10-21/verify.py` | PASS: **139** offline assertions; архив не менялся |
| `git diff --check` | PASS; дополнительно проверены все 24 changed/new text files: whitespace, conflict markers, credential signatures |
| `postman simulation run postman/simulations/codex-local.sim.yaml --port 4902 --output ndjson --no-history` | CLI 1.75.0, existing synthetic Codex/Claude mocks, только loopback |
| `env STAGE4_SIMULATION_URL=http://127.0.0.1:4902 npm test -- --run tests/stage4-ingest-simulation.test.ts` | PASS: **1**, реальный HTTP + D1 runtime restart, 18 requests в финальном прогоне, 36 за два успешных прогона; 304, 429/503/schema failures, source isolation; simulation остановлена SIGINT, exit 0 |
| Независимое review | `stage4_review`, reviewer / gpt-6.1-sol / high: **нет оставшихся critical/high/medium**; независимо 226 PASS / 3 skipped, typecheck/lint/verify139/diff-check PASS |
| Website build | Неприменим к Stage 4 |

Первые запуски без sandbox escalation останавливались на loopback `EPERM`;
успешными считаются последующие реальные локальные прогоны. Стандартный npm
cache дал EACCES даже вне sandbox: установка использовала отдельный временный
cache, не меняя системные права. Первоначальный D1 harness был адаптирован к
Miniflare 5 через его экспортированный compatibility converter и Wrangler SQL
splitter; полные последующие тесты используют реальный binding. Runtime выводит
нефатальный Node `punycode` deprecation warning. Неуспешные попытки не выданы за
прошедшие проверки.

## Независимое review и исправления

Reviewer `stage4_review` (зарегистрированная роль reviewer, `gpt-6.1-sol`,
reasoning high) независимо прочитал код, migration, tests, tracked/untracked
изменения и исходный prompt. Он воспроизвёл и подтвердил два medium finding:

1. Unknown-time Claude override мог повысить явную correction/retraction до
   future announcement. Теперь override требует `raw.correction === null` и
   только причину `future_target_not_established`; две регрессии PASS.
2. Event ID Codex мог совпасть с scheduled URL. Внутренние ключи обеих surfaces
   теперь кодируют `[surface, raw key]`, включая durable lookup; valid collision
   сохраняет два разных события и replay без новых versions.

Оба исправления повторно проверены reviewer. Его финальный полный прогон:
**226 PASS / 3 skipped**, typecheck/lint/verify139/diff-check PASS. Оставшихся
critical/high/medium findings нет. Migration и HTTP simulation выполнял главный
агент; reviewer не приписывает себе эти проверки.

## Факты, допущения и риски

- Семантика D1 batch/prepared statements проверена по первичным документам
  [D1 Database](https://developers.cloudflare.com/d1/worker-api/d1-database/) и
  [Prepared statements](https://developers.cloudflare.com/d1/worker-api/prepared-statements/),
  rollback/constraints — на реальном локальном runtime. Remote D1 не проверялся.
- Baseline и outcomes в тестах **synthetic**; реальный upstream baseline не
  импортировался. В этой сессии live tracker APIs/primary posts не запрашивались.
- Полнота Codex принимается из непагинируемого контракта; Claude checks доказывают
  только согласованность доступных поверхностей. Полная официальная история
  не гарантируется.
- Local candidate — предложение дальнейшей policy, не production eligibility.
  Staleness thresholds, production assessment workflow/correlation, activation,
  реальная delivery policy и retention audit данных остаются pending.
- Разные Codex IDs не объединяются эвристически; correction/withdrawal без
  поддержанного доказанного lineage остаются review. Никакого tracker fallback.
- Miniflare 5 beta и Wrangler SQL splitter закреплены версиями; обновление
  инструментов требует повторения D1 integration tests. Batch строится на полный
  локальный snapshot; production limits/нагрузка требуют следующей оценки.
- Исходная папка остаётся конфликтной. Незакоммиченный worktree в `/private/tmp`
  необходимо сохранить при продолжении; не удалять до отдельного решения.

## Действия владельца и остановка

Принять локальный результат Stage 4 либо запросить исправления. Для commit,
push, PR, merge, remote migration/resources/secrets/deploy, Telegram sends и
Stage 5 требуется отдельное новое разрешение. Production publish signoff
не получен, provider approvals не выставлены. Никаких действий владельца в
Cloudflare/Telegram для просмотра локального результата не требуется.

**Не развёрнуто / не опубликовано. Stage 5 не начат.**

## Последующая консолидация Git — 2026-10-22

После отчёта владелец отдельно подтвердил предложенный план переноса результата
в основную папку без commit/push/PR и без слияния Stage 4 в main.

- Backup: `/private/tmp/reset-radar-git-recovery-20261022-3quhwgym`, проверен
  SHA-256 для 125 файлов исходной копии, 153 файлов Stage 4 и 339 файлов Git
  metadata, включая unmerged index, оба worktree index, stash и reflogs.
- Конфликтующие entries четырёх документов сначала закрыты через локальный
  `git add`, затем восстановлены до старого HEAD через scoped `git restore`.
  Это подготовка index, не commit; итоговый index пуст.
- `git merge --ff-only 2190622c0ace8f539b3eed788e33a9d68bbcdd91` обновил только
  local main с `0268056` до уже существовавшего merge PR #3. Новый commit не создан.
- `git switch --detach HEAD` во временном worktree освободил ветку;
  `git switch feat/stage4-d1-policy` открыл её в основной папке.
- Перенесены все 24 changed/new файла; проверено совпадение всех 153 файлов
  дерева Stage 4. После проверки обновлены только README, этот report и handoff,
  чтобы текущий рабочий путь указывал на `/Users/salman/pet_projects/reset-radar`.
- Stash `909e0e63c399e5b7f1e0dc42c7c1631df2cb34e1` и временный worktree сохранены.
  Повторный `stash pop` не нужен: подготовительные правки уже учтены в Stage 4.

Повторные проверки из основной папки: `npm run typecheck` PASS,
`npm run lint` PASS, `npm test` **226 passed / 3 opt-in skipped**,
`python3 docs/evidence/stage0-2026-10-21/verify.py` **139 PASS**,
`git diff --check` PASS. Unmerged entries отсутствуют; index пуст.
Stage 4 остаётся незакоммиченным. Stage 5 не начат; remote операции и Telegram
sends не выполнялись. **Не развёрнуто / не опубликовано.**

## Последующее разрешение локального commit — 2026-10-22

После консолидации и повторных проверок владелец явно поручил «коммить».
Разрешение относится к одному локальному commit текущего результата Stage 4
в ветке `feat/stage4-d1-policy`, включая все 24 changed/new файла, сохранённые
подготовительные документы и обновлённый Git handoff. Фактический SHA хранится
в Git history (`git log -1`), без самоссылки внутри commit.

Код, migration и tests совпадают с проверенным результатом; дополнены только
документы о разрешении commit. Повторный полный прогон не требовался: последний
прогон из основной папки дал typecheck/lint PASS, **226 tests PASS / 3 opt-in
skipped**, verify139 PASS. Перед commit проверяются полный staged состав,
whitespace, conflict markers и credential signatures. Stash и backup сохраняются.

Push/PR/слияние Stage 4 в main, remote migrations/deployment, Telegram sends
и Stage 5 не разрешены. **Не развёрнуто / не опубликовано.**

## Следующий handoff — проверка PR #4, 2026-10-22

Локальный commit фактически создан: **`712175673485360479a0141a771d7f0519781b23`**,
`feat: add local D1 ingestion and policy storage`, 24 файла. Затем владелец/внешний
процесс выполнил push/PR/merge. Read-only connector подтвердил
[PR #4](https://github.com/Khimish009/reset-radar/pull/4) merged
`2026-10-21T21:53:45Z`, merge SHA **`2a0a958941220dd1f9e8daf65e6ff666bcf52aed`**,
head `7121756`, [CI run #11](https://github.com/Khimish009/reset-radar/actions/runs/39681931234)
completed/success. При проверке основная папка чистая, main/origin/main/HEAD на
`2a0a958`. Агент этой подготовки Git write/remote операций не выполнял.

Владелец запросил только prompt для новой сессии и сохранение контекста:
[START_STAGE5](../prompts/START_STAGE5.md) и [актуальный handoff](31_STAGE4_HANDOFF.md).
Эта подготовка не начинает Stage 5; дальнейший local publisher запускается только
явным назначением нового файла. Новый commit/push/PR/merge, реальные Telegram
requests, remote migrations/deployment и Stage 6 не разрешены. Новые docs/prompt
сохраняются локально без автоматического commit.

Проверки этой подготовки:

- `python3 docs/evidence/stage0-2026-10-21/verify.py` — **139 PASS**, offline.
- `git diff --check` — PASS. Дополнительно проверены все шесть изменённых/новых
  документов: 35 локальных Markdown-ссылок, final newline/whitespace,
  conflict markers и credential signatures — PASS.
- Индекс пуст; HEAD и stash не изменены. `7121756` — ancestor main, дерево merge
  совпадает с implementation commit. Изменений кода, tests или migrations нет.
- `stage5_prompt_review` (docs, gpt-6-luna, high) независимо проверил scope и
  согласованность prompt/handoff/roadmap/checklist: существенных замечаний нет.

Typecheck, lint и application/D1 tests в этой подготовке заново не запускались:
приведённые выше результаты относятся к финальному коду Stage 4.
**Не развёрнуто / не опубликовано.**
