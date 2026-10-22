import { describe, expect, it, vi } from 'vitest';
import { normalizeClaude, normalizeCodexEvent, rawAssessmentKey, type DurableEventPayload, type LocalAssessment } from '../src/domain/normalization';
import { createPublisherService, type SyntheticPublishPolicy } from '../src/services/publish';
import { createD1Repository } from '../src/storage/d1';
import { createPublisherRepository } from '../src/storage/publisher';
import type { SourceStateInput } from '../src/storage/types';
import type { PublisherRepository } from '../src/storage/publisher';
import { STAGE5_DESTINATION, STAGE5_NOW, createStage5Harness, outcomeClient } from './helpers/stage5';

function relevancePolicy(h: Awaited<ReturnType<typeof createStage5Harness>>, candidate: Parameters<typeof h.policy>[0],
  assertion: 'current_offer' | 'current_reset_confirmation', confirmedAt = STAGE5_NOW,
  evidenceUrl = 'https://example.invalid/source/synthetic-primary'): SyntheticPublishPolicy {
  const policy = h.policy(candidate);
  const approval = policy.providers.codex!;
  return {...policy, providers: {codex: {...approval, transitions: approval.transitions.map((transition) => ({
    ...transition, currentRelevance: {assertion, confirmedAt, evidenceUrl},
  }))}}};
}
import { syntheticEvent } from './fixtures/claude';
import { createTestD1 } from './helpers/d1';
import { codexEvent, codexFeed } from './fixtures/codex';

describe('Stage 5 publisher service on local D1', () => {
  it.each([
    ['historic', '2026-01-02T10:00:00Z', 'event_time_not_current'],
    ['recent delivery after an old announcement', '2026-10-22T11:59:00Z', null],
  ] as const)('uses normalized Codex delivery time on a late import: %s', async (_name, deliveredAt, reason) => {
    const h = await createStage5Harness({baseline: false});
    const raw = codexEvent({id: 'synthetic-late-import', date: '2026-01-01', ts: '2026-01-01T10:00:00Z',
      announced_at: '2026-01-01T10:00:00Z', delivered_at: deliveredAt,
      delivered_source_url: 'https://example.invalid/posts/delivery-evidence'});
    const assessment: LocalAssessment = {recordKey: await rawAssessmentKey('codex', raw), assertion: 'applied',
      primarySourceUrl: raw.delivered_source_url!, evidenceUrls: [raw.url, raw.delivered_source_url!], rationale: 'SYNTHETIC verified delivery'};
    const normalized = await normalizeCodexEvent(raw, codexFeed(), {now: h.clock.now(), detectedAt: STAGE5_NOW, assessment});
    expect(normalized.action).toBe('confirmed_applied');
    await h.facts.commitSnapshot({provider: 'codex', expectedGeneration: 1, at: STAGE5_NOW, complete: true,
      status: 'success', reason: null, sources: await h.facts.loadSources('codex'),
      events: [{...normalized, payload: JSON.stringify({...JSON.parse(normalized.payload), sourceGeneratedAt: STAGE5_NOW})}]});
    const candidate = await h.candidate();
    const page = await h.service.runPage({provider: 'codex', limit: 10, mode: 'simulate', policy: h.policy(candidate)});
    if (reason) expect(page.items[0]).toMatchObject({result: 'skipped', reason});
    else expect(page.items[0]?.result).toBe('simulated_sent');
    expect((await h.facts.loadEvents('codex')).find((event) => event.id === normalized.id)?.detectedAt).toBe(STAGE5_NOW);
    expect(await h.facts.loadVersion(candidate.eventId, candidate.transitionId)).not.toBeNull();
  });
  it('keeps a late historical applied import in D1 without an operational send', async () => {
    const h = await createStage5Harness({action: 'confirmed_applied',
      actionTime: {precision: 'exact', at: '2026-01-02T10:00:00.000Z'}});
    const candidate = await h.candidate();
    const send = vi.fn(async () => ({kind: 'simulated_sent' as const, messageId: 97, chatId: -1000000000005}));
    const service = h.makeService({simulationOnly: true, sendMessage: send});
    const page = await service.runPage({provider: 'codex', limit: 10, mode: 'simulate', policy: h.policy(candidate)});
    expect(page.items[0]).toMatchObject({result: 'skipped', reason: 'event_time_not_current'});
    expect(send).not.toHaveBeenCalled();
    expect(await h.facts.loadVersion(candidate.eventId, candidate.transitionId)).not.toBeNull();
    expect(await h.facts.loadEvents('codex')).toHaveLength(1);
    expect(await h.db.prepare('SELECT COUNT(*) AS n FROM telegram_simulation_deliveries').first('n')).toBe(0);
    // A newly written review must not refresh a known historical delivery time.
    const overridden = await service.runPage({provider: 'codex', limit: 10, mode: 'simulate',
      policy: relevancePolicy(h, candidate, 'current_reset_confirmation')});
    expect(overridden.items[0]?.reason).toBe('event_time_not_current');
  });

  it('allows a fresh verified source delivery without replacing it with announcement/detection time', async () => {
    const h = await createStage5Harness({action: 'confirmed_applied',
      actionTime: {precision: 'exact', at: '2026-10-22T11:59:00.000Z'}});
    const candidate = await h.candidate();
    const page = await h.service.runPage({provider: 'codex', limit: 10, mode: 'simulate', policy: h.policy(candidate)});
    expect(page.items[0]?.result).toBe('simulated_sent');
  });

  it('requires separate current-availability evidence for an offer even after fresh detection and feed review', async () => {
    const h = await createStage5Harness({action: 'banked_offer', expiresOn: '2026-10-25'});
    const candidate = await h.candidate();
    const run = (policy: SyntheticPublishPolicy) => h.service.runPage({provider: 'codex', limit: 10, mode: 'simulate', policy});
    expect((await run(h.policy(candidate))).items[0]?.reason).toBe('current_relevance_unconfirmed');
    expect((await run(relevancePolicy(h, candidate, 'current_offer'))).items[0]?.result).toBe('simulated_sent');
    expect(await h.facts.loadEvents('codex')).toHaveLength(1);
  });

  it.each([
    ['stale confirmation', 'current_offer', '2026-10-22T10:00:00.000Z', 'https://example.invalid/source/synthetic-primary'],
    ['wrong assertion', 'current_reset_confirmation', STAGE5_NOW, 'https://example.invalid/source/synthetic-primary'],
    ['unreviewed evidence', 'current_offer', STAGE5_NOW, 'https://example.invalid/unreviewed'],
    ['future confirmation', 'current_offer', '2026-10-23T12:00:00.000Z', 'https://example.invalid/source/synthetic-primary'],
  ] as const)('blocks an old/unsupported offer: %s', async (_name, assertion, confirmedAt, url) => {
    const h = await createStage5Harness({action: 'banked_offer', expiresOn: '2026-10-25'});
    const candidate = await h.candidate();
    const page = await h.service.runPage({provider: 'codex', limit: 10, mode: 'simulate',
      policy: relevancePolicy(h, candidate, assertion, confirmedAt, url)});
    expect(page.items[0]).toMatchObject({result: 'skipped', reason: 'current_relevance_unconfirmed'});
    expect(await h.db.prepare('SELECT COUNT(*) AS n FROM telegram_simulation_deliveries').first('n')).toBe(0);
  });

  it.each([
    {precision: 'unknown'}, {precision: 'date', on: '2026-10-25'}, {precision: 'exact', at: '2026-10-25T14:00:00Z'},
  ] as const)('preserves a fresh reviewed announcement with $precision target and no availability confirmation', async (actionTime) => {
    const h = await createStage5Harness({actionTime});
    const candidate = await h.candidate();
    const page = await h.service.runPage({provider: 'codex', limit: 10, mode: 'simulate', policy: h.policy(candidate)});
    expect(page.items[0]?.result).toBe('simulated_sent');
  });
  it('rejects a candidate snapshot when ingestion changes only freshness metadata before evaluation', async () => {
    const h = await createStage5Harness();
    const candidate = await h.candidate();
    const before = (await h.facts.loadEvents('codex'))[0]!;
    const send = vi.fn(async () => ({kind: 'simulated_sent' as const, messageId: 94, chatId: -1000000000005}));
    const interleaved = createPublisherService({...h.repository, async listCandidates(input) {
      const page = await h.repository.listCandidates(input);
      // Raw record/assessment/observation/transition stay identical; only source
      // metadata changes. A later loadProvider must not bless the earlier read.
      await h.facts.commitSnapshot({provider: 'codex', expectedGeneration: candidate.generation,
        at: STAGE5_NOW, complete: true, status: 'success', reason: null,
        sources: await h.facts.loadSources('codex'),
        events: [{...before, payload: JSON.stringify({...JSON.parse(before.payload), sourceGeneratedAt: '2026-10-22T10:00:00.000Z'})}]});
      return page;
    }}, h.facts, {clock: h.clock, client: {simulationOnly: true, sendMessage: send}});
    const result = await interleaved.runPage({provider: 'codex', limit: 10, mode: 'simulate', policy: h.policy(candidate)});
    expect(result.items[0]).toMatchObject({result: 'skipped', reason: 'candidate_snapshot_changed'});
    const after = (await h.facts.loadEvents('codex'))[0]!;
    expect(after.observationKey).toBe(before.observationKey);
    expect(after.transitionId).toBe(before.transitionId);
    expect(send).not.toHaveBeenCalled();
    expect(await h.db.prepare('SELECT COUNT(*) AS n FROM telegram_simulation_deliveries').first('n')).toBe(0);
  });
  it('dry_run previews without touching the client or journal, then an explicit simulation can send', async () => {
    const h = await createStage5Harness();
    const candidate = await h.candidate();
    const send = vi.fn(async () => ({ kind: 'simulated_sent' as const, messageId: 81, chatId: -1000000000005 }));
    const service = h.makeService({ simulationOnly: true, sendMessage: send });
    const key = { eventId: candidate.eventId, transitionId: candidate.transitionId, destination: STAGE5_DESTINATION };

    const preview = await service.runPage({ provider: 'codex', limit: 10, mode: 'dry_run', policy: h.policy(candidate) });
    expect(preview.items[0]).toMatchObject({ result: 'preview' });
    expect(preview.items[0]?.text).toContain('Это анонс');
    expect(send).not.toHaveBeenCalled();
    expect(await h.repository.getDelivery(key)).toBeNull();
    expect(await h.db.prepare('SELECT COUNT(*) AS n FROM telegram_simulation_deliveries').first('n')).toBe(0);

    const simulated = await service.runPage({ provider: 'codex', limit: 10, mode: 'simulate', policy: h.policy(candidate) });
    expect(simulated.items[0]?.result).toBe('simulated_sent');
    expect(send).toHaveBeenCalledTimes(1);
    expect(await h.repository.getDelivery(key)).toMatchObject({ state: 'simulated_sent', messageId: 81, attempts: 1 });
  });

  it('fails closed for absent policy, approval, provider-specific baseline, and baseline activation', async () => {
    const h = await createStage5Harness();
    const candidate = await h.candidate();
    const noPolicy = await h.service.runPage({ provider: 'codex', limit: 10, mode: 'simulate' });
    expect(noPolicy.items[0]).toMatchObject({ result: 'skipped', reason: 'missing_synthetic_policy' });

    const noApproval = h.policy(candidate, { providers: {} });
    expect((await h.service.runPage({ provider: 'codex', limit: 10, mode: 'dry_run', policy: noApproval })).items[0])
      .toMatchObject({ result: 'skipped', reason: 'local_approval_missing' });
    const wrongProviderApproval = h.policy(candidate, { providers: { claude: {
      baselineCompletedAt: STAGE5_NOW, approvedAt: STAGE5_NOW,
      transitions: [{ transitionId: candidate.transitionId, rawKey: JSON.parse(candidate.payload).rawKey, reviewedAt: STAGE5_NOW }],
    } } });
    expect((await h.service.runPage({ provider: 'codex', limit: 10, mode: 'dry_run', policy: wrongProviderApproval })).items[0])
      .toMatchObject({ result: 'skipped', reason: 'local_approval_missing' });

    await h.db.prepare('UPDATE provider_activation SET baseline_completed_at = NULL WHERE provider = ?1').bind('codex').run();
    expect((await h.service.runPage({ provider: 'codex', limit: 10, mode: 'dry_run', policy: h.policy(candidate) })).items[0])
      .toMatchObject({ result: 'skipped', reason: 'baseline_missing' });
  });

  it('requires both a fresh successful ingest and fresh source HTTP checks', async () => {
    const old = '2026-10-22T11:00:00.000Z';
    const staleSource = await createStage5Harness({ checkedAt: old });
    let candidate = await staleSource.candidate();
    expect((await staleSource.service.runPage({ provider: 'codex', limit: 10, mode: 'dry_run', policy: staleSource.policy(candidate) })).items[0])
      .toMatchObject({ result: 'skipped', reason: 'http_check_stale' });

    const staleIngest = await createStage5Harness();
    candidate = await staleIngest.candidate();
    await staleIngest.db.prepare("UPDATE provider_activation SET last_success_at = ?1 WHERE provider = 'codex'").bind(old).run();
    expect((await staleIngest.service.runPage({ provider: 'codex', limit: 10, mode: 'dry_run', policy: staleIngest.policy(candidate) })).items[0])
      .toMatchObject({ result: 'skipped', reason: 'ingestion_stale' });
  });

  it('rejects stale source generation, review metadata, candidate, and review versions', async () => {
    const old = '2026-10-22T11:00:00.000Z';
    const staleGeneration = await createStage5Harness({ generatedAt: old });
    let candidate = await staleGeneration.candidate();
    expect((await staleGeneration.service.runPage({ provider: 'codex', limit: 10, mode: 'dry_run', policy: staleGeneration.policy(candidate) })).items[0])
      .toMatchObject({ result: 'skipped', reason: 'upstream_metadata_stale' });

    const staleReview = await createStage5Harness();
    candidate = await staleReview.candidate();
    const reviewPolicy = staleReview.policy(candidate);
    const codexApproval = reviewPolicy.providers.codex!;
    const staleReviewPolicy: SyntheticPublishPolicy = {...reviewPolicy, providers: {codex: {...codexApproval,
      transitions: codexApproval.transitions.map((transition) => ({...transition, reviewedAt: old})),
    }}};
    expect((await staleReview.service.runPage({ provider: 'codex', limit: 10, mode: 'dry_run', policy: staleReviewPolicy })).items[0])
      .toMatchObject({ result: 'skipped', reason: 'transition_not_reviewed' });

    const staleCandidate = await createStage5Harness({ candidateAt: old });
    candidate = await staleCandidate.candidate();
    expect((await staleCandidate.service.runPage({ provider: 'codex', limit: 10, mode: 'dry_run', policy: staleCandidate.policy(candidate) })).items[0])
      .toMatchObject({ result: 'skipped', reason: 'candidate_stale' });

    const newerReview = await createStage5Harness();
    candidate = await newerReview.candidate();
    await newerReview.commit('needs_review');
    expect((await newerReview.service.runPage({ provider: 'codex', limit: 10, mode: 'dry_run', policy: newerReview.policy(candidate) })).items[0])
      .toMatchObject({ result: 'skipped', reason: 'superseded_transition' });
  });

  it('skips expired future targets and date-only offers on their expiry date', async () => {
    const future = await createStage5Harness({ actionTime: { precision: 'exact', at: '2026-10-22T11:59:59.000Z' } });
    let candidate = await future.candidate();
    expect((await future.service.runPage({ provider: 'codex', limit: 10, mode: 'dry_run', policy: future.policy(candidate) })).items[0])
      .toMatchObject({ result: 'skipped', reason: 'current_truth_ineligible' });

    const offer = await createStage5Harness({ action: 'banked_offer', expiresOn: '2026-10-22' });
    candidate = await offer.candidate();
    expect((await offer.service.runPage({ provider: 'codex', limit: 10, mode: 'dry_run', policy: offer.policy(candidate) })).items[0])
      .toMatchObject({ result: 'skipped', reason: 'current_truth_ineligible' });
  });

  it('keeps announcement and applied transition separate, while replay/noise makes no extra send', async () => {
    const h = await createStage5Harness();
    const send = vi.fn(async () => ({ kind: 'simulated_sent' as const, messageId: 91, chatId: -1000000000005 }));
    const service = h.makeService({ simulationOnly: true, sendMessage: send });
    const announcement = await h.candidate();
    const announcedPolicy = h.policy(announcement);
    expect((await service.runPage({ provider: 'codex', limit: 10, mode: 'simulate', policy: announcedPolicy })).items[0]?.result)
      .toBe('simulated_sent');

    await h.clock.advance(60_000);
    await h.commit('confirmed_applied', { actionTime: { precision: 'exact', at: '2026-10-22T12:01:00.000Z' } });
    const applied = await h.candidate('confirmed_applied');
    const page = await service.runPage({ provider: 'codex', limit: 10, mode: 'simulate', policy: h.policy(applied) });
    expect(page.items.map((item) => item.result)).toEqual(['skipped', 'simulated_sent']);
    await h.commit('confirmed_applied', { actionTime: { precision: 'exact', at: '2026-10-22T12:01:00.000Z' } });
    await service.runPage({ provider: 'codex', limit: 10, mode: 'simulate', policy: h.policy(applied) });
    expect(await h.db.prepare('SELECT COUNT(*) AS n FROM event_versions').first('n')).toBe(2);
    expect(await h.db.prepare('SELECT COUNT(*) AS n FROM telegram_simulation_deliveries').first('n')).toBe(2);
    expect(send).toHaveBeenCalledTimes(2);
  });

  it('allows one concurrent send claim for a candidate and destination', async () => {
    const h = await createStage5Harness();
    const candidate = await h.candidate();
    const send = vi.fn(async () => ({ kind: 'simulated_sent' as const, messageId: 92, chatId: -1000000000005 }));
    const one = h.makeService({ simulationOnly: true, sendMessage: send }, () => 'concurrent-one');
    const two = h.makeService({ simulationOnly: true, sendMessage: send }, () => 'concurrent-two');
    const policy = h.policy(candidate);
    const results = await Promise.all([
      one.runPage({ provider: 'codex', limit: 10, mode: 'simulate', policy }),
      two.runPage({ provider: 'codex', limit: 10, mode: 'simulate', policy }),
    ]);
    expect(results.flatMap((result) => result.items.map((item) => item.result)).filter((item) => item === 'simulated_sent'))
      .toHaveLength(1);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('persists retryable, rejected, and ambiguous outcomes and caps retries at three attempts', async () => {
    const h = await createStage5Harness();
    const candidate = await h.candidate();
    const key = { eventId: candidate.eventId, transitionId: candidate.transitionId, destination: STAGE5_DESTINATION };
    const retryAt = '2026-10-22T12:01:00.000Z';
    const retryService = h.makeService(outcomeClient({ kind: 'retryable', retryAt }), () => 'retry-one');
    expect((await retryService.runPage({ provider: 'codex', limit: 10, mode: 'simulate', policy: h.policy(candidate) })).items[0]?.result)
      .toBe('retryable');
    expect(await h.repository.getDelivery(key)).toMatchObject({ state: 'retryable', attempts: 1, retryAt });
    h.clock.set(retryAt);
    const rejectService = h.makeService(outcomeClient({ kind: 'rejected', code: 'telegram_rejected' }), () => 'reject-two');
    expect((await rejectService.runPage({ provider: 'codex', limit: 10, mode: 'simulate', policy: h.policy(candidate) })).items[0]?.result)
      .toBe('rejected');
    expect(await h.repository.getDelivery(key)).toMatchObject({ state: 'rejected', attempts: 2 });
    const neverRetry = h.makeService(outcomeClient({ kind: 'simulated_sent', messageId: 1, chatId: -1000000000005 }));
    expect((await neverRetry.runPage({ provider: 'codex', limit: 10, mode: 'simulate', policy: h.policy(candidate) })).items[0])
      .toMatchObject({ result: 'skipped', reason: 'delivery_blocked' });

    const uncertain = await createStage5Harness();
    const uncertainCandidate = await uncertain.candidate();
    const ambiguousService = uncertain.makeService(outcomeClient(new Error('synthetic disconnect')), () => 'ambiguous');
    expect((await ambiguousService.runPage({ provider: 'codex', limit: 10, mode: 'simulate', policy: uncertain.policy(uncertainCandidate) })).items[0]?.result)
      .toBe('uncertain_manual_review');
    const uncertainKey = { eventId: uncertainCandidate.eventId, transitionId: uncertainCandidate.transitionId, destination: STAGE5_DESTINATION };
    expect(await uncertain.repository.getDelivery(uncertainKey)).toMatchObject({ state: 'uncertain_manual_review', attempts: 1 });
    expect((await ambiguousService.runPage({ provider: 'codex', limit: 10, mode: 'simulate', policy: uncertain.policy(uncertainCandidate) })).items[0])
      .toMatchObject({ result: 'skipped', reason: 'delivery_blocked' });

    const bounded = await createStage5Harness();
    const boundedCandidate = await bounded.candidate();
    const boundedKey = { eventId: boundedCandidate.eventId, transitionId: boundedCandidate.transitionId, destination: STAGE5_DESTINATION };
    for (let attempt = 1; attempt <= 3; attempt++) {
      const at = bounded.clock.now().getTime();
      const retry = new Date(at + 1_000).toISOString();
      const retryer = bounded.makeService(outcomeClient({ kind: 'retryable', retryAt: retry }), () => `bounded-${attempt}`);
      expect((await retryer.runPage({ provider: 'codex', limit: 10, mode: 'simulate', policy: bounded.policy(boundedCandidate) })).items[0]?.result)
        .toBe('retryable');
      bounded.clock.set(retry);
    }
    expect(await bounded.repository.getDelivery(boundedKey)).toMatchObject({ state: 'retryable', attempts: 3 });
    expect((await bounded.service.runPage({ provider: 'codex', limit: 10, mode: 'simulate', policy: bounded.policy(boundedCandidate) })).items[0])
      .toMatchObject({ result: 'skipped', reason: 'delivery_blocked' });
  });

  it('keeps a successful client response blocked when completing its D1 journal fails, including after restart', async () => {
    const h = await createStage5Harness();
    const candidate = await h.candidate();
    const send = vi.fn(async () => ({ kind: 'simulated_sent' as const, messageId: 93, chatId: -1000000000005 }));
    const brokenRepository: PublisherRepository = {
      ...h.repository,
      async complete() { throw new Error('synthetic D1 write fault'); },
    };
    const broken = createPublisherService(brokenRepository, h.facts, { clock: h.clock, client: { simulationOnly: true, sendMessage: send }, newToken: () => 'persist-failure' });
    expect((await broken.runPage({ provider: 'codex', limit: 10, mode: 'simulate', policy: h.policy(candidate) })).items[0]?.result)
      .toBe('persistence_uncertain');
    expect(send).toHaveBeenCalledTimes(1);
    const key = { eventId: candidate.eventId, transitionId: candidate.transitionId, destination: STAGE5_DESTINATION };
    expect(await h.repository.getDelivery(key)).toMatchObject({ state: 'claimed', attempts: 1 });

    const restarted = h.makeService({ simulationOnly: true, sendMessage: send }, () => 'after-restart');
    expect((await restarted.runPage({ provider: 'codex', limit: 10, mode: 'simulate', policy: h.policy(candidate) })).items[0])
      .toMatchObject({ result: 'skipped', reason: 'delivery_blocked' });
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('requires actual same-event lineage for a correction candidate', async () => {
    const h = await createStage5Harness();
    await h.commit('correction');
    const correction = await h.candidate('correction');
    const result = await h.service.runPage({ provider: 'codex', limit: 10, mode: 'dry_run', policy: h.policy(correction) });
    expect(result.items.find((item) => item.transitionId === correction.transitionId)?.result).toBe('preview');
    expect(result.items.find((item) => item.transitionId === correction.transitionId)?.text)
      .toContain('Исправление сведений о событии');

    const withoutPrior = await createStage5Harness({ action: 'correction' });
    const unlinkedCorrection = await withoutPrior.candidate('correction');
    const withMissingLineage = await withoutPrior.service.runPage({ provider: 'codex', limit: 10, mode: 'dry_run', policy: withoutPrior.policy(unlinkedCorrection) });
    expect(withMissingLineage.items.find((item) => item.transitionId === unlinkedCorrection.transitionId))
      .toMatchObject({ result: 'skipped', reason: 'lineage_missing' });
  });

  it('uses Claude generated/editorial metadata and independent history gates on real local D1', async () => {
    const runtime = await createTestD1();
    try {
      const db = runtime.db;
      const now = new Date(STAGE5_NOW);
      const clock = { now: () => new Date(now) };
      const facts = createD1Repository(db);
      const repository = createPublisherRepository(db);
      const raw = syntheticEvent({ effective_at: null });
      const sourceUrl = raw.sources.find((source) => source.role === 'original')!.url;
      const assessment: LocalAssessment = {
        recordKey: await rawAssessmentKey('claude', raw), assertion: 'applied',
        primarySourceUrl: sourceUrl, evidenceUrls: [sourceUrl],
        rationale: 'SYNTHETIC accepted Claude evidence for the local integration test.',
      };
      const normalized = await normalizeClaude(raw, { now, detectedAt: STAGE5_NOW, assessment });
      expect(normalized.action).toBe('confirmed_applied');
      const serialized = JSON.parse(normalized.payload) as DurableEventPayload;
      const event = {
        ...normalized,
        payload: JSON.stringify({ ...serialized, sourceGeneratedAt: STAGE5_NOW, sourceReviewedAt: STAGE5_NOW }),
      };
      const future = Date.parse(STAGE5_NOW) + 86_400_000;
      const sources = (at: string, history: 'fresh' | 'stale' | 'missing' = 'fresh'): SourceStateInput[] => [
        {
          endpointKey: 'status?', snapshot: JSON.stringify({ synthetic: 'status' }), etag: '"claude-status"',
          checkedAt: at, expiresAt: Date.parse(at) + 60_000, retryUntil: 0, failureCount: 0,
          retainedUntil: Date.parse(at) + 86_400_000,
        },
        {
          endpointKey: 'resets?limit=100',
          snapshot: history === 'missing' ? null : JSON.stringify({ synthetic: 'history' }), etag: '"claude-history"',
          checkedAt: history === 'stale' ? '2026-10-22T11:00:00.000Z' : at,
          expiresAt: Date.parse(at) + 60_000, retryUntil: history === 'missing' ? future : 0, failureCount: 0,
          retainedUntil: history === 'stale' ? Date.parse('2026-10-22T11:00:00.000Z') : Date.parse(at) + 86_400_000,
        },
      ];

      await facts.commitSnapshot({
        provider: 'claude', expectedGeneration: 0, at: STAGE5_NOW, complete: true, events: [],
        sources: sources(STAGE5_NOW), status: 'success', reason: null,
      });
      await facts.commitSnapshot({
        provider: 'claude', expectedGeneration: 1, at: STAGE5_NOW, complete: true, events: [event],
        sources: sources(STAGE5_NOW), status: 'success', reason: null,
      });

      const [candidate] = await repository.listCandidates({ provider: 'claude', limit: 10 });
      expect(candidate).toBeDefined();
      const policy: SyntheticPublishPolicy = {
        kind: 'synthetic_stage5' as const, environment: 'local_test' as const,
        destination: STAGE5_DESTINATION, chatId: -1000000000005 as const,
        providers: { claude: {
          baselineCompletedAt: STAGE5_NOW, approvedAt: STAGE5_NOW,
          transitions: [{ transitionId: candidate!.transitionId, rawKey: JSON.parse(candidate!.payload).rawKey, reviewedAt: STAGE5_NOW }],
        } },
        freshness: { maxHttpAgeMs: 300_000, maxSourceAgeMs: 300_000, maxCandidateAgeMs: 300_000, maxReviewAgeMs: 300_000, maxEventAgeMs: 300_000 },
      };
      const service = createPublisherService(repository, facts, { clock });
      const run = (approvedPolicy: typeof policy = policy) => service.runPage({
        provider: 'claude', limit: 10, mode: 'dry_run', policy: approvedPolicy,
      });

      expect((await run()).items[0]).toMatchObject({result: 'skipped', reason: 'current_relevance_unconfirmed'});
      const claudeReview = policy.providers.claude!;
      const currentConfirmation: SyntheticPublishPolicy = {...policy, providers: {claude: {...claudeReview,
        transitions: claudeReview.transitions.map((transition) => ({...transition,
          currentRelevance: {assertion: 'current_reset_confirmation', confirmedAt: STAGE5_NOW, evidenceUrl: sourceUrl},
        })),
      }}};
      const preview = await run(currentConfirmation);
      expect(preview.items[0]).toMatchObject({ result: 'preview' });
      expect(preview.items[0]?.text).toContain('Время доставки/подтверждения по данным источника: дата и время источником не указаны.');
      expect(preview.items[0]?.text).toContain('https://clauderesets.com/');

      const codexOnlyPolicy: SyntheticPublishPolicy = {
        ...policy, providers: { codex: policy.providers.claude! },
      };
      expect((await run(codexOnlyPolicy)).items[0]).toMatchObject({ result: 'skipped', reason: 'local_approval_missing' });
      const noClaudeApproval = { ...policy, providers: {} };
      expect((await run(noClaudeApproval)).items[0]).toMatchObject({ result: 'skipped', reason: 'local_approval_missing' });

      // Refresh successful HTTP checks while making the current immutable event payload carry stale editorial metadata.
      const staleReviewEvent = {
        ...event,
        payload: JSON.stringify({ ...serialized, sourceGeneratedAt: STAGE5_NOW, sourceReviewedAt: '2026-10-22T11:00:00.000Z' }),
      };
      await facts.commitSnapshot({
        provider: 'claude', expectedGeneration: 2, at: STAGE5_NOW, complete: true,
        events: [staleReviewEvent], sources: sources(STAGE5_NOW), status: 'success', reason: null,
      });
      expect((await run()).items[0]).toMatchObject({ result: 'skipped', reason: 'upstream_metadata_stale' });

      // Restore fresh editorial metadata, then prove status freshness cannot hide stale or absent history.
      await facts.commitSnapshot({
        provider: 'claude', expectedGeneration: 3, at: STAGE5_NOW, complete: true,
        events: [event], sources: sources(STAGE5_NOW, 'stale'), status: 'success', reason: null,
      });
      expect((await run()).items[0]).toMatchObject({ result: 'skipped', reason: 'http_check_stale' });
      await facts.commitSnapshot({
        provider: 'claude', expectedGeneration: 4, at: STAGE5_NOW, complete: true,
        events: [event], sources: sources(STAGE5_NOW, 'missing'), status: 'success', reason: null,
      });
      expect((await run()).items[0]).toMatchObject({ result: 'skipped', reason: 'http_check_stale' });

      await db.prepare("UPDATE provider_activation SET baseline_completed_at = NULL WHERE provider = 'claude'").run();
      expect((await run()).items[0]).toMatchObject({ result: 'skipped', reason: 'baseline_missing' });
    } finally {
      await runtime.dispose();
    }
  });
});
