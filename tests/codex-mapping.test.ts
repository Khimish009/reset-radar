import { describe, expect, it } from 'vitest';
import { codexAssessmentKey, mapCodexEvent, mapCodexScheduled } from '../src/providers/codex/mapping';
import { parseCodexFeed } from '../src/providers/codex/schema';
import { codexEvent, codexFeed, codexScheduled } from './fixtures/codex';

const now = new Date('2026-10-21T12:00:00Z');
const context = codexFeed();
const assessment = (
  raw: ReturnType<typeof codexEvent>, evidenceUrls: string[], assertion: 'applied' | 'future_announcement' = 'applied',
  futureTarget?: { precision: 'unknown' } | { precision: 'date'; on: string } | { precision: 'exact'; at: string },
) => ({
  recordKey: codexAssessmentKey(raw), assertion, evidenceUrls, primarySourceUrl: evidenceUrls[0] ?? raw.url,
  rationale: 'SYNTHETIC manual semantic review with matching source claim.',
  ...(futureTarget ? { futureTarget } : {}),
});

describe('reviewed primary evidence retention (SYNTHETIC)', () => {
  const primary = 'https://example.invalid/official/primary-announcement';
  const detectedAt = '2026-10-21T10:00:00Z';
  it.each(['applied', 'dated', 'undated', 'scheduled'] as const)(
    'preserves primary URL and review rationale for %s without mutating raw provenance', (scenario) => {
      const scheduled = codexScheduled();
      const event = codexEvent(scenario === 'applied' ? {
        delivered_at: '2026-10-21T09:00:00Z',
        delivered_source_url: 'https://example.invalid/relay/delivery-report',
      } : {});
      const raw = scenario === 'scheduled' ? scheduled : event;
      const review = {
        recordKey: codexAssessmentKey(raw),
        assertion: scenario === 'applied' ? 'applied' as const : 'future_announcement' as const,
        evidenceUrls: [raw.url, primary, ...(event.delivered_source_url ? [event.delivered_source_url] : [])],
        primarySourceUrl: primary, rationale: 'SYNTHETIC primary text independently reviewed.',
        audience: 'SYNTHETIC verified paid plans',
        ...(scenario === 'dated' ? { futureTarget: { precision: 'date' as const, on: '2026-10-23' } } : {}),
      };
      const mapped = scenario === 'scheduled'
        ? mapCodexScheduled(scheduled, { ...context, detectedAt }, now, review)
        : mapCodexEvent(event, { ...context, detectedAt }, now, review);
      expect(mapped.record.action).toBe(scenario === 'applied' ? 'confirmed_applied' : 'announced_future');
      expect(mapped.record.provenance.sourceUrl).toBe(raw.url);
      expect(mapped.record.provenance.evidenceUrls).toContain(primary);
      expect(mapped.reviewedEvidence).toEqual(review);
      expect(mapped.detectedAt).toBe(detectedAt);
      review.evidenceUrls.push('https://example.invalid/late-mutated-input');
      expect(mapped.reviewedEvidence?.evidenceUrls).not.toContain('https://example.invalid/late-mutated-input');
    },
  );

  it('does not import URLs, primary claims or audience from stale or invalid assessments', () => {
    const raw = codexScheduled();
    const review = {
      recordKey: codexAssessmentKey(raw), assertion: 'future_announcement' as const,
      evidenceUrls: [raw.url, primary], primarySourceUrl: primary,
      rationale: 'SYNTHETIC review', audience: 'SYNTHETIC verified audience',
    };
    for (const rejected of [
      { ...review, recordKey: 'stale' },
      { ...review, evidenceUrls: [raw.url] },
      { ...review, primarySourceUrl: 'https://example.invalid/' },
      { ...review, evidenceUrls: [raw.url, primary, 'javascript:invalid'] },
    ]) {
      const mapped = mapCodexScheduled(raw, context, now, rejected);
      expect(mapped.record.action).toBe('needs_review');
      expect(mapped.reviewedEvidence).toBeNull();
      expect(mapped.record.audience).toBeNull();
      expect(mapped.record.provenance.evidenceUrls).not.toContain(primary);
    }
    const hinted = mapCodexScheduled({ ...raw, certainty: 'hinted' }, context, now, review);
    expect(hinted.reviewedEvidence).toBeNull();
    expect(hinted.record.audience).toBeNull();
    const event = codexEvent();
    const staleEvent = mapCodexEvent(event, context, now, { ...review, recordKey: 'stale' });
    expect(staleEvent.reviewedEvidence).toBeNull();
    expect(staleEvent.record.provenance.evidenceUrls).not.toContain(primary);
  });
});

describe('codexreset.ai v1 schema and synthetic fixtures', () => {
  it('accepts a complete feed with loose scope, optional exact timestamps, and scheduled null', () => {
    const raw = codexFeed({ events: [codexEvent({ scope: 'team + named early-access group' })] });
    expect(parseCodexFeed(raw)).toEqual(raw);
  });

  it('rejects unknown version, fields, enum values, missing fields, and duplicate IDs safely', () => {
    const good = codexFeed();
    const cases: unknown[] = [
      { ...good, schema_version: 2 },
      { ...good, extra: 'SYNTHETIC secret payload' },
      { ...good, events: [codexEvent({ kind: 'forecast' as unknown as 'regular' })] },
      { ...good, events: [{ ...good.events[0], extra: 'SYNTHETIC nested field' }] },
      { ...good, events: [((event) => { const copy = { ...event }; delete (copy as Partial<typeof copy>).id; return copy; })(codexEvent())] },
      { ...good, events: [codexEvent(), codexEvent()] },
      { ...good, events: [codexEvent({ date: '2026-02-30' })] },
      { ...good, events: [codexEvent({ announced_at: '2026-10-20T10:00:00+00:00' })] },
      { ...good, generated_at: null },
      { ...good, events: [codexEvent({ summary: null as unknown as string })] },
      { ...good, attribution: { ...good.attribution, unknown: 'SYNTHETIC' } as typeof good.attribution },
      { ...good, attribution: ((value) => { const copy = { ...value }; delete (copy as Partial<typeof copy>).note; return copy; })(good.attribution) as typeof good.attribution },
      { ...good, attribution: { ...good.attribution, note: 'n'.repeat(2049) } },
      { ...good, events: Array.from({ length: 5001 }, (_, index) => codexEvent({ id: `synthetic-${index}` })) },
      { ...good, scheduled: { ...codexScheduled(), certainty: 'maybe' as 'announced' } },
      { ...good, scheduled: { ...codexScheduled(), extra: 'SYNTHETIC' } as typeof good.scheduled },
      { ...good, scheduled: ((value) => { const copy = { ...value }; delete (copy as Partial<typeof copy>).source; return copy; })(codexScheduled()) as typeof good.scheduled },
      { ...good, scheduled: ((value) => { const copy = { ...value }; delete (copy as Partial<typeof copy>).day; return copy; })(codexScheduled()) as typeof good.scheduled },
      { ...good, scheduled: { ...codexScheduled(), source: '' } },
      { ...good, scheduled: { ...codexScheduled(), day: null as unknown as string } },
      { ...good, scheduled: { ...codexScheduled(), when_text: 'w'.repeat(1025) } },
    ];
    for (const input of cases) {
      expect(() => parseCodexFeed(input)).toThrowError('codex_schema_rejected');
      try { parseCodexFeed(input); } catch (error) {
        expect((error as Error).message).not.toContain('SYNTHETIC secret payload');
      }
    }
  });

  it('keeps null seeded timestamp and archive attribution without deriving precision from date', () => {
    const raw = codexEvent({ seeded: true, ts: null, announced_at: null, delivered_at: null, summary_unavailable: true });
    const feed = parseCodexFeed(codexFeed({ events: [raw] }));
    const mapped = mapCodexEvent(feed.events[0]!, feed, now);
    expect(mapped.raw.ts).toBeNull();
    expect(mapped.raw.date).toBe('2026-10-20');
    expect(mapped.record.effective).toEqual({ precision: 'unknown' });
    expect(mapped.record.announced).toEqual({ precision: 'unknown' });
    expect(mapped.record.provenance).toMatchObject({
      historicalSeed: true, seedArchiveUrl: feed.attribution.seed_archive, revision: null, rawStatus: null,
    });
    expect(mapped.attribution).toEqual(feed.attribution);
    expect(mapped.raw.summary_unavailable).toBe(true);
    expect(mapped.record.audience).toBe(raw.scope);
  });
});

describe('Codex event mapping', () => {
  it('keeps announcement and delivery separate; ts does not establish effective time', () => {
    const raw = codexEvent({
      ts: '2026-10-20T15:00:00Z', announced_at: '2026-10-19T10:00:00Z',
      delivered_at: '2026-10-20T16:00:00Z', delivered_source_url: 'https://example.invalid/posts/delivery-1',
    });
    const unreviewed = mapCodexEvent(raw, context, now);
    expect(unreviewed.record.action).toBe('needs_review');
    expect(unreviewed.record.announced).toEqual({ precision: 'exact', at: raw.announced_at });
    expect(unreviewed.record.effective).toEqual({ precision: 'unknown' });
    expect(unreviewed.record.delivered).toEqual({ precision: 'exact', at: raw.delivered_at });
    const reviewed = mapCodexEvent(raw, context, now, assessment(raw, [raw.delivered_source_url!]));
    expect(reviewed.record.action).toBe('confirmed_applied');
    expect(reviewed.record.effective).toEqual({ precision: 'unknown' });
    expect(reviewed.record.provenance.evidenceUrls).toContain(raw.delivered_source_url);
    expect(reviewed.expectedTime).toEqual({ precision: 'unknown' });
  });

  it('maps a reviewed current undated future announcement without inventing a target', () => {
    const raw = codexEvent({ delivered_at: null, announced_at: '2026-10-20T09:00:00Z' });
    const detection = '2026-10-20T10:00:00.000Z';
    for (const target of [undefined, { precision: 'unknown' as const }]) {
      const mapped = mapCodexEvent(raw, { ...context, detectedAt: detection }, now,
        assessment(raw, [raw.url], 'future_announcement', target));
      expect(mapped.record.action).toBe('announced_future');
      expect(mapped.detectedAt).toBe(detection);
      expect(mapped.record.announced).toEqual({ precision: 'exact', at: raw.announced_at });
      expect(mapped.expectedTime).toEqual({ precision: 'unknown' });
      expect(mapped.verifiedFutureTarget).toBeNull();
      expect(mapped.record.provenance.sourceUrl).toBe(raw.url);
      expect(mapped.record.audience).toBe(raw.scope);
      expect(mapped.record.effective).toEqual({ precision: 'unknown' });
    }
  });

  it('uses a reviewed future date or instant with its original precision', () => {
    const raw = codexEvent();
    const targets = [
      { precision: 'date' as const, on: '2026-10-22' },
      { precision: 'exact' as const, at: '2026-10-22T10:00:00Z' },
    ];
    for (const target of targets) {
      const mapped = mapCodexEvent(raw, context, now, assessment(raw, [raw.url], 'future_announcement', target));
      expect(mapped.record.action).toBe('announced_future');
      expect(mapped.expectedTime).toEqual(target);
      expect(mapped.verifiedFutureTarget).toEqual(target);
    }
  });

  it('does not turn expired or invalid reviewed targets into undated announcements', () => {
    const raw = codexEvent();
    const targets = [
      { precision: 'date' as const, on: '2026-10-21' },
      { precision: 'exact' as const, at: '2026-10-21T11:59:59Z' },
      { precision: 'date' as const, on: '2026-02-30' },
    ];
    for (const target of targets) {
      const mapped = mapCodexEvent(raw, context, now, assessment(raw, [raw.url], 'future_announcement', target));
      expect(mapped.record.action).toBe('needs_review');
      expect(mapped.expectedTime).toEqual({ precision: 'unknown' });
      expect(mapped.verifiedFutureTarget).toBeNull();
    }
  });

  it('does not promote a missing, future-dated, or homepage announcement', () => {
    const cases = [
      codexEvent({ announced_at: null }),
      codexEvent({ announced_at: '2026-10-21T12:00:00.001Z' }),
      codexEvent({ url: 'https://example.invalid/' }),
    ];
    for (const raw of cases) {
      const mapped = mapCodexEvent(raw, context, now, assessment(raw, [raw.url], 'future_announcement'));
      expect(mapped.record.action).toBe('needs_review');
      expect(mapped.expectedTime).toEqual({ precision: 'unknown' });
    }
  });

  it('keeps old unreviewed regular events in review and falls back to current detection time', () => {
    const raw = codexEvent({ announced_at: '2025-01-01T00:00:00Z' });
    const mapped = mapCodexEvent(raw, context, now);
    expect(mapped.record.action).toBe('needs_review');
    expect(mapped.detectedAt).toBe(now.toISOString());
  });

  it.each([
    ['missing delivery timestamp', codexEvent({ delivered_source_url: 'https://example.invalid/delivery' }), undefined],
    ['homepage as delivery evidence', codexEvent({ delivered_at: '2026-10-20T16:00:00Z', delivered_source_url: 'https://example.invalid/' }), 'https://example.invalid/'],
    ['assessment omits exact delivery URL', codexEvent({ delivered_at: '2026-10-20T16:00:00Z', delivered_source_url: 'https://example.invalid/posts/delivery' }), 'https://example.invalid/other'],
    ['future delivery timestamp', codexEvent({ delivered_at: '2026-10-21T12:00:00.001Z', delivered_source_url: 'https://example.invalid/posts/delivery' }), 'https://example.invalid/posts/delivery'],
  ])('leaves %s in review', (_label, raw, evidence) => {
    const mapped = mapCodexEvent(raw, context, now, evidence ? assessment(raw, [evidence]) : undefined);
    expect(mapped.record.action).toBe('needs_review');
    expect(mapped.verifiedFutureTarget).toBeNull();
  });

  it('invalidates stale assessments when any raw field changes and requires rationale', () => {
    const raw = codexEvent({ delivered_at: '2026-10-20T16:00:00Z', delivered_source_url: 'https://example.invalid/posts/delivery' });
    const reviewed = assessment(raw, [raw.delivered_source_url!]);
    expect(mapCodexEvent({ ...raw, scope: 'changed scope' }, context, now, reviewed).record.action).toBe('needs_review');
    expect(mapCodexEvent(raw, context, now, { ...reviewed, rationale: '  ' }).record.action).toBe('needs_review');
  });

  it('creates the same assessment key independent of object property insertion order', () => {
    const raw = codexEvent();
    const reordered = Object.fromEntries(Object.entries(raw).reverse()) as typeof raw;
    expect(codexAssessmentKey(reordered)).toBe(codexAssessmentKey(raw));
  });

  it('does not infer effective time from either null or exact ts, even when date differs', () => {
    const exact = codexEvent({ ts: '2026-10-20T12:00:00Z', date: '2026-10-20' });
    const noTs = codexEvent({ ts: null, date: '2026-10-20' });
    expect(mapCodexEvent(exact, context, now).record.effective).toEqual({ precision: 'unknown' });
    expect(mapCodexEvent(noTs, context, now).record.effective).toEqual({ precision: 'unknown' });
    expect(mapCodexEvent(exact, context, now).raw.ts).toBe(exact.ts);
    expect(mapCodexEvent(noTs, context, now).raw.date).toBe(noTs.date);
  });

  it('keeps delivered_at null in review even when assessment explicitly asserts applied', () => {
    const raw = codexEvent({ delivered_at: null, delivered_source_url: 'https://example.invalid/posts/delivery' });
    const result = mapCodexEvent(raw, context, now, assessment(raw, [raw.delivered_source_url!], 'applied'));
    expect(result.record.action).toBe('needs_review');
    expect(result.record.delivered).toEqual({ precision: 'unknown' });
  });

  it('always represents banked items as offers, even with delivery fields', () => {
    const raw = codexEvent({ kind: 'banked', delivered_at: '2026-10-20T16:00:00Z', delivered_source_url: 'https://example.invalid/posts/banked' });
    const mapped = mapCodexEvent(raw, context, now, assessment(raw, [raw.delivered_source_url!]));
    expect(mapped.record.action).toBe('banked_offer');
    expect(mapped.record.action).not.toBe('confirmed_applied');
  });
});

describe('Codex scheduled mapping', () => {
  const scheduledAssessment = (raw: ReturnType<typeof codexScheduled>) => ({
    recordKey: codexAssessmentKey(raw), assertion: 'future_announcement' as const,
    evidenceUrls: [raw.url], primarySourceUrl: raw.url,
    rationale: 'SYNTHETIC review confirms explicit current future announcement.',
  });

  it('keeps hinted and unassessed announcements in review', () => {
    const hinted = codexScheduled({ certainty: 'hinted' });
    expect(mapCodexScheduled(hinted, context, now, scheduledAssessment(hinted)).record.action).toBe('needs_review');
    expect(mapCodexScheduled(codexScheduled(), context, now).record.action).toBe('needs_review');
  });

  it('accepts exact targets only strictly after now, and keeps date-only targets date-only', () => {
    const exact = codexScheduled({ scheduled_for: '2026-10-21T12:00:00.001Z' });
    const exactResult = mapCodexScheduled(exact, context, now, scheduledAssessment(exact));
    expect(exactResult.record.action).toBe('announced_future');
    expect(exactResult.verifiedFutureTarget).toEqual({ precision: 'exact', at: exact.scheduled_for });
    expect(exactResult.expectedTime).toEqual(exactResult.verifiedFutureTarget);
    const boundary = codexScheduled({ scheduled_for: '2026-10-21T12:00:00Z' });
    expect(mapCodexScheduled(boundary, context, now, scheduledAssessment(boundary)).verifiedFutureTarget).toBeNull();
    const dateOnly = codexScheduled({ day: '2026-10-22', scheduled_for: null });
    const dateResult = mapCodexScheduled(dateOnly, context, now, scheduledAssessment(dateOnly));
    expect(dateResult.verifiedFutureTarget).toEqual({ precision: 'date', on: '2026-10-22' });
    expect(dateResult.expectedTime).toEqual(dateResult.verifiedFutureTarget);
    expect(dateResult.record.effective).toEqual({ precision: 'unknown' });
  });

  it('keeps expired, stale, and hinted targets unverified and uses URL as scheduled identity', () => {
    const expired = codexScheduled({ day: '2026-10-21', scheduled_for: null });
    const result = mapCodexScheduled(expired, context, now, scheduledAssessment(expired));
    expect(result.record.action).toBe('needs_review');
    expect(result.verifiedFutureTarget).toBeNull();
    expect(result.record.provenance.externalId).toBe(expired.url);
    expect(result.record.provenance.revision).toBeNull();
    expect(result.record.provenance.rawKind).toBeNull();
    expect(result.record.provenance.rawStatus).toBeNull();
    expect(mapCodexScheduled(expired, context, now, { ...scheduledAssessment(expired), recordKey: 'stale' }).record.action).toBe('needs_review');
  });

  it.each([
    ['yesterday', '2026-10-19', '2026-10-20T12:00:00Z', false],
    ['today', '2026-10-20', '2026-10-20T12:00:00Z', false],
    ['tomorrow', '2026-10-21', '2026-10-20T12:00:00Z', true],
    ['tomorrow when local clock is +14 hours', '2026-10-21', '2026-10-21T03:00:00+14:00', true],
    ['today at UTC after -12 local offset', '2026-10-21', '2026-10-20T23:30:00-12:00', false],
    ['date before +14 offset local day at UTC midnight boundary', '2026-10-21', '2026-10-20T23:59:59.999Z', true],
    ['today exactly after UTC midnight despite +14 offset', '2026-10-21', '2026-10-21T00:00:00.001Z', false],
    ['UTC day after -12 offset local day', '2026-10-22', '2026-10-21T23:59:59.999Z', true],
  ])('compares date-only target by UTC date: %s', (_label, day, clock, expected) => {
    const raw = codexScheduled({ day, scheduled_for: null });
    const result = mapCodexScheduled(raw, context, new Date(clock), scheduledAssessment(raw));
    expect(result.record.action).toBe(expected ? 'announced_future' : 'needs_review');
    expect(result.verifiedFutureTarget).toEqual(expected ? { precision: 'date', on: day } : null);
  });

  it.each([
    ['homepage', codexScheduled({ url: 'https://example.invalid/' })],
    ['announcement from future', codexScheduled({ announced_at: '2026-10-21T12:00:00.001Z' })],
    ['empty source', codexScheduled({ source: '   ' })],
  ])('does not promote scheduled item with %s despite assessment', (_label, raw) => {
    const result = mapCodexScheduled(raw, context, now, scheduledAssessment(raw));
    expect(result.record.action).toBe('needs_review');
    expect(result.verifiedFutureTarget).toBeNull();
  });

  it('uses explicitly reviewed scheduled audience only and preserves detection and announcement times', () => {
    const raw = codexScheduled({ announced_at: '2026-10-20T10:00:00Z' });
    const detection = '2026-10-20T11:00:00Z';
    const withoutAudience = mapCodexScheduled(raw, { ...context, detectedAt: detection }, now, scheduledAssessment(raw));
    expect(withoutAudience.record.action).toBe('announced_future');
    expect(withoutAudience.record.audience).toBeNull();
    expect(withoutAudience.detectedAt).toBe(detection);
    expect(withoutAudience.record.announced).toEqual({ precision: 'exact', at: raw.announced_at });
    const reviewedAudience = mapCodexScheduled(raw, context, now, {
      ...scheduledAssessment(raw), audience: 'SYNTHETIC paid and enterprise scope',
    });
    expect(reviewedAudience.record.audience).toBe('SYNTHETIC paid and enterprise scope');
    const unreviewed = mapCodexScheduled(raw, context, now);
    expect(unreviewed.record.audience).toBeNull();
  });
});
