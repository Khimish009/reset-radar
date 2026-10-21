import { describe, expect, it } from 'vitest';
import {
  canonicalJson, digest, normalizeClaude, normalizeCodexEvent, normalizeCodexScheduled, rawAssessmentKey,
} from '../src/domain/normalization';
import type { DurableEventPayload, LocalAssessment } from '../src/domain/normalization';
import { syntheticEvent } from './fixtures/claude';
import { codexEvent, codexFeed, codexScheduled } from './fixtures/codex';

const NOW = new Date('2026-10-22T12:00:00.000Z');
const detectedAt = '2026-10-22T12:00:00.000Z';
const context = codexFeed();

async function assessment(provider: 'claude' | 'codex', raw: Parameters<typeof rawAssessmentKey>[1], fields: Partial<LocalAssessment> = {}): Promise<LocalAssessment> {
  return {
    recordKey: await rawAssessmentKey(provider, raw), assertion: 'applied',
    primarySourceUrl: 'https://example.invalid/source/synthetic-original-001',
    evidenceUrls: ['https://example.invalid/source/synthetic-original-001'], rationale: 'SYNTHETIC reviewed evidence',
    ...fields,
  };
}

function payload(serialized: string): DurableEventPayload {
  return JSON.parse(serialized) as DurableEventPayload;
}

describe('canonical normalization primitives', () => {
  it('canonicalizes object key order and hashes JSON deterministically', async () => {
    expect(canonicalJson({ z: 1, a: { y: true, x: null } })).toBe('{"a":{"x":null,"y":true},"z":1}');
    expect(await digest({ z: 1, a: 2 })).toBe(await digest({ a: 2, z: 1 }));
  });

  it('binds assessments to the complete raw object, including editorial fields', async () => {
    const original = syntheticEvent();
    expect(await rawAssessmentKey('claude', original)).not.toBe(await rawAssessmentKey('claude', { ...original, summary: 'edited text' }));
  });
});

describe('shared normalization policy', () => {
  it('accepts explicitly reviewed Claude exact and Codex date announcements without claiming delivery', async () => {
    const claude = syntheticEvent({ event_status: 'announced', effective_at: null });
    const claudeAssessment = await assessment('claude', claude, {
      assertion: 'future_announcement', futureTarget: { precision: 'exact', at: '2026-10-24T10:00:00Z' },
      evidenceUrls: [claude.sources[0]!.url, 'https://example.invalid/review/independent-primary'],
    });
    const claudeStored = await normalizeClaude(claude, { now: NOW, detectedAt, assessment: claudeAssessment });
    const claudePayload = payload(claudeStored.payload);
    expect(claudeStored.action).toBe('announced_future');
    expect(claudePayload.expectedTime).toEqual({ precision: 'exact', at: '2026-10-24T10:00:00Z' });
    expect(claudePayload.verifiedDelivery).toEqual({ precision: 'unknown' });
    expect(claudePayload.reviewedEvidence).toMatchObject({ assertion: 'future_announcement', primarySourceUrl: claude.sources[0]?.url });
    expect(claudePayload.record.provenance.evidenceUrls).toContain('https://example.invalid/review/independent-primary');

    const scheduled = codexScheduled({ scheduled_for: null, day: '2026-10-24' });
    const codexAssessment = await assessment('codex', scheduled, {
      assertion: 'future_announcement', primarySourceUrl: scheduled.url, evidenceUrls: [scheduled.url],
      futureTarget: { precision: 'date', on: '2026-10-24' }, audience: 'synthetic subscribers',
    });
    const codexStored = await normalizeCodexScheduled(scheduled, context, { now: NOW, detectedAt, assessment: codexAssessment });
    const codexPayload = payload(codexStored.payload);
    expect(codexStored.action).toBe('announced_future');
    expect(codexPayload.expectedTime).toEqual({ precision: 'date', on: '2026-10-24' });
    expect(codexPayload.verifiedFutureTarget).toEqual(codexPayload.expectedTime);
    expect(codexPayload.reviewedEvidence?.audience).toBe('synthetic subscribers');
  });

  it('keeps unreviewed or unknown future targets in review and never fabricates a delivery time', async () => {
    const claude = syntheticEvent({ event_status: 'announced', effective_at: null });
    const unknown = await assessment('claude', claude, { assertion: 'applied' });
    const claudeStored = await normalizeClaude(claude, { now: NOW, detectedAt, assessment: unknown });
    expect(claudeStored.action).toBe('needs_review');
    expect(payload(claudeStored.payload).expectedTime).toEqual({ precision: 'unknown' });

    const regular = codexEvent({ delivered_at: null, announced_at: '2026-10-22T11:00:00Z' });
    const regularAssessment = await assessment('codex', regular, {
      assertion: 'future_announcement', primarySourceUrl: regular.url, evidenceUrls: [regular.url],
    });
    const regularStored = await normalizeCodexEvent(regular, context, { now: NOW, detectedAt, assessment: regularAssessment });
    expect(regularStored.action).toBe('announced_future');
    expect(payload(regularStored.payload).expectedTime).toEqual({ precision: 'unknown' });
    expect(payload(regularStored.payload).verifiedFutureTarget).toBeNull();
    expect(payload(regularStored.payload).verifiedDelivery).toEqual({ precision: 'unknown' });
  });

  it('accepts a reviewed Claude future announcement with unknown target without inferring from announced_at', async () => {
    const raw = syntheticEvent({ event_status: 'announced', effective_at: null, utc_day: null });
    const local = await assessment('claude', raw, { assertion: 'future_announcement' });
    const stored = await normalizeClaude(raw, { now: NOW, detectedAt, assessment: local });
    const durable = payload(stored.payload);
    expect(stored.action).toBe('announced_future');
    expect(durable.expectedTime).toEqual({ precision: 'unknown' });
    expect(durable.verifiedFutureTarget).toBeNull();
    expect(durable.record.announced).toEqual({ precision: 'exact', at: raw.announced_at });
    expect(durable.verifiedDelivery).toEqual({ precision: 'unknown' });
  });

  it('keeps Codex hinted scheduled entries in review even with matching local evidence', async () => {
    const raw = codexScheduled({ certainty: 'hinted' });
    const local = await assessment('codex', raw, {
      assertion: 'future_announcement', primarySourceUrl: raw.url, evidenceUrls: [raw.url],
      futureTarget: { precision: 'date', on: raw.day },
    });
    const stored = await normalizeCodexScheduled(raw, context, { now: NOW, detectedAt, assessment: local });
    expect(stored.action).toBe('needs_review');
    expect(payload(stored.payload).reviewedEvidence).toBeNull();
    expect(payload(stored.payload).reviewReasons).toContain('scheduled_is_hinted');
  });

  it.each(['correction', 'retraction'] as const)('never promotes an explicit Claude %s through the unknown-future path', async (kind) => {
    const raw = syntheticEvent({
      event_status: 'announced', revision: 2,
      correction: { kind, reason: 'SYNTHETIC explicit change', at: '2026-10-22T11:00:00Z' },
    });
    const local = await assessment('claude', raw, { assertion: 'future_announcement' });
    const stored = await normalizeClaude(raw, { now: NOW, detectedAt, assessment: local });
    expect(stored.action).toBe('needs_review');
    expect(stored.candidate).toBe(false);
    expect(payload(stored.payload).reviewedEvidence).toBeNull();
    expect(payload(stored.payload).reviewReasons).toContain(kind === 'retraction' ? 'unverified_withdrawal' : 'unverified_correction');
  });

  it('invalidates a same-revision Claude assessment after any raw edit', async () => {
    const original = syntheticEvent();
    const local = await assessment('claude', original);
    const edited = { ...original, summary: 'SYNTHETIC revised editorial text, same revision' };
    const stored = await normalizeClaude(edited, { now: NOW, detectedAt, assessment: local });
    expect(stored.upstreamRevision).toBe(String(original.revision));
    expect(stored.action).toBe('needs_review');
    expect(payload(stored.payload).reviewedEvidence).toBeNull();
    expect(stored.observationKey).not.toBe((await normalizeClaude(original, { now: NOW, detectedAt, assessment: local })).observationKey);
  });

  it('requires an exact current Claude banked offer assessment', async () => {
    const raw = syntheticEvent({ kind: 'credit', reset_offer: { expires_on: '2026-11-01' } });
    const without = await normalizeClaude(raw, { now: NOW, detectedAt });
    expect(without.action).toBe('needs_review');
    expect(payload(without.payload).reviewReasons).toContain('banked_offer_unverified');
    const local = await assessment('claude', raw, {
      assertion: 'banked_offer', evidenceUrls: [raw.sources[0]!.url, raw.url],
    });
    const reviewed = await normalizeClaude(raw, { now: NOW, detectedAt, assessment: local });
    expect(reviewed.action).toBe('banked_offer');
    expect(payload(reviewed.payload).reviewedEvidence?.rationale).toBe(local.rationale);
  });

  it('accepts any current original Claude source and retains additional reviewed primary evidence', async () => {
    const first = syntheticEvent();
    const secondOriginal = { ...first.sources[0]!, url: 'https://example.invalid/source/second-original' };
    const raw = syntheticEvent({ sources: [...first.sources, secondOriginal] });
    const local = await assessment('claude', raw, {
      primarySourceUrl: secondOriginal.url,
      evidenceUrls: [secondOriginal.url, 'https://example.invalid/review/extra-primary'],
    });
    const stored = await normalizeClaude(raw, { now: NOW, detectedAt, assessment: local });
    const durable = payload(stored.payload);
    expect(stored.action).toBe('confirmed_applied');
    expect(durable.reviewedEvidence?.primarySourceUrl).toBe(secondOriginal.url);
    expect(durable.record.provenance.evidenceUrls).toContain('https://example.invalid/review/extra-primary');
  });

  it('preserves Codex P2 scheduled target validation reasons and rejects cross-precision', async () => {
    const raw = codexScheduled();
    const mismatch = await assessment('codex', raw, {
      assertion: 'future_announcement', primarySourceUrl: raw.url, evidenceUrls: [raw.url],
      futureTarget: { precision: 'exact', at: '2026-10-23T00:00:00Z' },
    });
    const stored = await normalizeCodexScheduled(raw, context, { now: NOW, detectedAt, assessment: mismatch });
    expect(stored.action).toBe('needs_review');
    expect(payload(stored.payload).reviewReasons).toContain('scheduled_future_target_precision_mismatch');
    expect(payload(stored.payload).reviewedEvidence).toBeNull();
  });

  it('separates upstream-reported delivery from verified delivery and does not invent Codex revisions', async () => {
    const raw = codexEvent({ delivered_at: '2026-10-21T11:00:00Z', delivered_source_url: 'https://example.invalid/posts/delivery' });
    const local = await assessment('codex', raw, {
      assertion: 'applied', primarySourceUrl: raw.delivered_source_url!, evidenceUrls: [raw.delivered_source_url!],
    });
    const stored = await normalizeCodexEvent(raw, context, { now: NOW, detectedAt, assessment: local });
    const durable = payload(stored.payload);
    expect(stored.action).toBe('confirmed_applied');
    expect(stored.upstreamRevision).toBeNull();
    expect(durable.upstreamReportedDelivery).toEqual({ precision: 'exact', at: raw.delivered_at });
    expect(durable.verifiedDelivery).toEqual({ precision: 'exact', at: raw.delivered_at });
  });

  it('does not let a stale or rejected assessment contribute evidence or audience', async () => {
    const raw = codexScheduled();
    const stale = await assessment('codex', raw, {
      recordKey: 'stale', assertion: 'future_announcement', primarySourceUrl: raw.url,
      evidenceUrls: [raw.url], audience: 'untrusted audience',
    });
    const stored = await normalizeCodexScheduled(raw, context, { now: NOW, detectedAt, assessment: stale });
    const durable = payload(stored.payload);
    expect(durable.reviewedEvidence).toBeNull();
    expect(durable.record.audience).toBeNull();
    expect(durable.record.provenance.evidenceUrls).not.toContain('untrusted audience');
  });

  it('keeps generated/editorial noise outside material hash but tracks scope, precision, and evidence', async () => {
    const raw = codexEvent({ kind: 'banked' });
    const changedSummary = codexEvent({ kind: 'banked', summary: 'SYNTHETIC changed display summary' });
    const base = await normalizeCodexEvent(raw, context, { now: NOW, detectedAt });
    const noise = await normalizeCodexEvent(changedSummary, context, { now: NOW, detectedAt });
    expect(noise.materialHash).toBe(base.materialHash);
    expect(noise.observationKey).not.toBe(base.observationKey);
    const changedScope = await normalizeCodexEvent(codexEvent({ scope: 'SYNTHETIC other scope' }), context, { now: NOW, detectedAt });
    expect(changedScope.materialHash).not.toBe(base.materialHash);

    const schedule = codexScheduled();
    const dateTarget = await normalizeCodexScheduled(schedule, context, { now: NOW, detectedAt });
    const exactTarget = await normalizeCodexScheduled(codexScheduled({ scheduled_for: '2026-10-23T09:00:00Z' }), context, { now: NOW, detectedAt });
    expect(exactTarget.materialHash).not.toBe(dateTarget.materialHash);

    const rationaleA = await assessment('codex', raw, {
      assertion: 'banked_offer', primarySourceUrl: raw.url, evidenceUrls: [raw.url], rationale: 'SYNTHETIC rationale one',
    });
    const rationaleB = await assessment('codex', raw, {
      assertion: 'banked_offer', primarySourceUrl: raw.url, evidenceUrls: [raw.url], rationale: 'SYNTHETIC rationale two',
    });
    const auditedA = await normalizeCodexEvent(raw, context, { now: NOW, detectedAt, assessment: rationaleA });
    const auditedB = await normalizeCodexEvent(raw, context, { now: NOW, detectedAt, assessment: rationaleB });
    expect(auditedA.materialHash).toBe(auditedB.materialHash);
    expect(auditedA.observationKey).not.toBe(auditedB.observationKey);
    expect(payload(auditedA.payload).reviewedEvidence?.rationale).toBe(rationaleA.rationale);

    const delivered = codexEvent({
      delivered_at: '2026-10-21T11:00:00Z', delivered_source_url: 'https://example.invalid/posts/delivery',
    });
    const evidenceOne = await assessment('codex', delivered, {
      assertion: 'applied', primarySourceUrl: delivered.delivered_source_url!,
      evidenceUrls: [delivered.delivered_source_url!, delivered.url],
    });
    const evidenceTwo = await assessment('codex', delivered, {
      assertion: 'applied', primarySourceUrl: delivered.delivered_source_url!,
      evidenceUrls: [delivered.delivered_source_url!],
    });
    const evidenceStoredOne = await normalizeCodexEvent(delivered, context, { now: NOW, detectedAt, assessment: evidenceOne });
    const evidenceStoredTwo = await normalizeCodexEvent(delivered, context, { now: NOW, detectedAt, assessment: evidenceTwo });
    expect(evidenceStoredOne.materialHash).not.toBe(evidenceStoredTwo.materialHash);
  });

  it('keeps Claude revision and correction wording in audit while excluding them from material hash', async () => {
    const initial = syntheticEvent();
    const revisionOnly = syntheticEvent({ revision: initial.revision + 1 });
    const initialStored = await normalizeClaude(initial, { now: NOW, detectedAt });
    const revisionStored = await normalizeClaude(revisionOnly, { now: NOW, detectedAt });
    expect(revisionStored.upstreamRevision).toBe(String(initial.revision + 1));
    expect(revisionStored.materialHash).toBe(initialStored.materialHash);
    expect(revisionStored.observationKey).not.toBe(initialStored.observationKey);

    const correction = syntheticEvent({
      event_status: 'retracted', correction: { kind: 'retraction', at: '2026-10-21T10:00:00Z', reason: 'SYNTHETIC reason one' },
    });
    const correctionWithTextEdit = {
      ...correction,
      correction: { ...correction.correction!, reason: 'SYNTHETIC reason two' },
    };
    const correctionOne = await normalizeClaude(correction, { now: NOW, detectedAt });
    const correctionTwo = await normalizeClaude(correctionWithTextEdit, { now: NOW, detectedAt });
    expect(payload(correctionOne.payload).rawFacts).toMatchObject({ correction: { reason: 'SYNTHETIC reason one' } });
    expect(payload(correctionTwo.payload).rawFacts).toMatchObject({ correction: { reason: 'SYNTHETIC reason two' } });
    expect(correctionTwo.materialHash).toBe(correctionOne.materialHash);
  });
});
