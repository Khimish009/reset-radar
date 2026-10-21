import type { EventAction, EventRecord, EventTime } from './event';
import type { StoredEventInput, LoadedEvent } from '../storage/types';
import { mapClaudeEvent } from '../providers/claude/mapping';
import type { ClaudeEvent } from '../providers/claude/schema';
import { codexAssessmentKey, mapCodexEvent, mapCodexScheduled } from '../providers/codex/mapping';
import type { CodexEvent, CodexFeed, CodexScheduled } from '../providers/codex/schema';

export interface LocalAssessment {
  readonly recordKey: string;
  readonly assertion: 'applied' | 'future_announcement' | 'banked_offer' | 'correction' | 'withdrawal';
  readonly primarySourceUrl: string;
  readonly evidenceUrls: readonly string[];
  readonly rationale: string;
  readonly futureTarget?: EventTime;
  readonly audience?: string;
  readonly previousTransitionId?: string;
}

export interface DurableEventPayload {
  readonly record: EventRecord;
  readonly rawKey: string;
  readonly rawFacts: unknown;
  readonly expectedTime: EventTime;
  readonly verifiedFutureTarget: VerifiedFutureTarget | null;
  readonly reviewedEvidence: LocalAssessment | null;
  readonly reviewReasons: readonly string[];
  readonly upstreamReportedDelivery: EventTime;
  readonly verifiedDelivery: EventTime;
  readonly attribution?: CodexFeed['attribution'];
  readonly windows?: ClaudeEvent['windows'];
}

export type VerifiedFutureTarget =
  | { readonly precision: 'exact'; readonly at: string }
  | { readonly precision: 'date'; readonly on: string };

export interface NormalizeOptions {
  readonly now: Date;
  readonly detectedAt: string;
  readonly assessment?: LocalAssessment;
  readonly previous?: LoadedEvent & { readonly transitionId: string };
}

function canonicalValue(value: unknown, inArray = false): string | undefined {
  if (value === null) return 'null';
  if (typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number') return Number.isFinite(value) ? JSON.stringify(value) : 'null';
  if (Array.isArray(value)) return `[${value.map((entry) => canonicalValue(entry, true) ?? 'null').join(',')}]`;
  if (typeof value === 'object') {
    const object = value as Record<string, unknown>;
    const entries = Object.keys(object).sort().flatMap((key) => {
      const encoded = canonicalValue(object[key]);
      return encoded === undefined ? [] : [`${JSON.stringify(key)}:${encoded}`];
    });
    return `{${entries.join(',')}}`;
  }
  if (inArray) return 'null';
  return undefined;
}

/** Stable JSON representation for JSON-compatible values; object key order is ignored. */
export function canonicalJson(value: unknown): string {
  const encoded = canonicalValue(value);
  if (encoded === undefined) throw new TypeError('value_is_not_json');
  return encoded;
}

export async function digest(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(canonicalJson(value));
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function rawAssessmentKey(provider: 'claude' | 'codex', raw: ClaudeEvent | CodexEvent | CodexScheduled): Promise<string> {
  return digest([provider, raw]);
}

function eventTimeForInstant(at: string | null): EventTime {
  return at === null ? { precision: 'unknown' } : { precision: 'exact', at };
}

function namespacedId(provider: 'claude' | 'codex', upstream: string, externalId: string): string {
  return encodeURIComponent(JSON.stringify([provider, upstream, externalId]));
}

/** Surface is part of identity: both upstream event IDs and scheduled URLs are arbitrary strings. */
export function codexStorageIdentity(surface: 'event' | 'scheduled', upstreamKey: string): string {
  return canonicalJson([surface, upstreamKey]);
}

function assessmentIsBound(
  assessment: LocalAssessment | undefined,
  key: string,
): assessment is LocalAssessment {
  return assessment !== undefined && assessment.recordKey === key &&
    assessment.rationale.trim().length > 0 && assessment.evidenceUrls.length > 0 &&
    assessment.evidenceUrls.includes(assessment.primarySourceUrl) &&
    assessment.evidenceUrls.every(validEvidenceUrl) && validEvidenceUrl(assessment.primarySourceUrl);
}

function validEvidenceUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password;
  } catch { return false; }
}

function materialFacts(rawFacts: unknown): unknown {
  if (typeof rawFacts !== 'object' || rawFacts === null || Array.isArray(rawFacts)) return rawFacts;
  const facts = { ...(rawFacts as Record<string, unknown>) };
  // Keep revision and correction wording in audit data, without making either alone a material transition.
  delete facts.revision;
  const correction = facts.correction;
  if (typeof correction === 'object' && correction !== null && !Array.isArray(correction)) {
    const factualCorrection = Object.fromEntries(
      Object.entries(correction).filter(([key]) => key !== 'reason'),
    );
    facts.correction = factualCorrection;
  }
  return facts;
}

function materialProjection(input: {
  readonly record: EventRecord;
  readonly rawFacts: unknown;
  readonly expectedTime: EventTime;
  readonly verifiedFutureTarget: VerifiedFutureTarget | null;
  readonly reviewedEvidence: LocalAssessment | null;
}): unknown {
  const evidence = input.reviewedEvidence;
  const provenance = input.record.provenance;
  return {
    record: {
      ...input.record,
      provenance: { ...provenance, revision: null, evidenceUrls: [...new Set(provenance.evidenceUrls)].sort() },
    },
    rawFacts: materialFacts(input.rawFacts),
    expectedTime: input.expectedTime,
    verifiedFutureTarget: input.verifiedFutureTarget,
    reviewedAssertion: evidence?.assertion ?? null,
    reviewedEvidenceUrls: evidence ? [...new Set(evidence.evidenceUrls)].sort() : [],
    reviewedPrimarySourceUrl: evidence?.primarySourceUrl ?? null,
  };
}

async function finish(input: {
  readonly provider: 'claude' | 'codex';
  readonly upstream: string;
  readonly externalId: string;
  readonly record: EventRecord;
  readonly raw: ClaudeEvent | CodexEvent | CodexScheduled;
  readonly rawFacts: unknown;
  readonly eventDate: string | null;
  readonly detectedAt: string;
  readonly upstreamRevision: string | null;
  readonly expectedTime: EventTime;
  readonly verifiedFutureTarget: VerifiedFutureTarget | null;
  readonly reviewedEvidence: LocalAssessment | null;
  readonly reviewReasons: readonly string[];
  readonly upstreamReportedDelivery: EventTime;
  readonly attribution?: CodexFeed['attribution'];
  readonly windows?: ClaudeEvent['windows'];
}): Promise<StoredEventInput> {
  const rawKey = await rawAssessmentKey(input.provider, input.raw);
  const payload: DurableEventPayload = {
    record: input.record, rawKey, rawFacts: input.rawFacts,
    expectedTime: input.expectedTime, verifiedFutureTarget: input.verifiedFutureTarget,
    reviewedEvidence: input.reviewedEvidence, reviewReasons: [...input.reviewReasons],
    upstreamReportedDelivery: input.upstreamReportedDelivery,
    verifiedDelivery: input.record.action === 'confirmed_applied' ? input.record.delivered : { precision: 'unknown' },
    ...(input.attribution ? { attribution: input.attribution } : {}),
    ...(input.windows ? { windows: input.windows } : {}),
  };
  const materialHash = await digest(materialProjection(payload));
  const assessmentKey = input.reviewedEvidence === null ? null : await digest(input.reviewedEvidence);
  const observationKey = await digest({ rawKey, assessmentKey });
  return {
    id: namespacedId(input.provider, input.upstream, input.externalId), provider: input.provider,
    upstream: input.upstream, externalId: input.externalId, materialHash, observationKey,
    assessmentKey, upstreamRevision: input.upstreamRevision, action: input.record.action,
    eventDate: input.eventDate, detectedAt: input.detectedAt, payload: canonicalJson(payload),
    candidate: input.record.action !== 'needs_review' && !input.record.provenance.historicalSeed,
  };
}

function claudeFacts(raw: ClaudeEvent): unknown {
  return {
    id: raw.id, kind: raw.kind, status: raw.event_status, timePrecision: raw.time_precision,
    announcedAt: raw.announced_at, announcedOn: raw.announced_on, utcDay: raw.utc_day,
    effectiveAt: raw.effective_at, resetOfferExpiresOn: raw.reset_offer?.expires_on ?? null,
    allocation: raw.allocation,
    audience: { scope: raw.audience.scope, plans: raw.audience.plans, exclusions: raw.audience.exclusions },
    windows: raw.windows,
    sources: raw.sources.map(({ url, role, kind, posted_at }) => ({ url, role, kind, postedAt: posted_at }))
      .sort((left, right) => left.url.localeCompare(right.url)),
    url: raw.url, firstPublishedAt: raw.first_published_at, revision: raw.revision,
    correction: raw.correction === null ? null : { kind: raw.correction.kind, at: raw.correction.at, reason: raw.correction.reason },
    relatedEventIds: raw.related_event_ids,
  };
}

function codexEventFacts(raw: CodexEvent): unknown {
  return {
    id: raw.id, date: raw.date, ts: raw.ts, kind: raw.kind, scope: raw.scope, url: raw.url,
    seeded: raw.seeded, announcedAt: raw.announced_at, deliveredAt: raw.delivered_at,
    deliveredSourceUrl: raw.delivered_source_url, deliveryReportedDelay: raw.delivery_reported_delay,
  };
}

function codexScheduledFacts(raw: CodexScheduled): unknown {
  return {
    certainty: raw.certainty, day: raw.day, scheduledFor: raw.scheduled_for,
    url: raw.url, source: raw.source, announcedAt: raw.announced_at,
  };
}

export async function normalizeClaude(
  raw: ClaudeEvent,
  options: NormalizeOptions,
): Promise<StoredEventInput> {
  const key = await rawAssessmentKey('claude', raw);
  const originals = raw.sources.filter((source) => source.role === 'original');
  const proposed = options.assessment;
  const assessmentValid = assessmentIsBound(proposed, key) &&
    originals.some((source) => source.url === proposed.primarySourceUrl);
  let accepted: LocalAssessment | null = assessmentValid ? proposed : null;
  let assessmentForMapper: Parameters<typeof mapClaudeEvent>[2];
  if (accepted) {
    const previous = options.previous;
    const linkedAssertion = accepted.assertion === 'correction' || accepted.assertion === 'withdrawal';
    const previousRevision = Number(previous?.upstreamRevision);
    const previousValid = !linkedAssertion || (previous !== undefined && previous.transitionId.length > 0 &&
      previous.id === namespacedId('claude', 'Claude Resets', raw.id) && previous.provider === 'claude' &&
      previous.upstream === 'Claude Resets' && previous.externalId === raw.id &&
      previous.upstreamRevision !== null && Number.isSafeInteger(previousRevision) && previousRevision >= 1 && previousRevision < raw.revision &&
      accepted.previousTransitionId === previous.transitionId);
    if (!previousValid) accepted = null;
  }
  const isUnknownFuture = accepted?.assertion === 'future_announcement' &&
    (accepted.futureTarget === undefined || accepted.futureTarget.precision === 'unknown') &&
    raw.event_status === 'announced' && raw.kind === 'usage_reset' &&
    raw.allocation === 'subscription_usage' && raw.reset_offer === null && raw.correction === null;
  if (accepted) {
    const originalUrls = new Set(originals.map((source) => source.url));
    const mapperEvidenceUrls = accepted.evidenceUrls.filter((url) => originalUrls.has(url));
    const previousRevision = options.previous?.upstreamRevision;
    assessmentForMapper = {
      eventId: raw.id, revision: raw.revision, assertion: accepted.assertion as 'applied' | 'future_announcement' | 'correction' | 'withdrawal',
      evidenceUrls: mapperEvidenceUrls,
      ...(accepted.futureTarget && accepted.futureTarget.precision !== 'unknown' ? { futureTarget: accepted.futureTarget } : {}),
      ...((accepted.assertion === 'correction' || accepted.assertion === 'withdrawal') && previousRevision !== null && previousRevision !== undefined
        ? { previous: { eventId: raw.id, revision: Number(previousRevision) } } : {}),
    };
  }
  const mapped = mapClaudeEvent(raw, options.now, assessmentForMapper);
  const reviewReasons = [...mapped.reviewReasons];
  let record = mapped.record;
  let verifiedFutureTarget: VerifiedFutureTarget | null = mapped.verifiedFutureTarget;
  const assertionAction: Record<LocalAssessment['assertion'], EventAction> = {
    applied: 'confirmed_applied', future_announcement: 'announced_future', banked_offer: 'banked_offer',
    correction: 'correction', withdrawal: 'withdrawal',
  };
  if (accepted && record.action !== assertionAction[accepted.assertion] && !(isUnknownFuture && record.action === 'needs_review')) accepted = null;
  if (isUnknownFuture && accepted && record.action === 'needs_review' &&
      reviewReasons.length === 1 && reviewReasons[0] === 'future_target_not_established') {
    record = { ...record, action: 'announced_future' };
    verifiedFutureTarget = null;
    reviewReasons.length = 0;
  }
  // The upstream mapper recognizes an offer, but only a current reviewed local assertion can credit it.
  if (raw.kind === 'credit' && raw.reset_offer !== null &&
      (!accepted || accepted.assertion !== 'banked_offer' ||
        !originals.some((source) => source.url === accepted?.primarySourceUrl) || !accepted.evidenceUrls.includes(raw.url))) {
    record = { ...record, action: 'needs_review' };
    if (!reviewReasons.includes('banked_offer_unverified')) reviewReasons.push('banked_offer_unverified');
    accepted = null;
  }
  if ((raw.correction !== null || raw.event_status === 'cancelled' || raw.event_status === 'retracted') &&
      (record.action === 'correction' || record.action === 'withdrawal') && !options.previous) {
    record = { ...record, action: 'needs_review' };
    reviewReasons.push('previous_transition_not_observed');
    accepted = null;
  }
  if (accepted && record.action !== 'needs_review') {
    record = {
      ...record,
      provenance: { ...record.provenance, evidenceUrls: [...new Set([...record.provenance.evidenceUrls, ...accepted.evidenceUrls])] },
    };
  }
  if (record.action !== 'announced_future') verifiedFutureTarget = null;
  const expectedTime = record.action === 'announced_future' && verifiedFutureTarget
    ? verifiedFutureTarget
    : record.action === 'confirmed_applied' ? eventTimeForInstant(raw.effective_at) : { precision: 'unknown' as const };
  return finish({
    provider: 'claude', upstream: 'Claude Resets', externalId: raw.id, record, raw, rawFacts: claudeFacts(raw),
    eventDate: raw.announced_at?.slice(0, 10) ?? raw.announced_on,
    detectedAt: options.detectedAt, upstreamRevision: String(raw.revision), expectedTime,
    verifiedFutureTarget, reviewedEvidence: accepted,
    reviewReasons, upstreamReportedDelivery: { precision: 'unknown' }, windows: raw.windows,
  });
}

export async function normalizeCodexEvent(
  raw: CodexEvent,
  context: Pick<CodexFeed, 'source' | 'attribution'>,
  options: NormalizeOptions,
): Promise<StoredEventInput> {
  const key = await rawAssessmentKey('codex', raw);
  const assessmentValid = assessmentIsBound(options.assessment, key);
  const local = assessmentValid ? options.assessment : undefined;
  const mapperAssessment = local ? {
    recordKey: codexAssessmentKey(raw), assertion: local.assertion as 'applied' | 'future_announcement' | 'banked_offer',
    evidenceUrls: local.evidenceUrls, primarySourceUrl: local.primarySourceUrl, rationale: local.rationale,
    ...(local.futureTarget ? { futureTarget: local.futureTarget } : {}),
    ...(local.audience ? { audience: local.audience } : {}),
  } : undefined;
  const mapped = mapCodexEvent(raw, { ...context, detectedAt: options.detectedAt }, options.now, mapperAssessment);
  const accepted = mapped.reviewedEvidence ? local ?? null : null;
  return finish({
    provider: 'codex', upstream: 'codexreset.ai', externalId: codexStorageIdentity('event', raw.id), record: mapped.record, raw,
    rawFacts: codexEventFacts(raw), eventDate: raw.date, detectedAt: options.detectedAt,
    upstreamRevision: null, expectedTime: mapped.expectedTime, verifiedFutureTarget: mapped.verifiedFutureTarget,
    reviewedEvidence: accepted, reviewReasons: mapped.reviewReasons,
    upstreamReportedDelivery: eventTimeForInstant(raw.delivered_at), attribution: context.attribution,
  });
}

export async function normalizeCodexScheduled(
  raw: CodexScheduled,
  context: Pick<CodexFeed, 'source' | 'attribution'>,
  options: NormalizeOptions,
): Promise<StoredEventInput> {
  const key = await rawAssessmentKey('codex', raw);
  const assessmentValid = assessmentIsBound(options.assessment, key);
  const local = assessmentValid ? options.assessment : undefined;
  const mapperAssessment = local ? {
    recordKey: codexAssessmentKey(raw), assertion: local.assertion as 'applied' | 'future_announcement' | 'banked_offer',
    evidenceUrls: local.evidenceUrls, primarySourceUrl: local.primarySourceUrl, rationale: local.rationale,
    ...(local.futureTarget ? { futureTarget: local.futureTarget } : {}),
    ...(local.audience ? { audience: local.audience } : {}),
  } : undefined;
  const mapped = mapCodexScheduled(raw, { ...context, detectedAt: options.detectedAt }, options.now, mapperAssessment);
  const accepted = mapped.reviewedEvidence ? local ?? null : null;
  return finish({
    provider: 'codex', upstream: 'codexreset.ai', externalId: codexStorageIdentity('scheduled', raw.url), record: mapped.record, raw,
    rawFacts: codexScheduledFacts(raw), eventDate: raw.day, detectedAt: options.detectedAt,
    upstreamRevision: null, expectedTime: mapped.expectedTime, verifiedFutureTarget: mapped.verifiedFutureTarget,
    reviewedEvidence: accepted, reviewReasons: mapped.reviewReasons,
    upstreamReportedDelivery: { precision: 'unknown' }, attribution: context.attribution,
  });
}
