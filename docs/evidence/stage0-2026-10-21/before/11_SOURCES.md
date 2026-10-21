# 11 — Sources, evidence register and references

**Checked 2026-10-21 where accessible.** Source docs describe intended behavior; actual HTTP JSON still requires a **local Stage 0** check and schema assertions. Third-party trackers are NOT official Anthropic/OpenAI subscription API.

| Source | Link | What it supports / caution |
|---|---|---|
| Claude Resets API docs | https://clauderesets.com/api/docs | Community public read-only schema, source policies and attribution; direct API responses may be blocked here, Codex must verify. |
| Claude Resets OpenAPI | https://clauderesets.com/api/openapi.json | Contract hypothesis; no hard assumption until live check. |
| CodexReset developer docs | https://codexreset.ai/developers/ | Public no-key `api/v1/resets.json`; separate `announced_at` and `delivered_at`; seeded archive attribution; ~5min edge cache, poll <=1/min. |
| Codex Resets archive | https://codex-resets.com/ | Existing history and Telegram example; API link inspect in Stage 0, not the same source as CodexReset.ai. |
| Telegram Bot API | https://core.telegram.org/bots/api | `sendMessage`, errors, permissions, message IDs. |
| Cloudflare Cron | https://developers.cloudflare.com/workers/configuration/cron-triggers/ | Worker scheduled handler; actual cron timing is best effort. |
| Cloudflare Workers limits | https://developers.cloudflare.com/workers/platform/limits/ | Free daily request, CPU and memory quotas — current limits may change. |
| Cloudflare D1 pricing | https://developers.cloudflare.com/d1/platform/pricing/ | Free included read/write/storage quotas and paid pricing. |
| Cloudflare D1 limits | https://developers.cloudflare.com/d1/platform/limits/ | Free database maximum 500MB and account total storage 5GB (as of Oct 2026). |
| GitHub Pages create site | https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-github-pages-site | Free on GitHub Free in **public** repo, build from same repository. |
| Pages custom workflows | https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages | GitHub Actions deployments. |
| GitHub licensing | https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/licensing-a-repository | Public visibility is not an automatic open-source grant; choose explicit license. |

## Known verified details vs Stage 0 unknowns

- **Verified on developer documentation page:** CodexReset JSON endpoint path, distinct delivery fields, scheduled hint/announcement states, `seeded`, attribution and suggested ≤1 request/minute. Still must fetch actual JSON and evaluate event quality.
- **Documentation described but not fully live-verified here:** Claude `status`, `resets`, `sources`, offers and revisions. Do not write implementation that hardcodes assumed JSON without Stage 0 evidence.
- **Decision pending:** feasibility and reuse policy of any `codex-resets.com` API. Do not copy tracker text/screenshots or treat similar sites as identical.
- **Cloudflare and GitHub:** static GitHub Pages can serve built frontend; Worker must supply API with compatible CORS; D1 free quotas enforced, not a blank check.

## Updating evidence

Record: date/time, endpoint, status, content-type, cache headers, ETag/retry-after, paginated/full snapshot behavior, actual shape, license/fair-use, example sanitized fixture, unresolved uncertainty. Include evidence URL in any downstream factual notification.
