import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { Provider } from '../src/domain/event';
import { createD1Repository } from '../src/storage/d1';
import {
  createPublisherRepository,
  SIMULATION_ENVIRONMENT,
  type PublicationCandidate,
  type SimulationKey,
} from '../src/storage/publisher';
import type { StoredEventInput } from '../src/storage/types';
import { createTestD1 } from './helpers/d1';

const runtimes: Array<{ dispose: () => Promise<void> }> = [];
const t0 = '2026-10-22T10:00:00.000Z';
const t1 = '2026-10-22T10:01:00.000Z';
const t2 = '2026-10-22T10:02:00.000Z';
const t3 = '2026-10-22T10:03:00.000Z';
const t4 = '2026-10-22T10:04:00.000Z';
const t5 = '2026-10-22T10:05:00.000Z';
const t6 = '2026-10-22T10:06:00.000Z';
const t7 = '2026-10-22T10:07:00.000Z';

afterEach(async () => {
  await Promise.all(runtimes.splice(0).map((runtime) => runtime.dispose()));
});

async function testDb(options: Parameters<typeof createTestD1>[0] = {}) {
  const runtime = await createTestD1(options);
  runtimes.push(runtime);
  return runtime;
}

function event(id: string, generation: number, overrides: Partial<StoredEventInput> = {}): StoredEventInput {
  return {
    id,
    provider: 'claude',
    upstream: 'clauderesets.com',
    externalId: id,
    materialHash: `hash-${generation}`,
    observationKey: `observation-${generation}`,
    assessmentKey: `assessment-${generation}`,
    upstreamRevision: `revision-${generation}`,
    action: 'confirmed_applied',
    eventDate: '2026-10-20',
    detectedAt: generation === 1 ? t0 : t1,
    payload: JSON.stringify({ generation, evidence: ['https://example.test/reset'] }),
    candidate: true,
    ...overrides,
  };
}

function snapshot(provider: Provider, expectedGeneration: number, at: string, events: StoredEventInput[], complete = true) {
  return {
    provider,
    expectedGeneration,
    at,
    complete,
    events,
    sources: [],
    status: 'success' as const,
    reason: null,
  };
}

async function seedCandidates(db: D1Database, ids = ['event-a']) {
  const stored = createD1Repository(db);
  await stored.commitSnapshot(snapshot('claude', 0, t0, ids.map((id) => event(id, 1))));
  await stored.commitSnapshot(snapshot('claude', 1, t1, ids.map((id) => event(id, 2))));
  const publisher = createPublisherRepository(db);
  return { stored, publisher, candidates: await publisher.listCandidates({ provider: 'claude', limit: 50 }) };
}

function key(candidate: PublicationCandidate, destination = 'synthetic:stage5-tests'): SimulationKey {
  return { eventId: candidate.eventId, transitionId: candidate.transitionId, destination };
}

function claimInput(candidate: PublicationCandidate, token: string, generation = 2, at = t2, destination?: string) {
  return { ...key(candidate, destination), candidate, generation, token, at };
}

describe('Stage 5 local publisher D1 journal', () => {
  it('uses a cursor range seek in the actual prepared candidate query', async () => {
    const { db } = await testDb();
    const { candidates } = await seedCandidates(db, ['event-a', 'event-b']);
    let query = '';
    const captured = createPublisherRepository({prepare(sql: string) {
      query = sql;
      return db.prepare(sql);
    }} as unknown as D1Database);
    const first = candidates[0]!;
    await captured.listCandidates({provider: 'claude', limit: 1,
      after: {createdAt: first.createdAt, transitionId: first.transitionId}});
    const plan = await db.prepare(`EXPLAIN QUERY PLAN ${query}`)
      .bind('claude', 1, first.createdAt, first.transitionId).all<{detail: string}>();
    const candidateSeek = plan.results.find((row) => row.detail.includes('publication_candidates_pending_page'))?.detail;
    expect(candidateSeek).toContain('created_at');
    expect(candidateSeek).toContain('>');
    expect(plan.results.some((row) => row.detail.includes('USE TEMP B-TREE'))).toBe(false);
  });
  it('pages candidates in bounded deterministic order with a transition tie-breaker and loads prior versions', async () => {
    const { db } = await testDb();
    const { publisher, candidates } = await seedCandidates(db, ['event-c', 'event-a', 'event-b']);
    expect(candidates).toHaveLength(3);
    expect(candidates.map((candidate) => candidate.transitionId)).toEqual([
      'event-a#2', 'event-b#2', 'event-c#2',
    ]);
    const first = await publisher.listCandidates({ provider: 'claude', limit: 1 });
    expect(first).toEqual([candidates[0]]);
    const second = await publisher.listCandidates({
      provider: 'claude', limit: 2,
      after: { createdAt: first[0]!.createdAt, transitionId: first[0]!.transitionId },
    });
    expect(second).toEqual(candidates.slice(1));
    expect(await publisher.listCandidates({
      provider: 'claude', limit: 50,
      after: { createdAt: second[1]!.createdAt, transitionId: second[1]!.transitionId },
    })).toEqual([]);

    await expect(publisher.listCandidates({ provider: 'claude', limit: 0 })).rejects.toThrow('invalid_candidate_page');
    await expect(publisher.listCandidates({ provider: 'claude', limit: 51 })).rejects.toThrow('invalid_candidate_page');
    await expect(publisher.listCandidates({ provider: 'claude', limit: 1, after: { createdAt: 'bad-date', transitionId: 'x' } }))
      .rejects.toThrow('invalid_candidate_page');
    await expect(publisher.listCandidates({ provider: 'claude', limit: 1, after: { createdAt: t0, transitionId: 'x'.repeat(8001) } }))
      .rejects.toThrow('invalid_candidate_page');

    const eventId = 'event-a';
    expect(await publisher.loadPrevious(eventId, `${eventId}#1`, 2)).toContain('"generation":1');
    expect(await publisher.loadPrevious(eventId, `${eventId}#2`, 2)).toBeNull();
    expect(await publisher.loadPrevious(eventId, `${eventId}#2`, 1)).toBeNull();
    expect(await publisher.loadPrevious('unknown', `${eventId}#1`, 2)).toBeNull();
  });

  it('keeps simulation journal separate from Stage 4 synthetic deliveries and enforces local synthetic destinations', async () => {
    const { db } = await testDb();
    const { stored, publisher, candidates } = await seedCandidates(db);
    const candidate = candidates[0]!;
    const transitionId = candidate.transitionId;
    const oldDestination = 'synthetic:stage4';
    expect(await stored.claimSynthetic({ eventId: candidate.eventId, transitionId, destination: oldDestination, token: 'stage4-token', at: t2 })).toBe(true);

    expect(await publisher.claim(claimInput(candidate, 'stage5-token', 2, t2))).toBe(true);
    expect(await publisher.getDelivery(key(candidate))).toMatchObject({ state: 'claimed', attempts: 1, token: 'stage5-token' });
    expect(await stored.getDelivery({ eventId: candidate.eventId, transitionId, destination: oldDestination }))
      .toMatchObject({ state: 'claimed', token: 'stage4-token' });
    expect(await stored.getDelivery({ eventId: candidate.eventId, transitionId, destination: key(candidate).destination })).toBeNull();

    const tables = await db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all<{ name: string }>();
    expect(tables.results.map((row) => row.name)).toContain('synthetic_deliveries');
    expect(tables.results.map((row) => row.name)).toContain('telegram_simulation_deliveries');
    await expect(publisher.getDelivery({ ...key(candidate), destination: 'telegram:real-channel' })).rejects.toThrow('invalid_simulation_destination');
    await expect(publisher.claim(claimInput(candidate, 'bad-destination', 2, t3, 'telegram:real-channel')))
      .rejects.toThrow('invalid_simulation_destination');
  });

  it('allows exactly one concurrent claim and only the owning token can complete it', async () => {
    const { db } = await testDb();
    const { publisher, candidates } = await seedCandidates(db);
    const candidate = candidates[0]!;
    const left = createPublisherRepository(db);
    const outcomes = await Promise.all([
      left.claim(claimInput(candidate, 'claim-left')),
      publisher.claim(claimInput(candidate, 'claim-right', 2, t3)),
    ]);
    expect(outcomes.filter(Boolean)).toHaveLength(1);
    const owner = outcomes[0] ? 'claim-left' : 'claim-right';
    expect(await publisher.complete({ ...key(candidate), token: `${owner}-wrong`, at: t4, state: 'simulated_sent', messageId: 51 })).toBe(false);
    expect(await publisher.complete({ ...key(candidate), token: owner, at: t4, state: 'simulated_sent', messageId: 51 })).toBe(true);
    expect(await publisher.getDelivery(key(candidate))).toMatchObject({ state: 'simulated_sent', attempts: 1, messageId: 51 });
    expect(await publisher.claim(claimInput(candidate, 'terminal-replay', 2, t5))).toBe(false);
  });

  it('persists bounded retry timing, retries only at due time, and stops after three attempts', async () => {
    const { db } = await testDb();
    const { publisher, candidates } = await seedCandidates(db);
    const candidate = candidates[0]!;
    expect(await publisher.claim(claimInput(candidate, 'attempt-1'))).toBe(true);
    expect(await publisher.complete({
      ...key(candidate), token: 'attempt-1', at: t2, state: 'retryable', retryAt: t4,
    })).toBe(true);
    expect(await publisher.getDelivery(key(candidate))).toMatchObject({ state: 'retryable', retryAt: t4, attempts: 1 });
    expect(await publisher.claim(claimInput(candidate, 'too-early', 2, t3))).toBe(false);
    expect(await publisher.claim(claimInput(candidate, 'attempt-2', 2, t4))).toBe(true);
    expect(await publisher.getDelivery(key(candidate))).toMatchObject({ state: 'claimed', attempts: 2, retryAt: null });
    expect(await publisher.complete({
      ...key(candidate), token: 'attempt-2', at: t4, state: 'retryable', retryAt: t6,
    })).toBe(true);
    expect(await publisher.claim(claimInput(candidate, 'attempt-3', 2, t6))).toBe(true);
    expect(await publisher.complete({
      ...key(candidate), token: 'attempt-3', at: t6, state: 'retryable', retryAt: t7,
    })).toBe(true);
    expect(await publisher.claim(claimInput(candidate, 'attempt-4', 2, t7))).toBe(false);
    expect(await publisher.getDelivery(key(candidate))).toMatchObject({ state: 'retryable', attempts: 3, retryAt: t7 });
    await expect(publisher.complete({ ...key(candidate), token: 'unused', at: t2, state: 'retryable', retryAt: t2 }))
      .rejects.toThrow('invalid_simulation_outcome');
    await expect(publisher.complete({ ...key(candidate), token: 'unused', at: t2, state: 'retryable', retryAt: '2026-10-22T11:01:00.000Z' }))
      .resolves.toBe(false);
    await expect(publisher.complete({ ...key(candidate), token: 'unused', at: t2, state: 'retryable', retryAt: '2026-10-22T11:03:00.000Z' }))
      .rejects.toThrow('invalid_simulation_outcome');
  });

  it('keeps rejected and abandoned claims terminal, and preserves journal state across a local D1 restart', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'reset-radar-stage5-'));
    const persist = join(directory, 'd1');
    try {
      const firstDb = await testDb({ persist });
      const { publisher, candidates } = await seedCandidates(firstDb.db, ['event-rejected', 'event-uncertain', 'event-stuck']);
      const rejected = candidates.find((candidate) => candidate.eventId === 'event-rejected')!;
      const uncertain = candidates.find((candidate) => candidate.eventId === 'event-uncertain')!;
      const stuck = candidates.find((candidate) => candidate.eventId === 'event-stuck')!;
      expect(await publisher.claim(claimInput(rejected, 'rejected-token'))).toBe(true);
      expect(await publisher.complete({ ...key(rejected), token: 'rejected-token', at: t3, state: 'rejected' })).toBe(true);
      expect(await publisher.claim(claimInput(uncertain, 'uncertain-token'))).toBe(true);
      expect(await publisher.complete({ ...key(uncertain), token: 'uncertain-token', at: t3, state: 'uncertain_manual_review' })).toBe(true);
      expect(await publisher.claim(claimInput(stuck, 'abandoned-token'))).toBe(true);
      await firstDb.dispose();
      runtimes.splice(runtimes.indexOf(firstDb), 1);

      const restarted = await testDb({ persist, migrate: false });
      const afterRestart = createPublisherRepository(restarted.db);
      expect(await afterRestart.getDelivery(key(rejected))).toMatchObject({ state: 'rejected', attempts: 1 });
      expect(await afterRestart.claim(claimInput(rejected, 'rejected-replay', 2, t5))).toBe(false);
      expect(await afterRestart.getDelivery(key(uncertain))).toMatchObject({ state: 'uncertain_manual_review', attempts: 1 });
      expect(await afterRestart.claim(claimInput(uncertain, 'uncertain-replay', 2, t5))).toBe(false);
      expect(await afterRestart.getDelivery(key(stuck))).toMatchObject({ state: 'claimed', token: 'abandoned-token', attempts: 1 });
      expect(await afterRestart.claim(claimInput(stuck, 'abandoned-replay', 2, t5))).toBe(false);
      expect(SIMULATION_ENVIRONMENT).toBe('stage5_local_simulation');
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('rejects stale generation and current event transition/observation snapshots after ingestion', async () => {
    const { db } = await testDb();
    const { stored, publisher, candidates } = await seedCandidates(db);
    const original = candidates[0]!;
    await stored.commitSnapshot(snapshot('claude', 2, t2, []));
    expect(await publisher.claim(claimInput(original, 'stale-generation', 2, t3))).toBe(false);

    const latest = await publisher.listCandidates({ provider: 'claude', limit: 1 });
    const old = latest[0]!;
    await stored.commitSnapshot(snapshot('claude', 3, t3, [event(old.eventId, 3, {
      materialHash: 'hash-new-transition', observationKey: 'observation-new-transition',
      detectedAt: t3, payload: JSON.stringify({ generation: 3 }),
    })]));
    expect(await publisher.claim(claimInput(old, 'stale-transition', 3, t4))).toBe(false);
    expect(await publisher.claim(claimInput(old, 'stale-observation', 4, t4))).toBe(false);
    const currentCandidates = await publisher.listCandidates({ provider: 'claude', limit: 50 });
    const current = currentCandidates.find((candidate) => candidate.eventId === old.eventId && candidate.transitionId === candidate.currentTransitionId)!;
    expect(current.currentTransitionId).not.toBe(old.currentTransitionId);
    expect(current.currentObservationKey).not.toBe(old.currentObservationKey);
    expect(await publisher.claim(claimInput(current, 'fresh-current', 4, t4))).toBe(true);
    expect(await publisher.getDelivery(key(current))).toMatchObject({ state: 'claimed' });
  });
});
