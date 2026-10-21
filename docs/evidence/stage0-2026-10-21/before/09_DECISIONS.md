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
| ADR-014 | **MIT license suggested**, but no final license or name in notice chosen | **pending owner** | Public != licensed; add `LICENSE` after explicit owner approval |
| ADR-015 | API providers: Claude Resets + CodexReset as candidate, codex-resets as alternative | **pending Stage 0** | Must verify live payloads, reuse/terms and evidence |
| ADR-016 | Website URL/GitHub username and Telegram handles | **pending verification** | Never invent live URLs from placeholders |
| ADR-017 | `stale` threshold 30 min, public caching 60–300s | **initial proposal; validate** | Balance recency, costs and transparent freshness |
| ADR-018 | No external visitor analytics/ads in initial version | agreed initial restraint | Privacy and simplicity; can revisit |

## Changes require an ADR

Before altering stack/site hosting, claiming delivery without evidence, implementing new providers, making bot personal, adding visitor tracking, enabling auto-prod-deploy or changing copyright/license, document decision + alternatives + risk and wait for owner approval.

## Items for owner to confirm later (not blockers for Stage 0)

1. Actual GitHub `owner`/repo URL and verified Telegram handles (`@resetradarai`, `@resetradaraibot` suggested).
2. Public GitHub + MIT licensing; copyright holder/year text and logo re-use terms.
3. Worker public hostname and Pages URL at launch; optionally custom domain in future.
4. Whether `/start` should be added soon after channel launch, as a **separate stage**.
5. RU default for Telegram; website RU/EN both available, default locale based on browser vs explicit (choose in website stage).
