# 07 — Operations / Cloudflare deployment runbook (staging and production)

**These are procedures, not commands already executed.** Codex must verify installed Wrangler version and correct syntax against current official docs; do not fabricate D1 UUIDs or a deployed workers.dev URL. Owner approval is needed for all remote resource creation/migration/secrets/deploy.

## Local prerequisites (owner)

- GitHub account and repo `reset-radar`; `git` and `gh` CLI authenticated if owner agrees to push/PR.
- Cloudflare account (Workers/D1), Node LTS and local npm; Wrangler via project dependency. `npx wrangler login` by owner when ready.
- Telegram channel+publisher bot; bot admin **Post Messages** only; test channel separate from real channel.
- Exact owner-verified usernames and GitHub username; do not infer from placeholders.

## Planned environments

| Parameter | staging | production |
|---|---|---|
| Worker name | `reset-radar-staging` | `reset-radar` |
| D1 DB | `reset-radar-staging-db` | `reset-radar-prod-db` |
| Telegram destination | test channel | real channel |
| Publish config initially | `dry_run` | `dry_run` |
| CORS | selected dev/local origins | verified GitHub Pages/custom domain |

Never allow fallback to production channel ID if staging variable is missing. Use separate accounts/bot secrets where feasible. `TELEGRAM_BOT_TOKEN` as Cloudflare Secret; channel ID as per-environment variable. Remote migrations require separate owner go-ahead.

## Recommended release sequence

1. Stage 0 and local tests complete; owner approves adapter data and truth policy.
2. Initialize Wrangler project config and local D1, apply/review migrations locally; no remote changes yet.
3. Owner authorizes staging DB creation, migration, secrets and staging Worker deploy. Inspect actual cron and health.
4. With `dry_run` poll both source snapshots until **complete baselines**; ensure no message in real Telegram.
5. Owner authorizes one staged test send; check escaping and links; monitor Cron failures and duplicates.
6. Owner reviews production plan. Create prod D1/migrate and deploy with `PUBLISH_MODE=dry_run`; verify source baselines separately.
7. Owner explicitly approves publication per provider after baseline; record release SHA and first real eligible post.
8. After public API Stage 9, enable **read-only HTTP** endpoints in production via approved deploy, verify GET/status/stats/events, privacy/CORS/caching.
9. After site Stage 10, configure **GitHub Pages Source → GitHub Actions** and approve first build/deploy; verify URLs on phone and browser, cross-origin fetch, SEO metadata, and site links.
10. After Stage 11 analytics/reporting, verify definitions and published disclaimers; monitor free-tier quotas.

## Secrets guidance

Never paste token into chat or repo. Owner can interactively execute `npx wrangler secret put TELEGRAM_BOT_TOKEN` with appropriate environment flag **after validating Wrangler version and target**. Avoid exposing token through shell history. `.dev.vars` is gitignored. CI deploy secrets (if added later) use least privilege scoped tokens.

## GitHub Actions

- CI on PR: install, typecheck, lint, unit/integration and site build once it exists; no prod side effects.
- Pages deployment: approved workflow on `main`, with `contents: read`, `pages: write`, `id-token: write`; owner configures Pages as **GitHub Actions**. `website/` build uses correct `base`.
- Worker prod deployment should **not** auto-run on merge initially. Manual dispatch with environment protection/required reviewer preferred.
- Do not emit `.dev.vars`, tokens, Wrangler state or DB exports into artifact uploads.

## Verify/rollback

Read Cloudflare Worker logs and D1 last-success indicators; verify PUBLIC API all GETs, caching and CORS from exact site origin; confirm no private environment leaks. To stop alerts: disable publication flags or safely disable scheduled publisher by approved config, not by blindly deleting DB. Website rollback uses a previous approved GitHub Pages workflow release; site should degrade gracefully on API outage.

## Quotas: validate periodically

Cloudflare Free currently advertises 100k Worker requests/day and 128MB worker memory; D1 5M read rows/day, 100k written rows/day, 5GB total account storage and max 500MB per Free DB (2026 docs). Free caps may change and quotas **do block operations** if exceeded. Site traffic likely dominates read usage; cache public responses and index D1. Sources: links in `docs/11_SOURCES.md`.
