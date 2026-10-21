# 05 — Security, abuse protection and privacy

## Assets / trust boundaries

- Telegram BotFather bot token authorizes channel posts; treat as **high-risk secret**.
- Cloudflare account/CI deploy credentials and D1 production bindings must be least privilege, different from development.
- Community API JSON is untrusted; validate JSON/schema, timestamps, source URLs and HTML output.
- Public Worker API, browser and GitHub Pages are fully public/untrusted. **Never provide a privileged HTTP operation** in public `fetch()`.
- GitHub repo and website bundle are public; **nothing private goes in repository or `VITE_*` build vars**.

## Required controls

1. Bot only has **Post Messages** channel admin permission. Don't grant delete/edit/add admins unless separately justified.
2. Store `TELEGRAM_BOT_TOKEN` in Cloudflare Secrets and local ignored `.dev.vars`; no secrets in logs, screenshots, docs, CI outputs, website code or browser responses. Keep production channel ID separate from staging.
3. `PUBLISH_MODE=dry_run` by default; independent per-provider baseline and publication approval; no historical blast and no automatic prod approval from deploy.
4. HTTP routes only GET/HEAD/OPTIONS for explicitly allowlisted public APIs. Do NOT expose ingestion triggers, publishing, configuration, uploads, raw moderation payloads or internal error stacks. Rate/cost protections if public usage grows.
5. CORS: allow configured GitHub Pages `https://<username>.github.io`, optionally approved custom domain, and localhost only in a non-production configuration. CORS is **not security/authentication**; public endpoints remain public even via curl.
6. Validate `provider`, `type`, from/to ranges, `limit` (suggest <=50), page/cursor and sensible max date span. Use prepared D1 queries and safe URL handling. Standardized sanitized API errors.
7. XSS: render text nodes (never unsafe `innerHTML` with upstream `summary`); links with HTTPS allowlist/safe normalization, `rel="noopener noreferrer"` for external targets; omit source URLs that cannot be safely validated.
8. Credentials, cookies, OAuth tokens or personal Claude/Codex balances **not required, stored or requested**. No visitor accounts in MVP. Avoid analytics scripts that track individuals; only aggregated anonymous operational metrics if owner approves.
9. Separate staging and prod Cloudflare D1/channel/bot resources where possible; no production config copied into docs or previews. GitHub Actions secrets must be scoped, owner-reviewed and least privilege.
10. On incidents: bot token leaked -> rotate BotFather token, replace secret, audit unauthorized posts; source false-positive -> pause publishing, preserve audit and post correction only when substantiated.

## Website-specific security

- Vite **build-time** public Worker API origin can be in `VITE_PUBLIC_API_BASE_URL`; never put actual keys in any `VITE_` variable.
- GitHub Pages is a public static deployment. Only assets and approved public copy shipped. Local storage not required for basic product; if language preference is stored it must not include sensitive data.
- No direct browser call to clauderesets.com/codexreset.ai; keep external polling and cached rate limits server-side.
- Do not set false `status=live`; stale source records need explicit `stale` signal and last success time.

## Short privacy and disclaimer copy

> Reset Radar tracks publicly announced AI tooling resets and usage-limit changes. We do not request account credentials, monitor your personal quota, or guarantee that an announcement applies to a particular account. Reset Radar is independent and not affiliated with Anthropic or OpenAI. Event data comes from third-party trackers and linked original announcements.

Licensing of source datasets/graphics and privacy disclosure reviewed separately in `docs/21_LEGAL_AND_LICENSE.md`.
