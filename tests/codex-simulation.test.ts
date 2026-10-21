import { describe, expect, it } from 'vitest';
import { createCodexAdapter } from '../src/providers/codex/adapter';
import { createCodexTransport } from '../src/providers/codex/transport';
import { createClaudeAdapter } from '../src/providers/claude/adapter';
import { mapCodexEvent } from '../src/providers/codex/mapping';
import { createLogger } from '../src/utils/logging';

const nativeFetch = globalThis.fetch;
const simulationUrl = process.env.CODEX_SIMULATION_URL;
// Explicit loopback opt-in only. The normal test suite has no real network calls.
describe.runIf(simulationUrl)('Codex real HTTP against SYNTHETIC local Postman simulation', () => {
  it('reads the contract, revalidates, survives failures and isolates Claude', async () => {
    const base = new URL(simulationUrl!);
    expect(base.hostname).toBe('127.0.0.1');
    expect(base.protocol).toBe('http:');
    let now = Date.parse('2026-10-21T12:00:00Z');
    let codexMode = 'normal';
    let claudeMode = 'normal';
    const calls: string[] = [];
    const fetch: typeof globalThis.fetch = async (input, init) => {
      const upstream = new URL(String(input));
      const member = upstream.origin === 'https://codexreset.ai' ? 'codex'
        : upstream.origin === 'https://clauderesets.com' ? 'claude' : null;
      if (member === null) throw new Error('Unexpected simulation upstream');
      const local = new URL(`${base.pathname.replace(/\/$/, '')}/${member}${upstream.pathname}${upstream.search}`, base.origin);
      const headers = new Headers(init?.headers);
      headers.set('x-reset-radar-test', member === 'codex' ? codexMode : claudeMode);
      calls.push(member);
      return nativeFetch(local, { ...init, headers });
    };
    const deps = { fetch, clock: { now: () => new Date(now) }, logger: createLogger(() => {}) };
    const codex = createCodexAdapter(deps);
    const claude = createClaudeAdapter(deps);
    const baseline = await codex.readHistory();
    expect(baseline.ok).toBe(true);
    if (!baseline.ok) throw new Error('Expected Codex fixture');
    const raw = baseline.snapshot.events[0]!;
    expect(raw.id).toBe('synthetic-http-codex');
    expect(mapCodexEvent(raw, baseline.snapshot, deps.clock.now()).record.action).toBe('needs_review');
    expect((await claude.readStatus()).ok).toBe(true);
    now += 301_000;
    const unchanged = await codex.readHistory();
    expect(unchanged.ok && unchanged.origin).toBe('not_modified');
    for (const mode of ['503', '429', 'nonjson', 'bad-schema']) {
      now += 3_600_000;
      codexMode = mode;
      const failed = await codex.readHistory();
      expect(failed.ok).toBe(false);
      expect(!failed.ok && failed.lastComplete?.events).toEqual(baseline.snapshot.events);
      expect((await claude.readStatus()).ok).toBe(true);
    }
    now += 3_600_000;
    codexMode = 'normal';
    claudeMode = '503';
    expect((await claude.readStatus()).ok).toBe(false);
    expect((await codex.readHistory()).ok).toBe(true);
    now += 3_600_000;
    codexMode = 'missing';
    const missing = await codex.readHistory();
    expect(missing.ok && missing.snapshot.retainedMissing[0]?.event.id).toBe(raw.id);
    codexMode = 'hang';
    const timedOut = await createCodexTransport(deps, undefined, { timeoutMs: 100 }).get();
    expect(timedOut).toMatchObject({ ok: false, code: 'timeout' });
    expect(calls.filter((member) => member === 'codex')).toHaveLength(9);
    expect(calls.filter((member) => member === 'claude')).toHaveLength(6);
  });
});
