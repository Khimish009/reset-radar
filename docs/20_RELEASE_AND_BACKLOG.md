# 20 — Product release map and future options

## Recommended milestones

| Milestone | Stages | Visible outcome | Go/no-go gate |
|---|---|---|---|
| A. Validated sources | 0 | evidence matrix, permitted feed selection | owner approves source truth |
| B. Reliable monitored backend | 1–4 | tests, normalized D1 history, dry-run, zero historic posts | local D1 tests green |
| C. Telegram channel MVP | 5–8 | safe channel posts for future eligible events | staging proof + independent prod approval |
| D. Public API | 9 | events/status/stats served read-only by same Worker | API safety/CORS/cache/provenance tests |
| E. Static website | 10 | RU/EN GitHub Pages responsive dashboard and Telegram CTA | real website links and mobile tests |
| F. Analytics & growth | 11 | methodological graphs, source freshness, docs, measured launch | owner accepts data correctness |

**If speed is more important:** finish A→C first, then D→E; don't block the functioning Telegram service while perfecting SEO/chart styling. **Architecturally** D1/normalized events must support history from the start.

## Strong boundaries

- Site is not itself a polling daemon, and does not share bot secrets.
- Person-specific usage limits are different data from global public resets and not accessible from our community event API.
- No paid service, admin or account system in this version; hosting targets Free plans but is measured not guaranteed.

## Future backlog (only with separate product approval)

- Bot `/start` with website/channel CTA, then personal `claude/codex` interest subscriptions (opt-in only; separate Telegram user data privacy handling).
- Additional vetted providers after measurable demand and data-rights check (Cursor, Gemini CLI, Copilot).
- Event-specific static detail pages (pre-rendered from our API for SEO), source comparisons, CSV export and public API docs.
- Own domain once there's enough traffic to justify recurring cost; optional PWA / alerts beyond Telegram.
- Advanced incident reporting for source delays and corrections; source attribution contributions with review queue.
- No credential-based personal quotas until a supported official API exists and explicit privacy/security assessment is approved.

## Explicit release disclaimer

The starter ZIP is **documentation + brand assets**, NOT backend source, production D1 migration, website files, CI workflows, working bot or real API. Codex will implement these according to authorized stages.
