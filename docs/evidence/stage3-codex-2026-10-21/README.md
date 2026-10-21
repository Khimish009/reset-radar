# Stage 3 — CodexReset contract evidence, 2026-10-21

Owner chose **codexreset.ai** for the local Codex adapter. This directory records
two targeted unauthenticated GETs: [developer docs](https://codexreset.ai/developers/)
and [the reset feed](https://codexreset.ai/api/v1/resets.json). No alternative API,
forecast, personal account endpoint, or Telegram endpoint was requested.

`observations.json` contains UTC check/HTTP dates, selected headers, body hashes,
counts, and the result of running the actual TypeScript parser on the response.
`contract.json` is a structural projection with observed types and separately
documented nullable/scheduled variants. Neither file is a full response or parser
fixture. No long third-party summaries, notes, or post text are retained here.
The immutable Stage 0 archive and its manifest are unchanged.

Feed accepted: schema v1, 62 events, 53 seeded, 56 null delivery timestamps;
regular=54, banked=8. These are snapshot observations, not completeness claims or
fixed parser requirements. HTTP 200 carried `max-age=300`; current docs describe
five-minute caching and polling at most once per minute. Transport uses 300s by
default and honors valid `max-age`/`Age` with a 60s floor; `s-maxage` is not used
in place of `max-age`.

No non-null scheduled object was observed. Future exact/date targets, future
announcements with unknown time, drift, 304/429/503 and failures are tested using
explicitly **synthetic**, contract-based fixtures. The documented scheduled
object requires a day; null/missing day is not invented as an accepted upstream
variant. An unknown-time future announcement can be represented only after a
separate semantic assessment of a regular announcement's primary evidence.

No original delivery post was independently verified in Stage 3. A populated
`delivered_at` is an upstream assertion, not sufficient confirmation. A trusted
local assessment must bind the current record content to reviewed primary
evidence, an explicit primarySourceUrl, and a rationale. Accepted evidence URLs
and rationale remain in the internal mapped result for audit. The adapter does not generate that assessment from a
URL or timestamp. Without it regular and banked events remain `needs_review`.
Banked requires a separate `banked_offer` assertion with content-bound primary
evidence; even delivery of a credit never proves consumption or current availability.

PR #3 tightens local mapping, not the captured upstream contract. An explicitly
provided scheduled `futureTarget` must match raw target precision/value. Exact
values compare as UTC instants; date values compare as calendar dates. There is
no cross-precision conversion. Omitting the target keeps the existing raw-derived
path; a conflicting or malformed target stays in review. No new live capture
was needed for these pure mapping fixes.

Postman CLI 1.75.0 uses our local synthetic mocks in
`postman/simulations/codex-local.sim.yaml`. No owning-team mock was imported:
the repository is unbound and this task allows local work only. No workspace,
account, or remote mock was created. Orbit/workspace discovery was not needed
for this explicit primary-source contract check and was outside the selected
source's targeted GET scope.
