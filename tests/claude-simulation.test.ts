import { describe, expect, it } from 'vitest';
import { createClaudeAdapter } from '../src/providers/claude/adapter';
import { createClaudeTransport } from '../src/providers/claude/transport';
import { parseClaudeStatus } from '../src/providers/claude/schema';
import { createLogger } from '../src/utils/logging';

// Captured before setup.ts's beforeEach guard. Only this opt-in test uses real HTTP,
// strictly routed to the explicitly started loopback Postman simulation.
const nativeFetch = globalThis.fetch;
const simulationUrl = process.env.CLAUDE_SIMULATION_URL;
describe.runIf(simulationUrl)('Claude real HTTP against local SYNTHETIC Postman simulation', () => {
  it('runs adapter parsing/304 and retains the snapshot under HTTP/schema/timeouts', async () => {
    const base = new URL(simulationUrl!);
    expect(base.hostname).toBe('127.0.0.1');
    expect(base.protocol).toBe('http:');
    let mode = 'normal';
    let now = Date.parse('2026-10-21T12:00:00Z');
    const calls: string[] = [];
    const fetch: typeof globalThis.fetch = async (input, init) => {
      const upstream = new URL(String(input));
      expect(upstream.origin).toBe('https://clauderesets.com');
      const local = new URL(`${base.pathname.replace(/\/$/, '')}${upstream.pathname}${upstream.search}`, base.origin);
      const headers = new Headers(init?.headers);
      headers.set('x-reset-radar-test', mode);
      calls.push(upstream.pathname);
      return nativeFetch(local, { ...init, headers });
    };
    const deps = { fetch, clock: { now: () => new Date(now) }, logger: createLogger(() => {}) };
    const adapter = createClaudeAdapter(deps);
    const baseline = await adapter.readHistory();
    expect(baseline.ok && baseline.snapshot.events[0]?.id).toBe('synthetic-http-event');
    now += 61_000;
    const unchanged = await adapter.readHistory();
    expect(unchanged.ok && unchanged.snapshot.events).toEqual(baseline.ok && baseline.snapshot.events);
    expect((await adapter.readStatus()).ok).toBe(true);
    expect((await adapter.readSources()).ok).toBe(true);
    for (const failureMode of ['503', '429', 'nonjson', 'bad-schema']) {
      now += 600_000;
      mode = failureMode;
      const failed = await adapter.readHistory();
      expect(failed.ok).toBe(false);
      if (!failed.ok && baseline.ok) expect(failed.lastComplete?.events).toEqual(baseline.snapshot.events);
    }
    mode = 'hang';
    const timeout = createClaudeTransport(deps, undefined, { timeoutMs: 50 });
    const timedOut = await timeout.get('status', new URLSearchParams(), parseClaudeStatus);
    expect(timedOut).toMatchObject({ ok: false, code: 'timeout' });
    expect(calls).toHaveLength(9);
  });
});
