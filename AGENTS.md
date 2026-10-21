# AGENTS.md — instructions for Codex CLI (Reset Radar | AI Limits)

You are implementing a small **open-source AI reset monitoring product** in this repo. Read `README.md`, **all** `docs/*.md`, `manual/OWNER_CHECKLIST.md` and `git status` first. Follow this document over any conflicting task suggestions; flag contradictions rather than inventing requirements. Documentation version **v3 / 2026-10-21**.

## The approved architecture is fixed

- TypeScript strict, Cloudflare Worker **scheduled Cron AND read-only HTTP API**, Cloudflare D1 as canonical state, Telegram Bot API as publisher.
- Two MVP upstream adapters: `claude` and `codex`. Research primary Codex source; never assume `codex-resets.com` and `codexreset.ai` are the same operator/API. No Cursor/Gemini/Copilot in MVP.
- One GitHub repo `reset-radar`; a `website/` project using Vite + TypeScript + CSS, deployed as static files on **GitHub Pages** through a reviewed GitHub Actions workflow. No React/Next.js/SSR unless the owner explicitly changes scope.
- The website fetches **our** `/api/v1/{events,status,stats}` Worker endpoints, backed by D1, never reads upstream trackers directly; browser receives no bot token, Cloudflare credential, D1 binding or publishing endpoint.
- Telegram receives one channel publication per eligible event/transition. The private-chat bot `/start` is deferred until separately approved and implemented. Cross-link website/channel/GitHub (bot only when functional).
- Source attribution and independent disclaimers must appear in published content and website; no upstream vendor assets/logo impersonation.

## Current authorization and phase gates

1. **Default permitted task = Stage 0 only**, defined in `docs/08_DEVELOPMENT_PLAN.md` and `prompts/START_CODEX.md`. Investigate BOTH upstream API contracts, data rights and semantics; update evidence docs. Do not implement the backend or website on Stage 0.
2. Work on **one stage only** and stop for owner approval before next stage. Maintain checklists and acceptance criteria. Report in **Russian**.
3. Do not force-push, merge, delete branches, push to remote, open PR, change remote secrets, create D1 prod DB, run remote migrations, enable production publish, or deploy anything without separate explicit owner permission. Local file edits/tests only by default.
4. Prod publication is a separate operation from prod deploy. Bootstrap historic upstream snapshots **without publishing them**, for each provider individually; production starts in `dry_run`.
5. No public HTTP route triggers sync, publication, admin mode, migrations or privileged operations. Worker `scheduled()` handles ingestion; `fetch()` handles public GETs only; future bot webhook needs separate design review.

## Event truth and evidence

- Never equate **announcement** with **delivery**. `delivered_at=null` means delivery unverified; `scheduled.certainty=hinted` is not an official future event; `banked_offer` is not an already consumed reset.
- Require separate states: `announced_future`, `confirmed_applied`, `banked_offer`, `correction`, `withdrawal`, `needs_review`. Preserve upstream raw kind, precise source URL, source, timestamps/precision, audience and evidence.
- Unrecognized JSON fields or enum values -> safe fallback/review, never fabricate confirmed resets. Historical event data remains visible on website only with provenance/precision and may not get Telegram push.
- Do not silently discard old events or infer retractions from a missing paginated item. Both real data and synthetic fixtures labeled clearly.
- Dates/times shown in timezone explicitly (UTC in API, viewer-local in UI with accessible tooltip). Never turn a date-only offer expiry into a precise countdown.
- Public analytics represent **observed recorded events**, not guaranteed complete official history. Chart coverage/date-window, definition and source limits must be disclosed. No accuracy claims or next-reset prediction unless separate approved research.

## Engineering and testing

- Minimal dependencies, typed adapter interfaces, runtime validation, prepared D1 statements, deterministic clock and fetch mocks, Vitest unit/integration tests.
- Source-specific ETags and conditional requests, honor `304`, `429`, `Retry-After`, timeouts and 503s. Fail independent sources separately. Claude cache >= 60s; Codex >= one minute; target 5-minute cron. Respect updated upstream terms.
- D1 is source of truth for events, revisions, source health and delivery journal. D1 + Telegram are not transactional: atomic claims and `uncertain_manual_review` after ambiguous send. Do not guarantee exactly-once Telegram delivery.
- Public API read-only, strictly validated bounded filters, cursor or deterministic page pagination, consistent envelopes, allowlisted CORS for GitHub Pages, `Cache-Control`/ETags, safe errors and no internal metadata. Tests include CORS and abuse safeguards.
- Website build must use **GitHub Pages repository base path** `/reset-radar/`, avoid runtime secrets, handle first load/empty/stale/error/loading states, keyboard accessibility and mobile.
- Keep public dashboard usable even if upstream APIs fail: last cached D1 snapshot with accurate freshness warning; no invented 'live' claims.
- Run typecheck, lint, unit/integration tests and website production build for relevant stages; update docs when code differs. Don't mark tests/deploy as passed if they weren't run.
- No auth tokens (Anthropic/OpenAI/user OAuth) or per-account usage tracking. No LLM required in server or website.

## Secrets and environments

- Staging and production are isolated (separate D1 databases and channel IDs). Only publishing bot token in Cloudflare secret storage. `.dev.vars*` ignored; no printed/shared tokens.
- `PUBLISH_MODE=dry_run` by default; production publishing requires separate human-signed decision plus approved provider baseline.
- Public GitHub Pages can fetch an allowlisted, public, read-only Worker API. Never rely on CORS as authentication; enforce read-only GET/HEAD/OPTIONS, disable sensitive endpoints.
- Do not claim hosting is indefinitely free. Track Workers/D1 quota consumption and public-read traffic growth.

## End-of-stage report (Russian)

1. Выполнено / не выполнено; 2. изменённые файлы; 3. реальные команды и результаты; 4. подтверждённые факты и допущения; 5. регрессии/риски; 6. действия владельца и нужна ли его авторизация; 7. ссылка на PR только если действительно создан; 8. явное **не развернуто / не опубликовано**, если применимо. Then STOP.
