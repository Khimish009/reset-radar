# Owner action checklist — no secrets written here

## Telegram (partially prepared by owner)

- [ ] Verify actual channel handle `@resetradarai` and set title **Reset Radar | AI Limits**; write verified URL in docs when confirmed.
- [ ] Verify actual bot handle `@resetradaraibot` and set bot display title **Reset Radar | Alerts**.
- [ ] Install `brand/channel-avatar.png` and `brand/bot-avatar.png`; set short profile texts in `docs/14_BRAND_AND_TELEGRAM_PROFILES.md` (do not exceed Telegram limits).
- [ ] Bot is channel admin with **Post Messages** only. Channel `Sign Messages` can stay off.
- [ ] Keep BotFather token in password manager, never share token with Codex/chat/GitHub README.
- [ ] Make a separate **test channel** before Telegram E2E; do not post test content in production channel.
- [ ] Do not advertise private-chat bot commands unless implemented; bot About should point to channel.

## GitHub before Stage 0/1

- [ ] Create repository **`reset-radar`** in your GitHub account; prefer public if comfortable with public code and planned GitHub Pages Free.
- [ ] Suggested repo Description: `Public Telegram alerts and an open dashboard for Claude Code and Codex limit resets, bonus quotas, and usage updates.`
- [ ] Add topics: `telegram-bot`, `claude-code`, `openai-codex`, `cloudflare-workers`, `typescript`, `github-pages`, `ai-tools`, `notifications`.
- [ ] Don't auto-create a second README/gitignore if you unpacked the starter already; don't duplicate scaffolds.
- [x] Record the existing MIT LICENSE, copyright 2026 Salman, and `license: MIT` in package.json. This is existing repository state, not a new owner licensing decision; preserve LICENSE/copyright.
- [ ] Decide whether separate brand reuse terms or additional third-party content permissions are needed before release; no new terms are introduced by the documentation correction.
- [ ] Run `gh auth login` when ready; allow Codex pushes/PR creation **only per explicit task**. Prefer branch/PR, no force push.

## Stage 0 now — no infrastructure required

- [ ] Unzip to `reset-radar/` root, run `codex` from that directory, provide `prompts/START_CODEX.md`.
- [ ] Require actual API proof for both trackers, not just docs, and report restrictions and schema uncertainty.
- [ ] Owner chooses approved Codex source before its adapter and accepts production truth policy before publication. The explicit Stage 1 prompt permits the neutral foundation while these remain pending.

## Stage 1 — local foundation only

- [x] Owner explicitly authorizes only Stage 1 via `prompts/START_STAGE1.md`.
- [x] Local Worker skeleton, isolated dry-run configuration, safe logger and typed vocabulary; no upstream/D1/Telegram integration.
- [x] Documentation/prompts visible to Git; secrets/dependencies/local runtime artifacts ignored. No automatic commit or push.
- [ ] Review actual checks and independent review in `docs/24_STAGE1_REPORT.md`; owner accepts the stage.
- [ ] Separately authorize Stage 2. No automatic continuation or remote operations.

## Worker/D1 staging (later)

- [ ] Create Cloudflare account and login via Wrangler *interactively* when authorized.
- [ ] Approve staging D1, test channel configuration and staging Worker deploy (never production accidentally).
- [ ] Enter Telegram token into Cloudflare Secret securely; don't paste token into Codex messages.
- [ ] Verify both provider baselines in dry-run and one owner-approved **staging** publication.

## Production (separate approval!)

- [ ] Owner approves prod D1 DB/migrations and dry-run deploy; verify separate prod baseline for both providers.
- [ ] **Then** separate explicit approval for enabling production sends for each provider.
- [ ] Verify release SHA, rollback and two provider last-success markers.

## Public API / website (after Telegram stabilizes)

- [ ] Owner approves Stage 9 Worker **read-only** public API deploy, verifies `/api/v1/events`, `/status`, `/stats` and no secret leakage.
- [ ] Owner supplies real GitHub username and Pages link; sets repo **Settings → Pages → Source → GitHub Actions**.
- [ ] Approve Stage 10 site deploy. Check proper `/reset-radar/` asset paths and actual browser CORS to Worker origin.
- [ ] Check site mobile, RU/EN, CTA, metrics definitions, source attribution, stale errors and correct canonical URL.
- [ ] Replace placeholder website in README/pinned channel post **only after** actual site works. Channel↔site↔GitHub links; bot→channel.
- [ ] Check worker/D1 Free-tier usage; decide acceptable cost/risk.

## Launch and growth

- [ ] Pinned explainer in channel, accuracy/source policy, contact/feedback link via GitHub Issues.
- [ ] Promote the **channel**, not a nonfunctional private bot; link to live site once ready.
- [ ] Share useful content with communities where permitted; no unsolicited messages or bought subscribers.
- [ ] Track correctness, missed alerts and subscription growth; handle corrections transparently.
