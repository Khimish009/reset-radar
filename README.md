# 📡 Reset Radar | AI Limits

> **Never miss a public AI coding-tool limit reset.**

An independent, open-source tracker for **Claude Code** and **OpenAI Codex** public reset announcements, verified applications, extra/banked quota offers and meaningful usage-limit changes. **Telegram delivers alerts; the website displays history, change details and a transparent, source-linked dashboard.**

**Status: local Stage 6 dry-run preparation — not a running service.** Claude Resets and the owner-selected **codexreset.ai** adapters share durable D1 facts/versions, independent provider baselines and scoped HTTP cache. Worker `scheduled()` now connects ingestion to D1 only with explicit local/staging `INGEST_MODE=dry_run`, `APP_ENV` and `PUBLISH_MODE=dry_run`; all supplied configs stay inactive, and production cannot activate ingestion. Scheduled results explicitly block publication: no real Telegram publisher or approval workflow exists. Stage 5 previews and sending remain separate synthetic-only tools. No public data endpoints or website are implemented. **Not deployed / not published. Real staging E2E not performed.** Last documentation update: **2026-10-22**.

Local setup (Node version in `.nvmrc`):

```sh
npm ci
npm run typecheck
npm run lint
npm test
npm run test:d1
npm run d1:migrate:local
python3 docs/evidence/stage0-2026-10-21/verify.py
```

`typecheck` generates local Worker runtime types in ignored `.wrangler/`. No Cloudflare login or resources are needed. `wrangler.json` retains isolated dry-run targets with no bindings, routes or active Cron triggers. HTTP remains inert: reserved API paths return `501 not_implemented`; other read paths return `404`, and write methods return `405`. Scheduled ingestion requires explicit opt-in and DB; default/missing/invalid settings cannot start polling. Local tests inject clock/fetch and real Miniflare D1; opt-in HTTP tests route only to a loopback Postman substitute. No test or preview sends to Telegram. Codex uses only `codexreset.ai`, with no fallback or union with `codex-resets.com`. CORS and real public endpoints belong to Stage 9. See the [Stage 6 preflight report](docs/36_STAGE6_PREFLIGHT_REPORT.md) and [current handoff](docs/37_STAGE6_PREFLIGHT_HANDOFF.md).

Local D1 checks (Miniflare/workerd needs loopback access):

```sh
npm run d1:migrate:local
npm run test:d1
```

The migration command uses the separate `wrangler.d1.local.json` with a local-only database ID and explicit `--local`; state stays under ignored local `.wrangler/` storage. It does not configure staging or production resources. `test:d1` covers local Stage 4–6 D1 tests. Synthetic Stage 5 approvals and freshness settings exist only in test inputs; production publication approvals and thresholds remain pending for both providers. See the [Stage 6 local report](docs/34_STAGE6_LOCAL_REPORT.md) for actual new checks and the [handoff](docs/35_STAGE6_LOCAL_HANDOFF.md) for limits and reproduction.

| Surface | Role | Planned link |
|---|---|---|
| Telegram channel | public reset alerts | https://t.me/resetradarai |
| Telegram bot | initially channel publisher; private commands later | https://t.me/resetradaraibot |
| Website | public dashboard + event history + stats | `https://<GITHUB_USERNAME>.github.io/reset-radar/` (not deployed) |
| GitHub | code, issues, docs | `<OWNER>/reset-radar` (set after creation) |

**Verify Telegram handles with owner before publication; URLs are proposals, not proof of ownership.** Unofficial and unaffiliated with Anthropic, OpenAI, or the upstream tracker authors.

## What is included in MVP

- **Two independently verified upstream adapters**: Claude Resets and one approved Codex reset feed. Upstreams are community-maintained, **not official account-usage APIs**.
- Separate semantics for announced future resets, evidence-backed applied/delivered resets, extra/banked offers, verified changes/retractions and unknowns.
- Cloudflare Worker Cron (target every five minutes), D1 event history and independent source bootstrap, replay safety, monitoring and dry-run/staging/prod publication gates.
- Telegram channel messages with correct provenance and applicability; no duplicate history blast.
- **Public read-only API served by the same Worker**: `/api/v1/events`, `/api/v1/status`, `/api/v1/stats`.
- **Website on GitHub Pages**: `website/` Vite + TypeScript + plain CSS; RU/EN, responsive accessible layout; landing hero + real data, provider/type filters, latest events, factual statistics/graphs, timestamps, error and stale-data states; links to Telegram/GitHub.
- Website reads **our Worker API backed by D1**, never the third-party APIs from visitor browsers. Telegram and website share one normalized source of truth.

### Explicitly **not** in this release

- Personal Claude/Codex quotas, logins, cookies, user API/OAuth tokens or reset times; no forecasting promised as fact.
- Personalized bot subscriptions, payment, registration, admin panel or DM broadcasts.
- Cursor, Gemini, Copilot, scraping X, LLM-generated news, real-time guarantees.
- Automatic production deploy on ordinary code push; all production releases require a separate owner decision.

## Tech stack

TypeScript strict · Cloudflare Workers (scheduled + HTTP fetch) · Cloudflare D1 · Telegram Bot API · GitHub Pages · Vite static client · Vitest · GitHub Actions (test/website build and **owner-gated** deployment).

```text
Claude Resets ──┐
                ├─> Provider adapters ─> Event normalization/policy ─> D1
Codex reset API ┘                                           │
                                              ┌─────────────┴────────────┐
                                              v                          v
                                        Telegram Publisher       Public read-only API
                                              │                          │
                                        Telegram channel       GitHub Pages website
```

## Start with Codex CLI (recommended workflow)

1. Read `AGENTS.md`, this README, the [current handoff](docs/37_STAGE6_PREFLIGHT_HANDOFF.md), and specifications relevant to the owner's task. Consult other documents and `manual/OWNER_CHECKLIST.md` when needed.
2. Run Codex from the repository root and inspect `git status`, including staged and unstaged changes; preserve existing work.
3. Follow the **latest explicitly owner-approved task**. The owner assigned `CONTINUE_STAGE6.md`: local CI #18 test fix, D1 budget preflight, synthetic/loopback checks and independent review only. The report/handoff record the result; no later stage or remote/live/Git publication action is authorized. Previous commit permission does not carry forward.
4. Report actual changes/checks and stop before the next stage. See `prompts/STAGE_REVIEW.md`.
5. For a new project beginning with source research, `prompts/START_CODEX.md` describes Stage 0. When resuming this repository, use the current handoff rather than repeating completed stages.
6. Stage 6 implementation `7b4e129` is merged through [PR #6](https://github.com/Khimish009/reset-radar/pull/6) as `22ebefe`; [CI #17](https://github.com/Khimish009/reset-radar/actions/runs/39757187598) on the PR head passed. **Merge [CI #18](https://github.com/Khimish009/reset-radar/actions/runs/39757621399) failed**: the cache-validation D1 test exceeded 5s; typecheck/lint passed. At handoff preparation, local `main` and `origin/main` matched the verified remote merge. Exact SHAs, failure evidence and historical local checks are in the [handoff](docs/35_STAGE6_LOCAL_HANDOFF.md). The owner/external process performed push/PR/merge; the agent created only the authorized local commit. Recovery artifacts remain preserved; do not apply the old stash again.
7. The local [CONTINUE_STAGE6](prompts/CONTINUE_STAGE6.md) assignment adds a reproducible real-D1 workload harness (`npm run test:workload`). Local passing tests do not replace failed CI #18 or prove remote quotas/CPU. Active staging is **NO-GO** until account/plan/budget, query accounting and capacity scope are resolved. Full stable-staging acceptance remains pending; Stage 7 is not assigned. D1 creation/migration, inactive deploy/bindings, upstream/Cron observation and real Telegram work remain separate decisions; see the [runbook](docs/07_DEPLOYMENT_RUNBOOK.md).

## Documents

- `AGENTS.md` — non-negotiable instructions and safety gates.
- `docs/00–15` — product, ingestion, Telegram, operations, brand and launch.
- `docs/16_PUBLIC_API.md` — our read-only HTTP API contract.
- `docs/17_WEBSITE_SPEC.md` — website behavior, routes, RU/EN and design system.
- `docs/18_ANALYTICS_METHODOLOGY.md` — truthful metrics and data-quality rules.
- `docs/19_WEBSITE_DEPLOYMENT.md` — Vite/GitHub Pages/CORS/deployment.
- `docs/20_RELEASE_AND_BACKLOG.md` — phased shipping and non-goals.
- `docs/21_LEGAL_AND_LICENSE.md` — existing MIT license, third-party attribution, privacy and open brand/data-rights questions.
- `docs/24_STAGE1_REPORT.md`, `docs/25_STAGE1_HANDOFF.md` — historical Stage 1 result and handoff.
- `docs/26_STAGE2_REPORT.md`, `docs/27_STAGE2_HANDOFF.md` — historical Stage 2 result and handoff.
- [Stage 3 report](docs/28_STAGE3_REPORT.md), [historical handoff](docs/29_STAGE3_HANDOFF.md) — accepted local Codex adapter and PR #3 fixes.
- [Stage 4 report](docs/30_STAGE4_REPORT.md), [historical handoff](docs/31_STAGE4_HANDOFF.md) — local D1, normalization, ingestion, checks and pending production decisions.
- [Stage 5 report](docs/32_STAGE5_REPORT.md), [historical handoff](docs/33_STAGE5_HANDOFF.md) — accepted local Telegram rendering, publisher and loopback simulation; production decisions remain pending.
- [Stage 6 local report](docs/34_STAGE6_LOCAL_REPORT.md), [historical handoff](docs/35_STAGE6_LOCAL_HANDOFF.md) — original scheduled dry-run integration and merge/CI context.
- [Stage 6 preflight report](docs/36_STAGE6_PREFLIGHT_REPORT.md), [current handoff](docs/37_STAGE6_PREFLIGHT_HANDOFF.md) — local CI test fix, real-D1 workload evidence, conditional go/no-go and separate remote gates; stable staging remains pending.
- `prompts/START_STAGE3.md` — local Codex adapter assignment with explicit source/base gates.
- `prompts/START_STAGE4.md` — explicitly assigned local D1/policy scope; reading or preparing the prompt alone grants no permission.
- `prompts/START_STAGE5.md` — owner-assigned local Telegram publisher scope; does not authorize production publication or Stage 6.
- [START_STAGE6](prompts/START_STAGE6.md) — assigned local staging preparation; remote operations and real sends remain excluded.
- [CONTINUE_STAGE6](prompts/CONTINUE_STAGE6.md) — owner-assigned local continuation scope; future remote gates remain separately authorized. The prompt alone grants no new assignment.
- `manual/OWNER_CHECKLIST.md` — actions that require the owner, **no secrets**.
- `prompts/START_CODEX.md` — exact Stage 0 assignment; `prompts/STAGE_REVIEW.md` — stage acceptance report.
- `brand/channel-avatar.png`, `brand/bot-avatar.png` — distinct matching brand assets.

## Safety, truth & limitations

- Subscriber account usage is **never read**; the service tracks public community-recorded events only.
- Do not claim rollout completion without verified delivery evidence. Unknown, retracted or forecast-only events never become definitive reset alerts.
- Third-party feeds may be delayed, incomplete, corrected or unavailable. Present **last successfully ingested** timestamps; stale dashboard data is clearly labeled.
- Attribution to trackers *and* original public announcements (where available) in Telegram and on website.
- Secrets are never stored in the website, repo, docs or the public API. No first-run history spam.

## Contributing and license

Issues and PRs are welcome after the owner enables them. The repository already contains the MIT [LICENSE](LICENSE), copyright 2026 Salman, and `package.json` declares `MIT`. This records the existing state; it is not a new owner licensing decision and changes no license text or copyright. Whether separate brand reuse terms or additional third-party content permissions are needed remains open. See [licensing and data rights](docs/21_LEGAL_AND_LICENSE.md).
