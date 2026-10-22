import { afterEach, describe, expect, it, vi } from 'vitest';
import { createWorker } from '../src/index';
import { createIngestionService } from '../src/services/ingest';
import { createD1Repository } from '../src/storage/d1';
import { createLogger } from '../src/utils/logging';
import { createTestD1 } from './helpers/d1';
import { syntheticEvent, syntheticPage, syntheticStatus } from './fixtures/claude';
import { codexEvent, codexFeed } from './fixtures/codex';

const invocation = { scheduledTime: Date.parse('2026-10-22T12:00:00Z'), cron: '*/5 * * * *' } as ScheduledController;
const liveRuntimes: Array<{ dispose: () => Promise<void> }> = [];
const temporaryPaths: string[] = [];

afterEach(async () => {
  await Promise.all(liveRuntimes.splice(0).map((runtime) => runtime.dispose()));
  const { rm } = await import('node:fs/promises');
  await Promise.all(temporaryPaths.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

async function localD1(options: Parameters<typeof createTestD1>[0] = {}) {
  const runtime = await createTestD1(options);
  liveRuntimes.push(runtime);
  return runtime;
}

type Reply = { status?: number; headers?: Record<string, string>; body?: unknown };
type FetchPlan = (url: URL, init: RequestInit) => Reply | Promise<Reply>;

function asResponse(reply: Reply): Response {
  return new Response(reply.body === undefined ? null : JSON.stringify(reply.body), {
    status: reply.status ?? 200,
    headers: { ...(reply.body === undefined ? {} : { 'content-type': 'application/json' }), ...reply.headers },
  });
}

function claudeStatus(events = [syntheticEvent()]) {
  const status = syntheticStatus();
  return { ...status, data: { ...status.data, latest_reset: events[0] ?? null,
    stats: { ...status.data.stats, total: events.length } } };
}

function validPlan(overrides: Partial<Record<'claude' | 'codex', (url: URL, init: RequestInit) => Reply>> = {}): FetchPlan {
  return (url, init) => {
    if (url.origin === 'https://clauderesets.com') {
      const custom = overrides.claude?.(url, init);
      if (custom) return custom;
      if (url.pathname === '/api/v1/resets' && url.searchParams.get('limit') === '25') {
        return { body: syntheticPage([syntheticEvent()]), headers: { etag: '"stage6-claude-v1"' } };
      }
      if (url.pathname === '/api/v1/status') return { body: claudeStatus() };
    }
    if (url.href === 'https://codexreset.ai/api/v1/resets.json') {
      const custom = overrides.codex?.(url, init);
      if (custom) return custom;
      return { body: codexFeed(), headers: { etag: '"stage6-codex-v1"' } };
    }
    throw new Error(`Blocked unexpected fetch target: ${url.origin}${url.pathname}${url.search}`);
  };
}

function workerHarness(plan: FetchPlan, now: () => Date, lines: string[] = []) {
  const requests: Array<{ url: URL; headers: Headers }> = [];
  const fetch = vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = new URL(String(input));
    const headers = new Headers(init.headers);
    requests.push({ url, headers });
    return asResponse(await plan(url, init));
  }) as unknown as typeof globalThis.fetch;
  const worker = createWorker({ clock: { now }, fetch, logger: createLogger((line) => lines.push(line)) });
  return { worker, fetch, requests, lines };
}

const enabledEnv = (DB: D1Database) => ({
  APP_ENV: 'local', PUBLISH_MODE: 'dry_run', INGEST_MODE: 'dry_run', DB,
} as const);

async function expectNoSendJournal(db: D1Database) {
  expect(await db.prepare('SELECT COUNT(*) AS n FROM synthetic_deliveries').first('n')).toBe(0);
  expect(await db.prepare('SELECT COUNT(*) AS n FROM telegram_simulation_deliveries').first('n')).toBe(0);
  expect(await db.prepare('SELECT COUNT(*) AS n FROM provider_activation WHERE publish_approved_at IS NOT NULL').first('n')).toBe(0);
}

describe('Stage 6 scheduled dry-run runtime with local D1', () => {
  it('ingests both synthetic providers, restores ETags after a D1 restart, and replays without duplicate versions', async () => {
    const { mkdtemp } = await import('node:fs/promises');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const persist = await mkdtemp(join(tmpdir(), 'reset-radar-stage6-restart-'));
    temporaryPaths.push(persist);
    let runtime = await localD1({ persist });
    let milliseconds = Date.parse('2026-10-22T12:00:00Z');
    const lines: string[] = [];
    const run = workerHarness(validPlan(), () => new Date(milliseconds), lines);
    const originalGlobalFetch = globalThis.fetch;
    const globalFetch = vi.spyOn(globalThis, 'fetch');
    try {
      await run.worker.scheduled(invocation, enabledEnv(runtime.db));
      expect(await runtime.db.prepare('SELECT COUNT(*) AS n FROM events').first('n')).toBe(2);
      expect(await runtime.db.prepare('SELECT COUNT(*) AS n FROM event_versions').first('n')).toBe(2);
      expect(await runtime.db.prepare('SELECT COUNT(*) AS n FROM provider_activation WHERE baseline_completed_at IS NOT NULL').first('n')).toBe(2);
      const firstEvents = await runtime.db.prepare('SELECT provider, action, payload FROM events ORDER BY provider')
        .all<{ provider: string; action: string; payload: string }>();
      expect(firstEvents.results).toHaveLength(2);
      for (const event of firstEvents.results) {
        const payload = JSON.parse(event.payload) as { reviewReasons?: unknown[]; rawFacts?: { deliveredAt?: string | null } };
        expect(event.action).toBe('needs_review');
        expect(payload.reviewReasons?.length).toBeGreaterThan(0);
        if (event.provider === 'codex') expect(payload.rawFacts?.deliveredAt).toBeNull();
      }
      const firstLogEvents = lines.map((line) => JSON.parse(line) as { event: string; fields?: { provider?: string } });
      expect(firstLogEvents).toEqual(expect.arrayContaining([
        expect.objectContaining({ event: 'provider_sync_success', fields: { provider: 'claude' } }),
        expect.objectContaining({ event: 'provider_sync_success', fields: { provider: 'codex' } }),
        expect.objectContaining({ event: 'publish_unavailable' }),
      ]));
      expect(run.requests.filter(({ url }) => url.origin === 'https://clauderesets.com' && url.pathname.endsWith('/resets'))
        .every(({ url }) => url.searchParams.get('limit') === '25')).toBe(true);
      await expectNoSendJournal(runtime.db);

      await runtime.dispose();
      runtime = await localD1({ persist, migrate: false });
      milliseconds += 301_000;
      const restarted = workerHarness(validPlan(), () => new Date(milliseconds), lines);
      await restarted.worker.scheduled(invocation, enabledEnv(runtime.db));

      expect(restarted.requests.some(({ url, headers }) => url.origin === 'https://clauderesets.com' &&
        url.pathname.endsWith('/resets') && headers.get('if-none-match') === '"stage6-claude-v1"')).toBe(true);
      expect(restarted.requests.some(({ url, headers }) => url.origin === 'https://codexreset.ai' &&
        headers.get('if-none-match') === '"stage6-codex-v1"')).toBe(true);
      expect(await runtime.db.prepare('SELECT COUNT(*) AS n FROM event_versions').first('n')).toBe(2);
      expect(await runtime.db.prepare('SELECT COUNT(*) AS n FROM sync_runs WHERE status = \'success\' AND complete_snapshot = 1').first('n')).toBeGreaterThanOrEqual(4);
      await expectNoSendJournal(runtime.db);
      expect(globalFetch).not.toHaveBeenCalled();
      expect(lines.every((line) => !/example\.invalid|synthetic.*token|telegram|stack/i.test(line))).toBe(true);
    } finally {
      globalFetch.mockRestore();
      expect(globalThis.fetch).toBe(originalGlobalFetch);
    }
  }, 30_000);

  it('keeps an incomplete four-page Claude walk out of the baseline while Codex can finish', async () => {
    const { db } = await localD1();
    let pageRequests = 0;
    const plan = validPlan({ claude: (url) => {
      if (url.pathname !== '/api/v1/resets') return undefined as never;
      pageRequests += 1;
      const page = syntheticPage([syntheticEvent({ id: `synthetic-page-${pageRequests}` })], {
        pagination: { has_more: true, next_cursor: `page-${pageRequests}`, revision_changed: false },
      });
      return { body: page };
    } });
    const run = workerHarness(plan, () => new Date('2026-10-22T12:00:00Z'));
    await run.worker.scheduled(invocation, enabledEnv(db));

    expect(pageRequests).toBe(4);
    expect(run.requests.filter(({ url }) => url.origin === 'https://clauderesets.com' && url.pathname.endsWith('/resets'))
      .every(({ url }) => url.searchParams.get('limit') === '25')).toBe(true);
    expect(await db.prepare("SELECT baseline_completed_at FROM provider_activation WHERE provider = 'claude'").first('baseline_completed_at')).toBeNull();
    expect(await db.prepare("SELECT COUNT(*) AS n FROM events WHERE provider = 'claude'").first('n')).toBe(0);
    expect(await db.prepare("SELECT last_status FROM provider_activation WHERE provider = 'codex'").first('last_status')).toBe('success');
    await expectNoSendJournal(db);
  }, 20_000);

  it('rejects an oversized Codex feed as a whole snapshot and retains the independent Claude baseline', async () => {
    const { db } = await localD1();
    const excessive = codexFeed({ events: Array.from({ length: 101 }, (_, index) => codexEvent({
      id: `synthetic-over-budget-${index}`, url: `https://example.invalid/events/synthetic-over-budget-${index}`,
    })) });
    const run = workerHarness(validPlan({ codex: () => ({ body: excessive }) }), () => new Date('2026-10-22T12:00:00Z'));
    await run.worker.scheduled(invocation, enabledEnv(db));

    expect(await db.prepare("SELECT baseline_completed_at FROM provider_activation WHERE provider = 'codex'").first('baseline_completed_at')).toBeNull();
    expect(await db.prepare("SELECT COUNT(*) AS n FROM events WHERE provider = 'codex'").first('n')).toBe(0);
    expect(await db.prepare("SELECT last_reason FROM provider_activation WHERE provider = 'codex'").first('last_reason')).toBe('record_budget_exceeded');
    expect(await db.prepare("SELECT baseline_completed_at FROM provider_activation WHERE provider = 'claude'").first('baseline_completed_at')).not.toBeNull();
    await expectNoSendJournal(db);
  }, 20_000);

  it('bounds stored Codex history before network work and preserves all canonical rows', async () => {
    const { db } = await localD1();
    const records = Array.from({ length: 101 }, (_, index) => codexEvent({
      id: `synthetic-stored-over-limit-${index}`,
      url: `https://example.invalid/events/synthetic-stored-over-limit-${index}`,
    }));
    const seed = createIngestionService(createD1Repository(db), {
      clock: { now: () => new Date('2026-10-22T11:00:00Z') },
      fetch: (async (input) => {
        if (String(input) !== 'https://codexreset.ai/api/v1/resets.json') throw new Error('Unexpected seed request');
        return asResponse({ body: codexFeed({ events: records }) });
      }) as typeof globalThis.fetch,
      logger: createLogger(() => undefined),
    });
    expect(await seed.ingestProvider('codex')).toMatchObject({ complete: true, baselineCompleted: true });
    const beforeVersions = await db.prepare('SELECT COUNT(*) AS n FROM event_versions').first('n');
    const beforeObservations = await db.prepare('SELECT COUNT(*) AS n FROM observations').first('n');
    const beforeCodexSources = (await db.prepare(`SELECT endpoint_key, snapshot, etag, checked_at, expires_at,
      retry_until, failure_count, retained_until FROM source_state WHERE provider = 'codex' ORDER BY endpoint_key`)
      .all<Record<string, unknown>>()).results;
    expect(beforeVersions).toBe(101);

    const scheduled = workerHarness(validPlan(), () => new Date('2026-10-22T12:00:00Z'));
    await scheduled.worker.scheduled(invocation, enabledEnv(db));

    expect(scheduled.requests.every(({ url }) => url.origin !== 'https://codexreset.ai')).toBe(true);
    expect(await db.prepare("SELECT COUNT(*) AS n FROM events WHERE provider = 'codex'").first('n')).toBe(101);
    expect(await db.prepare("SELECT COUNT(*) AS n FROM event_versions WHERE event_id IN (SELECT id FROM events WHERE provider = 'codex')").first('n')).toBe(beforeVersions);
    expect(await db.prepare("SELECT COUNT(*) AS n FROM observations WHERE event_id IN (SELECT id FROM events WHERE provider = 'codex')").first('n')).toBe(beforeObservations);
    expect((await db.prepare(`SELECT endpoint_key, snapshot, etag, checked_at, expires_at,
      retry_until, failure_count, retained_until FROM source_state WHERE provider = 'codex' ORDER BY endpoint_key`)
      .all<Record<string, unknown>>()).results).toEqual(beforeCodexSources);
    expect(await db.prepare("SELECT baseline_completed_at FROM provider_activation WHERE provider = 'codex'").first('baseline_completed_at')).not.toBeNull();
    expect(await db.prepare("SELECT last_status FROM provider_activation WHERE provider = 'codex'").first('last_status')).toBe('partial');
    expect(await db.prepare("SELECT last_reason FROM provider_activation WHERE provider = 'codex'").first('last_reason')).toBe('stored_record_limit');
    expect(await db.prepare("SELECT last_status FROM provider_activation WHERE provider = 'claude'").first('last_status')).toBe('success');
    await expectNoSendJournal(db);
  }, 30_000);

  it('preserves a previously committed Claude event through a later incomplete history attempt', async () => {
    const { db } = await localD1();
    let milliseconds = Date.parse('2026-10-22T12:00:00Z');
    const run = workerHarness(validPlan(), () => new Date(milliseconds));
    const env = enabledEnv(db);
    await run.worker.scheduled(invocation, env);
    const before = await db.prepare("SELECT id, action, transition_id FROM events WHERE provider = 'claude'")
      .first<{ id: string; action: string; transition_id: string }>();
    expect(before).not.toBeNull();
    const beforeVersions = await db.prepare("SELECT COUNT(*) AS n FROM event_versions WHERE event_id = ?")
      .bind(before!.id).first('n');

    milliseconds += 301_000;
    const failing = workerHarness(validPlan({ claude: (url) => url.pathname.endsWith('/resets')
      ? { status: 503, body: { synthetic: 'temporary' } } : undefined as never }), () => new Date(milliseconds));
    await failing.worker.scheduled(invocation, env);

    const after = await db.prepare("SELECT id, action, transition_id FROM events WHERE provider = 'claude'")
      .first<{ id: string; action: string; transition_id: string }>();
    expect(after).toEqual(before);
    expect(after?.action).not.toBe('withdrawal');
    expect(await db.prepare("SELECT COUNT(*) AS n FROM event_versions WHERE event_id = ?").bind(before!.id).first('n')).toBe(beforeVersions);
    expect(await db.prepare("SELECT last_status FROM provider_activation WHERE provider = 'claude'").first('last_status')).toBe('partial');
    await expectNoSendJournal(db);
  }, 20_000);

  it('preserves a Claude 429 and makes no provider requests during Retry-After while Codex succeeds', async () => {
    const { db } = await localD1();
    let milliseconds = Date.parse('2026-10-22T12:00:00Z');
    let claudeFailures = 0;
    const plan = validPlan({ claude: (url) => {
      if (url.pathname === '/api/v1/resets') {
        claudeFailures += 1;
        return { status: 429, headers: { 'retry-after': '180' }, body: { synthetic: 'rate-limited' } };
      }
      return undefined as never;
    } });
    const run = workerHarness(plan, () => new Date(milliseconds));
    await run.worker.scheduled(invocation, enabledEnv(db));
    expect(await db.prepare("SELECT last_status FROM provider_activation WHERE provider = 'claude'").first('last_status')).toBe('partial');
    expect(await db.prepare("SELECT last_status FROM provider_activation WHERE provider = 'codex'").first('last_status')).toBe('success');
    const requestCount = run.requests.length;
    milliseconds += 30_000;
    await run.worker.scheduled(invocation, enabledEnv(db));
    expect(run.requests).toHaveLength(requestCount);
    expect(claudeFailures).toBe(1);
    expect(await db.prepare("SELECT failure_count FROM source_state WHERE provider = 'claude' AND endpoint_key = 'resets?limit=25'").first('failure_count')).toBeGreaterThan(0);
    expect(await db.prepare("SELECT last_status FROM provider_activation WHERE provider = 'codex'").first('last_status')).toBe('success');
    await expectNoSendJournal(db);
  }, 20_000);

  it('allows only one CAS winner when two independent worker instances overlap', async () => {
    const { db } = await localD1();
    let arrivals = 0;
    let release!: () => void;
    const barrier = new Promise<void>((resolve) => { release = resolve; });
    const fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      arrivals += 1;
      if (arrivals === 6) release();
      await barrier;
      return asResponse(await validPlan()(url, {}));
    }) as unknown as typeof globalThis.fetch;
    const makeWorker = () => createWorker({
      clock: { now: () => new Date('2026-10-22T12:00:00Z') }, fetch,
      logger: createLogger(() => undefined),
    });
    const env = enabledEnv(db);
    await Promise.all([makeWorker().scheduled(invocation, env), makeWorker().scheduled(invocation, env)]);

    expect(arrivals).toBe(6);
    expect(await db.prepare('SELECT COUNT(*) AS n FROM event_versions').first('n')).toBe(2);
    expect(await db.prepare('SELECT COUNT(*) AS n FROM observations').first('n')).toBe(2);
    expect(await db.prepare('SELECT COUNT(*) AS n FROM sync_runs WHERE complete_snapshot = 1').first('n')).toBe(2);
    expect(await db.prepare('SELECT COUNT(*) AS n FROM provider_activation WHERE generation = 1').first('n')).toBe(2);
    await expectNoSendJournal(db);
  }, 30_000);
});
