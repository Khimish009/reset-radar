import type { RuntimeDependencies } from '../../runtime';
import type { CodexEvent, CodexFeed, CodexScheduled } from './schema';
import { codexAssessmentKey } from './mapping';
import { createCodexHttpState, createCodexTransport } from './transport';
import type { CodexHttpState, CodexTransportOptions } from './transport';

type Context = Pick<CodexFeed, 'source' | 'attribution'>;
interface Observation { recordKey: string; detectedAt: string }
export interface CodexHistory extends CodexFeed {
  /** Previously observed rows absent from this snapshot; absence is not withdrawal. */
  retainedMissing: readonly (Context & { event: CodexEvent; detectedAt: string })[];
  /** Previously observed scheduled posts absent now; no inferred delivery or withdrawal. */
  retainedScheduled: readonly (Context & { scheduled: CodexScheduled; detectedAt: string })[];
  /** First local observation of each current row's content, independent of announcement time. */
  eventDetectedAt: ReadonlyMap<string, string>;
  scheduledDetectedAt: string | null;
  checkedAt: string;
}
export interface CodexAdapterState {
  http: CodexHttpState;
  lastComplete: CodexHistory | null;
  observations: { events: Map<string, Observation>; scheduled: Map<string, Observation> };
}
export function createCodexAdapterState(): CodexAdapterState {
  return {
    http: createCodexHttpState(), lastComplete: null,
    observations: { events: new Map(), scheduled: new Map() },
  };
}

/** Local source reader only. The Worker handlers never instantiate this adapter. */
export function createCodexAdapter(
  dependencies: RuntimeDependencies,
  state = createCodexAdapterState(),
  options: CodexTransportOptions = {},
) {
  const transport = createCodexTransport(dependencies, state.http, options);
  function observe(raw: CodexEvent | CodexScheduled, id: string, entries: Map<string, Observation>, at: string): string {
    const recordKey = codexAssessmentKey(raw);
    const previous = entries.get(id);
    if (previous?.recordKey === recordKey) return previous.detectedAt;
    entries.set(id, { recordKey, detectedAt: at });
    return at;
  }
  return {
    async readHistory() {
      const response = await transport.get();
      if (!response.ok) return { ...response, lastComplete: state.lastComplete };
      const feed = response.value;
      const detectedAt = dependencies.clock.now().toISOString();
      const previous = state.lastComplete;
      const oldEvents = new Map((previous?.retainedMissing ?? []).map((item) => [item.event.id, item]));
      const oldScheduled = new Map((previous?.retainedScheduled ?? []).map((item) => [item.scheduled.url, item]));
      if (previous) {
        const context = { source: previous.source, attribution: previous.attribution };
        for (const event of previous.events) oldEvents.set(event.id, {
          ...context, event, detectedAt: previous.eventDetectedAt.get(event.id)!,
        });
        if (previous.scheduled) {
          oldScheduled.set(previous.scheduled.url, {
            ...context, scheduled: previous.scheduled, detectedAt: previous.scheduledDetectedAt!,
          });
        }
      }
      for (const event of feed.events) oldEvents.delete(event.id);
      if (feed.scheduled) oldScheduled.delete(feed.scheduled.url);
      const snapshot: CodexHistory = {
        ...feed,
        retainedMissing: [...oldEvents.values()],
        retainedScheduled: [...oldScheduled.values()],
        eventDetectedAt: new Map(feed.events.map((event) => [event.id,
          observe(event, event.id, state.observations.events, detectedAt)])),
        scheduledDetectedAt: feed.scheduled === null ? null
          : observe(feed.scheduled, feed.scheduled.url, state.observations.scheduled, detectedAt),
        checkedAt: response.checkedAt,
      };
      state.lastComplete = snapshot;
      return { ok: true as const, snapshot, origin: response.origin };
    },
  };
}
