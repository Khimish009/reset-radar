import { describe, expect, it, vi } from 'vitest';
import { createClaudeAdapter, createClaudeAdapterState } from '../src/providers/claude/adapter';
import { createLogger } from '../src/utils/logging';
import { syntheticEvent, syntheticMeta, syntheticPage, syntheticSources, syntheticStatus } from './fixtures/claude';

function setup() {
  let now = Date.parse('2026-10-21T12:00:00Z');
  const fetch = vi.fn<typeof globalThis.fetch>();
  const state = createClaudeAdapterState();
  const adapter = createClaudeAdapter({ fetch, clock: { now: () => new Date(now) }, logger: createLogger(() => {}) }, state);
  return { adapter, fetch, state, advance: () => { now += 600_000; } };
}
const json = (v: unknown) => new Response(JSON.stringify(v), { headers: { 'Content-Type': 'application/json' } });
const first = () => syntheticPage([syntheticEvent()], {
  pagination: { has_more: true, next_cursor: 'synthetic_cursor', revision_changed: false },
});

describe('Claude full counted-feed walk — SYNTHETIC contract responses', () => {
  it('walks cursors to the end and keeps status/sources cache independent', async () => {
    const { adapter, fetch } = setup();
    fetch.mockResolvedValueOnce(json(first()))
      .mockResolvedValueOnce(json(syntheticPage([syntheticEvent({ id: 'second' })])))
      .mockResolvedValueOnce(json(syntheticStatus()))
      .mockResolvedValueOnce(json(syntheticSources()));
    const history = await adapter.readHistory({ limit: 1 });
    expect(history.ok && history.snapshot.events.map((e) => e.id)).toEqual(['synthetic-event-001', 'second']);
    expect(String(fetch.mock.calls[1]?.[0])).toContain('cursor=synthetic_cursor');
    expect((await adapter.readStatus()).ok).toBe(true);
    expect((await adapter.readSources()).ok).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(4);
  });

  it.each(['changed_flag', 'changed_meta', 'duplicate', 'loop', 'empty_progress', 'cursor_mismatch', 'invalid_cursor', 'server_error', 'invalid_schema'])(
    'retains the previous complete snapshot when pages fail: %s', async (failure) => {
      const { adapter, fetch, advance } = setup();
      fetch.mockResolvedValueOnce(json(syntheticPage()));
      const baseline = await adapter.readHistory({ limit: 1 });
      expect(baseline.ok).toBe(true);
      advance();
      fetch.mockResolvedValueOnce(json(first()));
      const page = syntheticPage([syntheticEvent({ id: 'second' })]);
      if (failure === 'changed_flag') page.pagination.revision_changed = true;
      if (failure === 'changed_meta') page.meta.content_revision = 'different';
      if (failure === 'duplicate') page.data = [syntheticEvent()];
      if (failure === 'loop') page.pagination = first().pagination;
      if (failure === 'empty_progress') { page.data = []; page.pagination = first().pagination; }
      if (failure === 'cursor_mismatch') page.pagination.has_more = true;
      if (failure === 'invalid_cursor') page.pagination = { has_more: true, next_cursor: 'https://example.invalid', revision_changed: false };
      fetch.mockResolvedValueOnce(failure === 'server_error' ? new Response(null, { status: 503 })
        : failure === 'invalid_schema' ? json({ ...page, unexpected: true }) : json(page));
      const result = await adapter.readHistory({ limit: 1 });
      expect(result.ok).toBe(false);
      if (!result.ok && baseline.ok) expect(result.lastComplete).toEqual(baseline.snapshot);
      expect(fetch).toHaveBeenCalledTimes(3);
    },
  );

  it('does not call partial data a baseline and bounds pages and options', async () => {
    const { adapter, fetch } = setup();
    fetch.mockResolvedValueOnce(json(first()));
    const result = await adapter.readHistory({ maxPages: 1 });
    expect(result).toMatchObject({ ok: false, code: 'page_limit', lastComplete: null });
    expect(() => adapter.readHistory({ limit: 101 })).toThrow('invalid_claude_pagination_options');
    expect(() => adapter.readHistory({ maxPages: 0 })).toThrow('invalid_claude_pagination_options');
  });

  it('retains disappeared rows without generating withdrawal, even over later snapshots', async () => {
    const { adapter, fetch, advance } = setup();
    fetch.mockResolvedValueOnce(json(syntheticPage()));
    await adapter.readHistory();
    for (let i = 0; i < 2; i += 1) {
      advance();
      fetch.mockResolvedValueOnce(json(syntheticPage([], { meta: { ...syntheticMeta(), content_revision: `revision-${i}` } })));
      const result = await adapter.readHistory();
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.snapshot.events).toEqual([]);
        expect(result.snapshot.retainedMissing).toEqual([syntheticEvent()]);
        expect(result.snapshot.retainedMissing[0]?.event_status).toBe('confirmed');
      }
    }
  });

  it('rejects event revision rollback and retains the most recent observed version', async () => {
    const { adapter, fetch, advance } = setup();
    fetch.mockResolvedValueOnce(json(syntheticPage([syntheticEvent({ revision: 2 })])));
    await adapter.readHistory();
    advance();
    fetch.mockResolvedValueOnce(json(syntheticPage()));
    expect(await adapter.readHistory()).toMatchObject({ ok: false, code: 'revision_regressed' });
  });

  it('coalesces concurrent identical history walks and never maps HTTP 200 into a transition', async () => {
    const { adapter, fetch, advance } = setup();
    fetch.mockResolvedValue(json(syntheticPage()));
    const [a, b] = await Promise.all([adapter.readHistory(), adapter.readHistory()]);
    expect(a).toEqual(b);
    expect(fetch).toHaveBeenCalledTimes(1);
    advance();
    fetch.mockResolvedValueOnce(json(syntheticPage([], { meta: { ...syntheticMeta(), generated_at: '2026-10-21T13:00:00Z' } })));
    const next = await adapter.readHistory();
    expect(next.ok && next.snapshot.meta.content_revision).toBe(syntheticMeta().content_revision);
    // Transport completion returns source records, with no publication eligibility or notifications.
    expect(next).not.toHaveProperty('notifications');
  });
});
