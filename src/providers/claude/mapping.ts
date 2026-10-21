import type { EventAction, EventRecord, EventTime } from '../../domain/event';
import type { ClaudeEvent } from './schema';
import { date, instant } from './schema';

/** Explicit local evidence assessment; not a production policy or publication approval.
 * It binds the assessment to this exact source record/revision and original links.
 */
export interface ClaudeEvidenceAssessment {
  eventId: string;
  revision: number;
  assertion: 'applied' | 'future_announcement' | 'correction' | 'withdrawal';
  evidenceUrls: readonly string[];
  /** Required for corrections/withdrawals: an actually observed earlier revision. */
  previous?: { eventId: string; revision: number };
  /** Explicit future target from reviewed evidence; never inferred from the post time. */
  futureTarget?: EventTime;
}

export type ClaudeFutureTarget = Exclude<EventTime, { readonly precision: 'unknown' }>;

export interface ClaudeMappedEvent {
  record: EventRecord;
  raw: ClaudeEvent;
  audience: ClaudeEvent['audience'];
  windows: ClaudeEvent['windows'];
  reviewReasons: readonly string[];
  /** Validated, evidence-bound target only for an accepted future announcement. */
  verifiedFutureTarget: ClaudeFutureTarget | null;
}

/** Source-specific mapping only. Unreviewed execution claims fail closed. */
export function mapClaudeEvent(
  raw: ClaudeEvent, now: Date, assessment?: ClaudeEvidenceAssessment,
): ClaudeMappedEvent {
  const originals = raw.sources.filter((s) => s.role === 'original');
  const hasSources = originals.length > 0;
  const verified = assessment !== undefined && assessment.eventId === raw.id &&
    assessment.revision === raw.revision && assessment.evidenceUrls.length > 0 &&
    assessment.evidenceUrls.every((u) => originals.some((s) => s.url === u));
  const linked = verified && assessment.previous?.eventId === raw.id &&
    Number.isSafeInteger(assessment.previous.revision) && assessment.previous.revision >= 1 &&
    assessment.previous.revision < raw.revision;
  let action: EventAction = 'needs_review';
  let verifiedFutureTarget: ClaudeFutureTarget | null = null;
  let reason = 'insufficient_evidence';
  const withdrawn = raw.event_status === 'cancelled' || raw.event_status === 'retracted' ||
    raw.correction?.kind === 'retraction';
  if (withdrawn) {
    if (linked && assessment.assertion === 'withdrawal' && raw.correction?.reason.trim()) action = 'withdrawal';
    else reason = 'unverified_withdrawal';
  } else if (raw.correction !== null) {
    if (linked && assessment.assertion === 'correction' && raw.correction.reason.trim()) action = 'correction';
    else reason = 'unverified_correction';
  } else if (raw.kind === 'credit' && raw.reset_offer !== null && raw.event_status === 'confirmed' && hasSources) {
    // The contract proves an offer, not redemption, current activity or a precise deadline.
    action = 'banked_offer';
  } else if (raw.kind !== 'usage_reset' || raw.reset_offer !== null || raw.allocation !== 'subscription_usage') {
    reason = 'unsupported_kind_or_allocation';
  } else if (raw.event_status === 'confirmed' && verified && assessment.assertion === 'applied') {
    action = 'confirmed_applied';
  } else if (raw.event_status === 'announced' && verified && assessment.assertion === 'future_announcement') {
    const target = assessment.futureTarget;
    // Date-only policy: compare calendar dates against today's UTC date. Today
    // and past dates stay in review; tomorrow qualifies. UTC is only the stable
    // comparison reference, not an inferred event timezone or midnight instant.
    // This does not claim the date has yet to start in every timezone.
    try {
      if (target?.precision === 'exact') {
        const at = instant(target.at);
        if (Date.parse(at) > now.getTime()) verifiedFutureTarget = { precision: 'exact', at };
      } else if (target?.precision === 'date') {
        const on = date(target.on);
        if (on > now.toISOString().slice(0, 10)) verifiedFutureTarget = { precision: 'date', on };
      }
    } catch { /* Invalid assessment dates cannot promote a record. */ }
    if (verifiedFutureTarget !== null) action = 'announced_future';
    else reason = 'future_target_not_established';
  }
  const announced: EventTime = raw.time_precision === 'exact' && raw.announced_at !== null
    ? { precision: 'exact', at: raw.announced_at }
    : raw.announced_on !== null ? { precision: 'date', on: raw.announced_on } : { precision: 'unknown' };
  return {
    raw, audience: raw.audience, windows: raw.windows, verifiedFutureTarget,
    reviewReasons: action === 'needs_review' ? [reason] : [],
    record: {
      provider: 'claude', action, announced,
      effective: raw.effective_at === null ? { precision: 'unknown' } : { precision: 'exact', at: raw.effective_at },
      delivered: { precision: 'unknown' }, expiresOn: raw.reset_offer?.expires_on ?? null,
      audience: raw.audience.statement,
      provenance: {
        upstream: 'Claude Resets', upstreamUrl: raw.url, sourceUrl: originals[0]?.url ?? null,
        evidenceUrls: raw.sources.map((s) => s.url), externalId: raw.id, rawKind: raw.kind,
        rawStatus: raw.event_status, revision: String(raw.revision), historicalSeed: false, seedArchiveUrl: null,
      },
    },
  };
}
