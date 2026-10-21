# Новая сессия — только Stage 4: локальная D1 и shared normalization/policy

Ты работаешь в `/Users/salman/pet_projects/reset-radar`, проект **Reset Radar | AI Limits**.
Прочитай `AGENTS.md`, `README.md`, [актуальный handoff](../docs/29_STAGE3_HANDOFF.md),
[отчёт Stage 3](../docs/28_STAGE3_REPORT.md) и выполни это задание в указанных границах.

**Отправляя этот промпт или явно поручая выполнить этот файл, я принимаю локальный
результат Stage 3 с обоими P2 исправлениями PR #3 и разрешаю только локальный Stage 4:
D1 schema/storage, shared normalization/policy, provider baseline и delivery journal.**
Подготовка, сохранение, чтение или review этого файла сами по себе не разрешают
реализацию. Если поручено лишь подготовить следующий промпт — код не менять.
Разрешение не включает Stage 5, Telegram publisher, production policy signoff,
commit/push/PR, merge, remote resources/migrations или deployment.

## Git-база и начало

1. Проверь `git status --short --branch`, staged/unstaged/untracked, историю и refs.
   Сохрани имеющуюся работу; не выполняй reset/clean/stash и не перезаписывай ветки.
   В этой папке могут оставаться не закоммиченные prompt/handoff/README/roadmap.
2. Перепроверь [PR #3](https://github.com/Khimish009/reset-radar/pull/3), CI и main.
   Последняя проверка подготовки: PR **merged=true**, merged_at=`2026-10-21T20:56:29Z`,
   merge SHA **`2190622c0ace8f539b3eed788e33a9d68bbcdd91`**; remote main тот же.
   Итоговый Stage 3 P2 SHA — **`06a90a97629704fce04a1e272ff9e75a89acb446`**,
   CI [run #9](https://github.com/Khimish009/reset-radar/actions/runs/39674152811)
   completed/success. Implementation SHA — `dbf5e3cce1047a3188d710b37456136f3d6313db`.
   Это историческая проверка, не гарантия актуального remote. Агент merge не выполнял.
3. Работай в новой локальной ветке **`feat/stage4-d1-policy`** от актуального main
   с полным Stage 3 и обоими P2. В рамках явно назначенного Stage 4 разрешены
   read-only GitHub, `git fetch origin`, безопасное fast-forward обновление local main
   и создание этой ветки с сохранением текущих правок. Не коммить их автоматически.
   Сверяй содержание при squash/rebase, а не только ancestry старого SHA.
   Если main не содержит результата, PR снова открыт или существующая Stage 4
   ветка имеет другую базу — не выполняй merge/rebase/reset самовольно. Сообщи
   фактическое состояние и запроси отдельное решение по базе; чтения продолжай.
4. Прочитай релевантные [roadmap](../docs/08_DEVELOPMENT_PLAN.md),
   [architecture](../docs/02_ARCHITECTURE.md), [D1 blueprint](../docs/03_DATA_AND_STATE.md),
   [ADR](../docs/09_DECISIONS.md), [test strategy](../docs/06_TEST_STRATEGY.md),
   [truth table](../docs/22_STAGE0_TRUTH_TABLE.md), раздел ранних анонсов в
   [requirements](../docs/01_PRODUCT_REQUIREMENTS.md). Контракты/evidence Stage 0–3
   читай адресно; не повторяй исследование источников и не перечитывай все docs.
5. Изучи существующие domain/provider/runtime types, оба adapters/mappers и тесты.
   Сохрани strict TypeScript, npm/Vitest и исправления предыдущих этапов.
   Применяй релевантные навыки и зарегистрированные роли по AGENTS.md; проведи
   независимое финальное review. Рутинные локальные implementation choices решай
   самостоятельно; не выдавай их за утверждённую production policy.

## Разрешённая локальная реализация

- Проектируй и реализуй SQL migrations, D1 repository/storage и typed shared
  normalization/policy. `docs/03` — blueprint, а не уже утверждённый SQL.
  Обоснуй схему, ограничения, индексы и atomic boundaries; актуальное поведение
  D1 transactions/batch/prepared statements проверь по первичной документации и
  реальному локальному D1. Не предполагай все возможности обычного SQLite.
- Храни canonical events, immutable versions/material transitions, source health
  и sync metadata, независимые provider baseline/activation flags и delivery
  journal. Namespaced source identity, unique constraints, prepared/bound SQL
  и проверяемая идемпотентность обязательны. Внутренние audit данные не должны
  стать будущей публичной проекцией или попадать в logger.
- Сохрани raw kind/status, upstream ID/revision (если он есть), исходные URL,
  primary evidence, assessment binding/rationale, scope/audience, seeded/archive
  credit и precision. Времена announcement, upstream-reported delivery,
  verified delivery, source generation/review, first detection, last observation
  и successful sync не смешивай. Неизвестное не восстанавливай из ts/date/полуночи.
- Сохрани source-specific проверенные expectedTime/verifiedFutureTarget и
  `detectedAt` в durable локальной модели. Повторный sync/304/перезапуск с тем же
  D1 не должен сдвигать первое обнаружение. Новое содержимое/transition может
  получить отдельную observation, сохраняя первоначальную историю.
- Раздели upstream revision, assessment key и наш material content hash.
  Не изобретай upstream revision для Codex. JSON key order, новый ETag,
  generated_at/check time и производный display text сами по себе не создают
  материальную transition или publication candidate. Существенные изменения
  evidence/scope/action/precision учитывай; stale assessment не переносится на
  новую raw запись только потому, что часть material fields совпала.
- Реализуй локально вызываемый ingestion/bootstrap flow с контролируемыми inputs,
  clock и fetch. Для Claude baseline охвати релевантные history/status surfaces,
  включая offers и объявления, а не только counted history. Для Codex feed
  непагинируемый. Определи критерий полного/согласованного snapshot каждого provider.
  Частичная history, schema/transport failure и неизвестная полнота не завершают baseline.
- Полный baseline фиксируется атомарно с необходимыми observations/state.
  Первый import даёт **ноль publication intents для baseline**, даже для свежей
  по дате строки. Повторный baseline идемпотентен. Baseline одного provider не
  завершает и не активирует другой; publish approval по умолчанию отсутствует.
- D1 — источник истины между запусками. Если сохраняешь HTTP validators/cache,
  обеспечь восстановление соответствующего валидного snapshot и его scope;
  один ETag без представления не делает 304 пригодным для bootstrap. Сохрани
  provider/endpoint/query isolation, backoff и последний валидный snapshot при ошибках.
  Отсутствующие строки/scheduled не удаляй и не превращай в withdrawal/delivery.
  Не считай fair use разрешением полного долговременного зеркала чужих summaries:
  сохраняй необходимые факты/provenance и обоснованный внутренний cache, не
  фабрикуй недостающие raw поля. Без пригодного восстановленного snapshot
  validator нельзя использовать как доказательство успешного 304/bootstrap.
- Реализуй и протестируй atomic claims для journal с уникальностью по событию,
  материальной transition и destination. Состояния sent/retryable/rejected и
  `uncertain_manual_review` должны сохранять смысл; неоднозначный send outcome
  не разрешает автоматический retry. Это storage/state machine с synthetic
  outcomes, **без Telegram client/sendMessage**, сетевых sends или publish режима.

## Truth и ранние анонсы — обязательные регрессии

- Остаются `announced_future`, `confirmed_applied`, `banked_offer`, correction,
  withdrawal и needs_review. Достоверный future announcement полезен **до доставки**:
  сохраняй отдельный кандидат анонса с exact/date/unknown expected time и первичным
  evidence. Позднейшая подтверждённая доставка — отдельная material transition.
  Unknown time не требует нового action enum, countdown или фиктивной даты.
- У Codex regular `delivered_at=null` никогда не становится confirmed delivery.
  Для Claude сохраняй собственную проверенную assessment-модель: отсутствие
  отдельного delivery timestamp не восполняется вымышленным временем и не
  подменяет его evidence gate. Непустой timestamp,
  regular kind, homepage или прошедшее время сами по себе ничего не подтверждают.
  Primary evidence assessment — отдельный доверенный локальный ввод после semantic
  review, не автоматически созданный из feed и не public/admin endpoint.
- Banked требует достаточного current assessment assertion=`banked_offer`, raw URL,
  primary URL и rationale. Без него review; delivered credit не consumed reset.
- У scheduled явный assessment.futureTarget должен совпасть с raw precision/value:
  exact как UTC instant, date как календарная строка, без cross-precision conversion.
  Отсутствующий target сохраняет проверенный raw-derived путь; unknown/conflict/
  malformed target дают review. Сохрани понятные причины из P2 исправления.
- Hinted/forecasts/rumors не становятся достоверными анонсами. Старые unreviewed
  regular не объявляй будущими. Date-only future — строго позже текущей UTC-даты;
  UTC служит базой сравнения, а не вымышленной timezone события.
- Сохраняй принятый reviewedEvidence и primary URLs; stale/rejected assessment
  не переносит свои URLs/audience. Correction/withdrawal требуют явного evidence
  и связи с наблюдавшимся состоянием; missing row не является таким evidence.
- Источники фиксированы: Claude Resets и **codexreset.ai**. `codex-resets.com` —
  только исследованная альтернатива и архивный credit, без fallback/union.
  Разные announcement/delivery IDs не объединяй эвристически по времени/тексту.
  Неоднозначную связь сохрани для review. Production correlation/eligibility
  решения помечай pending/proposed, не меняй truth policy молча.

## Ограничения этапа

Только локальные D1 migrations/test storage после явного запуска этого задания.
При необходимости создай отдельную local/test конфигурацию и binding, не задавая
реальные remote database IDs и не меняя staging/production инфраструктуру.
Нужные D1 typings/test harness и обоснованные минимальные dev dependencies допустимы;
совместимость с установленными Node/Vitest/Wrangler проверяй, lockfile сохраняй согласованным.

Worker `scheduled()`/`fetch()` остаются инертными, Cron выключен, `dry_run` обязателен.
Overlapping Cron проверяется прямыми локальными вызовами service, а не включением trigger.
Не добавляй HTTP admin/sync/publish/assessment routes, публичные data endpoints,
Telegram publisher/templates delivery, `/start`, website или Stage 5.
Никаких Cloudflare login/resources/secrets, remote D1 migrations, deploy,
Telegram sends, production publish approval, push/PR/merge или удаления веток.
Предыдущее разрешение commit/push касалось только P2 исправлений PR #3 и исполнено.

Pending production ADR не мешают безопасной локальной реализации: зафиксируй
локальные conservative choices и нерешённые вопросы в docs/ADR. Production truth,
staleness thresholds, корреляция, publish activation и реальная отправка требуют
отдельных решений. При настоящем противоречии инструкций сообщи его; не придумывай разрешение.

## Проверки, приёмка и остановка

Тесты должны использовать реальный **локальный D1-compatible runtime**, а не
только mock SQL вызовов. Проверяй migrations/constraints/индексы, rollback при
ошибке batch, immutable versions, material hash/noise, per-provider baseline,
ноль baseline intents, replay/restart, 304 restore, partial/outage isolation,
сохранение missing records, evidence invalidation и все три future/delivery сценария.
Параллельные ingestion/claim вызовы должны доказать уникальность committed claim;
ambiguous synthetic send outcome остаётся manual review после перезапуска.
Не утверждай exactly-once delivery. Детерминированные clock/fixtures обязательны;
captured projections не превращай в полные fixtures, live APIs не включай в tests.

Выполни и зафиксируй реальные результаты:

```sh
npm run typecheck
npm run lint
npm test
python3 docs/evidence/stage0-2026-10-21/verify.py
git diff --check
```

Дополнительно выполни документированные local migration/D1 integration команды
на финальном коде; только `--local`/test targets. Для HTTP substitutes применяй
релевантные навыки и существующие локальные mocks. Website build пока неприменим.

Проведи независимое review, устрани существенные findings, повтори затронутые
проверки. Обнови D1 design/ADR/checklists и создай фактические Stage 4 report/handoff
с verified vs assumptions, командами, ограничениями и pending owner decisions.
Проверь полный diff, новые файлы, секреты, неизменность no-op/dry_run/runtime guards.
Не отмечай production policy/деплой/remote migrations/tests как пройденные без факта.

Отчитайся **на русском** по AGENTS.md и остановись: **не развёрнуто / не опубликовано**.
Commit/push/PR и **Stage 5 требуют отдельного нового разрешения**.
