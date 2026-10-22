import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createWorker } from '../src/index';
import { createLogger } from '../src/utils/logging';
import { createTestD1 } from './helpers/d1';

const nativeFetch = globalThis.fetch;
const simulationUrl = process.env.STAGE6_SIMULATION_URL;
const activeRuntimes: Array<{ dispose: () => Promise<void> }> = [];
const temporaryPaths: string[] = [];

afterEach(async () => {
  await Promise.all(activeRuntimes.splice(0).map((runtime) => runtime.dispose()));
  await Promise.all(temporaryPaths.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

async function localD1(options: Parameters<typeof createTestD1>[0] = {}) {
  const runtime = await createTestD1(options);
  activeRuntimes.push(runtime);
  return runtime;
}

describe.runIf(simulationUrl)('Stage 6 scheduled runtime through the combined loopback Postman simulation', () => {
  it('restores the D1 snapshot, honors validators, isolates a source outage and suppresses retries during backoff', async () => {
    const base = new URL(simulationUrl!);
    expect(base.protocol).toBe('http:');
    expect(base.hostname).toBe('127.0.0.1');
    expect(base.username).toBe('');
    expect(base.password).toBe('');
    expect(base.search).toBe('');
    expect(base.hash).toBe('');
    expect(base.pathname === '/' || base.pathname.endsWith('/')).toBe(true);

    const persist = await mkdtemp(join(tmpdir(), 'reset-radar-stage6-http-'));
    temporaryPaths.push(persist);
    let runtime = await localD1({ persist });
    let now = Date.parse('2026-10-22T12:00:00Z');
    let claudeMode = 'normal';
    let codexMode = 'normal';
    const receipts: Array<{ provider: string; path: string; mode: string; etag: string | null }> = [];
    const lines: string[] = [];
    const fetch = (async (input: RequestInfo | URL, init: RequestInit = {}) => {
      const upstream = new URL(String(input));
      if (init.method && init.method !== 'GET') throw new Error('Stage 6 simulation only permits GET');
      if (init.redirect && init.redirect !== 'error') throw new Error('Stage 6 simulation forbids redirects');
      const provider = upstream.origin === 'https://clauderesets.com' ? 'claude'
        : upstream.origin === 'https://codexreset.ai' ? 'codex' : null;
      if (!provider) throw new Error('Unexpected upstream origin blocked by test adapter');
      const expectedPath = provider === 'codex'
        ? upstream.pathname === '/api/v1/resets.json' && upstream.search === ''
        : (upstream.pathname === '/api/v1/status' && upstream.search === '') ||
          (upstream.pathname === '/api/v1/resets' && upstream.search === '?limit=25');
      if (!expectedPath) throw new Error(`Unexpected upstream path blocked by test adapter: ${upstream.pathname}${upstream.search}`);

      const mode = provider === 'claude' ? claudeMode : codexMode;
      const localPath = `/${provider}${upstream.pathname}${upstream.search}`;
      const localUrl = new URL(localPath, base);
      if (localUrl.origin !== base.origin || localUrl.hostname !== '127.0.0.1') {
        throw new Error('Simulation mapping escaped the validated loopback base');
      }
      const headers = new Headers(init.headers);
      headers.set('x-reset-radar-test', mode);
      receipts.push({ provider, path: localPath, mode, etag: headers.get('if-none-match') });
      return nativeFetch(localUrl, { ...init, headers, redirect: 'error' });
    }) as typeof globalThis.fetch;

    const worker = () => createWorker({ clock: { now: () => new Date(now) }, fetch,
      logger: createLogger((line) => lines.push(line)) });
    const env = () => ({ APP_ENV: 'local', PUBLISH_MODE: 'dry_run', INGEST_MODE: 'dry_run', DB: runtime.db });
    const controller = { scheduledTime: now, cron: '*/5 * * * *' } as ScheduledController;
    try {
      await worker().scheduled(controller, env());
      const originalCodex = await runtime.db.prepare("SELECT first_detected_at FROM events WHERE provider = 'codex'").first<string>('first_detected_at');
      expect(await runtime.db.prepare('SELECT COUNT(*) AS n FROM events').first('n')).toBe(2);
      expect(await runtime.db.prepare('SELECT COUNT(*) AS n FROM event_versions').first('n')).toBe(2);
      const baselineLogs = lines.map((line) => JSON.parse(line) as { event: string; fields?: { provider?: string } });
      expect(baselineLogs).toEqual(expect.arrayContaining([
        expect.objectContaining({ event: 'provider_sync_success', fields: { provider: 'claude' } }),
        expect.objectContaining({ event: 'provider_sync_success', fields: { provider: 'codex' } }),
        expect.objectContaining({ event: 'publish_unavailable' }),
      ]));
      expect(originalCodex).not.toBeNull();
      await runtime.dispose();

      runtime = await localD1({ persist, migrate: false });
      now += 301_000;
      await worker().scheduled(controller, env());
      expect(receipts).toContainEqual(expect.objectContaining({ provider: 'claude', path: '/claude/api/v1/resets?limit=25', etag: '"synthetic-v1"' }));
      expect(receipts).toContainEqual(expect.objectContaining({ provider: 'codex', path: '/codex/api/v1/resets.json', etag: '"synthetic-v1"' }));
      expect(await runtime.db.prepare('SELECT COUNT(*) AS n FROM event_versions').first('n')).toBe(2);
      expect(await runtime.db.prepare("SELECT first_detected_at FROM events WHERE provider = 'codex'").first<string>('first_detected_at')).toBe(originalCodex);

      now += 3_600_000;
      codexMode = '503';
      const beforeOutage = receipts.length;
      const beforeOutageLog = lines.length;
      await worker().scheduled(controller, env());
      expect(receipts.slice(beforeOutage).some((receipt) => receipt.provider === 'codex' && receipt.mode === '503')).toBe(true);
      expect(lines.slice(beforeOutageLog).map((line) => JSON.parse(line) as { event: string; fields?: { provider?: string } }))
        .toContainEqual(expect.objectContaining({ event: 'provider_sync_incomplete', fields: { provider: 'codex' } }));
      expect(await runtime.db.prepare("SELECT last_status FROM provider_activation WHERE provider = 'claude'").first('last_status')).toBe('success');
      expect(await runtime.db.prepare("SELECT last_status FROM provider_activation WHERE provider = 'codex'").first('last_status')).toBe('partial');

      codexMode = '429';
      now += 3_600_000;
      await worker().scheduled(controller, env());
      expect(await runtime.db.prepare("SELECT retry_until FROM source_state WHERE provider = 'codex' AND endpoint_key = 'https://codexreset.ai/api/v1/resets.json'").first<number>('retry_until')).toBeGreaterThan(now);
      const duringBackoff = receipts.length;
      now += 30_000;
      await worker().scheduled(controller, env());
      expect(receipts).toHaveLength(duringBackoff);
      expect(await runtime.db.prepare("SELECT failure_count FROM source_state WHERE provider = 'codex' AND endpoint_key = 'https://codexreset.ai/api/v1/resets.json'").first<number>('failure_count')).toBeGreaterThan(0);

      now += 3_600_000;
      codexMode = 'normal';
      claudeMode = '503';
      const beforeClaudeOutage = receipts.length;
      const beforeClaudeLog = lines.length;
      const canonicalClaude = await runtime.db.prepare("SELECT id, action, transition_id FROM events WHERE provider = 'claude'")
        .first<{ id: string; action: string; transition_id: string }>();
      const claudeVersions = await runtime.db.prepare("SELECT COUNT(*) AS n FROM event_versions WHERE event_id = ?")
        .bind(canonicalClaude!.id).first('n');
      await worker().scheduled(controller, env());
      expect(receipts.slice(beforeClaudeOutage).some((receipt) => receipt.provider === 'claude' && receipt.mode === '503')).toBe(true);
      expect(lines.slice(beforeClaudeLog).map((line) => JSON.parse(line) as { event: string; fields?: { provider?: string } }))
        .toContainEqual(expect.objectContaining({ event: 'provider_sync_incomplete', fields: { provider: 'claude' } }));
      expect(await runtime.db.prepare("SELECT last_status FROM provider_activation WHERE provider = 'claude'").first('last_status')).toBe('partial');
      expect(await runtime.db.prepare("SELECT last_status FROM provider_activation WHERE provider = 'codex'").first('last_status')).toBe('success');
      expect(await runtime.db.prepare("SELECT id, action, transition_id FROM events WHERE provider = 'claude'")
        .first<{ id: string; action: string; transition_id: string }>()).toEqual(canonicalClaude);
      expect(await runtime.db.prepare("SELECT COUNT(*) AS n FROM event_versions WHERE event_id = ?")
        .bind(canonicalClaude!.id).first('n')).toBe(claudeVersions);

      expect(await runtime.db.prepare('SELECT COUNT(*) AS n FROM synthetic_deliveries').first('n')).toBe(0);
      expect(await runtime.db.prepare('SELECT COUNT(*) AS n FROM telegram_simulation_deliveries').first('n')).toBe(0);
      expect(await runtime.db.prepare('SELECT COUNT(*) AS n FROM provider_activation WHERE publish_approved_at IS NOT NULL').first('n')).toBe(0);
      expect(receipts.every(({ path }) => path.startsWith('/claude/api/v1/') || path === '/codex/api/v1/resets.json')).toBe(true);
      expect(lines.every((line) => !/example\.invalid|token|stack|raw/i.test(line))).toBe(true);
    } finally {
      await runtime.dispose();
    }
  }, 40_000);
});
