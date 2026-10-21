import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createIngestionService } from '../src/services/ingest';
import { createD1Repository } from '../src/storage/d1';
import { createLogger } from '../src/utils/logging';
import { createTestD1 } from './helpers/d1';

const nativeFetch = globalThis.fetch;
const simulationUrl = process.env.STAGE4_SIMULATION_URL;

describe.runIf(simulationUrl)('Stage 4 real HTTP substitutes with real local D1', () => {
  it('bootstraps, restores validators after runtime restart and isolates source outages', async () => {
    const base = new URL(simulationUrl!);
    expect(base.hostname).toBe('127.0.0.1');
    expect(base.protocol).toBe('http:');
    const persist = await mkdtemp(join(tmpdir(), 'reset-radar-stage4-http-'));
    let runtime = await createTestD1({ persist });
    let now = Date.parse('2026-10-22T12:00:00Z');
    let codexMode = 'normal';
    let claudeMode = 'normal';
    const calls: string[] = [];
    const dependencies = {
      clock: { now: () => new Date(now) }, logger: createLogger(() => {}),
      fetch: (async (input, init) => {
        const upstream = new URL(String(input));
        const member = upstream.origin === 'https://codexreset.ai' ? 'codex'
          : upstream.origin === 'https://clauderesets.com' ? 'claude' : null;
        if (!member) throw new Error('Unexpected simulation upstream');
        const url = new URL(`/${member}${upstream.pathname}${upstream.search}`, base);
        const headers = new Headers(init?.headers);
        headers.set('x-reset-radar-test', member === 'codex' ? codexMode : claudeMode);
        calls.push(`${member}:${headers.get('if-none-match') ?? 'unconditional'}`);
        return nativeFetch(url, { ...init, headers });
      }) as typeof globalThis.fetch,
    };
    try {
      let repository = createD1Repository(runtime.db);
      let service = createIngestionService(repository, dependencies);
      const baseline = await service.ingestAll();
      expect(baseline.every((item) => item.status === 'fulfilled' && item.value.baselineCompleted)).toBe(true);
      const before = await repository.loadEvents('codex');
      expect(before).toHaveLength(1);
      expect(await runtime.db.prepare('SELECT COUNT(*) AS n FROM publication_candidates').first('n')).toBe(0);
      await runtime.dispose();
      runtime = await createTestD1({ persist, migrate: false });
      repository = createD1Repository(runtime.db);
      service = createIngestionService(repository, dependencies);
      now += 301_000;
      const restored = await service.ingestAll();
      expect(restored.every((item) => item.status === 'fulfilled' && item.value.complete)).toBe(true);
      expect(calls).toContain('codex:"synthetic-v1"');
      expect(calls).toContain('claude:"synthetic-v1"');
      expect((await repository.loadEvents('codex'))[0]?.firstDetectedAt).toBe(before[0]?.firstDetectedAt);
      for (const mode of ['503', '429', 'bad-schema']) {
        now += 3_600_000;
        codexMode = mode;
        const result = await service.ingestAll();
        expect(result[0]).toMatchObject({ status: 'fulfilled', value: { complete: true } });
        expect(result[1]).toMatchObject({ status: 'fulfilled', value: { complete: false } });
        expect((await repository.loadEvents('codex'))[0]?.firstDetectedAt).toBe(before[0]?.firstDetectedAt);
      }
      now += 3_600_000;
      codexMode = 'normal';
      claudeMode = '503';
      const isolated = await service.ingestAll();
      expect(isolated[0]).toMatchObject({ status: 'fulfilled', value: { complete: false } });
      expect(isolated[1]).toMatchObject({ status: 'fulfilled', value: { complete: true } });
      expect(await runtime.db.prepare('SELECT COUNT(*) AS n FROM event_versions').first('n')).toBe(2);
      expect(await runtime.db.prepare('SELECT COUNT(*) AS n FROM synthetic_deliveries').first('n')).toBe(0);
    } finally {
      await runtime.dispose();
      await rm(persist, { recursive: true, force: true });
    }
  }, 30_000);
});
