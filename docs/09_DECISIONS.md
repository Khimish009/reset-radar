# 09 — Architecture Decision Record and unresolved questions

**As of 2026-10-21.** Decisions reflect owner discussion, not claims that infrastructure is already configured.

| ID | Decision | Status | Rationale |
|---|---|---|---|
| ADR-001 | Project brand **Reset Radar | AI Limits**, repo `reset-radar` | agreed | Vendor-neutral and expandable |
| ADR-002 | Start with **Claude Code + OpenAI Codex** only | agreed | Two relevant public feeds; avoid unvalidated sources |
| ADR-003 | One public Telegram channel; bot **Reset Radar | Alerts** initially publisher-only | agreed | No unnecessary private-user auth/subscription DB |
| ADR-004 | TypeScript strict + Cloudflare Workers Cron + D1 | agreed | Tiny serverless footprint, independent source state, accessible public API |
| ADR-005 | GitHub **public** repo with PR review | recommended/agreed in discussion, owner verifies | Discovery, transparency, review; scrub secrets first |
| ADR-006 | `website/` in same repo, GitHub Pages static deployment | agreed | Zero mandatory hosting cost at small usage |
| ADR-007 | Vite + TypeScript + CSS, no React/SSR initially | agreed | Small website and simple state |
| ADR-008 | Static client reads **our Worker public API**, not community APIs | agreed | D1 canonical truth, CORS/rate control, resilient historical display |
| ADR-009 | Public endpoints `/api/v1/events`, `/api/v1/stats`, `/api/v1/status` | agreed at design level | Small versioned, read-only surface; exact response schema approved in Stage 9 |
| ADR-010 | Public dashboard: history, status, filters, observed charts, RU/EN, links, SEO | agreed | More ongoing value than notification-only channel |
| ADR-011 | No personal balances/tokens/login, no next reset guarantees | agreed | Feeds are public events only |
| ADR-012 | Staging+dry-run+per-provider bootstrap and separate owner production approval | agreed | Protect against historical spam and false claims |
| ADR-013 | Dark navy/cyan/amber identity; paired but different channel/bot icons | agreed | Independent brand recognition |
| ADR-014 | Existing tracked `LICENSE` is MIT, copyright 2026 Salman; `package.json` declares MIT | **existing repository state; documentation reconciled in PR #1** | No new owner licensing decision or change to license/copyright; separate brand reuse and third-party content permissions remain open |
| ADR-015 | Claude Resets feasible with limits; owner selected codexreset.ai for local Stage 3; codex-resets.com remains separately researched alternative | **Local Codex source choice accepted 2026-10-21; production/data policy remains pending** | Local selection does not approve publication, a full content mirror, or source equivalence |
| ADR-016 | Website URL/GitHub username and Telegram handles | **pending verification** | Never invent live URLs from placeholders |
| ADR-017 | `stale` threshold 30 min, public caching 60–300s | **initial proposal; validate** | Balance recency, costs and transparent freshness |
| ADR-018 | No external visitor analytics/ads in initial version | agreed initial restraint | Privacy and simplicity; can revisit |
| ADR-019 | Proposed truth mapping separates announcement time, applied evidence and banked credit; old unconfirmed announcements go to needs_review | **proposed, pending owner** | Exact announcement time does not prove application time; see docs/22_STAGE0_TRUTH_TABLE.md |
| ADR-020 | No silent Codex fallback or union of archive rows | **proposed, pending owner** | 62 vs 64 rows, only 52 matching IDs; announcement and delivery posts can be different IDs for one reset |
| ADR-021 | Persist source metadata and own sync times separately; no completeness claim from successful HTTP | **Stage 0 finding; threshold remains proposed** | generated_at/editorial_reviewed_at/event dates measure different things; keep ADR-017 as a proposal |

## Stage 0 — результаты 2026-10-21

Исследование выполнено в пределах разрешённого этапа. Историческое состояние на завершение Stage 0: Stage 1 тогда не был начат. Владелец затем отдельно разрешил локальный Stage 1 через `prompts/START_STAGE1.md`, без принятия pending source/truth ADR. Текущий результат: [24_STAGE1_REPORT.md](24_STAGE1_REPORT.md). Доказательства Stage 0: [HTTP journal](11_SOURCES.md), [contracts/rights](04_EXTERNAL_APIS.md), [truth table и captured/synthetic примеры](22_STAGE0_TRUTH_TABLE.md).

| Provider/source | Технический вывод | Ограничения и решение владельца |
|---|---|---|
| Claude / clauderesets.com | **GO с оговорками** для чтения и атрибутированной истории фактов | 12 confirmed usage_reset и отдельный offer revision=2; exact относится к объявлению, effective_at=null. 304/реальные отзывы не наблюдались. Принять evidence/credit policy |
| Codex / codexreset.ai | **Условный GO**, рекомендуемый основной кандидат | 62 записи, 53 seeded, 56 без delivery timestamp. Проверять достаточное delivery evidence; X-посты независимо не прочитаны. Последняя запись 17 октября при наличии у альтернативы записи 20 октября. Владелец выбирает источник |
| Codex / codex-resets.com | **GO как исследованная альтернатива**, подключение не утверждено | 64 записи и отдельный API. Нет раздельных delivery/revision/seeded полей; observed не всегда имеет оригинальный пост. Не делать fallback автоматически |

Все три источника **NO-GO** для полной официальной истории, личных квот и гарантированного следующего сброса. Для production Telegram **NO-GO сейчас**: нет реализации, baseline или разрешения публикации. Изученный fair use поддерживает ограниченный показ фактов через D1 с credit, не устанавливает лицензию на полное зеркало редакционных текстов/активов. Авторы не контактировались.

### Обнаруженные расхождения; существующие файлы не исправлялись за пределами Stage 0

1. На завершение Stage 0 `LICENSE` уже содержал MIT, хотя starter-документы считали выбор незавершённым. В рамках разрешённых исправлений PR #1 README/START_HERE/docs/21/manual согласованы с существующим MIT и `package.json`; LICENSE и copyright не менялись, новое одобрение владельцу не приписывается. Исторические evidence сохраняют исходные формулировки. Вопрос отдельных условий для бренда/стороннего контента остаётся открытым.
2. `.gitignore` исключает docs/, manual/, prompts/. `git ls-files docs manual prompts` пуст: документы существуют локально, но не отслеживаются. Поэтому `git status --short` и обычный `git diff` не показывают Stage 0 правки. Проверка выполняется относительно временной копии до изменений. Gitignore/index не менялись; для Git review владелец должен отдельно решить, как включить документы в репозиторий.
3. Проектная модель требует точные applied/delivered instants для интервалов, а Claude отдаёт exact announcement time и null effective_at. Codex-архивы также используют разные времена/ID. Будущие stats должны соблюдать docs/18 и не выдавать интервалы объявлений за интервалы применения. Схему/реализацию Stage 0 не меняет.

### Решения источников и отдельное разрешение Stage 1

Источник/truth policy остаются pending: явное разрешение владельца допускает нейтральный Stage 1 до их принятия. Выбор Codex необходим до его адаптера; production evidence policy — до публикаций.

- [ ] Выбрать CodexReset либо отдельно согласовать альтернативу, учитывая freshness и различия evidence/ID.
- [ ] Принять truth table: null delivery, banked, hinted, unknown, date-only и corrections остаются безопасными отдельными состояниями.
- [ ] Принять ограниченную историю/credit и нерешённые случаи evidence; полный mirror текстов не разрешён найденными условиями.
- [x] Дать отдельное разрешение на Stage 1 через `prompts/START_STAGE1.md`. Оно не разрешает Stage 2, push/PR, remote resources, деплой или публикацию.

На завершение Stage 0 typecheck/lint/Vitest/build отсутствовали: реализации ещё не было. Это исторический результат; проверки каркаса Stage 1 записаны отдельно в [отчёте](24_STAGE1_REPORT.md). **Не развёрнуто / не опубликовано.**

## Changes require an ADR

### Local Stage 3 owner decisions, 2026-10-21

The owner explicitly selected **codexreset.ai**, prohibited fallback/history union,
and prioritized reliable future announcements before delivery, including an
announcement whose expected time is unknown. The local adapter represents the
latter as `announced_future` with source-specific `expectedTime.precision=unknown`;
it adds no shared action enum. Primary-evidence review is required, and null
delivery never becomes `confirmed_applied`. See the [report](28_STAGE3_REPORT.md).

This resolves the local source choice only. ADR-015/019/020 are not signed off as
a complete production policy. Evidence review workflow, durable detection and
announcement-to-delivery correlation, publication eligibility/deduplication,
source migration, and baseline approval remain future owner decisions. Отдельное
разрешение владельца позднее открыло только локальный Stage 4; оно не меняет
production policy и не разрешает publisher.

### Локальные решения Stage 4 — 2026-10-22

Эти решения описывают реализованную техническую модель и консервативные локальные
допущения. Они не закрывают pending production ADR:

| ID | Локальное решение | Статус и основание |
|---|---|---|
| ADR-022 | D1 хранит текущее событие отдельно от immutable observations и material versions; namespaced identity уникальна по provider/upstream/external ID. | Реализовано локально. Hash строится по канонической material-проекции; upstream revision и assessment key имеют отдельные поля. A→B→A получает новый sequence. Это модель аудита, не публичный контракт. |
| ADR-023 | Полный commit snapshot выполняется одним `D1.batch()` с generation CAS; D1 prepared statements используют bound values. | Реализовано локально. Cloudflare документирует последовательное транзакционное исполнение batch и rollback при ошибке ([D1 Database](https://developers.cloudflare.com/d1/worker-api/d1-database/)); parameter binding подготовленных statements рекомендован для безопасной передачи значений ([Prepared statements](https://developers.cloudflare.com/d1/worker-api/prepared-statements/)). Локальный тест использует pinned Miniflare 5, `convertV4MiniflareOptions` и Wrangler `unstable_splitSqlQuery`; финальные проверки пройдены и записаны в [Stage 4 report](30_STAGE4_REPORT.md), включая независимое review. |
| ADR-024 | Полный baseline Claude локально требует полной counted history и status с совпадающим content revision, audience/window без фильтрации, совпадающим total count и согласованным пересечением ID; status union включает latest, ambiguous, announcement и offers. | Критерий реализации; он выявляет локально наблюдаемую неполноту/несогласованность, но не доказывает полноту upstream. Production completeness claim остаётся pending. |
| ADR-025 | Непагинируемый Codex feed считается полным после проверки контракта и schema parse. | Явное локальное допущение о форме выбранного feed, не гарантия полноты upstream. Никакой fallback/union с `codex-resets.com` нет; production source/correlation policy остаётся pending. |
| ADR-026 | HTTP cache сохраняет versioned representation с digest и provider/endpoint/query scope, максимум 128 endpoint на provider и 24h retention. | Локальная bounded-cache policy, чтобы `304` можно было восстановить и заново проверить; истёкший/повреждённый snapshot не даёт использовать validator. Это не разрешение долговременно зеркалить upstream editorial content. |
| ADR-027 | Первый полный baseline каждого provider фиксируется атомарно и создаёт ноль publication candidates; `publish_approved_at` по умолчанию NULL. | Реализовано для локального bootstrap. Исторические/недавно датированные строки не создают baseline intent. Production approval требует отдельного решения. |
| ADR-028 | Delivery journal принимает только synthetic destination; ambiguous outcome переходит в `uncertain_manual_review` без автоматического retry или lease recovery. | Локальная state machine без Telegram client/send. Это не exactly-once гарантия и не approval на реальные отправки. |
| ADR-029 | Claude correction требует ссылку на ранее сохранённую версию того же upstream ID; Codex correction/announcement correlation остаётся нерешённой, эвристическое объединение запрещено. | Claude связывает reviewed transition с prior version. Codex ambiguous linkage остаётся pending и не сливается автоматически. |
| ADR-030 | Codex storage identity включает surface (`event`/`scheduled`) и точный raw key как JSON tuple; provenance сохраняет raw ID/URL. | Локальная техническая идентичность: arbitrary event ID может совпасть с scheduled URL. Строки остаются независимыми при baseline и replay. |
| ADR-031 | Наступивший exact/date target без delivery evidence переводит текущий future announcement в review, сохраняя прежнюю immutable версию/evidence. | Консервативное локальное time-derived состояние, candidate не создаётся. Никакого вывода о delivery/withdrawal; production staleness/eligibility остаются pending. Unknown target не получает выдуманный expiry. |

Реализацию и границы Stage 4 фиксирует [D1 blueprint](03_DATA_AND_STATE.md).
Production truth/eligibility, stale threshold, окончательная полнота источников,
Codex correlation, срок хранения audit данных, publication activation и delivery
остаются открытыми. Stage 4 не менял Worker runtime wiring, public API или
website.

### Локальные решения Stage 5 — 2026-10-22

Владелец принял локальный результат Stage 4 и отдельно назначил только локальный
Stage 5. Следующее решение фиксирует фактически реализуемую simulation boundary,
но не является production policy signoff:

| ID | Локальное решение | Статус и основание |
|---|---|---|
| ADR-032 | Использовать отдельную `telegram_simulation_deliveries` таблицу и `stage5_local_simulation` environment; сохранить Stage 4 `synthetic_deliveries` schema и CHECK. Simulation принимает только `synthetic:` destination, фиксированный synthetic chat ID/token и HTTP endpoint на loopback `127.0.0.1/.../telegram`. | Локальная compatibility seam. Нет общего/production Telegram endpoint, real destination, runtime wiring или реальных Telegram requests/sends. Completion записывает только `simulated_sent`; это не реальная доставка. |
| ADR-033 | Делать локальную eligibility явной: synthetic policy включает freshness settings; provider approval совпадает с активным baseline, а transition review совпадает с `transitionId` и `rawKey`. Проверять отдельно current generation/editorial state, HTTP source checks и successful cached ingestion. | Все freshness значения в локальной политике обязательны и не больше 24 часов; HTTP — не больше 10 минут. `approvedAt` и `reviewedAt` также проверяются по указанному окну. Эти цифры — консервативная тестовая настройка, production thresholds, review workflow и approvals остаются pending. |
| ADR-034 | Ограничить candidate query максимум 50 и keyset cursor по `(created_at, transition_id)`; claim атомарно сверяет текущий transition/observation и provider generation. | CAS связывает immutable candidate с текущим событием и состоянием baseline в момент записи. Устаревший candidate или ingestion race не должен claim-иться. |
| ADR-035 | Локально подавлять exact target, уже наступивший к текущему времени, и date-only target/offer expiry в тот же UTC день. | Дата не превращается в заданный час или countdown. Это conservative local eligibility rule; production target-expiry policy остаётся pending. |
| ADR-036 | Повтор разрешать только для runtime-validated 429 с явным будущим `retryAt` не более чем на один час; максимум три попытки. Не восстанавливать claimed row по lease и не автоматически повторять timeout/ambiguous outcomes. | Persist failure после возможного send остаётся заблокированным/manual review; exactly-once не обещается. Реальный Telegram journal, retry policy и manual operations требуют отдельного production design/approval. |

Код Stage 5 не меняет `src/index.ts` handlers и оставляет `readConfig()` в
`dry_run`. Он не добавляет publish setter, API/admin route, Cloudflare resource,
production migration или live-send workflow. Точные проверки и результаты
фиксируются в [Stage 5 report](32_STAGE5_REPORT.md); актуальные ограничения и
следующий handoff — в [33_STAGE5_HANDOFF.md](33_STAGE5_HANDOFF.md). ADR-032–036 не
закрывают production freshness/approval thresholds, publisher activation,
provider-specific approval, destinations or live delivery handling.

Before altering stack/site hosting, claiming delivery without evidence, implementing new providers, making bot personal, adding visitor tracking, enabling auto-prod-deploy or changing copyright/license, document decision + alternatives + risk and wait for owner approval.

Stage 5 review уточнение: candidate SELECT получает provider generation в том же
снимке, что current payload/observation; более новое generation при evaluation
подавляет candidate, а claim использует исходное generation. Это закрывает race
при изменении только freshness metadata без material transition/observation.
Cursor-page SQL имеет прямой tuple range predicate; D1 `EXPLAIN QUERY PLAN`
проверяет seek, чтобы поздние страницы не сканировали уже пройденный prefix.
Текущий Stage 4 guard оставляет Claude credit/offer correction/withdrawal в
`needs_review`: renderer support сам по себе не расширяет domain eligibility.

PR #5 follow-up adds local ADR-037: `maxEventAgeMs` separately bounds an existing
source-aware action time (Codex verified delivery, Claude canonical effective).
An exact historic time cannot be refreshed by candidate creation or review.
Unknown action time and all offers need an explicit transition/rawKey-bound
`currentRelevance` source confirmation with accepted evidence and its own time.
Known future announcements retain exact/date/unknown evidence gates. This
eligibility check never deletes D1 history; thresholds remain local/test-only,
with no production approval or activation. Delivery timestamps in message copy
are labelled source-reported and do not establish per-account effective time.

Local ADR-038: cancellation is best effort and started once; the client never
awaits the underlying cancel hook. Response parsing releases the reader lock in
`finally` where possible, and catches asynchronous cancellation rejections.
Timeout/abort/parse failure remain uncertain and never allow automatic retry.

### Локальные решения Stage 6 — 2026-10-22

Владелец принял Stage 5 из merged PR #5 и разрешил только локальную подготовку
по START_STAGE6. Эти решения не закрывают stable-staging acceptance:

| ID | Локальное решение | Основание и границы |
|---|---|---|
| ADR-039 | Подключить scheduled ingestion к существующим D1/adapter interfaces только через явные `APP_ENV=local|staging`, `PUBLISH_MODE=dry_run`, `INGEST_MODE=dry_run` и DB binding. Default/off и production не опрашивают источники. | Отдельный opt-in предотвращает polling при обычном deploy или missing config; отсутствующий binding даёт фиксированный safe code. `fetch()` не читает env/DB и не запускает работу. Все поставляемые targets сохраняют dry_run/Cron off. |
| ADR-040 | Ограничить invocation до 4 Claude history pages по 25 записей, 100 accepted records/provider и 5 Claude + 1 Codex network requests; сохранить transport timeout 10s/body limit 2MiB и существующие cache/backoff. | Превышение бюджета не даёт частичного event commit или baseline. Новый запуск начинает полный согласованный walk, используя сохранённый scoped cache. Это границы операций, не обещание жёсткого wall-clock deadline для D1. Если upstream больше бюджета, baseline остаётся incomplete до отдельно проверенного изменения лимита/дизайна. |
| ADR-041 | Scheduled dry-run возвращает результаты ingestion с явной блокировкой real publication; Stage 5 simulation service не использовать как runtime real publisher. | Не создавать synthetic/production approvals ради previews. Сохранить needs_review/reasons/history и оба journals без новых записей. Real client/journal, evidence workflow, freshness thresholds, destinations и реальные requests требуют отдельных решений. Overlap защищён D1 CAS, без заявления о distributed mutex или exactly-once. |

Фактические проверки и ограничения: [Stage 6 local report](34_STAGE6_LOCAL_REPORT.md),
дальнейшие remote gates: [runbook](07_DEPLOYMENT_RUNBOOK.md).

### Stage 6 continuation — capacity decision, 2026-10-22

**ADR-042 — proposed, owner decision pending; не реализован новый protocol.**
Локальное продолжение назначено через CONTINUE_STAGE6. Измерять SQL statements
и D1 execution calls отдельно на настоящем binding; подготовку/миграции не
включать в handler sample. Metadata coverage и отсутствие remote CPU evidence
показывать явно. [Primary limits comparison](evidence/stage6-2026-10-22/cloudflare-preflight.md)
не разрешает автоматически выбрать Paid или признать workload Free-ready.

Текущий runtime допускает только 100 records/full snapshot и читает до 101
сохранённой canonical rows/provider. Превышение сохранённой истории безопасно
останавливает дальнейший import этого provider. Удаление/усечение history,
versions/evidence или завершение partial baseline не являются вариантами.
Увеличение числового cap без новых доказательств тоже не решает capacity.

| Вариант | Что потребуется | Граница решения |
|---|---|---|
| A. Сохранить нынешний предел для короткого staging observation | Подтвердить текущие feed/union sizes в отдельно разрешённом окне, plan/query accounting, CPU и stop budget; при partial/limit остановиться | Условный эксперимент, не решение роста истории и не stable-staging acceptance |
| B. Уменьшить работу existing atomic repository | Спроектировать групповые prepared writes/идемпотентное обновление, сравнить rows/SQL/CPU на том же harness, сохранить CAS, audit observations/versions и rollback | Отдельно выбрать scope; само уменьшение SQL не решает feed>100 или full-baseline protocol |
| C. Ввести durable bootstrap/snapshot protocol по нескольким invocations | Отдельный ADR/schema review для manifest, provider-scoped generation/snapshot identity, bounded chunks, restart/overlap и atomic finalization полного baseline; старый canonical snapshot доступен до завершения | Существенный новый protocol: требуется отдельное owner assignment до реализации; возможны только forward migrations |

**Обновление 2026-10-22: proposed, owner choice pending.** Владелец отдельно
назначил локальную capacity design/decision фазу через CONTINUE_STAGE6_CAPACITY.
[Decision record38](38_STAGE6_CAPACITY_DECISION.md) содержит bounded A,
минимальный repository change set B, manifest/chunk/finalization C, измерительную
матрицу и owner inputs. Рекомендован C с grouped writes внутри chunks, но выбор
владельцем не сделан. B/C не реализованы; plan/cost budget не выбран.
Следующий предлагаемый gate — отдельное local C implementation assignment,
ещё без remote действий. Unknown account/plan/budget/target и remote accounting
сохраняют active staging NO-GO. Stage6 stable acceptance pending, Stage7 следует
после завершения Stage6 и отдельного назначения. Текущий результат/checks/review:
[handoff39](39_STAGE6_CAPACITY_HANDOFF.md).

## Items for owner to confirm later (not blockers for Stage 0)

1. Actual GitHub `owner`/repo URL and verified Telegram handles (`@resetradarai`, `@resetradaraibot` suggested).
2. Whether separate brand/logo reuse terms or additional third-party content permissions are needed. The existing MIT LICENSE and copyright 2026 Salman remain unchanged; repository visibility is a separate owner choice.
3. Worker public hostname and Pages URL at launch; optionally custom domain in future.
4. Whether `/start` should be added soon after channel launch, as a **separate stage**.
5. RU default for Telegram; website RU/EN both available, default locale based on browser vs explicit (choose in website stage).
