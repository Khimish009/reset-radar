import { describe, expect, it, vi } from 'vitest';
import { createCodexAdapter, createCodexAdapterState } from '../src/providers/codex/adapter';
import { codexFeed, codexEvent, codexScheduled } from './fixtures/codex';
import { createLogger } from '../src/utils/logging';

// SYNTHETIC contract-shaped feeds only; no upstream requests.
describe('Codex unpaginated local snapshot reader', () => {
  function harness() {
    let now = Date.parse('2026-10-21T12:00:00Z');
    const fetch = vi.fn<typeof globalThis.fetch>();
    const state = createCodexAdapterState();
    const deps = { fetch, clock: { now: () => new Date(now) }, logger: createLogger(() => {}) };
    return {
      fetch, state, deps, adapter: createCodexAdapter(deps, state),
      advance: () => { now += 3_600_000; },
      respond: (payload: unknown) => fetch.mockResolvedValueOnce(new Response(JSON.stringify(payload), {
        headers: { 'Content-Type': 'application/json', ETag: '"synthetic"' },
      })),
    };
  }

  it('retains missing rows and scheduled evidence with their original archive credit', async () => {
    const h = harness();
    const event = codexEvent({ seeded: true });
    const scheduled = codexScheduled();
    const baseline = codexFeed({ events: [event], scheduled });
    h.respond(baseline);
    expect((await h.adapter.readHistory()).ok).toBe(true);
    h.advance();
    h.respond(codexFeed({ events: [], scheduled: null, attribution: {
      seed_archive: 'https://example.invalid/changed-archive', note: 'SYNTHETIC changed credit',
    } }));
    const missing = await h.adapter.readHistory();
    expect(missing.ok).toBe(true);
    if (!missing.ok) throw new Error('Expected complete feed');
    expect(missing.snapshot.events).toEqual([]);
    const detectedAt = '2026-10-21T12:00:00.000Z';
    expect(missing.snapshot.retainedMissing).toEqual([{ event, source: baseline.source, attribution: baseline.attribution, detectedAt }]);
    expect(missing.snapshot.retainedScheduled).toEqual([{ scheduled, source: baseline.source, attribution: baseline.attribution, detectedAt }]);
    // No synthesized actions/revisions or inferred withdrawal from disappearance.
    expect(missing.snapshot.retainedMissing[0]?.event).not.toHaveProperty('action');
    h.advance();
    h.respond(baseline);
    const returned = await h.adapter.readHistory();
    expect(returned.ok && returned.snapshot.retainedMissing).toEqual([]);
    expect(returned.ok && returned.snapshot.retainedScheduled).toEqual([]);
    expect(h.fetch).toHaveBeenCalledTimes(3);
  });

  it('preserves last complete snapshot across schema and HTTP failures without treating either as empty', async () => {
    const h = harness();
    h.respond(codexFeed());
    const baseline = await h.adapter.readHistory();
    h.advance();
    h.respond({ schema_version: 999 });
    const rejected = await h.adapter.readHistory();
    expect(rejected).toMatchObject({ ok: false, code: 'invalid_response' });
    expect(!rejected.ok && rejected.lastComplete).toBe(baseline.ok && baseline.snapshot);
    h.advance();
    h.fetch.mockResolvedValueOnce(new Response(null, { status: 503 }));
    const failed = await h.adapter.readHistory();
    expect(!failed.ok && failed.lastComplete).toBe(baseline.ok && baseline.snapshot);
    expect(h.state.lastComplete).toBe(baseline.ok && baseline.snapshot);
  });

  it('coalesces simultaneous reads across adapter instances sharing only the Codex state', async () => {
    const h = harness();
    h.respond(codexFeed());
    const second = createCodexAdapter(h.deps, h.state);
    const results = await Promise.all([h.adapter.readHistory(), second.readHistory()]);
    expect(results.every((result) => result.ok)).toBe(true);
    expect(h.fetch).toHaveBeenCalledTimes(1);
    expect(h.state.http.inFlight.size).toBe(0);
  });

  it('keeps changes to generated_at and ETag as source metadata without inventing revisions', async () => {
    const h = harness();
    h.respond(codexFeed());
    const first = await h.adapter.readHistory();
    h.advance();
    h.respond(codexFeed({ generated_at: '2026-10-21T13:00:00Z' }));
    const next = await h.adapter.readHistory();
    expect(next.ok && next.snapshot.events).toEqual(first.ok && first.snapshot.events);
    expect(next.ok && next.snapshot.eventDetectedAt).toEqual(first.ok && first.snapshot.eventDetectedAt);
    expect(next.ok && next.snapshot).not.toHaveProperty('revision');
    h.advance();
    h.fetch.mockResolvedValueOnce(new Response(null, { status: 304 }));
    const unchanged = await h.adapter.readHistory();
    expect(unchanged.ok && unchanged.origin).toBe('not_modified');
    expect(unchanged.ok && unchanged.snapshot.events).toEqual(next.ok && next.snapshot.events);
  });

  it('timestamps first discovery and changed content separately from source announcement/delivery clocks', async () => {
    const h = harness();
    const scheduled = codexScheduled();
    h.respond(codexFeed({ scheduled }));
    const baseline = await h.adapter.readHistory();
    expect(baseline.ok && baseline.snapshot.eventDetectedAt.get(codexEvent().id)).toBe('2026-10-21T12:00:00.000Z');
    h.advance();
    h.respond(codexFeed({
      events: [codexEvent({ delivered_at: '2026-10-21T12:15:00Z', delivered_source_url: 'https://example.invalid/delivery' })],
      scheduled: { ...scheduled, when_text: 'SYNTHETIC updated display text' },
    }));
    const changed = await h.adapter.readHistory();
    expect(changed.ok && changed.snapshot.eventDetectedAt.get(codexEvent().id)).toBe('2026-10-21T13:00:00.000Z');
    expect(changed.ok && changed.snapshot.scheduledDetectedAt).toBe('2026-10-21T13:00:00.000Z');
    expect(baseline.ok && baseline.snapshot.eventDetectedAt.get(codexEvent().id)).toBe('2026-10-21T12:00:00.000Z');
    const reloaded = createCodexAdapter(h.deps, h.state);
    expect((await reloaded.readHistory()).ok).toBe(true);
    expect(h.fetch).toHaveBeenCalledTimes(2);
    // Local observations survive adapter recreation with the same state, not a process restart.
  });
});
