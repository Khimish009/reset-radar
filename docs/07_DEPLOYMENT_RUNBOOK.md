# 07 — Cloudflare deployment runbook

This runbook describes future owner-controlled operations. **Stage 6 local preparation does not create Cloudflare resources, run remote migrations, log in, set secrets, deploy, enable Cron, contact upstreams, or contact Telegram.** No command below was run against Cloudflare. The only confirmed tool version is the repository's installed Wrangler **4.151.3** (checked 2026-10-22); check the pinned project version and `--help` again before a separately authorized operation.

## Current local state

- `wrangler.json` names the local Worker and defines `staging` and `production` environments. Each has `PUBLISH_MODE=dry_run`, `workers_dev=false`, `preview_urls=false`, and `triggers.crons=[]`.
- `wrangler.d1.local.json` is a local-only test config. It is not a staging config and its ID `stage4-local-only` must never be copied to a remote target.
- Stage 6 runtime activation is `INGEST_MODE=dry_run`, accepted only when `APP_ENV` is explicitly `local` or `staging`, `PUBLISH_MODE=dry_run` is explicit, and D1 binding `DB` exists. Missing or `off` `INGEST_MODE` is inactive; invalid values/configuration fail closed. Production rejects activation. The checked-in base, local, staging and production configurations leave `INGEST_MODE` absent and Cron at `[]`.
- Stage 5 Telegram client, eligibility policy and journal are simulation-only. Stage 6 has no real Telegram client/journal or token. Do not configure a token, destination, or synthetic approval for real use.

## Authorization gates

Treat each step as a separate owner decision. A previous approval, successful local test, merged PR, or deployed dry-run does not imply the next permission.

**Continuation preflight, 2026-10-22:** current local evidence and conditional
plan comparison are in [Cloudflare preflight](evidence/stage6-2026-10-22/cloudflare-preflight.md).
Account/plan/target and owner stop budget remain unresolved. SQL statements and
D1 binding executions are different counters; neither local elapsed time nor
a small HTTP request count establishes remote readiness. Active staging is
**NO-GO until these questions and capacity acceptance are resolved**.

1. **Create staging D1:** explicit authorization to create a named remote staging database. No production database. Use the owner-approved Cloudflare account and region/jurisdiction.
2. **Migrate staging D1:** separately authorize applying the reviewed migrations to the confirmed staging database. Confirm the database name and returned ID against the target configuration first. Never infer a target from a default or placeholder.
3. **Stage Worker deploy and D1 binding:** separately authorize editing/using the staging binding and deploying the reviewed SHA with `PUBLISH_MODE=dry_run`, `INGEST_MODE` absent or `off`, no routes, and `crons: []`. This keeps the first deploy inactive. A later staging observation needs a distinct approval and a reviewed config with `INGEST_MODE=dry_run`; upstream polling then makes real provider requests.
4. **Enable a bounded staging observation:** separate authorization after reviewing the inactive dry-run deploy. This permits real upstream reads and requires a reviewed staging-only config with `INGEST_MODE=dry_run` plus Cron enabled at the approved cadence. Cron can make repeated upstream requests. Keep the production environment's Cron array empty. Disable Cron after the observation window unless the owner separately authorizes continued staging operation.
5. **Real Telegram design and setup:** separate design review and owner decision for a production-capable client, durable real-delivery journal, eligibility approvals, retry/ambiguous-send policy, a staging-only channel, and least-privilege bot setup. None exists as a real integration in Stage 6.
6. **Telegram requests and sends:** each real Telegram API interaction requires separate explicit authorization. Do not test the production channel. Never request or paste a token in chat; the owner enters any approved token directly into Cloudflare secret storage only after the implementation and target have been reviewed.
7. **Production:** production D1, migration, deploy, routes, Cron, real credentials and publication each require their own later approval under the Stage 7/8 gates. This runbook grants none of them.

## Staging preparation sequence (commands documented, not executed)

Before any command, confirm the owner authorized that exact gate, inspect the current branch/SHA, review Wrangler config and target account, and compare local migrations with the intended empty staging database. Do not run commands using a production profile or `--env production` during Stage 6.

### 1. Create a dedicated staging database

Only after gate 1, the CLI syntax verified locally is:

```sh
npm exec -- wrangler d1 create reset-radar-staging-db --binding DB
```

This is a **remote resource creation command**. Record the returned database ID in the owner-controlled staging configuration, check that the binding is exactly `DB`, and review the diff before continuing. Do not use `--update-config` without reviewing the exact config mutation. The current repository configuration intentionally has no remote ID.

### 2. Verify target and migration state, then migrate

After gate 2 and after the confirmed ID is attached only to the staging `DB` binding:

```sh
npm exec -- wrangler d1 info reset-radar-staging-db --config wrangler.json --env staging
npm exec -- wrangler d1 migrations list reset-radar-staging-db --config wrangler.json --env staging --remote
npm exec -- wrangler d1 migrations apply reset-radar-staging-db --config wrangler.json --env staging --remote
npm exec -- wrangler d1 migrations list reset-radar-staging-db --config wrangler.json --env staging --remote
```

Stop if the account, database name/ID, binding, migration list, or migration outcome differs from the reviewed plan. Wrangler prompts before applying and reports a backup after successful application; this does not replace target verification or an owner-approved recovery plan. Do not rewrite migrations `0001`/`0002` to fit a remote target.

### 3. Deploy the reviewed dry-run Worker with Cron off

The first staging Worker deployment is a remote action and needs gate 3. The staging config must keep `triggers.crons: []`, no routes/domains, `PUBLISH_MODE=dry_run`, and `INGEST_MODE` absent or `off`. It must not enable the runtime in production. Once reviewed, the command shape is:

```sh
npm exec -- wrangler deploy --config wrangler.json --env staging --strict
```

Review the resolved environment and bindings shown by Wrangler before confirming. `--strict` rejects conflicting remote changes; it does not establish that the target is safe. Do not add `--triggers`, `--schedule`, route, domain, secret-file or production options. Verify the deployed version/configuration in Cloudflare and confirm Cron remains absent before any observation. Do not treat `--dry-run` as a deployed staging test.

For a separately approved observation, set `INGEST_MODE=dry_run` only in staging and obtain permission for real upstream reads. Invoke only through the approved Cloudflare Cron/Worker mechanism; the public HTTP `fetch()` surface must remain read-only and must never trigger ingestion. The local invocation budget is at most four Claude pages of up to 25 records (100 records/provider), plus one Codex request; a full snapshot larger than the cap is rejected without persisting partial events or marking a baseline complete. Request cap is five Claude plus one Codex request. The runtime reads at most 101 prior canonical rows per provider to check the 100-record cap. If stored history exceeds 100, it commits the fixed incomplete reason `stored_record_limit`, leaves canonical events/sources unchanged, and makes no upstream calls; this invocation stays incomplete and cannot complete a new baseline; an already completed baseline is preserved. Retrying successfully needs a later owner-approved capacity design. HTTP timeout is 10 seconds and response-body cap is 2 MiB. These are local operation caps, not a promise that D1 CPU/row quotas fit a Cloudflare plan; D1 execution time is not hard-cancelled by an elapsed-time cap. Collect two independent **complete** provider baselines. A partial or failed import is not a baseline and does not authorize publication. The runtime does not import the Stage 5 publisher and must create zero rows in both existing synthetic journals (`synthetic_deliveries` and `telegram_simulation_deliveries`); there is no real-send journal in this stage.

### 4. Run a bounded staging observation

After gate 4, a separately reviewed staging-only config may set `INGEST_MODE=dry_run` and enable the approved Cron cadence (product target: five minutes). This deploy both activates scheduled ingestion and makes real upstream requests. Monitor source completeness/freshness, independent failure handling, request/page budgets, D1 usage and safe logs for the agreed observation window. Collect two independent complete provider baselines, then disable Cron and set `INGEST_MODE` absent or `off` while the owner reviews the evidence. Do not use dashboard drift: the Wrangler config is the source of truth. To remove triggers, set `triggers.crons: []`; Cloudflare documents that an empty list removes all deployed Cron triggers, while omitting the property can leave existing triggers in place. Verify removal in Cloudflare after deploy. Production remains `[]`.

### 5. Secrets and Telegram remain a separate later project

Stage 6 does not need a Telegram token or channel ID. Do not run a secret command for this stage. If a future reviewed real publisher is authorized, keep token entry owner-controlled and use the exact environment after verifying the Worker target. Current Wrangler syntax supports `npm exec -- wrangler secret put <KEY> --config wrangler.json --env staging`; this creates/deploys a Worker version, so it is itself a deployment action and requires the relevant separate permissions. Never put a token in `vars`, config, shell arguments, chat, CI logs, or this repository. The staging destination must be an owner-verified test channel, with no fallback to production.

## Measurement and cost guardrails

Record a baseline before scheduled observation, then compare actual Cloudflare Workers invocations, duration/CPU, errors, D1 rows read/written, query duration, database storage and source success/staleness after each observation window. Use Cloudflare dashboard metrics or D1 query metadata/Analytics API; do not estimate D1 cost from HTTP request count alone. Record the measured period, deployed SHA and account plan, and compare with the owner's written budget before increasing traffic or changing plans.

Cloudflare's current D1 pricing page lists Workers Free allowances of **5 million rows read/day, 100,000 rows written/day, and 5 GB account storage**; limits can change and Free daily read/write limits are enforced, causing D1 queries to fail until reset. The D1 limits page currently lists a **500 MB per-database maximum on Free and 10 GB on Paid**, and a maximum of **50 D1 queries per Worker invocation on Free or 1,000 on Paid**. Before remote staging, count and measure the actual D1 queries per scheduled invocation against the selected plan; do not assume batching hides multiple statements or that the local operation budget fits a plan. These are provider limits, not a cost forecast or a claim that this service will remain free. Track observed totals with a conservative owner-set alert/stop budget below account limits. Recheck official pricing/limits before any owner decision. Sources, checked 2026-10-22: [D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/), [D1 limits](https://developers.cloudflare.com/d1/platform/limits/), [Free-tier enforcement notice](https://developers.cloudflare.com/changelog/post/2026-09-01-d1-free-tier-limit-enforcement/).

The five-minute target implies 288 scheduled runs/day (8,640 per 30 days) if enabled continuously; it is a planning count, not a guarantee of actual invocations. Measure event/page counts and D1 reads/writes per run locally and in authorized staging before choosing a cadence. Public API traffic does not exist in this stage; estimate it separately before Stage 9.

The official Workers limits page now lists internal-service subrequests at
1,000 on Free and a default 10,000 on Paid, while the D1 limits page still
lists queries at 50/1,000. A batch contains multiple SQL statements in a single
request. Do not equate SQL count with enforced subrequest count, or assume
batching exempts all SQL from D1 limits. Preserve both counters and verify
the effective account limits and accounting before active staging.
The [dated primary-source comparison](evidence/stage6-2026-10-22/cloudflare-preflight.md)
also records five-minute Cron CPU limits (Free 10 ms / Paid 30 seconds), metadata
coverage and the difference between local elapsed time and billed CPU.

## Reviewable inactive staging change set — documentation only

This is an **intentionally invalid template**, not a deploy config. It has no
real account/database ID and must not be copied into working deploy configs
until the matching owner gate. The first change set would add only the staging
account/binding and explicit inactive flag; base/local/production stay unchanged.

```json
{
  "account_id": "__INVALID_OWNER_ACCOUNT_ID_REQUIRED__",
  "env": {
    "staging": {
      "name": "reset-radar-staging",
      "workers_dev": false,
      "preview_urls": false,
      "routes": [],
      "triggers": { "crons": [] },
      "vars": {
        "APP_ENV": "staging",
        "PUBLISH_MODE": "dry_run",
        "INGEST_MODE": "off"
      },
      "d1_databases": [{
        "binding": "DB",
        "database_name": "reset-radar-staging-db",
        "database_id": "__INVALID_STAGING_D1_UUID_REQUIRED__",
        "migrations_dir": "migrations"
      }]
    }
  }
}
```

Resolve and review these facts before executing **each** separate gate:

| Gate | Concrete review inputs | Required evidence / stop condition |
|---|---|---|
| Account/budget and D1 creation | Owner-confirmed account/profile, Workers plan/effective limits, free shared quotas, region/jurisdiction, unique staging DB name; written maximum spend and usage stop thresholds | Create only staging D1 after explicit permission. Stop if plan/account/budget unresolved; no automatic paid upgrade. |
| Remote migrations | Returned staging DB ID, resolved binding and exact target account; migration inventory `0001_stage4.sql`, `0002_stage5.sql`, hashes from current report, remote migration list | Separate permission to apply only this list; verify both migrations and seeded provider rows. Unexpected existing schema/target → stop and preserve evidence. |
| Inactive deploy | Reviewed code revision/diff, resolved staging-only config above, `DB`, no secrets/routes/Cron, opt-in off; rollback version | Separate binding/deploy permission. Verify version, resolved vars/binding and zero triggers; no real polling. |
| Future active observation | Accepted capacity/query-accounting design, explicit upstream-read/Cron permission, approved duration/cadence/max invocations, CPU/rows/storage/error stop budget and responsible operator | Independent complete baselines for both providers, fresh `last_success_at` and scoped health/cache; no partial baseline, approvals NULL, journals unchanged. Measure actual CPU/subrequests/rows/storage; stop on incomplete/over-budget/failure or at window end. |

For the future observation, agree numeric thresholds **before** enabling it;
this template supplies no default spending approval. A possible review window
is 15 minutes at the five-minute cadence (at most four observed starts including
boundary uncertainty), only if the owner accepts it and all earlier gates pass.
This is a proposed window, not authorization or an automatic configuration.
Record UTC start/end, invocation/provider outcomes, row counters, CPU, query
duration, database size and account totals. Existing safe logger does not expose
all D1 metadata; arrange approved platform telemetry before activation.

At the agreed end or first stop condition, disable Cron with explicit `[]` and
set ingestion off under the approved rollback procedure; verify removal remotely.
No public HTTP trigger is added. Keep baseline/versions/evidence, select the
reviewed inactive Worker version if rollback is needed, and never reverse/delete
D1 history automatically. Telegram design/setup/API traffic is a separate gate.

## Rollback and safe disable

1. Stop new scheduled work first: use the reviewed Wrangler config with the staging environment's explicit `triggers.crons: []`, deploy under owner authorization, and verify Cloudflare shows no Cron triggers. If access/config is unavailable, the owner can remove the trigger in the dashboard; verify the resulting state. A config that omits `triggers` is not a disable instruction.
2. Set `INGEST_MODE` to absent or `off` in staging and deploy that reviewed config. Confirm the deployed safe code and `PUBLISH_MODE=dry_run`.
3. If a Worker regression remains, owner selects a known reviewed Worker version using Cloudflare's version controls or deploys the prior reviewed SHA/config. Do not assume rollback also restores D1 data.
4. Preserve D1 evidence. Do not delete the database or blindly reverse migrations. Inspect backup/time-travel options and prepare a separate owner-approved restore plan if data recovery is needed.
5. Review sanitized logs and the D1 journal before resuming. Never automatically retry an ambiguous Telegram outcome. Stage 6 has no real Telegram sender; any future ambiguity requires its separately approved operational policy.

## Primary references

Command syntax was checked against installed Wrangler 4.151.3 `--help` on 2026-10-22 and these official Cloudflare pages on the same date:

- [D1 Wrangler commands](https://developers.cloudflare.com/d1/wrangler-commands/) — create, info, migration list/apply and remote flags.
- [Cron Triggers](https://developers.cloudflare.com/workers/configuration/cron-triggers/) — config ownership, deployment behavior and removal with `crons: []`.
- [Workers secrets](https://developers.cloudflare.com/workers/configuration/secrets/) — secret handling and `wrangler secret put` deployment behavior.
- [Workers environments](https://developers.cloudflare.com/workers/wrangler/environments/) — environment-scoped configuration and secrets.

## Launch record template

Record date, reviewed SHA, exact authorized operation, Wrangler version, Cloudflare account/environment, staging DB name and privately stored ID, migration state, deployed Worker version, Cron state, `dry_run`/runtime gate state, baseline completeness, measured usage/budget, safe log codes, reviewer and rollback action. Do not record credentials, full environment dumps, raw upstream payloads, private URLs, or Telegram message text. No production launch record is created by local Stage 6.
