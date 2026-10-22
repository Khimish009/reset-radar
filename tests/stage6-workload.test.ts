import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { createWorker } from '../src/index';
import { createLogger } from '../src/utils/logging';
import { createTestD1 } from './helpers/d1';
import { measureD1, verifyD1Metrics } from './helpers/d1-metrics';
import { syntheticEvent, syntheticPage, syntheticStatus } from './fixtures/claude';
import { codexEvent, codexFeed } from './fixtures/codex';

const invocation = { scheduledTime: Date.parse('2026-10-22T12:00:00Z'), cron: '*/5 * * * *' } as ScheduledController;
const runtimes: Array<{ dispose: () => Promise<void> }> = [];
const tempPaths: string[] = [];
const evidence: Array<Record<string, unknown>> = [];
const outputPath = process.env.STAGE6_WORKLOAD_OUTPUT;

afterEach(async () => {
  await Promise.all(runtimes.splice(0).map((runtime) => runtime.dispose()));
  await Promise.all(tempPaths.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

afterAll(async () => {
  if (!outputPath) return;
  const report = {
    format: 'reset-radar-stage6-d1-workload-v1',
    fixtures: { label: 'synthetic contract fixtures', claudeArchivedObservation: 12, codexArchivedObservation: 62,
      archivedObservationDate: '2026-10-21', currentLiveVolume: 'not measured' },
    interpretation: {
      localElapsedMs: 'Miniflare wall time; not billed Worker CPU',
      bindingElapsed: 'localElapsedMs sums execution-call wall intervals and may overlap concurrent operations; handlerElapsedMs is outer wall time',
      prepareBind: 'prepare and bind are binding calls; they do not add SQL executions until run/all/first/raw/batch/exec',
      sqlStatements: 'prepared SQL statements; each batch member counted independently',
      metadata: 'D1 metadata excludes first() and raw() operations, explicitly counted as unavailable',
      rowsRead: 'rowsRead is a lower bound because first() has no metadata; rowsReadMax is the maximum rows_read returned by one metadata-bearing result',
      estimatedBatchBytes: 'SQL UTF-8 plus serialized bind values; approximate local estimate',
    },
    scenarios: evidence,
  };
  await writeFile(resolve(outputPath), `${JSON.stringify(report)}\n`, 'utf8');
  console.log(`STAGE6_WORKLOAD_METRICS ${JSON.stringify(report)}`);
});

async function localD1(options: Parameters<typeof createTestD1>[0] = {}) {
  const runtime = await createTestD1(options);
  runtimes.push(runtime);
  return runtime;
}

type Reply = { status?: number; headers?: Record<string, string>; body?: unknown };
type ReplyPlan = (url: URL, init: RequestInit) => Reply;

function response(reply: Reply): Response {
  return new Response(reply.body === undefined ? null : JSON.stringify(reply.body), {
    status: reply.status ?? 200,
    headers: { ...(reply.body === undefined ? {} : { 'content-type': 'application/json' }), ...reply.headers },
  });
}

function claudeEvents(size: number, revision = 1, start = 1) {
  return Array.from({ length: size }, (_, index) => syntheticEvent({
    id: `synthetic-claude-${index + start}`,
    url: `https://example.invalid/events/synthetic-claude-${index + start}`,
    revised_at: revision > 1 && index === 0 ? '2026-10-22T12:10:00Z' : '2026-10-21T12:00:00Z',
    revision: revision > 1 && index === 0 ? revision : 1,
    summary: revision > 1 && index === 0 ? 'SYNTHETIC revised workload event.' : 'SYNTHETIC workload event.',
    audience: revision > 1 && index === 0
      ? { scope: 'broad', statement: 'SYNTHETIC: paid subscribers', plans: ['pro', 'max'], exclusions: 'SYNTHETIC updated exclusion' }
      : syntheticEvent().audience,
  }));
}

function codexEvents(size: number, revision = 1, start = 1) {
  return Array.from({ length: size }, (_, index) => codexEvent({
    id: `synthetic-codex-${index + start}`,
    url: `https://example.invalid/events/synthetic-codex-${index + start}`,
    date: `2026-10-${String(((index + start - 1) % 28) + 1).padStart(2, '0')}`,
    ts: `2026-10-${String(((index + start - 1) % 28) + 1).padStart(2, '0')}T12:00:00Z`,
    summary: revision > 1 && index === 0 ? 'SYNTHETIC revised workload event.' : 'SYNTHETIC workload event.',
  }));
}

function planFor(claude: ReturnType<typeof claudeEvents>, codex: ReturnType<typeof codexEvents>, options: {
  readonly claudeTag?: string;
  readonly codexTag?: string;
  readonly forceClaudePages?: boolean;
  readonly claudeStatus?: number;
} = {}): ReplyPlan {
  return (url, init) => {
    if (url.origin === 'https://clauderesets.com') {
      if (url.pathname === '/api/v1/status') {
        if (options.claudeStatus) return { status: options.claudeStatus, headers: { 'retry-after': '180' } };
        const tag = options.claudeTag ?? '"synthetic-claude-v1"';
        return init.headers && new Headers(init.headers).get('if-none-match') === tag
          ? { status: 304, headers: { etag: tag } }
          : { body: claudeStatusBody(claude), headers: { etag: tag } };
      }
      if (url.pathname !== '/api/v1/resets' || url.searchParams.get('limit') !== '25') throw new Error('Blocked synthetic Claude URL');
      if (options.claudeStatus === 429) return { status: 429, headers: { 'retry-after': '180' } };
      const tag = options.claudeTag ?? '"synthetic-claude-v1"';
      if (new Headers(init.headers).get('if-none-match') === tag) return { status: 304, headers: { etag: tag } };
      const offset = url.searchParams.has('cursor') ? Number(url.searchParams.get('cursor')) : 0;
      const rows = claude.slice(offset, offset + 25);
      const more = options.forceClaudePages === true || offset + 25 < claude.length;
      return { body: syntheticPage(rows, { pagination: {
        has_more: more, next_cursor: more ? String(offset + 25) : null, revision_changed: false,
      } }), headers: { etag: tag } };
    }
    if (url.href === 'https://codexreset.ai/api/v1/resets.json') {
      const tag = options.codexTag ?? '"synthetic-codex-v1"';
      if (new Headers(init.headers).get('if-none-match') === tag) return { status: 304, headers: { etag: tag } };
      return { body: codexFeed({ events: codex }), headers: { etag: tag } };
    }
    throw new Error(`Blocked non-fixture upstream request: ${url.origin}${url.pathname}`);
  };
}

function claudeStatusBody(events: ReturnType<typeof claudeEvents>) {
  const base = syntheticStatus();
  return { ...base, data: { ...base.data, latest_reset: events[0] ?? null,
    stats: { ...base.data.stats, total: events.length } } };
}

function schedule(plan: ReplyPlan, now: () => number) {
  const requests: Array<{ url: URL; headers: Headers }> = [];
  const lines: string[] = [];
  const fetch = async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = new URL(String(input));
    if ((init.method ?? 'GET') !== 'GET' || init.redirect !== 'error') throw new Error('Synthetic fixture fetch permits only guarded GET');
    requests.push({ url, headers: new Headers(init.headers) });
    return response(plan(url, init));
  };
  const worker = createWorker({ clock: { now: () => new Date(now()) }, fetch, logger: createLogger((line) => lines.push(line)) });
  return { worker, requests, lines };
}

async function measureInvocation(db: D1Database, run: ReturnType<typeof schedule>, _now: () => number) {
  const measured = measureD1(db);
  const started = performance.now();
  await run.worker.scheduled(invocation, {
    APP_ENV: 'local', PUBLISH_MODE: 'dry_run', INGEST_MODE: 'dry_run', DB: measured.db,
  });
  const handlerElapsedMs = performance.now() - started;
  const metrics = measured.snapshot();
  // Inspect via the original binding after measurement. Surrogate row IDs are
  // outside the domain projection; provider generation/history/clocks are in it.
  const state: Record<string, unknown> = {};
  for (const [table, order] of [
    ['provider_activation', 'provider'], ['events', 'id'], ['observations', 'event_id, observation_key'],
    ['event_versions', 'event_id, sequence'], ['publication_candidates', 'transition_id'],
    ['source_state', 'provider, endpoint_key'], ['sync_runs', 'provider, generation'],
    ['commit_guards', 'guard_id'], ['synthetic_deliveries', 'event_id'], ['telegram_simulation_deliveries', 'event_id'],
  ]) {
    const rows = await db.prepare(`SELECT * FROM ${table} ORDER BY ${order}`).all<Record<string, unknown>>();
    state[table!] = rows.results.map((row) => {
      const copy = { ...row };
      delete copy.observation_id;
      delete copy.version_id;
      delete copy.run_id;
      return copy;
    });
  }
  const durableStateSha256 = createHash('sha256').update(JSON.stringify(state)).digest('hex');
  return { metrics, handlerElapsedMs, durableStateSha256 };
}

async function expectNoPublicationOrApprovals(db: D1Database) {
  expect(await db.prepare('SELECT COUNT(*) AS n FROM synthetic_deliveries').first<number>('n')).toBe(0);
  expect(await db.prepare('SELECT COUNT(*) AS n FROM telegram_simulation_deliveries').first<number>('n')).toBe(0);
  expect(await db.prepare('SELECT COUNT(*) AS n FROM provider_activation WHERE publish_approved_at IS NOT NULL').first<number>('n')).toBe(0);
}

function record(name: string, measured: Awaited<ReturnType<typeof measureInvocation>>, data: Record<string, unknown> = {}) {
  evidence.push({ scenario: name, handlerElapsedMs: measured.handlerElapsedMs,
    durableStateSha256: measured.durableStateSha256, ...data, metrics: measured.metrics });
}

describe('Stage 6 D1 workload against real Miniflare binding', () => {
  it('calibrates a two-statement batch and first() without counting inspection or setup', async () => {
    const { db } = await localD1();
    const metrics = await verifyD1Metrics(db);
    expect(metrics.bindingCalls).toMatchObject({ prepare: 3, batch: 1, first: 1 });
    expect(metrics.sqlStatements).toMatchObject({ total: 3, batchStatements: 2 });
    expect(metrics.metadata.unavailableFirstResults).toBe(1);
    evidence.push({ scenario: 'metrics-calibration', metrics });
  }, 15_000);

  it('measures cold archived-size baseline and cached repeat on the same Worker/D1 instance', async () => {
    const { db } = await localD1();
    let now = Date.parse('2026-10-22T12:00:00Z');
    const run = schedule(planFor(claudeEvents(12), codexEvents(62)), () => now);
    const cold = await measureInvocation(db, run, () => now);
    expect(run.lines.some((line) => line.includes('provider_sync_success'))).toBe(true);
    expect(await db.prepare('SELECT COUNT(*) AS n FROM events').first<number>('n')).toBe(74);
    record('cold-small-C12-X62', cold, { records: { claude: 12, codex: 62 }, requests: run.requests.length });
    const beforeRequests = run.requests.length;
    now += 30_000;
    const cached = await measureInvocation(db, run, () => now);
    expect(run.requests).toHaveLength(beforeRequests);
    expect(run.lines.filter((line) => line.includes('provider_sync_success'))).toHaveLength(4);
    record('cached-repeat-same-instance-C12-X62', cached, { requests: run.requests.length - beforeRequests });
    await expectNoPublicationOrApprovals(db);
  }, 30_000);

  it.each([[12, 62], [100, 100]])('measures persistent D1 restart and conditional 304 responses C%i/X%i', async (claudeSize, codexSize) => {
    const persist = await mkdtemp(join(tmpdir(), 'reset-radar-stage6-workload-restart-'));
    tempPaths.push(persist);
    let runtime = await localD1({ persist });
    let now = Date.parse('2026-10-22T12:00:00Z');
    const plan = planFor(claudeEvents(claudeSize), codexEvents(codexSize));
    const firstRun = schedule(plan, () => now);
    const first = await measureInvocation(runtime.db, firstRun, () => now);
    record(`restart-seed-C${claudeSize}-X${codexSize}`, first, { records: { claude: claudeSize, codex: codexSize } });
    await runtime.dispose();
    runtime = await localD1({ persist, migrate: false });
    now += 301_000;
    const restarted = schedule(plan, () => now);
    const second = await measureInvocation(runtime.db, restarted, () => now);
    expect(restarted.requests.length).toBeGreaterThan(0);
    expect(restarted.requests.every(({ headers }) => headers.get('if-none-match') !== null)).toBe(true);
    expect(await runtime.db.prepare('SELECT COUNT(*) AS n FROM event_versions').first<number>('n')).toBe(claudeSize + codexSize);
    record(`persistent-restart-304-C${claudeSize}-X${codexSize}`, second, { requests: restarted.requests.length,
      conditionalRequests: restarted.requests.filter(({ headers }) => headers.get('if-none-match') !== null).length });
    await expectNoPublicationOrApprovals(runtime.db);
  }, 30_000);

  it('characterizes a fresh future announcement during complete and partial bootstrap without automatic evidence approval', async () => {
    const visibleAt = Date.parse('2026-10-22T12:00:00Z');
    const future = syntheticEvent({ id: 'synthetic-fresh-future', event_status: 'announced', effective_at: null,
      announced_at: '2026-10-22T12:00:00Z', utc_day: '2026-10-22',
      first_published_at: '2026-10-22T12:00:00Z', revised_at: '2026-10-22T12:00:00Z' });
    for (const partial of [false, true]) {
      const { db } = await localD1();
      const events = [future, ...claudeEvents(partial ? 99 : 11)];
      const run = schedule(planFor(events, codexEvents(62), { forceClaudePages: partial }), () => visibleAt);
      const measured = await measureInvocation(db, run, () => visibleAt);
      const rows = await db.prepare('SELECT action, detected_at, payload FROM events WHERE provider = ?1 AND external_id = ?2')
        .bind('claude', future.id).all<{ action: string; detected_at: string; payload: string }>();
      expect(rows.results).toHaveLength(partial ? 0 : 1);
      if (!partial) {
        expect(rows.results[0]?.action).toBe('needs_review');
        expect(rows.results[0]?.detected_at).toBe(new Date(visibleAt).toISOString());
        expect(JSON.parse(rows.results[0]!.payload)).toMatchObject({ verifiedDelivery: { precision: 'unknown' } });
      }
      expect(await db.prepare("SELECT baseline_completed_at FROM provider_activation WHERE provider = 'claude'").first('baseline_completed_at'))
        .toBe(partial ? null : new Date(visibleAt).toISOString());
      expect(await db.prepare('SELECT COUNT(*) AS n FROM publication_candidates').first('n')).toBe(0);
      await expectNoPublicationOrApprovals(db);
      record(partial ? 'fresh-future-partial-history-gap' : 'fresh-future-complete-bootstrap', measured, {
        syntheticSourceVisibleAt: new Date(visibleAt).toISOString(),
        canonicalDetectedAt: rows.results[0]?.detected_at ?? null,
        classification: partial ? 'no partial canonical write' : 'needs_review: no runtime assessment input',
        sourceRelativeLatency: 'not inferred from injected clock or local wall time; no SLA sample',
      });
    }
  }, 30_000);

  it('measures material updates while retaining one immutable version per observed change', async () => {
    const { db } = await localD1();
    let now = Date.parse('2026-10-22T12:00:00Z');
    let revision = 1;
    const firstWorker = schedule(planFor(claudeEvents(12), codexEvents(62)), () => now);
    const first = await measureInvocation(db, firstWorker, () => now);
    record('material-update-seed-C12-X62', first, { records: { claude: 12, codex: 62 } });
    const versionsBefore = await db.prepare('SELECT COUNT(*) AS n FROM event_versions').first<number>('n');
    now += 301_000;
    revision += 1;
    const updated = schedule(planFor(claudeEvents(12, revision), codexEvents(62), { claudeTag: '"synthetic-claude-v2"' }), () => now);
    const second = await measureInvocation(db, updated, () => now);
    expect(await db.prepare('SELECT COUNT(*) AS n FROM event_versions').first<number>('n')).toBe((versionsBefore ?? 0) + 1);
    record('material-update-C12-X62', second, { newVersions: 1, changedProvider: 'claude' });
    await expectNoPublicationOrApprovals(db);
  }, 30_000);

  it('measures partial four-page baseline rejection, 429 and backoff without losing independent Codex success', async () => {
    const { db } = await localD1();
    let now = Date.parse('2026-10-22T12:00:00Z');
    const partial = schedule(planFor(claudeEvents(100), codexEvents(62), { forceClaudePages: true }), () => now);
    const first = await measureInvocation(db, partial, () => now);
    expect(await db.prepare("SELECT last_status FROM provider_activation WHERE provider = 'claude'").first('last_status')).toBe('partial');
    expect(await db.prepare("SELECT last_status FROM provider_activation WHERE provider = 'codex'").first('last_status')).toBe('success');
    expect(await db.prepare("SELECT baseline_completed_at FROM provider_activation WHERE provider = 'claude'").first('baseline_completed_at')).toBeNull();
    record('partial-four-page-C100-X62', first, { requests: partial.requests.length });

    now += 301_000;
    const throttled = schedule(planFor(claudeEvents(12), codexEvents(62), { claudeStatus: 429 }), () => now);
    const rateLimited = await measureInvocation(db, throttled, () => now);
    expect(await db.prepare("SELECT last_status FROM provider_activation WHERE provider = 'claude'").first('last_status')).toBe('partial');
    record('429-C12-X62', rateLimited, { requests: throttled.requests.length });
    const before = throttled.requests.length;
    now += 30_000;
    const backoff = await measureInvocation(db, throttled, () => now);
    expect(throttled.requests).toHaveLength(before);
    record('retry-after-backoff-C12-X62', backoff, { requests: 0 });
    await expectNoPublicationOrApprovals(db);
  }, 45_000);

  it.each([99, 100])('measures complete near-capacity snapshots with %i events per provider', async (size) => {
    const { db } = await localD1();
    let now = Date.parse('2026-10-22T12:00:00Z');
    const run = schedule(planFor(claudeEvents(size), codexEvents(size)), () => now);
    const measured = await measureInvocation(db, run, () => Date.parse('2026-10-22T12:00:00Z'));
    expect(await db.prepare("SELECT COUNT(*) AS n FROM provider_activation WHERE last_status = 'success'").first<number>('n')).toBe(2);
    expect(await db.prepare("SELECT provider, COUNT(*) AS n FROM events GROUP BY provider ORDER BY provider").all()).toMatchObject({
      results: [{ provider: 'claude', n: size }, { provider: 'codex', n: size }],
    });
    record(`near-capacity-C${size}-X${size}`, measured, { records: { claude: size, codex: size }, requests: run.requests.length });
    const versions = await db.prepare('SELECT COUNT(*) AS n FROM event_versions').first<number>('n');
    const requestCount = run.requests.length;
    now += 30_000;
    const cached = await measureInvocation(db, run, () => now);
    expect(run.requests).toHaveLength(requestCount);
    expect(await db.prepare('SELECT COUNT(*) AS n FROM event_versions').first<number>('n')).toBe(versions);
    record(`near-capacity-cached-C${size}-X${size}`, cached, { incomingRecords: { claude: size, codex: size },
      storedEvents: { claude: size, codex: size }, requests: 0 });
    await expectNoPublicationOrApprovals(db);
  }, 35_000);

  it('measures accumulated 101-row union after a 100-row baseline and preserves prior facts', async () => {
    const { db } = await localD1();
    let now = Date.parse('2026-10-22T12:00:00Z');
    const initial = schedule(planFor(claudeEvents(100), codexEvents(100)), () => now);
    const baseline = await measureInvocation(db, initial, () => now);
    expect(await db.prepare("SELECT COUNT(*) AS n FROM provider_activation WHERE baseline_completed_at IS NOT NULL").first<number>('n')).toBe(2);
    record('capacity-100-each-baseline', baseline, { records: { claude: 100, codex: 100 } });
    const before = await db.prepare(`SELECT
      (SELECT COUNT(*) FROM events) AS events,
      (SELECT COUNT(*) FROM event_versions) AS versions,
      (SELECT COUNT(*) FROM observations) AS observations`).first<{ events: number; versions: number; observations: number }>();
    expect(before).toEqual({ events: 200, versions: 200, observations: 200 });

    now += 301_000;
    const changed = schedule(planFor(claudeEvents(100, 1, 2), codexEvents(100, 1, 2), {
      claudeTag: '"synthetic-claude-v2"', codexTag: '"synthetic-codex-v2"',
    }), () => now);
    const shifted = await measureInvocation(db, changed, () => now);
    expect(await db.prepare('SELECT COUNT(*) AS n FROM events').first<number>('n')).toBe(202);
    expect(await db.prepare("SELECT COUNT(*) AS n FROM provider_activation WHERE baseline_completed_at IS NOT NULL").first<number>('n')).toBe(2);
    record('capacity-shifted-window-stores-union101-each', shifted,
      { incomingRecords: { claude: 100, codex: 100, ids: '2..101' }, storedEvents: { claude: 101, codex: 101 } });

    const beforeLimit = await db.prepare(`SELECT
      (SELECT COUNT(*) FROM events) AS events,
      (SELECT COUNT(*) FROM event_versions) AS versions,
      (SELECT COUNT(*) FROM observations) AS observations`).first();
    const priorFacts = await db.prepare('SELECT id, material_hash, transition_id, observation_key, payload, last_observed_at FROM events ORDER BY id').all();
    const priorVersions = await db.prepare('SELECT event_id, sequence, transition_id, material_hash, payload FROM event_versions ORDER BY transition_id').all();
    const priorObservations = await db.prepare('SELECT event_id, observation_key, detected_at, assessment_key, upstream_revision, payload FROM observations ORDER BY observation_id').all();
    const priorSources = await db.prepare('SELECT provider, endpoint_key, snapshot, etag, checked_at, expires_at, retry_until, failure_count, retained_until FROM source_state ORDER BY provider, endpoint_key').all();
    const priorBaselines = await db.prepare('SELECT provider, baseline_completed_at FROM provider_activation ORDER BY provider').all();
    now += 301_000;
    const beyondStorage = schedule(planFor(claudeEvents(12), codexEvents(62)), () => now);
    const storedLimit = await measureInvocation(db, beyondStorage, () => now);
    expect(beyondStorage.requests).toHaveLength(0);
    expect((await db.prepare('SELECT id, material_hash, transition_id, observation_key, payload, last_observed_at FROM events ORDER BY id').all()).results).toEqual(priorFacts.results);
    expect((await db.prepare('SELECT event_id, sequence, transition_id, material_hash, payload FROM event_versions ORDER BY transition_id').all()).results).toEqual(priorVersions.results);
    expect((await db.prepare('SELECT event_id, observation_key, detected_at, assessment_key, upstream_revision, payload FROM observations ORDER BY observation_id').all()).results).toEqual(priorObservations.results);
    expect((await db.prepare('SELECT provider, endpoint_key, snapshot, etag, checked_at, expires_at, retry_until, failure_count, retained_until FROM source_state ORDER BY provider, endpoint_key').all()).results).toEqual(priorSources.results);
    expect((await db.prepare('SELECT provider, baseline_completed_at FROM provider_activation ORDER BY provider').all()).results).toEqual(priorBaselines.results);
    expect(await db.prepare(`SELECT
      (SELECT COUNT(*) FROM events) AS events,
      (SELECT COUNT(*) FROM event_versions) AS versions,
      (SELECT COUNT(*) FROM observations) AS observations`).first()).toEqual(beforeLimit);
    expect(storedLimit.metrics.metadata.rowsReadMax).toBe(202);
    record('stored-history-101-each-preserved-no-network', storedLimit, { storedEvents: { claude: 101, codex: 101 },
      requests: 0, preserved: { events: 202, versions: priorVersions.results.length, observations: priorObservations.results.length } });
    await expectNoPublicationOrApprovals(db);
  }, 35_000);
});
