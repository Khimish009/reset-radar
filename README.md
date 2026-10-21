# 📡 Reset Radar | AI Limits

> **Never miss a public AI coding-tool limit reset.**

An independent, open-source tracker for **Claude Code** and **OpenAI Codex** public reset announcements, verified applications, extra/banked quota offers and meaningful usage-limit changes. **Telegram delivers alerts; the website displays history, change details and a transparent, source-linked dashboard.**

**Status: Stage 1 local Worker foundation — not a running service.** The Worker has no-op scheduled/HTTP handlers, strict TypeScript, tests and CI checks. Adapters, D1, Telegram publishing, public data endpoints and website are not implemented. **Not deployed / not published.** Last documentation update: **2026-10-21**.

Local setup (Node version in `.nvmrc`):

```sh
npm ci
npm run typecheck
npm run lint
npm test
python3 docs/evidence/stage0-2026-10-21/verify.py
```

`typecheck` first generates local Worker runtime types in ignored `.wrangler/`. No Cloudflare login or resources are needed. `wrangler.json` defines isolated local/staging/production dry-run targets with no bindings, routes or active Cron triggers. The three reserved API paths return `501 not_implemented`; other read paths return `404`, write methods return `405`. No handler calls upstream, Telegram or D1. CORS and real public endpoints belong to Stage 9. See [Stage 1 report](docs/24_STAGE1_REPORT.md).

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

1. Read `AGENTS.md`, this README, the [current handoff](docs/25_STAGE1_HANDOFF.md), and specifications relevant to the owner's task. Consult other documents and `manual/OWNER_CHECKLIST.md` when needed.
2. Run Codex from the repository root and inspect `git status`, including staged and unstaged changes; preserve existing work.
3. Follow the **latest explicitly owner-approved task**. Prepared prompts and completed reviews do not authorize a later stage; [START_STAGE2](prompts/START_STAGE2.md) remains prepared for separate approval.
4. Report actual changes/checks and stop before the next stage. See `prompts/STAGE_REVIEW.md`.
5. For a new project beginning with source research, `prompts/START_CODEX.md` describes Stage 0. When resuming this repository, use the current handoff rather than repeating completed stages.

## Documents

- `AGENTS.md` — non-negotiable instructions and safety gates.
- `docs/00–15` — product, ingestion, Telegram, operations, brand and launch.
- `docs/16_PUBLIC_API.md` — our read-only HTTP API contract.
- `docs/17_WEBSITE_SPEC.md` — website behavior, routes, RU/EN and design system.
- `docs/18_ANALYTICS_METHODOLOGY.md` — truthful metrics and data-quality rules.
- `docs/19_WEBSITE_DEPLOYMENT.md` — Vite/GitHub Pages/CORS/deployment.
- `docs/20_RELEASE_AND_BACKLOG.md` — phased shipping and non-goals.
- `docs/21_LEGAL_AND_LICENSE.md` — existing MIT license, third-party attribution, privacy and open brand/data-rights questions.
- `docs/24_STAGE1_REPORT.md`, [current handoff](docs/25_STAGE1_HANDOFF.md) — Stage 1 results and context for separately approved work.
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
