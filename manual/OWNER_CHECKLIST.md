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
- [x] Owner accepted local Stage 3 with PR #3 fixes when assigning the local Stage 4 task.
- [x] Owner separately authorized a local Stage 3 commit after the report.
- [x] Owner separately authorized two P2 fixes, independent review and commit/push to the existing PR #3 branch only.
- [x] Owner separately authorized only local Stage 4. This does not authorize commit/push/PR/merge, remote D1, deployment, Telegram sends or Stage 5.

## Stage 4 — local D1, normalization and ingestion

- [x] Owner accepted the local Stage 4 result from PR #4 and assigned only local Stage 5.
- [ ] Confirm D1 schema/constraints, immutable observations and material versions, CAS + batch rollback, per-provider baseline, recoverable scoped HTTP cache, and synthetic journal outcomes against actual test results.
- [ ] Confirm assumptions remain labeled: Codex's unpaginated feed is treated as complete locally; Claude's count/revision/status-union check establishes client consistency, not official upstream completeness.
- [ ] Keep production truth/eligibility, staleness threshold, Codex correction correlation, retention beyond the bounded HTTP cache, and provider activation policy pending until separately decided.
- [ ] Check actual outputs for `npm run typecheck`, `npm run lint`, `npm test`, local-only D1 migration/integration, Stage 0 evidence verification, and `git diff --check`; do not treat this checklist as evidence that a command passed.
- [x] Owner separately authorized a local Stage 4 commit, including the preserved preparation and workspace consolidation documentation.
- [x] Read-only verification found Stage 4 commit `7121756` in merged PR #4 (`2a0a958`), CI head run #11 success. The owner/external process performed push/PR/merge; the agent did not perform them.
- [ ] Separately authorize future commit/push/PR/merge, remote migration, deployment or Telegram send. The later local Stage 6 assignment grants none of these permissions.

## Stage 5 — assigned local publisher

- [x] Save `prompts/START_STAGE5.md` and current handoff with the Stage 4 base, results, pending policy and Git recovery context.
- [x] Owner accepted local Stage 4 and explicitly assigned only the local Stage 5 scope: Telegram client/templates/publisher, D1 seams and synthetic tests.
- [x] Owner accepted the local Stage 5 result from merged PR #5, including review/CI fixes, by assigning START_STAGE6 on 2026-10-22.
- [ ] Keep production truth/eligibility, freshness thresholds, approval workflow, activation, Codex correlation and real Telegram outcomes pending separate decisions.
- [ ] Separately authorize any live staging E2E, real token/channel setup or remote migration/deploy. Local runtime wiring was authorized later through START_STAGE6; that assignment grants no remote/live permissions.
- [x] Complete separately authorized PR #5 review fixes and CI timeout fix; last PR head `bb2cd25`, CI #15 success. Read-only verification found PR #5 merged by owner/external process as `ba8bd58`, merge CI #16 success.

## Stage 6 — assigned local preparation; remote acceptance pending

- [x] Save `prompts/START_STAGE6.md` and update Stage 5 handoff/report with exact merge/fix SHAs, CI results, regression guards, recovery context and remaining integration gaps.
- [x] Owner explicitly assigned START_STAGE6 and accepted local Stage 5; only local dry-run runtime integration, tests, independent review and staging planning are authorized.
- [ ] Review [Stage 6 local report](../docs/34_STAGE6_LOCAL_REPORT.md) and independent review; local preparation does not satisfy the full stable-staging acceptance.
- [x] After the local Stage 6 report, owner separately authorized its local commit, including preserved documentation preparation.
- [x] Read-only verification found local commit `7b4e129` in merged PR #6 (`22ebefe`), pushed/merged by owner or external process. PR CI #17 success; merge CI #18 failed on the existing cache-validation D1 test timeout.
- [ ] Separately authorize any new commit/push/PR/merge; prior Git permissions do not carry forward.

## Stage 6 continuation — local preflight assigned

- [x] Save CONTINUE_STAGE6 and update report/handoff/README with merge/CI state, exact failure evidence, preserved safeguards and remaining gates.
- [x] Owner explicitly assigned [CONTINUE_STAGE6](../prompts/CONTINUE_STAGE6.md) for local CI #18 diagnosis/fix, D1 workload/capacity preflight, checks and independent review only.
- [ ] Review [new preflight report](../docs/36_STAGE6_PREFLIGHT_REPORT.md) and [handoff](../docs/37_STAGE6_PREFLIGHT_HANDOFF.md); local passing checks do not override failed merge CI or prove stable staging.
- [x] After the preflight report, owner separately authorized commit and push of the reviewed result to `feat/stage6-staging-preflight` only; PR/merge and remote/live service operations remain separate gates.
- [x] Agent committed/pushed `7a9eedf`; read-only verification found PR #7 merged by owner/external process as `1bfbe98`, PR CI #19 and merge CI #20 successful. No staging acceptance follows from merge/CI.
- [ ] Confirm account/profile, effective Workers plan/D1 limits, shared quota headroom, staging target/region, maximum cost and numeric stop thresholds before remote decisions; no automatic Paid upgrade.
- [ ] Decide the capacity scope in ADR-042: accept the current bound for a short observation or separately assign a repository/bootstrap design. Do not delete history or treat partial baseline as complete.
- [ ] Separately authorize only staging D1 creation after the preceding review; actual ID/binding, migrations, inactive deploy and upstream/Cron window remain later separate gates in the runbook.

## Stage 6 capacity — local design assigned; owner choice pending

- [x] Save [CONTINUE_STAGE6_CAPACITY](../prompts/CONTINUE_STAGE6_CAPACITY.md) with current commit/merge/CI, local ref drift, tested workload facts, ADR options and permission boundaries.
- [x] Owner explicitly assigned that prompt for local design/decision, checks/review/report only; protocol implementation and remote operations remain excluded.
- [ ] Review [capacity decision38](../docs/38_STAGE6_CAPACITY_DECISION.md) and [handoff39](../docs/39_STAGE6_CAPACITY_HANDOFF.md); choose A/B/C. Recommendation C is proposed, not owner approval.
- [ ] Supply safe account/profile label, effective plan/limits/headroom, target/region, history/cadence and numeric maximum spend/stop budgets; all currently unknown.
- [ ] Exactly next proposed gate: separately assign **local C implementation** using docs38 §9, with its acceptance/measurement matrix; no remote permission. If choosing A instead, after prerequisites authorize only isolated staging D1 creation, not migrations/deploy/reads.
- [ ] Complete Stage 6 stable-staging acceptance before a separate Stage 7 assignment.

## Worker/D1 staging (later; separate authorization)

- [ ] Create Cloudflare account and login via Wrangler *interactively* when authorized.
- [ ] Separately authorize isolated staging D1 creation and remote migrations after exact account/database/target review.
- [ ] Separately authorize staging bindings and inactive dry-run deployment; no production activation.
- [ ] Separately authorize upstream polling and Cron observation, two independent complete baselines, safe logs and quota measurements; full stable-staging acceptance remains pending.
- [ ] Separately design/approve the real Telegram publisher/journal, token/channel setup and eligibility policy. Current synthetic journals/client cannot substitute for them.
- [ ] Separately authorize any real Telegram requests/sends, including a staging test. Owner enters a token securely only when that later design needs it; never paste into chat.

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
