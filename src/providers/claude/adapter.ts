import type { RuntimeDependencies } from '../../runtime';
import { parseClaudePage, parseClaudeSources, parseClaudeStatus } from './schema';
import type { ClaudeEvent, ClaudePage } from './schema';
import { createClaudeHttpState, createClaudeTransport } from './transport';
import type { ClaudeHttpState } from './transport';

export interface ClaudeHistory {
  /** Complete current counted feed only, not a complete historical archive. */
  events: readonly ClaudeEvent[];
  /** Previously observed records missing from the counted feed, without inferred withdrawal. */
  retainedMissing: readonly ClaudeEvent[];
  meta: ClaudePage['meta'];
  completedAt: string;
}
export interface ClaudeAdapterState {
  http: ClaudeHttpState;
  histories: Map<string, ClaudeHistory>;
}
export function createClaudeAdapterState(): ClaudeAdapterState {
  return { http: createClaudeHttpState(), histories: new Map() };
}

/** Claude history/status adapter; the scheduled dry-run runtime supplies bounded options. */
export function createClaudeAdapter(
  dependencies: RuntimeDependencies,
  state = createClaudeAdapterState(),
) {
  const transport = createClaudeTransport(dependencies, state.http);
  // Serialize full walks; endpoint transport separately coalesces simultaneous GETs.
  const inFlight = new Map<string, ReturnType<typeof walk>>();
  async function walk(limit: number, maxPages: number) {
    const key = `limit=${limit}`;
    const lastComplete = state.histories.get(key) ?? null;
    const fail = (code: string, detail?: unknown) => ({ ok: false as const, code, lastComplete, detail });
    let revision: string | null = null;
    let cursor: string | null = null;
    const cursors = new Set<string>();
    const events = new Map<string, ClaudeEvent>();
    for (let pageNumber = 0; pageNumber < maxPages; pageNumber += 1) {
      const query = new URLSearchParams({ limit: String(limit) });
      if (cursor !== null) query.set('cursor', cursor);
      const response = await transport.get('resets', query, parseClaudePage);
      if (!response.ok) return fail('page_failed', response);
      const page = response.value;
      if (page.pagination.revision_changed || (revision !== null && page.meta.content_revision !== revision)) {
        return fail('inconsistent_revision');
      }
      revision = page.meta.content_revision;
      for (const event of page.data) {
        if (events.has(event.id)) return fail('duplicate_event');
        events.set(event.id, event);
      }
      const { has_more, next_cursor } = page.pagination;
      if (has_more !== (next_cursor !== null)) return fail('inconsistent_pagination');
      if (!has_more) {
        const previous = new Map([
          ...(lastComplete?.retainedMissing ?? []), ...(lastComplete?.events ?? []),
        ].map((e) => [e.id, e]));
        for (const event of events.values()) {
          if (event.revision < (previous.get(event.id)?.revision ?? 0)) return fail('revision_regressed');
        }
        const snapshot: ClaudeHistory = {
          events: [...events.values()], retainedMissing: [...previous.values()].filter((e) => !events.has(e.id)),
          meta: page.meta, completedAt: dependencies.clock.now().toISOString(),
        };
        state.histories.set(key, snapshot);
        return { ok: true as const, snapshot };
      }
      if (page.data.length === 0 || next_cursor === null || !/^[A-Za-z0-9_-]{1,1024}$/.test(next_cursor) || cursors.has(next_cursor)) {
        return fail('invalid_cursor_or_no_progress');
      }
      cursors.add(next_cursor);
      cursor = next_cursor;
    }
    return fail('page_limit');
  }
  return {
    readStatus: () => transport.get('status', new URLSearchParams(), parseClaudeStatus),
    readSources: () => transport.get('sources', new URLSearchParams(), parseClaudeSources),
    readHistory: (options: { limit?: number; maxPages?: number } = {}) => {
      const limit = options.limit ?? 100;
      const maxPages = options.maxPages ?? 100;
      if (!Number.isInteger(limit) || limit < 1 || limit > 100 ||
          !Number.isInteger(maxPages) || maxPages < 1 || maxPages > 100) {
        throw new Error('invalid_claude_pagination_options');
      }
      const key = `${limit}:${maxPages}`;
      const pending = inFlight.get(key);
      if (pending) return pending;
      const promise = walk(limit, maxPages).finally(() => { inFlight.delete(key); });
      inFlight.set(key, promise);
      return promise;
    },
  };
}
