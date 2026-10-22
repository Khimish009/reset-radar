import { describe, expect, it } from 'vitest';
import { normalizeClaude, rawAssessmentKey } from '../src/domain/normalization';
import type { DurableEventPayload, LocalAssessment } from '../src/domain/normalization';
import type { EventAction, Provider } from '../src/domain/event';
import type { LoadedEvent } from '../src/storage/types';
import { syntheticEvent } from './fixtures/claude';
import { renderTelegramMessage } from '../src/telegram/templates';

const PRIMARY = 'https://example.invalid/source/synthetic-primary';

function payload(
  provider: Provider,
  action: EventAction,
  overrides: Partial<DurableEventPayload> = {},
): DurableEventPayload {
  const assertion: LocalAssessment['assertion'] = action === 'announced_future' ? 'future_announcement' :
    action === 'confirmed_applied' ? 'applied' : action === 'banked_offer' ? 'banked_offer' :
      action === 'correction' ? 'correction' : 'withdrawal';
  const evidence: LocalAssessment = {
    recordKey: 'synthetic-raw-key', assertion, primarySourceUrl: PRIMARY,
    evidenceUrls: [PRIMARY], rationale: 'SYNTHETIC review evidence; test fixture only.',
    ...(action === 'announced_future' ? { futureTarget: { precision: 'date' as const, on: '2026-10-25' } } : {}),
    ...(action === 'correction' || action === 'withdrawal' ? { previousTransitionId: 'synthetic-prior-transition' } : {}),
  };
  const rawKind = provider === 'claude'
    ? action === 'banked_offer' ? 'credit' : 'usage_reset'
    : action === 'banked_offer' ? 'banked' : 'regular';
  const codexDelivery = action === 'confirmed_applied' ? '2026-10-20T12:00:00Z' : null;
  const verifiedDelivery = provider === 'codex' && codexDelivery
    ? { precision: 'exact' as const, at: codexDelivery } : { precision: 'unknown' as const };
  return {
    record: {
      provider, action,
      provenance: {
        upstream: provider === 'claude' ? 'Claude Resets' : 'codexreset.ai',
        upstreamUrl: provider === 'claude' ? 'https://clauderesets.com/' : 'https://codexreset.ai/',
        sourceUrl: PRIMARY, evidenceUrls: [PRIMARY], externalId: 'synthetic-event-id',
        rawKind, rawStatus: null, revision: '1', historicalSeed: false, seedArchiveUrl: null,
      },
      announced: { precision: 'exact', at: '2026-10-20T10:00:00Z' },
      effective: { precision: 'unknown' }, delivered: { precision: 'unknown' },
      expiresOn: null, audience: 'synthetic subscribers',
    },
    rawKey: 'synthetic-raw-key', rawFacts: provider === 'claude'
      ? {
        kind: rawKind, status: action === 'announced_future' ? 'announced' : 'confirmed',
        allocation: 'subscription_usage',
      }
      : {
        kind: rawKind, seeded: false, deliveredAt: codexDelivery,
        deliveredSourceUrl: codexDelivery ? PRIMARY : null,
      },
    expectedTime: action === 'announced_future' ? { precision: 'date', on: '2026-10-25' } : { precision: 'unknown' },
    verifiedFutureTarget: action === 'announced_future' ? { precision: 'date', on: '2026-10-25' } : null,
    reviewedEvidence: evidence, reviewReasons: [],
    upstreamReportedDelivery: verifiedDelivery, verifiedDelivery,
    ...(provider === 'claude' ? { windows: ['five_hour', 'weekly'] as const } : {}),
    ...overrides,
  };
}

function prior(current: DurableEventPayload, overrides: Partial<DurableEventPayload> = {}): DurableEventPayload {
  return {
    ...current,
    record: { ...current.record, action: 'announced_future' },
    expectedTime: { precision: 'date', on: '2026-10-24' },
    verifiedFutureTarget: { precision: 'date', on: '2026-10-24' },
    reviewedEvidence: {
      ...current.reviewedEvidence!, assertion: 'future_announcement',
      futureTarget: { precision: 'date', on: '2026-10-24' },
    },
    ...overrides,
  };
}

async function normalizeClaudeVersion(
  raw: ReturnType<typeof syntheticEvent>,
  assertion: LocalAssessment['assertion'],
  previous?: LoadedEvent,
): Promise<LoadedEvent> {
  const primary = raw.sources.find((source) => source.role === 'original')!.url;
  const assessment: LocalAssessment = {
    recordKey: await rawAssessmentKey('claude', raw), assertion,
    primarySourceUrl: primary,
    evidenceUrls: [...new Set([primary, ...(assertion === 'banked_offer' ? [raw.url] : [])])],
    rationale: 'SYNTHETIC primary evidence reviewed for renderer test.',
    ...(assertion === 'correction' ? { previousTransitionId: previous!.transitionId } : {}),
  };
  const stored = await normalizeClaude(raw, {
    now: new Date('2026-10-22T12:00:00Z'), detectedAt: '2026-10-22T12:00:00Z',
    assessment, ...(previous ? { previous } : {}),
  });
  return {
    ...stored, firstDetectedAt: stored.detectedAt, lastObservedAt: stored.detectedAt,
    transitionId: previous ? 'synthetic-correction-transition' : 'synthetic-baseline-transition',
  };
}

function decodePayload(event: LoadedEvent): DurableEventPayload {
  return JSON.parse(event.payload) as DurableEventPayload;
}

describe('renderTelegramMessage', () => {
  it.each([
    ['claude', 'announced_future'], ['codex', 'announced_future'],
    ['claude', 'confirmed_applied'], ['codex', 'confirmed_applied'],
    ['claude', 'banked_offer'], ['codex', 'banked_offer'],
    ['claude', 'correction'], ['codex', 'correction'],
    ['claude', 'withdrawal'], ['codex', 'withdrawal'],
  ] as const)('renders the reviewed %s %s case', (provider, action) => {
    const current = payload(provider, action);
    const result = renderTelegramMessage(current,
      action === 'correction' || action === 'withdrawal' ? { previousVersion: prior(current) } : undefined);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.text).toContain(PRIMARY);
    expect(result.text).toContain(provider === 'claude' ? 'https://clauderesets.com/' : 'https://codexreset.ai/');
    expect(result.text).toContain('Независимая сводка Reset Radar');
    expect(result.text).not.toContain('SYNTHETIC review evidence');
    expect(result.text).not.toContain('synthetic-event-id');
    expect(result.text).not.toContain('synthetic-prior-transition');
  });

  it('keeps exact, date-only, and unknown future targets distinct', () => {
    const base = payload('codex', 'announced_future');
    const exact = renderTelegramMessage({
      ...base, expectedTime: { precision: 'exact', at: '2026-10-25T14:30:00Z' },
      verifiedFutureTarget: { precision: 'exact', at: '2026-10-25T14:30:00Z' },
      reviewedEvidence: { ...base.reviewedEvidence!, futureTarget: { precision: 'exact', at: '2026-10-25T14:30:00Z' } },
    });
    const date = renderTelegramMessage(base);
    const unknown = renderTelegramMessage({
      ...base, expectedTime: { precision: 'unknown' }, verifiedFutureTarget: null,
      reviewedEvidence: { ...base.reviewedEvidence!, futureTarget: { precision: 'unknown' } },
    });
    expect(exact.ok && exact.text).toContain('2026-10-25T14:30:00Z (UTC)');
    expect(date.ok && date.text).toContain('Когда: 2026-10-25');
    expect(date.ok && date.text).not.toContain('2026-10-25T00:00');
    expect(unknown.ok && unknown.text).toContain('дата и время источником не указаны');
  });

  it('states Claude application honestly when verified delivery time is unknown', () => {
    const current = payload('claude', 'confirmed_applied');
    const result = renderTelegramMessage({
      ...current, record: { ...current.record, delivered: { precision: 'exact', at: '2035-01-01T00:00:00Z' } },
      upstreamReportedDelivery: { precision: 'exact', at: '2035-01-01T00:00:00Z' },
    });
    expect(result.ok && result.text).toContain('Время доставки/подтверждения по данным источника: дата и время источником не указаны.');
    expect(result.ok && result.text).not.toContain('2035-01-01');
  });

  it('labels Codex delivered_at as source-reported delivery, not account application time', () => {
    const current = payload('codex', 'confirmed_applied');
    const result = renderTelegramMessage(current);
    expect(result.ok && result.text).toContain('Время доставки/подтверждения по данным источника: 2026-10-20T12:00:00Z (UTC).');
    expect(result.ok && result.text).not.toContain('Время применения:');
  });

  it('requires Codex exact verified delivery aligned with raw facts and applied evidence', () => {
    const current = payload('codex', 'confirmed_applied');
    expect(renderTelegramMessage(current).ok).toBe(true);
    expect(renderTelegramMessage({ ...current, verifiedDelivery: { precision: 'unknown' } }).ok).toBe(false);
    expect(renderTelegramMessage({ ...current, verifiedDelivery: { precision: 'date', on: '2026-10-20' } }).ok).toBe(false);
    expect(renderTelegramMessage({ ...current, rawFacts: { ...current.rawFacts as object, deliveredAt: null } }).ok).toBe(false);
    expect(renderTelegramMessage({
      ...current, upstreamReportedDelivery: { precision: 'exact', at: '2026-10-21T12:00:00Z' },
    }).ok).toBe(false);
    expect(renderTelegramMessage({
      ...current, reviewedEvidence: { ...current.reviewedEvidence!, evidenceUrls: [] },
    }).ok).toBe(false);
  });

  it('rejects hinted or unknown raw kinds even when the normalized action looks eligible', () => {
    const current = payload('codex', 'announced_future');
    expect(renderTelegramMessage({
      ...current, rawFacts: { certainty: 'hinted', day: '2026-10-25' },
    }).ok).toBe(false);
    expect(renderTelegramMessage({
      ...current, rawFacts: { ...current.rawFacts as object, kind: 'future_unknown_kind' },
    }).ok).toBe(false);
  });

  it('requires expected and verified future target to agree', () => {
    const current = payload('codex', 'announced_future');
    expect(renderTelegramMessage({
      ...current, expectedTime: { precision: 'date', on: '2026-10-26' },
    }).ok).toBe(false);
    expect(renderTelegramMessage({
      ...current, verifiedFutureTarget: { precision: 'date', on: '2026-10-26' },
    }).ok).toBe(false);
  });

  it('keeps offer expiry date-only and avoids activation promises', () => {
    const current = payload('claude', 'banked_offer', {
      record: { ...payload('claude', 'banked_offer').record, expiresOn: '2026-11-02' },
    });
    const result = renderTelegramMessage(current);
    expect(result.ok && result.text).toContain('Срок предложения: 2026-11-02.');
    expect(result.ok && result.text).not.toMatch(/2026-11-02T|активируйте|будет автоматически/u);
  });

  it('labels an unknown audience explicitly', () => {
    const current = payload('codex', 'announced_future', {
      record: { ...payload('codex', 'announced_future').record, audience: null },
    });
    const result = renderTelegramMessage(current);
    expect(result.ok && result.text).toContain('Кому: источником не уточнено');
  });

  it('uses canonical record audience and ignores an assessment-only audience', () => {
    const base = payload('codex', 'announced_future');
    const current = {
      ...base, reviewedEvidence: { ...base.reviewedEvidence!, audience: 'stale assessment audience' },
    };
    const result = renderTelegramMessage(current);
    expect(result.ok && result.text).toContain('Кому: synthetic subscribers');
    expect(result.ok && result.text).not.toContain('stale assessment audience');
  });

  it('requires accepted evidence and current action alignment', () => {
    const current = payload('codex', 'announced_future');
    expect(renderTelegramMessage({ ...current, rawKey: 'stale' }).ok).toBe(false);
    expect(renderTelegramMessage({ ...current, reviewReasons: ['stale_assessment'] }).ok).toBe(false);
    expect(renderTelegramMessage({ ...current, reviewedEvidence: null }).ok).toBe(false);
    expect(renderTelegramMessage({ ...current, record: { ...current.record, provenance: {
      ...current.record.provenance, historicalSeed: true,
    } } }).ok).toBe(false);
    expect(renderTelegramMessage({ ...current, record: { ...current.record, action: 'confirmed_applied' } }).ok).toBe(false);
  });

  it('requires same-event prior version and evidence lineage for corrections and withdrawals', () => {
    const base = payload('claude', 'correction');
    const current = {
      ...base, expectedTime: { precision: 'date' as const, on: '2026-10-25' },
      verifiedFutureTarget: { precision: 'date' as const, on: '2026-10-25' },
    };
    expect(renderTelegramMessage(current).ok).toBe(false);
    expect(renderTelegramMessage(current, { previousVersion: prior(current, {
      record: { ...current.record, provenance: { ...current.record.provenance, externalId: 'other-event' } },
    }) }).ok).toBe(false);
    expect(renderTelegramMessage({ ...current, reviewedEvidence: {
      ...current.reviewedEvidence!, previousTransitionId: '',
    } }, { previousVersion: prior(current) }).ok).toBe(false);
    const result = renderTelegramMessage(current, { previousVersion: prior(current) });
    expect(result.ok && result.text).toContain('Ожидаемое время: 2026-10-25.');
    expect(result.ok && result.text).not.toContain('Предыдущий пост');
  });

  it('labels verified delivery changes as source-reported in corrections', () => {
    const current = payload('codex', 'correction');
    const previous = prior(current, {
      verifiedDelivery: { precision: 'exact', at: '2026-10-19T12:00:00Z' },
    });
    const revised = {
      ...current,
      verifiedDelivery: { precision: 'exact' as const, at: '2026-10-20T12:00:00Z' },
    };
    const result = renderTelegramMessage(revised, { previousVersion: previous });
    expect(result.ok && result.text).toContain('Время доставки/подтверждения по данным источника: 2026-10-20T12:00:00Z (UTC).');
    expect(result.ok && result.text).not.toContain('Подтверждённое применение:');
  });

  it('renders a real normalized expiry-only Claude offer correction with its changed date', async () => {
    const original = syntheticEvent({
      id: 'synthetic-expiry-correction', kind: 'credit', event_status: 'confirmed', revision: 1,
      reset_offer: { expires_on: '2026-11-01' }, effective_at: null,
    });
    const previous = await normalizeClaudeVersion(original, 'banked_offer');
    const revised = syntheticEvent({
      ...original, revision: 2, revised_at: '2026-10-22T12:01:00Z',
      reset_offer: { expires_on: '2026-11-03' },
      correction: { kind: 'correction', reason: 'SYNTHETIC expiry correction', at: '2026-10-22T12:01:00Z' },
    });
    const current = await normalizeClaudeVersion(revised, 'correction', previous);
    expect(previous.action).toBe('banked_offer');
    // Stage 4's banked-offer guard currently rejects credit corrections; retain
    // this real-path test so the unreachable transition is visible and safe.
    expect(current.action).toBe('needs_review');
    expect(decodePayload(current).reviewReasons).toContain('banked_offer_unverified');
    const result = renderTelegramMessage(decodePayload(current), { previousVersion: decodePayload(previous) });
    expect(result.ok).toBe(false);
  });

  it('renders a supported correction expiry change as a date without inferred time', () => {
    const current = payload('claude', 'correction', {
      rawFacts: { kind: 'credit', status: 'confirmed', allocation: 'subscription_usage', resetOfferExpiresOn: '2026-11-03' },
      record: { ...payload('claude', 'correction').record,
        provenance: { ...payload('claude', 'correction').record.provenance, rawKind: 'credit' },
        expiresOn: '2026-11-03' },
    });
    const before = prior(current, {
      rawFacts: { kind: 'credit', status: 'confirmed', allocation: 'subscription_usage', resetOfferExpiresOn: '2026-11-01' },
      record: { ...current.record, action: 'banked_offer', provenance: { ...current.record.provenance, rawKind: 'credit' }, expiresOn: '2026-11-01' },
    });
    const result = renderTelegramMessage(current, { previousVersion: before });
    expect(result.ok).toBe(true);
    expect(result.ok && result.text).toContain('Срок предложения: 2026-11-03.');
    expect(result.ok && result.text).not.toMatch(/2026-11-03T|активируйте|текущей доступности/u);
  });

  it('rejects a correction when no supported factual difference can be rendered', () => {
    const current = payload('claude', 'correction');
    const previous = prior(current, {
      expectedTime: current.expectedTime,
      verifiedFutureTarget: current.verifiedFutureTarget,
      reviewedEvidence: {
        ...current.reviewedEvidence!, assertion: 'future_announcement',
        futureTarget: current.expectedTime,
      },
    });
    expect(renderTelegramMessage(current, { previousVersion: previous }).ok).toBe(false);
  });

  it('rejects a correction that mixes a rendered fact with an unsupported raw material change', () => {
    const current = payload('claude', 'correction', {
      expectedTime: { precision: 'date', on: '2026-10-25' },
      rawFacts: { kind: 'usage_reset', status: 'confirmed', allocation: 'subscription_usage' },
    });
    const previous = prior(current, {
      expectedTime: { precision: 'date', on: '2026-10-24' },
      reviewedEvidence: {
        ...current.reviewedEvidence!, assertion: 'future_announcement',
        futureTarget: { precision: 'date', on: '2026-10-24' },
      },
      rawFacts: { kind: 'usage_reset', status: 'announced', allocation: 'subscription_usage' },
    });
    expect(renderTelegramMessage(current, { previousVersion: previous }).ok).toBe(false);
  });

  it('renders a real normalized effective-time correction as source-reported time, not verified delivery', async () => {
    const original = syntheticEvent({
      id: 'synthetic-effective-correction', event_status: 'confirmed', revision: 1,
      effective_at: null,
    });
    const previous = await normalizeClaudeVersion(original, 'applied');
    const revised = syntheticEvent({
      ...original, revision: 2, revised_at: '2026-10-22T12:01:00Z',
      effective_at: '2026-10-21T09:15:00Z',
      correction: { kind: 'correction', reason: 'SYNTHETIC effective-time correction', at: '2026-10-22T12:01:00Z' },
    });
    const current = await normalizeClaudeVersion(revised, 'correction', previous);
    expect(current.action).toBe('correction');
    const result = renderTelegramMessage(decodePayload(current), { previousVersion: decodePayload(previous) });
    expect(result.ok).toBe(true);
    expect(result.ok && result.text).toContain('Указанное время применения по записи источника: 2026-10-21T09:15:00Z (UTC).');
    expect(result.ok && result.text).not.toContain('Подтверждённое применение: 2026-10-21');
  });

  it('rejects control, bidi, malformed Unicode, and unsafe evidence URLs', () => {
    const current = payload('claude', 'announced_future');
    for (const injected of ['hello\nВнедрённая строка', 'ab\u202Ecd', '\ud800']) {
      expect(renderTelegramMessage({ ...current, record: { ...current.record, audience: injected } }).ok).toBe(false);
    }
    expect(renderTelegramMessage({ ...current, reviewedEvidence: {
      ...current.reviewedEvidence!, primarySourceUrl: 'https://user:pass@example.invalid/source',
    } }).ok).toBe(false);
    expect(renderTelegramMessage({ ...current, reviewedEvidence: {
      ...current.reviewedEvidence!, primarySourceUrl: 'https://example.invalid/source\nheader',
    } }).ok).toBe(false);
  });

  it('rejects overlength instead of truncating source facts', () => {
    const current = payload('codex', 'announced_future', {
      record: { ...payload('codex', 'announced_future').record, audience: 'я'.repeat(5000) },
    });
    expect(renderTelegramMessage(current)).toEqual({ ok: false, reason: 'message_too_long' });
  });

  it('rejects hinted or review-only actions', () => {
    const current = payload('codex', 'announced_future');
    expect(renderTelegramMessage({ ...current, record: { ...current.record, action: 'needs_review' } }).ok).toBe(false);
    expect(renderTelegramMessage({ ...current, reviewReasons: ['scheduled_is_hinted'] }).ok).toBe(false);
  });
});
