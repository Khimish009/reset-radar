# 10 — Production monitoring, errors and rollbacks

## Periodic checks (operator)

- Confirm both providers' `last_success_at`, last HTTP status, `stale` flag and latest accepted event revision.
- Inspect Cron trigger delivery, D1 row reads/writes/storage, Worker request counts and CPU usage, Telegram delivery failures and `uncertain_manual_review` queue.
- Verify public API 200/304/CORS/latency and website source timestamps; check site mobile occasionally.
- Review corrections, withdrawn announcements, new unknown enums and community API changelog.

## Severity and response

| Incident | Primary response |
|---|---|
| Claimed reset unsupported by evidence | pause provider publication, preserve event and source snapshot, investigate, post clearly sourced correction if justified |
| Upstream 429/503/schema mismatch | exponential/capped backoff, mark provider stale, retain last D1 snapshot, do not mark historical events withdrawn |
| D1 quota exceeded | pause nonessential requests, optimize query/index/caches, show degraded website status; never silently invent results |
| Telegram token leak | revoke/rotate via BotFather, update Worker secret with owner approval, audit unexpected posts |
| Telegram ambiguous timeout | mark uncertain, no blind retry; verify channel message manually |
| API public traffic surge | serve cached responses / protective rate limits and monitor quota; no dynamic joins that scan full history |
| GitHub Pages not loading | check Pages workflow and `/reset-radar/` asset path; roll back to last approved release |

## Operational display truth

The website/API should distinguish **source unavailable** from **no new event**. “Последнее подтверждённое событие” is not synonymous with “your quota is now available”. Display per-source sync timestamps and stale warning. If a provider baseline is missing, say monitoring incomplete. Avoid site labels like “updated just now” unless they refer precisely to recent successful sync, not event time.

## Financial guardrails

Cloudflare Free is an aspiration, not a promise of zero cost under indefinite traffic. Estimate upstream calls (5 min: 8,640 runs/30d) plus public API traffic. Cache `/stats` for at least ~5 min when appropriate, `/status` and `/events` for ~1 min, indexed D1 query paths; measure actual cost and stop uncontrolled behavior before paid upgrade.

## Launch log template

Record date, git SHA, Stage, environment, exact approved action, reviewer, staging/prod D1 names, Telegram destination verified (handle only), CI build URL, smoke results, rollback instructions. Never record secrets or raw sensitive environment dumps.
