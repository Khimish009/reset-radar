import { describe, expect, it, vi } from 'vitest';
import worker, { createWorker } from '../src/index';
import { createLogger } from '../src/utils/logging';

const scheduled = { scheduledTime: 1792584000000, cron: '*/5 * * * *', noRetry: vi.fn() };

function setupWorker() {
  const lines: string[] = [];
  const fetch = vi.fn<typeof globalThis.fetch>(() => {
    throw new Error('Unexpected external action');
  });
  const dependencies = {
    clock: { now: () => new Date('2026-10-21T12:00:00Z') },
    fetch,
    logger: createLogger((line) => lines.push(line)),
  };
  return { handler: createWorker(dependencies), fetch, lines };
}

describe('Worker foundation', () => {
  it('runs repeated scheduled no-ops without network, D1 or background work', async () => {
    const { handler, fetch, lines } = setupWorker();
    const env = new Proxy({ APP_ENV: 'staging', PUBLISH_MODE: 'dry_run', INGEST_MODE: 'off' }, {
      get(target, key) {
        if (key === 'APP_ENV' || key === 'PUBLISH_MODE' || key === 'INGEST_MODE') return target[key];
        throw new Error('Unexpected resource access');
      },
    });
    const context = { waitUntil: vi.fn(), passThroughOnException: vi.fn() };
    for (let i = 0; i < 3; i += 1) {
      await Reflect.apply(handler.scheduled, handler, [scheduled, env, context]);
    }
    expect(lines).toHaveLength(3);
    expect(lines[0]).toContain('scheduled_noop');
    expect(lines[0]).toContain('dry_run');
    expect(fetch).not.toHaveBeenCalled();
    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(context.waitUntil).not.toHaveBeenCalled();
  });

  it('fails closed for a publishing configuration and logs no configuration values', async () => {
    const { handler, fetch, lines } = setupWorker();
    await expect(handler.scheduled(scheduled, {
      APP_ENV: 'staging', PUBLISH_MODE: 'private-token',
    })).rejects.toThrowError(/^Unsupported runtime configuration$/);
    expect(lines).toEqual(['{"level":"error","event":"configuration_rejected"}']);
    expect(fetch).not.toHaveBeenCalled();
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('does not inspect bindings when production is opted in or an active local run lacks D1', async () => {
    const { handler, fetch, lines } = setupWorker();
    const env = new Proxy({ APP_ENV: 'production', PUBLISH_MODE: 'dry_run', INGEST_MODE: 'dry_run' }, {
      get(target, key) {
        if (key === 'APP_ENV' || key === 'PUBLISH_MODE' || key === 'INGEST_MODE') return target[key];
        throw new Error('Inactive production must not read a resource binding');
      },
    });
    await expect(handler.scheduled(scheduled, env)).rejects.toThrowError(/^Unsupported runtime configuration$/);
    await handler.scheduled(scheduled, {
      APP_ENV: 'local', PUBLISH_MODE: 'dry_run', INGEST_MODE: 'dry_run',
    });
    expect(lines).toEqual([
      '{"level":"error","event":"configuration_rejected"}',
      '{"level":"error","event":"scheduled_missing_database"}',
    ]);
    expect(fetch).not.toHaveBeenCalled();
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('exports both Cloudflare entry points and keeps the default scheduled handler inert', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    await worker.scheduled(scheduled, {});
    expect(worker.fetch(new Request('https://example.invalid/')).status).toBe(404);
    expect(log).toHaveBeenCalledWith(expect.stringContaining('scheduled_noop'));
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it.each(['/api/v1/events', '/api/v1/status', '/api/v1/stats'])(
    'reserves %s without claiming working data or touching resources', async (path) => {
      const { handler, fetch } = setupWorker();
      const env = new Proxy({}, { get() { throw new Error('HTTP must not read bindings'); } });
      const response = Reflect.apply(handler.fetch, handler, [
        new Request(`https://example.invalid${path}?token=private-token`, {
          headers: { Authorization: 'Bearer private-token', Origin: 'https://untrusted.invalid' },
        }), env,
      ]) as Response;
      expect(response.status).toBe(501);
      expect(await response.json()).toEqual({ error: {
        code: 'not_implemented', message: 'The public API is not implemented.',
      } });
      expect(response.headers.get('Cache-Control')).toBe('no-store');
      expect(response.headers.get('Access-Control-Allow-Origin')).toBeNull();
      expect(fetch).not.toHaveBeenCalled();
      expect(globalThis.fetch).not.toHaveBeenCalled();
    },
  );

  it.each(['POST', 'PUT', 'PATCH', 'DELETE', 'TRACE'])(
    'rejects %s on reserved, unknown and would-be privileged routes', async (method) => {
      const { handler, fetch } = setupWorker();
      for (const path of ['/api/v1/events', '/sync', '/publish', '/admin', '/unknown']) {
        // Node's Request constructor rejects TRACE before routing; use a minimal request there.
        const request = method === 'TRACE'
          ? { method, url: `https://example.invalid${path}` } as Request
          : new Request(`https://example.invalid${path}`, { method });
        const response = handler.fetch(request);
        expect(response.status).toBe(405);
        expect(response.headers.get('Allow')).toBe('GET, HEAD, OPTIONS');
        expect(await response.text()).not.toContain(path);
      }
      expect(fetch).not.toHaveBeenCalled();
      expect(globalThis.fetch).not.toHaveBeenCalled();
    },
  );

  it('keeps HEAD bodyless and OPTIONS inert, with no permissive CORS', async () => {
    const { handler } = setupWorker();
    for (const path of ['/api/v1/status', '/publish', '/unknown']) {
      const get = handler.fetch(new Request(`https://example.invalid${path}`));
      const head = handler.fetch(new Request(`https://example.invalid${path}`, { method: 'HEAD' }));
      expect(head.status).toBe(get.status);
      expect([...head.headers]).toEqual([...get.headers]);
      expect(await head.text()).toBe('');
      const options = handler.fetch(new Request(`https://example.invalid${path}`, { method: 'OPTIONS' }));
      expect(options.status).toBe(path === '/api/v1/status' ? 204 : 404);
      expect(options.headers.get('Access-Control-Allow-Origin')).toBeNull();
    }
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});
