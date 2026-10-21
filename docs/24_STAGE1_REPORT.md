# 24 — Stage 1: локальный Repository/Worker foundation

Дата: **2026-10-21**. Основание: владелец явно разрешил только `prompts/START_STAGE1.md`, включая нейтральный каркас до выбора Codex feed. Stage 2 не разрешён. **Не развёрнуто / не опубликовано.**

## Граница и результат

- TypeScript strict Worker: `src/index.ts`, no-op `scheduled()` и отдельный `src/api/router.ts` без storage/network/env dependencies. Зарезервированы `/api/v1/events`, `/api/v1/status`, `/api/v1/stats`: GET/HEAD отвечают 501, OPTIONS — 204 без CORS; прочие read paths — 404, любые write methods — 405. Все ответы статичны, no-store, без отражения входных данных. Это не реализация Stage 9 и не production контракт.
- `src/domain/event.ts` и `src/providers/types.ts`: только claude/codex, шесть состояний, raw provenance/evidence/seed archive, отдельные announced/effective/delivered с собственной precision. Date-only остаётся отдельным днём без вымышленного UTC. Типы — внутренний словарь, не runtime parser/SQL/public DTO и не одобрение truth policy.
- `src/env.ts`, `wrangler.json`: local/staging/production — отдельные имена и vars, везде dry_run. Иные publish modes отклоняются. Нет D1 UUID/bindings, токенов, каналов, upstream URL, routes и активных Cron triggers. Никакого fallback в production. `.env.example` содержит только два используемых non-secret параметра.
- `src/utils/logging.ts`: фиксированные event codes и проверенные поля allowlist. Произвольные сообщения, URL, Error, вложенные env и секреты не передаются в вывод. Неизвестные/некорректные поля отбрасываются, getters не вызываются. `src/runtime.ts` даёт заменяемые clock/fetch/logger, фабрика сеть не вызывает.
- npm scripts, точные devDependency versions, `package-lock.json`, `.nvmrc`, Vitest, ESLint и `.github/workflows/ci.yml`. Workflow содержит только checks, read-only contents permission, без secrets/deploy/publish. Удалённый Actions не запускался.
- `.gitignore` показывает docs/manual/prompts; игнорирует зависимости, секреты, `.wrangler/`, `.vitest/` и локальные DB artifacts. Документы были локально сохранены ещё до этого этапа: их появление как untracked не означает, что они все написаны в Stage 1. Index/commit/push не выполнялись. LICENSE сохранён без изменений; новое лицензионное решение владельцу не приписывается.

## Checklist и проверки

- [x] Каркас, типы, конфигурации, logger/dependency seam и содержательные тесты добавлены.
- [x] Stage 0 evidence snapshots/headers/manifest сохранены без перезаписи.
- [x] Typecheck, lint, 24 Vitest tests и повторная установка по lockfile прошли.
- [x] Независимое review: critical/high/medium findings отсутствуют; существенных исправлений не потребовалось.
- [ ] Принятие Stage 1 владельцем.
- [ ] Отдельное подтверждение Stage 2.

Website production build неприменим: `website/` остаётся placeholder. Локальный D1/workerd integration, upstream HTTP, Telegram E2E и удалённый CI не проверялись и не заявляются работающими.

Фактически выполненные команды:

| Команда | Результат |
|---|---|
| `git status --short --branch` в начале | main, tracked working tree без изменений; docs/manual/prompts были скрыты ignore |
| `python3 docs/evidence/stage0-2026-10-21/verify.py` до изменений | PASS, 136 offline assertions |
| `npm install --save-dev --save-exact typescript eslint @eslint/js typescript-eslint vitest wrangler @types/node@22 --cache /tmp/reset-radar-npm-cache --no-audit --no-fund --fetch-retries=0 --fetch-timeout=15000` | Установка прошла после отдельно разрешённого выхода из sandbox (первоначально ENOTFOUND) |
| `npm ci --offline --cache /tmp/reset-radar-npm-cache --no-audit --no-fund` | PASS, воспроизводимая переустановка из lockfile/локального npm cache |
| `npm run typecheck` | PASS: локальный Wrangler types, strict tsc приложения и тестов. Sandbox блокирует loopback EPERM; повтор разрешён отдельно, без login/deploy. Первые прогоны обнаружили отсутствие output directory и строгие ошибки в тестах; исправлены |
| `npm run lint` | PASS, ESLint с нулевым лимитом warnings |
| `npm test` | PASS, 4 test files / 24 tests; Node unit + handler integration, fetch заглушён, без сети |
| `python3 docs/evidence/stage0-2026-10-21/verify.py` после документации | PASS, 137 offline assertions: число выросло из-за новой локальной ссылки, архивные факты не менялись |
| `git diff --check HEAD` и `git diff --quiet HEAD -- LICENSE` | PASS: tracked diff без whitespace errors, LICENSE неизменён |
| `git diff --no-index --check /dev/null <file>` через локальный Python loop | PASS: отдельно проверены все 28 новых/untracked Stage 1 text files; Git index не менялся |
| Локальный Python audit lockfile/ignore/бот-token pattern | PASS: точные root deps, только npm registry URLs с sha512 integrity, runtime deps нет, pattern реального Bot API token не найден; docs видимы, секреты/artifacts игнорируются. Это ограниченная проверка pattern, не полный secret scanner |
| `ruby -e` с `YAML.load_file` и assertions CI permissions/jobs/steps | PASS: YAML разобран, единственная checks job, нет secrets/deploy. Попытка Python YAML parsing до этого не прошла: PyYAML не установлен; новая dependency не добавлялась |

Независимый reviewer `stage1_review` (зарегистрированная роль reviewer, gpt-6.1-sol, reasoning high) проверил требования, tracked diff, новые исходники/тесты/конфиги/CI и lockfile. **Существенных findings (critical/high/medium) нет.** Отдельно повторил `npm run typecheck`, `npm run lint`, `npm test` (24 PASS), evidence verify (137 PASS), diff check и проверку неизменности LICENSE. Не редактировал файлы. `npm ci` в review не повторялся; ранее выполнен главным агентом. Workerd handler execution и удалённый CI остаются непроверенными. Подзадача безопасного logger/runtime выполнена worker `safe_runtime` (gpt-6-luna, reasoning high); её код и тесты вошли в общие проверки/review.

## Изменённые файлы

- `.gitignore`, `.env.example`, `.npmrc`, `.nvmrc`, `package.json`, `package-lock.json`, `tsconfig.json`, `tsconfig.test.json`, `eslint.config.mjs`, `vitest.config.ts`, `wrangler.json`, `.github/workflows/ci.yml`.
- `src/index.ts`, `src/env.ts`, `src/runtime.ts`, `src/api/router.ts`, `src/domain/event.ts`, `src/providers/types.ts`, `src/utils/logging.ts`.
- `tests/setup.ts`, `tests/worker.test.ts`, `tests/env.test.ts`, `tests/logging.test.ts`, `tests/runtime.test.ts`.
- `README.md`, `CHANGELOG.md`, `docs/08_DEVELOPMENT_PLAN.md`, `docs/09_DECISIONS.md`, `docs/23_SESSION_HANDOFF.md`, этот отчёт, `manual/OWNER_CHECKLIST.md`, пояснение Git hygiene в `docs/evidence/stage0-2026-10-21/README.md`. Содержимое evidence snapshots/headers/manifest/verify.py не менялось. Прочие docs/prompts существовали до этапа и стали видимыми Git.

## Версии и официальные сведения

Локальная среда: Node 22.22.2, npm 10.9.7. Установлены TypeScript 6.0.3, Wrangler 4.151.3, Vitest 5.0.5, ESLint 10.13.0, typescript-eslint 8.72.0, @eslint/js 10.0.1, @types/node 22.20.5. Точные версии и integrity транзитивных зависимостей — в lockfile. Runtime типов генерируется локально `wrangler types --include-env=false` в игнорируемый `.wrangler/types/worker-configuration.d.ts`; вручную Env не содержит фиктивных bindings.

Сверены 2026-10-21: [Cloudflare TypeScript/types generation](https://developers.cloudflare.com/workers/languages/typescript/), [Wrangler environments/non-inheritable vars](https://developers.cloudflare.com/workers/wrangler/environments/), [Vitest requirements](https://vitest.dev/guide/), [typescript-eslint flat config](https://typescript-eslint.io/getting-started/), официальные релизы [checkout v7.0.1](https://github.com/actions/checkout/releases/tag/v7.0.1) и [setup-node v7.1.0](https://github.com/actions/setup-node/releases/tag/v7.1.0). npm metadata прочитаны из публичного registry; внешние workspace/services не подключались. Postman api-engineer применён для границ контракта/проверок, collection/mock/simulation здесь не нужны: handlers не вызывают внешние сервисы.

## Факты, ограничения и действия владельца

Stage 0 остаётся историческим исследованием: Claude 12 counted events и отдельный offer revision=2, effective_at=null; CodexReset 62/53 seeded/56 без delivery; отдельная альтернатива 64 с пересечением 52 ID. Каркас не классифицирует эти записи, не выбирает Codex feed и не подтверждает применение из объявления. Архивные projections не использовались как полные parser fixtures. ADR-015/019/020 и production truth policy остаются pending.

Владелец принимает результат Stage 1 и отдельно решает, разрешать ли Stage 2. Codex feed необходимо выбрать до его адаптера, production evidence policy — до публикаций. Stage 0 fair-use/evidence gaps, несовпадение starter-текстов о лицензии с существующим MIT и неподтверждённые handles/URLs сохраняются. Секреты и удалённые ресурсы для Stage 1 не нужны.

Адаптеры, нормализация, SQL/миграции/D1, Telegram publisher, реальный публичный API и сайт **не реализованы**. PR не создавался; push/merge/login/deploy/remote migrations/Telegram sends не выполнялись. **Не развёрнуто / не опубликовано. После отчёта остановиться; Stage 2 без нового подтверждения не начинать.**
