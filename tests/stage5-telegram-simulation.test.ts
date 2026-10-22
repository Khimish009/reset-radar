import { describe, expect, it } from 'vitest';
import { createLocalTelegramClient, SYNTHETIC_TELEGRAM_TOKEN } from '../src/telegram/client';
import { createPublisherService } from '../src/services/publish';
import { createStage5Harness } from './helpers/stage5';

const nativeFetch = globalThis.fetch;
const simulationUrl = process.env.TELEGRAM_SIMULATION_URL;

describe.runIf(simulationUrl)('Stage 5 real loopback HTTP + publisher + local D1', () => {
  it('validates sendMessage traffic and keeps refusal, retry, ambiguity and post-send storage failure durable', async () => {
    const base = new URL(simulationUrl!);
    expect(base.protocol).toBe('http:');
    expect(base.hostname).toBe('127.0.0.1');
    expect(base.pathname).toBe('/telegram');
    const receivedUrl = new URL(`${base.pathname}/__synthetic_requests`, base);
    const initialReceipts = await (await nativeFetch(receivedUrl)).json() as unknown[];
    const h = await createStage5Harness();
    const candidate = await h.candidate();
    const calls: string[] = [];
    let mode = 'normal';
    const client = createLocalTelegramClient({baseUrl: base.href, clock: h.clock, timeoutMs: 300,
      fetch: (async (input, init) => {
        const target = new URL(String(input));
        expect(target.origin).toBe(base.origin);
        expect(target.pathname).toBe(`/telegram/bot${SYNTHETIC_TELEGRAM_TOKEN}/sendMessage`);
        expect(init?.method).toBe('POST');
        expect(init?.redirect).toBe('error');
        const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
        expect(Object.keys(body).sort()).toEqual(['chat_id', 'link_preview_options', 'text']);
        expect(body.chat_id).toBe(-1000000000005);
        expect(String(body.text)).toContain('Первоисточник: https://example.invalid/');
        expect(String(body.text)).toContain('Данные трекера: https://codexreset.ai/');
        const headers = new Headers(init?.headers);
        headers.set('x-reset-radar-test', mode);
        calls.push(mode);
        return nativeFetch(target, {...init, headers});
      }) as typeof globalThis.fetch});
    const service = h.makeService(client);
    const run = (destination: string, selectedService = service, publishMode: 'dry_run' | 'simulate' = 'simulate') =>
      selectedService.runPage({provider: 'codex', limit: 50, mode: publishMode,
        policy: h.policy(candidate, {destination: `synthetic:http-${destination}`})});
    const key = (destination: string) => ({eventId: candidate.eventId, transitionId: candidate.transitionId, destination: `synthetic:http-${destination}`});
    try {
      expect((await run('normal', service, 'dry_run')).items[0]?.result).toBe('preview');
      expect(calls).toHaveLength(0);
      expect(await h.db.prepare('SELECT COUNT(*) AS n FROM telegram_simulation_deliveries').first('n')).toBe(0);
      expect((await run('normal')).items[0]?.result).toBe('simulated_sent');
      expect((await run('normal')).items[0]?.reason).toBe('delivery_blocked');
      expect(calls).toEqual(['normal']);
      expect(await h.repository.getDelivery(key('normal'))).toMatchObject({state: 'simulated_sent', attempts: 1});

      mode = 'rate';
      expect((await run('rate')).items[0]?.result).toBe('retryable');
      expect(await h.repository.getDelivery(key('rate'))).toMatchObject({state: 'retryable', attempts: 1, retryAt: '2026-10-22T12:00:02.000Z'});
      const rateCount = calls.length;
      expect((await run('rate')).items[0]?.reason).toBe('delivery_blocked');
      expect(calls).toHaveLength(rateCount);
      h.clock.advance(2_000);
      mode = 'normal';
      expect((await run('rate')).items[0]?.result).toBe('simulated_sent');
      expect(await h.repository.getDelivery(key('rate'))).toMatchObject({state: 'simulated_sent', attempts: 2});

      for (const failure of ['reject', 'migration', '500-json', '500-html', 'malformed', 'hang', 'disconnect']) {
        mode = failure;
        const expected = ['reject', 'migration'].includes(failure) ? 'rejected' : 'uncertain_manual_review';
        expect((await run(failure)).items[0]?.result, failure).toBe(expected);
        expect(await h.repository.getDelivery(key(failure))).toMatchObject({state: expected, attempts: 1});
        const before = calls.length;
        // Reconstructed service uses the same durable D1 journal.
        expect((await run(failure, h.makeService(client))).items[0]?.reason).toBe('delivery_blocked');
        expect(calls).toHaveLength(before);
      }
      mode = 'normal';
      const failingPersistence = createPublisherService({...h.repository, complete: async () => { throw new Error('SYNTHETIC D1 failure'); }},
        h.facts, {clock: h.clock, client});
      expect((await run('persist-failure', failingPersistence)).items[0]?.result).toBe('persistence_uncertain');
      expect(await h.repository.getDelivery(key('persist-failure'))).toMatchObject({state: 'claimed', attempts: 1});
      const before = calls.length;
      expect((await run('persist-failure')).items[0]?.reason).toBe('delivery_blocked');
      expect(calls).toHaveLength(before);
      expect(calls).toHaveLength(11);
      const receipts = await (await nativeFetch(receivedUrl)).json() as Array<{method: string; mode: string}>;
      expect(receipts.slice(initialReceipts.length)).toEqual(calls.map((requestMode) => ({method: 'POST', mode: requestMode})));
      expect(await h.db.prepare('SELECT COUNT(*) AS n FROM synthetic_deliveries').first('n')).toBe(0);
      expect((await h.facts.loadProvider('codex')).publishApprovedAt).toBeNull();
    } finally { await h.dispose(); }
  }, 30_000);
});
