# 35 — Handoff после локальной подготовки Stage 6

Дата: **2026-10-22**. Активное задание владельца — только локальный
[START_STAGE6](../prompts/START_STAGE6.md) после принятия Stage 5 из merged PR #5.
Полный stable-staging acceptance pending; remote/live операции не разрешены.
Фактический результат, команды и independent review: [report](34_STAGE6_LOCAL_REPORT.md).

## Рабочая база и состояние

Workspace `/Users/salman/pet_projects/reset-radar`, новая local branch
`feat/stage6-staging-dry-run`, исходный HEAD/main/origin/main:
`ba8bd58d959e1716ab41ff1339c7ddf44877ff22`. Read-only GitHub подтвердил PR #5
merged, head `bb2cd25`, CI #15/#16 success. Новых Git commits/push/PR/merge нет.
Рабочее дерево содержит local implementation и сохранённую подготовку
README/docs08/docs32/docs33/checklist/START_STAGE6. Не discard/reset/clean.
Старые stash, detached worktree и recovery backup не применялись и не менялись;
контекст сохранён в [Stage 5 historical handoff](33_STAGE5_HANDOFF.md) и
[Stage 4 handoff](31_STAGE4_HANDOFF.md). Не применять старый stash повторно.

## Продолжать с этих интерфейсов

- `createWorker(dependencies).scheduled(controller, env)` теперь async;
  дождаться Promise. Только explicit `APP_ENV=local|staging`,
  `PUBLISH_MODE=dry_run`, `INGEST_MODE=dry_run` с `DB` включает ingestion.
  Missing/default/off остаются no-op; invalid config/production opt-in reject;
  active missing binding → `scheduled_missing_database`, zero network.
- `runScheduledIngestion` использует existing adapters/repository и возвращает
  separate provider results + blocked publication (`reason:no_real_publisher`).
  Не трактовать successful ingestion как Telegram eligibility или real preview.
- `IngestOptions.maxRecords` — optional trusted local capacity budget.
  Scheduled передаёт 100; `loadEvents(provider, limit?)` читает 101 для проверки
  stored history. Свыше 100 → `stored_record_limit`, no upstream/event writes,
  incomplete health, existing baseline/history preserved.
- Claude pages: limit25/maxPages4; accepted union ≤100. Codex full feed including
  scheduled ≤100. Max upstream requests/invocation: 5 Claude + 1 Codex, fixed
  HTTPS origins/paths, GET and redirect:error. Existing transport cache/backoff,
  10s timeout, body2MiB остаются. D1 elapsed time не жёстко отменяется.
- Partial history/budget failure не bootstrap. Retry следующего invocation
  начинает whole consistent walk с cache; CAS исключает duplicate state при
  overlap, но не предотвращает duplicate fetch и не является global mutex.
- HTTP routeRequest не изменён: 501 reserved API, 404 unknown reads,405 writes,
  HEAD/OPTIONS inert, no CORS/admin/sync/publish. Public API и website — later.
- Stage 5 simulation client/journal остаются synthetic-only и не импортируются
  runtime. `publish_approved_at` NULL, нет real client/journal/approval workflow.
  Both send journals остаются без новых rows. Не автоматизировать assessments
  и не подставлять synthetic policy вместо реального approval.

## Проверки и воспроизведение

На Stage 6 коде: typecheck/lint PASS, full **311 passed /5 opt-in skipped**,
D1 **62 PASS**, local migrations PASS (already applied), verify **139 PASS**,
diff-check PASS. Дополнительно Stage 6 Postman HTTP **1 PASS**, 15 synthetic GET
receipts (200/304/429/503). Другие 4 opt-in tests в этой сессии не запускались.
Website build неприменим. Подробности/ограничения — в report.

Независимый `stage6_review` (reviewer, gpt-6.1-sol, high) завершён после тестов:
critical/high/medium findings нет. Уточнение docs о сохранении completed baseline
исправлено и проверено; runtime code не менялся. Reviewer сделал diff-check,
но сам тесты повторно не запускал.

```sh
npm run typecheck
npm run lint
npm test
npm run test:d1
npm run d1:migrate:local
python3 docs/evidence/stage0-2026-10-21/verify.py
git diff --check
```

HTTP reproduction/shutdown: [evidence](evidence/stage6-2026-10-22/simulation.md).
Miniflare/Postman требуют local loopback permission; tests блокируют внешнюю
сеть. Substitute остановлен, порт4904 свободен. Retention regression с 103 real
D1 commits и timeout20s не менять/не отключать, parallelism прежний.

## Разрешения и следующая точка решения

Все checked-in Wrangler configs остаются dry_run, INGEST_MODE absent/off,
Cron[], routes/remote bindings отсутствуют; local-only DB config не является
валидным staging deploy target. Migrations0001/0002 не переписаны, новых нет.
Полный remote plan и синтаксис с primary references: [runbook](07_DEPLOYMENT_RUNBOOK.md).

Будущий владелец отдельно решает создание staging D1, remote migration,
binding/inactive deploy, затем bounded upstream/Cron observation и cost/health
acceptance. Real Telegram design/token/channel и любые реальные API requests/
sends — отдельные gates; токен в чат не передавать. Production и Stage7–11
не начинать по этому handoff. Final review/report завершены, локальная работа
остановлена; любое продолжение — только после нового явного owner assignment.

**Не развёрнуто / не опубликовано. Реальный staging E2E не выполнен.**

После отчёта владелец отдельно разрешил локальный commit Stage 6, включая
сохранённую подготовку. Описанное выше dirty-состояние — снимок до его создания;
актуальные SHA и status проверять в Git. Разрешение не включает push/PR/merge,
remote/live операции и продолжение этапов; runtime code при commit не менялся.
