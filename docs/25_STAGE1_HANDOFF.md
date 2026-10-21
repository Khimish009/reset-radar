# 25 — Передача контекста: Stage 1 → отдельное разрешение Stage 2

Сохранено **2026-10-21** для следующей сессии в `/Users/salman/pet_projects/reset-radar`. Актуальное состояние всегда сначала сверять с `git status --short --branch`.

**Обновление по review PR #1:** владелец разрешил только исправление инструкций, согласование документов с существующим MIT и ограничение CI triggers, с commit/push в `feat/stage1-worker-foundation`. Stage 2 не разрешён. Актуальный scope определяется последним явным заданием владельца; historical snapshots ниже не заменяют разрешение. Промпт START_STAGE2 остаётся подготовленным для отдельного поручения.

## Статус и разрешения

- Stage 0 исследован; Stage 1 локально реализован и независимо отрецензирован. [Фактический отчёт Stage 1](24_STAGE1_REPORT.md) содержит все изменённые файлы, реальные команды и ограничения. **Не развёрнуто / не опубликовано.**
- Текущая просьба владельца — сохранить контекст и подготовить следующий промпт. **Stage 2 сейчас не разрешён и не начат.** Факт подготовки промпта не равен принятию этапа или разрешению реализации.
- Подготовлен [START_STAGE2.md](../prompts/START_STAGE2.md). Только его отдельная отправка/явное поручение выполнить принимает локальный Stage 1 и разрешает Claude adapter, без production policy signoff, выбора Codex или последующих этапов.
- Не было commit/push/PR/merge, Cloudflare login/resources/secrets/deploy, D1 resources/migrations или Telegram sends. Branch не создавалась. На начало подготовки этой передачи текущая ветка — `main`, прошлые изменения уже находились в Git index; index агентом не менялся. Новые handoff/prompt и обновлённый pointer сохраняются в рабочие файлы, их нужно включить в будущий коммит.

## Что уже реализовано

- [Worker entry](../src/index.ts) экспортирует `scheduled()` и `fetch()`. Scheduled лишь валидирует dry_run и пишет безопасный код лога. [HTTP router](../src/api/router.ts) возвращает 501 для трёх reserved GET/HEAD, 204 для их OPTIONS без CORS, 404 для прочих read paths, 405 для write methods. Ни один handler не обращается к upstream, D1 или Telegram.
- [Event vocabulary](../src/domain/event.ts): claude/codex, шесть состояний, отдельные announcement/effective/delivery с exact/date/unknown precision, provenance/evidence/revision/seed archive. [Provider types](../src/providers/types.ts) хранят payload как unknown. Это не parser, production truth policy, SQL или public DTO.
- [Runtime dependencies](../src/runtime.ts): заменяемые clock/fetch/logger. [Logger](../src/utils/logging.ts) выводит только фиксированные event codes и проверенные scalar поля; свободных сообщений/URL/Error/env в output нет. Новые operational codes добавлять осознанно, не возвращать generic raw logging.
- [Configuration](../wrangler.json): отдельные local/staging/production, везде dry_run, без D1 bindings/UUID/tokens/channels/routes и без активных Cron triggers. [Env](../src/env.ts) принимает только dry_run. В `.env.example` лишь APP_ENV/PUBLISH_MODE, Codex source не выбран.
- `package.json`, `package-lock.json`, `.nvmrc`, strict tsconfigs, ESLint/Vitest, [CI checks](../.github/workflows/ci.yml). В CI нет deploy/secrets. `migrations/` и `website/` остаются placeholders.
- `.gitignore` больше не скрывает docs/manual/prompts, но игнорирует `.env*` кроме `.env.example`, `.dev.vars*`, dependencies и local artifacts. Архив Stage 0 доступен в рабочей папке и сейчас виден в staged changes; сохранённые captures/manifest не менялись.

## Проверки и воспроизводимость

Stage 1 реально прошёл: `npm ci --offline --cache /tmp/reset-radar-npm-cache --no-audit --no-fund`, `npm run typecheck`, `npm run lint`, `npm test` — **4 файла / 24 теста**. Архивный `verify.py` на завершение Stage 1 — **137 offline assertions**. Число assertions может расти из-за дополнительных локальных ссылок в handoff, не выдавать это за новые проверки приложения или upstream.

Reviewer `stage1_review` (роль reviewer, gpt-6.1-sol, reasoning high) независимо повторил typecheck/lint/24 tests/137 assertions, проверил diff/новые файлы/CI/lockfile/неизменность LICENSE. Critical/high/medium findings отсутствуют. Реальное исполнение handlers в workerd, remote CI, upstream HTTP/Telegram E2E и website build не проверялись.

При подготовке этой передачи выполнены evidence verify (**139 PASS**, две новые ссылки в историческом handoff), отдельная проверка **33 локальных ссылок** и whitespace трёх файлов передачи/промпта. Исходники не менялись, typecheck/lint/Vitest заново для правок документации не запускались. Полный `git diff --check HEAD` теперь видит уже staged архив и сообщает исходные trailing spaces в captured headers, baseline docs и историческом review diff. Это сохранённые артефакты с hashes: не обрезать пробелы ради косметической проверки и не переписывать manifest. Проверка diff вне архива выполняется отдельно; прежний PASS Stage 1 относился к тогдашнему tracked diff и отдельно перечисленным новым файлам, а не ко всем историческим captures после staging.

Среда: Node **22.22.2**, npm **10.9.7**; точные devDependency versions в package/lockfile. Runtime dependencies нет. Установка в новой сессии:

```sh
npm ci
npm run typecheck
npm run lint
npm test
python3 docs/evidence/stage0-2026-10-21/verify.py
```

`npm run typecheck` сам создаёт `.wrangler/types/` и генерирует `worker-configuration.d.ts` перед strict tsc приложения/тестов. Сгенерированные types/logs/state игнорируются и не нужны в коммите; они воспроизводятся из lockfile/config. Локальный генератор Wrangler использует loopback-порт: sandbox может дать `listen EPERM`, для повторного локального typecheck было разрешено выполнение вне sandbox. npm DNS также первоначально блокировался; установка зависимостей была отдельно разрешена. Это не разрешение на Wrangler login/deploy или удалённые операции.

`/tmp` npm cache может исчезнуть. Он не требуется для сохранности проекта: обычный `npm ci` использует сохранённый lockfile и registry. Содержательных результатов, зависящих только от `/tmp`, нет. Не сохранять node_modules, `.wrangler/`, cache, credentials или local DB в Git.

## Данные и pending решения

- Claude Stage 0: **12 counted history**, отдельный credit offer **revision=2**. Exact относится к announcement; все history effective_at=null. Expiry offer date-only, Claude 304 не наблюдался.
- CodexReset — рекомендуемый, не утверждённый кандидат: **62**, **53 seeded**, **56 без delivery**. Отдельная альтернатива — **64**, лишь **52 общих ID**, более свежая последняя запись. Никакого union/fallback; Codex adapter — Stage 3 после выбора владельца.
- ADR-015/019/020 и production truth policy остаются pending. Подготовленный Stage 2 разрешает только Claude-specific local parsing/mapping; он не утверждает production publication policy и не запускает shared policy engine.
- [Архив Stage 0](evidence/stage0-2026-10-21/README.md) и [truth table](22_STAGE0_TRUTH_TABLE.md) — исторические данные/предложенные правила. Captured JSON сокращены и не являются полными parser fixtures. Для Stage 2 нужны честно synthetic contract-shaped inputs или отдельно полученные полные captures.
- Tracked LICENSE уже MIT, copyright 2026 Salman; package.json содержит MIT. В рамках исправлений PR #1 текущие документы согласованы с этим существующим состоянием, без изменения LICENSE/copyright и без нового лицензионного решения. Отдельные условия для бренда/стороннего контента остаются открытым вопросом; старые evidence-тексты сохраняются. Pages URL и Telegram handles не подтверждены.

## Следующий результат и Git-названия

После отдельного подтверждения — только Claude adapter с runtime validation, source-specific conditional HTTP/cache/backoff/pagination и консервативным mapping/evidence tests. `scheduled()`/HTTP остаются инертными. D1/schema/shared policy — Stage 4, Telegram — Stage 5+, API — Stage 9, сайт — Stage 10. Точные границы и acceptance — в подготовленном промпте.

Предложения для текущего Stage 1, **не выполненные Git-операции**:

- Ветка: `feat/stage1-worker-foundation`.
- Коммит: `feat: add Stage 1 Worker foundation and preserve research docs`.

Для будущего разрешённого Stage 2 можно использовать `feat/stage2-claude-adapter`. Ни ветка, ни коммит этим документом не создаются. Перед коммитом сохранить код/lockfile/CI, исходную документацию/архив Stage 0, отчёт Stage 1 и эту передачу с START_STAGE2; проверить staged diff и отсутствие секретов. **Stage 2 не начинать до явного поручения владельца.**
