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
source migration, and baseline approval remain future owner decisions. No
publisher or Stage 4 is authorized.

Before altering stack/site hosting, claiming delivery without evidence, implementing new providers, making bot personal, adding visitor tracking, enabling auto-prod-deploy or changing copyright/license, document decision + alternatives + risk and wait for owner approval.

## Items for owner to confirm later (not blockers for Stage 0)

1. Actual GitHub `owner`/repo URL and verified Telegram handles (`@resetradarai`, `@resetradaraibot` suggested).
2. Whether separate brand/logo reuse terms or additional third-party content permissions are needed. The existing MIT LICENSE and copyright 2026 Salman remain unchanged; repository visibility is a separate owner choice.
3. Worker public hostname and Pages URL at launch; optionally custom domain in future.
4. Whether `/start` should be added soon after channel launch, as a **separate stage**.
5. RU default for Telegram; website RU/EN both available, default locale based on browser vs explicit (choose in website stage).
