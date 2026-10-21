# 📡 Reset Radar | AI Limits

> **Never miss a public AI coding-tool limit reset.**

An independent, open-source tracker for **Claude Code** and **OpenAI Codex** public reset announcements, verified applications, extra/banked quota offers and meaningful usage-limit changes. **Telegram delivers alerts; the website displays history, change details and a transparent, source-linked dashboard.**

**Status: design and Codex-ready documentation — not a running service.** This starter contains no working Worker, deployed website or configured private bot. Last documentation update: **2026-10-21**.

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

1. Read `AGENTS.md`, `docs/00_PROJECT_BRIEF.md`, `docs/08_DEVELOPMENT_PLAN.md`, `docs/09_DECISIONS.md`, `manual/OWNER_CHECKLIST.md`.
2. Unpack to the **root of the new Git repository**, with the top-level `AGENTS.md` and `docs/` folder adjacent. Open a terminal in that root, run `codex`.
3. Give Codex `prompts/START_CODEX.md`. **Authorize only Stage 0**: live API truth-check for both sources, *not* construction/deployment of the whole product.
4. Codex reports evidence, updates docs, and stops until the owner accepts the stage. See `prompts/STAGE_REVIEW.md`.
5. Later stages add Worker/D1/Telegram, then public API and website without changing the chosen infrastructure.

## Documents

- `AGENTS.md` — non-negotiable instructions and safety gates.
- `docs/00–15` — product, ingestion, Telegram, operations, brand and launch.
- `docs/16_PUBLIC_API.md` — our read-only HTTP API contract.
- `docs/17_WEBSITE_SPEC.md` — website behavior, routes, RU/EN and design system.
- `docs/18_ANALYTICS_METHODOLOGY.md` — truthful metrics and data-quality rules.
- `docs/19_WEBSITE_DEPLOYMENT.md` — Vite/GitHub Pages/CORS/deployment.
- `docs/20_RELEASE_AND_BACKLOG.md` — phased shipping and non-goals.
- `docs/21_LEGAL_AND_LICENSE.md` — third-party attribution, privacy, open-source licensing decision.
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

Issues and PRs are welcome after the owner enables them. **License choice is pending owner approval** (MIT was recommended, not automatically granted). The public visibility of a repository does not itself grant permission for unrestricted reuse. Brand artwork may have separate usage terms. See `docs/21_LEGAL_AND_LICENSE.md`.
