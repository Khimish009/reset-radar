import type { Provider } from '../domain/event';
import type { DurableEventPayload } from '../domain/normalization';
import type { Clock } from '../runtime';
import type { D1Repository } from '../storage/types';
import { SYNTHETIC_CHAT_ID, validSyntheticDestination } from '../storage/publisher';
import type { CandidateCursor, PublicationCandidate, PublisherRepository, SimulationState } from '../storage/publisher';
import type { TelegramClient, TelegramOutcome } from '../telegram/client';
import { renderTelegramMessage } from '../telegram/templates';

/** Explicit synthetic test policy; never consumes or grants production approval. */
export interface SyntheticPublishPolicy {
  readonly kind: 'synthetic_stage5';
  readonly environment: 'local_test';
  readonly destination: string;
  readonly chatId: typeof SYNTHETIC_CHAT_ID;
  readonly providers: Partial<Record<Provider, {
    readonly baselineCompletedAt: string;
    readonly approvedAt: string;
    readonly transitions: readonly {transitionId: string; rawKey: string; reviewedAt: string}[];
  }>>;
  readonly freshness: {
    readonly maxHttpAgeMs: number;
    readonly maxSourceAgeMs: number;
    readonly maxCandidateAgeMs: number;
    readonly maxReviewAgeMs: number;
  };
}
export interface PublishPageInput {
  readonly provider: Provider;
  readonly limit: number;
  readonly after?: CandidateCursor;
  readonly mode: 'dry_run' | 'simulate';
  readonly policy?: SyntheticPublishPolicy;
}
export interface PublishItem {
  readonly transitionId: string;
  readonly result: 'skipped' | 'preview' | SimulationState | 'persistence_uncertain';
  readonly reason?: string;
  readonly text?: string;
}
type Payload = DurableEventPayload & {sourceGeneratedAt?: string; sourceReviewedAt?: string | null};

function recent(value: string | null | undefined, now: number, maximum: number): boolean {
  if (typeof value !== 'string') return false;
  const time = Date.parse(value);
  return Number.isFinite(time) && time <= now && time >= now - maximum;
}
function validPolicy(policy: SyntheticPublishPolicy | undefined): policy is SyntheticPublishPolicy {
  if (!policy || policy.kind !== 'synthetic_stage5' || policy.environment !== 'local_test' ||
      policy.chatId !== SYNTHETIC_CHAT_ID || !validSyntheticDestination(policy.destination) || !policy.freshness || !policy.providers) return false;
  const f = policy.freshness;
  return Object.values(f).length === 4 && [f.maxHttpAgeMs, f.maxSourceAgeMs, f.maxCandidateAgeMs, f.maxReviewAgeMs]
    .every((n) => Number.isSafeInteger(n) && n > 0 && n <= 86_400_000) && f.maxHttpAgeMs <= 600_000;
}
function targetExpired(payload: Payload, now: Date): boolean {
  const time = payload.expectedTime;
  if (payload.record.action === 'announced_future') {
    if (time.precision === 'exact') return !Number.isFinite(Date.parse(time.at)) || Date.parse(time.at) <= now.getTime();
    // Conservative cutoff for local tests; no date-only timezone is asserted in text.
    if (time.precision === 'date') return time.on <= now.toISOString().slice(0, 10);
  }
  return payload.record.action === 'banked_offer' && payload.record.expiresOn !== null &&
    payload.record.expiresOn <= now.toISOString().slice(0, 10);
}

/** Direct local seam only; intentionally absent from Worker handlers and runtime config. */
export function createPublisherService(
  repository: PublisherRepository,
  facts: Pick<D1Repository, 'loadProvider' | 'loadSources'>,
  dependencies: {clock: Clock; client?: TelegramClient; newToken?: () => string},
) {
  async function evaluate(candidate: PublicationCandidate, input: PublishPageInput): Promise<PublishItem> {
    const skip = (reason: string): PublishItem => ({transitionId: candidate.transitionId, result: 'skipped', reason});
    const policy = input.policy;
    if (!validPolicy(policy)) return skip('missing_synthetic_policy');
    const now = dependencies.clock.now();
    const timestamp = now.getTime();
    if (!Number.isFinite(timestamp)) return skip('invalid_clock');
    const approval = policy.providers[candidate.provider];
    const activation = await facts.loadProvider(candidate.provider);
    if (activation.generation !== candidate.generation) return skip('candidate_snapshot_changed');
    if (!activation.baselineCompletedAt) return skip('baseline_missing');
    if (!approval || approval.baselineCompletedAt !== activation.baselineCompletedAt ||
        !recent(approval.approvedAt, timestamp, policy.freshness.maxReviewAgeMs)) return skip('local_approval_missing');
    if (candidate.currentTransitionId !== candidate.transitionId) return skip('superseded_transition');
    if (!recent(candidate.createdAt, timestamp, policy.freshness.maxCandidateAgeMs)) return skip('candidate_stale');
    let payload: Payload;
    let current: Payload;
    try {
      payload = JSON.parse(candidate.payload) as Payload;
      current = JSON.parse(candidate.currentPayload) as Payload;
      if (payload.record.provider !== candidate.provider || current.record.provider !== candidate.provider ||
          current.record.action === 'needs_review' || current.rawKey !== payload.rawKey ||
          current.reviewReasons.length !== 0 || targetExpired(payload, now) || targetExpired(current, now)) {
        return skip('current_truth_ineligible');
      }
    } catch { return skip('invalid_payload'); }
    const reviewed = approval.transitions.find((item) => item.transitionId === candidate.transitionId && item.rawKey === payload.rawKey);
    if (!reviewed || !recent(reviewed.reviewedAt, timestamp, policy.freshness.maxReviewAgeMs)) return skip('transition_not_reviewed');
    if (activation.lastStatus !== 'success' || !recent(activation.lastSuccessAt, timestamp, policy.freshness.maxHttpAgeMs)) return skip('ingestion_stale');
    const sources = await facts.loadSources(candidate.provider);
    const representations = sources.filter((source) => source.endpointKey !== '$transport');
    const required = candidate.provider === 'codex'
      ? representations.some((source) => source.endpointKey === 'https://codexreset.ai/api/v1/resets.json')
      : representations.some((source) => source.endpointKey === 'status?') && representations.some((source) => source.endpointKey.startsWith('resets?'));
    if (!required || sources.some((source) => source.retryUntil > timestamp) || representations.some((source) =>
      source.snapshot === null || source.retainedUntil <= timestamp || source.failureCount > 0 ||
      !recent(source.checkedAt, timestamp, policy.freshness.maxHttpAgeMs))) return skip('http_check_stale');
    if (!recent(current.sourceGeneratedAt, timestamp, policy.freshness.maxSourceAgeMs) ||
        (candidate.provider === 'claude' && !recent(current.sourceReviewedAt, timestamp, policy.freshness.maxSourceAgeMs))) return skip('upstream_metadata_stale');
    let previousVersion: Payload | undefined;
    if (payload.record.action === 'correction' || payload.record.action === 'withdrawal') {
      const previousId = payload.reviewedEvidence?.previousTransitionId;
      if (!previousId) return skip('lineage_missing');
      const previous = await repository.loadPrevious(candidate.eventId, previousId, candidate.sequence);
      if (!previous) return skip('lineage_missing');
      try { previousVersion = JSON.parse(previous) as Payload; } catch { return skip('invalid_lineage'); }
    }
    let rendered: ReturnType<typeof renderTelegramMessage>;
    try { rendered = renderTelegramMessage(payload, previousVersion ? {previousVersion} : undefined); }
    catch { return skip('invalid_payload'); }
    if (!rendered.ok) return skip(rendered.reason);
    // No client access, send claim or delivery write in dry_run.
    if (input.mode === 'dry_run') return {transitionId: candidate.transitionId, result: 'preview', text: rendered.text};
    if (input.mode !== 'simulate' || dependencies.client?.simulationOnly !== true) return skip('simulation_client_missing');
    const key = {eventId: candidate.eventId, transitionId: candidate.transitionId, destination: policy.destination};
    const delivery = await repository.getDelivery(key);
    if (delivery && (delivery.state !== 'retryable' || delivery.attempts >= 3 ||
        !delivery.retryAt || Date.parse(delivery.retryAt) > timestamp)) return skip('delivery_blocked');
    const token = dependencies.newToken?.() ?? crypto.randomUUID();
    if (!await repository.claim({...key, candidate, generation: candidate.generation, token, at: now.toISOString()})) return skip('claim_not_acquired');
    // Any failure after this boundary may follow a send. Keep the claim blocked.
    let outcome: TelegramOutcome;
    try { outcome = await dependencies.client.sendMessage({chatId: policy.chatId, text: rendered.text}); }
    catch { outcome = {kind: 'uncertain_manual_review', code: 'client_exception'}; }
    const at = dependencies.clock.now().toISOString();
    try {
      const common = {...key, token, at};
      const completed = outcome.kind === 'simulated_sent'
        ? await repository.complete({...common, state: 'simulated_sent', messageId: outcome.messageId})
        : outcome.kind === 'retryable'
          ? await repository.complete({...common, state: 'retryable', retryAt: outcome.retryAt})
          : await repository.complete({...common, state: outcome.kind === 'rejected' ? 'rejected' : 'uncertain_manual_review'});
      if (!completed) return {transitionId: candidate.transitionId, result: 'persistence_uncertain'};
      return {transitionId: candidate.transitionId, result: outcome.kind};
    } catch { return {transitionId: candidate.transitionId, result: 'persistence_uncertain'}; }
  }
  return {
    async runPage(input: PublishPageInput): Promise<{items: PublishItem[]; nextCursor: CandidateCursor | null}> {
      const candidates = await repository.listCandidates(input);
      const items: PublishItem[] = [];
      // Bounded serial work prevents a batch from creating a burst of sends.
      for (const candidate of candidates) {
        try { items.push(await evaluate(candidate, input)); }
        catch { items.push({transitionId: candidate.transitionId, result: 'skipped', reason: 'storage_unavailable'}); }
      }
      const last = candidates.at(-1);
      return {items, nextCursor: candidates.length === input.limit && last ? {createdAt: last.createdAt, transitionId: last.transitionId} : null};
    },
  };
}
