import type { EventAction, EventRecord, EventTime } from '../../domain/event';
import type { CodexEvent, CodexFeed, CodexScheduled } from './schema';
import { codexDate, codexInstant } from './schema';

export type CodexFeedContext = Pick<CodexFeed, 'source' | 'attribution'> & { detectedAt?: string };
export interface CodexEvidenceAssessment {
  /** Trusted local input after independent semantic review; never constructed automatically from feed data.
   * The key binds the assessment to every current field. */
  recordKey: string;
  assertion: 'applied' | 'future_announcement';
  evidenceUrls: readonly string[];
  /** Explicitly identified during semantic review, including when raw URLs are relays. */
  primarySourceUrl: string;
  rationale: string;
  /** Optional manually verified future target; omission/unknown preserves an undated announcement. */
  futureTarget?: EventTime;
  /** For scheduled items only: primary-source audience explicitly read during review. */
  audience?: string;
}
export type CodexFutureTarget = Exclude<EventTime, { readonly precision: 'unknown' }>;
export interface CodexMappedEvent {
  record: EventRecord;
  raw: CodexEvent;
  attribution: CodexFeed['attribution'];
  detectedAt: string;
  reviewReasons: readonly string[];
  expectedTime: EventTime;
  verifiedFutureTarget: CodexFutureTarget | null;
  /** Internal audit evidence only; absent for rejected/stale assessments. */
  reviewedEvidence: CodexEvidenceAssessment | null;
}
export interface CodexMappedScheduled {
  record: EventRecord;
  raw: CodexScheduled;
  attribution: CodexFeed['attribution'];
  detectedAt: string;
  reviewReasons: readonly string[];
  expectedTime: EventTime;
  verifiedFutureTarget: CodexFutureTarget | null;
  reviewedEvidence: CodexEvidenceAssessment | null;
}

/** Sorted object keys make this deterministic across parse/caller property order. Inputs are parsed contract values. */
function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (typeof value === 'object' && value !== null) {
    const object = value as Record<string, unknown>;
    return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(object[key])}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

export function codexAssessmentKey(raw: CodexEvent | CodexScheduled): string {
  return `codexreset.ai:v1:${canonicalJson(raw)}`;
}

function evidenceMatches(
  raw: CodexEvent | CodexScheduled,
  assessment: CodexEvidenceAssessment | undefined,
  required: readonly string[],
): assessment is CodexEvidenceAssessment {
  return assessment !== undefined && assessment.recordKey === codexAssessmentKey(raw) &&
    assessment.evidenceUrls.length > 0 && required.every((url) => assessment.evidenceUrls.includes(url)) &&
    assessment.evidenceUrls.every((url) => validEvidenceUrl(url)) &&
    validEvidenceUrl(assessment.primarySourceUrl, true) &&
    assessment.evidenceUrls.includes(assessment.primarySourceUrl) && assessment.rationale.trim().length > 0;
}

function validEvidenceUrl(value: string, concrete = false): boolean {
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password &&
      (!concrete || url.pathname !== '/');
  } catch { return false; }
}

function copyAssessment(assessment: CodexEvidenceAssessment): CodexEvidenceAssessment {
  return {
    ...assessment, evidenceUrls: [...assessment.evidenceUrls],
    ...(assessment.futureTarget ? { futureTarget: { ...assessment.futureTarget } } : {}),
  };
}

function exactOrUnknown(value: string | null): EventTime {
  return value === null ? { precision: 'unknown' } : { precision: 'exact', at: value };
}

function reviewedFutureTarget(
  target: EventTime | undefined, now: Date,
): { valid: boolean; target: CodexFutureTarget | null; expectedTime: EventTime } {
  if (target === undefined || target.precision === 'unknown') {
    return { valid: true, target: null, expectedTime: { precision: 'unknown' } };
  }
  try {
    if (target.precision === 'exact') {
      const at = codexInstant(target.at);
      if (Date.parse(at) > now.getTime()) return { valid: true, target: { precision: 'exact', at }, expectedTime: { precision: 'exact', at } };
    } else if (target.precision === 'date') {
      const on = codexDate(target.on);
      if (on > now.toISOString().slice(0, 10)) return { valid: true, target: { precision: 'date', on }, expectedTime: { precision: 'date', on } };
    }
  } catch { /* Invalid reviewed targets cannot promote an announcement. */ }
  return { valid: false, target: null, expectedTime: { precision: 'unknown' } };
}

function detectionTime(context: CodexFeedContext, now: Date): string {
  return context.detectedAt ?? now.toISOString();
}

function mapRegularOrBanked(
  raw: CodexEvent, context: CodexFeedContext, now: Date, assessment?: CodexEvidenceAssessment,
): CodexMappedEvent {
  const delivery = raw.delivered_at;
  const deliveryHasPath = raw.delivered_source_url !== null &&
    new URL(raw.delivered_source_url).pathname !== '/';
  const appliedAssessmentOk = delivery !== null && Date.parse(delivery) <= now.getTime() &&
    deliveryHasPath && evidenceMatches(raw, assessment, [raw.delivered_source_url!]) &&
    assessment.assertion === 'applied';
  const announcementUrlHasPath = new URL(raw.url).pathname !== '/';
  const currentAnnouncement = raw.announced_at !== null && Date.parse(raw.announced_at) <= now.getTime() && announcementUrlHasPath &&
    evidenceMatches(raw, assessment, [raw.url]) && assessment.assertion === 'future_announcement';
  const future = currentAnnouncement ? reviewedFutureTarget(assessment.futureTarget, now) : null;
  let action: EventAction = 'needs_review';
  let reviewReasons: string[] = [];
  let expectedTime: EventTime = { precision: 'unknown' };
  if (raw.kind === 'banked') {
    action = 'banked_offer';
  } else if (raw.kind === 'regular' && delivery === null && currentAnnouncement && future?.valid) {
    action = 'announced_future';
    expectedTime = future.expectedTime;
  } else if (raw.kind === 'regular' && delivery === null && currentAnnouncement && future !== null && !future.valid) {
    reviewReasons = ['future_target_invalid_or_expired'];
  } else if (raw.kind === 'regular' && appliedAssessmentOk) {
    action = 'confirmed_applied';
    expectedTime = { precision: 'unknown' };
  } else {
    reviewReasons = [delivery === null ? 'delivery_unverified_or_announcement_unverified' : 'insufficient_or_stale_delivery_evidence'];
  }
  const announced = exactOrUnknown(raw.announced_at);
  const reviewedEvidence = (action === 'announced_future' || action === 'confirmed_applied') && assessment
    ? copyAssessment(assessment) : null;
  return {
    raw, attribution: context.attribution, detectedAt: detectionTime(context, now), reviewReasons, expectedTime,
    reviewedEvidence,
    verifiedFutureTarget: action === 'announced_future' ? future?.target ?? null : null,
    record: {
      provider: 'codex', action, announced,
      // ts/date are source timestamps/labels, not evidence that the reset was applied.
      effective: { precision: 'unknown' }, delivered: exactOrUnknown(raw.delivered_at),
      expiresOn: null, audience: raw.scope,
      provenance: {
        upstream: 'codexreset.ai', upstreamUrl: context.source, sourceUrl: raw.url,
        evidenceUrls: [...new Set([raw.url, ...(raw.delivered_source_url ? [raw.delivered_source_url] : []),
          ...(reviewedEvidence?.evidenceUrls ?? [])])],
        externalId: raw.id, rawKind: raw.kind, rawStatus: null, revision: null,
        historicalSeed: raw.seeded, seedArchiveUrl: raw.seeded ? context.attribution.seed_archive : null,
      },
    },
  };
}

function mapScheduled(
  raw: CodexScheduled, context: CodexFeedContext, now: Date, assessment?: CodexEvidenceAssessment,
): CodexMappedScheduled {
  let verifiedFutureTarget: CodexFutureTarget | null = null;
  let action: EventAction = 'needs_review';
  let expectedTime: EventTime = { precision: 'unknown' };
  let reviewReasons: string[] = [raw.certainty === 'hinted' ? 'scheduled_is_hinted' : 'scheduled_not_verified'];
  const urlHasPath = new URL(raw.url).pathname !== '/';
  if (raw.certainty === 'announced' && urlHasPath && raw.source.trim().length > 0 &&
      Date.parse(raw.announced_at) <= now.getTime() && evidenceMatches(raw, assessment, [raw.url]) &&
      assessment.assertion === 'future_announcement') {
    try {
      if (raw.scheduled_for !== null) {
        const exact = codexInstant(raw.scheduled_for);
        if (Date.parse(exact) > now.getTime()) verifiedFutureTarget = { precision: 'exact', at: exact };
      } else {
        const day = codexDate(raw.day);
        if (day > now.toISOString().slice(0, 10)) verifiedFutureTarget = { precision: 'date', on: day };
      }
    } catch { /* Invalid targets cannot be promoted. */ }
    if (verifiedFutureTarget !== null) {
      action = 'announced_future';
      expectedTime = verifiedFutureTarget;
      reviewReasons = [];
    } else {
      reviewReasons = ['scheduled_target_not_future'];
    }
  }
  const reviewedEvidence = action === 'announced_future' && assessment ? copyAssessment(assessment) : null;
  return {
    raw, attribution: context.attribution, detectedAt: detectionTime(context, now), reviewReasons, expectedTime, verifiedFutureTarget,
    reviewedEvidence,
    record: {
      provider: 'codex', action, announced: { precision: 'exact', at: raw.announced_at },
      effective: { precision: 'unknown' }, delivered: { precision: 'unknown' },
      expiresOn: null,
      audience: reviewedEvidence?.audience?.trim() ? reviewedEvidence.audience : null,
      provenance: {
        upstream: 'codexreset.ai', upstreamUrl: context.source, sourceUrl: raw.url,
        evidenceUrls: [...new Set([raw.url, ...(reviewedEvidence?.evidenceUrls ?? [])])],
        // No scheduled upstream ID exists. Its source URL is the stable source-specific identity.
        externalId: raw.url, rawKind: null, rawStatus: null, revision: null,
        historicalSeed: false, seedArchiveUrl: null,
      },
    },
  };
}

export function mapCodexEvent(
  raw: CodexEvent, feedContext: CodexFeedContext, now: Date, assessment?: CodexEvidenceAssessment,
): CodexMappedEvent {
  return mapRegularOrBanked(raw, feedContext, now, assessment);
}

export function mapCodexScheduled(
  raw: CodexScheduled, feedContext: CodexFeedContext, now: Date, assessment?: CodexEvidenceAssessment,
): CodexMappedScheduled {
  return mapScheduled(raw, feedContext, now, assessment);
}
