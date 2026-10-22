import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { Provider } from '../src/domain/event';
import { createD1Repository } from '../src/storage/d1';
import type { StoredEventInput } from '../src/storage/types';
import { createTestD1 } from './helpers/d1';

const runtimes: Array<{ dispose: () => Promise<void> }> = [];

afterEach(async () => {
  await Promise.all(runtimes.splice(0).map((runtime) => runtime.dispose()));
});

async function testDb(options: Parameters<typeof createTestD1>[0] = {}) {
  const runtime = await createTestD1(options);
  runtimes.push(runtime);
  return runtime;
}

function event(overrides: Partial<StoredEventInput> = {}): StoredEventInput {
  return {
    id: 'claude:resets:reset-1',
    provider: 'claude',
    upstream: 'clauderesets.com',
    externalId: 'reset-1',
    materialHash: 'hash-a',
    observationKey: 'observation-1',
    assessmentKey: 'assessment-1',
    upstreamRevision: 'revision-1',
    action: 'confirmed_applied',
    eventDate: '2026-10-20',
    detectedAt: '2026-10-21T10:00:00.000Z',
    payload: JSON.stringify({ raw: { kind: 'usage_reset' }, evidence: ['https://example.test/reset-1'] }),
    candidate: true,
    ...overrides,
  };
}

function commitArgs(overrides: Partial<Parameters<ReturnType<typeof createD1Repository>['commitSnapshot']>[0]> = {}) {
  return {
    provider: 'claude' as Provider,
    expectedGeneration: 0,
    at: '2026-10-21T10:00:00.000Z',
    complete: true,
    events: [event()],
    sources: [],
    status: 'success' as const,
    reason: null,
    ...overrides,
  };
}

async function scalar(db: D1Database, sql: string): Promise<number> {
  const row = await db.prepare(sql).first<{ value: number }>();
  if (!row) throw new Error(`No result for ${sql}`);
  return row.value;
}

function tracePreparedStatements(db: D1Database) {
  const statements: Array<{ sql: string; bindCount: number; inputBytes: number }> = [];
  const encoder = new TextEncoder();
  const traced = new Proxy(db, {
    get(target, property) {
      if (property !== 'prepare') return Reflect.get(target, property, target);
      return (sql: string) => {
        const statement = target.prepare(sql);
        return new Proxy(statement, {
          get(inner, method) {
            if (method !== 'bind') return Reflect.get(inner, method, inner);
            return (...values: Array<string | number | null>) => {
              statements.push({
                sql,
                bindCount: values.length,
                inputBytes: encoder.encode(sql).byteLength + values.reduce<number>((total, value) => {
                  const valueBytes = typeof value === 'string' ? encoder.encode(value).byteLength : value === null ? 1 : 8;
                  return total + valueBytes + 16;
                }, 0),
              });
              return inner.bind(...values);
            };
          },
        });
      };
    },
  }) as unknown as D1Database;
  return { db: traced, statements };
}

function encoderBytes(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

describe('Stage 4 D1 storage', () => {
  it('migrates provider, event, version, and pagination indexes with immutable audit rows', async () => {
    const { db } = await testDb();
    const eventIndexes = await db.prepare("PRAGMA index_list('events')").all<{ name: string }>();
    const versionIndexes = await db.prepare("PRAGMA index_list('event_versions')").all<{ name: string }>();
    expect(eventIndexes.results.map((index) => index.name)).toContain('events_provider_date_id');
    expect(eventIndexes.results.map((index) => index.name)).toContain('events_provider_action_date');
    expect(versionIndexes.results.map((index) => index.name)).toContain('event_versions_event_sequence');

    const repo = createD1Repository(db);
    await repo.commitSnapshot(commitArgs());
    await expect(db.prepare("UPDATE observations SET payload = '{}'").run()).rejects.toThrow();
    await expect(db.prepare('DELETE FROM event_versions').run()).rejects.toThrow();
    const providers = await db.prepare('SELECT provider FROM provider_activation ORDER BY provider').all<{ provider: string }>();
    expect(providers.results.map((row) => row.provider)).toEqual(['claude', 'codex']);
    await expect(repo.commitSnapshot(commitArgs({
      expectedGeneration: 1,
      events: [event({ id: 'another-local-id', observationKey: 'observation-duplicate-external' })],
    }))).rejects.toThrow();
    expect(await repo.loadProvider('claude')).toMatchObject({ generation: 1 });
    expect(await repo.loadProvider('codex')).toMatchObject({
      generation: 0,
      baselineCompletedAt: null,
      publishApprovedAt: null,
      lastAttemptAt: null,
      lastSuccessAt: null,
    });
  });

  it('suppresses every first-baseline candidate independently for each provider', async () => {
    const { db } = await testDb();
    const repo = createD1Repository(db);
    const first = await repo.commitSnapshot(commitArgs());
    expect(first).toEqual({ committed: true, baselineCompleted: true });
    expect((await repo.loadEvents('claude'))[0]?.candidate).toBe(false);
    expect(await scalar(db, 'SELECT COUNT(*) AS value FROM publication_candidates')).toBe(0);
    expect(await repo.loadProvider('claude')).toMatchObject({
      baselineCompletedAt: '2026-10-21T10:00:00.000Z',
      lastAttemptAt: '2026-10-21T10:00:00.000Z',
      lastSuccessAt: '2026-10-21T10:00:00.000Z',
      lastStatus: 'success',
    });
    expect(await repo.loadProvider('codex')).toMatchObject({ generation: 0, baselineCompletedAt: null });

    const replay = await repo.commitSnapshot(commitArgs({
      expectedGeneration: 1,
      at: '2026-10-21T10:05:00.000Z',
    }));
    expect(replay).toEqual({ committed: true, baselineCompleted: false });
    expect(await scalar(db, 'SELECT COUNT(*) AS value FROM publication_candidates')).toBe(0);

    await repo.commitSnapshot(commitArgs({
      expectedGeneration: 2,
      at: '2026-10-21T10:10:00.000Z',
      events: [event({ materialHash: 'hash-b', observationKey: 'observation-2' })],
    }));
    expect(await scalar(db, 'SELECT COUNT(*) AS value FROM publication_candidates')).toBe(1);
    expect((await repo.loadEvents('claude'))[0]?.candidate).toBe(true);
  });

  it('keeps observations immutable, ignores material noise, and records A to B to A transitions', async () => {
    const { db } = await testDb();
    const repo = createD1Repository(db);
    await repo.commitSnapshot(commitArgs());
    await repo.commitSnapshot(commitArgs({
      expectedGeneration: 1,
      at: '2026-10-21T10:01:00.000Z',
      events: [event({ observationKey: 'observation-2', payload: '{"raw":{"kind":"usage_reset"},"generated_at":"noise"}' })],
    }));
    expect((await repo.loadEvents('claude'))[0]).toMatchObject({
      detectedAt: '2026-10-21T10:00:00.000Z',
      lastObservedAt: '2026-10-21T10:01:00.000Z',
    });
    await repo.commitSnapshot(commitArgs({
      expectedGeneration: 2,
      at: '2026-10-21T10:02:00.000Z',
      events: [event({ materialHash: 'hash-b', observationKey: 'observation-3', detectedAt: '2026-10-21T10:02:00.000Z' })],
    }));
    await repo.commitSnapshot(commitArgs({
      expectedGeneration: 3,
      at: '2026-10-21T10:03:00.000Z',
      events: [event({ observationKey: 'observation-4', detectedAt: '2026-10-21T10:03:00.000Z' })],
    }));

    const versions = await db.prepare('SELECT sequence, transition_id FROM event_versions ORDER BY sequence').all<{ sequence: number; transition_id: string }>();
    expect(versions.results).toEqual([
      { sequence: 1, transition_id: 'claude:resets:reset-1#1' },
      { sequence: 2, transition_id: 'claude:resets:reset-1#2' },
      { sequence: 3, transition_id: 'claude:resets:reset-1#3' },
    ]);
    expect(await scalar(db, 'SELECT COUNT(*) AS value FROM observations')).toBe(4);
    expect((await repo.loadEvents('claude'))[0]).toMatchObject({
      materialHash: 'hash-a',
      firstDetectedAt: '2026-10-21T10:00:00.000Z',
      lastObservedAt: '2026-10-21T10:03:00.000Z',
      detectedAt: '2026-10-21T10:03:00.000Z',
      transitionId: 'claude:resets:reset-1#3',
    });
    const previousVersion = await repo.loadVersion('claude:resets:reset-1', 'claude:resets:reset-1#1');
    expect(previousVersion).toMatchObject({
      id: 'claude:resets:reset-1',
      provider: 'claude',
      upstream: 'clauderesets.com',
      externalId: 'reset-1',
      materialHash: 'hash-a',
      transitionId: 'claude:resets:reset-1#1',
      firstDetectedAt: '2026-10-21T10:00:00.000Z',
      lastObservedAt: '2026-10-21T10:00:00.000Z',
      payload: event().payload,
      candidate: false,
    });
    expect(await repo.loadVersion('another-event', 'claude:resets:reset-1#1')).toBeNull();
    expect(await repo.loadVersion('claude:resets:reset-1', 'missing-transition')).toBeNull();
  });

  it('updates canonical freshness and source metadata when an observation has the same material hash', async () => {
    const { db } = await testDb();
    const repo = createD1Repository(db);
    const firstSource = {
      endpointKey: 'feed', snapshot: '{"items":[1]}', etag: 'etag-1',
      checkedAt: '2026-10-21T10:00:00.000Z', expiresAt: 1_800_000_000_000,
      retryUntil: 0, failureCount: 0, retainedUntil: 1_900_000_000_000,
    };
    await repo.commitSnapshot(commitArgs({ sources: [firstSource] }));
    const refreshed = event({
      observationKey: event().observationKey,
      upstreamRevision: 'revision-2',
      eventDate: '2026-10-21',
      detectedAt: '2026-10-21T10:05:00.000Z',
      payload: JSON.stringify({ raw: { kind: 'usage_reset', revision: 2 }, evidence: ['https://example.test/reset-1'] }),
    });
    const secondSource = {
      ...firstSource, snapshot: '{"items":[1],"checked":2}', etag: 'etag-2',
      checkedAt: '2026-10-21T10:05:00.000Z', expiresAt: 1_800_000_300_000,
    };
    await repo.commitSnapshot(commitArgs({
      expectedGeneration: 1,
      at: '2026-10-21T10:05:00.000Z',
      events: [refreshed],
      sources: [secondSource],
    }));

    expect((await repo.loadEvents('claude'))[0]).toMatchObject({
      materialHash: event().materialHash,
      observationKey: event().observationKey,
      upstreamRevision: 'revision-2',
      payload: refreshed.payload,
      lastObservedAt: '2026-10-21T10:05:00.000Z',
      transitionId: `${event().id}#1`,
    });
    expect(await scalar(db, 'SELECT COUNT(*) AS value FROM event_versions')).toBe(1);
    expect(await scalar(db, 'SELECT COUNT(*) AS value FROM observations')).toBe(1);
    const originalObservation = await db.prepare(
      'SELECT detected_at, payload FROM observations WHERE event_id = ?1 AND observation_key = ?2',
    ).bind(event().id, event().observationKey).first<{ detected_at: string; payload: string }>();
    expect(originalObservation).toEqual({ detected_at: event().detectedAt, payload: event().payload });
    expect(await repo.loadSources('claude')).toEqual([{ provider: 'claude', ...secondSource }]);
  });

  it('stores all rows across grouped chunks and creates candidates only after baseline', async () => {
    const { db: rawDb } = await testDb();
    const { db, statements } = tracePreparedStatements(rawDb);
    const repo = createD1Repository(db);
    const inputs = Array.from({ length: 100 }, (_, index) => event({
      id: `claude:resets:group-${index}`,
      externalId: `group-${index}`,
      observationKey: `group-observation-${index}`,
      assessmentKey: `group-assessment-${index}`,
    }));
    await repo.commitSnapshot(commitArgs({ events: inputs }));
    for (const table of ['events', 'observations', 'event_versions']) {
      const groups = statements.filter((statement) => statement.sql.includes(`INSERT INTO ${table} `));
      expect(groups.length).toBeGreaterThan(1);
      expect(groups.every((statement) => statement.bindCount <= 100 && encoderBytes(statement.sql) <= 100 * 1024 && statement.inputBytes <= 2 * 1024 * 1024)).toBe(true);
    }
    expect(await scalar(db, 'SELECT COUNT(*) AS value FROM events')).toBe(100);
    expect(await scalar(db, 'SELECT COUNT(*) AS value FROM observations')).toBe(100);
    expect(await scalar(db, 'SELECT COUNT(*) AS value FROM event_versions')).toBe(100);
    expect(await scalar(db, 'SELECT COUNT(*) AS value FROM publication_candidates')).toBe(0);

    await repo.commitSnapshot(commitArgs({
      expectedGeneration: 1,
      at: '2026-10-21T10:05:00.000Z',
      events: inputs.map((item) => ({ ...item, materialHash: 'hash-b', observationKey: `${item.observationKey}-next` })),
    }));
    const candidateGroups = statements.filter((statement) => statement.sql.includes('INSERT INTO publication_candidates '));
    expect(candidateGroups.length).toBeGreaterThan(1);
    expect(candidateGroups.every((statement) => statement.bindCount <= 100 && encoderBytes(statement.sql) <= 100 * 1024 && statement.inputBytes <= 2 * 1024 * 1024)).toBe(true);
    expect(await scalar(db, 'SELECT COUNT(*) AS value FROM events')).toBe(100);
    expect(await scalar(db, 'SELECT COUNT(*) AS value FROM observations')).toBe(200);
    expect(await scalar(db, 'SELECT COUNT(*) AS value FROM event_versions')).toBe(200);
    expect(await scalar(db, 'SELECT COUNT(*) AS value FROM publication_candidates')).toBe(100);
    expect(await scalar(db, "SELECT COUNT(*) AS value FROM event_versions WHERE candidate = 1")).toBe(100);
  });

  it('rolls back every grouped write when an observation insert fails in a later chunk', async () => {
    const { db } = await testDb();
    const repo = createD1Repository(db);
    const inputs = Array.from({ length: 100 }, (_, index) => event({
      id: `claude:resets:rollback-${index}`,
      externalId: `rollback-${index}`,
      observationKey: `rollback-observation-${index}`,
    }));
    await repo.commitSnapshot(commitArgs({ events: inputs }));
    const doomedId = inputs[75]!.id;
    await db.prepare(`CREATE TRIGGER fail_grouped_observation BEFORE INSERT ON observations
      WHEN NEW.event_id = '${doomedId}'
      BEGIN SELECT RAISE(ABORT, 'injected grouped observation failure'); END`).run();

    await expect(repo.commitSnapshot(commitArgs({
      expectedGeneration: 1,
      at: '2026-10-21T10:05:00.000Z',
      events: inputs.map((item) => ({ ...item, materialHash: 'hash-b', observationKey: `${item.observationKey}-next` })),
      sources: [{
        endpointKey: 'feed', snapshot: '{"new":true}', etag: 'etag-new', checkedAt: '2026-10-21T10:05:00.000Z',
        expiresAt: 1_800_000_300_000, retryUntil: 0, failureCount: 0, retainedUntil: 1_900_000_000_000,
      }],
    }))).rejects.toThrow('injected grouped observation failure');

    expect(await repo.loadProvider('claude')).toMatchObject({ generation: 1 });
    expect((await repo.loadEvents('claude')).every((item) => item.materialHash === 'hash-a')).toBe(true);
    expect(await scalar(db, 'SELECT COUNT(*) AS value FROM observations')).toBe(100);
    expect(await scalar(db, 'SELECT COUNT(*) AS value FROM event_versions')).toBe(100);
    expect(await scalar(db, 'SELECT COUNT(*) AS value FROM publication_candidates')).toBe(0);
    expect(await repo.loadSources('claude')).toEqual([]);
    expect(await scalar(db, 'SELECT COUNT(*) AS value FROM sync_runs')).toBe(1);
  });

  it('rejects a generation that became stale after its initial read without partial writes', async () => {
    const { db } = await testDb();
    const winner = createD1Repository(db);
    await winner.commitSnapshot(commitArgs());

    let injected = false;
    const staleReadDb = new Proxy(db, {
      get(target, property) {
        if (property !== 'prepare') return Reflect.get(target, property, target);
        return (sql: string) => {
          const statement = target.prepare(sql);
          if (!sql.includes('FROM provider_activation WHERE provider = ?1')) return statement;
          return new Proxy(statement, {
            get(inner, method) {
              if (method !== 'bind') return Reflect.get(inner, method, inner);
              return (...values: unknown[]) => new Proxy(inner.bind(...values), {
                get(bound, boundMethod) {
                  if (boundMethod !== 'first') return Reflect.get(bound, boundMethod, bound);
                  return async (...args: unknown[]) => {
                    const row = await (bound.first as (...callArgs: unknown[]) => Promise<unknown>)(...args);
                    if (!injected) {
                      injected = true;
                      await winner.commitSnapshot(commitArgs({
                        expectedGeneration: 1,
                        at: '2026-10-21T10:01:00.000Z',
                        events: [event({ materialHash: 'hash-winner', observationKey: 'winner-observation' })],
                      }));
                    }
                    return row;
                  };
                },
              });
            },
          });
        };
      },
    }) as unknown as D1Database;
    const stale = createD1Repository(staleReadDb);
    const result = await stale.commitSnapshot(commitArgs({
      expectedGeneration: 1,
      at: '2026-10-21T10:02:00.000Z',
      events: [event({ materialHash: 'hash-loser', observationKey: 'loser-observation' })],
      sources: [{
        endpointKey: 'loser-source', snapshot: '{"loser":true}', etag: null, checkedAt: null,
        expiresAt: 0, retryUntil: 0, failureCount: 0, retainedUntil: 0,
      }],
    }));

    expect(injected).toBe(true);
    expect(result).toEqual({ committed: false, baselineCompleted: false });
    expect(await winner.loadProvider('claude')).toMatchObject({ generation: 2 });
    expect((await winner.loadEvents('claude'))[0]?.materialHash).toBe('hash-winner');
    expect(await scalar(db, "SELECT COUNT(*) AS value FROM observations WHERE observation_key = 'loser-observation'")).toBe(0);
    expect(await scalar(db, "SELECT COUNT(*) AS value FROM source_state WHERE endpoint_key = 'loser-source'")).toBe(0);
    expect(await scalar(db, 'SELECT COUNT(*) AS value FROM sync_runs')).toBe(2);
  });

  it('preserves large UTF-8 payload rows without truncation across input chunks', async () => {
    const { db: rawDb } = await testDb();
    const { db, statements } = tracePreparedStatements(rawDb);
    const repo = createD1Repository(db);
    const payloadValue = '🛰️'.repeat(24_000);
    const inputs = Array.from({ length: 24 }, (_, index) => event({
      id: `claude:resets:utf8-${index}`,
      externalId: `utf8-${index}`,
      observationKey: `utf8-observation-${index}`,
      payload: JSON.stringify({ raw: { kind: 'usage_reset', description: payloadValue }, evidence: ['https://example.test/utf8'] }),
    }));
    await repo.commitSnapshot(commitArgs({ events: inputs }));
    // 24 rows fit two observation groups by bind count alone. UTF-8 input
    // bytes must split them further while keeping the provider atomic.
    const observationGroups = statements.filter((statement) => statement.sql.includes('INSERT INTO observations '));
    expect(observationGroups.length).toBeGreaterThan(2);
    expect(observationGroups.every((statement) => statement.inputBytes <= 2_000_000)).toBe(true);
    const stored = await db.prepare("SELECT COUNT(*) AS value FROM events WHERE length(payload) > 30000").first<{ value: number }>();
    expect(stored?.value).toBe(24);
    expect((await repo.loadEvents('claude')).map((item) => item.payload)).toEqual(inputs.map((item) => item.payload));
  });

  it('recovers a lost batch acknowledgement by reading durable generation without replaying a new transition', async () => {
    const { db } = await testDb();
    const lostAckDb = new Proxy(db, {
      get(target, property) {
        if (property !== 'batch') return Reflect.get(target, property, target);
        return async (statements: D1PreparedStatement[]) => {
          await target.batch(statements);
          throw new Error('SYNTHETIC lost commit acknowledgement');
        };
      },
    }) as D1Database;
    expect(await createD1Repository(lostAckDb).commitSnapshot(commitArgs())).toEqual({ committed: false, baselineCompleted: false });
    const repo = createD1Repository(db);
    expect(await repo.loadProvider('claude')).toMatchObject({ generation: 1, baselineCompletedAt: commitArgs().at });
    expect(await repo.commitSnapshot(commitArgs())).toEqual({ committed: false, baselineCompleted: false });
    expect(await scalar(db, 'SELECT COUNT(*) AS value FROM events')).toBe(1);
    expect(await scalar(db, 'SELECT COUNT(*) AS value FROM observations')).toBe(1);
    expect(await scalar(db, 'SELECT COUNT(*) AS value FROM event_versions')).toBe(1);
    expect(await scalar(db, 'SELECT COUNT(*) AS value FROM sync_runs')).toBe(1);
    expect(await scalar(db, 'SELECT COUNT(*) AS value FROM publication_candidates')).toBe(0);
    expect(await scalar(db, 'SELECT COUNT(*) AS value FROM commit_guards')).toBe(0);
  });

  it('rejects a single UTF-8 input row above the statement bound before changing durable state', async () => {
    const { db } = await testDb();
    const repo = createD1Repository(db);
    const oversized = event({ payload: JSON.stringify({ raw: { kind: 'usage_reset', data: '🛰️'.repeat(400_000) } }) });
    await expect(repo.commitSnapshot(commitArgs({ events: [oversized] }))).rejects.toThrow(/exceeds D1 statement input limits/);
    expect(await repo.loadProvider('claude')).toMatchObject({ generation: 0, baselineCompletedAt: null });
    expect(await scalar(db, 'SELECT COUNT(*) AS value FROM events')).toBe(0);
    expect(await scalar(db, 'SELECT COUNT(*) AS value FROM sync_runs')).toBe(0);
  });

  it('rolls back a failing snapshot batch and reports a concurrent generation CAS loser', async () => {
    const { db } = await testDb();
    const left = createD1Repository(db);
    const right = createD1Repository(db);
    await left.commitSnapshot(commitArgs());

    await expect(left.commitSnapshot(commitArgs({
      expectedGeneration: 1,
      at: '2026-10-21T10:01:00.000Z',
      events: [event({ id: 'new-event', externalId: 'new-event', observationKey: 'new-observation' })],
      sources: [{
        endpointKey: 'resets', snapshot: '{"items":[]}', etag: 'etag-1', checkedAt: '2026-10-21T10:01:00.000Z',
        expiresAt: 1, retryUntil: 0, failureCount: -1, retainedUntil: 2,
      }],
    }))).rejects.toThrow();
    expect(await left.loadProvider('claude')).toMatchObject({ generation: 1 });
    expect(await scalar(db, "SELECT COUNT(*) AS value FROM events WHERE id = 'new-event'")).toBe(0);
    expect(await scalar(db, 'SELECT COUNT(*) AS value FROM sync_runs')).toBe(1);

    const [a, b] = await Promise.all([
      left.commitSnapshot(commitArgs({ expectedGeneration: 1, at: '2026-10-21T10:02:00.000Z' })),
      right.commitSnapshot(commitArgs({ expectedGeneration: 1, at: '2026-10-21T10:02:01.000Z' })),
    ]);
    expect([a.committed, b.committed].filter(Boolean)).toHaveLength(1);
    expect([a.committed, b.committed].filter((committed) => !committed)).toHaveLength(1);
    expect(await left.loadProvider('claude')).toMatchObject({ generation: 2 });
    expect(await scalar(db, 'SELECT COUNT(*) AS value FROM sync_runs')).toBe(2);
  });

  it('preserves valid source snapshots on failures and never deletes events omitted from a later full snapshot', async () => {
    const { db } = await testDb();
    const repo = createD1Repository(db);
    const source = {
      endpointKey: 'history?limit=100', snapshot: '{"items":[1]}', etag: 'etag-valid',
      checkedAt: '2026-10-21T10:00:00.000Z', expiresAt: 100, retryUntil: 0, failureCount: 0, retainedUntil: 500,
    };
    await repo.commitSnapshot(commitArgs({ sources: [source] }));
    await repo.commitSnapshot(commitArgs({
      expectedGeneration: 1,
      at: '2026-10-21T10:01:00.000Z',
      complete: false,
      events: [],
      sources: [{ ...source, failureCount: 1, retryUntil: 200 }],
      status: 'partial',
      reason: 'upstream temporarily unavailable',
    }));
    expect(await repo.loadSources('claude')).toEqual([{
      provider: 'claude', ...source, failureCount: 1, retryUntil: 200,
    }]);
    expect(await repo.loadProvider('claude')).toMatchObject({
      lastSuccessAt: '2026-10-21T10:00:00.000Z',
      lastAttemptAt: '2026-10-21T10:01:00.000Z',
      lastStatus: 'partial',
      lastReason: 'upstream temporarily unavailable',
    });
    await repo.commitSnapshot(commitArgs({
      expectedGeneration: 2,
      at: '2026-10-21T10:02:00.000Z',
      events: [],
      sources: [],
    }));
    expect((await repo.loadEvents('claude')).map((stored) => stored.id)).toEqual(['claude:resets:reset-1']);
  });

  // 103 real D1 commits cross the retention boundary. Shared CI runners can
  // exceed Vitest's 5s default; keep a bounded 20s budget for this test only.
  it('clears expired transient source representations on explicit null and retains only 100 sync runs per provider', async () => {
    const { db } = await testDb();
    const repo = createD1Repository(db);
    const source = {
      endpointKey: 'feed', snapshot: '{"items":[]}', etag: 'valid-etag', checkedAt: '2026-10-21T10:00:00.000Z',
      expiresAt: 1, retryUntil: 0, failureCount: 0, retainedUntil: 1,
    };
    await repo.commitSnapshot(commitArgs({ sources: [source] }));
    await repo.commitSnapshot(commitArgs({
      expectedGeneration: 1,
      at: '2026-10-21T10:01:00.000Z',
      complete: false,
      events: [],
      sources: [{ ...source, snapshot: null, etag: null, checkedAt: null }],
      status: 'failed',
      reason: 'expired cache cleared',
    }));
    expect(await repo.loadSources('claude')).toEqual([]);

    for (let generation = 2; generation <= 102; generation += 1) {
      const result = await repo.commitSnapshot(commitArgs({
        expectedGeneration: generation,
        at: new Date(Date.parse('2026-10-21T10:00:00.000Z') + generation * 60_000).toISOString(),
        complete: false,
        events: [],
        sources: [],
        status: 'failed',
      }));
      expect(result.committed).toBe(true);
    }
    expect(await scalar(db, "SELECT COUNT(*) AS value FROM sync_runs WHERE provider = 'claude'")).toBe(100);
    expect(await scalar(db, "SELECT COUNT(*) AS value FROM sync_runs WHERE provider = 'codex'")).toBe(0);
    const retained = await db.prepare("SELECT generation FROM sync_runs WHERE provider = 'claude' ORDER BY run_id").all<{ generation: number }>();
    expect(retained.results.map((row) => row.generation)).toEqual(Array.from({ length: 100 }, (_, index) => index + 4));
    expect(await repo.loadProvider('claude')).toMatchObject({ generation: 103 });
    expect(await scalar(db, 'SELECT COUNT(*) AS value FROM source_state')).toBe(0);
    expect(await scalar(db, 'SELECT COUNT(*) AS value FROM commit_guards')).toBe(0);
    expect((await repo.loadEvents('claude')).map((stored) => stored.id)).toEqual([event().id]);
  }, 20_000);

  it('atomically claims only synthetic destinations, permits explicit retryable retries, and keeps ambiguous outcomes manual after restart', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'reset-radar-stage4-'));
    const persist = join(directory, 'd1');
    try {
      const firstDb = await testDb({ persist });
      const repoA = createD1Repository(firstDb.db);
      await repoA.commitSnapshot(commitArgs());
      const destination = 'synthetic:test-channel';
      await expect(repoA.claimSynthetic({ eventId: event().id, transitionId: `${event().id}#1`, destination: 'telegram:prod', token: 't0', at: '2026-10-21T10:01:00.000Z' })).rejects.toThrow();
      await expect(repoA.claimSynthetic({ eventId: event().id, transitionId: 'different-event#1', destination, token: 't0', at: '2026-10-21T10:01:00.000Z' })).rejects.toThrow();
      await expect(repoA.claimSynthetic({ eventId: event().id, transitionId: `${event().id}#1`, destination, token: ' ', at: '2026-10-21T10:01:00.000Z' })).rejects.toThrow();

      const repoB = createD1Repository(firstDb.db);
      const claims = await Promise.all([
        repoA.claimSynthetic({ eventId: event().id, transitionId: `${event().id}#1`, destination, token: 'claim-a', at: '2026-10-21T10:01:00.000Z' }),
        repoB.claimSynthetic({ eventId: event().id, transitionId: `${event().id}#1`, destination, token: 'claim-b', at: '2026-10-21T10:01:01.000Z' }),
      ]);
      expect(claims.filter(Boolean)).toHaveLength(1);
      const winner = claims[0] ? 'claim-a' : 'claim-b';
      expect(await repoA.completeSynthetic({
        eventId: event().id, transitionId: `${event().id}#1`, destination, token: winner,
        at: '2026-10-21T10:02:00.000Z', outcome: 'retryable',
      })).toBe(true);
      expect(await repoB.claimSynthetic({
        eventId: event().id, transitionId: `${event().id}#1`, destination, token: 'claim-retry', at: '2026-10-21T10:03:00.000Z',
      })).toBe(true);
      expect(await repoB.getDelivery({ eventId: event().id, transitionId: `${event().id}#1`, destination })).toMatchObject({ attempts: 2, state: 'claimed' });
      expect(await repoB.completeSynthetic({
        eventId: event().id, transitionId: `${event().id}#1`, destination, token: 'claim-retry',
        at: '2026-10-21T10:04:00.000Z', outcome: 'uncertain_manual_review',
      })).toBe(true);

      const stuckDestination = 'synthetic:stale-claim';
      expect(await repoA.claimSynthetic({
        eventId: event().id, transitionId: `${event().id}#1`, destination: stuckDestination,
        token: 'stuck-token', at: '2026-10-21T10:04:00.000Z',
      })).toBe(true);
      const sentDestination = 'synthetic:sent-terminal';
      expect(await repoA.claimSynthetic({
        eventId: event().id, transitionId: `${event().id}#1`, destination: sentDestination,
        token: 'sent-token', at: '2026-10-21T10:04:00.000Z',
      })).toBe(true);
      await expect(repoA.completeSynthetic({
        eventId: event().id, transitionId: `${event().id}#1`, destination: sentDestination,
        token: 'sent-token', at: '2026-10-21T10:04:30.000Z', outcome: 'sent',
      })).rejects.toThrow();
      expect(await repoA.completeSynthetic({
        eventId: event().id, transitionId: `${event().id}#1`, destination: sentDestination,
        token: 'sent-token', at: '2026-10-21T10:05:00.000Z', outcome: 'sent', messageId: 'synthetic-message-1',
      })).toBe(true);
      const rejectedDestination = 'synthetic:rejected-terminal';
      expect(await repoA.claimSynthetic({
        eventId: event().id, transitionId: `${event().id}#1`, destination: rejectedDestination,
        token: 'rejected-token', at: '2026-10-21T10:04:00.000Z',
      })).toBe(true);
      expect(await repoA.completeSynthetic({
        eventId: event().id, transitionId: `${event().id}#1`, destination: rejectedDestination,
        token: 'rejected-token', at: '2026-10-21T10:05:00.000Z', outcome: 'rejected',
      })).toBe(true);
      await firstDb.dispose();
      runtimes.splice(runtimes.indexOf(firstDb), 1);

      const restarted = await testDb({ persist, migrate: false });
      const afterRestart = createD1Repository(restarted.db);
      expect(await afterRestart.getDelivery({ eventId: event().id, transitionId: `${event().id}#1`, destination })).toMatchObject({
        state: 'uncertain_manual_review', attempts: 2,
      });
      expect(await afterRestart.claimSynthetic({
        eventId: event().id, transitionId: `${event().id}#1`, destination, token: 'claim-after-restart', at: '2026-10-21T10:05:00.000Z',
      })).toBe(false);
      for (const terminalDestination of [sentDestination, rejectedDestination, stuckDestination]) {
        expect(await afterRestart.claimSynthetic({
          eventId: event().id, transitionId: `${event().id}#1`, destination: terminalDestination,
          token: 'claim-after-restart', at: '2026-10-21T10:06:00.000Z',
        })).toBe(false);
      }
      expect(await afterRestart.getDelivery({ eventId: event().id, transitionId: `${event().id}#1`, destination: stuckDestination })).toMatchObject({ state: 'claimed', attempts: 1 });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
