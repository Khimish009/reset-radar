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
- [x] Owner chose `codexreset.ai` for the local Stage 3 adapter on 2026-10-21; no alternative fallback or history union.
- [ ] Accept production truth/publication policy before publication. The local source choice does not approve it.

## Stage 1 — local foundation only

- [x] Owner explicitly authorizes only Stage 1 via `prompts/START_STAGE1.md`.
- [x] Local Worker skeleton, isolated dry-run configuration, safe logger and typed vocabulary; no upstream/D1/Telegram integration.
- [x] Documentation/prompts visible to Git; secrets/dependencies/local runtime artifacts ignored. No automatic commit or push.
- [ ] Review actual checks and independent review in `docs/24_STAGE1_REPORT.md`; owner accepts the stage.
- [x] Separately authorize Stage 2 through `prompts/START_STAGE2.md`; this authorization does not choose Codex or accept production truth policy.

## Stage 2 — local Claude adapter only

- [x] Claude status/resets/sources adapter, strict contract validation, conservative mapping and deterministic tests implemented locally.
- [x] Evidence contract projection is saved separately in `docs/evidence/stage2-claude-2026-10-21/`; raw upstream response bodies are not committed.
- [x] Owner accepted local Stage 2 with PR #2 fixes by explicitly assigning START_STAGE3.md; merged base verified.
- [ ] Provider baseline and production publication truth policy remain pending. None is approved by Stage 2 or Stage 3.
- [x] Owner separately authorized only local Stage 3 and explicitly selected the feed; original commit/push permission is not reused.

## Stage 3 — local Codex adapter only

- [x] Parse only `codexreset.ai` with strict validation, source-specific semantics and independent HTTP/cache/backoff; preserve seeded/archive credit.
- [x] Test future announcements with known and unknown expected time separately from delivery; preserve primary URL, scope and detection/announcement clocks. Hinted/rumors remain review.
- [x] Record targeted live contract observations separately from synthetic tests; keep the Stage 0 archive unchanged.
- [x] Typecheck/lint/offline tests/local HTTP simulation passed; independent review completed with no remaining critical/high/medium findings.
- [ ] Owner reviews [Stage 3 report](../docs/28_STAGE3_REPORT.md) and independent review, then accepts or requests changes.
- [x] Owner separately authorized a local Stage 3 commit after the report.
- [x] Owner separately authorized two P2 fixes, independent review and commit/push to the existing PR #3 branch only.
- [ ] Separately authorize merge/new PR operations and a new Stage 4 assignment. No D1, deployment or Telegram send is authorized.

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
