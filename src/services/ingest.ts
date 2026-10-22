import type { Provider } from '../domain/event';
import {
  canonicalJson, codexStorageIdentity, digest, normalizeClaude, normalizeCodexEvent, normalizeCodexScheduled, rawAssessmentKey,
} from '../domain/normalization';
import type { DurableEventPayload, LocalAssessment, NormalizeOptions } from '../domain/normalization';
import { createClaudeAdapter } from '../providers/claude/adapter';
import type { ClaudeEvent, ClaudeStatus } from '../providers/claude/schema';
import { parseClaudePage, parseClaudeStatus } from '../providers/claude/schema';
import { createClaudeHttpState } from '../providers/claude/transport';
import type { ClaudeHttpState } from '../providers/claude/transport';
import { parseCodexFeed } from '../providers/codex/schema';
import type { CodexEvent, CodexFeed, CodexScheduled } from '../providers/codex/schema';
import { CODEX_FEED_URL, createCodexHttpState, createCodexTransport } from '../providers/codex/transport';
import type { RuntimeDependencies } from '../runtime';
import type { D1Repository, LoadedEvent, SourceState, SourceStateInput, StoredEventInput } from '../storage/types';

const CACHE_RETENTION_MS = 24 * 60 * 60_000;
const MAX_CACHE_ENDPOINTS = 128;
const TRANSPORT_KEY = '$transport';
type HttpState = Pick<ClaudeHttpState, 'entries' | 'retryUntil' | 'failureCounts' | 'throttledUntil'>;
interface CacheSnapshot {
  version: 1;
  provider: Provider;
  endpointKey: string;
  digest: string;
  value: unknown;
  recordDetections: Record<string, string>;
}

/** Explicit trusted local input only; no assessment endpoint or automatic evidence review. */
export interface IngestOptions {
  readonly assessments?: readonly LocalAssessment[];
  readonly claudeHistory?: { readonly limit?: number; readonly maxPages?: number };
  /** Optional caller-owned snapshot cap. Unset preserves the direct service contract. */
  readonly maxRecords?: number;
}
export interface IngestResult {
  readonly provider: Provider;
  readonly committed: boolean;
  readonly complete: boolean;
  readonly baselineCompleted: boolean;
  readonly reason: string | null;
}

function parseCached(provider: Provider, key: string, value: unknown): unknown {
  if (provider === 'codex') {
    if (key !== CODEX_FEED_URL) throw new Error('invalid_cache_scope');
    return parseCodexFeed(value);
  }
  if (key === 'status?') return parseClaudeStatus(value);
  const query = new URLSearchParams(key.slice('resets?'.length));
  const limit = query.get('limit');
  const cursor = query.get('cursor');
  query.sort();
  if (!key.startsWith('resets?') || `resets?${query}` !== key ||
      !limit || !/^\d+$/.test(limit) || Number(limit) < 1 || Number(limit) > 100 ||
      [...query.keys()].some((k) => k !== 'limit' && k !== 'cursor') ||
      query.getAll('limit').length !== 1 || query.getAll('cursor').length > 1 ||
      (cursor !== null && !/^[A-Za-z0-9_-]{1,1024}$/.test(cursor))) {
    throw new Error('invalid_cache_scope');
  }
  return parseClaudePage(value);
}

/** Validators are restored only alongside a schema-validated, scope-bound representation. */
async function restoreHttp(provider: Provider, rows: readonly SourceState[], state: HttpState, now: number) {
  const detections = new Map<string, string>();
  for (const row of rows) {
    if (row.endpointKey === TRANSPORT_KEY) {
      state.throttledUntil = row.retryUntil;
      continue;
    }
    if (row.retryUntil > now) state.retryUntil.set(row.endpointKey, row.retryUntil);
    if (row.failureCount > 0) state.failureCounts.set(row.endpointKey, row.failureCount);
    if (row.snapshot === null || row.retainedUntil <= now || row.checkedAt === null) continue;
    try {
      const snapshot = JSON.parse(row.snapshot) as CacheSnapshot;
      if (snapshot.version !== 1 || snapshot.provider !== provider || snapshot.endpointKey !== row.endpointKey ||
          snapshot.digest !== await digest(snapshot.value)) continue;
      const value = parseCached(provider, row.endpointKey, snapshot.value);
      if (snapshot.recordDetections && typeof snapshot.recordDetections === 'object') {
        for (const [key, at] of Object.entries(snapshot.recordDetections)) {
          if (/^[a-f0-9]{64}$/.test(key) && typeof at === 'string' && Number.isFinite(Date.parse(at))) {
            const earlier = detections.get(key);
            if (!earlier || at < earlier) detections.set(key, at);
          }
        }
      }
      state.entries.set(row.endpointKey, {
        value, checkedAt: row.checkedAt, expiresAt: Math.min(row.expiresAt, row.retainedUntil),
        ...(row.etag ? { etag: row.etag } : {}),
      });
    } catch { /* Corrupt/expired cache is unusable; never send its validator. */ }
  }
  return detections;
}

function cachedRecords(provider: Provider, key: string, value: unknown): (ClaudeEvent | CodexEvent | CodexScheduled)[] {
  const parsed = parseCached(provider, key, value);
  if (provider === 'codex') {
    const feed = parsed as CodexFeed;
    return [...feed.events, ...(feed.scheduled ? [feed.scheduled] : [])];
  }
  return key === 'status?' ? statusEvents(parsed as ClaudeStatus) : (parsed as ReturnType<typeof parseClaudePage>).data;
}

async function saveHttp(provider: Provider, rows: readonly SourceState[], state: HttpState, now: number, detections: Map<string, string>) {
  const old = new Map(rows.map((row) => [row.endpointKey, row]));
  const keys = new Set([...old.keys(), ...state.entries.keys(), ...state.retryUntil.keys()]);
  keys.delete(TRANSPORT_KEY);
  const candidates = [...state.entries].sort((a, b) => b[1].checkedAt.localeCompare(a[1].checkedAt));
  const keep = new Set(candidates.slice(0, MAX_CACHE_ENDPOINTS).map(([key]) => key));
  const result: SourceStateInput[] = [];
  for (const key of keys) {
    const entry = keep.has(key) ? state.entries.get(key) : undefined;
    const previous = old.get(key);
    const retainedUntil = entry ? previous?.snapshot && previous.retainedUntil > now && previous.checkedAt === entry.checkedAt
      ? previous.retainedUntil : now + CACHE_RETENTION_MS : 0;
    const usable = entry && retainedUntil > now;
    const recordDetections: Record<string, string> = {};
    if (usable) {
      for (const raw of cachedRecords(provider, key, entry.value)) {
        const rawKey = await rawAssessmentKey(provider, raw);
        recordDetections[rawKey] = detections.get(rawKey) ?? entry.checkedAt;
      }
    }
    result.push({
      endpointKey: key,
      snapshot: usable ? canonicalJson({
        version: 1, provider, endpointKey: key, value: entry.value, digest: await digest(entry.value), recordDetections,
      } satisfies CacheSnapshot) : null,
      etag: usable ? entry.etag ?? null : null,
      checkedAt: entry?.checkedAt ?? previous?.checkedAt ?? null,
      expiresAt: usable ? Math.min(entry.expiresAt, retainedUntil) : 0,
      retryUntil: state.retryUntil.get(key) ?? 0,
      failureCount: state.failureCounts.get(key) ?? 0,
      retainedUntil: usable ? retainedUntil : 0,
    });
  }
  result.push({
    endpointKey: TRANSPORT_KEY, snapshot: null, etag: null, checkedAt: null, expiresAt: 0,
    retryUntil: state.throttledUntil, failureCount: 0, retainedUntil: 0,
  });
  return result;
}

function payload(event: LoadedEvent): DurableEventPayload {
  return JSON.parse(event.payload) as DurableEventPayload;
}

async function normalizationOptions(
  provider: Provider, raw: ClaudeEvent | CodexEvent | CodexScheduled,
  previous: LoadedEvent | undefined, assessments: readonly LocalAssessment[], now: Date,
  detections: ReadonlyMap<string, string>,
  repository: D1Repository,
): Promise<NormalizeOptions> {
  const key = await rawAssessmentKey(provider, raw);
  const old = previous ? payload(previous) : null;
  // A supplied assessment (even rejected) replaces an older one for this raw record.
  const assessment = assessments.find((item) => item.recordKey === key) ??
    (old?.rawKey === key ? old.reviewedEvidence ?? undefined : undefined);
  const linked = previous && assessment?.previousTransitionId &&
    (assessment.assertion === 'correction' || assessment.assertion === 'withdrawal')
    ? await repository.loadVersion(previous.id, assessment.previousTransitionId) : null;
  const evidencePrevious = linked ?? previous;
  return {
    now, detectedAt: previous && old?.rawKey === key ? previous.detectedAt : detections.get(key) ?? now.toISOString(),
    ...(assessment ? { assessment } : {}), ...(evidencePrevious ? { previous: evidencePrevious } : {}),
  };
}

function withSourceTimes(event: StoredEventInput, generatedAt: string, reviewedAt: string | null): StoredEventInput {
  return {
    ...event,
    payload: canonicalJson({ ...JSON.parse(event.payload) as DurableEventPayload,
      sourceGeneratedAt: generatedAt, sourceReviewedAt: reviewedAt }),
  };
}

function statusEvents(status: ClaudeStatus): ClaudeEvent[] {
  const data = status.data;
  return [data.latest_reset, ...(data.latest_ambiguous ?? []), data.announced_reset, ...data.reset_offers]
    .filter((event): event is ClaudeEvent => event !== null);
}

/** Provider ingestion used by the opt-in scheduled dry-run runtime and local callers. */
export function createIngestionService(repository: D1Repository, dependencies: RuntimeDependencies) {
  async function ingestProvider(provider: Provider, options: IngestOptions = {}): Promise<IngestResult> {
    if (options.maxRecords !== undefined &&
        (!Number.isInteger(options.maxRecords) || options.maxRecords < 1 || options.maxRecords > 100)) {
      throw new Error('invalid_record_budget');
    }
    const activation = await repository.loadProvider(provider);
    const eventLimit = options.maxRecords === undefined ? undefined : options.maxRecords + 1;
    const [previous, sources] = await Promise.all([
      repository.loadEvents(provider, eventLimit), repository.loadSources(provider),
    ]);
    if (options.maxRecords !== undefined && previous.length > options.maxRecords) {
      const at = dependencies.clock.now().toISOString();
      const result = await repository.commitSnapshot({
        provider, expectedGeneration: activation.generation, at, complete: false, events: [], sources,
        status: 'partial', reason: 'stored_record_limit',
      });
      return {
        provider, complete: false, committed: result.committed,
        baselineCompleted: result.baselineCompleted,
        reason: result.committed ? 'stored_record_limit' : 'concurrent_sync',
      };
    }
    const assessments = options.assessments ?? [];
    if (new Set(assessments.map((a) => a.recordKey)).size !== assessments.length) {
      throw new Error('duplicate_local_assessment');
    }
    const state = provider === 'claude' ? createClaudeHttpState() : createCodexHttpState();
    const detections = await restoreHttp(provider, sources, state, dependencies.clock.now().getTime());
    let complete = false;
    let reason: string | null = null;
    const events: StoredEventInput[] = [];
    const oldById = new Map(previous.map((event) => [event.externalId, event]));
    if (provider === 'codex') {
      // The feed contract is unpaginated; no union/fallback to the alternate tracker.
      const response = await createCodexTransport(dependencies, state as ReturnType<typeof createCodexHttpState>).get();
      if (!response.ok) reason = response.code;
      else {
        const feed: CodexFeed = response.value;
        const recordCount = feed.events.length + (feed.scheduled ? 1 : 0);
        if (options.maxRecords !== undefined && recordCount > options.maxRecords) {
          reason = 'record_budget_exceeded';
        } else {
          const now = dependencies.clock.now();
          for (const raw of feed.events) {
            const opts = await normalizationOptions(provider, raw, oldById.get(codexStorageIdentity('event', raw.id)), assessments, now, detections, repository);
            events.push(withSourceTimes(await normalizeCodexEvent(raw, feed, opts), feed.generated_at, null));
          }
          if (feed.scheduled) {
            const raw = feed.scheduled;
            const opts = await normalizationOptions(provider, raw, oldById.get(codexStorageIdentity('scheduled', raw.url)), assessments, now, detections, repository);
            events.push(withSourceTimes(await normalizeCodexScheduled(raw, feed, opts), feed.generated_at, null));
          }
          complete = true;
        }
      }
    } else {
      const adapter = createClaudeAdapter(dependencies, { http: state as ClaudeHttpState, histories: new Map() });
      const [history, status] = await Promise.all([adapter.readHistory(options.claudeHistory), adapter.readStatus()]);
      if (!history.ok) reason = history.code === 'page_limit' && options.claudeHistory
        ? 'history_page_budget_exceeded' : history.code;
      else if (!status.ok) reason = status.code;
      else if (history.snapshot.meta.content_revision !== status.value.meta.content_revision) reason = 'inconsistent_status_revision';
      else if (status.value.data.filters.audience !== 'all' || status.value.data.filters.window !== 'any' ||
        history.snapshot.events.length !== status.value.data.stats.total) reason = 'unknown_snapshot_completeness';
      else {
        const union = new Map<string, ClaudeEvent>();
        for (const raw of [...history.snapshot.events, ...statusEvents(status.value)]) {
          const existing = union.get(raw.id);
          if (existing && canonicalJson(existing) !== canonicalJson(raw)) {
            reason = 'inconsistent_status_record';
            break;
          }
          const old = oldById.get(raw.id);
          if (old?.upstreamRevision !== null && old?.upstreamRevision !== undefined && Number(old.upstreamRevision) > raw.revision) {
            reason = 'revision_regressed';
            break;
          }
          union.set(raw.id, raw);
        }
        if (reason === null && options.maxRecords !== undefined && union.size > options.maxRecords) {
          reason = 'record_budget_exceeded';
        }
        if (reason === null) {
          const now = dependencies.clock.now();
          for (const raw of union.values()) {
            const opts = await normalizationOptions(provider, raw, oldById.get(raw.id), assessments, now, detections, repository);
            events.push(withSourceTimes(await normalizeClaude(raw, opts),
              status.value.meta.generated_at, status.value.meta.editorial_reviewed_at));
          }
          complete = true;
        }
      }
    }
    const at = dependencies.clock.now();
    const storedSources = await saveHttp(provider, sources, state, at.getTime(), detections);
    const result = await repository.commitSnapshot({
      provider, expectedGeneration: activation.generation, at: at.toISOString(), complete,
      events: complete ? events : [], sources: storedSources,
      status: complete ? 'success' : state.entries.size > 0 ? 'partial' : 'failed', reason,
    });
    return {
      provider, complete: result.committed && complete, committed: result.committed,
      baselineCompleted: result.baselineCompleted, reason: result.committed ? reason : 'concurrent_sync',
    };
  }
  return {
    ingestProvider,
    /** Independent providers settle independently, including a local persistence failure. */
    ingestAll: (options: IngestOptions = {}) => Promise.allSettled([
      ingestProvider('claude', options), ingestProvider('codex', options),
    ]),
  };
}
