# Stage 6 continuation — повторная локальная HTTP-проверка

**2026-10-22**, Postman CLI **1.75.0**. Existing combined simulation использована
без изменений, workspace binding/push/deploy/proxy/pass-through отсутствуют.
Оба mocks происходят из прежних verified contracts и synthetic fixtures.
Реально работают handler, adapters/transports и Miniflare D1; upstream/Telegram
не вызываются. Mapping ограничен loopback и фиксированными source paths.
Primary upstream evidence не перечитывается.

Выполнены:

```sh
postman --version
postman simulation run postman/simulations/stage6-local.sim.yaml --port 4904 --output ndjson --no-history > /private/tmp/reset-radar-stage6-preflight-simulation.ndjson 2> /private/tmp/reset-radar-stage6-preflight-simulation.err
env STAGE6_SIMULATION_URL=http://127.0.0.1:4904 npm test -- --run tests/stage6-runtime-simulation.test.ts
```

Initial sandbox start: `listen EPERM 127.0.0.1`, без выполненных requests.
Повтор с разрешённым local loopback: NDJSON `listening` в **10:05:18Z**,
test **1 PASS**, exit 0, Vitest duration **1.77s**. Нефатальный `punycode`
dependency warning. Native fetch получает только substitute URL, не upstream URL.

Проверены NDJSON receipts, не только exit status:

| Member / method / path | Count |
|---|---:|
| claude / GET / `/api/v1/resets?limit=25` | 5 |
| claude / GET / `/api/v1/status` | 5 |
| codex / GET / `/api/v1/resets.json` | 5 |

Всего **15 GET**: 6×200, 5×304, 1×429, 3×503; request errors=0. Других
members/методов/Telegram traffic нет. Test проверяет independent baselines,
durable restart/304, stable detection/versions, failures/backoff без лишнего
network, сохранённую историю, safe logs, нулевые send journals и approvals NULL.

Выполнен shutdown:

```sh
pkill -INT -f 'simulation run postman/simulations/stage6-local.sim.yaml'
lsof -nP -iTCP:4904 -sTCP:LISTEN
```

Server exit **0**, `lsof` exit **1**, listener отсутствует. Raw logs остались
в `/private/tmp/`, в repo только эти безопасные агрегаты. Это synthetic local
integration, **не real staging E2E и не live source verification**.
**Не развёрнуто / не опубликовано.**
