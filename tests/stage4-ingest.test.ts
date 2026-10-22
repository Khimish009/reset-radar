import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { LocalAssessment, DurableEventPayload } from '../src/domain/normalization';
import { digest, rawAssessmentKey } from '../src/domain/normalization';
import { createIngestionService } from '../src/services/ingest';
import { createD1Repository } from '../src/storage/d1';
import type { Provider } from '../src/domain/event';
import { syntheticEvent, syntheticMeta, syntheticPage, syntheticStatus } from './fixtures/claude';
import { codexEvent, codexFeed, codexScheduled } from './fixtures/codex';
import { createTestD1 } from './helpers/d1';

const INITIAL = '2026-10-22T12:00:00.000Z';
const runtimeHandles: Array<{ dispose: () => Promise<void> }> = [];
const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(runtimeHandles.splice(0).map((handle) => handle.dispose()));
  await Promise.all(tempDirs.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

async function db(options: Parameters<typeof createTestD1>[0] = {}) {
  const handle = await createTestD1(options);
  runtimeHandles.push(handle);
  return handle;
}

function clock(start = INITIAL) {
  let value = Date.parse(start);
  return {
    now: () => new Date(value),
    advance: (ms: number) => { value += ms; },
    set: (next: string) => { value = Date.parse(next); },
  };
}

type Reply = { status?: number; headers?: Record<string, string>; body?: unknown };
type FetchPlan = (url: URL, init: RequestInit) => Reply | Promise<Reply>;

function response(body: unknown, headers: Record<string, string> = {}, status = 200) {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { ...(body === undefined ? {} : { 'content-type': 'application/json' }), ...headers },
  });
}

function harness(dbBinding: D1Database, plan: FetchPlan, time = clock()) {
  const requests: Array<{ url: URL; init: RequestInit }> = [];
  const fetch = vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = new URL(input.toString());
    requests.push({ url, init });
    const reply = await plan(url, init);
    return response(reply.body, reply.headers, reply.status);
  }) as unknown as typeof globalThis.fetch;
  const service = createIngestionService(createD1Repository(dbBinding), {
    clock: time,
    fetch,
    logger: { info: vi.fn(), error: vi.fn() },
  });
  return { service, requests, fetch, time };
}

function claudeStatus(events: ReturnType<typeof syntheticEvent>[], extras: {
  latest?: typeof events[number] | null;
  ambiguous?: typeof events[number][] | null;
  announced?: typeof events[number] | null;
  offers?: typeof events[number][];
  statsTotal?: number;
  revision?: string;
  generatedAt?: string;
} = {}) {
  const base = syntheticStatus();
  return {
    ...base,
    data: {
      ...base.data,
      latest_reset: extras.latest === undefined ? events[0] ?? null : extras.latest,
      latest_ambiguous: extras.ambiguous ?? null,
      announced_reset: extras.announced ?? null,
      reset_offers: extras.offers ?? [],
      stats: { ...base.data.stats, total: extras.statsTotal ?? events.length },
    },
    meta: {
      ...syntheticMeta(),
      ...(extras.revision ? { content_revision: extras.revision } : {}),
      ...(extras.generatedAt ? { generated_at: extras.generatedAt } : {}),
    },
  };
}

function claudeFetch(page: unknown, status: unknown, options: {
  etag?: string;
  statusReply?: Reply;
  pageReply?: Reply;
} = {}): FetchPlan {
  return (url) => {
    if (url.pathname.endsWith('/resets')) {
      if (options.pageReply) return options.pageReply;
      return { body: page, ...(options.etag ? { headers: { etag: options.etag } } : {}) };
    }
    if (url.pathname.endsWith('/status')) {
      if (options.statusReply) return options.statusReply;
      return { body: status };
    }
    throw new Error(`Unexpected Claude endpoint ${url.pathname}`);
  };
}

function codexFetch(feed: unknown, options: { etag?: string; reply?: Reply } = {}): FetchPlan {
  return (url) => {
    if (url.href !== 'https://codexreset.ai/api/v1/resets.json') throw new Error(`Unexpected Codex URL ${url.href}`);
    if (options.reply) return options.reply;
    return { body: feed, ...(options.etag ? { headers: { etag: options.etag } } : {}) };
  };
}

function readPayload(serialized: string): DurableEventPayload {
  return JSON.parse(serialized) as DurableEventPayload;
}

async function assessment(provider: Provider, raw: Parameters<typeof rawAssessmentKey>[1], fields: Partial<LocalAssessment> = {}): Promise<LocalAssessment> {
  const primarySourceUrl = provider === 'claude'
    ? (raw as ReturnType<typeof syntheticEvent>).sources[0]!.url
    : (raw as ReturnType<typeof codexEvent>).url;
  return {
    recordKey: await rawAssessmentKey(provider, raw), assertion: 'applied',
    primarySourceUrl, evidenceUrls: [primarySourceUrl], rationale: 'SYNTHETIC local reviewed evidence',
    ...fields,
  };
}

describe('Stage 4 ingestion against local D1', () => {
  it('keeps an event ID equal to a scheduled URL in independent durable namespaces on replay', async () => {
    const { db: binding } = await db();
    const sharedKey = 'https://example.invalid/posts/same-upstream-identity';
    const event = codexEvent({ id: sharedKey });
    const scheduled = codexScheduled({ url: sharedKey });
    const feed = codexFeed({ events: [event], scheduled });
    const eventAssessment = await assessment('codex', event, { assertion: 'future_announcement' });
    const scheduleAssessment = await assessment('codex', scheduled, {
      assertion: 'future_announcement', primarySourceUrl: scheduled.url, evidenceUrls: [scheduled.url],
    });
    const time = clock();
    const first = harness(binding, codexFetch(feed), time);
    expect(await first.service.ingestProvider('codex', { assessments: [eventAssessment, scheduleAssessment] }))
      .toMatchObject({ complete: true, baselineCompleted: true });
    const repository = createD1Repository(binding);
    const before = await repository.loadEvents('codex');
    expect(before).toHaveLength(2);
    expect(new Set(before.map((row) => row.id)).size).toBe(2);
    expect(new Set(before.map((row) => row.externalId)).size).toBe(2);
    expect(before.every((row) => readPayload(row.payload).record.provenance.externalId === sharedKey)).toBe(true);
    expect(before.every((row) => row.action === 'announced_future')).toBe(true);
    time.advance(301_000);
    const second = harness(binding, codexFetch(feed), time);
    expect(await second.service.ingestProvider('codex')).toMatchObject({ complete: true });
    expect((await repository.loadEvents('codex')).map((row) => [row.id, row.detectedAt, row.action]))
      .toEqual(before.map((row) => [row.id, row.detectedAt, row.action]));
    expect(await binding.prepare('SELECT COUNT(*) AS n FROM event_versions').first('n')).toBe(2);
  }, 20_000);
  it('bounds restored endpoint representations and removes evicted transient cursor rows', async () => {
    const { db: binding } = await db();
    const repository = createD1Repository(binding);
    const value = syntheticPage([]);
    const contentDigest = await digest(value);
    const oldAt = '2026-10-22T11:00:00.000Z';
    const sources = Array.from({ length: 130 }, (_, index) => {
      const endpointKey = `resets?cursor=old${index}&limit=100`;
      return {
        endpointKey, snapshot: JSON.stringify({ version: 1, provider: 'claude', endpointKey,
          value, digest: contentDigest, recordDetections: {} }), etag: `"old-${index}"`,
        checkedAt: oldAt, expiresAt: Date.parse(oldAt), retryUntil: 0, failureCount: 0,
        retainedUntil: Date.parse(INITIAL) + 3_600_000,
      };
    });
    await repository.commitSnapshot({ provider: 'claude', expectedGeneration: 0, at: oldAt,
      complete: false, events: [], sources, status: 'partial', reason: 'synthetic_partial' });
    const raw = syntheticEvent();
    const { service } = harness(binding, claudeFetch(syntheticPage([raw]), claudeStatus([raw])));
    expect(await service.ingestProvider('claude')).toMatchObject({ complete: true });
    const cached = await repository.loadSources('claude');
    expect(cached.filter((row) => row.snapshot !== null)).toHaveLength(128);
    expect(cached.map((row) => row.endpointKey)).toContain('status?');
    expect(cached.map((row) => row.endpointKey)).toContain('resets?limit=100');
    expect(cached).toHaveLength(129); // representations plus the independent provider throttle
    expect(await repository.loadEvents('claude')).toHaveLength(1);
  }, 20_000);
  it('commits Claude union of complete history and status-only announcement/offer surfaces once', async () => {
    const { db: binding } = await db();
    const historyEvent = syntheticEvent({ id: 'history-reset' });
    const statusOffer = syntheticEvent({ id: 'offer-only', kind: 'credit', reset_offer: { expires_on: '2026-11-01' } });
    const announcement = syntheticEvent({ id: 'announcement-only', event_status: 'announced', effective_at: null });
    const page = syntheticPage([historyEvent]);
    const status = claudeStatus([historyEvent], { offers: [statusOffer], announced: announcement, latest: historyEvent });
    const { service } = harness(binding, claudeFetch(page, status));

    const result = await service.ingestProvider('claude');
    const stored = await createD1Repository(binding).loadEvents('claude');
    expect(result).toMatchObject({ committed: true, complete: true, baselineCompleted: true, reason: null });
    expect(stored.map((item) => item.externalId).sort()).toEqual(['announcement-only', 'history-reset', 'offer-only']);
    expect(stored.find((item) => item.externalId === 'offer-only')?.action).toBe('needs_review');
    expect(stored.find((item) => item.externalId === 'announcement-only')?.action).toBe('needs_review');
    const sources = await createD1Repository(binding).loadSources('claude');
    expect(sources.map((source) => source.endpointKey)).toEqual(['$transport', 'resets?limit=100', 'status?']);
    expect(stored.every((item) => !item.candidate)).toBe(true);
  });

  it('accepts equal revision and identical same-ID history/status records, but rejects changed duplicate records', async () => {
    const { db: binding } = await db();
    const raw = syntheticEvent();
    const page = syntheticPage([raw]);
    const status = claudeStatus([raw]);
    const accepted = harness(binding, claudeFetch(page, status));
    expect(await accepted.service.ingestProvider('claude')).toMatchObject({ complete: true });

    const changed = syntheticEvent({ summary: 'SYNTHETIC conflicting status copy' });
    const changedDb = await db();
    const rejected = harness(changedDb.db, claudeFetch(page, claudeStatus([changed])));
    expect(await rejected.service.ingestProvider('claude')).toMatchObject({ complete: false, reason: 'inconsistent_status_record' });
    expect(await createD1Repository(changedDb.db).loadEvents('claude')).toEqual([]);
  });

  it('rejects stats/history count disagreement and preserves no completed baseline on pagination, transport, or schema failures', async () => {
    const cases: Array<{ name: string; fetch: FetchPlan; reason?: string }> = [];
    const raw = syntheticEvent();
    cases.push({ name: 'count disagreement', fetch: claudeFetch(syntheticPage([raw]), claudeStatus([raw], { statsTotal: 2 })), reason: 'unknown_snapshot_completeness' });
    cases.push({ name: 'multi-page walk', fetch: (url) => url.pathname.endsWith('/resets')
      ? { body: syntheticPage([raw], { pagination: { has_more: true, next_cursor: 'next-page', revision_changed: false } }) }
      : { body: claudeStatus([raw]) }, reason: 'duplicate_event' });
    cases.push({ name: 'transport failure', fetch: claudeFetch(syntheticPage([raw]), syntheticStatus(), { statusReply: { status: 503, body: { error: 'synthetic outage' } } }), reason: 'service_unavailable' });
    cases.push({ name: 'schema failure', fetch: claudeFetch({ invalid: true }, syntheticStatus()), reason: 'page_failed' });

    for (const testCase of cases) {
      const { db: binding } = await db();
      const { service } = harness(binding, testCase.fetch);
      const result = await service.ingestProvider('claude');
      expect(result.complete, testCase.name).toBe(false);
      expect(result.baselineCompleted, testCase.name).toBe(false);
      expect(result.reason, testCase.name).toBe(testCase.reason);
      expect(await createD1Repository(binding).loadEvents('claude'), testCase.name).toEqual([]);
      expect(await createD1Repository(binding).loadProvider('claude'), testCase.name).toMatchObject({ baselineCompletedAt: null });
    }
  });

  it('retains first detection time from a valid partial Claude page until the complete baseline commits', async () => {
    const { db: binding } = await db();
    const raw = syntheticEvent({ id: 'seen-before-complete-baseline' });
    let statusCalls = 0;
    const run = harness(binding, (url) => {
      if (url.pathname.endsWith('/resets')) return { body: syntheticPage([raw]) };
      statusCalls += 1;
      return statusCalls === 1
        ? { status: 503, body: { error: 'SYNTHETIC temporary outage' } }
        : { body: claudeStatus([raw]) };
    });

    expect(await run.service.ingestProvider('claude')).toMatchObject({ complete: false, baselineCompleted: false });
    expect(await createD1Repository(binding).loadEvents('claude')).toEqual([]);
    run.time.advance(121_000);
    expect(await run.service.ingestProvider('claude')).toMatchObject({ complete: true, baselineCompleted: true });
    const stored = (await createD1Repository(binding).loadEvents('claude'))[0];
    expect(stored?.detectedAt).toBe(INITIAL);
    expect(stored?.firstDetectedAt).toBe(INITIAL);
  });

  it('isolates provider failure, keeps the healthy provider baseline independent, and suppresses fresh baseline candidates', async () => {
    const { db: binding } = await db();
    const today = '2026-10-22';
    const freshRaw = codexEvent({ id: 'fresh-today', date: today, ts: `${today}T11:30:00Z`, seeded: false,
      delivered_at: `${today}T11:31:00Z`, delivered_source_url: 'https://example.invalid/posts/fresh-delivery' });
    const freshAssessment = await assessment('codex', freshRaw, {
      primarySourceUrl: freshRaw.delivered_source_url!, evidenceUrls: [freshRaw.delivered_source_url!],
    });
    const feed = codexFeed({ events: [freshRaw] });
    const { service } = harness(binding, (url) => url.hostname === 'codexreset.ai'
      ? { body: feed }
      : url.pathname.endsWith('/status') ? { status: 503, body: { failure: true } } : { body: syntheticPage([]) });
    const results = await service.ingestAll({ assessments: [freshAssessment] });
    expect(results[0]).toMatchObject({ status: 'fulfilled', value: { provider: 'claude', complete: false, baselineCompleted: false } });
    expect(results[1]).toMatchObject({ status: 'fulfilled', value: { provider: 'codex', complete: true, baselineCompleted: true } });
    expect(await createD1Repository(binding).loadProvider('claude')).toMatchObject({ baselineCompletedAt: null });
    expect(await createD1Repository(binding).loadProvider('codex')).toMatchObject({ baselineCompletedAt: INITIAL });
    expect((await createD1Repository(binding).loadEvents('codex'))[0]).toMatchObject({ candidate: false, action: 'confirmed_applied' });
    const candidateCount = await binding.prepare('SELECT COUNT(*) AS count FROM publication_candidates').first<{ count: number }>();
    expect(candidateCount?.count).toBe(0);
  });

  it('restores a persisted snapshot for 304 after runtime restart without a new ETag header', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'reset-radar-ingest-restart-'));
    tempDirs.push(dir);
    const firstRuntime = await db({ persist: dir });
    const raw = codexEvent({ id: 'restart-record', date: '2026-10-20' });
    const first = harness(firstRuntime.db, codexFetch(codexFeed({ events: [raw] }), { etag: 'W/"codex-fixture-v1"' }));
    expect(await first.service.ingestProvider('codex')).toMatchObject({ complete: true, baselineCompleted: true });
    await firstRuntime.dispose();
    runtimeHandles.splice(runtimeHandles.indexOf(firstRuntime), 1);

    const secondRuntime = await db({ persist: dir, migrate: false });
    const restarted = harness(secondRuntime.db, (_url, init) => {
      expect(new Headers(init.headers).get('if-none-match')).toBe('W/"codex-fixture-v1"');
      return { status: 304 };
    }, clock('2026-10-22T12:02:00.000Z'));
    restarted.time.advance(301_000);
    const result = await restarted.service.ingestProvider('codex');
    const eventRows = await createD1Repository(secondRuntime.db).loadEvents('codex');
    expect(result).toMatchObject({ complete: true, baselineCompleted: false });
    expect(eventRows[0]?.firstDetectedAt).toBe(INITIAL);
    expect(eventRows[0]?.detectedAt).toBe(INITIAL);
    expect(readPayload(eventRows[0]!.payload).rawKey).toBe(await rawAssessmentKey('codex', raw));
  });

  it.each(['corrupt', 'expired', 'missing'] as const)(
    'does not send validators for %s cache; unsolicited 304 preserves the completed baseline',
    async (scenario) => {
      const feed = codexFeed();
      const { db: binding } = await db();
      const repo = createD1Repository(binding);
      const sourceKey = 'https://codexreset.ai/api/v1/resets.json';
      const seeded = await harness(binding, codexFetch(feed, { etag: 'synthetic-etag' })).service.ingestProvider('codex');
      expect(seeded.complete).toBe(true);
      if (scenario === 'corrupt') {
        await binding.prepare('UPDATE source_state SET snapshot = ?1 WHERE provider = ?2 AND endpoint_key = ?3')
          .bind('{}', 'codex', sourceKey).run();
      } else if (scenario === 'expired') {
        await binding.prepare('UPDATE source_state SET retained_until = 1 WHERE provider = ?1 AND endpoint_key = ?2')
          .bind('codex', sourceKey).run();
      } else {
        await binding.prepare('UPDATE source_state SET snapshot = NULL WHERE provider = ?1 AND endpoint_key = ?2')
          .bind('codex', sourceKey).run();
      }

      const time = clock('2026-10-22T12:05:01.000Z');
      const result = await harness(binding, (_url, init) => {
        expect(new Headers(init.headers).has('if-none-match'), scenario).toBe(false);
        return { status: 304 };
      }, time).service.ingestProvider('codex');
      expect(result).toMatchObject({ complete: false, reason: 'not_modified_without_snapshot' });
      expect(await repo.loadProvider('codex')).toMatchObject({ baselineCompletedAt: INITIAL });
    },
  );

  it('does not complete a baseline from an unsolicited 304 when the D1 database is empty', async () => {
    const { db: empty } = await db();
    const repo = createD1Repository(empty);
    const none = harness(empty, (_url, init) => {
      expect(new Headers(init.headers).has('if-none-match')).toBe(false);
      return { status: 304 };
    });
    expect(await none.service.ingestProvider('codex')).toMatchObject({ complete: false, reason: 'not_modified_without_snapshot' });
    expect(await repo.loadProvider('codex')).toMatchObject({ baselineCompletedAt: null });
  });

  it('isolates endpoint/query validators and persists Retry-After state across a service restart', async () => {
    const { db: binding } = await db();
    const raw = syntheticEvent();
    const page = syntheticPage([raw]);
    const status = claudeStatus([raw]);
    const first = harness(binding, claudeFetch(page, status, { etag: 'history-etag' }));
    expect(await first.service.ingestProvider('claude', { claudeHistory: { limit: 20 } })).toMatchObject({ complete: true });
    const sourceRows = await createD1Repository(binding).loadSources('claude');
    expect(sourceRows.map(({ endpointKey }) => endpointKey)).toEqual(['$transport', 'resets?limit=20', 'status?']);

    first.time.advance(61_000);
    const isolated = harness(binding, (url, init) => {
      const conditional = new Headers(init.headers).get('if-none-match');
      if (url.pathname.endsWith('/resets')) {
        expect(url.search).toBe('?limit=20');
        expect(conditional).toBe('history-etag');
        return { status: 304 };
      }
      expect(url.pathname.endsWith('/status')).toBe(true);
      expect(conditional).toBeNull();
      return { status: 429, headers: { 'retry-after': '120' } };
    }, first.time);
    expect(await isolated.service.ingestProvider('claude', { claudeHistory: { limit: 20 } })).toMatchObject({ complete: false, reason: 'rate_limited' });
    const retryRow = (await createD1Repository(binding).loadSources('claude')).find((row) => row.endpointKey === 'status?');
    expect(retryRow?.retryUntil).toBe(Date.parse(INITIAL) + 61_000 + 120_000);
    expect(retryRow?.failureCount).toBeGreaterThan(0);

    const afterRestart = harness(binding, (url) => {
      expect(url.pathname.endsWith('/status')).toBe(true);
      throw new Error('status must remain backed off');
    }, clock('2026-10-22T12:03:00.999Z'));
    const result = await afterRestart.service.ingestProvider('claude', { claudeHistory: { limit: 20 } });
    expect(result.complete).toBe(false);
    expect(afterRestart.requests.filter((request) => request.url.pathname.endsWith('/status'))).toHaveLength(0);
  });

  it('keeps missing records and scheduled offers without inferring withdrawal or delivery', async () => {
    const { db: binding } = await db();
    const feed = codexFeed({
      events: [codexEvent({ id: 'persisting-row', delivered_at: null })],
      scheduled: codexScheduled({ day: '2026-10-24' }),
    });
    const run = harness(binding, codexFetch(feed));
    await run.service.ingestProvider('codex');
    run.time.advance(301_000);
    const next = harness(binding, codexFetch(codexFeed({ events: [], scheduled: null })), run.time);
    const result = await next.service.ingestProvider('codex');
    expect(result.complete).toBe(true);
    const rows = await createD1Repository(binding).loadEvents('codex');
    expect(rows).toHaveLength(2);
    expect(rows.map((row) => row.action)).not.toContain('withdrawal');
    const retained = rows.find((row) => readPayload(row.payload).record.provenance.externalId === 'persisting-row');
    expect(retained?.action).toBe('needs_review');
    expect(readPayload(retained!.payload).verifiedDelivery).toEqual({ precision: 'unknown' });
  });

  it('reuses assessment and first detection only for byte-equivalent raw records, while material changes create versions', async () => {
    const { db: binding } = await db();
    const raw = codexEvent({ id: 'assessment-bound', delivered_at: '2026-10-21T10:00:00Z', delivered_source_url: 'https://example.invalid/delivery-proof' });
    const local = await assessment('codex', raw, {
      primarySourceUrl: raw.delivered_source_url!, evidenceUrls: [raw.delivered_source_url!],
    });
    const feed = (event: ReturnType<typeof codexEvent>, generated = '2026-10-21T12:00:00Z') => codexFeed({ events: [event], generated_at: generated });
    const first = harness(binding, codexFetch(feed(raw)));
    await first.service.ingestProvider('codex', { assessments: [local] });
    const initiallyStored = (await createD1Repository(binding).loadEvents('codex'))[0]!;
    expect(initiallyStored.action).toBe('confirmed_applied');
    expect(initiallyStored.candidate).toBe(false);

    first.time.advance(301_000);
    const sameRaw = harness(binding, codexFetch(feed({ ...raw }, '2026-10-22T12:01:00Z')), first.time);
    await sameRaw.service.ingestProvider('codex');
    let current = (await createD1Repository(binding).loadEvents('codex'))[0]!;
    expect(current.action).toBe('confirmed_applied');
    expect(current.detectedAt).toBe(INITIAL);
    expect(readPayload(current.payload).reviewedEvidence?.recordKey).toBe(local.recordKey);
    expect(current.transitionId).toBe(initiallyStored.transitionId);

    first.time.advance(301_000);
    const changedRaw = { ...raw, scope: 'SYNTHETIC edited cohort' };
    const changed = harness(binding, codexFetch(feed(changedRaw)), first.time);
    await changed.service.ingestProvider('codex');
    current = (await createD1Repository(binding).loadEvents('codex'))[0]!;
    expect(current.action).toBe('needs_review');
    expect(readPayload(current.payload).reviewedEvidence).toBeNull();
    expect(current.detectedAt).toBe('2026-10-22T12:10:02.000Z');
    expect(current.transitionId).not.toBe(initiallyStored.transitionId);

    first.time.advance(301_000);
    const updatedAssessment = await assessment('codex', changedRaw, {
      primarySourceUrl: changedRaw.delivered_source_url!,
      evidenceUrls: [changedRaw.delivered_source_url!, 'https://example.invalid/posts/second-independent-proof'],
    });
    const reviewedAgain = harness(binding, codexFetch(feed(changedRaw)), first.time);
    await reviewedAgain.service.ingestProvider('codex', { assessments: [updatedAssessment] });
    const reviewed = (await createD1Repository(binding).loadEvents('codex'))[0]!;
    expect(reviewed.action).toBe('confirmed_applied');
    expect(readPayload(reviewed.payload).record.provenance.evidenceUrls).toContain('https://example.invalid/posts/second-independent-proof');
    expect(reviewed.transitionId).not.toBe(current.transitionId);
    const versions = await binding.prepare('SELECT COUNT(*) AS count FROM event_versions WHERE event_id = ?1')
      .bind(initiallyStored.id).first<{ count: number }>();
    expect(versions?.count).toBe(3);
  });

  it('keeps JSON key order and generated, ETag, and summary noise from creating material versions', async () => {
    const { db: binding } = await db();
    const raw = codexEvent({ id: 'noise-stable', kind: 'banked' });
    const run = harness(binding, codexFetch(codexFeed({ events: [raw] }), { etag: 'noise-one' }));
    await run.service.ingestProvider('codex');
    const before = (await createD1Repository(binding).loadEvents('codex'))[0]!;
    const reorderedWithSummaryNoise = Object.fromEntries(
      Object.entries({ ...raw, summary: 'SYNTHETIC display-only change' }).reverse(),
    ) as typeof raw;
    const feed = { ...codexFeed({ events: [reorderedWithSummaryNoise] }), generated_at: '2026-10-22T12:01:00Z' };
    run.time.advance(301_000);
    const next = harness(binding, codexFetch(feed, { etag: 'noise-two' }), run.time);
    await next.service.ingestProvider('codex');
    const after = (await createD1Repository(binding).loadEvents('codex'))[0]!;
    expect(after.materialHash).toBe(before.materialHash);
    expect(after.transitionId).toBe(before.transitionId);
    const versions = await binding.prepare('SELECT COUNT(*) AS count FROM event_versions WHERE event_id = ?1')
      .bind(before.id).first<{ count: number }>();
    expect(versions?.count).toBe(1);
  });

  it('versions a changed historical archive URL while ignoring attribution note display noise', async () => {
    const { db: binding } = await db();
    const raw = codexEvent({ id: 'archive-credit', seeded: true });
    const feed = (archive: string, note: string) => codexFeed({
      events: [raw], attribution: { seed_archive: archive, note },
    });
    const run = harness(binding, codexFetch(feed('https://example.invalid/archive/one', 'SYNTHETIC archive note one')));
    await run.service.ingestProvider('codex');
    let stored = (await createD1Repository(binding).loadEvents('codex'))[0]!;
    const firstTransition = stored.transitionId;
    expect(readPayload(stored.payload).record.provenance.seedArchiveUrl).toBe('https://example.invalid/archive/one');

    run.time.advance(301_000);
    const archiveChanged = harness(binding, codexFetch(feed('https://example.invalid/archive/two', 'SYNTHETIC archive note one')), run.time);
    await archiveChanged.service.ingestProvider('codex');
    stored = (await createD1Repository(binding).loadEvents('codex'))[0]!;
    expect(stored.transitionId).not.toBe(firstTransition);
    expect(readPayload(stored.payload).record.provenance.seedArchiveUrl).toBe('https://example.invalid/archive/two');

    const archiveTransition = stored.transitionId;
    run.time.advance(301_000);
    const noteOnly = harness(binding, codexFetch(feed('https://example.invalid/archive/two', 'SYNTHETIC edited display note')), run.time);
    await noteOnly.service.ingestProvider('codex');
    stored = (await createD1Repository(binding).loadEvents('codex'))[0]!;
    expect(stored.transitionId).toBe(archiveTransition);
    const versions = await binding.prepare('SELECT COUNT(*) AS count FROM event_versions WHERE event_id = ?1')
      .bind(stored.id).first<{ count: number }>();
    expect(versions?.count).toBe(2);
  });

  it('records announcement and later verified delivery as separate transitions', async () => {
    const { db: binding } = await db();
    const announced = codexEvent({ id: 'announce-then-deliver', kind: 'regular', delivered_at: null, delivered_source_url: null });
    const announcedAssessment = await assessment('codex', announced, {
      assertion: 'future_announcement', primarySourceUrl: announced.url, evidenceUrls: [announced.url],
    });
    const first = harness(binding, codexFetch(codexFeed({ events: [announced] })));
    await first.service.ingestProvider('codex', { assessments: [announcedAssessment] });
    let stored = (await createD1Repository(binding).loadEvents('codex'))[0]!;
    expect(stored.action).toBe('announced_future');
    expect(readPayload(stored.payload).verifiedDelivery).toEqual({ precision: 'unknown' });
    const announcementTransition = stored.transitionId;

    first.time.advance(301_000);
    const delivered = { ...announced, delivered_at: '2026-10-22T12:01:30Z', delivered_source_url: 'https://example.invalid/posts/verified-delivery' };
    const deliveryAssessment = await assessment('codex', delivered, {
      assertion: 'applied', primarySourceUrl: delivered.delivered_source_url!, evidenceUrls: [delivered.delivered_source_url!],
    });
    const second = harness(binding, codexFetch(codexFeed({ events: [delivered] })), first.time);
    await second.service.ingestProvider('codex', { assessments: [deliveryAssessment] });
    stored = (await createD1Repository(binding).loadEvents('codex'))[0]!;
    expect(stored.action).toBe('confirmed_applied');
    expect(readPayload(stored.payload).upstreamReportedDelivery).toEqual({ precision: 'exact', at: delivered.delivered_at });
    expect(readPayload(stored.payload).verifiedDelivery).toEqual({ precision: 'exact', at: delivered.delivered_at });
    expect(stored.transitionId).not.toBe(announcementTransition);
    const transitions = await binding.prepare('SELECT action FROM event_versions WHERE event_id = ?1 ORDER BY sequence')
      .bind(stored.id).all<{ action: string }>();
    expect(transitions.results.map((row) => row.action)).toEqual(['announced_future', 'confirmed_applied']);
  });

  it('replays reviewed Claude correction and withdrawal only when linked to their original observed transition', async () => {
    const { db: binding } = await db();
    const time = clock();
    const repository = createD1Repository(binding);
    const revision1 = syntheticEvent({ id: 'correction-withdrawal-replay', event_status: 'confirmed', revision: 1 });
    const page = (raw: ReturnType<typeof syntheticEvent>) => syntheticPage([raw]);
    const status = (raw: ReturnType<typeof syntheticEvent>) => claudeStatus([raw]);
    const baselineAssessment = await assessment('claude', revision1, { assertion: 'applied' });
    await harness(binding, claudeFetch(page(revision1), status(revision1)), time).service
      .ingestProvider('claude', { assessments: [baselineAssessment] });
    let current = (await repository.loadEvents('claude'))[0]!;
    expect(current.action).toBe('confirmed_applied');
    const baselineTransitionId = current.transitionId;

    time.advance(61_000);
    const revision2 = syntheticEvent({
      id: revision1.id, event_status: 'confirmed', revision: 2,
      revised_at: '2026-10-22T12:01:00Z',
      correction: { kind: 'correction', reason: 'SYNTHETIC reviewed correction', at: '2026-10-22T12:01:00Z' },
    });
    const correctionAssessment = await assessment('claude', revision2, {
      assertion: 'correction', previousTransitionId: baselineTransitionId,
    });
    await harness(binding, claudeFetch(page(revision2), status(revision2)), time).service
      .ingestProvider('claude', { assessments: [correctionAssessment] });
    current = (await repository.loadEvents('claude'))[0]!;
    expect(current.action).toBe('correction');
    const correctionTransitionId = current.transitionId;
    expect(correctionTransitionId).not.toBe(baselineTransitionId);

    // A new service instance reads the same durable D1 representation. The matching full raw
    // record may reuse its assessment, while a subsequent replay creates no material version.
    await harness(binding, claudeFetch(page(revision2), status(revision2)), time).service.ingestProvider('claude');
    current = (await repository.loadEvents('claude'))[0]!;
    expect(current.action).toBe('correction');
    expect(current.transitionId).toBe(correctionTransitionId);
    let versions = await binding.prepare('SELECT COUNT(*) AS count FROM event_versions WHERE event_id = ?1')
      .bind(current.id).first<{ count: number }>();
    expect(versions?.count).toBe(2);

    time.advance(61_000);
    const revision3 = syntheticEvent({
      id: revision1.id, event_status: 'retracted', revision: 3,
      revised_at: '2026-10-22T12:02:00Z',
      correction: { kind: 'retraction', reason: 'SYNTHETIC reviewed withdrawal', at: '2026-10-22T12:02:00Z' },
    });
    const withdrawalAssessment = await assessment('claude', revision3, {
      assertion: 'withdrawal', previousTransitionId: correctionTransitionId,
    });
    await harness(binding, claudeFetch(page(revision3), status(revision3)), time).service
      .ingestProvider('claude', { assessments: [withdrawalAssessment] });
    current = (await repository.loadEvents('claude'))[0]!;
    expect(current.action).toBe('withdrawal');
    const withdrawalTransitionId = current.transitionId;
    expect(withdrawalTransitionId).not.toBe(correctionTransitionId);

    await harness(binding, claudeFetch(page(revision3), status(revision3)), time).service.ingestProvider('claude');
    current = (await repository.loadEvents('claude'))[0]!;
    expect(current.action).toBe('withdrawal');
    expect(current.transitionId).toBe(withdrawalTransitionId);
    versions = await binding.prepare('SELECT COUNT(*) AS count FROM event_versions WHERE event_id = ?1')
      .bind(current.id).first<{ count: number }>();
    expect(versions?.count).toBe(3);
  });

  it('allows one concurrent provider ingestion generation to commit', async () => {
    const { db: binding } = await db();
    const raw = codexEvent({ id: 'concurrent-ingest' });
    let arrivals = 0;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const { service } = harness(binding, async () => {
      arrivals += 1;
      if (arrivals === 2) release();
      await gate;
      return { body: codexFeed({ events: [raw] }), headers: { 'cache-control': 'no-store' } };
    });
    const results = await Promise.all([
      service.ingestProvider('codex'), service.ingestProvider('codex'),
    ]);
    expect(results.filter((result) => result.committed)).toHaveLength(1);
    expect(results.filter((result) => !result.committed)).toHaveLength(1);
    expect(results.map((result) => result.reason).filter(Boolean)).toEqual(['concurrent_sync']);
    expect(await createD1Repository(binding).loadProvider('codex')).toMatchObject({ generation: 1 });
    const observations = await binding.prepare('SELECT COUNT(*) AS count FROM observations').first<{ count: number }>();
    expect(observations?.count).toBe(1);
  }, 20_000);
});
