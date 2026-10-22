# Stage 6 — synthetic loopback HTTP + real local D1

2026-10-22. Postman CLI1.75.0, local process only; no shared workspace,
simulation push/deploy/proxy, real upstream or Telegram requests. Both existing
source mocks derive from the previously verified contracts and use synthetic
fixtures. Claude additionally accepts runtime's exact `limit=25`; existing
limit100 tests remain supported. The Worker and database run for real.

Executed from repository root:

```sh
postman simulation run postman/simulations/stage6-local.sim.yaml --port 4904 --output ndjson --no-history > /private/tmp/reset-radar-stage6-simulation.ndjson 2> /private/tmp/reset-radar-stage6-simulation.err
```

Run this long-lived command in a separate terminal/process; wait for `listening`
in NDJSON, then in another terminal:

```sh
env STAGE6_SIMULATION_URL=http://127.0.0.1:4904 npm test -- --run tests/stage6-runtime-simulation.test.ts
```

Result: **1 passed**, 2.15s. The initial sandbox attempts were blocked by
`listen EPERM`; approved loopback repeats succeeded. Test mapping accepts only
the fixed provider origins/paths and maps to validated `http://127.0.0.1:4904`;
redirects/pass-through are forbidden. Native fetch is never given an upstream URL.

Read NDJSON, not just the test exit status. Final receipts:

| Member | GET path | Receipt count |
|---|---|---|
| claude | `/api/v1/resets?limit=25` | 5 |
| claude | `/api/v1/status` | 5 |
| codex | `/api/v1/resets.json` | 5 |

15 total requests: **6×200, 5×304, 1×429, 3×503**. All methodGET, only the two
members; no sendMessage/Telegram member. No request during the backoff invocation.

The test verifies independent baseline imports, persisted D1 runtime restart,
conditional validators and stable first detection/version counts, Codex503/429
with Claude success, later Claude503 with Codex success, history retained,
fixed provider success/incomplete logs and publish_unavailable, zero rows in
`synthetic_deliveries`/`telegram_simulation_deliveries`, production approvalNULL.
This proves local integration against synthetic stand-ins, not upstream evidence
truth or remote staging operation. Raw logs stay outside tracked artifacts.

Shutdown actually executed:

```sh
pkill -INT -f 'simulation run postman/simulations/stage6-local.sim.yaml'
lsof -nP -iTCP:4904 -sTCP:LISTEN
```

Server exit0; lsof exit1/no listener. No test process remains running.
**Не развёрнуто / не опубликовано. Реальный staging E2E не выполнен.**
