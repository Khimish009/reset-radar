import { afterEach } from 'vitest';
import type { DurableEventPayload, LocalAssessment } from '../../src/domain/normalization';
import type { EventAction, EventTime } from '../../src/domain/event';
import { createD1Repository } from '../../src/storage/d1';
import {
  createPublisherRepository,
  SYNTHETIC_CHAT_ID,
  type PublicationCandidate,
} from '../../src/storage/publisher';
import type { TelegramClient, TelegramOutcome } from '../../src/telegram/client';
import { createPublisherService, type SyntheticPublishPolicy } from '../../src/services/publish';
import type { StoredEventInput } from '../../src/storage/types';
import { createTestD1 } from './d1';

export const STAGE5_NOW = '2026-10-22T12:00:00.000Z';
export const STAGE5_DESTINATION = 'synthetic:codex-publisher-tests';
const CODEX_ENDPOINT = 'https://codexreset.ai/api/v1/resets.json';
const PRIMARY = 'https://example.invalid/source/synthetic-primary';
const ATTRIBUTION: NonNullable<DurableEventPayload['attribution']> = {
  seed_archive: 'https://example.invalid/archive/synthetic-codex',
  note: 'SYNTHETIC fixture attribution only.',
};

const activeRuntimes: Array<{ dispose: () => Promise<void> }> = [];
afterEach(async () => {
  await Promise.all(activeRuntimes.splice(0).map((runtime) => runtime.dispose()));
});

export interface MutableStage5Clock {
  now(): Date;
  set(value: string): void;
  advance(milliseconds: number): void;
}

export function createStage5Clock(value = STAGE5_NOW): MutableStage5Clock {
  let current = Date.parse(value);
  return {
    now: () => new Date(current),
    set: (next) => { current = Date.parse(next); },
    advance: (milliseconds) => { current += milliseconds; },
  };
}

export interface Stage5SeedOptions {
  action?: EventAction;
  baseline?: boolean;
  candidateAt?: string;
  checkedAt?: string;
  generatedAt?: string;
  reviewedAt?: string;
  actionTime?: EventTime;
  expiresOn?: string | null;
  eventId?: string;
  externalId?: string;
  sequence?: number;
}

function assertionFor(action: EventAction): LocalAssessment['assertion'] | null {
  switch (action) {
    case 'announced_future': return 'future_announcement';
    case 'confirmed_applied': return 'applied';
    case 'banked_offer': return 'banked_offer';
    case 'correction': return 'correction';
    case 'withdrawal': return 'withdrawal';
    default: return null;
  }
}

export function stage5Payload(action: EventAction = 'announced_future', options: Stage5SeedOptions = {}): DurableEventPayload & {
  sourceGeneratedAt: string;
  sourceReviewedAt: string | null;
} {
  const eventId = options.eventId ?? 'codex:event:synthetic-stage5-001';
  const externalId = options.externalId ?? 'synthetic-stage5-001';
  const priorTransitionId = `${eventId}#1`;
  const assertion = assertionFor(action);
  const assessment: LocalAssessment | null = assertion === null ? null : {
    recordKey: 'stage5-synthetic-raw-key',
    assertion,
    primarySourceUrl: PRIMARY,
    evidenceUrls: [PRIMARY],
    rationale: 'SYNTHETIC local test evidence only.',
    ...(action === 'announced_future' ? { futureTarget: options.actionTime ?? { precision: 'date' as const, on: '2026-10-24' } } : {}),
    ...(action === 'correction' || action === 'withdrawal' ? { previousTransitionId: priorTransitionId } : {}),
  };
  const expectedTime = action === 'announced_future'
    ? options.actionTime ?? { precision: 'date' as const, on: '2026-10-24' }
    : { precision: 'unknown' as const };
  const verifiedDelivery = action === 'confirmed_applied'
    ? options.actionTime ?? { precision: 'exact' as const, at: STAGE5_NOW }
    : { precision: 'unknown' as const };
  const rawKind = action === 'banked_offer' ? 'banked' : 'regular';
  return {
    record: {
      provider: 'codex', action,
      provenance: {
        upstream: 'codexreset.ai', upstreamUrl: 'https://codexreset.ai/', sourceUrl: PRIMARY,
        evidenceUrls: [PRIMARY], externalId, rawKind, rawStatus: null,
        revision: null, historicalSeed: false, seedArchiveUrl: null,
      },
      announced: { precision: 'exact', at: '2026-10-22T11:00:00.000Z' },
      effective: { precision: 'unknown' }, delivered: verifiedDelivery,
      expiresOn: options.expiresOn ?? null, audience: 'synthetic paid tier',
    },
    rawKey: 'stage5-synthetic-raw-key', rawFacts: {
      id: externalId, kind: rawKind, scope: 'synthetic paid tier', url: PRIMARY,
      seeded: false, announcedAt: '2026-10-22T11:00:00.000Z',
      deliveredAt: action === 'confirmed_applied' ? (verifiedDelivery.precision === 'exact' ? verifiedDelivery.at : null) : null,
      deliveredSourceUrl: action === 'confirmed_applied' ? PRIMARY : null,
      deliveryReportedDelay: false,
    }, expectedTime,
    verifiedFutureTarget: action === 'announced_future' && expectedTime.precision !== 'unknown' ? expectedTime : null,
    reviewedEvidence: assessment, reviewReasons: [],
    upstreamReportedDelivery: action === 'confirmed_applied' ? verifiedDelivery : { precision: 'unknown' }, verifiedDelivery,
    attribution: ATTRIBUTION,
    sourceGeneratedAt: options.generatedAt ?? STAGE5_NOW,
    sourceReviewedAt: options.reviewedAt ?? STAGE5_NOW,
  };
}

function storedEvent(action: EventAction, options: Stage5SeedOptions = {}): StoredEventInput {
  const id = options.eventId ?? 'codex:event:synthetic-stage5-001';
  const payload = stage5Payload(action, options);
  return {
    id, provider: 'codex', upstream: 'codexreset.ai',
    externalId: options.externalId ?? 'synthetic-stage5-001',
    materialHash: `stage5-${action}`,
    observationKey: `stage5-observation-${action}`,
    assessmentKey: 'stage5-assessment', upstreamRevision: null, action,
    eventDate: '2026-10-22', detectedAt: options.candidateAt ?? STAGE5_NOW,
    payload: JSON.stringify(payload), candidate: action !== 'needs_review',
  };
}

export interface Stage5Harness {
  db: D1Database;
  clock: MutableStage5Clock;
  facts: ReturnType<typeof createD1Repository>;
  repository: ReturnType<typeof createPublisherRepository>;
  service: ReturnType<typeof createPublisherService>;
  makeService(client?: TelegramClient, newToken?: () => string): ReturnType<typeof createPublisherService>;
  candidates(): Promise<PublicationCandidate[]>;
  candidate(action?: EventAction): Promise<PublicationCandidate>;
  policy(candidate: PublicationCandidate, overrides?: Partial<SyntheticPublishPolicy>): SyntheticPublishPolicy;
  commit(action: EventAction, options?: Stage5SeedOptions): Promise<void>;
  dispose(): Promise<void>;
}

export async function createStage5Harness(options: Stage5SeedOptions = {}): Promise<Stage5Harness> {
  const runtime = await createTestD1();
  activeRuntimes.push(runtime);
  const db = runtime.db;
  const clock = createStage5Clock();
  const facts = createD1Repository(db);
  const repository = createPublisherRepository(db);
  const sourceState = (checkedAt = STAGE5_NOW) => [{
    endpointKey: CODEX_ENDPOINT, snapshot: JSON.stringify({ synthetic: true }), etag: '"stage5-synthetic"',
    checkedAt, expiresAt: Date.parse(checkedAt) + 60_000, retryUntil: 0, failureCount: 0,
    retainedUntil: Date.parse(checkedAt) + 86_400_000,
  }];

  if (options.baseline !== false) {
    await facts.commitSnapshot({
      provider: 'codex', expectedGeneration: 0,
      at: STAGE5_NOW, complete: true, events: [],
      sources: sourceState(STAGE5_NOW), status: 'success', reason: null,
    });
    await facts.commitSnapshot({
      provider: 'codex', expectedGeneration: 1, at: options.candidateAt ?? STAGE5_NOW, complete: true,
      events: [storedEvent(options.action ?? 'announced_future', options)],
      sources: sourceState(options.checkedAt ?? options.candidateAt ?? STAGE5_NOW), status: 'success', reason: null,
    });
    if (options.candidateAt && options.candidateAt !== STAGE5_NOW) {
      await facts.commitSnapshot({
        provider: 'codex', expectedGeneration: 2, at: STAGE5_NOW, complete: true,
        events: [storedEvent(options.action ?? 'announced_future', options)],
        sources: sourceState(options.checkedAt ?? STAGE5_NOW), status: 'success', reason: null,
      });
    }
  } else {
    await facts.commitSnapshot({
      provider: 'codex', expectedGeneration: 0, at: STAGE5_NOW, complete: true,
      events: [storedEvent(options.action ?? 'announced_future', options)],
      sources: sourceState(options.checkedAt ?? STAGE5_NOW), status: 'success', reason: null,
    });
  }

  const client: TelegramClient = {
    simulationOnly: true,
    sendMessage: async () => ({ kind: 'simulated_sent', messageId: 7001, chatId: SYNTHETIC_CHAT_ID }),
  };
  const makeService = (selectedClient: TelegramClient = client, newToken = tokenSequence()) =>
    createPublisherService(repository, facts, { clock, client: selectedClient, newToken });
  const service = makeService();
  const candidates = () => repository.listCandidates({ provider: 'codex', limit: 50 });
  const candidate = async (action?: EventAction) => {
    const all = await candidates();
    const found = action ? all.find((item) => JSON.parse(item.payload).record.action === action) : all.at(-1);
    if (!found) throw new Error(`Stage 5 synthetic candidate not found: ${action ?? 'latest'}`);
    return found;
  };
  const policy = (item: PublicationCandidate, overrides: Partial<SyntheticPublishPolicy> = {}): SyntheticPublishPolicy => ({
    kind: 'synthetic_stage5', environment: 'local_test', destination: STAGE5_DESTINATION,
    chatId: SYNTHETIC_CHAT_ID,
    providers: {
      codex: {
        baselineCompletedAt: STAGE5_NOW,
        approvedAt: STAGE5_NOW,
        transitions: [{ transitionId: item.transitionId, rawKey: JSON.parse(item.payload).rawKey, reviewedAt: STAGE5_NOW }],
      },
    },
    freshness: { maxHttpAgeMs: 300_000, maxSourceAgeMs: 300_000, maxCandidateAgeMs: 300_000, maxReviewAgeMs: 300_000, maxEventAgeMs: 300_000 },
    ...overrides,
  });
  return {
    db, clock, facts, repository, service, makeService, candidates, candidate, policy,
    async commit(action, commitOptions = {}) {
      const activation = await facts.loadProvider('codex');
      const current = await facts.loadEvents('codex');
      await facts.commitSnapshot({
        provider: 'codex', expectedGeneration: activation.generation,
        at: commitOptions.candidateAt ?? clock.now().toISOString(), complete: true,
        events: [...current.filter((event) => event.id !== (commitOptions.eventId ?? 'codex:event:synthetic-stage5-001')),
          storedEvent(action, { ...options, ...commitOptions, sequence: activation.generation + 1 })],
        sources: sourceState(commitOptions.checkedAt ?? clock.now().toISOString()), status: 'success', reason: null,
      });
    },
    async dispose() {
      const index = activeRuntimes.indexOf(runtime);
      if (index >= 0) activeRuntimes.splice(index, 1);
      await runtime.dispose();
    },
  };
}

function tokenSequence(): () => string {
  let index = 0;
  return () => `stage5-token-${++index}`;
}

export function outcomeClient(outcome: TelegramOutcome | Error, onSend?: (input: {chatId: number; text: string}) => void): TelegramClient {
  return {
    simulationOnly: true,
    async sendMessage(input) {
      onSend?.(input);
      if (outcome instanceof Error) throw outcome;
      return outcome;
    },
  };
}
